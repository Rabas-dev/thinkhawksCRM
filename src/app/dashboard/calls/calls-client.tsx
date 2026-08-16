"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { PhoneIncoming, PhoneOutgoing, Search } from "lucide-react";
import { Card, Badge } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn, formatDuration } from "@/lib/utils";
import { format } from "date-fns";
import type { Call } from "@/lib/types";

type CallRow = Call & { contacts: { id: string; full_name: string } | null };

const DIRECTIONS = ["all", "outbound", "inbound"] as const;

export function CallsClient({ calls }: { calls: CallRow[] }) {
  const [q, setQ] = useState("");
  const [direction, setDirection] = useState<(typeof DIRECTIONS)[number]>("all");

  const filtered = useMemo(() => {
    return calls.filter((c) => {
      if (direction !== "all" && c.direction !== direction) return false;
      if (q && !(c.contacts?.full_name ?? "").toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [calls, q, direction]);

  return (
    <div className="mx-auto max-w-5xl px-8 py-8">
      <h1 className="text-2xl font-semibold text-secondary">Calls</h1>
      <p className="mt-1 text-sm text-muted">
        Every call placed through the CRM, with recordings and dispositions once they finish.
      </p>

      <div className="mt-6 mb-4 flex flex-wrap items-center gap-3">
        <div className="relative max-w-xs flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by contact…"
            className="pl-9"
          />
        </div>
        <div className="flex gap-1.5">
          {DIRECTIONS.map((d) => (
            <button
              key={d}
              onClick={() => setDirection(d)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium capitalize cursor-pointer",
                direction === d ? "bg-primary text-white" : "bg-black/5 text-secondary",
              )}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      <Card className="divide-y divide-border">
        {filtered.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted">
            {calls.length === 0 ? "No calls yet — dial a number from the sidebar to get started." : "No calls match."}
          </p>
        ) : (
          filtered.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center gap-4 px-5 py-3.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary-dark">
                {c.direction === "outbound" ? (
                  <PhoneOutgoing size={14} />
                ) : (
                  <PhoneIncoming size={14} />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <Link
                  href={c.contacts ? `/dashboard/contacts/${c.contacts.id}` : "#"}
                  className="truncate text-sm font-medium text-[#222] hover:underline"
                >
                  {c.contacts?.full_name ?? "Unknown contact"}
                </Link>
                <p className="text-xs text-muted">{c.contact_phone}</p>
              </div>
              <span className="hidden shrink-0 text-xs text-muted sm:block">
                {format(new Date(c.created_at), "MMM d, h:mm a")}
              </span>
              <span className="w-12 shrink-0 text-right text-xs text-muted">
                {formatDuration(c.duration_seconds)}
              </span>
              {c.disposition && (
                <Badge tone="primary" className="shrink-0">
                  {c.disposition}
                </Badge>
              )}
              <Badge tone={c.status === "completed" ? "success" : "muted"} className="shrink-0">
                {c.status}
              </Badge>
              {c.recording_url ? (
                <audio controls src={`/api/calls/${c.id}/recording`} className="h-8 w-48 shrink-0" />
              ) : (
                <span className="w-48 shrink-0 text-right text-xs text-muted">no recording</span>
              )}
              {c.notes && <p className="w-full pl-12 text-xs text-muted">{c.notes}</p>}
            </div>
          ))
        )}
      </Card>
    </div>
  );
}
