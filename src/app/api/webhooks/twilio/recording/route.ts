import { NextRequest, NextResponse } from "next/server";
import { requireWebhookToken } from "@/lib/twilio";
import { createServiceClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  if (!requireWebhookToken(request.nextUrl)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const form = await request.formData();
  const callSid = form.get("CallSid") as string | null;
  const recordingSid = form.get("RecordingSid") as string | null;
  const recordingUrl = form.get("RecordingUrl") as string | null;
  const recordingDuration = form.get("RecordingDuration") as string | null;

  if (!callSid || !recordingUrl) return NextResponse.json({ ok: true });

  const supabase = createServiceClient();
  await supabase
    .from("calls")
    .update({
      recording_url: `${recordingUrl}.mp3`,
      recording_sid: recordingSid,
      ...(recordingDuration ? { duration_seconds: parseInt(recordingDuration, 10) } : {}),
    })
    .eq("twilio_call_sid", callSid);

  return NextResponse.json({ ok: true });
}
