"use client";

import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { formatDuration } from "@/lib/utils";
import { useDialer } from "@/lib/dialer-context";
import { DialerPanel } from "@/components/dialer-panel";

/**
 * Floating dial pad available anywhere in the CRM. Hidden on
 * /dashboard/dialer, which already shows a full-size DialerPanel — avoids
 * two sets of call controls fighting over the same active call.
 */
export function Dialer() {
  const { isOpen, target, callState, incoming, duration, closeDialer } = useDialer();
  const pathname = usePathname();

  if (pathname?.startsWith("/dashboard/dialer")) return null;
  if (!isOpen) return null;

  const headerName =
    callState === "incoming"
      ? incoming?.callerName || incoming?.callerNumber || "Incoming call"
      : callState === "in-call" || callState === "ringing" || callState === "connecting"
        ? target?.contactName || target?.number || "Dialer"
        : "Dialer";

  return (
    <div className="fixed bottom-6 right-6 z-50 w-72 overflow-hidden rounded-2xl border border-border bg-surface shadow-xl">
      <div className="flex items-center justify-between border-b border-border bg-chrome px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-white">{headerName}</p>
          {callState === "in-call" && <p className="text-[11px] text-white/70">{formatDuration(duration)}</p>}
          {(callState === "connecting" || callState === "ringing") && (
            <p className="text-[11px] text-white/70">{callState === "ringing" ? "Ringing…" : "Connecting…"}</p>
          )}
          {callState === "incoming" && <p className="text-[11px] text-white/70">Incoming call…</p>}
        </div>
        {callState !== "incoming" && (
          <button onClick={closeDialer} className="text-white/70 hover:text-white cursor-pointer">
            <X size={16} />
          </button>
        )}
      </div>

      <div className="p-4">
        <DialerPanel size="compact" />
      </div>
    </div>
  );
}
