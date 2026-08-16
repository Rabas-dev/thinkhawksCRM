import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { tallyCampaignStats } from "@/lib/campaign-stats";
import type { CampaignWithStats, EmailStatus } from "@/lib/types";

const createSchema = z.object({
  name: z.string().min(1),
  subject: z.string().min(1),
  body: z.string().min(1),
  template_id: z.string().uuid().optional().nullable(),
  segment_tag: z.string().optional().nullable(),
});

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [{ data: campaigns, error }, { data: recipients }] = await Promise.all([
    supabase.from("campaigns").select("*").order("created_at", { ascending: false }),
    supabase.from("campaign_recipients").select("campaign_id, status"),
  ]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

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

  return NextResponse.json({ campaigns: withStats });
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

  const { data, error } = await supabase
    .from("campaigns")
    .insert({ ...parsed.data, segment_tag: parsed.data.segment_tag || null })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ campaign: data }, { status: 201 });
}
