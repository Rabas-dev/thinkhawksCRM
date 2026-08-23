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
 * for why a shared static credential breaks multi-tab/multi-agent use.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const credentialId = await createSessionCredential(`dialer-session:${user.email ?? user.id}:${Date.now()}`);
    const token = await mintWebrtcToken(credentialId);
    return NextResponse.json({
      token,
      credentialId,
      callerNumber: TELNYX_NUMBER,
      testCallerNumber: TELNYX_TEST_NUMBER || null,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "The browser dialer isn't configured yet — see SETUP.md." },
      { status: 503 },
    );
  }
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

  try {
    await deleteSessionCredential(credentialId);
  } catch {
    // Best-effort cleanup — a stale credential left behind isn't worth failing the request over.
  }
  return NextResponse.json({ ok: true });
}
