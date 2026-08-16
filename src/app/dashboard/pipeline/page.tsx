import { createClient } from "@/lib/supabase/server";
import { PipelineClient } from "./pipeline-client";

export default async function PipelinePage() {
  const supabase = await createClient();
  const { data: contacts } = await supabase
    .from("contacts")
    .select("*")
    .order("pipeline_updated_at", { ascending: false });

  return <PipelineClient initialContacts={contacts ?? []} />;
}
