import { NextRequest, NextResponse } from "next/server";
import { requireWebhookToken, decodeClientState, startRecording, bridgeToSession } from "@/lib/telnyx";
import { createServiceClient } from "@/lib/supabase/server";
import type { CallStatus } from "@/lib/types";

function mapHangupStatus(cause: string | undefined): CallStatus {
  switch (cause) {
    case "no_answer":
    case "timeout":
      return "no-answer";
    case "call_rejected":
    case "user_busy":
      return "busy";
    case "originator_cancel":
      return "canceled";
    default:
      return "failed";
  }
}

const HANGUP_STATUS_LABEL: Record<CallStatus, string> = {
  completed: "Call completed",
  "no-answer": "Missed call",
  busy: "Call not connected (busy)",
  canceled: "Call canceled",
  failed: "Call failed",
  initiated: "Call",
  ringing: "Call",
  "in-progress": "Call",
};

/**
 * Single webhook URL for every Call Control event, configured once on the
 * Telnyx Credential Connection behind the browser softphone
 * (src/lib/dialer-context.tsx).
 *
 * Outbound: the browser first POSTs to /api/calls/start to pre-create a
 * `calls` row, then originates the Telnyx call itself with that row's id as
 * `clientState` — call.initiated below reads it back to attach Telnyx's ids
 * to the right row.
 *
 * Inbound: a webhook attached to a Credential Connection puts it in
 * Call-Control mode for that call — Telnyx does *not* auto-ring registered
 * WebRTC clients in that mode (only connections with no webhook get that
 * native behavior), so call.initiated below explicitly dials and bridges the
 * call to whichever browser dialer session connected most recently
 * (dialer_sessions, populated by /api/calls/token). If nobody's connected,
 * the call just rings out — there's no fallback destination configured.
 */
export async function POST(request: NextRequest) {
  if (!requireWebhookToken(request.nextUrl)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const receivedAt = Date.now();
  const body = await request.json().catch(() => null);
  const event = body?.data;
  const eventType: string | undefined = event?.event_type;
  const payload = event?.payload;
  const occurredAt: string | undefined = event?.occurred_at;
  if (!eventType || !payload) return NextResponse.json({ ok: true });

  const supabase = createServiceClient();

  switch (eventType) {
    case "call.initiated": {
      if (payload.direction === "incoming") {
        const from = payload.from as string;
        let { data: contact } = await supabase
          .from("contacts")
          .select("id")
          .eq("phone", from)
          .maybeSingle();

        if (!contact) {
          const { data: created } = await supabase
            .from("contacts")
            .insert({ full_name: from, phone: from, notes: "Auto-created from an inbound call." })
            .select("id")
            .single();
          contact = created;
        }

        const { data: insertedCall } = await supabase
          .from("calls")
          .insert({
            contact_id: contact?.id ?? null,
            telnyx_call_control_id: payload.call_control_id,
            telnyx_call_session_id: payload.call_session_id,
            direction: "inbound",
            status: "ringing",
            contact_phone: from,
          })
          .select("id")
          .single();

        const { data: session } = await supabase
          .from("dialer_sessions")
          .select("sip_username")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (session?.sip_username) {
          const deliveryLagMs = occurredAt ? receivedAt - new Date(occurredAt).getTime() : null;
          const beforeBridgeMs = Date.now() - receivedAt;
          let lastErr: unknown;
          let bridged = false;
          // One retry after a short delay — covers a transient failure on
          // our side (e.g. a cold-starting host, per DEPLOY-HOSTINGER.md's
          // idle-sleep caveat, being slow enough that the first dial/bridge
          // call itself times out). It can't help if the inbound leg has
          // already ended (caller hung up / Telnyx's own ring timeout) —
          // that fails identically on retry — but costs little to attempt.
          for (let attempt = 0; attempt < 2; attempt++) {
            if (attempt > 0) await new Promise((r) => setTimeout(r, 1200));
            try {
              await bridgeToSession(payload.call_control_id as string, session.sip_username);
              bridged = true;
              break;
            } catch (err) {
              lastErr = err;
            }
          }
          if (!bridged) {
            // Debugging aid — this route runs on a host we can't tail logs on,
            // so the failure reason and timing go straight on the call record
            // instead, to tell apart a cold-start delay from anything else.
            if (insertedCall) {
              const afterBridgeMs = Date.now() - receivedAt;
              await supabase
                .from("calls")
                .update({
                  notes: `bridge failed: ${lastErr instanceof Error ? lastErr.message : String(lastErr)} (delivery lag ${deliveryLagMs}ms, handler took ${beforeBridgeMs}ms before first bridge attempt / ${afterBridgeMs}ms total, 2 attempts)`,
                })
                .eq("id", insertedCall.id);
            }
          }
        } else if (insertedCall) {
          await supabase.from("calls").update({ notes: "bridge skipped: no dialer_sessions row" }).eq("id", insertedCall.id);
        }
        break;
      }

      const state = decodeClientState(payload.client_state);
      const callRowId = state?.callRowId as string | undefined;
      if (!callRowId) break;

      await supabase
        .from("calls")
        .update({
          telnyx_call_control_id: payload.call_control_id,
          telnyx_call_session_id: payload.call_session_id,
          status: "ringing",
        })
        .eq("id", callRowId);
      break;
    }

    case "call.answered": {
      const sessionId = payload.call_session_id as string;
      await supabase
        .from("calls")
        .update({ status: "in-progress", started_at: new Date().toISOString() })
        .eq("telnyx_call_session_id", sessionId);

      try {
        await startRecording(payload.call_control_id as string);
      } catch {
        // Recording is best-effort — a failure here shouldn't drop the call.
      }
      break;
    }

    case "call.hangup": {
      const sessionId = payload.call_session_id as string;
      const { data: call } = await supabase
        .from("calls")
        .select("id, contact_id, direction, contact_phone, status, started_at")
        .eq("telnyx_call_session_id", sessionId)
        .maybeSingle();
      if (!call || call.status === "completed") break;

      const wasConnected = call.status === "in-progress";
      const finalStatus: CallStatus = wasConnected
        ? "completed"
        : mapHangupStatus(payload.hangup_cause as string | undefined);
      const durationSeconds = call.started_at
        ? Math.max(0, Math.round((Date.now() - new Date(call.started_at).getTime()) / 1000))
        : null;

      await supabase
        .from("calls")
        .update({
          status: finalStatus,
          ...(durationSeconds !== null ? { duration_seconds: durationSeconds } : {}),
        })
        .eq("id", call.id);

      // Logged regardless of whether the call connected — a missed/unanswered
      // inbound call is exactly the kind of thing an agent needs to see in a
      // contact's timeline, not just completed ones.
      if (call.contact_id) {
        const label = HANGUP_STATUS_LABEL[finalStatus];
        await supabase.from("activities").insert({
          contact_id: call.contact_id,
          type: "call",
          title: wasConnected ? `${label} (${durationSeconds ?? 0}s)` : label,
          body: `${call.direction === "outbound" ? "Outbound" : "Inbound"} call ${call.direction === "outbound" ? "to" : "from"} ${call.contact_phone ?? ""}`,
          metadata: { call_id: call.id },
        });
      }
      break;
    }

    case "call.recording.saved": {
      const sessionId = payload.call_session_id as string;
      const recordingUrl =
        (payload.recording_urls as { mp3?: string } | undefined)?.mp3 ??
        (payload.public_recording_urls as { mp3?: string } | undefined)?.mp3;
      if (!recordingUrl) break;

      await supabase
        .from("calls")
        .update({ recording_url: recordingUrl, recording_id: payload.recording_id ?? null })
        .eq("telnyx_call_session_id", sessionId);
      break;
    }
  }

  return NextResponse.json({ ok: true });
}
