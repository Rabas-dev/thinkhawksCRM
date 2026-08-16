import { NextRequest, NextResponse } from "next/server";
import { requireWebhookToken } from "@/lib/twilio";
import { createServiceClient } from "@/lib/supabase/server";

/** Configure this URL as the "A message comes in" webhook on your Twilio number(s). */
export async function POST(request: NextRequest) {
  if (!requireWebhookToken(request.nextUrl)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const form = await request.formData();
  const rawFrom = (form.get("From") as string | null) ?? "";
  const body = (form.get("Body") as string | null) ?? "";
  const sid = form.get("MessageSid") as string | null;

  const isWhatsapp = rawFrom.startsWith("whatsapp:");
  const from = rawFrom.replace(/^whatsapp:/, "");

  const supabase = createServiceClient();

  let { data: contact } = await supabase
    .from("contacts")
    .select("id")
    .eq("phone", from)
    .maybeSingle();

  if (!contact) {
    const { data: created } = await supabase
      .from("contacts")
      .insert({ full_name: from, phone: from, notes: "Auto-created from an inbound message." })
      .select("id")
      .single();
    contact = created;
  }

  if (contact) {
    await supabase.from("messages").insert({
      contact_id: contact.id,
      twilio_message_sid: sid,
      direction: "inbound",
      channel: isWhatsapp ? "whatsapp" : "sms",
      body,
      status: "received",
    });

    await supabase.from("activities").insert({
      contact_id: contact.id,
      type: "message",
      title: `${isWhatsapp ? "WhatsApp" : "SMS"} received`,
      body,
    });
  }

  return new NextResponse(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`, {
    headers: { "Content-Type": "text/xml" },
  });
}
