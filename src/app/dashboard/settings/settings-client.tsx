"use client";

import { useState } from "react";
import { Check, Star, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

type Settings = {
  display_name: string | null;
  email_signature: string | null;
  default_caller_id: "main" | "test";
};

type CallRouting = {
  inbound_ring_strategy: "ring-all" | "round-robin";
};

const RING_STRATEGY_OPTIONS: { value: CallRouting["inbound_ring_strategy"]; label: string; description: string }[] = [
  {
    value: "ring-all",
    label: "Ring all agents",
    description: "Every connected agent's dialer rings at once. First to answer gets the call; the rest stop ringing.",
  },
  {
    value: "round-robin",
    label: "Round robin",
    description: "Only the next agent in rotation rings. Spreads calls evenly, but a call is missed if that agent doesn't answer.",
  },
];

type EmailSender = {
  id: string;
  email: string;
  display_name: string;
  is_default: boolean;
};

export function SettingsClient({
  userEmail,
  initialSettings,
  initialCallRouting,
  initialSenders,
}: {
  userEmail: string | null;
  initialSettings: Settings;
  initialCallRouting: CallRouting;
  initialSenders: EmailSender[];
}) {
  const [displayName, setDisplayName] = useState(initialSettings.display_name ?? "");
  const [signature, setSignature] = useState(initialSettings.email_signature ?? "");
  const [callerId, setCallerId] = useState<Settings["default_caller_id"]>(initialSettings.default_caller_id);
  const [ringStrategy, setRingStrategy] = useState(initialCallRouting.inbound_ring_strategy);
  const [routingSaving, setRoutingSaving] = useState(false);
  const [routingError, setRoutingError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [senders, setSenders] = useState<EmailSender[]>(initialSenders);
  const [newSenderEmail, setNewSenderEmail] = useState("");
  const [newSenderName, setNewSenderName] = useState("");
  const [sendersBusy, setSendersBusy] = useState(false);
  const [sendersError, setSendersError] = useState<string | null>(null);

  async function save(patch: Partial<Settings>) {
    setSaving(true);
    setSaved(false);
    setError(null);
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    setSaving(false);
    if (!res.ok) {
      setError("Couldn't save that — try again.");
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function saveRingStrategy(next: CallRouting["inbound_ring_strategy"]) {
    const previous = ringStrategy;
    setRingStrategy(next);
    setRoutingSaving(true);
    setRoutingError(null);
    const res = await fetch("/api/settings/call-routing", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inbound_ring_strategy: next }),
    });
    setRoutingSaving(false);
    if (!res.ok) {
      setRingStrategy(previous);
      setRoutingError("Couldn't save that — try again.");
    }
  }

  async function addSender(e: React.FormEvent) {
    e.preventDefault();
    if (!newSenderEmail.trim() || !newSenderName.trim()) return;
    setSendersBusy(true);
    setSendersError(null);
    const res = await fetch("/api/email/senders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: newSenderEmail.trim(), display_name: newSenderName.trim() }),
    });
    const data = await res.json();
    setSendersBusy(false);
    if (!res.ok) {
      setSendersError(data.error?.formErrors?.join(", ") ?? data.error ?? "Couldn't add that sender.");
      return;
    }
    setSenders((prev) => [...prev, data.sender].sort((a, b) => (a.is_default ? -1 : b.is_default ? 1 : a.display_name.localeCompare(b.display_name))));
    setNewSenderEmail("");
    setNewSenderName("");
  }

  async function setDefaultSender(id: string) {
    setSendersBusy(true);
    setSendersError(null);
    const res = await fetch("/api/email/senders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setSendersBusy(false);
    if (!res.ok) {
      setSendersError("Couldn't set that as default — try again.");
      return;
    }
    setSenders((prev) => prev.map((s) => ({ ...s, is_default: s.id === id })).sort((a, b) => (a.is_default ? -1 : b.is_default ? 1 : a.display_name.localeCompare(b.display_name))));
  }

  async function deleteSender(id: string) {
    setSendersBusy(true);
    setSendersError(null);
    const res = await fetch(`/api/email/senders?id=${id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    setSendersBusy(false);
    if (!res.ok) {
      setSendersError(data.error ?? "Couldn't remove that sender.");
      return;
    }
    setSenders((prev) => prev.filter((s) => s.id !== id));
  }

  return (
    <div className="mx-auto max-w-3xl px-8 py-8">
      <h1 className="text-2xl font-semibold text-secondary">Settings</h1>
      <p className="mt-1 text-sm text-muted">{userEmail}</p>

      <Card className="mt-6 flex items-center justify-between px-5 py-4">
        <div>
          <p className="text-sm text-ink">Appearance</p>
          <p className="text-xs text-muted">Switch between light and dark mode</p>
        </div>
        <ThemeToggle />
      </Card>

      <Card className="mt-6 px-5 py-4">
        <p className="text-sm text-ink">Profile</p>
        <p className="mb-3 text-xs text-muted">Shown in call and activity logs</p>
        <Label>Display name</Label>
        <div className="flex gap-2">
          <Input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your name"
          />
          <Button
            type="button"
            variant="secondary"
            disabled={saving}
            onClick={() => save({ display_name: displayName.trim() || null })}
          >
            Save
          </Button>
        </div>
      </Card>

      <Card className="mt-6 px-5 py-4">
        <p className="text-sm text-ink">Calling</p>
        <p className="mb-3 text-xs text-muted">
          Which caller ID the dialer uses by default — override any time from the dialer itself
        </p>
        <div className="flex gap-2">
          {(["main", "test"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => {
                setCallerId(option);
                save({ default_caller_id: option });
              }}
              className={cn(
                "flex-1 rounded-lg border px-3 py-2 text-sm capitalize transition",
                callerId === option
                  ? "border-primary bg-primary/10 text-primary-dark"
                  : "border-border bg-surface text-ink hover:bg-section",
              )}
            >
              {option === "main" ? "Main number" : "Test number"}
            </button>
          ))}
        </div>
      </Card>

      <Card className="mt-6 px-5 py-4">
        <p className="text-sm text-ink">Inbound call routing</p>
        <p className="mb-3 text-xs text-muted">
          How an incoming call picks which connected agent(s) to ring — applies to the whole team
        </p>
        <div className="flex flex-col gap-2">
          {RING_STRATEGY_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              disabled={routingSaving}
              onClick={() => saveRingStrategy(option.value)}
              className={cn(
                "rounded-lg border px-3 py-2 text-left text-sm transition",
                ringStrategy === option.value
                  ? "border-primary bg-primary/10 text-primary-dark"
                  : "border-border bg-surface text-ink hover:bg-section",
              )}
            >
              <span className="font-medium">{option.label}</span>
              <p className="mt-0.5 text-xs text-muted">{option.description}</p>
            </button>
          ))}
        </div>
        {routingError && <p className="mt-2 text-xs font-medium text-danger">{routingError}</p>}
      </Card>

      <Card className="mt-6 px-5 py-4">
        <p className="text-sm text-ink">Email senders</p>
        <p className="mb-3 text-xs text-muted">
          Addresses emails can be sent from — every address must already be on a domain you&apos;ve authenticated in
          SendGrid, since this is what actually goes in the &quot;From&quot; header
        </p>
        <div className="divide-y divide-border rounded-lg border border-border">
          {senders.length === 0 ? (
            <p className="px-3 py-3 text-sm text-muted">No senders yet — add one below.</p>
          ) : (
            senders.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm text-ink">
                    {s.display_name} <span className="text-muted">&lt;{s.email}&gt;</span>
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {s.is_default ? (
                    <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary-dark">
                      <Star size={11} fill="currentColor" /> Default
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={sendersBusy}
                      onClick={() => setDefaultSender(s.id)}
                      className="rounded-full px-2 py-0.5 text-[11px] font-medium text-muted hover:bg-section cursor-pointer"
                    >
                      Set default
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={sendersBusy || s.is_default}
                    title={s.is_default ? "Set another sender as default first" : "Remove"}
                    onClick={() => deleteSender(s.id)}
                    className="rounded-lg p-1.5 text-muted hover:bg-section hover:text-danger disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted cursor-pointer"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
        <form onSubmit={addSender} className="mt-3 flex gap-2">
          <Input
            type="email"
            placeholder="sales@thinkhawks.com"
            value={newSenderEmail}
            onChange={(e) => setNewSenderEmail(e.target.value)}
          />
          <Input
            placeholder="Sales Team"
            value={newSenderName}
            onChange={(e) => setNewSenderName(e.target.value)}
          />
          <Button type="submit" variant="secondary" disabled={sendersBusy || !newSenderEmail.trim() || !newSenderName.trim()}>
            Add
          </Button>
        </form>
        {sendersError && <p className="mt-2 text-xs font-medium text-danger">{sendersError}</p>}
      </Card>

      <Card className="mt-6 px-5 py-4">
        <p className="text-sm text-ink">Email signature</p>
        <p className="mb-3 text-xs text-muted">Appended automatically when you compose a new email</p>
        <Textarea
          rows={4}
          value={signature}
          onChange={(e) => setSignature(e.target.value)}
          placeholder={"Best,\nYour name\nThink Hawks"}
        />
        <div className="mt-2 flex items-center gap-3">
          <Button
            type="button"
            variant="secondary"
            disabled={saving}
            onClick={() => save({ email_signature: signature.trim() || null })}
          >
            Save
          </Button>
          {saved && (
            <span className="flex items-center gap-1 text-xs font-medium text-success">
              <Check size={14} /> Saved
            </span>
          )}
          {error && <span className="text-xs font-medium text-danger">{error}</span>}
        </div>
      </Card>
    </div>
  );
}
