import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { pauseRecording, resumeRecording, stopRecording, getRecordingUrl } from "@/lib/telnyx";

/**
 * Streams a call recording through our own auth gate, so we never hand out
 * the raw Telnyx-hosted URL to the browser directly.
 *
 * Forwards the browser's Range header to S3 (which supports it natively)
 * and mirrors back Content-Range/Accept-Ranges/206 — without this, dragging
 * the player's seek bar does nothing: setting <audio>.currentTime makes the
 * browser issue a ranged request for that byte offset, and a proxy that
 * always answers with the full file from byte 0 makes playback snap back
 * to 0:00 instead of actually seeking.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: call } = await supabase
    .from("calls")
    .select("recording_url, recording_id")
    .eq("id", id)
    .single();

  if (!call?.recording_url) {
    return NextResponse.json({ error: "No recording available" }, { status: 404 });
  }

  // The stored recording_url is an S3 presigned link that expires ~10
  // minutes after the recording was saved — ask Telnyx for a fresh one
  // rather than relying on it still being valid whenever this is played.
  let playbackUrl = call.recording_url;
  if (call.recording_id) {
    try {
      const fresh = await getRecordingUrl(call.recording_id);
      if (fresh) playbackUrl = fresh;
    } catch {
      // Fall back to the possibly-stale stored URL — better than a hard failure.
    }
  }

  const range = request.headers.get("range") ?? undefined;
  const upstream = await fetch(playbackUrl, range ? { headers: { range } } : undefined);

  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: "Recording not available yet" }, { status: 502 });
  }

  const headers = new Headers({
    "Content-Type": "audio/mpeg",
    "Cache-Control": "private, max-age=3600",
    "Accept-Ranges": "bytes",
  });
  const contentRange = upstream.headers.get("content-range");
  const contentLength = upstream.headers.get("content-length");
  if (contentRange) headers.set("Content-Range", contentRange);
  if (contentLength) headers.set("Content-Length", contentLength);

  return new NextResponse(upstream.body, {
    status: upstream.status === 206 ? 206 : 200,
    headers,
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
