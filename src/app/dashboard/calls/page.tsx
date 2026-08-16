import { createClient } from "@/lib/supabase/server";
import { CallsClient } from "./calls-client";

export default async function CallsPage() {
  const supabase = await createClient();
  const { data: calls } = await supabase
    .from("calls")
    .select("*, contacts(id, full_name)")
    .order("created_at", { ascending: false })
    .limit(100);

  return <CallsClient calls={calls ?? []} />;
}
