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
} from "@/lib/sendgrid";

const schema = z.union([
  z.object({
    contact_id: z.string().uuid(),
    subject: z.string().min(1),
    body: z.string().min(1),
  }),
  // A quick send to someone who isn't (and won't become) a saved contact —
  // the Compose modal offers this as an alternative to "create contact &
  // compose" when the agent doesn't want this address added to the CRM.
  z.object({
    to: z.string().email(),
    subject: z.string().min(1),
    body: z.string().min(1),
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
      from: EMAIL_FROM,
      to: toEmail,
      subject,
      html,
      customArgs: contact_id ? { contact_id } : {},
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
