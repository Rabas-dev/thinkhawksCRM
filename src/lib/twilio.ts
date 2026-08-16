import Twilio, { jwt } from "twilio";

export function getTwilioClient() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) throw new Error("Twilio credentials are not configured");
  return Twilio(sid, token);
}

export const TWILIO_NUMBER = process.env.TWILIO_PHONE_NUMBER || "";
export const TWILIO_WHATSAPP_NUMBER = process.env.TWILIO_WHATSAPP_NUMBER || "";

/**
 * Every agent's browser dialer registers under this same Twilio Client
 * identity, so an inbound call to the team number fans out and rings every
 * open dialer at once — whoever accepts first takes the call.
 */
export const TEAM_CLIENT_IDENTITY = "team";

/** Public base URL Twilio uses to reach our webhooks — must be a real HTTPS URL in production. */
export function getBaseUrl() {
  const url = process.env.NEXT_PUBLIC_BASE_URL;
  if (!url) throw new Error("NEXT_PUBLIC_BASE_URL is not configured");
  return url.replace(/\/$/, "");
}

/**
 * Shared-secret gate for the public Twilio webhook endpoints (voice TwiML,
 * status/recording callbacks). These routes can't require a Supabase login
 * since Twilio's servers call them directly, so instead every URL we hand to
 * Twilio carries ?token=TWILIO_WEBHOOK_TOKEN and each handler checks it.
 */
export function requireWebhookToken(url: URL): boolean {
  const expected = process.env.TWILIO_WEBHOOK_TOKEN;
  if (!expected) return false;
  return url.searchParams.get("token") === expected;
}

/** Builds a short-lived Voice access token for the browser dialer (Twilio Voice JS SDK). */
export function buildVoiceAccessToken(identity: string): string {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const apiKeySid = process.env.TWILIO_API_KEY_SID;
  const apiKeySecret = process.env.TWILIO_API_KEY_SECRET;
  const twimlAppSid = process.env.TWILIO_TWIML_APP_SID;
  if (!accountSid || !apiKeySid || !apiKeySecret || !twimlAppSid) {
    throw new Error("Twilio Voice SDK credentials are not configured");
  }

  const { AccessToken } = jwt;
  const { VoiceGrant } = AccessToken;

  const token = new AccessToken(accountSid, apiKeySid, apiKeySecret, {
    identity,
    ttl: 3600,
  });
  token.addGrant(
    new VoiceGrant({
      outgoingApplicationSid: twimlAppSid,
      incomingAllow: true,
    }),
  );

  return token.toJwt();
}
