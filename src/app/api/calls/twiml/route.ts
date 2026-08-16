import { NextRequest, NextResponse } from "next/server";
import { requireWebhookToken, getBaseUrl, TWILIO_NUMBER } from "@/lib/twilio";
import { createServiceClient } from "@/lib/supabase/server";
import { toE164 } from "@/lib/utils";

/**
 * Voice Request URL for the TwiML App behind the browser dialer
 * (src/components/dialer.tsx). Twilio hits this the moment
 * `device.connect({ params: { Target, ContactId } })` runs in the browser —
 * CallSid here is the parent leg (browser <-> Twilio), which is what
 * recording and the call-status webhook stay keyed to for the whole call,
 * same as the previous phone-bridge flow.
 */
export async function POST(request: NextRequest) {
  const url = request.nextUrl;
  if (!requireWebhookToken(url)) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  const token = url.searchParams.get("token") ?? "";

  const form = await request.formData();
  const callSid = form.get("CallSid") as string | null;
  const target = form.get("Target") as string | null;
  const contactId = form.get("ContactId") as string | null;

  if (!target) {
    return new NextResponse(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Say>No number was dialed.</Say></Response>`,
      { headers: { "Content-Type": "text/xml" } },
    );
  }

  const targetE164 = toE164(target);

  if (callSid) {
    const supabase = createServiceClient();
    await supabase.from("calls").insert({
      twilio_call_sid: callSid,
      direction: "outbound",
      status: "initiated",
      contact_id: contactId || null,
      contact_phone: targetE164,
    });
  }

  const recordingCallback = new URL(`${getBaseUrl()}/api/webhooks/twilio/recording`);
  recordingCallback.searchParams.set("token", token);

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial callerId="${TWILIO_NUMBER}" record="record-from-answer-dual" recordingStatusCallback="${recordingCallback.toString()}" recordingStatusCallbackEvent="completed">
    <Number>${targetE164}</Number>
  </Dial>
</Response>`;

  return new NextResponse(twiml, { headers: { "Content-Type": "text/xml" } });
}
