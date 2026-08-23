import { NextRequest, NextResponse } from "next/server";
import { requireWebhookToken, decodeClientState, startRecording } from "@/lib/telnyx";
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

/**
 * Single webhook URL for every Call Control event, configured once on the
 * Telnyx Credential Connection behind the browser softphone
 * (src/lib/dialer-context.tsx). Since the WebRTC leg *is* the agent's side of
 * the call, there's only ever one Call Control leg per call here — no manual
 * dial()/bridge() the way a ring-your-phone-first flow needs.
 *
 * Outbound: the browser first POSTs to /api/calls/start to pre-create a
 * `calls` row, then originates the Telnyx call itself with that row's id as
 * `clientState` — call.initiated below reads it back to attach Telnyx's ids
 * to the right row. Inbound: someone calls the Telnyx number, which the
 * portal routes straight to the Credential Connection, ringing whichever
 * browser softphones are currently connected — call.initiated logs it fresh.
 */
export async function POST(request: NextRequest) {
  if (!requireWebhookToken(request.nextUrl)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const event = body?.data;
  const eventType: string | undefined = event?.event_type;
  const payload = event?.payload;
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

        await supabase.from("calls").insert({
          contact_id: contact?.id ?? null,
          telnyx_call_control_id: payload.call_control_id,
          telnyx_call_session_id: payload.call_session_id,
          direction: "inbound",
          status: "ringing",
          contact_phone: from,
        });
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

      if (call.contact_id && wasConnected) {
        await supabase.from("activities").insert({
          contact_id: call.contact_id,
          type: "call",
          title: `Call completed (${durationSeconds ?? 0}s)`,
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
