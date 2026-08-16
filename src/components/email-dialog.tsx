"use client";

import { useEffect, useState } from "react";
import { Mail } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import type { EmailTemplate } from "@/lib/types";

export function EmailDialog({
  open,
  onClose,
  contactId,
  contactEmail,
  onSent,
}: {
  open: boolean;
  onClose: () => void;
  contactId: string;
  contactEmail: string | null;
  onSent: () => void;
}) {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    fetch("/api/email/templates")
      .then((r) => r.json())
      .then((d) => setTemplates(d.templates ?? []));
  }, [open]);

  function applyTemplate(id: string) {
    const t = templates.find((tpl) => tpl.id === id);
    if (t) {
      setSubject(t.subject);
      setBody(t.body);
    }
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/email/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contact_id: contactId, subject, body }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Couldn't send that email.");
      return;
    }
    setSubject("");
    setBody("");
    onSent();
    onClose();
  }

  return (
    <Dialog open={open} onClose={onClose} title="Send email">
      <form onSubmit={send} className="space-y-3">
        <div>
          <Label>To</Label>
          <Input value={contactEmail ?? "No email on file"} disabled />
        </div>
        {templates.length > 0 && (
          <div>
            <Label>Use template (optional)</Label>
            <select
              onChange={(e) => applyTemplate(e.target.value)}
              defaultValue=""
              className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="">Write from scratch</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <Label>Subject</Label>
          <Input required value={subject} onChange={(e) => setSubject(e.target.value)} />
        </div>
        <div>
          <Label>Message</Label>
          <Textarea required rows={6} value={body} onChange={(e) => setBody(e.target.value)} />
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        <Button type="submit" disabled={loading || !contactEmail} className="w-full justify-center">
          <Mail size={15} /> {loading ? "Sending…" : "Send email"}
        </Button>
      </form>
    </Dialog>
  );
}
