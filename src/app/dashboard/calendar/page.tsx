import { createClient } from "@/lib/supabase/server";
import { CalendarClient } from "./calendar-client";

export default async function CalendarPage() {
  const supabase = await createClient();

  const [{ data: meetings }, { data: contacts }] = await Promise.all([
    supabase
      .from("meetings")
      .select("*, contacts(id, full_name, company, email)")
      .neq("status", "canceled")
      .order("start_at", { ascending: true }),
    supabase
      .from("contacts")
      .select("id, full_name, email, company")
      .order("full_name", { ascending: true }),
  ]);

  return <CalendarClient meetings={meetings ?? []} contacts={contacts ?? []} />;
}
