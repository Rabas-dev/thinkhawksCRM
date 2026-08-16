import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const updateSchema = z.object({
  notes: z.string().optional().nullable(),
  disposition: z.string().optional().nullable(),
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = updateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { data: call, error } = await supabase
    .from("calls")
    .update(parsed.data)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (call?.contact_id && (parsed.data.notes || parsed.data.disposition)) {
    await supabase.from("activities").insert({
      contact_id: call.contact_id,
      type: "call",
      title: `Call disposition: ${parsed.data.disposition ?? "logged"}`,
      body: parsed.data.notes ?? null,
      metadata: { call_id: call.id },
    });
  }

  return NextResponse.json({ call });
}
