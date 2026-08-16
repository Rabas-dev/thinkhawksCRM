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

-- ─── Calling + recording (Twilio Voice) ─────────────────────────────────────

create table if not exists calls (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references contacts (id) on delete set null,
  twilio_call_sid text unique,
  direction text not null default 'outbound' check (direction in ('outbound', 'inbound')),
  status text not null default 'initiated',
  agent_phone text,
  contact_phone text,
  duration_seconds int,
  recording_url text,
  recording_sid text,
  created_at timestamptz not null default now()
);

create index if not exists calls_contact_idx on calls (contact_id, created_at desc);
create index if not exists calls_sid_idx on calls (twilio_call_sid);

-- ─── Messaging (Twilio SMS / WhatsApp) ──────────────────────────────────────

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references contacts (id) on delete set null,
  twilio_message_sid text unique,
  direction text not null check (direction in ('outbound', 'inbound')),
  channel text not null default 'sms' check (channel in ('sms', 'whatsapp')),
  body text,
  status text not null default 'queued',
  created_at timestamptz not null default now()
);

create index if not exists messages_contact_idx on messages (contact_id, created_at);
create index if not exists messages_sid_idx on messages (twilio_message_sid);

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
-- access. Webhooks (Twilio/Resend) write through the service-role key, which
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
