-- Think Hawks CRM — Supabase schema.
-- Run this once in the Supabase SQL editor for your project (Project > SQL Editor > New query).

create extension if not exists "pgcrypto";

-- ─── Contacts ──────────────────────────────────────────────────────────────

create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text,
  phone text,
  company text,
  tags text[] not null default '{}',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists contacts_created_at_idx on contacts (created_at desc);
create index if not exists contacts_phone_idx on contacts (phone);
create index if not exists contacts_email_idx on contacts (email);

-- ─── Unified activity timeline (notes, and rollups of email/call/message) ──

create table if not exists activities (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references contacts (id) on delete cascade,
  type text not null check (type in ('note', 'email', 'call', 'message')),
  title text not null,
  body text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists activities_contact_idx on activities (contact_id, created_at desc);

-- ─── Email automation (Resend) ──────────────────────────────────────────────

create table if not exists email_events (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references contacts (id) on delete set null,
  resend_email_id text,
  subject text,
  status text not null check (status in ('sent', 'delivered', 'opened', 'bounced', 'complained', 'failed')),
  created_at timestamptz not null default now()
);

create index if not exists email_events_contact_idx on email_events (contact_id);
create index if not exists email_events_resend_id_idx on email_events (resend_email_id);

-- ─── Calling + recording (Telnyx Call Control) ──────────────────────────────

create table if not exists calls (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references contacts (id) on delete set null,
  telnyx_call_control_id text,
  telnyx_call_session_id text unique,
  direction text not null default 'outbound' check (direction in ('outbound', 'inbound')),
  status text not null default 'initiated',
  agent_phone text,
  contact_phone text,
  duration_seconds int,
  started_at timestamptz,
  recording_url text,
  recording_id text,
  created_at timestamptz not null default now()
);

-- Twilio → Telnyx migration for a project that already has the old columns
-- (create table if not exists is a no-op on an existing table, so this is
-- what actually moves data on a re-run against a live database).
do $$
begin
  if exists (select 1 from information_schema.columns where table_name = 'calls' and column_name = 'twilio_call_sid') then
    alter table calls drop constraint if exists calls_twilio_call_sid_key;
    alter table calls rename column twilio_call_sid to telnyx_call_control_id;
  end if;
  if exists (select 1 from information_schema.columns where table_name = 'calls' and column_name = 'recording_sid') then
    alter table calls rename column recording_sid to recording_id;
  end if;
end $$;

alter table calls add column if not exists telnyx_call_session_id text;
alter table calls add column if not exists started_at timestamptz;
-- Set on an inbound call while its bridge leg (dialed to the connected
-- browser session) is ringing but not yet answered; cleared once bridged.
-- Lets the call.answered handler recognize "this event is for the bridge
-- leg, not the primary call" and bridge at exactly the right moment
-- (bridge only works on an already-answered leg — see dialSipLeg's comment
-- in src/lib/telnyx.ts).
alter table calls add column if not exists bridge_leg_call_control_id text;

drop index if exists calls_sid_idx;
create index if not exists calls_contact_idx on calls (contact_id, created_at desc);
create unique index if not exists calls_session_idx on calls (telnyx_call_session_id);

-- Tracks which browser dialer sessions are currently connected to Telnyx, so
-- the inbound voice webhook (Call Control mode, since it has a webhook
-- attached) knows which SIP address to transfer an inbound call to — Telnyx
-- only auto-rings registered WebRTC clients on connections with *no*
-- webhook; once one's attached (needed for call logging/recording), ringing
-- has to be done explicitly. Row is created on dialer connect
-- (GET /api/calls/token) and removed on disconnect (DELETE /api/calls/token).
create table if not exists dialer_sessions (
  id uuid primary key default gen_random_uuid(),
  credential_id text not null unique,
  sip_username text not null,
  user_email text,
  created_at timestamptz not null default now()
);

alter table dialer_sessions enable row level security;
drop policy if exists "authenticated full access" on dialer_sessions;
create policy "authenticated full access" on dialer_sessions
  for all to authenticated using (true) with check (true);

-- ─── Messaging (Telnyx SMS) ──────────────────────────────────────────────────
-- WhatsApp isn't wired up in this pass — it needs its own Meta Business
-- verification through Telnyx and can be added later as a separate piece of
-- work. The 'whatsapp' channel value is kept in the check constraint so
-- historical rows (from before this migration) stay valid.

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references contacts (id) on delete set null,
  telnyx_message_id text unique,
  direction text not null check (direction in ('outbound', 'inbound')),
  channel text not null default 'sms' check (channel in ('sms', 'whatsapp')),
  body text,
  status text not null default 'queued',
  created_at timestamptz not null default now()
);

do $$
begin
  if exists (select 1 from information_schema.columns where table_name = 'messages' and column_name = 'twilio_message_sid') then
    alter table messages drop constraint if exists messages_twilio_message_sid_key;
    alter table messages rename column twilio_message_sid to telnyx_message_id;
    alter table messages add constraint messages_telnyx_message_id_key unique (telnyx_message_id);
  end if;
end $$;

drop index if exists messages_sid_idx;
create index if not exists messages_contact_idx on messages (contact_id, created_at);
create index if not exists messages_sid_idx on messages (telnyx_message_id);

-- ─── Email marketing (templates + campaigns) ────────────────────────────────

create table if not exists email_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  subject text not null,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  subject text not null,
  body text not null,
  template_id uuid references email_templates (id) on delete set null,
  segment_tag text,
  status text not null default 'draft' check (status in ('draft', 'sending', 'sent', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz
);

create table if not exists campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns (id) on delete cascade,
  contact_id uuid not null references contacts (id) on delete cascade,
  resend_email_id text,
  status text not null default 'queued' check (
    status in ('queued', 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'complained', 'failed')
  ),
  opened_at timestamptz,
  clicked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists campaign_recipients_campaign_idx on campaign_recipients (campaign_id);
create index if not exists campaign_recipients_resend_id_idx on campaign_recipients (resend_email_id);

-- email_events gains a link to the campaign that produced it, and a wider
-- status list (queued/clicked) to match campaign_recipients.
alter table email_events add column if not exists campaign_id uuid references campaigns (id) on delete set null;

alter table email_events drop constraint if exists email_events_status_check;
alter table email_events add constraint email_events_status_check
  check (status in ('queued', 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'complained', 'failed'));

-- ─── Call notes / disposition ───────────────────────────────────────────────

alter table calls add column if not exists notes text;
alter table calls add column if not exists disposition text;

-- ─── Two-way email inbox ─────────────────────────────────────────────────────
-- Full message content (both directions), separate from email_events (which
-- stays a lightweight status ledger for campaign analytics). Threaded per
-- contact, same model as `messages` already uses for SMS/WhatsApp.

create table if not exists emails (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references contacts (id) on delete set null,
  campaign_id uuid references campaigns (id) on delete set null,
  direction text not null check (direction in ('outbound', 'inbound')),
  resend_email_id text,
  message_id text,
  in_reply_to text,
  from_address text,
  to_address text,
  subject text,
  text_body text,
  html_body text,
  status text not null default 'queued' check (
    status in ('queued', 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'complained', 'failed', 'received')
  ),
  created_at timestamptz not null default now()
);

create index if not exists emails_contact_idx on emails (contact_id, created_at);
create index if not exists emails_resend_id_idx on emails (resend_email_id);

-- ─── Lead pipeline ───────────────────────────────────────────────────────────

alter table contacts add column if not exists pipeline_stage text not null default 'new';
alter table contacts drop constraint if exists contacts_pipeline_stage_check;
alter table contacts add constraint contacts_pipeline_stage_check
  check (pipeline_stage in ('new', 'contacted', 'qualified', 'proposal', 'won', 'lost'));
alter table contacts add column if not exists pipeline_updated_at timestamptz not null default now();

-- ─── Follow-ups / tasks ──────────────────────────────────────────────────────

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references contacts (id) on delete cascade,
  title text not null,
  due_at timestamptz not null,
  status text not null default 'open' check (status in ('open', 'done', 'skipped')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists tasks_contact_idx on tasks (contact_id);
create index if not exists tasks_status_due_idx on tasks (status, due_at);

alter table tasks enable row level security;

drop policy if exists "authenticated full access" on tasks;
create policy "authenticated full access" on tasks
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ─── Meetings (calendar / booking) ───────────────────────────────────────────

create table if not exists meetings (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references contacts (id) on delete cascade,
  title text not null,
  description text,
  location text,
  meeting_link text,
  start_at timestamptz not null,
  end_at timestamptz not null,
  status text not null default 'scheduled' check (
    status in ('scheduled', 'completed', 'canceled', 'no_show')
  ),
  confirmation_email_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists meetings_contact_idx on meetings (contact_id, start_at);
create index if not exists meetings_start_at_idx on meetings (start_at);

alter table meetings enable row level security;

drop policy if exists "authenticated full access" on meetings;
create policy "authenticated full access" on meetings
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Meetings show up in the unified contact timeline alongside notes/emails/calls/messages.
alter table activities drop constraint if exists activities_type_check;
alter table activities add constraint activities_type_check
  check (type in ('note', 'email', 'call', 'message', 'meeting'));

-- ─── updated_at triggers ─────────────────────────────────────────────────────

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists contacts_set_updated_at on contacts;
create trigger contacts_set_updated_at
  before update on contacts
  for each row execute function set_updated_at();

drop trigger if exists email_templates_set_updated_at on email_templates;
create trigger email_templates_set_updated_at
  before update on email_templates
  for each row execute function set_updated_at();

drop trigger if exists campaigns_set_updated_at on campaigns;
create trigger campaigns_set_updated_at
  before update on campaigns
  for each row execute function set_updated_at();

drop trigger if exists meetings_set_updated_at on meetings;
create trigger meetings_set_updated_at
  before update on meetings
  for each row execute function set_updated_at();

-- ─── Row Level Security ──────────────────────────────────────────────────────
-- Single-tenant agency tool: any signed-in (authenticated) team member has full
-- access. Webhooks (Telnyx/SendGrid) write through the service-role key, which
-- bypasses RLS entirely, so they don't need their own policy.

alter table contacts enable row level security;
alter table activities enable row level security;
alter table email_events enable row level security;
alter table calls enable row level security;
alter table messages enable row level security;
alter table email_templates enable row level security;
alter table campaigns enable row level security;
alter table campaign_recipients enable row level security;
alter table emails enable row level security;

drop policy if exists "authenticated full access" on contacts;
create policy "authenticated full access" on contacts
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "authenticated full access" on activities;
create policy "authenticated full access" on activities
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "authenticated full access" on email_events;
create policy "authenticated full access" on email_events
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "authenticated full access" on calls;
create policy "authenticated full access" on calls
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "authenticated full access" on messages;
create policy "authenticated full access" on messages
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "authenticated full access" on email_templates;
create policy "authenticated full access" on email_templates
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "authenticated full access" on campaigns;
create policy "authenticated full access" on campaigns
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "authenticated full access" on campaign_recipients;
create policy "authenticated full access" on campaign_recipients
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "authenticated full access" on emails;
create policy "authenticated full access" on emails
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Per-agent preferences (Settings page): display name, default outbound
-- caller ID, and the email signature appended when composing. Scoped to
-- the owning user, unlike the tables above — these are personal, not
-- shared CRM data.
create table if not exists user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  email_signature text,
  default_caller_id text not null default 'main' check (default_caller_id in ('main', 'test')),
  updated_at timestamptz not null default now()
);
alter table user_settings enable row level security;
drop policy if exists "own settings only" on user_settings;
create policy "own settings only" on user_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Attachment filenames sent with an email (informational record only —
-- the files themselves pass straight through to SendGrid at send time and
-- aren't stored, so this isn't re-downloadable from the CRM later).
alter table emails add column if not exists attachments jsonb not null default '[]';
