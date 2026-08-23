"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, CalendarClock } from "lucide-react";
import { Card, Badge } from "@/components/ui/card";
import { format, isPast } from "date-fns";

type FollowUpTask = {
  id: string;
  title: string;
  due_at: string;
  contact_id: string;
  contacts: { id: string; full_name: string; company: string | null } | { id: string; full_name: string; company: string | null }[] | null;
};

export function FollowUpsList({ tasks }: { tasks: FollowUpTask[] }) {
  const router = useRouter();
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  async function complete(id: string) {
    setHidden((prev) => new Set(prev).add(id));
    await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "done" }),
    });
    router.refresh();
  }

  const visible = tasks.filter((t) => !hidden.has(t.id));

  return (
    <Card className="divide-y divide-border">
      {visible.length === 0 ? (
        <p className="p-6 text-center text-sm text-muted">Nothing due today — you&apos;re caught up.</p>
      ) : (
        visible.map((t) => {
          const contact = Array.isArray(t.contacts) ? t.contacts[0] : t.contacts;
          const overdue = isPast(new Date(t.due_at));
          return (
            <div key={t.id} className="flex items-center gap-3 px-5 py-3">
              <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink/5 text-secondary">
                <CalendarClock size={14} />
              </div>
              <Link href={`/dashboard/contacts/${t.contact_id}`} className="min-w-0 flex-1 hover:underline">
                <p className="truncate text-sm text-ink">
                  <span className="font-medium">{contact?.full_name ?? "Unknown contact"}</span>{" "}
                  <span className="text-muted">— {t.title}</span>
                </p>
                {contact?.company && <p className="truncate text-xs text-muted">{contact.company}</p>}
              </Link>
              <div className="flex shrink-0 items-center gap-2">
                <Badge tone={overdue ? "danger" : "muted"}>
                  {overdue ? "Overdue" : format(new Date(t.due_at), "h:mm a")}
                </Badge>
                <button
                  onClick={() => complete(t.id)}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-success hover:bg-success/10 cursor-pointer"
                  title="Mark done"
                >
                  <Check size={14} />
                </button>
              </div>
            </div>
          );
        })
      )}
    </Card>
  );
}
