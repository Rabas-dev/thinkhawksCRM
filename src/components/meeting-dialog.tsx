"use client";

import { useState } from "react";
import { CalendarClock } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";

type ContactOption = { id: string; full_name: string; email: string | null; company: string | null };

export function MeetingDialog({
  open,
  onClose,
  contact,
  contacts,
  defaultStart,
  onBooked,
}: {
  open: boolean;
  onClose: () => void;
  /** Pass a single contact to lock it (e.g. from the contact detail page). */
  contact?: ContactOption;
  /** Pass the full contact list to let the user pick one (e.g. from the calendar page). */
  contacts?: ContactOption[];
  defaultStart?: Date;
  onBooked: () => void;
}) {
  const [contactId, setContactId] = useState(contact?.id ?? "");
  const [title, setTitle] = useState("Discovery call");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [meetingLink, setMeetingLink] = useState("");
  const [start, setStart] = useState(toLocalInput(defaultStart));
  const [duration, setDuration] = useState(30);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const selectedContact = contact ?? contacts?.find((c) => c.id === contactId) ?? null;

  function reset() {
    setTitle("Discovery call");
    setDescription("");
    setLocation("");
    setMeetingLink("");
    setStart(toLocalInput(defaultStart));
    setDuration(30);
    setError(null);
    setNotice(null);
    if (!contact) setContactId("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!contactId || !start) return;
    setLoading(true);
    setError(null);
    setNotice(null);

    const startDate = new Date(start);
    const endDate = new Date(startDate.getTime() + duration * 60_000);

    const res = await fetch("/api/meetings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contact_id: contactId,
        title,
        description: description || undefined,
        location: location || undefined,
        meeting_link: meetingLink || undefined,
        start_at: startDate.toISOString(),
        end_at: endDate.toISOString(),
      }),
    });

    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(data.error?.formErrors?.[0] || data.error || "Couldn't book that meeting.");
      return;
    }
    if (!data.emailSent && selectedContact?.email) {
      setNotice("Meeting booked, but the confirmation email couldn't be sent (check SendGrid configuration).");
    }
    onBooked();
    reset();
    if (!data.emailSent && selectedContact?.email) return;
    onClose();
  }

  return (
    <Dialog
      open={open}
      onClose={() => {
        onClose();
        reset();
      }}
      title="Book a meeting"
    >
      <form onSubmit={submit} className="space-y-3">
        {!contact && (
          <div>
            <Label>Contact</Label>
            <select
              required
              value={contactId}
              onChange={(e) => setContactId(e.target.value)}
              className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="" disabled>
                Select a contact…
              </option>
              {contacts?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name} {c.company ? `— ${c.company}` : ""}
                </option>
              ))}
            </select>
          </div>
        )}
        {contact && (
          <div>
            <Label>Contact</Label>
            <Input value={contact.full_name} disabled />
          </div>
        )}
        {selectedContact && !selectedContact.email && (
          <p className="text-xs text-warning">
            This contact has no email on file — no confirmation email will be sent.
          </p>
        )}

        <div>
          <Label>Title</Label>
          <Input required value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label>Start</Label>
            <Input
              required
              type="datetime-local"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </div>
          <div>
            <Label>Duration</Label>
            <select
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              {[15, 30, 45, 60, 90].map((m) => (
                <option key={m} value={m}>
                  {m} min
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <Label>Location (optional)</Label>
          <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Office, address…" />
        </div>
        <div>
          <Label>Meeting link (optional)</Label>
          <Input
            type="url"
            value={meetingLink}
            onChange={(e) => setMeetingLink(e.target.value)}
            placeholder="https://meet.google.com/…"
          />
        </div>
        <div>
          <Label>Notes (optional)</Label>
          <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}
        {notice && <p className="text-sm text-warning">{notice}</p>}

        <Button type="submit" disabled={loading || !contactId} className="w-full justify-center">
          <CalendarClock size={15} /> {loading ? "Booking…" : "Book meeting"}
        </Button>
      </form>
    </Dialog>
  );
}

function toLocalInput(date?: Date) {
  const d = date ?? new Date(Date.now() + 60 * 60_000);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
