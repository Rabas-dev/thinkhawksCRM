# Think Hawks CRM — Setup

This app is fully built and compiles clean, but it's wired to three outside
services that only you can create accounts for (I can't sign up for services
or hold your payment details). Follow this once per environment (local +
production). Check `/dashboard/settings` after deploying — it shows which of
these are still missing.

## 1. Supabase (database + login)

1. Create a free project at [supabase.com](https://supabase.com).
2. In **Project Settings → API**, copy:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key (click "Reveal") → `SUPABASE_SERVICE_ROLE_KEY` — keep this secret, it's server-only
3. Open **SQL Editor → New query**, paste the contents of
   [`supabase/schema.sql`](./supabase/schema.sql), and run it. This creates
   `contacts`, `activities`, `calls`, `messages`, `email_events`,
   `email_templates`, `campaigns`, `campaign_recipients`, and `emails`, with
   row-level security already locked down to signed-in users. The file is
   idempotent — safe to paste and re-run any time you pull an update, even on
   a project that already has these tables.
4. Create your team's logins: **Authentication → Users → Add user**. This is
   an internal tool — there's no public sign-up page, so add each teammate
   here directly (email + password, or send an invite).

## 2. SendGrid (email automation — sent/delivered/opened)

Email runs on SendGrid (Twilio's email product) — a separate account/bill
from Telnyx, which handles calling/SMS below.

1. Create/use your Twilio SendGrid account at [sendgrid.com](https://sendgrid.com).
   New accounts go through an anti-spam review before they're allowed to
   send — this can take a few hours, so kick this off first if you're in a
   hurry.
2. **Settings → Sender Authentication → Authenticate Your Domain**, add
   `thinkhawks.com` (or a subdomain like `crm.thinkhawks.com`), and add the
   DNS records it gives you wherever your domain is hosted. Wait for it to
   verify — SendGrid won't send from an address on an unverified domain.
3. **Settings → API Keys → Create API Key** (Full Access, or at minimum Mail
   Send + Event Webhook Settings) → paste into `SENDGRID_API_KEY`.
4. Set `SENDGRID_FROM_EMAIL` to an address on that verified domain, e.g.
   `crm@thinkhawks.com`.
5. **Settings → Mail Send → Event Webhook**, endpoint URL:
   `https://<your-deployed-domain>/api/webhooks/sendgrid`, HTTP POST, and
   subscribe to **Processed, Delivered, Opened, Clicked, Bounced, Dropped,
   Spam Report**. `Clicked` powers click-through tracking on
   `/dashboard/campaigns`, so don't skip it.
6. On that same Event Webhook page, turn on **Signed Event Webhook
   Requests** and copy the **Verification Key** it shows you into
   `SENDGRID_WEBHOOK_PUBLIC_KEY` — this is what proves incoming webhook calls
   really came from SendGrid and not someone spoofing "opened" events.
7. Still on **Settings → Mail Send → Tracking**, make sure **Open Tracking**
   and **Click Tracking** are both on — SendGrid rewrites links and embeds a
   tracking pixel per-send, which is what triggers the events above.

Once this is set up, `/dashboard/templates` and `/dashboard/campaigns` work:
templates are reusable subject/body pairs (supports `{{first_name}}`,
`{{full_name}}`, `{{company}}` tokens), and campaigns bulk-send a template
or one-off copy to every contact with an email — or just the ones with a
given tag — then track sent/delivered/opened/clicked/bounced per recipient.

### Two-way inbox (`/dashboard/email`) — receiving mail, not just sending it

The setup above only covers outbound mail. To have replies land in
`/dashboard/email` instead of your regular mailbox, you need SendGrid's
**Inbound Parse**, which requires a receiving domain/subdomain of its own:

1. Make up a long random string (`openssl rand -hex 24`) and set it as
   `SENDGRID_INBOUND_TOKEN` — Inbound Parse doesn't sign its requests the way
   the Event Webhook does, so this app gates that endpoint with a token in
   the URL instead, the same way it does for the Telnyx webhooks below.
2. **Settings → Inbound Parse → Add Host & URL**. Use a subdomain you're OK
   routing entirely through SendGrid for receiving, e.g.
   `inbound.thinkhawks.com` (don't reuse your sending domain's MX records —
   sending and receiving need separate DNS setups). Add the **MX record**
   SendGrid gives you for that subdomain wherever your domain is hosted.
3. Destination URL:
   `https://<your-deployed-domain>/api/webhooks/sendgrid/inbound?token=<SENDGRID_INBOUND_TOKEN>`.
   Leave "POST the raw, full MIME message" unchecked — the app expects the
   parsed `from`/`to`/`subject`/`text`/`html` fields SendGrid sends by
   default.
4. Have people email `anything@inbound.thinkhawks.com` (or set up mail
   forwarding from your real support address to it) to test.

## 3. Telnyx (calling, call recording, SMS)

Calling runs entirely in the browser — a real softphone using Telnyx's
WebRTC SDK. Clicking "Call" streams audio straight to your laptop's
mic/speakers; no phone ever rings. Inbound calls work the same way in
reverse: anyone with a dashboard tab open gets the incoming call in-browser.

1. **API Keys & Tokens** (top-right account menu in the Telnyx portal) →
   create a key if you don't already have one → `TELNYX_API_KEY`.
2. **Voice → SIP Connections → Create Credential Connection** (this is the
   WebRTC-capable connection type — not a Call Control Application):
   - Give it any name, e.g. "Think Hawks CRM Softphone".
   - Enable **WebRTC** on the connection (there's a toggle/section for it).
   - **Webhook URL** (same field Call Control Applications use):
     `https://<your-deployed-domain>/api/webhooks/telnyx/voice?token=<TELNYX_WEBHOOK_TOKEN>`
     — make up `TELNYX_WEBHOOK_TOKEN` yourself first (e.g. `openssl rand -hex 24`)
     and use the same value for both this URL and the env var. Method: POST,
     format: JSON (the default). This is what logs calls, marks them
     answered/completed, and starts recording.
3. Copy that connection's **ID** (shown at the top of its settings page) →
   `TELNYX_WEBRTC_CONNECTION_ID`. The app mints a brand-new Telephony
   Credential under this connection for every browser dialer session (see
   `createSessionCredential` in `src/lib/telnyx.ts`) rather than sharing one
   static credential — Telnyx only allows one active registration per
   credential, so a shared one gets silently evicted the moment a second tab
   or agent connects. Nothing to create by hand here.
4. **Numbers → Buy Numbers** — pick a number with Voice + SMS capability
   (Local is fine; a US local number needs A2P 10DLC registration before it
   can send meaningful SMS volume — a toll-free number skips that in favor of
   toll-free verification instead, worth deciding up front).
5. **Numbers → My Numbers → your number → Voice Settings**: set
   **Connection/App** to the Credential Connection from step 2. This is what
   routes both outbound *and inbound* calls to whichever dashboard tabs are
   currently connected as softphones.
6. Put the number itself (E.164, e.g. `+15551234567`) into `TELNYX_PHONE_NUMBER`
   — this is the caller ID shown when your team calls out.
7. **Messaging → Messaging Profiles → Create profile** (or reuse one):
   - **Inbound settings → Webhook URL**:
     `https://<your-deployed-domain>/api/webhooks/telnyx/messaging?token=<TELNYX_WEBHOOK_TOKEN>`
   - Under the profile's **Numbers** tab, add your Telnyx number so it can
     send/receive SMS through this profile.
8. Deploy the app first (see below) so you have a real HTTPS URL, then set
   `NEXT_PUBLIC_BASE_URL` to that URL and redeploy, then go back and fill in
   the two webhook URLs above with the real domain instead of a placeholder.
   SMS won't work on `localhost` — Telnyx's servers need to reach your
   webhook URLs over the public internet. Calling itself works fine on
   `localhost` (the browser talks to Telnyx directly over WebRTC), but a call
   won't be logged/recorded correctly until the voice webhook is reachable
   too, so test both together once deployed (or via an `ngrok` tunnel).

Every teammate needs a dashboard tab open (any page under `/dashboard`) and
to grant the browser mic permission the first time — the softphone connects
in the background as soon as the dashboard loads, not just when the dial pad
is open, so inbound calls ring even if no one has clicked into the dialer.

WhatsApp isn't wired up in this pass — it needs its own Meta Business
verification through Telnyx and can be added later as a separate piece of
work.

## 3.5 Calendar / meeting booking

No new service or env vars needed — this reuses the SendGrid setup from step 2.
There's one manual step:

1. Open Supabase **SQL Editor → New query**, paste the contents of
   [`supabase/schema.sql`](./supabase/schema.sql) again, and run it. It's
   idempotent, so this is safe on a project that already has the other
   tables — it just adds the new `meetings` table and lets `activities` rows
   have `type = 'meeting'`.
2. That's it. `/dashboard/calendar` now works: book a meeting for any
   contact (title, time, duration, optional location/video link/notes) and
   the contact is automatically emailed a branded confirmation through
   SendGrid. Rescheduling or canceling a meeting emails an update too. Booked
   meetings also show up on the contact's timeline and as a "Meetings today"
   stat on the dashboard overview.
3. If a contact has no email on file, the meeting still gets created — it
   just skips the confirmation email (and says so in the booking dialog).

## 4. Deploying

Deploying to Hostinger (Business plan)? See [DEPLOY-HOSTINGER.md](./DEPLOY-HOSTINGER.md)
for the exact hPanel steps.

Otherwise, any Next.js host works (Vercel is the path of least resistance
since this was scaffolded with `create-next-app`). Set every variable from
`.env.example` in your host's environment variable settings, then deploy.
After the first deploy, go back and fill in `NEXT_PUBLIC_BASE_URL` with the
real deployed URL and redeploy — Telnyx and SendGrid both need it to be correct.

## 5. Local development

Copy `.env.example` to `.env.local` and fill in whatever you have so far.
Anything left blank just disables that one feature gracefully (you'll see a
clear error if you try to use it) — the rest of the app still works. Note
that calling and SMS specifically need `NEXT_PUBLIC_BASE_URL` to be a public
HTTPS URL, so those two won't work purely on `localhost` — use a tunnel tool
(e.g. `ngrok http 3010`) and set `NEXT_PUBLIC_BASE_URL` to the tunnel URL if
you want to test them before deploying.

```bash
npm install
npm run dev
```
