"use client";

import Link from "next/link";
import { Plus, Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, Badge } from "@/components/ui/card";
import { format } from "date-fns";
import type { CampaignWithStats } from "@/lib/types";

const STATUS_TONE = {
  draft: "muted",
  sending: "warning",
  sent: "success",
  failed: "danger",
} as const;

export function CampaignsClient({ campaigns }: { campaigns: CampaignWithStats[] }) {
  return (
    <div className="mx-auto max-w-5xl px-8 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-secondary">Campaigns</h1>
          <p className="mt-1 text-sm text-muted">Bulk emails sent to a segment, with open/click tracking.</p>
        </div>
        <Link href="/dashboard/campaigns/new">
          <Button>
            <Plus size={16} /> New campaign
          </Button>
        </Link>
      </div>

      <Card className="divide-y divide-border">
        {campaigns.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted">No campaigns yet.</p>
        ) : (
          campaigns.map((c) => {
            const openRate = c.stats.sent > 0 ? Math.round((c.stats.opened / c.stats.sent) * 100) : 0;
            const clickRate = c.stats.sent > 0 ? Math.round((c.stats.clicked / c.stats.sent) * 100) : 0;
            return (
              <Link
                key={c.id}
                href={`/dashboard/campaigns/${c.id}`}
                className="flex items-center gap-4 px-5 py-3.5 hover:bg-section"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary-dark">
                  <Megaphone size={15} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{c.name}</p>
                  <p className="truncate text-xs text-muted">
                    {c.subject} {c.segment_tag ? `· tagged "${c.segment_tag}"` : "· all contacts"}
                  </p>
                </div>
                <div className="hidden shrink-0 gap-4 text-right text-xs text-muted sm:flex">
                  <span>{c.stats.sent} sent</span>
                  <span>{openRate}% opened</span>
                  <span>{clickRate}% clicked</span>
                </div>
                <span className="hidden shrink-0 text-xs text-muted md:block">
                  {format(new Date(c.created_at), "MMM d, yyyy")}
                </span>
                <Badge tone={STATUS_TONE[c.status]} className="shrink-0">
                  {c.status}
                </Badge>
              </Link>
            );
          })
        )}
      </Card>
    </div>
  );
}
