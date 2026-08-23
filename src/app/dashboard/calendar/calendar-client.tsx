"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Plus, MapPin, Link as LinkIcon, X, Check, Ban } from "lucide-react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { Card, Badge } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MeetingDialog } from "@/components/meeting-dialog";
import type { Meeting, MeetingStatus } from "@/lib/types";

type ContactOption = { id: string; full_name: string; email: string | null; company: string | null };
type MeetingRow = Meeting & { contacts: ContactOption | ContactOption[] | null };

const STATUS_TONE: Record<MeetingStatus, "primary" | "success" | "danger" | "muted"> = {
  scheduled: "primary",
  completed: "success",
  canceled: "danger",
  no_show: "muted",
};

export function CalendarClient({ meetings, contacts }: { meetings: MeetingRow[]; contacts: ContactOption[] }) {
  const router = useRouter();
  const [cursor, setCursor] = useState(new Date());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogDefaultStart, setDialogDefaultStart] = useState<Date | undefined>(undefined);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(cursor));
    const end = endOfWeek(endOfMonth(cursor));
    return eachDayOfInterval({ start, end });
  }, [cursor]);

  const byDay = useMemo(() => {
    const map = new Map<string, MeetingRow[]>();
    for (const m of meetings) {
      const key = format(new Date(m.start_at), "yyyy-MM-dd");
      map.set(key, [...(map.get(key) ?? []), m]);
    }
    return map;
  }, [meetings]);

  const upcoming = useMemo(
    () => meetings.filter((m) => new Date(m.end_at) >= new Date() && m.status === "scheduled").slice(0, 8),
    [meetings],
  );

  function openBooking(day?: Date) {
    setDialogDefaultStart(day ? withCurrentTime(day) : undefined);
    setDialogOpen(true);
  }

  async function cancelMeeting(id: string) {
    if (!confirm("Cancel this meeting? The contact will be emailed.")) return;
    await fetch(`/api/meetings/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "canceled" }),
    });
    router.refresh();
  }

  async function markStatus(id: string, status: MeetingStatus) {
    await fetch(`/api/meetings/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    router.refresh();
  }

  const selectedDayMeetings = selectedDay ? byDay.get(format(selectedDay, "yyyy-MM-dd")) ?? [] : [];

  return (
    <div className="mx-auto max-w-6xl px-8 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-secondary">Calendar</h1>
          <p className="mt-1 text-sm text-muted">Book meetings — confirmations email the contact automatically.</p>
        </div>
        <Button onClick={() => openBooking()}>
          <Plus size={15} /> New meeting
        </Button>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_300px]">
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold text-secondary">{format(cursor, "MMMM yyyy")}</h2>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" onClick={() => setCursor((d) => subMonths(d, 1))}>
                <ChevronLeft size={15} />
              </Button>
              <Button variant="outline" size="sm" onClick={() => setCursor(new Date())}>
                Today
              </Button>
              <Button variant="outline" size="icon" onClick={() => setCursor((d) => addMonths(d, 1))}>
                <ChevronRight size={15} />
              </Button>
            </div>
          </div>

          <Card className="overflow-hidden">
            <div className="grid grid-cols-7 border-b border-border bg-section text-center text-[11px] font-semibold uppercase tracking-wide text-muted">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <div key={d} className="py-2">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {days.map((day) => {
                const key = format(day, "yyyy-MM-dd");
                const dayMeetings = byDay.get(key) ?? [];
                const inMonth = isSameMonth(day, cursor);
                const selected = selectedDay && isSameDay(day, selectedDay);
                return (
                  <button
                    key={key}
                    onClick={() => setSelectedDay(day)}
                    onDoubleClick={() => openBooking(day)}
                    className={cn(
                      "flex min-h-24 flex-col items-start gap-1 border-b border-r border-border p-2 text-left align-top cursor-pointer hover:bg-section",
                      !inMonth && "bg-section/50 text-muted",
                      selected && "bg-primary/8",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-6 w-6 items-center justify-center rounded-full text-xs",
                        isToday(day) ? "bg-primary text-white font-semibold" : "text-ink",
                      )}
                    >
                      {format(day, "d")}
                    </span>
                    <div className="w-full space-y-0.5">
                      {dayMeetings.slice(0, 2).map((m) => (
                        <p
                          key={m.id}
                          className={cn(
                            "truncate rounded px-1 py-0.5 text-[10px] font-medium",
                            m.status === "canceled" ? "bg-danger/10 text-danger line-through" : "bg-primary/12 text-primary-dark",
                          )}
                        >
                          {format(new Date(m.start_at), "h:mma")} {m.title}
                        </p>
                      ))}
                      {dayMeetings.length > 2 && (
                        <p className="text-[10px] text-muted">+{dayMeetings.length - 2} more</p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </Card>
          <p className="mt-2 text-xs text-muted">Click a day to see its meetings, double-click to book one.</p>
        </div>

        <div className="space-y-4">
          {selectedDay && (
            <Card className="p-4">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-secondary">{format(selectedDay, "EEEE, MMM d")}</h3>
                <button onClick={() => setSelectedDay(null)} className="text-muted hover:text-secondary cursor-pointer">
                  <X size={14} />
                </button>
              </div>
              {selectedDayMeetings.length === 0 ? (
                <p className="text-sm text-muted">No meetings this day.</p>
              ) : (
                <div className="space-y-2">
                  {selectedDayMeetings.map((m) => (
                    <MeetingCard key={m.id} meeting={m} onCancel={cancelMeeting} onStatus={markStatus} />
                  ))}
                </div>
              )}
              <Button variant="outline" size="sm" className="mt-3 w-full justify-center" onClick={() => openBooking(selectedDay)}>
                <Plus size={14} /> Book for this day
              </Button>
            </Card>
          )}

          <div>
            <h3 className="mb-2 text-sm font-semibold text-secondary">Upcoming</h3>
            {upcoming.length === 0 ? (
              <Card className="p-4 text-sm text-muted">Nothing scheduled yet.</Card>
            ) : (
              <div className="space-y-2">
                {upcoming.map((m) => (
                  <MeetingCard key={m.id} meeting={m} onCancel={cancelMeeting} onStatus={markStatus} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <MeetingDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        contacts={contacts}
        defaultStart={dialogDefaultStart}
        onBooked={() => router.refresh()}
      />
    </div>
  );
}

function MeetingCard({
  meeting,
  onCancel,
  onStatus,
}: {
  meeting: MeetingRow;
  onCancel: (id: string) => void;
  onStatus: (id: string, status: MeetingStatus) => void;
}) {
  const contact = Array.isArray(meeting.contacts) ? meeting.contacts[0] : meeting.contacts;
  return (
    <Card className="p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink">{meeting.title}</p>
          <Link href={`/dashboard/contacts/${meeting.contact_id}`} className="truncate text-xs text-primary-dark hover:underline">
            {contact?.full_name ?? "Unknown contact"}
          </Link>
          <p className="mt-0.5 text-xs text-muted">{format(new Date(meeting.start_at), "MMM d, h:mm a")}</p>
          {meeting.location && (
            <p className="mt-0.5 flex items-center gap-1 text-xs text-muted">
              <MapPin size={11} /> {meeting.location}
            </p>
          )}
          {meeting.meeting_link && (
            <a
              href={meeting.meeting_link}
              target="_blank"
              rel="noreferrer"
              className="mt-0.5 flex items-center gap-1 text-xs text-primary-dark hover:underline"
            >
              <LinkIcon size={11} /> Join link
            </a>
          )}
        </div>
        <Badge tone={STATUS_TONE[meeting.status]}>{meeting.status.replace("_", " ")}</Badge>
      </div>
      {meeting.status === "scheduled" && (
        <div className="mt-2 flex items-center gap-1.5">
          <Button variant="outline" size="sm" onClick={() => onStatus(meeting.id, "completed")}>
            <Check size={12} /> Done
          </Button>
          <Button variant="outline" size="sm" onClick={() => onCancel(meeting.id)}>
            <Ban size={12} /> Cancel
          </Button>
        </div>
      )}
    </Card>
  );
}

function withCurrentTime(day: Date) {
  const now = new Date();
  const d = new Date(day);
  d.setHours(now.getHours() + 1, 0, 0, 0);
  return d;
}
