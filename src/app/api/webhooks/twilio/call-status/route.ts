import { NextRequest, NextResponse } from "next/server";
import { requireWebhookToken } from "@/lib/twilio";
import { createServiceClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  if (!requireWebhookToken(request.nextUrl)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const form = await request.formData();
  const callSid = form.get("CallSid") as string | null;
  const status = (form.get("CallStatus") as string | null) ?? "in-progress";
  const duration = form.get("CallDuration") as string | null;

  if (!callSid) return NextResponse.json({ ok: true });

  const supabase = createServiceClient();

  const { data: call } = await supabase
    .from("calls")
    .update({
      status,
      ...(duration ? { duration_seconds: parseInt(duration, 10) } : {}),
    })
    .eq("twilio_call_sid", callSid)
    .select()
    .maybeSingle();

  if (call?.contact_id && status === "completed") {
    await supabase.from("activities").insert({
      contact_id: call.contact_id,
      type: "call",
      title: `Call completed (${call.duration_seconds ?? 0}s)`,
      body: `${call.direction === "outbound" ? "Outbound" : "Inbound"} call to ${call.contact_phone ?? ""}`,
      metadata: { call_id: call.id },
    });
  } else if (
    call?.contact_id &&
    call.direction === "inbound" &&
    ["no-answer", "busy", "failed", "canceled"].includes(status)
  ) {
    await supabase.from("activities").insert({
      contact_id: call.contact_id,
      type: "call",
      title: "Missed call",
      body: `Inbound call from ${call.contact_phone ?? "unknown number"} wasn't answered`,
      metadata: { call_id: call.id },
    });
  }

  return NextResponse.json({ ok: true });
}
