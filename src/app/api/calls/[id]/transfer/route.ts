import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { transferCall } from "@/lib/telnyx";
import { toE164 } from "@/lib/utils";

const schema = z.object({ to: z.string().min(1) });

/** Blind-transfers the other party on an active call to a new number — see transferCall's comment for which leg this targets. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "A destination number is required" }, { status: 400 });

  const { data: call } = await supabase.from("calls").select("telnyx_call_control_id").eq("id", id).single();
  if (!call?.telnyx_call_control_id) {
    return NextResponse.json({ error: "No active call to transfer" }, { status: 404 });
  }

  const to = toE164(parsed.data.to);
  try {
    await transferCall(call.telnyx_call_control_id, to);
    await supabase.from("calls").update({ notes: `Transferred to ${to}` }).eq("id", id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Couldn't transfer the call" },
      { status: 502 },
    );
  }
}
