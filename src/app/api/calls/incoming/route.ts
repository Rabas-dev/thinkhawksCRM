import { NextRequest, NextResponse } from "next/server";
import { formatDistanceToNowStrict } from "date-fns";
import { requireWebhookToken, getBaseUrl, TWILIO_NUMBER, TEAM_CLIENT_IDENTITY } from "@/lib/twilio";
import { createServiceClient } from "@/lib/supabase/server";
import { formatDuration } from "@/lib/utils";

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Voice Request URL for the Twilio phone number itself ("A call comes in").
 * Rings every signed-in agent's open browser dialer at once (they all
 * register under TEAM_CLIENT_IDENTITY) and screen-pops the caller's contact
 * record via TwiML <Parameter> values the Voice SDK exposes as
 * call.customParameters. The call's own status updates (ringing/completed/
 * no-answer) come through separately via the number's "Call status changes"
 * webhook, since Twilio assigns this leg's CallSid before we can attach one
 * ourselves — see SETUP.md.
 */
export async function POST(request: NextRequest) {
  const url = request.nextUrl;
  if (!requireWebhookToken(url)) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  const token = url.searchParams.get("token") ?? "";

  const form = await request.formData();
  const callSid = form.get("CallSid") as string | null;
  const from = (form.get("From") as string | null) ?? "";
  const to = (form.get("To") as string | null) ?? "";

  const supabase = createServiceClient();

  let contact: { id: string; full_name: string } | null = null;
  if (from) {
    const { data } = await supabase
      .from("contacts")
      .select("id, full_name")
      .eq("phone", from)
      .maybeSingle();
    contact = data;

    if (!contact) {
      const { data: created } = await supabase
        .from("contacts")
        .insert({ full_name: from, phone: from, notes: "Auto-created from an inbound call." })
        .select("id, full_name")
        .single();
      contact = created;
    }
  }

  let previousInteraction = "";
  if (contact) {
    const { data: lastCall } = await supabase
      .from("calls")
      .select("created_at, duration_seconds")
      .eq("contact_id", contact.id)
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastCall) {
      previousInteraction = `Called ${formatDistanceToNowStrict(new Date(lastCall.created_at), { addSuffix: true })} · ${formatDuration(lastCall.duration_seconds)}`;
    }
  }

  let callRowId = "";
  if (callSid) {
    const { data: callRow } = await supabase
      .from("calls")
      .insert({
        twilio_call_sid: callSid,
        direction: "inbound",
        status: "ringing",
        contact_id: contact?.id ?? null,
        contact_phone: from,
        agent_phone: to,
      })
      .select("id")
      .single();
    callRowId = callRow?.id ?? "";
  }

  const recordingCallback = new URL(`${getBaseUrl()}/api/webhooks/twilio/recording`);
  recordingCallback.searchParams.set("token", token);

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial timeout="20" record="record-from-answer-dual" recordingStatusCallback="${recordingCallback.toString()}" recordingStatusCallbackEvent="completed" callerId="${TWILIO_NUMBER}">
    <Client>
      ${TEAM_CLIENT_IDENTITY}
      <Parameter name="ContactId" value="${escapeXml(contact?.id ?? "")}" />
      <Parameter name="ContactName" value="${escapeXml(contact?.full_name ?? "")}" />
      <Parameter name="CallerNumber" value="${escapeXml(from)}" />
      <Parameter name="PreviousInteraction" value="${escapeXml(previousInteraction)}" />
      <Parameter name="CallRowId" value="${escapeXml(callRowId)}" />
    </Client>
  </Dial>
  <Say>Sorry, no one is available to take your call right now.</Say>
</Response>`;

  return new NextResponse(twiml, { headers: { "Content-Type": "text/xml" } });
}
