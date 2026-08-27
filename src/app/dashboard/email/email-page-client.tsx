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
import { format, formatDistanceToNow } from "date-fns";
import { renderTemplate } from "@/lib/templates";
import type { Email, EmailEvent, EmailTemplate, Contact } from "@/lib/types";

type ContactRow = {
  id: string;
  full_name: string;
  email: string | null;
  company: string | null;
  lastEmail: { subject: string | null; text_body: string | null; direction: "outbound" | "inbound"; status: string; created_at: string } | null;
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

export function EmailPageClient({ contacts }: { contacts: ContactRow[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [q, setQ] = useState("");
  const [composeOpen, setComposeOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get("contact"));
  const [emails, setEmails] = useState<Email[]>([]);
  const [events, setEvents] = useState<EmailEvent[]>([]);
  const [activeContact, setActiveContact] = useState<Contact | null>(null);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/email/templates")
      .then((r) => r.json())
      .then((d) => setTemplates(d.templates ?? []));
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
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads the newly selected contact's thread
    if (selectedId) loadThread(selectedId);
  }, [selectedId, loadThread]);

  function selectContact(id: string) {
    setSelectedId(id);
    router.replace(`/dashboard/email?contact=${id}`, { scroll: false });
  }

  function applyTemplate(templateId: string) {
    const t = templates.find((tpl) => tpl.id === templateId);
    if (!t || !activeContact) return;
    setSubject(renderTemplate(t.subject, activeContact));
    setBody(renderTemplate(t.body, activeContact));
  }

  async function sendReply(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim() || !subject.trim() || !selectedId) return;
    setSending(true);
    setError(null);
    const res = await fetch("/api/email/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contact_id: selectedId, subject, body }),
    });
    setSending(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Couldn't send that email.");
      return;
    }
    loadThread(selectedId);
  }

  const filtered = contacts.filter((c) => {
    if (!q) return true;
    const s = q.toLowerCase();
    return c.full_name.toLowerCase().includes(s) || c.company?.toLowerCase().includes(s) || c.email?.toLowerCase().includes(s);
  });

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
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search contacts…" className="pl-8" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted">No contacts with an email yet.</p>
          ) : (
            filtered.map((c) => (
              <button
                key={c.id}
                onClick={() => selectContact(c.id)}
                className={cn(
                  "flex w-full items-start gap-3 border-b border-border px-4 py-3 text-left cursor-pointer",
                  selectedId === c.id ? "bg-primary/10" : "hover:bg-section",
                )}
              >
                <Avatar name={c.full_name} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium text-ink">{c.full_name}</p>
                    {c.lastEmail && (
                      <span className="shrink-0 text-[10px] text-muted" suppressHydrationWarning>
                        {formatDistanceToNow(new Date(c.lastEmail.created_at), { addSuffix: false })}
                      </span>
                    )}
                  </div>
                  <p className="flex items-center gap-1 truncate text-xs text-muted">
                    {c.lastEmail?.direction === "outbound" && <OpenedIndicator status={c.lastEmail.status} />}
                    <span className="truncate">{c.lastEmail ? c.lastEmail.subject || "(no subject)" : c.email}</span>
                  </p>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col bg-section">
        {!selectedId ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-sm text-muted">
            <MailIcon size={22} className="text-muted" />
            Select a contact to start or continue an email conversation
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between border-b border-border bg-surface px-5 py-4">
              <div>
                <p className="text-sm font-medium text-secondary">{activeContact?.full_name}</p>
                <p className="text-xs text-muted">{activeContact?.email}</p>
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
                      <p className="mt-1.5 flex items-center gap-1 text-[10px] text-muted">
                        {e.direction === "outbound" ? "You" : activeContact?.full_name} ·{" "}
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
              <div className="flex gap-2">
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Write a message…"
                  rows={3}
                  className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
                <Button type="submit" size="icon" disabled={sending} className="self-end">
                  <Send size={15} />
                </Button>
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
        onSent={() => setComposeOpen(false)}
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
  onSent,
}: {
  open: boolean;
  onClose: () => void;
  onPicked: (contactId: string) => void;
  onSent: () => void;
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
  const [quickSubject, setQuickSubject] = useState("");
  const [quickBody, setQuickBody] = useState("");
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
      setQuickSubject("");
      setQuickBody("");
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

  async function sendQuick(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const res = await fetch("/api/email/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: quickTo, subject: quickSubject, body: quickBody }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Couldn't send that email.");
      return;
    }
    onSent();
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
          <form onSubmit={sendQuick} className="space-y-2">
            <Input
              required
              type="email"
              value={quickTo}
              onChange={(e) => setQuickTo(e.target.value)}
              placeholder="email@example.com"
            />
            <Input required value={quickSubject} onChange={(e) => setQuickSubject(e.target.value)} placeholder="Subject" />
            <textarea
              required
              value={quickBody}
              onChange={(e) => setQuickBody(e.target.value)}
              placeholder="Write a message…"
              rows={3}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            <Button type="submit" disabled={saving} className="w-full justify-center">
              <Send size={14} /> Send — not saved to Contacts
            </Button>
          </form>
        )}
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      </div>
    </Dialog>
  );
}
