"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Send, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import type { EmailTemplate } from "@/lib/types";

export default function NewCampaignPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [segmentTag, setSegmentTag] = useState("");
  const [saving, setSaving] = useState<"draft" | "send" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/email/templates")
      .then((r) => r.json())
      .then((d) => setTemplates(d.templates ?? []));
    fetch("/api/contacts/tags")
      .then((r) => r.json())
      .then((d) => setTags(d.tags ?? []));
  }, []);

  function applyTemplate(id: string) {
    setTemplateId(id);
    const t = templates.find((tpl) => tpl.id === id);
    if (t) {
      setSubject(t.subject);
      setBody(t.body);
    }
  }

  async function save(sendNow: boolean) {
    setSaving(sendNow ? "send" : "draft");
    setError(null);

    const res = await fetch("/api/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        subject,
        body,
        template_id: templateId || null,
        segment_tag: segmentTag || null,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setSaving(null);
      setError(data.error?.formErrors?.join(", ") ?? data.error ?? "Couldn't save that campaign.");
      return;
    }

    if (!sendNow) {
      router.push(`/dashboard/campaigns/${data.campaign.id}`);
      return;
    }

    const sendRes = await fetch(`/api/campaigns/${data.campaign.id}/send`, { method: "POST" });
    const sendData = await sendRes.json();
    setSaving(null);
    if (!sendRes.ok) {
      setError(sendData.error ?? "Couldn't send that campaign.");
      router.push(`/dashboard/campaigns/${data.campaign.id}`);
      return;
    }
    router.push(`/dashboard/campaigns/${data.campaign.id}`);
  }

  return (
    <div className="mx-auto max-w-3xl px-8 py-8">
      <h1 className="text-2xl font-semibold text-secondary">New campaign</h1>
      <p className="mt-1 text-sm text-muted">
        Sends to every contact with an email on file, or narrow it to a tag below.
      </p>

      <Card className="mt-6 space-y-4 p-6">
        <div>
          <Label>Campaign name</Label>
          <Input
            required
            placeholder="e.g. October product update"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Start from a template (optional)</Label>
            <select
              value={templateId}
              onChange={(e) => applyTemplate(e.target.value)}
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
          <div>
            <Label>Audience</Label>
            <select
              value={segmentTag}
              onChange={(e) => setSegmentTag(e.target.value)}
              className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="">All contacts with email</option>
              {tags.map((t) => (
                <option key={t} value={t}>
                  Tagged &quot;{t}&quot;
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <Label>Subject</Label>
          <Input required value={subject} onChange={(e) => setSubject(e.target.value)} />
        </div>
        <div>
          <Label>Body</Label>
          <Textarea required rows={10} value={body} onChange={(e) => setBody(e.target.value)} />
          <p className="mt-1 text-xs text-muted">
            Personalize with <code className="rounded bg-ink/5 px-1 py-0.5">{"{{first_name}}"}</code>,{" "}
            <code className="rounded bg-ink/5 px-1 py-0.5">{"{{full_name}}"}</code>, or{" "}
            <code className="rounded bg-ink/5 px-1 py-0.5">{"{{company}}"}</code>.
          </p>
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={saving !== null || !name || !subject || !body}
            onClick={() => save(false)}
          >
            <Save size={15} /> {saving === "draft" ? "Saving…" : "Save draft"}
          </Button>
          <Button
            type="button"
            disabled={saving !== null || !name || !subject || !body}
            onClick={() => save(true)}
          >
            <Send size={15} /> {saving === "send" ? "Sending…" : "Send now"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
