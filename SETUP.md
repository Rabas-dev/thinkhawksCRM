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

## 2. Twilio SendGrid (email automation — sent/delivered/opened)

Email runs on Twilio's own email product (SendGrid), so it bills through the
same Twilio account as calling/SMS below — one vendor, one bill.

1. From your Twilio Console, go to **Explore Products → Email API (SendGrid)**
   and activate it (or sign up directly at [sendgrid.com](https://sendgrid.com)
   — a SendGrid account created this way links back to Twilio billing). New
   accounts go through an anti-spam review before they're allowed to send —
   this can take a few hours, so kick this off first if you're in a hurry.
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
   the URL instead, the same way it does for the Twilio webhooks below.
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

## 3. Twilio (calling, call recording, SMS/WhatsApp)

There's no fully-free way to call and text real phone numbers — every
provider bills per minute/message. Twilio was picked because it has no
monthly minimum (pure pay-as-you-go), gives free trial credit to start, and
has the best-documented Voice + Recording + Messaging APIs.

1. Create an account at [twilio.com/try-twilio](https://www.twilio.com/try-twilio)
   — you get free trial credit automatically.
2. From the **Console Dashboard**, copy `Account SID` → `TWILIO_ACCOUNT_SID`
   and `Auth Token` → `TWILIO_AUTH_TOKEN`.
3. **Phone Numbers → Buy a number** — pick one with Voice + SMS capability.
   Put it (in `+1...` E.164 format) into `TWILIO_PHONE_NUMBER`.
   - While on a trial account, Twilio can only call/text numbers you've
     verified under **Phone Numbers → Verified Caller IDs**. Once you add a
     few dollars of credit it can reach any number.
4. Make up a long random string yourself (e.g. run
   `openssl rand -hex 24` or use a password generator) and set it as both:
   - `TWILIO_WEBHOOK_TOKEN` in your env vars
   - nothing else needed — the app appends it to every URL it hands Twilio,
     so Twilio's callbacks are rejected unless they carry it.
5. Deploy the app first (see below) so you have a real HTTPS URL, then set
   `NEXT_PUBLIC_BASE_URL` to that URL and redeploy. Calling won't work on
   `localhost` — Twilio's servers need to reach your webhook URLs over the
   public internet.
6. **Phone Numbers → your number → Messaging → "A message comes in"**: set
   the webhook to
   `https://<your-deployed-domain>/api/webhooks/twilio/inbound?token=<TWILIO_WEBHOOK_TOKEN>`,
   method POST. This is what makes inbound SMS replies show up in
   `/dashboard/messages` and auto-create a contact if the sender is new.

   *(Optional) WhatsApp*: **Messaging → Try it out → Send a WhatsApp
   message** to get a WhatsApp-enabled sender (sandbox for testing, or apply
   for a production sender later). Put its number into
   `TWILIO_WHATSAPP_NUMBER` and point its inbound webhook at the same
   `/api/webhooks/twilio/inbound` URL.

7. Calling uses a real in-browser dialer (Twilio Voice JS SDK) — a floating
   dial pad available anywhere in the CRM, not a second phone call. Two more
   things to set up in the Twilio Console:
   - **Account → API keys & tokens → Create API key** (Standard key) → SID
     into `TWILIO_API_KEY_SID`, Secret into `TWILIO_API_KEY_SECRET` (shown
     once — copy it immediately).
   - **Voice → TwiML → TwiML Apps → Create new TwiML App**. Under **Voice
     Configuration**:
     - Request URL:
       `https://<your-deployed-domain>/api/calls/twiml?token=<TWILIO_WEBHOOK_TOKEN>`,
       method POST.
     - Status Callback URL:
       `https://<your-deployed-domain>/api/webhooks/twilio/call-status?token=<TWILIO_WEBHOOK_TOKEN>`,
       method POST.
     Copy the App's SID into `TWILIO_TWIML_APP_SID`.
   - The dialer needs mic permission in the browser tab it's used from, and
     (like SMS) needs `NEXT_PUBLIC_BASE_URL` to be a real deployed HTTPS URL
     — it won't work purely on `localhost`.

8. **Inbound calls** — when a customer calls your Twilio number, it rings
   every teammate's open dialer at once (whoever's online), screen-popping
   the caller's name/company and their last call if there's a match, and
   auto-creating a contact if the number is new. **Phone Numbers → your
   number → Voice Configuration**:
   - "A call comes in": Webhook,
     `https://<your-deployed-domain>/api/calls/incoming?token=<TWILIO_WEBHOOK_TOKEN>`,
     method POST.
   - "Call status changes": Webhook,
     `https://<your-deployed-domain>/api/webhooks/twilio/call-status?token=<TWILIO_WEBHOOK_TOKEN>`,
     method POST. This is a separate field further down the same page — it's
     what marks the call completed/no-answer/missed in the CRM, since Twilio
     assigns this leg's CallSid before our own code ever sees it.
   - Every teammate needs a dashboard tab open (any page under `/dashboard`)
     for their browser to be ringable — the dialer registers itself in the
     background as soon as the dashboard loads, not just when the dial pad
     is open.

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
real deployed URL and redeploy — Twilio needs it to be correct.

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
