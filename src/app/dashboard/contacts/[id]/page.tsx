import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ContactDetailClient } from "./contact-detail-client";

export default async function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [
    { data: contact, error },
    { data: activities },
    { data: calls },
    { data: messages },
    { data: emailEvents },
    { data: emails },
    { data: tasks },
    { data: meetings },
    { data: contacts },
  ] = await Promise.all([
    supabase.from("contacts").select("*").eq("id", id).single(),
    supabase.from("activities").select("*").eq("contact_id", id).order("created_at", { ascending: false }),
    supabase.from("calls").select("*").eq("contact_id", id).order("created_at", { ascending: false }),
    supabase.from("messages").select("*").eq("contact_id", id).order("created_at", { ascending: true }),
    supabase.from("email_events").select("*").eq("contact_id", id).order("created_at", { ascending: false }),
    supabase.from("emails").select("*").eq("contact_id", id).order("created_at", { ascending: true }),
    supabase.from("tasks").select("*").eq("contact_id", id).eq("status", "open").order("due_at", { ascending: true }),
    supabase
      .from("meetings")
      .select("*")
      .eq("contact_id", id)
      .neq("status", "canceled")
      .order("start_at", { ascending: true }),
    supabase
      .from("contacts")
      .select("id, full_name, email, phone, company")
      .order("full_name", { ascending: true }),
  ]);

  if (error || !contact) notFound();

  return (
    <ContactDetailClient
      contacts={contacts ?? []}
      detail={{
        contact,
        activities: activities ?? [],
        calls: calls ?? [],
        messages: messages ?? [],
        emailEvents: emailEvents ?? [],
        emails: emails ?? [],
        tasks: tasks ?? [],
        meetings: meetings ?? [],
      }}
    />
  );
}
