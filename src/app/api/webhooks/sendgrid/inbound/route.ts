import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireSendgridInboundToken } from "@/lib/sendgrid";

/**
 * SendGrid Inbound Parse webhook — configure this URL (with ?token=...) in
 * SendGrid's Inbound Parse settings once your receiving domain/subdomain's MX
 * record points at mx.sendgrid.net (see SETUP.md). Unlike the Event Webhook,
 * Inbound Parse doesn't sign requests, so this route is gated by a shared
 * secret in the URL instead (same pattern as the Telnyx webhooks).
 *
 * SendGrid posts multipart/form-data with `from`/`to`/`subject`/`text`/`html`
 * fields, plus a raw `headers` block (not structured) that we pull
 * Message-ID/In-Reply-To out of by hand.
 */
function extractEmail(value: string | null): string | null {
  if (!value) return null;
  const match = value.match(/<([^>]+)>/);
  return (match ? match[1] : value).trim() || null;
}

function extractRawHeader(rawHeaders: string | null, name: string): string | null {
  if (!rawHeaders) return null;
  const line = rawHeaders
    .split(/\r?\n/)
    .find((l) => l.toLowerCase().startsWith(`${name.toLowerCase()}:`));
  return line ? line.slice(line.indexOf(":") + 1).trim() : null;
}

export async function POST(request: NextRequest) {
  if (!requireSendgridInboundToken(request.nextUrl)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const form = await request.formData();
  const get = (key: string) => (form.get(key) as string | null) ?? null;

  const from = extractEmail(get("from"));
  const to = extractEmail(get("to"));
  const subject = get("subject");
  const textBody = get("text");
  const htmlBody = get("html");
  const rawHeaders = get("headers");
  const messageId = extractRawHeader(rawHeaders, "Message-ID");
  const inReplyTo = extractRawHeader(rawHeaders, "In-Reply-To");

  if (!from) return NextResponse.json({ ok: true, skipped: true });

  const supabase = createServiceClient();

  let { data: contact } = await supabase.from("contacts").select("id").eq("email", from).maybeSingle();

  if (!contact) {
    const { data: created } = await supabase
      .from("contacts")
      .insert({ full_name: from, email: from, notes: "Auto-created from an inbound email." })
      .select("id")
      .single();
    contact = created;
  }

  if (contact) {
    await supabase.from("emails").insert({
      contact_id: contact.id,
      direction: "inbound",
      message_id: messageId,
      in_reply_to: inReplyTo,
      from_address: from,
      to_address: to,
      subject,
      text_body: textBody,
      html_body: htmlBody,
      status: "received",
    });

    await supabase.from("activities").insert({
      contact_id: contact.id,
      type: "email",
      title: "Email received",
      body: subject,
    });
  }

  return NextResponse.json({ ok: true });
}
