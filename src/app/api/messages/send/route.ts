import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getTwilioClient, TWILIO_NUMBER, TWILIO_WHATSAPP_NUMBER, getBaseUrl } from "@/lib/twilio";
import { toE164 } from "@/lib/utils";

const schema = z.object({
  contact_id: z.string().uuid(),
  body: z.string().min(1),
  channel: z.enum(["sms", "whatsapp"]).default("sms"),
});

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { contact_id, body, channel } = parsed.data;

  const { data: contact } = await supabase
    .from("contacts")
    .select("id, phone")
    .eq("id", contact_id)
    .single();

  if (!contact?.phone) {
    return NextResponse.json({ error: "This contact has no phone on file" }, { status: 400 });
  }

  const fromNumber = channel === "whatsapp" ? TWILIO_WHATSAPP_NUMBER : TWILIO_NUMBER;
  if (!fromNumber) {
    return NextResponse.json(
      { error: `${channel === "whatsapp" ? "WhatsApp" : "SMS"} isn't configured yet — see SETUP.md.` },
      { status: 503 },
    );
  }

  const toNumber = toE164(contact.phone);
  const prefix = (n: string) => (channel === "whatsapp" ? `whatsapp:${n}` : n);

  const token = process.env.TWILIO_WEBHOOK_TOKEN;
  let statusCallback: string | undefined;
  try {
    const url = new URL(`${getBaseUrl()}/api/webhooks/twilio/message-status`);
    if (token) url.searchParams.set("token", token);
    statusCallback = url.toString();
  } catch {
    statusCallback = undefined;
  }

  try {
    const client = getTwilioClient();
    const message = await client.messages.create({
      to: prefix(toNumber),
      from: prefix(fromNumber),
      body,
      ...(statusCallback ? { statusCallback } : {}),
    });

    await supabase.from("messages").insert({
      contact_id,
      twilio_message_sid: message.sid,
      direction: "outbound",
      channel,
      body,
      status: message.status,
    });

    await supabase.from("activities").insert({
      contact_id,
      type: "message",
      title: `${channel === "whatsapp" ? "WhatsApp" : "SMS"} sent`,
      body,
    });

    return NextResponse.json({ ok: true, sid: message.sid });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Couldn't send that message" },
      { status: 502 },
    );
  }
}
