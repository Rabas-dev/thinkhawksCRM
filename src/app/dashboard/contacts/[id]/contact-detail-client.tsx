"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Phone,
  Mail,
  Send,
  StickyNote,
  Trash2,
  PhoneIncoming,
  PhoneOutgoing,
  CalendarClock,
  CalendarPlus,
  Check,
  X as XIcon,
  Search,
  Building2,
  MapPin,
  Link as LinkIcon,
  Ban,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Card, Badge } from "@/components/ui/card";
import { cn, initials, formatDuration } from "@/lib/utils";
import { useDialer } from "@/lib/dialer-context";
import { MeetingDialog } from "@/components/meeting-dialog";
import type {
  Contact,
  Activity,
  Call,
  Message,
  MessageChannel,
  Email,
  EmailEvent,
  PipelineStage,
  Task,
  Meeting,
} from "@/lib/types";
import { format, formatDistanceToNow } from "date-fns";

const STAGE_LABELS: Record<PipelineStage, string> = {
  new: "New Lead",
  contacted: "Contacted",
  qualified: "Qualified",
  proposal: "Proposal",
  won: "Won",
  lost: "Lost",
};

type ContactRow = Pick<Contact, "id" | "full_name" | "email" | "phone" | "company">;

type Detail = {
  contact: Contact;
  activities: Activity[];
  calls: Call[];
  messages: Message[];
  emailEvents: EmailEvent[];
  emails: Email[];
  tasks: Task[];
  meetings: Meeting[];
};

type TimelineItem =
  | { kind: "call"; id: string; created_at: string; call: Call }
  | { kind: "message"; id: string; created_at: string; message: Message }
  | { kind: "email"; id: string; created_at: string; email: Email; events: EmailEvent[] };

const STATUS_TONE: Record<string, "muted" | "success" | "primary" | "danger" | "warning"> = {
  queued: "muted",
  sent: "primary",
  delivered: "primary",
  opened: "success",
  clicked: "success",
  received: "muted",
  bounced: "danger",
  complained: "danger",
  failed: "danger",
};

export function ContactDetailClient({ contacts, detail }: { contacts: ContactRow[]; detail: Detail }) {
  const router = useRouter();
  const { openDialer } = useDialer();

  const [q, setQ] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [stage, setStage] = useState<PipelineStage>(detail.contact.pipeline_stage);
  const [tasks, setTasks] = useState<Task[]>(detail.tasks);
  const [followUpTitle, setFollowUpTitle] = useState("Follow up");
  const [followUpDate, setFollowUpDate] = useState("");
  const [addingFollowUp, setAddingFollowUp] = useState(false);
  const [meetingDialogOpen, setMeetingDialogOpen] = useState(false);

  const [channel, setChannel] = useState<"email" | MessageChannel>(detail.contact.phone ? "sms" : "email");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const { contact, activities, calls, messages, emailEvents, emails, meetings } = detail;

  const timeline = useMemo<TimelineItem[]>(() => {
    const items: TimelineItem[] = [
      ...calls.map((c): TimelineItem => ({ kind: "call", id: c.id, created_at: c.created_at, call: c })),
      ...messages.map((m): TimelineItem => ({ kind: "message", id: m.id, created_at: m.created_at, message: m })),
      ...emails.map((e): TimelineItem => ({
        kind: "email",
        id: e.id,
        created_at: e.created_at,
        email: e,
        events: e.resend_email_id ? emailEvents.filter((ev) => ev.resend_email_id === e.resend_email_id) : [],
      })),
    ];
    return items.sort((a, b) => a.created_at.localeCompare(b.created_at));
  }, [calls, messages, emails, emailEvents]);

  const filteredContacts = contacts.filter((c) => {
    if (!q) return true;
    const s = q.toLowerCase();
    return (
      c.full_name.toLowerCase().includes(s) ||
      c.company?.toLowerCase().includes(s) ||
      c.email?.toLowerCase().includes(s) ||
      c.phone?.toLowerCase().includes(s)
    );
  });

  function refresh() {
    router.refresh();
  }

  async function addFollowUp(e: React.FormEvent) {
    e.preventDefault();
    if (!followUpDate) return;
    setAddingFollowUp(true);
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contact_id: contact.id,
        title: followUpTitle || "Follow up",
        due_at: new Date(followUpDate).toISOString(),
      }),
    });
    const data = await res.json();
    if (data.task) {
      setTasks((prev) => [...prev, data.task].sort((a, b) => a.due_at.localeCompare(b.due_at)));
      setFollowUpDate("");
      setFollowUpTitle("Follow up");
    }
    setAddingFollowUp(false);
  }

  async function updateTask(id: string, status: "done" | "skipped") {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
  }

  async function changeStage(next: PipelineStage) {
    setStage(next);
    await fetch(`/api/contacts/${contact.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pipeline_stage: next }),
    });
    refresh();
  }

  async function addNote(e: React.FormEvent) {
    e.preventDefault();
    if (!noteBody.trim()) return;
    setSavingNote(true);
    await fetch("/api/activities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contact_id: contact.id, title: "Note added", body: noteBody }),
    });
    setNoteBody("");
    setSavingNote(false);
    refresh();
  }

  async function cancelMeeting(id: string) {
    if (!confirm("Cancel this meeting? The contact will be emailed.")) return;
    await fetch(`/api/meetings/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "canceled" }),
    });
    refresh();
  }

  async function deleteContact() {
    if (!confirm("Delete this contact? This can't be undone.")) return;
    await fetch(`/api/contacts/${contact.id}`, { method: "DELETE" });
    router.push("/dashboard/contacts");
  }

  const selectContact = useCallback(
    (id: string) => {
      router.push(`/dashboard/contacts/${id}`);
    },
    [router],
  );

  async function sendFromComposer(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    if (channel === "email" && !subject.trim()) return;
    setSending(true);
    setSendError(null);

    const res =
      channel === "email"
        ? await fetch("/api/email/send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contact_id: contact.id, subject, body }),
          })
        : await fetch("/api/messages/send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contact_id: contact.id, body, channel }),
          });

    setSending(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setSendError(data.error || "Couldn't send that.");
      return;
    }
    setBody("");
    if (channel === "email") setSubject("");
    refresh();
  }

  const lastContactedActivity = activities.find((a) => a.type === "call" || a.type === "email" || a.type === "message");
  const nextTask = tasks[0] ?? null;

  return (
    <div className="flex h-screen">
      {/* Left: contacts list */}
      <div className="flex w-72 shrink-0 flex-col border-r border-border bg-white">
        <div className="border-b border-border px-4 py-4">
          <h1 className="text-lg font-semibold text-secondary">Contacts</h1>
          <div className="relative mt-3">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="pl-8" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filteredContacts.map((c) => (
            <button
              key={c.id}
              onClick={() => selectContact(c.id)}
              className={cn(
                "flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left cursor-pointer",
                c.id === contact.id ? "bg-primary/10" : "hover:bg-section",
              )}
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary-dark">
                {initials(c.full_name)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-[#222]">{c.full_name}</p>
                <p className="truncate text-xs text-muted">{c.email || c.phone || "—"}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Middle: unified thread */}
      <div className="flex flex-1 flex-col bg-section">
        <div className="flex items-center justify-between border-b border-border bg-white px-5 py-4">
          <div>
            <p className="text-sm font-medium text-secondary">{contact.full_name}</p>
            <p className="text-xs text-muted">{contact.email || contact.phone || "—"}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!contact.phone}
              onClick={() => contact.phone && openDialer(contact.phone, contact.id, contact.full_name)}
            >
              <Phone size={14} /> Call
            </Button>
            <Button variant="outline" size="sm" disabled={!contact.email} onClick={() => setChannel("email")}>
              <Mail size={14} /> Email
            </Button>
            <Button variant="outline" size="sm" onClick={() => setMeetingDialogOpen(true)}>
              <CalendarPlus size={14} /> Book meeting
            </Button>
          </div>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-5">
          {timeline.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">No conversation yet — reach out below.</p>
          ) : (
            timeline.map((item) => <TimelineRow key={`${item.kind}-${item.id}`} item={item} contact={contact} />)
          )}
        </div>

        <form onSubmit={sendFromComposer} className="space-y-2 border-t border-border bg-white p-4">
          <div className="flex gap-1.5">
            {(["email", "sms", "whatsapp"] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setChannel(c)}
                disabled={c === "email" ? !contact.email : !contact.phone}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium capitalize cursor-pointer disabled:cursor-not-allowed disabled:opacity-40",
                  channel === c ? "bg-primary text-white" : "bg-black/5 text-secondary",
                )}
              >
                {c}
              </button>
            ))}
          </div>
          {channel === "email" && (
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject"
              className="h-9 w-full rounded-lg border border-border bg-white px-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          )}
          <div className="flex gap-2">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={channel === "email" ? "Write an email…" : `Write a ${channel} message…`}
              rows={3}
              className="flex-1 rounded-lg border border-border bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            <Button type="submit" size="icon" disabled={sending} className="self-end">
              <Send size={15} />
            </Button>
          </div>
          {sendError && <p className="text-sm text-danger">{sendError}</p>}
        </form>
      </div>

      {/* Right: details panel */}
      <div className="w-80 shrink-0 space-y-4 overflow-y-auto border-l border-border bg-white p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary-dark">
              {initials(contact.full_name)}
            </div>
            <div>
              <p className="text-sm font-semibold text-secondary">{contact.full_name}</p>
              {contact.company && (
                <p className="flex items-center gap-1 text-xs text-muted">
                  <Building2 size={12} /> {contact.company}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={deleteContact}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-danger/10 hover:text-danger cursor-pointer"
          >
            <Trash2 size={15} />
          </button>
        </div>

        <div>
          <Label>Stage</Label>
          <select
            value={stage}
            onChange={(e) => changeStage(e.target.value as PipelineStage)}
            className="h-9 w-full rounded-lg border border-border bg-white px-3 text-sm font-medium text-secondary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            {Object.entries(STAGE_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <Card className="space-y-3 p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Contact info</h3>
          <Field label="Email" value={contact.email} />
          <Field label="Phone" value={contact.phone} />
          <Field label="Company" value={contact.company} />
          <div>
            <p className="text-xs text-muted">Last contacted</p>
            <p className="text-sm text-[#222]">
              {lastContactedActivity
                ? formatDistanceToNow(new Date(lastContactedActivity.created_at), { addSuffix: true })
                : "—"}
            </p>
          </div>
          {contact.tags?.length > 0 && (
            <div>
              <p className="mb-1 text-xs text-muted">Tags</p>
              <div className="flex flex-wrap gap-1">
                {contact.tags.map((t) => (
                  <Badge key={t} tone="primary">
                    {t}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </Card>

        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Meetings</h3>
            <button
              onClick={() => setMeetingDialogOpen(true)}
              className="text-muted hover:text-primary-dark cursor-pointer"
              title="Book a meeting"
            >
              <CalendarPlus size={14} />
            </button>
          </div>
          {meetings.length === 0 ? (
            <p className="text-sm text-muted">No meetings scheduled.</p>
          ) : (
            <div className="space-y-2">
              {meetings.map((m) => (
                <div key={m.id} className="rounded-lg bg-section px-3 py-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-[#222]">{m.title}</p>
                      <p className="text-xs text-muted">{format(new Date(m.start_at), "MMM d, h:mm a")}</p>
                      {m.location && (
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted">
                          <MapPin size={11} /> {m.location}
                        </p>
                      )}
                      {m.meeting_link && (
                        <a
                          href={m.meeting_link}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-0.5 flex items-center gap-1 text-xs text-primary-dark hover:underline"
                        >
                          <LinkIcon size={11} /> Join link
                        </a>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Badge tone={m.status === "scheduled" ? "primary" : m.status === "completed" ? "success" : "muted"}>
                        {m.status.replace("_", " ")}
                      </Badge>
                      {m.status === "scheduled" && (
                        <button
                          onClick={() => cancelMeeting(m.id)}
                          className="flex h-6 w-6 items-center justify-center rounded-lg text-muted hover:bg-danger/10 hover:text-danger cursor-pointer"
                          title="Cancel meeting"
                        >
                          <Ban size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">Follow-ups</h3>
          {tasks.length > 0 && (
            <div className="mb-3 space-y-2">
              {tasks.map((t) => (
                <div key={t.id} className="flex items-center justify-between rounded-lg bg-section px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-[#222]">{t.title}</p>
                    <p className="text-xs text-muted">{format(new Date(t.due_at), "MMM d, h:mm a")}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      onClick={() => updateTask(t.id, "done")}
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-success hover:bg-success/10 cursor-pointer"
                      title="Mark done"
                    >
                      <Check size={14} />
                    </button>
                    <button
                      onClick={() => updateTask(t.id, "skipped")}
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-muted hover:bg-black/5 cursor-pointer"
                      title="Skip"
                    >
                      <XIcon size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {!nextTask && tasks.length === 0 && <p className="mb-3 text-sm text-muted">No open follow-ups.</p>}
          <form onSubmit={addFollowUp} className="space-y-2">
            <Input value={followUpTitle} onChange={(e) => setFollowUpTitle(e.target.value)} placeholder="Title" />
            <Input type="datetime-local" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} />
            <Button type="submit" size="sm" disabled={addingFollowUp || !followUpDate} className="w-full justify-center">
              <CalendarClock size={14} /> Add follow-up
            </Button>
          </form>
        </Card>

        <Card className="p-4">
          <form onSubmit={addNote} className="space-y-2">
            <Label>Add a note</Label>
            <Textarea
              rows={2}
              value={noteBody}
              onChange={(e) => setNoteBody(e.target.value)}
              placeholder="Log a call outcome, meeting notes, next steps…"
            />
            <Button type="submit" size="sm" disabled={savingNote}>
              <StickyNote size={14} /> Save note
            </Button>
          </form>
          {contact.notes && (
            <div className="mt-3 border-t border-border pt-3">
              <p className="mb-1 text-xs text-muted">Notes</p>
              <p className="text-sm text-[#222]">{contact.notes}</p>
            </div>
          )}
        </Card>
      </div>

      <MeetingDialog
        open={meetingDialogOpen}
        onClose={() => setMeetingDialogOpen(false)}
        contact={{ id: contact.id, full_name: contact.full_name, email: contact.email, company: contact.company }}
        onBooked={refresh}
      />
    </div>
  );
}

function TimelineRow({ item, contact }: { item: TimelineItem; contact: Contact }) {
  if (item.kind === "call") {
    const c = item.call;
    return (
      <div className="mx-auto max-w-[85%] rounded-xl border border-border bg-white p-3">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-sm text-[#222]">
            {c.direction === "outbound" ? (
              <PhoneOutgoing size={13} className="text-primary-dark" />
            ) : (
              <PhoneIncoming size={13} className="text-primary-dark" />
            )}
            {c.direction === "outbound" ? "Outbound call" : "Inbound call"} · {formatDuration(c.duration_seconds)}
          </span>
          <Badge tone={c.status === "completed" ? "success" : "muted"}>{c.status}</Badge>
        </div>
        {c.recording_url && <audio controls src={`/api/calls/${c.id}/recording`} className="mt-2 h-8 w-full" />}
        <p className="mt-1.5 text-[10px] text-muted">{format(new Date(c.created_at), "MMM d, h:mm a")}</p>
      </div>
    );
  }

  if (item.kind === "message") {
    const m = item.message;
    return (
      <div className={cn("flex", m.direction === "outbound" ? "justify-end" : "justify-start")}>
        <div
          className={cn(
            "max-w-[75%] rounded-xl px-3 py-2 text-sm",
            m.direction === "outbound" ? "bg-primary text-white" : "border border-border bg-white text-[#222]",
          )}
        >
          <p className="whitespace-pre-wrap">{m.body}</p>
          <p className={cn("mt-1 text-[10px]", m.direction === "outbound" ? "text-white/70" : "text-muted")}>
            {m.channel} · {format(new Date(m.created_at), "MMM d, h:mm a")} · {m.status}
          </p>
        </div>
      </div>
    );
  }

  const e = item.email;
  return (
    <div
      className={cn(
        "max-w-[80%] rounded-xl border border-border bg-white p-3",
        e.direction === "outbound" ? "ml-auto" : "mr-auto",
      )}
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-[#222]">{e.subject || "(no subject)"}</p>
        {e.direction === "inbound" && <Badge tone="muted">received</Badge>}
      </div>
      <p className="whitespace-pre-wrap text-sm text-[#222]">{e.text_body}</p>
      <p className="mt-1.5 text-[10px] text-muted">
        {e.direction === "outbound" ? "You" : contact.full_name} · {format(new Date(e.created_at), "MMM d, h:mm a")}
      </p>
      {e.direction === "outbound" && item.events.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {item.events.map((ev) => (
            <Badge key={ev.id} tone={STATUS_TONE[ev.status] ?? "muted"}>
              {ev.status}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <p className="text-sm text-[#222]">{value || "—"}</p>
    </div>
  );
}
