"use client";

import { useState } from "react";
import Link from "next/link";
import { Phone, Mail, Building2 } from "lucide-react";
import { Card, Badge } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { EmailDialog } from "@/components/email-dialog";
import { useDialer } from "@/lib/dialer-context";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import type { Contact, PipelineStage } from "@/lib/types";

const COLUMNS: { key: PipelineStage; label: string }[] = [
  { key: "new", label: "New Lead" },
  { key: "contacted", label: "Contacted" },
  { key: "qualified", label: "Qualified" },
  { key: "proposal", label: "Proposal" },
  { key: "won", label: "Won" },
  { key: "lost", label: "Lost" },
];

export function PipelineClient({ initialContacts }: { initialContacts: Contact[] }) {
  const [contacts, setContacts] = useState<Contact[]>(initialContacts);
  const [dragId, setDragId] = useState<string | null>(null);
  const [emailTarget, setEmailTarget] = useState<Contact | null>(null);
  const { openDialer } = useDialer();

  async function moveTo(contactId: string, stage: PipelineStage) {
    setContacts((prev) =>
      prev.map((c) =>
        c.id === contactId ? { ...c, pipeline_stage: stage, pipeline_updated_at: new Date().toISOString() } : c,
      ),
    );
    await fetch(`/api/contacts/${contactId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pipeline_stage: stage }),
    });
  }

  return (
    <div className="px-8 py-8">
      <h1 className="text-2xl font-semibold text-secondary">Pipeline</h1>
      <p className="mt-1 text-sm text-muted">Drag a lead across stages as you work the deal to close.</p>

      <div className="mt-6 flex gap-4 overflow-x-auto pb-4">
        {COLUMNS.map((col) => {
          const inStage = contacts.filter((c) => c.pipeline_stage === col.key);
          return (
            <div
              key={col.key}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (dragId) moveTo(dragId, col.key);
                setDragId(null);
              }}
              className="w-72 shrink-0"
            >
              <div className="mb-2 flex items-center justify-between px-1">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">{col.label}</h2>
                <Badge tone="muted">{inStage.length}</Badge>
              </div>
              <div className="min-h-[120px] space-y-2 rounded-xl bg-ink/[0.03] p-2">
                {inStage.map((c) => (
                  <Card
                    key={c.id}
                    draggable
                    onDragStart={() => setDragId(c.id)}
                    className={cn(
                      "cursor-grab space-y-2 p-3 active:cursor-grabbing",
                      dragId === c.id && "opacity-50",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <Avatar name={c.full_name} size={28} />
                      <Link
                        href={`/dashboard/contacts/${c.id}`}
                        className="min-w-0 flex-1 truncate text-sm font-medium text-ink hover:underline"
                      >
                        {c.full_name}
                      </Link>
                    </div>
                    {c.company && (
                      <p className="flex items-center gap-1 text-xs text-muted">
                        <Building2 size={11} /> {c.company}
                      </p>
                    )}
                    {c.tags?.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {c.tags.slice(0, 3).map((t) => (
                          <Badge key={t} tone="primary">
                            {t}
                          </Badge>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[10px] text-muted">
                        {formatDistanceToNow(new Date(c.pipeline_updated_at), { addSuffix: true })}
                      </span>
                      <div className="flex gap-1">
                        <button
                          onClick={() => c.phone && openDialer(c.phone, c.id, c.full_name)}
                          disabled={!c.phone}
                          className="flex h-6 w-6 items-center justify-center rounded text-muted hover:bg-section hover:text-secondary disabled:opacity-30 cursor-pointer"
                        >
                          <Phone size={12} />
                        </button>
                        <button
                          onClick={() => c.email && setEmailTarget(c)}
                          disabled={!c.email}
                          className="flex h-6 w-6 items-center justify-center rounded text-muted hover:bg-section hover:text-secondary disabled:opacity-30 cursor-pointer"
                        >
                          <Mail size={12} />
                        </button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <EmailDialog
        open={emailTarget !== null}
        onClose={() => setEmailTarget(null)}
        contactId={emailTarget?.id ?? ""}
        contactEmail={emailTarget?.email ?? null}
        onSent={() => setEmailTarget(null)}
      />
    </div>
  );
}
