import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hangup } from "@/lib/telnyx";

/** Ends the agent leg of a call in progress — since it's bridged, the contact leg drops with it. */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: call } = await supabase.from("calls").select("telnyx_call_control_id").eq("id", id).single();
  if (!call?.telnyx_call_control_id) {
    return NextResponse.json({ error: "No active call to hang up" }, { status: 404 });
  }

  try {
    await hangup(call.telnyx_call_control_id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Couldn't hang up" },
      { status: 502 },
    );
  }
}
