"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, Pencil, Trash2, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import type { EmailTemplate } from "@/lib/types";

export function TemplatesClient({ initialTemplates }: { initialTemplates: EmailTemplate[] }) {
  const [templates, setTemplates] = useState<EmailTemplate[]>(initialTemplates);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<EmailTemplate | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/email/templates");
    const data = await res.json();
    setTemplates(data.templates ?? []);
  }, []);

  async function remove(id: string) {
    if (!confirm("Delete this template? This can't be undone.")) return;
    await fetch(`/api/email/templates/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="mx-auto max-w-5xl px-8 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-secondary">Email templates</h1>
          <p className="mt-1 text-sm text-muted">
            Reusable copy for one-off emails and campaigns. Use{" "}
            <code className="rounded bg-black/5 px-1 py-0.5 text-xs">{"{{first_name}}"}</code>,{" "}
            <code className="rounded bg-black/5 px-1 py-0.5 text-xs">{"{{full_name}}"}</code>, or{" "}
            <code className="rounded bg-black/5 px-1 py-0.5 text-xs">{"{{company}}"}</code> to
            personalize.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          <Plus size={16} /> New template
        </Button>
      </div>

      <Card className="divide-y divide-border">
        {templates.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted">No templates yet.</p>
        ) : (
          templates.map((t) => (
            <div key={t.id} className="flex items-center gap-4 px-5 py-3.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary-dark">
                <FileText size={15} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-[#222]">{t.name}</p>
                <p className="truncate text-xs text-muted">{t.subject}</p>
              </div>
              <button
                onClick={() => {
                  setEditing(t);
                  setOpen(true);
                }}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-section hover:text-secondary cursor-pointer"
              >
                <Pencil size={14} />
              </button>
              <button
                onClick={() => remove(t.id)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-danger/10 hover:text-danger cursor-pointer"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))
        )}
      </Card>

      <TemplateDialog
        open={open}
        onClose={() => setOpen(false)}
        template={editing}
        onSaved={() => {
          setOpen(false);
          load();
        }}
      />
    </div>
  );
}

function TemplateDialog({
  open,
  onClose,
  template,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  template: EmailTemplate | null;
  onSaved: () => void;
}) {
  const [name, setName] = useState(template?.name ?? "");
  const [subject, setSubject] = useState(template?.subject ?? "");
  const [body, setBody] = useState(template?.body ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync form fields when a different template is opened
    setName(template?.name ?? "");
    setSubject(template?.subject ?? "");
    setBody(template?.body ?? "");
    setError(null);
  }, [template, open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const res = await fetch(template ? `/api/email/templates/${template.id}` : "/api/email/templates", {
      method: template ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, subject, body }),
    });
    setSaving(false);
    if (!res.ok) {
      setError("Couldn't save that template.");
      return;
    }
    onSaved();
  }

  return (
    <Dialog open={open} onClose={onClose} title={template ? "Edit template" : "New template"}>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <Label>Name</Label>
          <Input required value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <Label>Subject</Label>
          <Input required value={subject} onChange={(e) => setSubject(e.target.value)} />
        </div>
        <div>
          <Label>Body</Label>
          <Textarea required rows={6} value={body} onChange={(e) => setBody(e.target.value)} />
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        <Button type="submit" disabled={saving} className="w-full justify-center">
          {saving ? "Saving…" : "Save template"}
        </Button>
      </form>
    </Dialog>
  );
}
