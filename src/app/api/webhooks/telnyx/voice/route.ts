import { NextRequest, NextResponse } from "next/server";
import {
  requireWebhookToken,
  decodeClientState,
  startRecording,
  dialSipLeg,
  bridgeCalls,
  hangup,
  startRingback,
  stopRingback,
  answerCall,
  TELNYX_NUMBER,
} from "@/lib/telnyx";
import { createServiceClient } from "@/lib/supabase/server";
import { claimWebhookEvent } from "@/lib/webhook-idempotency";
import type { CallStatus } from "@/lib/types";

// call.initiated chains up to ~9 sequential network calls (Supabase reads/
// writes plus 2 Telnyx REST calls) — comfortably under Vercel's default
// limit in practice, but this headroom absorbs a Telnyx latency spike
// without the function getting killed mid-dial.
export const maxDuration = 30;

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
 * native behavior), so call.initiated below dials a second leg to whichever
 * browser dialer session connected most recently (dialer_sessions,
 * populated by /api/calls/token). Bridging that leg to the inbound call
 * can't happen yet — bridge only works on an already-answered leg — so the
 * dialed leg's call_control_id is stashed on the calls row
 * (bridge_leg_call_control_id) and call.answered below watches for *that*
 * leg specifically answering, bridging at exactly that moment. If nobody's
 * connected, the call just rings out — there's no fallback destination
 * configured.
 */
export async function POST(request: NextRequest) {
  if (!requireWebhookToken(request.nextUrl)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const receivedAt = Date.now();
  const body = await request.json().catch(() => null);
  const event = body?.data;
  const eventType: string | undefined = event?.event_type;
  const eventId: string | undefined = event?.id;
  const payload = event?.payload;
  const occurredAt: string | undefined = event?.occurred_at;
  if (!eventType || !payload) return NextResponse.json({ ok: true });

  const supabase = createServiceClient();

  // A retried delivery of an event we've already processed (Telnyx retries
  // on a slow/non-2xx response) must not re-run side effects like dialing a
  // second bridge leg or inserting a second `calls` row.
  if (!(await claimWebhookEvent(supabase, eventId, "telnyx_voice"))) {
    return NextResponse.json({ ok: true, deduped: true });
  }

  switch (eventType) {
    case "call.initiated": {
      // The bridge leg dialed by dialSipLeg (sip:{username}@sip.telnyx.com)
      // fires its own call.initiated webhook from the credential
      // connection's side, also with direction "incoming" — without this
      // guard it gets mistaken for a brand-new real inbound call and
      // re-dials a bridge leg for itself, recursing until Telnyx's
      // concurrent-call limit is hit. `payload.to` isn't reliable here (it
      // comes back blank on that echo), but no real caller can ever have
      // *our own* Telnyx number as their caller ID — only our own bridge
      // dial sets `from` to that, so gate on that instead.
      const from = payload.from as string;
      if (payload.direction === "incoming" && from !== TELNYX_NUMBER) {
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

        // Some carriers/handsets fire several near-simultaneous INVITEs for
        // what's really one call attempt (seen in practice: 20-30 separate
        // call.initiated events from the same number within a few seconds).
        // Each used to get its own dial-to-browser bridge leg, which is what
        // actually exhausted Telnyx's concurrent-call limit and cascaded
        // into busy/487 failures for the rest — not the caller redialing.
        // If a call from this number already started dialing a bridge leg
        // in the last 10s, skip dialing another one; the duplicate leg just
        // rings out on its own without costing us an outbound channel.
        const recentWindow = new Date(Date.now() - 10_000).toISOString();
        const { data: recentDuplicate } = await supabase
          .from("calls")
          .select("id")
          .eq("contact_phone", from)
          .eq("direction", "inbound")
          .in("status", ["ringing", "in-progress"])
          .gte("created_at", recentWindow)
          .limit(1)
          .maybeSingle();

        const { data: insertedCall } = await supabase
          .from("calls")
          .insert({
            contact_id: contact?.id ?? null,
            telnyx_call_control_id: payload.call_control_id,
            telnyx_call_session_id: payload.call_session_id,
            direction: "inbound",
            status: "ringing",
            contact_phone: from,
            ...(recentDuplicate ? { notes: "skipped bridge dial: duplicate of a call from this number already ringing" } : {}),
          })
          .select("id")
          .single();

        if (recentDuplicate) break;

        try {
          await startRingback(payload.call_control_id as string);
        } catch {
          // Best-effort — the call proceeds silently for the caller if this fails.
        }

        const { data: session } = await supabase
          .from("dialer_sessions")
          .select("sip_username")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (session?.sip_username && insertedCall) {
          try {
            const bridgeLegId = await dialSipLeg(session.sip_username, from);
            await supabase.from("calls").update({ bridge_leg_call_control_id: bridgeLegId }).eq("id", insertedCall.id);
          } catch (err) {
            // Debugging aid — this route runs on a host we can't tail logs on,
            // so the failure reason goes straight on the call record instead.
            const deliveryLagMs = occurredAt ? receivedAt - new Date(occurredAt).getTime() : null;
            await supabase
              .from("calls")
              .update({
                notes: `dial (bridge leg) failed: ${err instanceof Error ? err.message : String(err)} (delivery lag ${deliveryLagMs}ms, handler took ${Date.now() - receivedAt}ms)`,
              })
              .eq("id", insertedCall.id);
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
      const answeredCallControlId = payload.call_control_id as string;

      // Is this the bridge leg (dialed to the browser session for an
      // inbound call) answering, rather than a call's own primary leg?
      // Bridge only works on an already-answered leg, so this is the
      // earliest point it can happen — see dialSipLeg's comment.
      const { data: pendingBridge } = await supabase
        .from("calls")
        .select("id, telnyx_call_control_id")
        .eq("bridge_leg_call_control_id", answeredCallControlId)
        .maybeSingle();

      if (pendingBridge?.telnyx_call_control_id) {
        await supabase.from("calls").update({ bridge_leg_call_control_id: null }).eq("id", pendingBridge.id);
        try {
          // The inbound leg has only ever had ringback_start called on it —
          // still "ringing" as far as Call Control is concerned. bridge
          // requires both legs already answered; without this the bridge
          // call below fails every time with "This call can't receive
          // bridge command because it has not been answered yet."
          await answerCall(pendingBridge.telnyx_call_control_id);
          await bridgeCalls(pendingBridge.telnyx_call_control_id, answeredCallControlId);
          try {
            await stopRingback(pendingBridge.telnyx_call_control_id);
          } catch {
            // Best-effort — Telnyx normally stops it automatically once bridged anyway.
          }
          await supabase
            .from("calls")
            .update({ status: "in-progress", started_at: new Date().toISOString() })
            .eq("id", pendingBridge.id);
          try {
            await startRecording(pendingBridge.telnyx_call_control_id);
          } catch {
            // Recording is best-effort — a failure here shouldn't drop the call.
          }
        } catch (err) {
          await supabase
            .from("calls")
            .update({ notes: `bridge failed: ${err instanceof Error ? err.message : String(err)}` })
            .eq("id", pendingBridge.id);
        }
        break;
      }

      // Telnyx can deliver more than one call.answered for the same call
      // (e.g. a second one for the inbound leg itself once it's bridged, in
      // addition to the bridge leg's own) — without this idempotency check
      // each redundant delivery re-issued a record_start to Telnyx for a
      // call that's already recording, wasting an API call for no effect.
      const sessionId = payload.call_session_id as string;
      const { data: existing } = await supabase
        .from("calls")
        .select("id, status")
        .eq("telnyx_call_session_id", sessionId)
        .maybeSingle();
      if (existing && existing.status !== "in-progress") {
        await supabase
          .from("calls")
          .update({ status: "in-progress", started_at: new Date().toISOString() })
          .eq("id", existing.id);

        try {
          await startRecording(answeredCallControlId);
        } catch {
          // Recording is best-effort — a failure here shouldn't drop the call.
        }
      }
      break;
    }

    case "call.hangup": {
      const sessionId = payload.call_session_id as string;
      const hungupCallControlId = payload.call_control_id as string;

      // Is this the bridge leg itself hanging up (e.g. the browser never
      // answered, or Telnyx couldn't even ring it)? That leg has its own
      // session_id distinct from the inbound call's, so it won't match the
      // lookup below — catch it here and record why, since we can't tail
      // logs on this host otherwise.
      const { data: pendingBridgeHangup } = await supabase
        .from("calls")
        .select("id")
        .eq("bridge_leg_call_control_id", hungupCallControlId)
        .maybeSingle();
      if (pendingBridgeHangup) {
        await supabase
          .from("calls")
          .update({
            bridge_leg_call_control_id: null,
            notes: `bridge leg hung up before answering: cause=${payload.hangup_cause ?? "unknown"} sip_code=${payload.sip_hangup_cause ?? "?"}`,
          })
          .eq("id", pendingBridgeHangup.id);
      }

      const { data: call } = await supabase
        .from("calls")
        .select("id, contact_id, direction, contact_phone, status, started_at, bridge_leg_call_control_id")
        .eq("telnyx_call_session_id", sessionId)
        .maybeSingle();
      if (!call || call.status === "completed") break;

      // The caller hung up (or Telnyx's own ring timeout fired) before the
      // bridge leg was answered — stop it from continuing to ring the
      // browser for a call nobody's on anymore.
      if (call.bridge_leg_call_control_id) {
        try {
          await hangup(call.bridge_leg_call_control_id);
        } catch {
          // Best-effort — it may have already ended on its own.
        }
      }

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
