"use client";

import { useEffect, useState, useCallback } from "react";
import { Send } from "lucide-react";
import { cn, initials } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { format, formatDistanceToNow } from "date-fns";
import type { Message, MessageChannel } from "@/lib/types";

type Thread = {
  contact_id: string;
  body: string;
  channel: MessageChannel;
  created_at: string;
  contacts: { id: string; full_name: string; phone: string | null } | null;
};

export default function MessagesPage() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [contactPhone, setContactPhone] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [channel, setChannel] = useState<MessageChannel>("sms");
  const [sending, setSending] = useState(false);

  const loadThreads = useCallback(async () => {
    const res = await fetch("/api/messages/threads");
    const data = await res.json();
    setThreads(data.threads ?? []);
  }, []);

  const loadThread = useCallback(async (contactId: string) => {
    const res = await fetch(`/api/contacts/${contactId}`);
    const data = await res.json();
    setMessages(data.messages ?? []);
    setContactPhone(data.contact?.phone ?? null);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load on mount
    loadThreads();
  }, [loadThreads]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reload thread when selection changes
    if (activeId) loadThread(activeId);
  }, [activeId, loadThread]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim() || !activeId) return;
    setSending(true);
    await fetch("/api/messages/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contact_id: activeId, body, channel }),
    });
    setBody("");
    setSending(false);
    loadThread(activeId);
    loadThreads();
  }

  return (
    <div className="flex h-screen">
      <div className="w-80 shrink-0 overflow-y-auto border-r border-border bg-white">
        <div className="border-b border-border px-5 py-4">
          <h1 className="text-lg font-semibold text-secondary">Messages</h1>
        </div>
        {threads.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted">No conversations yet.</p>
        ) : (
          threads.map((t) => (
            <button
              key={t.contact_id}
              onClick={() => setActiveId(t.contact_id)}
              className={cn(
                "flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left cursor-pointer",
                activeId === t.contact_id ? "bg-primary/10" : "hover:bg-section",
              )}
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary-dark">
                {initials(t.contacts?.full_name ?? "?")}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-[#222]">
                  {t.contacts?.full_name ?? "Unknown"}
                </p>
                <p className="truncate text-xs text-muted">{t.body}</p>
              </div>
              <span className="shrink-0 text-[10px] text-muted">
                {formatDistanceToNow(new Date(t.created_at), { addSuffix: false })}
              </span>
            </button>
          ))
        )}
      </div>

      <div className="flex flex-1 flex-col bg-section">
        {!activeId ? (
          <div className="flex flex-1 items-center justify-center text-sm text-muted">
            Select a conversation
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between border-b border-border bg-white px-5 py-4">
              <p className="text-sm font-medium text-secondary">{contactPhone}</p>
              <div className="flex gap-1.5">
                {(["sms", "whatsapp"] as MessageChannel[]).map((c) => (
                  <button
                    key={c}
                    onClick={() => setChannel(c)}
                    className={cn(
                      "rounded-full px-3 py-1 text-xs font-medium capitalize cursor-pointer",
                      channel === c ? "bg-primary text-white" : "bg-black/5 text-secondary",
                    )}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto p-5">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={cn("flex", m.direction === "outbound" ? "justify-end" : "justify-start")}
                >
                  <div
                    className={cn(
                      "max-w-[60%] rounded-xl px-3 py-2 text-sm",
                      m.direction === "outbound"
                        ? "bg-primary text-white"
                        : "border border-border bg-white text-[#222]",
                    )}
                  >
                    <p>{m.body}</p>
                    <p
                      className={cn(
                        "mt-0.5 text-[10px]",
                        m.direction === "outbound" ? "text-white/70" : "text-muted",
                      )}
                    >
                      {format(new Date(m.created_at), "MMM d, h:mm a")} · {m.status}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <form onSubmit={send} className="flex gap-2 border-t border-border bg-white p-4">
              <input
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={`Write a ${channel} message…`}
                className="h-10 flex-1 rounded-lg border border-border bg-white px-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              <Button type="submit" size="icon" disabled={sending}>
                <Send size={15} />
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
