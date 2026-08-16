import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildVoiceAccessToken, TEAM_CLIENT_IDENTITY } from "@/lib/twilio";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    // Every agent registers as the same Client identity so inbound calls to
    // the team number ring every open dialer at once (see TEAM_CLIENT_IDENTITY).
    const token = buildVoiceAccessToken(TEAM_CLIENT_IDENTITY);
    return NextResponse.json({ token, identity: TEAM_CLIENT_IDENTITY });
  } catch {
    return NextResponse.json(
      { error: "The browser dialer isn't configured yet — see SETUP.md." },
      { status: 503 },
    );
  }
}
