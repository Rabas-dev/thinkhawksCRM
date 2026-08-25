import Link from "next/link";
import { Mail, Phone, MessageSquare, Users, CalendarClock, CalendarDays } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card, Badge } from "@/components/ui/card";
import { formatDistanceToNow } from "date-fns";
import { FollowUpsList } from "./followups-list";

const ACTIVITY_ICON = { note: Users, email: Mail, call: Phone, message: MessageSquare, meeting: CalendarDays } as const;

export default async function DashboardPage() {
  const supabase = await createClient();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date(startOfDay);
  endOfDay.setDate(endOfDay.getDate() + 1);

  const [
    { count: contactsCount },
    { count: callsToday },
    { count: messagesToday },
    { count: opensToday },
    { count: meetingsToday },
    { data: recent },
    { data: followUps },
  ] = await Promise.all([
    supabase.from("contacts").select("*", { count: "exact", head: true }),
    supabase.from("calls").select("*", { count: "exact", head: true }).gte("created_at", startOfDay.toISOString()),
    supabase.from("messages").select("*", { count: "exact", head: true }).gte("created_at", startOfDay.toISOString()),
    supabase.from("email_events").select("*", { count: "exact", head: true }).eq("status", "opened").gte("created_at", startOfDay.toISOString()),
    supabase
      .from("meetings")
      .select("*", { count: "exact", head: true })
      .eq("status", "scheduled")
      .gte("start_at", startOfDay.toISOString())
      .lt("start_at", endOfDay.toISOString()),
    supabase
      .from("activities")
      .select("id, type, title, body, created_at, contact_id, contacts(id, full_name)")
      .order("created_at", { ascending: false })
      .limit(12),
    supabase
      .from("tasks")
      .select("id, title, due_at, contact_id, contacts(id, full_name, company)")
      .eq("status", "open")
      .lt("due_at", endOfDay.toISOString())
      .order("due_at", { ascending: true }),
  ]);

  const stats = [
    { label: "Total contacts", value: contactsCount ?? 0, icon: Users },
    { label: "Meetings today", value: meetingsToday ?? 0, icon: CalendarDays },
    { label: "Follow-ups due", value: followUps?.length ?? 0, icon: CalendarClock },
    { label: "Calls today", value: callsToday ?? 0, icon: Phone },
    { label: "Messages today", value: messagesToday ?? 0, icon: MessageSquare },
    { label: "Emails opened today", value: opensToday ?? 0, icon: Mail },
  ];

  return (
    <div className="mx-auto max-w-5xl px-8 py-8">
      <h1 className="text-2xl font-semibold text-secondary">Overview</h1>
      <p className="mt-1 text-sm text-muted">What&apos;s happening across your agency&apos;s pipeline.</p>

      <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
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

      <div className="mt-8">
        <h2 className="mb-3 text-sm font-semibold text-secondary">Follow-ups due today</h2>
        <FollowUpsList tasks={followUps ?? []} />
      </div>

      <div className="mt-8">
        <h2 className="mb-3 text-sm font-semibold text-secondary">Recent activity</h2>
        <Card className="divide-y divide-border">
          {!recent || recent.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted">
              Nothing yet — add a contact to get started.
            </p>
          ) : (
            recent.map((a) => {
              const Icon = ACTIVITY_ICON[a.type as keyof typeof ACTIVITY_ICON] ?? Users;
              const contact = Array.isArray(a.contacts) ? a.contacts[0] : a.contacts;
              return (
                <Link
                  key={a.id}
                  href={`/dashboard/contacts/${a.contact_id}`}
                  className="flex items-start gap-3 px-5 py-3 hover:bg-section"
                >
                  <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink/5 text-secondary">
                    <Icon size={14} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-ink">
                      <span className="font-medium">{contact?.full_name ?? "Unknown contact"}</span>{" "}
                      <span className="text-muted">— {a.title}</span>
                    </p>
                    {a.body && <p className="mt-0.5 truncate text-xs text-muted">{a.body}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge tone="muted">{a.type}</Badge>
                    {/* Relative time computed at request time on the server will almost
                        always differ from what the client computes moments later at
                        hydration (worse on a host with a cold-start delay) — a classic
                        React hydration-mismatch crash. suppressHydrationWarning is the
                        correct fix for exactly this "value legitimately changes with
                        time" case: React uses the client's value without erroring. */}
                    <span className="whitespace-nowrap text-[11px] text-muted" suppressHydrationWarning>
                      {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
                    </span>
                  </div>
                </Link>
              );
            })
          )}
        </Card>
      </div>
    </div>
  );
}
