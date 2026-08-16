import { createClient } from "@/lib/supabase/server";
import { TemplatesClient } from "./templates-client";

export default async function TemplatesPage() {
  const supabase = await createClient();
  const { data: templates } = await supabase
    .from("email_templates")
    .select("*")
    .order("created_at", { ascending: false });

  return <TemplatesClient initialTemplates={templates ?? []} />;
}
