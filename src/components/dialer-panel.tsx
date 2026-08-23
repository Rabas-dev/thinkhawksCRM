"use client";

import { useEffect, useState } from "react";
import { Phone, PhoneOff, Mic, MicOff, Pause, Play, Circle, Delete, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { cn, formatDuration } from "@/lib/utils";
import { useDialer } from "@/lib/dialer-context";
import { playDtmfTone } from "@/lib/dtmf-tones";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];
const DISPOSITIONS = ["Connected", "Voicemail", "No answer", "Not interested", "Follow-up needed", "Other"];
const FOLLOW_UPS = ["No follow-up", "Tomorrow", "In 3 days", "Next week", "Custom"] as const;

function followUpDueAt(choice: (typeof FOLLOW_UPS)[number], customDate: string): string | null {
  const now = new Date();
  switch (choice) {
    case "Tomorrow":
      now.setDate(now.getDate() + 1);
      return now.toISOString();
    case "In 3 days":
      now.setDate(now.getDate() + 3);
      return now.toISOString();
    case "Next week":
      now.setDate(now.getDate() + 7);
      return now.toISOString();
    case "Custom":
      return customDate ? new Date(customDate).toISOString() : null;
    default:
      return null;
  }
}

/**
 * All call-state UI (dial pad, in-call controls, wrap-up disposition +
 * follow-up, incoming screen-pop) — shared between the floating bubble
 * (Dialer) and the full-size /dashboard/dialer workspace. Audio runs through
 * the browser's mic/speakers via Telnyx's WebRTC SDK (src/lib/dialer-context.tsx).
 */
export function DialerPanel({ size = "compact", onWrapUpSaved }: { size?: "compact" | "large"; onWrapUpSaved?: () => void }) {
  const {
    target,
    callState,
    incoming,
    duration,
    muted,
    onHold,
    recordingState,
    error,
    callRowId,
    connectionStatus,
    testCallerNumber,
    useTestCallerId,
    setUseTestCallerId,
    placeCall,
    answerIncoming,
    declineIncoming,
    hangUp,
    toggleMute,
    toggleHold,
    toggleRecording,
    sendDigits,
    finishWrapUp,
  } = useDialer();

  const [number, setNumber] = useState("");
  const [contactName, setContactName] = useState<string | null>(null);
  const [disposition, setDisposition] = useState(DISPOSITIONS[0]);
  const [notes, setNotes] = useState("");
  const [followUp, setFollowUp] = useState<(typeof FOLLOW_UPS)[number]>(FOLLOW_UPS[0]);
  const [customDate, setCustomDate] = useState("");
  const [saving, setSaving] = useState(false);

  const wrapUpContactId = target?.contactId ?? null;

  useEffect(() => {
    if (callState === "incoming") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset the dial pad whenever the target contact changes
    setNumber(target?.number ?? "");
    setContactName(target?.contactName ?? null);
  }, [target, callState]);

  useEffect(() => {
    if (callState === "wrap-up") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset the wrap-up form whenever a call reaches wrap-up
      setDisposition(DISPOSITIONS[0]);
      setNotes("");
      setFollowUp(FOLLOW_UPS[0]);
      setCustomDate("");
    }
  }, [callState]);

  async function saveDisposition() {
    setSaving(true);
    if (callRowId) {
      await fetch(`/api/calls/${callRowId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ disposition, notes }),
      });
    }

    const dueAt = wrapUpContactId ? followUpDueAt(followUp, customDate) : null;
    if (dueAt && wrapUpContactId) {
      await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contact_id: wrapUpContactId,
          title: `Follow up: ${disposition}`,
          due_at: dueAt,
        }),
      });
    }

    setSaving(false);
    finishWrapUp();
    onWrapUpSaved?.();
  }

  const large = size === "large";
  const keyClass = large ? "h-14 text-base" : "h-10 text-sm";
  const dialBtnClass = large ? "h-16 w-16" : "h-12 w-12";

  return (
    <div>
      {callState === "incoming" ? (
        <div className="space-y-3">
          <div className={cn("flex items-center gap-3 rounded-lg bg-section", large ? "p-4" : "p-3")}>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary-dark">
              <User size={18} />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-secondary">
                {incoming?.callerName || incoming?.callerNumber || "Unknown caller"}
              </p>
              {incoming?.callerNumber && <p className="truncate text-xs text-muted">{incoming.callerNumber}</p>}
            </div>
          </div>
          <div className="flex items-center justify-center gap-4 pt-1">
            <button
              onClick={declineIncoming}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-danger text-white cursor-pointer"
            >
              <PhoneOff size={19} />
            </button>
            <button
              onClick={answerIncoming}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-success text-white cursor-pointer"
            >
              <Phone size={19} />
            </button>
          </div>
        </div>
      ) : callState === "wrap-up" ? (
        <div className="space-y-3">
          <p className="text-xs font-medium text-secondary">How did the call go?</p>
          <div>
            <Label>Disposition</Label>
            <select
              value={disposition}
              onChange={(e) => setDisposition(e.target.value)}
              className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              {DISPOSITIONS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          {wrapUpContactId && (
            <div>
              <Label>Follow-up</Label>
              <select
                value={followUp}
                onChange={(e) => setFollowUp(e.target.value as (typeof FOLLOW_UPS)[number])}
                className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                {FOLLOW_UPS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
              {followUp === "Custom" && (
                <Input
                  type="datetime-local"
                  className="mt-2"
                  value={customDate}
                  onChange={(e) => setCustomDate(e.target.value)}
                />
              )}
            </div>
          )}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1 justify-center" onClick={finishWrapUp}>
              Skip
            </Button>
            <Button size="sm" className="flex-1 justify-center" disabled={saving} onClick={saveDisposition}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="mb-3 flex items-center gap-1">
            <Input
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              placeholder="+1 555 123 4567"
              disabled={callState !== "idle"}
            />
            {callState === "idle" && number && (
              <button
                onClick={() => setNumber((n) => n.slice(0, -1))}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-section cursor-pointer"
              >
                <Delete size={15} />
              </button>
            )}
          </div>

          <div className="mb-3 grid grid-cols-3 gap-2">
            {KEYS.map((k) => (
              <button
                key={k}
                onClick={() => {
                  playDtmfTone(k);
                  if (callState === "in-call") sendDigits(k);
                  else setNumber((n) => n + k);
                }}
                className={cn("rounded-lg bg-section font-medium text-ink hover:bg-ink/10 cursor-pointer", keyClass)}
              >
                {k}
              </button>
            ))}
          </div>

          {error && <p className="mb-2 text-xs text-danger">{error}</p>}
          {!error && callState === "idle" && connectionStatus !== "connected" && (
            <p className="mb-2 text-xs text-muted">
              {connectionStatus === "connecting" ? "Connecting…" : "Disconnected — reconnecting…"}
            </p>
          )}
          {callState === "idle" && testCallerNumber && (
            <label className="mb-2 flex items-center gap-1.5 text-xs text-muted">
              <input
                type="checkbox"
                checked={useTestCallerId}
                onChange={(e) => setUseTestCallerId(e.target.checked)}
                className="h-3 w-3 cursor-pointer"
              />
              Call from test number ({testCallerNumber})
            </label>
          )}

          <div className="flex items-center justify-center gap-3">
            {callState === "in-call" && (
              <button
                onClick={toggleMute}
                title={muted ? "Unmute" : "Mute"}
                className={cn(
                  "flex h-11 w-11 items-center justify-center rounded-full cursor-pointer",
                  muted ? "bg-warning/20 text-warning" : "bg-section text-secondary",
                )}
              >
                {muted ? <MicOff size={17} /> : <Mic size={17} />}
              </button>
            )}

            {callState === "in-call" && (
              <button
                onClick={toggleHold}
                title={onHold ? "Resume" : "Hold"}
                className={cn(
                  "flex h-11 w-11 items-center justify-center rounded-full cursor-pointer",
                  onHold ? "bg-warning/20 text-warning" : "bg-section text-secondary",
                )}
              >
                {onHold ? <Play size={17} /> : <Pause size={17} />}
              </button>
            )}

            {callState === "in-call" && recordingState !== "stopped" && (
              <button
                onClick={toggleRecording}
                title={recordingState === "recording" ? "Pause recording" : "Resume recording"}
                className={cn(
                  "flex h-11 w-11 items-center justify-center rounded-full cursor-pointer",
                  recordingState === "recording" ? "bg-danger/15 text-danger" : "bg-section text-secondary",
                )}
              >
                <Circle size={13} fill={recordingState === "recording" ? "currentColor" : "none"} />
              </button>
            )}

            {callState === "idle" || callState === "error" ? (
              <button
                onClick={() => placeCall(number)}
                disabled={!number.trim() || connectionStatus !== "connected"}
                className={cn(
                  "flex items-center justify-center rounded-full bg-success text-white disabled:opacity-50 cursor-pointer",
                  dialBtnClass,
                )}
              >
                <Phone size={large ? 24 : 19} />
              </button>
            ) : (
              <button
                onClick={hangUp}
                className={cn("flex items-center justify-center rounded-full bg-danger text-white cursor-pointer", dialBtnClass)}
              >
                <PhoneOff size={large ? 24 : 19} />
              </button>
            )}
          </div>

          {(callState === "in-call" || callState === "ringing" || callState === "connecting") && (
            <p className="mt-3 text-center text-sm text-muted">
              {contactName || number}
              {callState === "in-call" && ` · ${formatDuration(duration)}`}
              {callState === "in-call" && onHold && " · On hold"}
              {callState === "ringing" && " · Ringing…"}
              {callState === "connecting" && " · Connecting…"}
            </p>
          )}
        </>
      )}
    </div>
  );
}
