import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { isValidSendgridEventSignature } from "@/lib/sendgrid";

const TYPE_TO_STATUS: Record<string, string> = {
  processed: "sent",
  delivered: "delivered",
  open: "opened",
  click: "clicked",
  bounce: "bounced",
  dropped: "failed",
  spamreport: "complained",
};

type SendgridEvent = {
  event: string;
  sg_message_id?: string;
  subject?: string;
  contact_id?: string;
  campaign_id?: string;
};

export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  if (!isValidSendgridEventSignature(rawBody, request.headers)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const events: SendgridEvent[] = JSON.parse(rawBody);
  const supabase = createServiceClient();

  for (const event of events) {
    const status = TYPE_TO_STATUS[event.event];
    if (!status) continue;

    // sg_message_id carries a per-attempt suffix after the first dot; the
    // prefix is what SendGrid's send API returned as X-Message-Id, which is
    // what we stored as resend_email_id at send time.
    const messageId = event.sg_message_id ?? null;
    const messageIdPrefix = messageId?.split(".")[0] ?? null;

    let contactId = event.contact_id ?? null;
    let campaignId = event.campaign_id ?? null;

    if ((!contactId || !campaignId) && messageIdPrefix) {
      const { data: existing } = await supabase
        .from("email_events")
        .select("contact_id, campaign_id")
        .eq("resend_email_id", messageIdPrefix)
        .limit(1)
        .maybeSingle();
      contactId = contactId ?? existing?.contact_id ?? null;
      campaignId = campaignId ?? existing?.campaign_id ?? null;
    }

    await supabase.from("email_events").insert({
      contact_id: contactId,
      campaign_id: campaignId,
      resend_email_id: messageIdPrefix,
      subject: event.subject ?? null,
      status,
    });

    if (contactId && status === "opened") {
      await supabase.from("activities").insert({
        contact_id: contactId,
        type: "email",
        title: "Email opened",
        body: event.subject ?? null,
      });
    }

    if (campaignId && messageIdPrefix) {
      const now = new Date().toISOString();
      await supabase
        .from("campaign_recipients")
        .update({
          status,
          ...(status === "opened" ? { opened_at: now } : {}),
          ...(status === "clicked" ? { clicked_at: now } : {}),
        })
        .eq("campaign_id", campaignId)
        .eq("resend_email_id", messageIdPrefix);
    }

    if (messageIdPrefix) {
      await supabase.from("emails").update({ status }).eq("resend_email_id", messageIdPrefix);
    }
  }

  return NextResponse.json({ ok: true });
}
