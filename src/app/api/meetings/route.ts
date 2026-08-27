import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { format } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import {
  getSendgrid,
  EMAIL_FROM,
  meetingEmailHtml,
  isSendgridConfigError,
  sendgridErrorMessage,
  firstSendgridHeader,
  htmlToPlainText,
  DELIVERABILITY_TRACKING_SETTINGS,
} from "@/lib/sendgrid";
import { escapeHtml } from "@/lib/utils";

const createSchema = z
  .object({
    contact_id: z.string().uuid(),
    title: z.string().min(1),
    description: z.string().optional(),
    location: z.string().optional(),
    meeting_link: z.string().url().optional().or(z.literal("")),
    start_at: z.string().min(1),
    end_at: z.string().min(1),
  })
  .refine((v) => new Date(v.end_at) > new Date(v.start_at), {
    message: "End time must be after start time",
    path: ["end_at"],
  });

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const params = request.nextUrl.searchParams;
  const contactId = params.get("contact_id");
  const from = params.get("from");
  const to = params.get("to");

  let query = supabase
    .from("meetings")
    .select("*, contacts(id, full_name, company, email)")
    .order("start_at", { ascending: true });

  if (contactId) query = query.eq("contact_id", contactId);
  if (from) query = query.gte("start_at", from);
  if (to) query = query.lte("start_at", to);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ meetings: data });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;

  const { data: contact } = await supabase
    .from("contacts")
    .select("id, full_name, email")
    .eq("id", input.contact_id)
    .single();
  if (!contact) return NextResponse.json({ error: "Contact not found" }, { status: 404 });

  const { data: meeting, error } = await supabase
    .from("meetings")
    .insert({
      contact_id: input.contact_id,
      title: input.title,
      description: input.description || null,
      location: input.location || null,
      meeting_link: input.meeting_link || null,
      start_at: input.start_at,
      end_at: input.end_at,
    })
    .select()
    .single();

  if (error || !meeting) return NextResponse.json({ error: error?.message ?? "Couldn't create meeting" }, { status: 500 });

  const whenLabel = format(new Date(meeting.start_at), "EEEE, MMM d 'at' h:mm a");

  await supabase.from("activities").insert({
    contact_id: input.contact_id,
    type: "meeting",
    title: `Meeting scheduled: ${meeting.title}`,
    body: whenLabel,
    metadata: { meeting_id: meeting.id },
  });

  let emailSent = false;
  let emailError: string | null = null;

  if (contact.email) {
    try {
      const sgMail = getSendgrid();
      const html = meetingEmailHtml({
        heading: "Your meeting is confirmed",
        intro: `Hi ${escapeHtml(contact.full_name.split(" ")[0])}, this confirms your upcoming meeting with Think Hawks.`,
        title: meeting.title,
        whenLabel,
        location: meeting.location,
        meetingLink: meeting.meeting_link,
        description: meeting.description,
      });
      const [response] = await sgMail.send({
        from: EMAIL_FROM,
        to: contact.email,
        subject: `Meeting confirmed: ${meeting.title}`,
        html,
        text: htmlToPlainText(html),
        trackingSettings: DELIVERABILITY_TRACKING_SETTINGS,
        customArgs: { meeting_id: meeting.id },
      });

      emailSent = true;
      const resendEmailId = firstSendgridHeader(response.headers, "x-message-id");
      await supabase.from("meetings").update({ confirmation_email_id: resendEmailId }).eq("id", meeting.id);
      await supabase.from("email_events").insert({
        contact_id: input.contact_id,
        resend_email_id: resendEmailId,
        subject: `Meeting confirmed: ${meeting.title}`,
        status: "sent",
      });
    } catch (err) {
      emailError = isSendgridConfigError(err) ? "Email sending isn't configured yet." : sendgridErrorMessage(err);
    }
  }

  return NextResponse.json({ meeting, emailSent, emailError }, { status: 201 });
}
