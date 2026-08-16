import { createClient } from "@/lib/supabase/server";
import { ContactsClient } from "./contacts-client";

export default async function ContactsPage() {
  const supabase = await createClient();
  const { data: contacts } = await supabase
    .from("contacts")
    .select("*")
    .order("created_at", { ascending: false });

  return <ContactsClient initialContacts={contacts ?? []} />;
}
