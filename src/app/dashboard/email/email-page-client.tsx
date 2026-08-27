"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Send, Mail as MailIcon, MailOpen, Search, PenSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Dialog } from "@/components/ui/dialog";
import { AttachmentButton, AttachmentChips, type PendingAttachment } from "@/components/attachment-field";
import { format, formatDistanceToNow } from "date-fns";
import { sendEmail } from "@/lib/send-email";
import { renderTemplate } from "@/lib/templates";
import type { Email, EmailEvent, EmailTemplate, Contact } from "@/lib/types";

type EmailSummary = {
  subject: string | null;
  text_body: string | null;
  direction: "outbound" | "inbound";
  status: string;
  created_at: string;
};

/**
 * A sidebar row is either a saved contact (the normal case) or a "quick"
 * row — a recipient from Compose's "just send, don't save" option, who has
 * no contact record and so is keyed by raw email address instead of an id.
 */
export type SidebarRow =
  | { kind: "contact"; id: string; full_name: string; email: string | null; company: string | null; lastEmail: EmailSummary | null }
  | { kind: "quick"; address: string; lastEmail: EmailSummary | null };

/** One row of the flat "Sent" log — every individual outbound email, not just the latest per contact/address. */
export type SentLogRow = {
  id: string;
  contact_id: string | null;
  recipient: string;
  to_address: string | null;
  subject: string | null;
  snippet: string | null;
  status: string;
  created_at: string;
};

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

const STATUS_ORDER = ["sent", "delivered", "opened", "clicked", "bounced", "complained", "failed"] as const;

/** Quick-glance opened/not-opened indicator for a sent email — GHL-style, separate from the fuller TrackingTimeline below. */
function OpenedIndicator({ status }: { status: string }) {
  const opened = status === "opened" || status === "clicked";
  return (
    <span
      title={opened ? "Opened" : "Not opened yet"}
      className={cn("inline-flex shrink-0 items-center", opened ? "text-success" : "text-muted")}
    >
      {opened ? <MailOpen size={12} /> : <MailIcon size={12} />}
    </span>
  );
}

function TrackingTimeline({ events }: { events: EmailEvent[] }) {
  if (events.length === 0) return null;
  const byStatus = new Map<string, EmailEvent[]>();
  for (const e of events) {
    const list = byStatus.get(e.status) ?? [];
    list.push(e);
    byStatus.set(e.status, list);
  }
  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {STATUS_ORDER.filter((s) => byStatus.has(s)).map((s) => {
        const list = byStatus.get(s)!;
        const first = list[list.length - 1];
        return (
          <Badge key={s} tone={STATUS_TONE[s] ?? "muted"} title={format(new Date(first.created_at), "MMM d, h:mm a")}>
            {s}
            {list.length > 1 ? ` ×${list.length}` : ""}
          </Badge>
        );
      })}
    </div>
  );
}

export function EmailPageClient({ rows: sidebarRows, sentLog }: { rows: SidebarRow[]; sentLog: SentLogRow[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [q, setQ] = useState("");
  const [view, setView] = useState<"threads" | "sent">("threads");
  const [composeOpen, setComposeOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get("contact"));
  const [quickTo, setQuickTo] = useState<string | null>(null);
  const [emails, setEmails] = useState<Email[]>([]);
  const [events, setEvents] = useState<EmailEvent[]>([]);
  const [activeContact, setActiveContact] = useState<Contact | null>(null);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [fromName, setFromName] = useState("");

  useEffect(() => {
    fetch("/api/email/templates")
      .then((r) => r.json())
      .then((d) => setTemplates(d.templates ?? []));
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => setFromName(d.settings?.display_name?.trim() || ""));
  }, []);

  const loadThread = useCallback(async (contactId: string) => {
    const res = await fetch(`/api/contacts/${contactId}`);
    const data = await res.json();
    setEmails(data.emails ?? []);
    setEvents(data.emailEvents ?? []);
    setActiveContact(data.contact ?? null);
    const lastSubject = [...(data.emails ?? [])].reverse()[0]?.subject ?? "";
    setSubject(lastSubject.startsWith("Re: ") ? lastSubject : lastSubject ? `Re: ${lastSubject}` : "");
    setBody("");
    setAttachments([]);
  }, []);

  const loadQuickThread = useCallback(async (email: string) => {
    const res = await fetch(`/api/email/quick-thread?to=${encodeURIComponent(email)}`);
    const data = await res.json();
    setEmails(data.emails ?? []);
    setEvents([]);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads the newly selected contact's thread
    if (selectedId) loadThread(selectedId);
  }, [selectedId, loadThread]);

  function selectContact(id: string) {
    setQuickTo(null);
    setSelectedId(id);
    router.replace(`/dashboard/email?contact=${id}`, { scroll: false });
  }

  /** Opens (or re-opens, from the sidebar) the compose+history pane for a recipient with no saved contact. */
  function openQuickThread(email: string) {
    setSelectedId(null);
    setQuickTo(email);
    setSubject("");
    setBody("");
    setAttachments([]);
    setError(null);
    loadQuickThread(email);
    router.replace("/dashboard/email", { scroll: false });
  }

  function applyTemplate(templateId: string) {
    const t = templates.find((tpl) => tpl.id === templateId);
    if (!t) return;
    setSubject(activeContact ? renderTemplate(t.subject, activeContact) : t.subject);
    setBody(activeContact ? renderTemplate(t.body, activeContact) : t.body);
  }

  async function sendReply(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim() || !subject.trim()) return;
    setSending(true);
    setError(null);
    const result = await sendEmail(
      selectedId
        ? { contact_id: selectedId, subject, body, from_name: fromName, attachments }
        : { to: quickTo, subject, body, from_name: fromName, attachments },
    );
    setSending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    // A warning means the send itself succeeded but saving it to history
    // didn't — surface it rather than silently reloading as if nothing
    // happened (this thread's history is now genuinely missing that email).
    if (result.warning) setError(result.warning);
    if (selectedId) {
      loadThread(selectedId);
    } else if (quickTo) {
      setSubject("");
      setBody("");
      setAttachments([]);
      loadQuickThread(quickTo);
    }
  }

  const filtered = sidebarRows.filter((r) => {
    if (!q) return true;
    const s = q.toLowerCase();
    if (r.kind === "quick") return r.address.toLowerCase().includes(s);
    return r.full_name.toLowerCase().includes(s) || r.company?.toLowerCase().includes(s) || r.email?.toLowerCase().includes(s);
  });

  const filteredSentLog = sentLog.filter((r) => {
    if (!q) return true;
    const s = q.toLowerCase();
    return (
      r.recipient.toLowerCase().includes(s) ||
      r.to_address?.toLowerCase().includes(s) ||
      r.subject?.toLowerCase().includes(s)
    );
  });

  function openSentLogEntry(row: SentLogRow) {
    if (row.contact_id) selectContact(row.contact_id);
    else if (row.to_address) openQuickThread(row.to_address);
  }

  return (
    <div className="flex h-screen">
      <div className="flex w-80 shrink-0 flex-col border-r border-border bg-surface">
        <div className="border-b border-border px-5 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-semibold text-secondary">Email</h1>
            <Button type="button" size="sm" onClick={() => setComposeOpen(true)}>
              <PenSquare size={14} /> Compose
            </Button>
          </div>
          <div className="relative mt-3">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={view === "threads" ? "Search contacts…" : "Search sent emails…"}
              className="pl-8"
            />
          </div>
          <div className="mt-3 flex gap-1 rounded-lg bg-section p-1">
            {(["threads", "sent"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={cn(
                  "flex-1 rounded-md py-1.5 text-xs font-medium capitalize transition cursor-pointer",
                  view === v ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink",
                )}
              >
                {v === "threads" ? "Threads" : "All sent"}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {view === "sent" ? (
            filteredSentLog.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted">No emails sent yet.</p>
            ) : (
              filteredSentLog.map((r) => (
                <button
                  key={r.id}
                  onClick={() => openSentLogEntry(r)}
                  className="flex w-full items-start gap-3 border-b border-border px-4 py-3 text-left cursor-pointer hover:bg-section"
                >
                  <Avatar name={r.recipient} size={36} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium text-ink">{r.recipient}</p>
                      <span className="shrink-0 text-[10px] text-muted" suppressHydrationWarning>
                        {formatDistanceToNow(new Date(r.created_at), { addSuffix: false })}
                      </span>
                    </div>
                    <p className="flex items-center gap-1 truncate text-xs text-muted">
                      <OpenedIndicator status={r.status} />
                      <span className="truncate">{r.subject || "(no subject)"}</span>
                    </p>
                  </div>
                </button>
              ))
            )
          ) : filtered.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted">No emails yet.</p>
          ) : (
            filtered.map((r) => {
              const name = r.kind === "contact" ? r.full_name : r.address;
              const isActive = r.kind === "contact" ? selectedId === r.id : quickTo === r.address;
              return (
                <button
                  key={r.kind === "contact" ? r.id : `quick:${r.address}`}
                  onClick={() => (r.kind === "contact" ? selectContact(r.id) : openQuickThread(r.address))}
                  className={cn(
                    "flex w-full items-start gap-3 border-b border-border px-4 py-3 text-left cursor-pointer",
                    isActive ? "bg-primary/10" : "hover:bg-section",
                  )}
                >
                  <Avatar name={name} size={36} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium text-ink">{name}</p>
                      {r.lastEmail && (
                        <span className="shrink-0 text-[10px] text-muted" suppressHydrationWarning>
                          {formatDistanceToNow(new Date(r.lastEmail.created_at), { addSuffix: false })}
                        </span>
                      )}
                    </div>
                    <p className="flex items-center gap-1 truncate text-xs text-muted">
                      {r.lastEmail?.direction === "outbound" && <OpenedIndicator status={r.lastEmail.status} />}
                      <span className="truncate">
                        {r.lastEmail ? r.lastEmail.subject || "(no subject)" : r.kind === "contact" ? r.email : r.address}
                      </span>
                      {r.kind === "quick" && <span className="shrink-0 text-[10px] text-muted">· not saved</span>}
                    </p>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col bg-section">
        {!selectedId && !quickTo ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-sm text-muted">
            <MailIcon size={22} className="text-muted" />
            Select a contact, or Compose, to start an email
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between border-b border-border bg-surface px-5 py-4">
              <div>
                <p className="text-sm font-medium text-secondary">{selectedId ? activeContact?.full_name : quickTo}</p>
                <p className="text-xs text-muted">
                  {selectedId ? activeContact?.email : "Not saved to Contacts"}
                </p>
              </div>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto p-5">
              {emails.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted">No emails in this thread yet — send the first one below.</p>
              ) : (
                emails.map((e) => {
                  const relatedEvents = e.resend_email_id
                    ? events.filter((ev) => ev.resend_email_id === e.resend_email_id)
                    : [];
                  return (
                    <div
                      key={e.id}
                      className={cn(
                        "max-w-[80%] rounded-xl border border-border bg-surface p-3",
                        e.direction === "outbound" ? "ml-auto" : "mr-auto",
                      )}
                    >
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold text-ink">{e.subject || "(no subject)"}</p>
                        {e.direction === "inbound" && <Badge tone="muted">received</Badge>}
                      </div>
                      <p className="whitespace-pre-wrap text-sm text-ink">{e.text_body}</p>
                      {e.attachments?.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {e.attachments.map((a, i) => (
                            <span
                              key={`${a.filename}-${i}`}
                              className="flex items-center gap-1 rounded-md border border-border bg-section px-2 py-0.5 text-[10px] text-muted"
                            >
                              📎 {a.filename}
                            </span>
                          ))}
                        </div>
                      )}
                      <p className="mt-1.5 flex items-center gap-1 text-[10px] text-muted">
                        {e.direction === "outbound" ? "You" : (selectedId ? activeContact?.full_name : quickTo)} ·{" "}
                        {format(new Date(e.created_at), "MMM d, h:mm a")}
                        {e.direction === "outbound" && <OpenedIndicator status={e.status} />}
                      </p>
                      {e.direction === "outbound" && <TrackingTimeline events={relatedEvents} />}
                    </div>
                  );
                })
              )}
            </div>

            <form onSubmit={sendReply} className="space-y-2 border-t border-border bg-surface p-4">
              {templates.length > 0 && (
                <select
                  onChange={(ev) => applyTemplate(ev.target.value)}
                  defaultValue=""
                  className="h-9 w-full rounded-lg border border-border bg-surface px-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                >
                  <option value="">Use a template…</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              )}
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Subject"
                className="h-9 w-full rounded-lg border border-border bg-surface px-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              <input
                value={fromName}
                onChange={(e) => setFromName(e.target.value)}
                placeholder="Show as sender (your name)"
                maxLength={100}
                className="h-9 w-full rounded-lg border border-border bg-surface px-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              <AttachmentChips attachments={attachments} onChange={setAttachments} error={attachError} />
              <div className="flex gap-2">
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Write a message…"
                  rows={3}
                  className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
                <div className="flex flex-col justify-end gap-2">
                  <AttachmentButton attachments={attachments} onChange={setAttachments} onError={setAttachError} />
                  <Button type="submit" size="icon" disabled={sending}>
                    <Send size={15} />
                  </Button>
                </div>
              </div>
              {error && <p className="text-sm text-danger">{error}</p>}
            </form>
          </>
        )}
      </div>

      <ComposeDialog
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        onPicked={(id) => {
          setComposeOpen(false);
          selectContact(id);
        }}
        onQuickPicked={(email) => {
          setComposeOpen(false);
          openQuickThread(email);
        }}
      />
    </div>
  );
}

type ContactSearchResult = { id: string; full_name: string; email: string | null; company: string | null };

/**
 * Gmail-style "Compose" entry point — the sidebar list only shows contacts
 * who already have an email on file, and doesn't make starting a thread
 * with someone new (or without an address yet) obvious. This searches all
 * contacts, lets you add an email inline if one's missing, or create a
 * brand-new contact — then hands off to the existing thread view to
 * actually send, rather than duplicating that logic here.
 */
function ComposeDialog({
  open,
  onClose,
  onPicked,
  onQuickPicked,
}: {
  open: boolean;
  onClose: () => void;
  onPicked: (contactId: string) => void;
  onQuickPicked: (email: string) => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<ContactSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [addingEmailFor, setAddingEmailFor] = useState<ContactSearchResult | null>(null);
  const [emailInput, setEmailInput] = useState("");
  const [newRecipientMode, setNewRecipientMode] = useState<"contact" | "quick">("contact");
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [quickTo, setQuickTo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setQ("");
      setResults([]);
      setAddingEmailFor(null);
      setNewRecipientMode("contact");
      setNewName("");
      setNewEmail("");
      setQuickTo("");
      setError(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    const t = setTimeout(() => {
      fetch(`/api/contacts${q ? `?q=${encodeURIComponent(q)}` : ""}`)
        .then((r) => r.json())
        .then((d) => setResults(d.contacts ?? []))
        .finally(() => setLoading(false));
    }, 200);
    return () => clearTimeout(t);
  }, [q, open]);

  async function saveEmailAndPick(contact: ContactSearchResult) {
    if (!emailInput.trim()) return;
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/contacts/${contact.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: emailInput.trim() }),
    });
    setSaving(false);
    if (!res.ok) {
      setError("Couldn't save that email address.");
      return;
    }
    onPicked(contact.id);
  }

  async function createAndPick(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const res = await fetch("/api/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ full_name: newName, email: newEmail }),
    });
    setSaving(false);
    if (!res.ok) {
      setError("Couldn't create that contact.");
      return;
    }
    const data = await res.json();
    onPicked(data.contact.id);
  }

  function startQuick(e: React.FormEvent) {
    e.preventDefault();
    onQuickPicked(quickTo.trim());
  }

  return (
    <Dialog open={open} onClose={onClose} title="Compose email">
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <Input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search contacts by name, email, company…"
          className="pl-8"
        />
      </div>

      <div className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-border">
        {loading ? (
          <p className="p-4 text-center text-sm text-muted">Searching…</p>
        ) : results.length === 0 ? (
          <p className="p-4 text-center text-sm text-muted">No contacts found.</p>
        ) : (
          results.map((c) => (
            <div key={c.id} className="border-b border-border px-3 py-2 last:border-b-0">
              <button
                type="button"
                onClick={() => (c.email ? onPicked(c.id) : setAddingEmailFor(c))}
                className="flex w-full items-center gap-2.5 text-left cursor-pointer"
              >
                <Avatar name={c.full_name} size={28} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-ink">{c.full_name}</p>
                  <p className="truncate text-xs text-muted">{c.email || "No email on file — click to add one"}</p>
                </div>
              </button>
              {addingEmailFor?.id === c.id && (
                <div className="mt-2 flex gap-2 pl-[38px]">
                  <Input
                    autoFocus
                    type="email"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    placeholder="email@example.com"
                    className="h-8 text-sm"
                  />
                  <Button type="button" size="sm" disabled={saving} onClick={() => saveEmailAndPick(c)}>
                    Use
                  </Button>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <div className="mt-4 border-t border-border pt-4">
        <Label>Someone new</Label>
        <div className="mb-2 flex gap-2">
          {(["contact", "quick"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setNewRecipientMode(m)}
              className={cn(
                "flex-1 rounded-lg border px-3 py-1.5 text-xs font-medium transition",
                newRecipientMode === m
                  ? "border-primary bg-primary/10 text-primary-dark"
                  : "border-border bg-surface text-ink hover:bg-section",
              )}
            >
              {m === "contact" ? "Save as contact" : "Just send, don't save"}
            </button>
          ))}
        </div>

        {newRecipientMode === "contact" ? (
          <form onSubmit={createAndPick} className="space-y-2">
            <Input required value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Full name" />
            <Input
              required
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="email@example.com"
            />
            <Button type="submit" disabled={saving} className="w-full justify-center">
              Create contact & compose
            </Button>
          </form>
        ) : (
          <form onSubmit={startQuick} className="space-y-2">
            <Input
              required
              type="email"
              value={quickTo}
              onChange={(e) => setQuickTo(e.target.value)}
              placeholder="email@example.com"
            />
            <Button type="submit" className="w-full justify-center">
              <PenSquare size={14} /> Compose — not saved to Contacts
            </Button>
          </form>
        )}
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      </div>
    </Dialog>
  );
}
