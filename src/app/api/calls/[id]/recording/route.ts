import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Streams a call recording from Twilio through our own auth gate, so we never
 * hand out the raw Twilio-hosted URL (which needs Twilio Basic Auth anyway)
 * or expose Twilio credentials to the browser.
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

  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) {
    return NextResponse.json({ error: "Twilio isn't configured" }, { status: 503 });
  }

  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  const upstream = await fetch(call.recording_url, {
    headers: { Authorization: `Basic ${auth}` },
  });

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
