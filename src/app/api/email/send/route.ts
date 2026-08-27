import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  getSendgrid,
  EMAIL_FROM,
  wrapEmailHtml,
  isSendgridConfigError,
  sendgridErrorMessage,
  firstSendgridHeader,
  DELIVERABILITY_TRACKING_SETTINGS,
} from "@/lib/sendgrid";

const attachmentSchema = z.object({
  filename: z.string().min(1).max(255),
  type: z.string().max(255),
  // base64 — SendGrid caps total message size (incl. this ~37% overhead) at
  // 30MB; capping each attachment's encoded length here is defense in
  // depth alongside the client-side total-size check in AttachmentField.
  content: z.string().max(21 * 1024 * 1024),
});

// The visible "From" name in the recipient's mailbox — the underlying
// address always stays EMAIL_FROM (the domain-authenticated sender SPF/DKIM
// pass for), this just changes what's displayed alongside it. No CR/LF, so
// it can't be used to inject extra headers into the outgoing message.
// Allowed empty (no min length) — every compose form always sends this key,
// blank when the agent has no Settings display name and hasn't typed one;
// the route falls back to a default rather than rejecting the whole send.
const fromNameSchema = z.string().trim().max(100).regex(/^[^\r\n]*$/);

const attachmentsField = z.array(attachmentSchema).max(10).optional();

const schema = z.union([
  z.object({
    contact_id: z.string().uuid(),
    subject: z.string().min(1),
    body: z.string().min(1),
    from_name: fromNameSchema.optional(),
    attachments: attachmentsField,
  }),
  // A quick send to someone who isn't (and won't become) a saved contact —
  // the Compose modal offers this as an alternative to "create contact &
  // compose" when the agent doesn't want this address added to the CRM.
  z.object({
    to: z.string().email(),
    subject: z.string().min(1),
    body: z.string().min(1),
    from_name: fromNameSchema.optional(),
    attachments: attachmentsField,
  }),
]);

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
  const { subject, body } = parsed.data;
  const attachments = parsed.data.attachments ?? [];
  const fromName = parsed.data.from_name || "Think Hawks";

  let contact_id: string | null = null;
  let toEmail: string;

  if ("contact_id" in parsed.data) {
    const { data: contact } = await supabase
      .from("contacts")
      .select("id, email, full_name")
      .eq("id", parsed.data.contact_id)
      .single();

    if (!contact?.email) {
      return NextResponse.json({ error: "This contact has no email on file" }, { status: 400 });
    }
    contact_id = contact.id;
    toEmail = contact.email;
  } else {
    toEmail = parsed.data.to;
  }

  const html = wrapEmailHtml(body);

  let messageId: string | null = null;
  try {
    const sgMail = getSendgrid();
    const [response] = await sgMail.send({
      from: { email: EMAIL_FROM, name: fromName },
      to: toEmail,
      subject,
      html,
      text: body,
      trackingSettings: DELIVERABILITY_TRACKING_SETTINGS,
      customArgs: contact_id ? { contact_id } : {},
      attachments: attachments.map((a) => ({
        filename: a.filename,
        type: a.type,
        content: a.content,
        disposition: "attachment",
      })),
    });
    messageId = firstSendgridHeader(response.headers, "x-message-id");
  } catch (err) {
    if (isSendgridConfigError(err)) {
      return NextResponse.json(
        { error: "Email sending isn't configured yet (SENDGRID_API_KEY missing)." },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: sendgridErrorMessage(err) }, { status: 502 });
  }

  await supabase.from("email_events").insert({
    contact_id,
    resend_email_id: messageId,
    subject,
    status: "sent",
  });

  await supabase.from("emails").insert({
    contact_id,
    direction: "outbound",
    resend_email_id: messageId,
    from_address: EMAIL_FROM,
    to_address: toEmail,
    subject,
    text_body: body,
    html_body: html,
    status: "sent",
    attachments: attachments.map((a) => ({ filename: a.filename, type: a.type, size: a.content.length })),
  });

  // activities is contact-scoped (not null) — a quick send with no saved
  // contact has nowhere to log this, which is the point of that option.
  if (contact_id) {
    await supabase.from("activities").insert({
      contact_id,
      type: "email",
      title: `Email sent: ${subject}`,
      body,
    });
  }

  return NextResponse.json({ ok: true, id: messageId });
}
