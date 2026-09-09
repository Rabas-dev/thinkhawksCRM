import { createClient } from "@/lib/supabase/server";
import { SettingsClient } from "./settings-client";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: settings } = user
    ? await supabase
        .from("user_settings")
        .select("display_name, email_signature, default_caller_id")
        .eq("user_id", user.id)
        .maybeSingle()
    : { data: null };

  const { data: callRouting } = await supabase
    .from("app_settings")
    .select("inbound_ring_strategy")
    .eq("id", true)
    .maybeSingle();

  return (
    <SettingsClient
      userEmail={user?.email ?? null}
      initialSettings={
        settings ?? { display_name: null, email_signature: null, default_caller_id: "main" as const }
      }
      initialCallRouting={callRouting ?? { inbound_ring_strategy: "ring-all" as const }}
    />
  );
}
