import type { CampaignStats, EmailStatus } from "@/lib/types";

export function emptyCampaignStats(): CampaignStats {
  return { recipients: 0, sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, failed: 0 };
}

export function tallyCampaignStats(rows: { status: EmailStatus }[]): CampaignStats {
  const stats = emptyCampaignStats();
  for (const r of rows) {
    stats.recipients += 1;
    if (r.status === "sent" || r.status === "delivered" || r.status === "opened" || r.status === "clicked") {
      stats.sent += 1;
    }
    if (r.status === "delivered" || r.status === "opened" || r.status === "clicked") stats.delivered += 1;
    if (r.status === "opened" || r.status === "clicked") stats.opened += 1;
    if (r.status === "clicked") stats.clicked += 1;
    if (r.status === "bounced" || r.status === "complained") stats.bounced += 1;
    if (r.status === "failed") stats.failed += 1;
  }
  return stats;
}
