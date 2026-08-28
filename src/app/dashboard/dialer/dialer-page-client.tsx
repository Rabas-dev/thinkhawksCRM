"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, PhoneIncoming, PhoneOutgoing, Building2 } from "lucide-react";
import { cn, formatDuration } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Card, Badge } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { DialerPanel } from "@/components/dialer-panel";
import { RecordingPlayer } from "@/components/recording-player";
import { useDialer } from "@/lib/dialer-context";
import type { Call } from "@/lib/types";
import { format, formatDistanceToNow } from "date-fns";

type ContactRow = {
  id: string;
  full_name: string;
  phone: string | null;
  company: string | null;
  lastCall: {
    direction: "outbound" | "inbound";
    status: string;
    duration_seconds: number | null;
    disposition: string | null;
    created_at: string;
  } | null;
};

export function DialerPageClient({ contacts }: { contacts: ContactRow[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { openDialer } = useDialer();

  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get("contact"));
  const [history, setHistory] = useState<(Call & { contacts: { id: string; full_name: string } | null })[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const selected = contacts.find((c) => c.id === selectedId) ?? null;

  const loadHistory = useCallback(async (contactId: string) => {
    setLoadingHistory(true);
    const res = await fetch(`/api/calls?contact_id=${contactId}`);
    const data = await res.json();
    setHistory(data.calls ?? []);
    setLoadingHistory(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads the newly selected contact's call history
    if (selectedId) loadHistory(selectedId);
  }, [selectedId, loadHistory]);

  useEffect(() => {
    const initialId = searchParams.get("contact");
    const contact = initialId ? contacts.find((c) => c.id === initialId) : null;
    if (contact?.phone) openDialer(contact.phone, contact.id, contact.full_name);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only prefill once, from the initial URL
  }, []);

  function selectContact(contact: ContactRow) {
    setSelectedId(contact.id);
    router.replace(`/dashboard/dialer?contact=${contact.id}`, { scroll: false });
    if (contact.phone) openDialer(contact.phone, contact.id, contact.full_name);
  }

  const filtered = contacts.filter((c) => {
    if (!q) return true;
    const s = q.toLowerCase();
    return c.full_name.toLowerCase().includes(s) || c.company?.toLowerCase().includes(s) || c.phone?.includes(q);
  });

  return (
    <div className="flex h-screen">
      <div className="flex w-80 shrink-0 flex-col border-r border-border bg-surface">
        <div className="border-b border-border px-5 py-4">
          <h1 className="text-lg font-semibold text-secondary">Dialer</h1>
          <div className="relative mt-3">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search contacts…" className="pl-8" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted">No contacts with a phone number yet.</p>
          ) : (
            filtered.map((c) => (
              <button
                key={c.id}
                onClick={() => selectContact(c)}
                className={cn(
                  "flex w-full items-start gap-3 border-b border-border px-4 py-3 text-left cursor-pointer",
                  selectedId === c.id ? "bg-primary/10" : "hover:bg-section",
                )}
              >
                <Avatar name={c.full_name} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium text-ink">{c.full_name}</p>
                    {c.lastCall && (
                      <span className="shrink-0 text-[10px] text-muted" suppressHydrationWarning>
                        {formatDistanceToNow(new Date(c.lastCall.created_at), { addSuffix: false })}
                      </span>
                    )}
                  </div>
                  <p className="truncate text-xs text-muted">
                    {c.lastCall
                      ? `${c.lastCall.direction === "outbound" ? "Called" : "Called you"} · ${formatDuration(c.lastCall.duration_seconds)}${c.lastCall.disposition ? ` · ${c.lastCall.disposition}` : ""}`
                      : c.phone}
                  </p>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-section p-6">
        {!selected ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted">
            Select a contact to call
          </div>
        ) : (
          <div className="mx-auto max-w-2xl space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-secondary">{selected.full_name}</h2>
              <p className="flex items-center gap-1 text-sm text-muted">
                {selected.company && (
                  <>
                    <Building2 size={13} /> {selected.company}
                  </>
                )}
              </p>
            </div>

            <Card className="p-5">
              <DialerPanel size="large" onWrapUpSaved={() => selectedId && loadHistory(selectedId)} />
            </Card>

            <div>
              <h3 className="mb-3 text-sm font-semibold text-secondary">Call history</h3>
              <Card className="divide-y divide-border">
                {loadingHistory ? (
                  <p className="p-6 text-center text-sm text-muted">Loading…</p>
                ) : history.length === 0 ? (
                  <p className="p-6 text-center text-sm text-muted">No calls with this contact yet.</p>
                ) : (
                  history.map((c) => (
                    <div key={c.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary-dark">
                        {c.direction === "outbound" ? <PhoneOutgoing size={14} /> : <PhoneIncoming size={14} />}
                      </div>
                      <span className="shrink-0 text-xs text-muted" suppressHydrationWarning>{format(new Date(c.created_at), "MMM d, h:mm a")}</span>
                      <span className="w-12 shrink-0 text-right text-xs text-muted">{formatDuration(c.duration_seconds)}</span>
                      {c.disposition && (
                        <Badge tone="primary" className="shrink-0">
                          {c.disposition}
                        </Badge>
                      )}
                      <Badge tone={c.status === "completed" ? "success" : "muted"} className="shrink-0">
                        {c.status}
                      </Badge>
                      {c.recording_url && (
                        <RecordingPlayer src={`/api/calls/${c.id}/recording`} className="w-full shrink-0 sm:w-56" />
                      )}
                      {c.notes && <p className="w-full pl-11 text-xs text-muted">{c.notes}</p>}
                    </div>
                  ))
                )}
              </Card>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
