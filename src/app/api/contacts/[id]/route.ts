import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const PIPELINE_STAGES = ["new", "contacted", "qualified", "proposal", "won", "lost"] as const;
const PIPELINE_LABELS: Record<(typeof PIPELINE_STAGES)[number], string> = {
  new: "New Lead",
  contacted: "Contacted",
  qualified: "Qualified",
  proposal: "Proposal",
  won: "Won",
  lost: "Lost",
};

const updateSchema = z.object({
  full_name: z.string().min(1).optional(),
  email: z.string().email().optional().or(z.literal("")).nullable(),
  phone: z.string().optional().nullable(),
  company: z.string().optional().nullable(),
  tags: z.array(z.string()).optional(),
  notes: z.string().optional().nullable(),
  pipeline_stage: z.enum(PIPELINE_STAGES).optional(),
});

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [
    { data: contact, error },
    { data: activities },
    { data: calls },
    { data: messages },
    { data: emailEvents },
    { data: emails },
  ] = await Promise.all([
    supabase.from("contacts").select("*").eq("id", id).single(),
    supabase.from("activities").select("*").eq("contact_id", id).order("created_at", { ascending: false }),
    supabase.from("calls").select("*").eq("contact_id", id).order("created_at", { ascending: false }),
    supabase.from("messages").select("*").eq("contact_id", id).order("created_at", { ascending: true }),
    supabase.from("email_events").select("*").eq("contact_id", id).order("created_at", { ascending: false }),
    supabase.from("emails").select("*").eq("contact_id", id).order("created_at", { ascending: true }),
  ]);

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json({ contact, activities, calls, messages, emailEvents, emails });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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

  const updates: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.pipeline_stage) {
    updates.pipeline_updated_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from("contacts")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (parsed.data.pipeline_stage) {
    await supabase.from("activities").insert({
      contact_id: id,
      type: "note",
      title: `Moved to ${PIPELINE_LABELS[parsed.data.pipeline_stage]}`,
    });
  }

  return NextResponse.json({ contact: data });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await supabase.from("contacts").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
