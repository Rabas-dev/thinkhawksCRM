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

const schema = z.object({
  contact_id: z.string().uuid(),
  subject: z.string().min(1),
  body: z.string().min(1),
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
  const { contact_id, subject, body } = parsed.data;

  const { data: contact } = await supabase
    .from("contacts")
    .select("id, email, full_name")
    .eq("id", contact_id)
    .single();

  if (!contact?.email) {
    return NextResponse.json({ error: "This contact has no email on file" }, { status: 400 });
  }

  const html = wrapEmailHtml(body);

  let messageId: string | null = null;
  try {
    const sgMail = getSendgrid();
    const [response] = await sgMail.send({
      from: EMAIL_FROM,
      to: contact.email,
      subject,
      html,
      customArgs: { contact_id },
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
    to_address: contact.email,
    subject,
    text_body: body,
    html_body: html,
    status: "sent",
  });

  await supabase.from("activities").insert({
    contact_id,
    type: "email",
    title: `Email sent: ${subject}`,
    body,
  });

  return NextResponse.json({ ok: true, id: messageId });
}
