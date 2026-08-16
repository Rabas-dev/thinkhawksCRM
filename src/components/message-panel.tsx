"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Message, MessageChannel } from "@/lib/types";
import { format } from "date-fns";

export function MessagePanel({
  open,
  onClose,
  contactId,
  contactPhone,
  messages,
  onSent,
}: {
  open: boolean;
  onClose: () => void;
  contactId: string;
  contactPhone: string | null;
  messages: Message[];
  onSent: () => void;
}) {
  const [channel, setChannel] = useState<MessageChannel>("sms");
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setLoading(true);
    setError(null);
    const res = await fetch("/api/messages/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contact_id: contactId, body, channel }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Couldn't send that message.");
      return;
    }
    setBody("");
    onSent();
  }

  return (
    <Dialog open={open} onClose={onClose} title={`Message · ${contactPhone ?? "no phone"}`}>
      <div className="mb-3 flex gap-1.5">
        {(["sms", "whatsapp"] as MessageChannel[]).map((c) => (
          <button
            key={c}
            type="button"
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

      <div className="mb-3 max-h-64 space-y-2 overflow-y-auto rounded-lg bg-section p-3">
        {messages.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted">No messages yet.</p>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={cn("flex", m.direction === "outbound" ? "justify-end" : "justify-start")}
            >
              <div
                className={cn(
                  "max-w-[75%] rounded-xl px-3 py-1.5 text-sm",
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
          ))
        )}
      </div>

      <form onSubmit={send} className="flex gap-2">
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={`Write a ${channel} message…`}
          className="h-10 flex-1 rounded-lg border border-border bg-white px-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
        <Button type="submit" size="icon" disabled={loading || !contactPhone}>
          <Send size={15} />
        </Button>
      </form>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </Dialog>
  );
}
