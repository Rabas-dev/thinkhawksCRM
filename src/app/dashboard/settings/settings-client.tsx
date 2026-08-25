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

export function SettingsClient({
  userEmail,
  initialSettings,
}: {
  userEmail: string | null;
  initialSettings: Settings;
}) {
  const [displayName, setDisplayName] = useState(initialSettings.display_name ?? "");
  const [signature, setSignature] = useState(initialSettings.email_signature ?? "");
  const [callerId, setCallerId] = useState<Settings["default_caller_id"]>(initialSettings.default_caller_id);
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
