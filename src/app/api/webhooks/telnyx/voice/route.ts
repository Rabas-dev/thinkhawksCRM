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

// Most of call.initiated's and call.answered's Supabase/Telnyx round trips
// run in parallel (Promise.all/allSettled) rather than one after another —
// see the comments at each — to keep the caller's ring-to-browser delay and
// the agent's answer-to-audio delay as short as the underlying APIs allow.
// A few calls are inherently sequential (Telnyx requires answering a leg
// before it can be bridged) and comfortably fit under Vercel's default
// limit in practice, but this headroom absorbs a Telnyx latency spike
// without the function getting killed mid-call.
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
 * native behavior), so call.initiated below dials a bridge leg to one or
 * more currently-live browser dialer sessions (dialer_sessions, populated by
 * /api/calls/token, filtered to ones with a recent heartbeat). Which and how
 * many depends on app_settings.inbound_ring_strategy:
 *  - "ring-all": every live session at once — first to answer wins.
 *  - "round-robin": just the next session after whoever was rung last
 *    (app_settings.round_robin_last_credential_id).
 * Bridging a leg to the inbound call can't happen until it's answered —
 * bridge only works on an already-answered leg — so the dialed legs'
 * call_control_ids are stashed on the calls row (bridge_leg_call_control_ids)
 * and call.answered below watches for the *first* of them to answer,
 * bridging at exactly that moment and hanging up whichever others were also
 * ringing. If nobody's connected, the call just rings out — there's no
 * fallback destination configured.
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
        // Contact lookup/insert and the duplicate-leg check below are
        // independent of each other — running them together instead of one
        // after the other is half of what was adding to the caller's wait
        // before their phone even starts hearing ringback.
        const contactPromise = (async () => {
          const { data: existing } = await supabase.from("contacts").select("id").eq("phone", from).maybeSingle();
          if (existing) return existing;
          const { data: created } = await supabase
            .from("contacts")
            .insert({ full_name: from, phone: from, notes: "Auto-created from an inbound call." })
            .select("id")
            .single();
          return created;
        })();

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
        const dedupPromise = supabase
          .from("calls")
          .select("id")
          .eq("contact_phone", from)
          .eq("direction", "inbound")
          .in("status", ["ringing", "in-progress"])
          .gte("created_at", recentWindow)
          .limit(1)
          .maybeSingle();

        const [contact, { data: recentDuplicate }] = await Promise.all([contactPromise, dedupPromise]);

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

        // Ringback, the live-session lookup and the ring-strategy setting
        // don't depend on each other either — this used to be 3 sequential
        // round trips (~ring-back start, then session query, then settings
        // query) before a single dial attempt could even begin. Running
        // them together is the other half of shrinking the ring-to-browser
        // delay; the caller hearing ringback slightly before we know who to
        // dial is no worse than before, since dialing itself always came
        // after all three anyway.
        const liveSince = new Date(Date.now() - 60_000).toISOString();
        const [, { data: liveSessions }, { data: appSettings }] = await Promise.all([
          startRingback(payload.call_control_id as string).catch(() => {
            // Best-effort — the call proceeds silently for the caller if this fails.
          }),
          // Picking the most *recently created* row isn't enough — a tab
          // that closed without firing the pagehide DELETE (crash,
          // force-quit, sleep, network drop) leaves a row that looks
          // exactly as valid as a live one until the 30min GC catches it,
          // and dialing that dead SIP endpoint is exactly what produced the
          // sip_code=487 timeouts this was built to fix. Heartbeat pings
          // (dialer-context.tsx, every 20s while connected) keep
          // updated_at fresh on a genuinely live session, so requiring a
          // recent one here filters stale rows out — 60s tolerates one
          // missed heartbeat beat without false-negatives.
          supabase
            .from("dialer_sessions")
            .select("credential_id, sip_username")
            .gte("updated_at", liveSince)
            // Stable order so round-robin's "next after last" pointer means
            // the same thing across calls, regardless of heartbeat timing.
            .order("credential_id", { ascending: true }),
          supabase
            .from("app_settings")
            .select("inbound_ring_strategy, round_robin_last_credential_id")
            .eq("id", true)
            .maybeSingle(),
        ]);
        const strategy = appSettings?.inbound_ring_strategy ?? "ring-all";

        let targets: { credential_id: string; sip_username: string }[] = [];
        if (liveSessions && liveSessions.length > 0) {
          if (strategy === "round-robin") {
            const lastIdx = appSettings?.round_robin_last_credential_id
              ? liveSessions.findIndex((s) => s.credential_id === appSettings.round_robin_last_credential_id)
              : -1;
            targets = [liveSessions[(lastIdx + 1) % liveSessions.length]];
          } else {
            targets = liveSessions;
          }
        }

        if (targets.length > 0 && insertedCall) {
          // Dial every target at once instead of one at a time — with
          // ring-all this used to mean N sequential Telnyx REST round trips
          // (one per agent) before the last agent's phone even started
          // ringing; now every agent's leg goes out together.
          const dialResults = await Promise.allSettled(targets.map((t) => dialSipLeg(t.sip_username, from)));
          const dialed = dialResults
            .filter((r): r is PromiseFulfilledResult<string> => r.status === "fulfilled")
            .map((r) => r.value);
          const lastDialError = dialResults.find((r): r is PromiseRejectedResult => r.status === "rejected")?.reason;

          if (dialed.length > 0) {
            await supabase.from("calls").update({ bridge_leg_call_control_ids: dialed }).eq("id", insertedCall.id);
            if (strategy === "round-robin") {
              await supabase
                .from("app_settings")
                .update({ round_robin_last_credential_id: targets[0].credential_id, updated_at: new Date().toISOString() })
                .eq("id", true);
            }
          } else {
            // Debugging aid — this route runs on a host we can't tail logs on,
            // so the failure reason goes straight on the call record instead.
            const deliveryLagMs = occurredAt ? receivedAt - new Date(occurredAt).getTime() : null;
            await supabase
              .from("calls")
              .update({
                notes: `dial (bridge leg) failed for all ${targets.length} target(s): ${lastDialError instanceof Error ? lastDialError.message : String(lastDialError)} (delivery lag ${deliveryLagMs}ms, handler took ${Date.now() - receivedAt}ms)`,
              })
              .eq("id", insertedCall.id);
          }
        } else if (insertedCall) {
          await supabase
            .from("calls")
            .update({ notes: "bridge skipped: no live dialer session (none connected, or all stale)" })
            .eq("id", insertedCall.id);
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

      // Is this one of the bridge legs (dialed to one or more browser
      // sessions for an inbound call) answering, rather than a call's own
      // primary leg? Bridge only works on an already-answered leg, so this
      // is the earliest point it can happen — see dialSipLeg's comment.
      const { data: pendingBridge } = await supabase
        .from("calls")
        .select("id, telnyx_call_control_id, bridge_leg_call_control_ids")
        .contains("bridge_leg_call_control_ids", [answeredCallControlId])
        .maybeSingle();

      if (pendingBridge?.telnyx_call_control_id) {
        // First to answer wins — stop ringing every other agent this call
        // was also offered to (ring-all dials several at once).
        const losers = (pendingBridge.bridge_leg_call_control_ids ?? []).filter((id: string) => id !== answeredCallControlId);
        // None of this needs to finish before we answer and bridge the
        // winning leg below — it used to (a DB write, then every loser
        // hung up one at a time), and that was exactly the "click answer,
        // wait a beat before audio connects" delay: real work the agent
        // felt but that had nothing to do with their own call actually
        // connecting. Fired here, awaited once things that matter are done.
        const cleanupPromise = Promise.allSettled([
          supabase.from("calls").update({ bridge_leg_call_control_ids: [] }).eq("id", pendingBridge.id),
          ...losers.map((loserId: string) => hangup(loserId)),
        ]);

        try {
          // The inbound leg has only ever had ringback_start called on it —
          // still "ringing" as far as Call Control is concerned. bridge
          // requires both legs already answered; without this the bridge
          // call below fails every time with "This call can't receive
          // bridge command because it has not been answered yet." These two
          // calls are the actual critical path to the agent hearing audio —
          // both required, both sequential, nothing else should block them.
          await answerCall(pendingBridge.telnyx_call_control_id);
          await bridgeCalls(pendingBridge.telnyx_call_control_id, answeredCallControlId);
          // Audio is bridged as of the line above — everything below is
          // bookkeeping that doesn't need to delay the call any further.
          await Promise.allSettled([
            cleanupPromise,
            stopRingback(pendingBridge.telnyx_call_control_id),
            supabase
              .from("calls")
              .update({ status: "in-progress", started_at: new Date().toISOString() })
              .eq("id", pendingBridge.id),
            startRecording(pendingBridge.telnyx_call_control_id),
          ]);
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

      // Is this one bridge leg hanging up on its own (e.g. that agent's
      // browser declined, or Telnyx couldn't even ring it) while the call
      // may still be ringing other agents? That leg has its own session_id
      // distinct from the inbound call's, so it won't match the lookup
      // below — catch it here and just drop it from the pending list, since
      // ring-all means the others can still answer.
      const { data: pendingBridgeHangup } = await supabase
        .from("calls")
        .select("id, bridge_leg_call_control_ids")
        .contains("bridge_leg_call_control_ids", [hungupCallControlId])
        .maybeSingle();
      if (pendingBridgeHangup) {
        const remaining = (pendingBridgeHangup.bridge_leg_call_control_ids ?? []).filter((id: string) => id !== hungupCallControlId);
        await supabase
          .from("calls")
          .update({
            bridge_leg_call_control_ids: remaining,
            notes: `bridge leg hung up before answering: cause=${payload.hangup_cause ?? "unknown"} sip_code=${payload.sip_hangup_cause ?? "?"}`,
          })
          .eq("id", pendingBridgeHangup.id);
      }

      const { data: call } = await supabase
        .from("calls")
        .select("id, contact_id, direction, contact_phone, status, started_at, bridge_leg_call_control_ids")
        .eq("telnyx_call_session_id", sessionId)
        .maybeSingle();
      if (!call || call.status === "completed") break;

      // The caller hung up (or Telnyx's own ring timeout fired) before any
      // bridge leg was answered — stop ringing every agent still being
      // offered a call nobody's on anymore.
      if (call.bridge_leg_call_control_ids?.length) {
        for (const legId of call.bridge_leg_call_control_ids) {
          try {
            await hangup(legId);
          } catch {
            // Best-effort — it may have already ended on its own.
          }
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
