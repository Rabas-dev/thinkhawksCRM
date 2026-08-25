import { toE164 } from "@/lib/utils";

const TELNYX_API_BASE = "https://api.telnyx.com/v2";

export const TELNYX_NUMBER = process.env.TELNYX_PHONE_NUMBER ? toE164(process.env.TELNYX_PHONE_NUMBER) : "";
/** Secondary caller ID (Telnyx "Forward Only" test connection) agents can opt into for internal/test calls — production default stays TELNYX_NUMBER. */
export const TELNYX_TEST_NUMBER = process.env.TELNYX_TEST_PHONE_NUMBER ? toE164(process.env.TELNYX_TEST_PHONE_NUMBER) : "";
/** The WebRTC-enabled Credential Connection every browser session mints its own short-lived Telephony Credential under (see createSessionCredential). */
export const TELNYX_WEBRTC_CONNECTION_ID = process.env.TELNYX_WEBRTC_CONNECTION_ID || "";
/** A Call Control Application (not a Credential Connection — POST /calls rejects those) used to originate the second leg when bridging an inbound call to a connected browser session. */
export const TELNYX_CALL_CONTROL_APP_ID = process.env.TELNYX_CALL_CONTROL_APP_ID || "";

/**
 * Thin wrapper around the Telnyx REST API (Call Control + Messaging +
 * Telephony Credentials share the same auth/base). No SDK needed — it's
 * plain JSON over HTTPS.
 */
export async function telnyxRequest<T = unknown>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const apiKey = process.env.TELNYX_API_KEY;
  if (!apiKey) throw new Error("Telnyx credentials are not configured");

  const res = await fetch(`${TELNYX_API_BASE}${path}`, {
    method: options.method ?? "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const raw = await res.text();
  if (!res.ok) {
    const json = safeJsonParse(raw);
    const message =
      (json as { errors?: { detail?: string; title?: string }[] } | null)?.errors?.[0]?.detail ||
      (json as { errors?: { detail?: string; title?: string }[] } | null)?.errors?.[0]?.title ||
      `Telnyx API error (${res.status})`;
    throw new Error(message);
  }
  return (safeJsonParse(raw) ?? raw) as T;
}

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Public base URL Telnyx uses to reach our webhooks — must be a real HTTPS URL in production. */
export function getBaseUrl() {
  const url = process.env.NEXT_PUBLIC_BASE_URL;
  if (!url) throw new Error("NEXT_PUBLIC_BASE_URL is not configured");
  return url.replace(/\/$/, "");
}

/**
 * Shared-secret gate for the public Telnyx webhook endpoints (voice + messaging).
 * These routes can't require a Supabase login since Telnyx's servers call them
 * directly, so instead every URL we hand to Telnyx carries ?token=TELNYX_WEBHOOK_TOKEN
 * and each handler checks it.
 */
export function requireWebhookToken(url: URL): boolean {
  const expected = process.env.TELNYX_WEBHOOK_TOKEN;
  if (!expected) return false;
  return url.searchParams.get("token") === expected;
}

/**
 * Round-trips through the WebRTC SDK's `clientState` option and back through
 * the Call Control webhook, so we can key events to a `calls` row without a
 * second DB lookup. The WebRTC SDK takes a plain object and Telnyx may hand
 * it back either as that same JSON or as a base64 string, so decoding tries
 * both.
 */
export function decodeClientState(raw: unknown): Record<string, unknown> | null {
  if (!raw) return null;
  if (typeof raw === "object") return raw as Record<string, unknown>;
  if (typeof raw !== "string") return null;
  try {
    return JSON.parse(raw);
  } catch {
    // fall through to base64
  }
  try {
    return JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

/**
 * Creates a fresh Telephony Credential scoped to one browser dialer session.
 * Telnyx allows only one active registration per credential — sharing a
 * single static credential across tabs/agents means a second connection
 * silently evicts ("punts") the first mid-call. Minting one per session and
 * deleting it on disconnect (see DELETE /api/calls/token) is Telnyx's own
 * recommended pattern for multi-session WebRTC apps.
 */
export async function createSessionCredential(name: string): Promise<{ id: string; sipUsername: string }> {
  if (!TELNYX_WEBRTC_CONNECTION_ID) throw new Error("TELNYX_WEBRTC_CONNECTION_ID is not configured");
  const result = await telnyxRequest<{ data?: { id?: string; sip_username?: string } }>("/telephony_credentials", {
    method: "POST",
    body: { connection_id: TELNYX_WEBRTC_CONNECTION_ID, name },
  });
  const id = result?.data?.id;
  const sipUsername = result?.data?.sip_username;
  if (!id || !sipUsername) throw new Error("Telnyx didn't return a credential id/sip_username");
  return { id, sipUsername };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Both call sites below interpolate `credentialId` into a Telnyx API URL —
 * without this check, a value containing ".." segments would let a caller
 * retarget the request at an arbitrary Telnyx resource (URL parsing
 * normalizes ".." before the request is sent), using this server's own API
 * key. Enforced here, not just at the route handler, so it can't regress.
 */
function assertValidCredentialId(credentialId: string): void {
  if (!UUID_RE.test(credentialId)) throw new Error("Invalid credential id");
}

export async function deleteSessionCredential(credentialId: string): Promise<void> {
  assertValidCredentialId(credentialId);
  await telnyxRequest(`/telephony_credentials/${credentialId}`, { method: "DELETE" });
}

/** Mints a short-lived JWT the browser uses to authenticate the WebRTC SDK for one specific Telephony Credential. */
export async function mintWebrtcToken(credentialId: string): Promise<string> {
  assertValidCredentialId(credentialId);
  const result = await telnyxRequest<string | { data?: string; token?: string }>(
    `/telephony_credentials/${credentialId}/token`,
    { method: "POST" },
  );
  if (typeof result === "string") return result;
  const token = result?.data ?? result?.token;
  if (!token) throw new Error("Telnyx didn't return a token");
  return token;
}

/**
 * Rings a currently-connected browser dialer session for an inbound call.
 * Credential Connections only auto-ring registered WebRTC clients when
 * *no* webhook is attached — ours needs one for call logging/recording,
 * which switches Telnyx into Call-Control mode and makes ringing something
 * we have to do explicitly. `sipUsername` is the target session's Telephony
 * Credential sip_username (see createSessionCredential / dialer_sessions).
 *
 * This only dials the second leg — it does NOT bridge. `bridge`, like
 * `transfer`, only works once the target leg is answered (confirmed against
 * the live API: calling bridge right after dial fails with "This call
 * can't receive bridge command because it has not been answered yet").
 * The caller must wait for *this* leg's own call.answered event (matched
 * by its call_control_id, not the inbound call's session id) and bridge at
 * that point — see the voice webhook's call.answered handler.
 */
export async function dialSipLeg(sipUsername: string): Promise<string> {
  if (!TELNYX_CALL_CONTROL_APP_ID) throw new Error("TELNYX_CALL_CONTROL_APP_ID is not configured");
  const dialResult = await telnyxRequest<{ data?: { call_control_id?: string } }>("/calls", {
    method: "POST",
    body: {
      connection_id: TELNYX_CALL_CONTROL_APP_ID,
      to: `sip:${sipUsername}@sip.telnyx.com`,
      from: TELNYX_NUMBER || undefined,
    },
  });
  const newLegId = dialResult?.data?.call_control_id;
  if (!newLegId) throw new Error("Telnyx didn't return a call_control_id for the dialed leg");
  return newLegId;
}

/** Bridges two already-answered call legs together. */
export async function bridgeCalls(callControlIdA: string, callControlIdB: string) {
  await telnyxRequest(`/calls/${callControlIdA}/actions/bridge`, {
    method: "POST",
    body: { call_control_id: callControlIdB },
  });
}

/**
 * Fetches a fresh presigned download URL for a saved recording. The URL we
 * store at record time (call.recording.saved's recording_urls) is an S3
 * presigned link that expires in ~10 minutes — playing it back any time
 * after that 404s/403s forever unless we ask Telnyx for a new one.
 */
export async function getRecordingUrl(recordingId: string): Promise<string | null> {
  const result = await telnyxRequest<{ data?: { download_urls?: { mp3?: string } } }>(
    `/recordings/${recordingId}`,
  );
  return result?.data?.download_urls?.mp3 ?? null;
}

/** Starts recording a call, dual channel so agent + contact are separable. */
export async function startRecording(callControlId: string) {
  await telnyxRequest(`/calls/${callControlId}/actions/record_start`, {
    method: "POST",
    body: { format: "mp3", channels: "dual" },
  });
}

/** Pauses/resumes/stops the active recording — used by the agent's live recording toggle. */
export async function pauseRecording(callControlId: string) {
  await telnyxRequest(`/calls/${callControlId}/actions/record_pause`, { method: "POST" });
}
export async function resumeRecording(callControlId: string) {
  await telnyxRequest(`/calls/${callControlId}/actions/record_resume`, { method: "POST" });
}
export async function stopRecording(callControlId: string) {
  await telnyxRequest(`/calls/${callControlId}/actions/record_stop`, { method: "POST" });
}

/** Ends a call leg via the REST API — used as a fallback if the browser's WebRTC session already dropped. */
export async function hangup(callControlId: string) {
  await telnyxRequest(`/calls/${callControlId}/actions/hangup`, { method: "POST" });
}

/** Sends an SMS through the Messaging API. Returns the message id used to key delivery-status webhooks. */
export async function sendSms(params: { to: string; from: string; text: string }) {
  const result = await telnyxRequest<{ data: { id: string; to: { status: string }[] } }>("/messages", {
    method: "POST",
    body: { to: params.to, from: params.from, text: params.text },
  });
  return result.data;
}
