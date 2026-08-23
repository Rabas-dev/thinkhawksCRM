import { NextRequest, NextResponse } from "next/server";
import { requireWebhookToken } from "@/lib/telnyx";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * Single webhook URL for every Messaging event (configured once, on the
 * Telnyx Messaging Profile). Telnyx posts JSON with an `event_type`
 * discriminator — `message.received` for inbound SMS, `message.sent` /
 * `message.finalized` as an outbound message progresses to delivered/failed.
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

  if (eventType === "message.received") {
    const from = payload.from?.phone_number as string | undefined;
    const text = (payload.text as string | null) ?? "";
    const messageId = payload.id as string | undefined;
    if (!from) return NextResponse.json({ ok: true });

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
        telnyx_message_id: messageId,
        direction: "inbound",
        channel: "sms",
        body: text,
        status: "received",
      });

      await supabase.from("activities").insert({
        contact_id: contact.id,
        type: "message",
        title: "SMS received",
        body: text,
      });
    }
  } else if (eventType === "message.sent" || eventType === "message.finalized") {
    const messageId = payload.id as string | undefined;
    const status =
      (payload.to as { status?: string }[] | undefined)?.[0]?.status ??
      (eventType === "message.sent" ? "sent" : "failed");
    if (!messageId) return NextResponse.json({ ok: true });

    await supabase.from("messages").update({ status }).eq("telnyx_message_id", messageId);
  }

  return NextResponse.json({ ok: true });
}
