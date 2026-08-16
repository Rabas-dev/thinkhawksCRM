# Think Hawks CRM

Internal CRM for Think Hawks — contacts, email automation, calling with
recording, and SMS/WhatsApp messaging in one place.

**Stack:** Next.js (App Router) · TypeScript · Tailwind v4 · Supabase
(Postgres + Auth) · Resend (email) · Twilio (voice + messaging)

## Features

- **Pipeline** — drag-and-drop lead board (`/dashboard/pipeline`), New Lead →
  Contacted → Qualified → Proposal → Won/Lost, so a lead has a home until
  it's closed
- **Contacts** — save leads/clients with tags, notes, and a unified activity
  timeline (`/dashboard/contacts`)
- **Email** (`/dashboard/email`) — a dedicated outreach workspace: every
  contact with an email on one side, their full threaded conversation on the
  other, with per-message Sent/Delivered/Opened/Clicked/Bounced tracking (via
  Resend + Resend Inbound) and a template picker with variable substitution
- **Dialer** (`/dashboard/dialer`) — a dedicated calling workspace: contact
  list, a full-size in-browser dialer (Twilio Voice SDK), and that contact's
  call history with recordings, right next to it. The "Call"/"Email" buttons
  on a contact's page jump straight here with that contact pre-loaded.
- **Email marketing** — reusable templates (`/dashboard/templates`) and bulk
  campaigns to a segment or your whole list (`/dashboard/campaigns`), with
  per-recipient open/click analytics
- **Calling + call recording** — a real in-browser dialer (Twilio Voice SDK)
  available from anywhere in the CRM, with call recording and a
  disposition/notes prompt after each call
- **Messaging** — two-way SMS and WhatsApp per contact, plus a shared inbox
  at `/dashboard/messages`

## First-time setup

Nothing here works until you connect Supabase/Resend/Twilio — **read
[SETUP.md](./SETUP.md) first**, it walks through creating each account and
where every key goes. `/dashboard/settings` shows live status of what's
configured once the app is running.

## Local development

```bash
npm install
cp .env.example .env.local   # then fill in what you have — see SETUP.md
npm run dev
```

## Database schema

[`supabase/schema.sql`](./supabase/schema.sql) — run once in your Supabase
project's SQL Editor (safe to re-run any time you pull an update, it's
idempotent). Defines `contacts` (with a `pipeline_stage`), `activities`,
`calls`, `messages`, `email_events`, `email_templates`, `campaigns`,
`campaign_recipients`, and `emails` (the two-way inbox), with row-level
security scoped to signed-in users.
