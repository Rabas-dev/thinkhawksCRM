"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Send, Mail as MailIcon, Search } from "lucide-react";
import { cn, initials } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/card";
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
      <div className="flex w-80 shrink-0 flex-col border-r border-border bg-white">
        <div className="border-b border-border px-5 py-4">
          <h1 className="text-lg font-semibold text-secondary">Email</h1>
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
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary-dark">
                  {initials(c.full_name)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium text-[#222]">{c.full_name}</p>
                    {c.lastEmail && (
                      <span className="shrink-0 text-[10px] text-muted">
                        {formatDistanceToNow(new Date(c.lastEmail.created_at), { addSuffix: false })}
                      </span>
                    )}
                  </div>
                  <p className="truncate text-xs text-muted">
                    {c.lastEmail ? c.lastEmail.subject || "(no subject)" : c.email}
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
            <div className="flex items-center justify-between border-b border-border bg-white px-5 py-4">
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
                        {e.direction === "outbound" ? "You" : activeContact?.full_name} ·{" "}
                        {format(new Date(e.created_at), "MMM d, h:mm a")}
                      </p>
                      {e.direction === "outbound" && <TrackingTimeline events={relatedEvents} />}
                    </div>
                  );
                })
              )}
            </div>

            <form onSubmit={sendReply} className="space-y-2 border-t border-border bg-white p-4">
              {templates.length > 0 && (
                <select
                  onChange={(ev) => applyTemplate(ev.target.value)}
                  defaultValue=""
                  className="h-9 w-full rounded-lg border border-border bg-white px-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
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
                className="h-9 w-full rounded-lg border border-border bg-white px-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              <div className="flex gap-2">
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Write a message…"
                  rows={3}
                  className="flex-1 rounded-lg border border-border bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
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
    </div>
  );
}
