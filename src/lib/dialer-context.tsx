"use client";

import { createContext, useContext, useState, useCallback, useRef, useEffect, ReactNode } from "react";
import type { Device as DeviceType, Call as CallType } from "@twilio/voice-sdk";

export type DialerTarget = { number: string; contactId?: string; contactName?: string };

export type DialerCallState =
  | "idle"
  | "incoming"
  | "connecting"
  | "ringing"
  | "in-call"
  | "wrap-up"
  | "error";

export type IncomingInfo = {
  contactId: string | null;
  contactName: string | null;
  callerNumber: string | null;
  previousInteraction: string | null;
};

type DialerContextValue = {
  target: DialerTarget | null;
  isOpen: boolean;
  callState: DialerCallState;
  incoming: IncomingInfo | null;
  duration: number;
  muted: boolean;
  error: string | null;
  callSid: string | null;
  callRowId: string | null;
  openDialer: (number?: string, contactId?: string, contactName?: string) => void;
  closeDialer: () => void;
  placeCall: (number: string) => Promise<void>;
  answerIncoming: () => void;
  declineIncoming: () => void;
  hangUp: () => void;
  toggleMute: () => void;
  sendDigits: (digit: string) => void;
  finishWrapUp: () => void;
};

const DialerContext = createContext<DialerContextValue | null>(null);

export function DialerProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [target, setTarget] = useState<DialerTarget | null>(null);
  const [callState, setCallState] = useState<DialerCallState>("idle");
  const [incoming, setIncoming] = useState<IncomingInfo | null>(null);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [callSid, setCallSid] = useState<string | null>(null);
  const [callRowId, setCallRowId] = useState<string | null>(null);

  const deviceRef = useRef<DeviceType | null>(null);
  const callRef = useRef<CallType | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const targetRef = useRef<DialerTarget | null>(null);
  const callStateRef = useRef<DialerCallState>(callState);
  useEffect(() => {
    targetRef.current = target;
    callStateRef.current = callState;
  });

  const stopTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  const wireUpCall = useCallback(
    (call: CallType, isIncoming: boolean) => {
      callRef.current = call;

      if (!isIncoming) {
        call.on("ringing", () => setCallState("ringing"));
      }
      call.on("accept", () => {
        setCallState("in-call");
        setCallSid(call.parameters?.CallSid ?? null);
        setDuration(0);
        timerRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
      });
      call.on("disconnect", () => {
        stopTimer();
        callRef.current = null;
        setMuted(false);
        setCallState((s) => (s === "idle" ? s : "wrap-up"));
      });
      call.on("cancel", () => {
        stopTimer();
        callRef.current = null;
        setCallState("idle");
        setIsOpen(false);
      });
      call.on("reject", () => {
        stopTimer();
        callRef.current = null;
        setCallState("idle");
        setIsOpen(false);
      });
      call.on("error", (e: { message?: string }) => {
        setError(e.message || "Call error");
        stopTimer();
        callRef.current = null;
        setCallState("error");
      });
    },
    [stopTimer],
  );

  const getDevice = useCallback(async (): Promise<DeviceType | null> => {
    if (deviceRef.current) return deviceRef.current;
    const res = await fetch("/api/calls/token");
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Couldn't set up the dialer.");
      return null;
    }

    const { Device } = await import("@twilio/voice-sdk");
    const device = new Device(data.token, {});
    device.on("error", (e: { message?: string }) => setError(e.message || "Call error"));
    device.on("tokenWillExpire", async () => {
      const refreshed = await fetch("/api/calls/token").then((r) => r.json());
      if (refreshed.token) device.updateToken(refreshed.token);
    });
    device.on("incoming", (call: CallType) => {
      const get = (k: string) => call.customParameters.get(k)?.trim() || null;
      setIncoming({
        contactId: get("ContactId"),
        contactName: get("ContactName"),
        callerNumber: get("CallerNumber") ?? call.parameters?.From ?? null,
        previousInteraction: get("PreviousInteraction"),
      });
      setCallRowId(get("CallRowId"));
      setCallSid(null);
      setTarget(null);
      setError(null);
      setCallState("incoming");
      setIsOpen(true);
      wireUpCall(call, true);
    });
    try {
      await device.register();
      deviceRef.current = device;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't register the dialer.");
      return null;
    }
    return device;
  }, [wireUpCall]);

  // Register as soon as the dashboard mounts so inbound calls ring even if
  // the agent hasn't opened the dial pad yet.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- registers the Twilio Device with an external service on mount; not synchronizing render state
    getDevice();
  }, [getDevice]);

  const openDialer = useCallback((number?: string, contactId?: string, contactName?: string) => {
    setTarget(number ? { number, contactId, contactName } : null);
    setError(null);
    setIsOpen(true);
  }, []);

  const closeDialer = useCallback(() => {
    const s = callStateRef.current;
    if (s === "in-call" || s === "connecting" || s === "ringing" || s === "incoming") return;
    setCallState("idle");
    setIsOpen(false);
    setDuration(0);
    setCallSid(null);
    setCallRowId(null);
    setIncoming(null);
  }, []);

  const placeCall = useCallback(
    async (number: string) => {
      if (!number.trim()) return;
      setError(null);
      setCallState("connecting");
      setCallRowId(null);
      try {
        const device = await getDevice();
        if (!device) {
          setCallState("error");
          return;
        }
        const call = await device.connect({
          params: { Target: number, ContactId: targetRef.current?.contactId ?? "" },
        });
        wireUpCall(call, false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't start the call.");
        setCallState("error");
      }
    },
    [getDevice, wireUpCall],
  );

  const answerIncoming = useCallback(() => callRef.current?.accept(), []);
  const declineIncoming = useCallback(() => callRef.current?.reject(), []);
  const hangUp = useCallback(() => callRef.current?.disconnect(), []);

  const toggleMute = useCallback(() => {
    if (!callRef.current) return;
    const next = !muted;
    callRef.current.mute(next);
    setMuted(next);
  }, [muted]);

  const sendDigits = useCallback((digit: string) => callRef.current?.sendDigits(digit), []);

  const finishWrapUp = useCallback(() => {
    setCallState("idle");
    setDuration(0);
    setCallSid(null);
    setCallRowId(null);
    setIncoming(null);
    setIsOpen(false);
  }, []);

  useEffect(() => stopTimer, [stopTimer]);

  return (
    <DialerContext.Provider
      value={{
        target,
        isOpen,
        callState,
        incoming,
        duration,
        muted,
        error,
        callSid,
        callRowId,
        openDialer,
        closeDialer,
        placeCall,
        answerIncoming,
        declineIncoming,
        hangUp,
        toggleMute,
        sendDigits,
        finishWrapUp,
      }}
    >
      {children}
    </DialerContext.Provider>
  );
}

export function useDialer() {
  const ctx = useContext(DialerContext);
  if (!ctx) throw new Error("useDialer must be used within a DialerProvider");
  return ctx;
}
