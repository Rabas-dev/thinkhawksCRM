import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSendgrid, EMAIL_FROM, isSendgridConfigError, firstSendgridHeader } from "@/lib/sendgrid";
import { renderTemplate } from "@/lib/templates";

const CHUNK_SIZE = 100;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function toHtml(body: string) {
  return `<div style="font-family:sans-serif;font-size:15px;line-height:1.6;color:#222">${body
    .split("\n")
    .map((line) => `<p>${line}</p>`)
    .join("")}</div>`;
}

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: campaign } = await supabase.from("campaigns").select("*").eq("id", id).single();
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  if (campaign.status !== "draft") {
    return NextResponse.json({ error: "This campaign was already sent." }, { status: 400 });
  }

  let audienceQuery = supabase.from("contacts").select("id, full_name, email, company").not("email", "is", null);
  if (campaign.segment_tag) audienceQuery = audienceQuery.contains("tags", [campaign.segment_tag]);
  const { data: audience, error: audienceError } = await audienceQuery;

  if (audienceError) return NextResponse.json({ error: audienceError.message }, { status: 500 });
  if (!audience || audience.length === 0) {
    return NextResponse.json({ error: "No contacts with an email match this audience." }, { status: 400 });
  }

  // Claim the campaign so a second click can't double-send.
  const { data: claimed } = await supabase
    .from("campaigns")
    .update({ status: "sending" })
    .eq("id", id)
    .eq("status", "draft")
    .select()
    .maybeSingle();
  if (!claimed) {
    return NextResponse.json({ error: "This campaign was already sent." }, { status: 400 });
  }

  const { data: recipientRows, error: insertError } = await supabase
    .from("campaign_recipients")
    .insert(audience.map((c) => ({ campaign_id: id, contact_id: c.id, status: "queued" as const })))
    .select();

  if (insertError || !recipientRows) {
    await supabase.from("campaigns").update({ status: "failed" }).eq("id", id);
    return NextResponse.json({ error: insertError?.message ?? "Couldn't queue recipients" }, { status: 500 });
  }

  const recipientByContact = new Map(recipientRows.map((r) => [r.contact_id, r]));

  let sgMail;
  try {
    sgMail = getSendgrid();
  } catch (err) {
    await supabase.from("campaigns").update({ status: "failed" }).eq("id", id);
    if (isSendgridConfigError(err)) {
      return NextResponse.json(
        { error: "Email sending isn't configured yet (SENDGRID_API_KEY missing)." },
        { status: 503 },
      );
    }
    throw err;
  }

  let anySent = false;
  let anyFailed = false;

  for (const batch of chunk(audience, CHUNK_SIZE)) {
    // SendGrid's Mail Send API sends one message per call — fire the batch
    // as individual sends in parallel rather than Resend's single batch call.
    const results = await Promise.allSettled(
      batch.map((contact) =>
        sgMail.send({
          from: EMAIL_FROM,
          to: contact.email!,
          subject: renderTemplate(campaign.subject, contact),
          html: toHtml(renderTemplate(campaign.body, contact)),
          customArgs: { contact_id: contact.id, campaign_id: id },
        }),
      ),
    );

    for (let i = 0; i < batch.length; i++) {
      const contact = batch[i];
      const result = results[i];
      const recipient = recipientByContact.get(contact.id);
      if (!recipient) continue;

      if (result.status === "rejected") {
        anyFailed = true;
        await supabase.from("campaign_recipients").update({ status: "failed" }).eq("id", recipient.id);
        continue;
      }

      const [response] = result.value;
      const resendEmailId = firstSendgridHeader(response.headers, "x-message-id");

      await supabase
        .from("campaign_recipients")
        .update({ status: "sent", resend_email_id: resendEmailId })
        .eq("id", recipient.id);

      await supabase.from("email_events").insert({
        contact_id: contact.id,
        campaign_id: id,
        resend_email_id: resendEmailId,
        subject: renderTemplate(campaign.subject, contact),
        status: "sent",
      });

      await supabase.from("activities").insert({
        contact_id: contact.id,
        type: "email",
        title: `Campaign email sent: ${campaign.name}`,
        body: renderTemplate(campaign.subject, contact),
      });
      anySent = true;
    }
  }

  await supabase
    .from("campaigns")
    .update({ status: anySent ? "sent" : "failed", sent_at: new Date().toISOString() })
    .eq("id", id);

  if (!anySent) {
    return NextResponse.json({ error: "SendGrid rejected every message in this campaign." }, { status: 502 });
  }

  return NextResponse.json({ ok: true, sent: anySent, partialFailure: anyFailed });
}
