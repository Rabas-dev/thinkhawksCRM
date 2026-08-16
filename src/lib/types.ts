export type PipelineStage = "new" | "contacted" | "qualified" | "proposal" | "won" | "lost";

export type Contact = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  tags: string[];
  notes: string | null;
  pipeline_stage: PipelineStage;
  pipeline_updated_at: string;
  created_at: string;
  updated_at: string;
};

export type ActivityType = "note" | "email" | "call" | "message" | "meeting";

export type Activity = {
  id: string;
  contact_id: string;
  type: ActivityType;
  title: string;
  body: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type EmailStatus =
  | "queued"
  | "sent"
  | "delivered"
  | "opened"
  | "clicked"
  | "bounced"
  | "complained"
  | "failed";

export type EmailEvent = {
  id: string;
  contact_id: string | null;
  campaign_id: string | null;
  resend_email_id: string | null;
  subject: string | null;
  status: EmailStatus;
  created_at: string;
};

export type EmailTemplate = {
  id: string;
  name: string;
  subject: string;
  body: string;
  created_at: string;
  updated_at: string;
};

export type CampaignStatus = "draft" | "sending" | "sent" | "failed";

export type Campaign = {
  id: string;
  name: string;
  subject: string;
  body: string;
  template_id: string | null;
  segment_tag: string | null;
  status: CampaignStatus;
  created_at: string;
  updated_at: string;
  sent_at: string | null;
};

export type CampaignStats = {
  recipients: number;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  failed: number;
};

export type CampaignWithStats = Campaign & { stats: CampaignStats };

export type CampaignRecipient = {
  id: string;
  campaign_id: string;
  contact_id: string;
  resend_email_id: string | null;
  status: EmailStatus;
  opened_at: string | null;
  clicked_at: string | null;
  created_at: string;
};

export type InboxMessageStatus = EmailStatus | "received";

export type Email = {
  id: string;
  contact_id: string | null;
  campaign_id: string | null;
  direction: "outbound" | "inbound";
  resend_email_id: string | null;
  message_id: string | null;
  in_reply_to: string | null;
  from_address: string | null;
  to_address: string | null;
  subject: string | null;
  text_body: string | null;
  html_body: string | null;
  status: InboxMessageStatus;
  created_at: string;
};

export type CallStatus =
  | "initiated"
  | "ringing"
  | "in-progress"
  | "completed"
  | "busy"
  | "failed"
  | "no-answer"
  | "canceled";

export type Call = {
  id: string;
  contact_id: string | null;
  twilio_call_sid: string | null;
  direction: "outbound" | "inbound";
  status: CallStatus;
  agent_phone: string | null;
  contact_phone: string | null;
  duration_seconds: number | null;
  recording_url: string | null;
  recording_sid: string | null;
  notes: string | null;
  disposition: string | null;
  created_at: string;
};

export type TaskStatus = "open" | "done" | "skipped";

export type Task = {
  id: string;
  contact_id: string;
  title: string;
  due_at: string;
  status: TaskStatus;
  created_at: string;
  completed_at: string | null;
};

export type MeetingStatus = "scheduled" | "completed" | "canceled" | "no_show";

export type Meeting = {
  id: string;
  contact_id: string;
  title: string;
  description: string | null;
  location: string | null;
  meeting_link: string | null;
  start_at: string;
  end_at: string;
  status: MeetingStatus;
  confirmation_email_id: string | null;
  created_at: string;
  updated_at: string;
};

export type MessageChannel = "sms" | "whatsapp";

export type MessageStatus =
  | "queued"
  | "sent"
  | "delivered"
  | "read"
  | "failed"
  | "received";

export type Message = {
  id: string;
  contact_id: string | null;
  twilio_message_sid: string | null;
  direction: "outbound" | "inbound";
  channel: MessageChannel;
  body: string | null;
  status: MessageStatus;
  created_at: string;
};
