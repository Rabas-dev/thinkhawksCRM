"use client";

import { usePathname } from "next/navigation";
import { Minimize2 } from "lucide-react";
import { formatDuration } from "@/lib/utils";
import { useDialer } from "@/lib/dialer-context";
import { DialerPanel } from "@/components/dialer-panel";
import { Avatar } from "@/components/ui/avatar";

const ACTIVE_STATES = new Set(["incoming", "connecting", "ringing", "in-call", "wrap-up"]);

/**
 * Full-screen call UI shown automatically the moment a call starts ringing
 * or connecting — an incoming call, or one just placed — so the agent gets
 * the same "the phone is taking over" experience a smartphone gives, rather
 * than just a small corner widget easy to miss. Minimizing (button below)
 * drops it down to the corner bubble (src/components/dialer.tsx) so the
 * agent can keep working elsewhere while the call continues; it opens
 * full-screen again for the next call regardless (dialer-context.tsx resets
 * isMinimized whenever a new call starts). Suppressed on /dashboard/dialer,
 * which is already a dedicated full-page call UI — stacking this on top of
 * it would just be two full-screen call layers at once.
 */
export function CallOverlay() {
  const { isOpen, isMinimized, minimizeCall, callState, target, incoming, duration } = useDialer();
  const pathname = usePathname();

  if (pathname?.startsWith("/dashboard/dialer")) return null;
  if (!isOpen || isMinimized || !ACTIVE_STATES.has(callState)) return null;

  const isIncoming = callState === "incoming";
  // For an incoming call, a matched CRM contact's name is worth trusting
  // over the carrier-supplied caller name (usually blank for real PSTN
  // calls anyway) — target.contactName gets filled in shortly after ringing
  // starts, once resolveInboundCallRow's lookup lands (dialer-context.tsx).
  const name = isIncoming ? target?.contactName || incoming?.callerName || "Unknown caller" : target?.contactName || target?.number || "Dialer";
  // The caller's raw number, shown big and on its own line — this is the
  // one piece of identity that's *always* available (even with no CRM match
  // and no carrier caller-name), so it needs to be impossible to miss here,
  // not tucked into a small caption the way the compact bubble shows it.
  const numberLine = isIncoming ? incoming?.callerNumber : null;
  const subtitle = isIncoming
    ? "Incoming call"
    : callState === "in-call"
      ? formatDuration(duration)
      : callState === "ringing"
        ? "Ringing…"
        : callState === "connecting"
          ? "Connecting…"
          : callState === "wrap-up"
            ? "Call ended"
            : null;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-chrome">
      <div className="flex items-center justify-end px-5 pt-5">
        <button
          onClick={minimizeCall}
          title="Minimize — the call keeps going"
          className="flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1.5 text-xs font-medium text-white/80 hover:bg-white/10 cursor-pointer"
        >
          <Minimize2 size={13} />
          Minimize
        </button>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center px-6 pb-10">
        <div className="mb-8 flex flex-col items-center gap-3">
          <Avatar name={name} size={88} className="text-3xl" />
          <div className="text-center">
            <p className="text-xl font-semibold text-white">{name}</p>
            {numberLine && <p className="mt-1 text-lg font-medium text-white/90">{numberLine}</p>}
            {subtitle && <p className="mt-1 text-sm text-white/60">{subtitle}</p>}
          </div>
        </div>

        <div className="w-full max-w-sm rounded-2xl bg-surface p-6 shadow-2xl">
          <DialerPanel size="large" hideIncomingHeader={isIncoming} />
        </div>
      </div>
    </div>
  );
}
