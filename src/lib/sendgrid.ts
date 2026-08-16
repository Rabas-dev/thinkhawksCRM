import sgMail from "@sendgrid/mail";
import { createVerify } from "crypto";

let configured = false;

export function getSendgrid() {
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) throw new Error("SENDGRID_API_KEY is not configured");
  if (!configured) {
    sgMail.setApiKey(apiKey);
    configured = true;
  }
  return sgMail;
}

export const EMAIL_FROM = process.env.SENDGRID_FROM_EMAIL || "crm@thinkhawks.com";

export function isSendgridConfigError(err: unknown): boolean {
  return err instanceof Error && err.message === "SENDGRID_API_KEY is not configured";
}

/** Pulls the human-readable message out of a @sendgrid/mail send error. */
export function sendgridErrorMessage(err: unknown): string {
  const body = (err as { response?: { body?: { errors?: { message?: string }[] } } })?.response?.body;
  const first = body?.errors?.[0]?.message;
  if (first) return first;
  return err instanceof Error ? err.message : "Couldn't send that email.";
}

/** Pulls a single response header value out of a @sendgrid/mail ClientResponse. */
export function firstSendgridHeader(headers: Record<string, string | string[]> | undefined, name: string): string | null {
  const value = headers?.[name];
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

/** Wraps plain-text body lines in simple paragraph HTML for outbound sends. */
export function wrapEmailHtml(body: string): string {
  return `<div style="font-family:sans-serif;font-size:15px;line-height:1.6;color:#222">${body
    .split("\n")
    .map((line) => `<p>${line}</p>`)
    .join("")}</div>`;
}

/** Branded HTML for meeting confirmation / update / cancellation emails. */
export function meetingEmailHtml(opts: {
  heading: string;
  intro: string;
  title: string;
  whenLabel: string;
  location: string | null;
  meetingLink: string | null;
  description: string | null;
  canceled?: boolean;
}) {
  const { heading, intro, title, whenLabel, location, meetingLink, description, canceled } = opts;
  return `
  <div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;background:#f6f5f4;padding:32px 16px">
    <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #eceae8">
      <div style="background:linear-gradient(135deg,#ff6a3d,#ff3d7a);padding:20px 24px;display:flex;align-items:center;gap:10px">
        <span style="display:inline-block;width:34px;height:34px;border-radius:10px;background:rgba(255,255,255,0.2);color:#fff;font-weight:700;font-size:14px;line-height:34px;text-align:center;font-family:sans-serif">TH</span>
        <span style="color:#fff;font-weight:600;font-size:15px;vertical-align:middle">Think Hawks</span>
      </div>
      <div style="padding:28px 24px">
        <h1 style="margin:0 0 8px;font-size:19px;color:#222;${canceled ? "text-decoration:line-through;" : ""}">${heading}</h1>
        <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#555">${intro}</p>
        <div style="border:1px solid #eceae8;border-radius:12px;padding:16px 18px;background:#fafaf9">
          <p style="margin:0 0 6px;font-size:15px;font-weight:600;color:#222">${title}</p>
          <p style="margin:0 0 4px;font-size:13px;color:#555">🗓️ ${whenLabel}</p>
          ${location ? `<p style="margin:0 0 4px;font-size:13px;color:#555">📍 ${location}</p>` : ""}
          ${meetingLink ? `<p style="margin:0 0 4px;font-size:13px;color:#555">🔗 <a href="${meetingLink}" style="color:#ff3d7a">${meetingLink}</a></p>` : ""}
          ${description ? `<p style="margin:10px 0 0;font-size:13px;color:#555;white-space:pre-wrap">${description}</p>` : ""}
        </div>
        <p style="margin:20px 0 0;font-size:12px;color:#999">Think Hawks CRM</p>
      </div>
    </div>
  </div>`;
}

/**
 * Verifies SendGrid's Event Webhook ECDSA signature (used by the outbound
 * status webhook). SendGrid signs `timestamp + rawBody` with an ECDSA
 * (P-256/SHA-256) key in IEEE P1363 format; the verification key comes from
 * the Event Webhook's "Signed Event Webhook Requests" setting in the SendGrid
 * dashboard, base64-encoded. Returns true if unverifiable but no key is
 * configured (dev).
 */
export function isValidSendgridEventSignature(rawBody: string, headers: Headers): boolean {
  const publicKeyBase64 = process.env.SENDGRID_WEBHOOK_PUBLIC_KEY;
  if (!publicKeyBase64) return true;

  const signature = headers.get("x-twilio-email-event-webhook-signature");
  const timestamp = headers.get("x-twilio-email-event-webhook-timestamp");
  if (!signature || !timestamp) return false;

  const publicKeyPem = `-----BEGIN PUBLIC KEY-----\n${publicKeyBase64}\n-----END PUBLIC KEY-----`;

  try {
    const verifier = createVerify("sha256");
    verifier.update(timestamp + rawBody);
    verifier.end();
    return verifier.verify({ key: publicKeyPem, dsaEncoding: "ieee-p1363" }, signature, "base64");
  } catch {
    return false;
  }
}

/**
 * Shared-secret gate for the Inbound Parse webhook (receiving replies).
 * SendGrid's Inbound Parse doesn't sign requests the way the Event Webhook
 * does, so — same pattern as the Twilio webhooks in this app — we append
 * ?token=SENDGRID_INBOUND_TOKEN to the URL configured in SendGrid and check
 * it here. Returns false (reject) if no token is configured, since an
 * unauthenticated inbound-email endpoint would let anyone create contacts
 * and inject "received" emails.
 */
export function requireSendgridInboundToken(url: URL): boolean {
  const expected = process.env.SENDGRID_INBOUND_TOKEN;
  if (!expected) return false;
  return url.searchParams.get("token") === expected;
}
