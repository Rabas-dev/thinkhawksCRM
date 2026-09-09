import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

/**
 * Team-wide setting (not per-user, unlike /api/settings) controlling how an
 * inbound call picks which connected agent(s) to ring — see the voice
 * webhook's call.initiated handler. Singleton row, app_settings.id = true.
 */

const updateSchema = z.object({
  inbound_ring_strategy: z.enum(["ring-all", "round-robin"]),
});

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("app_settings")
    .select("inbound_ring_strategy")
    .eq("id", true)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ settings: data ?? { inbound_ring_strategy: "ring-all" } });
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("app_settings")
    .upsert(
      { id: true, ...parsed.data, updated_at: new Date().toISOString() },
      { onConflict: "id" },
    )
    .select("inbound_ring_strategy")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ settings: data });
}
