"use client";

import { useState } from "react";
import { Check } from "lucide-react";
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

export function SettingsClient({
  userEmail,
  initialSettings,
  initialCallRouting,
}: {
  userEmail: string | null;
  initialSettings: Settings;
  initialCallRouting: CallRouting;
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
