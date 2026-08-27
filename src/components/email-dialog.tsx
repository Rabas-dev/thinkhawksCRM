"use client";

import { useEffect, useState } from "react";
import { Mail } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { AttachmentButton, AttachmentChips, type PendingAttachment } from "@/components/attachment-field";
import { sendEmail } from "@/lib/send-email";
import { renderTemplate } from "@/lib/templates";
import type { Contact, EmailTemplate } from "@/lib/types";

export function EmailDialog({
  open,
  onClose,
  contactId,
  contactEmail,
  contact,
  onSent,
}: {
  open: boolean;
  onClose: () => void;
  contactId: string;
  contactEmail: string | null;
  /** Used to fill {{first_name}}/{{full_name}}/{{company}} tokens when a template is applied. */
  contact: Pick<Contact, "full_name" | "company"> | null;
  onSent: () => void;
}) {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [signature, setSignature] = useState("");
  const [fromName, setFromName] = useState("");
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    fetch("/api/email/templates")
      .then((r) => r.json())
      .then((d) => setTemplates(d.templates ?? []));
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        const sig: string = d.settings?.email_signature?.trim() || "";
        setSignature(sig);
        // eslint-disable-next-line react-hooks/set-state-in-effect -- prefill a fresh compose with the agent's signature
        if (sig) setBody((current) => current || `\n\n${sig}`);
        // eslint-disable-next-line react-hooks/set-state-in-effect -- prefill the visible sender name from the agent's Settings default
        setFromName((current) => current || d.settings?.display_name?.trim() || "");
      });
  }, [open]);

  function applyTemplate(id: string) {
    const t = templates.find((tpl) => tpl.id === id);
    if (!t) return;
    const renderedBody = contact ? renderTemplate(t.body, contact) : t.body;
    setSubject(contact ? renderTemplate(t.subject, contact) : t.subject);
    setBody(signature ? `${renderedBody}\n\n${signature}` : renderedBody);
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const result = await sendEmail({ contact_id: contactId, subject, body, from_name: fromName, attachments });
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSubject("");
    setBody("");
    setAttachments([]);
    onSent();
    // A warning means the send itself succeeded but the history record
    // didn't — leave the dialog open with that surfaced instead of closing
    // as if everything was fine.
    if (result.warning) {
      setError(result.warning);
      return;
    }
    onClose();
  }

  return (
    <Dialog open={open} onClose={onClose} title="Send email">
      <form onSubmit={send} className="space-y-3">
        <div>
          <Label>To</Label>
          <Input value={contactEmail ?? "No email on file"} disabled />
        </div>
        <div>
          <Label>Show as sender</Label>
          <Input
            value={fromName}
            onChange={(e) => setFromName(e.target.value)}
            placeholder="Your name"
            maxLength={100}
          />
        </div>
        {templates.length > 0 && (
          <div>
            <Label>Use template (optional)</Label>
            <select
              onChange={(e) => applyTemplate(e.target.value)}
              defaultValue=""
              className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
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
        <AttachmentChips attachments={attachments} onChange={setAttachments} error={attachError} />
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex gap-2">
          <AttachmentButton attachments={attachments} onChange={setAttachments} onError={setAttachError} />
          <Button type="submit" disabled={loading || !contactEmail} className="flex-1 justify-center">
            <Mail size={15} /> {loading ? "Sending…" : "Send email"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
