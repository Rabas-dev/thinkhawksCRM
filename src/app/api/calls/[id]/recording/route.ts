import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { pauseRecording, resumeRecording, stopRecording } from "@/lib/telnyx";

/**
 * Streams a call recording through our own auth gate, so we never hand out
 * the raw Telnyx-hosted URL to the browser directly.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: call } = await supabase
    .from("calls")
    .select("recording_url")
    .eq("id", id)
    .single();

  if (!call?.recording_url) {
    return NextResponse.json({ error: "No recording available" }, { status: 404 });
  }

  const upstream = await fetch(call.recording_url);

  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: "Recording not available yet" }, { status: 502 });
  }

  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "private, max-age=3600",
    },
  });
}

/** Live pause/resume/stop control for the agent's in-call recording toggle. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { action } = await request.json();
  if (action !== "pause" && action !== "resume" && action !== "stop") {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const { data: call } = await supabase.from("calls").select("telnyx_call_control_id").eq("id", id).single();
  if (!call?.telnyx_call_control_id) {
    return NextResponse.json({ error: "No active call to control" }, { status: 404 });
  }

  try {
    if (action === "pause") await pauseRecording(call.telnyx_call_control_id);
    else if (action === "resume") await resumeRecording(call.telnyx_call_control_id);
    else await stopRecording(call.telnyx_call_control_id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Couldn't update recording" },
      { status: 502 },
    );
  }
}
