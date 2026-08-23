"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Send, Mail, MailOpen, MousePointerClick, AlertTriangle, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, Badge } from "@/components/ui/card";
import { format } from "date-fns";
import type { Campaign, CampaignRecipient } from "@/lib/types";

type Recipient = CampaignRecipient & { contacts: { id: string; full_name: string; email: string | null } | null };

const STATUS_TONE: Record<string, "muted" | "success" | "primary" | "danger" | "warning"> = {
  queued: "muted",
  sent: "primary",
  delivered: "primary",
  opened: "success",
  clicked: "success",
  bounced: "danger",
  complained: "danger",
  failed: "danger",
};

export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/campaigns/${id}`);
    if (res.ok) {
      const data = await res.json();
      setCampaign(data.campaign);
      setRecipients(data.recipients ?? []);
    }
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load on mount
    load();
  }, [load]);

  async function send() {
    setSending(true);
    setError(null);
    const res = await fetch(`/api/campaigns/${id}/send`, { method: "POST" });
    const data = await res.json();
    setSending(false);
    if (!res.ok) {
      setError(data.error ?? "Couldn't send that campaign.");
      return;
    }
    load();
  }

  if (!campaign) return <div className="p-8 text-sm text-muted">Loading…</div>;

  const sent = recipients.filter((r) => r.status !== "queued" && r.status !== "failed").length;
  const opened = recipients.filter((r) => r.status === "opened" || r.status === "clicked").length;
  const clicked = recipients.filter((r) => r.status === "clicked").length;
  const bounced = recipients.filter((r) => r.status === "bounced" || r.status === "complained").length;

  const stats = [
    { label: "Recipients", value: recipients.length, icon: Users },
    { label: "Sent", value: sent, icon: Mail },
    { label: "Opened", value: opened, icon: MailOpen },
    { label: "Clicked", value: clicked, icon: MousePointerClick },
    { label: "Bounced", value: bounced, icon: AlertTriangle },
  ];

  return (
    <div className="mx-auto max-w-5xl px-8 py-8">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-secondary">{campaign.name}</h1>
          <p className="mt-1 text-sm text-muted">{campaign.subject}</p>
          <p className="mt-1 text-xs text-muted">
            {campaign.segment_tag ? `Tagged "${campaign.segment_tag}"` : "All contacts with email"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={campaign.status === "sent" ? "success" : campaign.status === "failed" ? "danger" : "muted"}>
            {campaign.status}
          </Badge>
          {campaign.status === "draft" && (
            <Button onClick={send} disabled={sending}>
              <Send size={15} /> {sending ? "Sending…" : "Send now"}
            </Button>
          )}
        </div>
      </div>

      {error && <p className="mb-4 text-sm text-danger">{error}</p>}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        {stats.map((s) => (
          <Card key={s.label} className="p-4">
            <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-primary/12 text-primary-dark">
              <s.icon size={16} />
            </div>
            <p className="text-2xl font-semibold text-secondary">{s.value}</p>
            <p className="text-xs text-muted">{s.label}</p>
          </Card>
        ))}
      </div>

      <h2 className="mb-3 mt-8 text-sm font-semibold text-secondary">Recipients</h2>
      <Card className="divide-y divide-border">
        {recipients.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted">
            {campaign.status === "draft" ? "Not sent yet." : "No recipients matched this audience."}
          </p>
        ) : (
          recipients.map((r) => (
            <div key={r.id} className="flex items-center gap-4 px-5 py-3">
              <div className="min-w-0 flex-1">
                <Link
                  href={r.contacts ? `/dashboard/contacts/${r.contacts.id}` : "#"}
                  className="truncate text-sm font-medium text-ink hover:underline"
                >
                  {r.contacts?.full_name ?? "Unknown contact"}
                </Link>
                <p className="truncate text-xs text-muted">{r.contacts?.email}</p>
              </div>
              {r.opened_at && (
                <span className="hidden text-xs text-muted sm:block">
                  Opened {format(new Date(r.opened_at), "MMM d, h:mm a")}
                </span>
              )}
              <Badge tone={STATUS_TONE[r.status] ?? "muted"} className="shrink-0">
                {r.status}
              </Badge>
            </div>
          ))
        )}
      </Card>
    </div>
  );
}
