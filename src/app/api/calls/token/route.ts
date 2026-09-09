import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  createSessionCredential,
  deleteSessionCredential,
  mintWebrtcToken,
  TELNYX_NUMBER,
  TELNYX_TEST_NUMBER,
} from "@/lib/telnyx";

/**
 * Mints a short-lived WebRTC login token for the browser softphone
 * (src/lib/dialer-context.tsx). Each call creates a brand-new Telephony
 * Credential scoped to this one dialer session — see createSessionCredential
 * for why a shared static credential breaks multi-tab/multi-agent use. The
 * session is also recorded in `dialer_sessions` so the inbound voice webhook
 * knows which SIP address to ring (see transferCall).
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id: credentialId, sipUsername } = await createSessionCredential(
      `dialer-session:${user.email ?? user.id}:${Date.now()}`,
    );
    const token = await mintWebrtcToken(credentialId);
    await supabase
      .from("dialer_sessions")
      .insert({ credential_id: credentialId, sip_username: sipUsername, user_email: user.email ?? null });
    // Best-effort GC for rows a crashed/force-closed tab never got to DELETE
    // (the pagehide handler can't fire for every ungraceful exit). The voice
    // webhook already filters dead sessions out by updated_at when routing
    // an inbound call (see its dialer_sessions query), so this is just
    // housekeeping — stale rows can't misroute a call anymore, they just sit
    // unused until this catches them.
    supabase
      .from("dialer_sessions")
      .delete()
      .lt("updated_at", new Date(Date.now() - 30 * 60 * 1000).toISOString())
      .then(() => {});
    const { data: settings } = await supabase
      .from("user_settings")
      .select("default_caller_id")
      .eq("user_id", user.id)
      .maybeSingle();
    return NextResponse.json({
      token,
      credentialId,
      callerNumber: TELNYX_NUMBER,
      testCallerNumber: TELNYX_TEST_NUMBER || null,
      defaultUseTestCallerId: settings?.default_caller_id === "test",
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "The browser dialer isn't configured yet — see SETUP.md." },
      { status: 503 },
    );
  }
}

/**
 * Heartbeat from a connected browser dialer session, called every ~20s
 * (src/lib/dialer-context.tsx) so `dialer_sessions.updated_at` reflects
 * "still actually connected," not just "was created at some point." The
 * inbound voice webhook only rings sessions updated recently — see the
 * updated_at column comment in supabase/schema.sql for why.
 */
export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const credentialId = request.nextUrl.searchParams.get("credentialId");
  if (!credentialId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(credentialId)) {
    return NextResponse.json({ error: "Invalid credentialId" }, { status: 400 });
  }

  await supabase.from("dialer_sessions").update({ updated_at: new Date().toISOString() }).eq("credential_id", credentialId);
  return NextResponse.json({ ok: true });
}

/** Releases a session's Telephony Credential when the dialer disconnects (tab close/unmount) — keeps the account tidy. */
export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const credentialId = request.nextUrl.searchParams.get("credentialId");
  // Telnyx telephony credential ids are UUIDs — reject anything else before
  // it reaches deleteSessionCredential, which interpolates this value
  // directly into a Telnyx API URL. An unvalidated value containing path
  // traversal sequences (e.g. "../phone_numbers/123") would let the caller
  // retarget the DELETE request at an arbitrary Telnyx resource using this
  // server's own API key, since URL parsing normalizes ".." segments.
  if (!credentialId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(credentialId)) {
    return NextResponse.json({ error: "Invalid credentialId" }, { status: 400 });
  }

  await supabase.from("dialer_sessions").delete().eq("credential_id", credentialId);

  try {
    await deleteSessionCredential(credentialId);
  } catch {
    // Best-effort cleanup — a stale credential left behind isn't worth failing the request over.
  }
  return NextResponse.json({ ok: true });
}
