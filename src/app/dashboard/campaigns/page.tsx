import { createClient } from "@/lib/supabase/server";
import { tallyCampaignStats } from "@/lib/campaign-stats";
import { CampaignsClient } from "./campaigns-client";
import type { CampaignWithStats, EmailStatus } from "@/lib/types";

export default async function CampaignsPage() {
  const supabase = await createClient();
  const [{ data: campaigns }, { data: recipients }] = await Promise.all([
    supabase.from("campaigns").select("*").order("created_at", { ascending: false }),
    supabase.from("campaign_recipients").select("campaign_id, status"),
  ]);

  const byCampaign = new Map<string, { status: EmailStatus }[]>();
  for (const r of recipients ?? []) {
    const list = byCampaign.get(r.campaign_id) ?? [];
    list.push({ status: r.status as EmailStatus });
    byCampaign.set(r.campaign_id, list);
  }

  const withStats: CampaignWithStats[] = (campaigns ?? []).map((c) => ({
    ...c,
    stats: tallyCampaignStats(byCampaign.get(c.id) ?? []),
  }));

  return <CampaignsClient campaigns={withStats} />;
}
