import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { format } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import { getSendgrid, EMAIL_FROM, meetingEmailHtml } from "@/lib/sendgrid";
import { escapeHtml } from "@/lib/utils";

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  location: z.string().optional(),
  meeting_link: z.string().url().optional().or(z.literal("")),
  start_at: z.string().min(1).optional(),
  end_at: z.string().min(1).optional(),
  status: z.enum(["scheduled", "completed", "canceled", "no_show"]).optional(),
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = updateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { data: existing } = await supabase
    .from("meetings")
    .select("*, contacts(id, full_name, email)")
    .eq("id", id)
    .single();
  if (!existing) return NextResponse.json({ error: "Meeting not found" }, { status: 404 });

  const rescheduled =
    (parsed.data.start_at && parsed.data.start_at !== existing.start_at) ||
    (parsed.data.end_at && parsed.data.end_at !== existing.end_at);
  const canceled = parsed.data.status === "canceled" && existing.status !== "canceled";

  const update = { ...parsed.data, meeting_link: parsed.data.meeting_link || undefined };
  const { data: meeting, error } = await supabase
    .from("meetings")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (error || !meeting) return NextResponse.json({ error: error?.message ?? "Couldn't update meeting" }, { status: 500 });

  const contact = Array.isArray(existing.contacts) ? existing.contacts[0] : existing.contacts;

  if ((rescheduled || canceled) && contact?.email) {
    const whenLabel = format(new Date(meeting.start_at), "EEEE, MMM d 'at' h:mm a");
    try {
      const sgMail = getSendgrid();
      await sgMail.send({
        from: EMAIL_FROM,
        to: contact.email,
        subject: canceled ? `Meeting canceled: ${meeting.title}` : `Meeting rescheduled: ${meeting.title}`,
        html: meetingEmailHtml({
          heading: canceled ? "Your meeting has been canceled" : "Your meeting was rescheduled",
          intro: `Hi ${escapeHtml(contact.full_name.split(" ")[0])}, ${
            canceled
              ? "the meeting below has been canceled."
              : "here are the updated details for your meeting with Think Hawks."
          }`,
          title: meeting.title,
          whenLabel,
          location: meeting.location,
          meetingLink: meeting.meeting_link,
          description: meeting.description,
          canceled,
        }),
        customArgs: { meeting_id: meeting.id },
      });
    } catch {
      // Best-effort notification — the meeting update itself already succeeded.
    }

    await supabase.from("activities").insert({
      contact_id: meeting.contact_id,
      type: "meeting",
      title: canceled ? `Meeting canceled: ${meeting.title}` : `Meeting rescheduled: ${meeting.title}`,
      body: whenLabel,
      metadata: { meeting_id: meeting.id },
    });
  }

  return NextResponse.json({ meeting });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await supabase.from("meetings").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
