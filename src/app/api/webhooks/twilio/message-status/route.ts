import { NextRequest, NextResponse } from "next/server";
import { requireWebhookToken } from "@/lib/twilio";
import { createServiceClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  if (!requireWebhookToken(request.nextUrl)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const form = await request.formData();
  const sid = form.get("MessageSid") as string | null;
  const status = form.get("MessageStatus") as string | null;
  if (!sid || !status) return NextResponse.json({ ok: true });

  const supabase = createServiceClient();
  await supabase.from("messages").update({ status }).eq("twilio_message_sid", sid);

  return NextResponse.json({ ok: true });
}
