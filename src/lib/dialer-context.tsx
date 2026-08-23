"use client";

import { createContext, useContext, useState, useCallback, useRef, useEffect, ReactNode } from "react";
import type { TelnyxRTC, Call as TelnyxCall } from "@telnyx/webrtc";
import { RINGTONE_URL, RINGBACK_TONE_URL } from "@/lib/dialer-tones";

export type DialerTarget = { number: string; contactId?: string; contactName?: string };

export type ConnectionStatus = "connecting" | "connected" | "disconnected";

export type DialerCallState =
  | "idle"
  | "incoming"
  | "connecting"
  | "ringing"
  | "in-call"
  | "wrap-up"
  | "error";

export type IncomingInfo = {
  callerNumber: string | null;
  callerName: string | null;
};

export type RecordingState = "recording" | "paused" | "stopped";

type DialerContextValue = {
  target: DialerTarget | null;
  isOpen: boolean;
  callState: DialerCallState;
  incoming: IncomingInfo | null;
  duration: number;
  muted: boolean;
  onHold: boolean;
  recordingState: RecordingState;
  error: string | null;
  callRowId: string | null;
  connectionStatus: ConnectionStatus;
  testCallerNumber: string | null;
  useTestCallerId: boolean;
  setUseTestCallerId: (next: boolean) => void;
  openDialer: (number?: string, contactId?: string, contactName?: string) => void;
  closeDialer: () => void;
  placeCall: (number: string) => Promise<void>;
  answerIncoming: () => void;
  declineIncoming: () => void;
  hangUp: () => void;
  toggleMute: () => void;
  toggleHold: () => void;
  toggleRecording: () => Promise<void>;
  sendDigits: (digit: string) => void;
  finishWrapUp: () => void;
};

const DialerContext = createContext<DialerContextValue | null>(null);

function readCallerId(call: TelnyxCall): IncomingInfo {
  const options = (call as unknown as { options?: Record<string, unknown> }).options ?? {};
  const number =
    (options.remoteCallerNumber as string | undefined) ??
    (options.callerNumber as string | undefined) ??
    null;
  const name =
    (options.remoteCallerName as string | undefined) ??
    (options.callerName as string | undefined) ??
    null;
  return { callerNumber: number, callerName: name };
}

export function DialerProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [target, setTarget] = useState<DialerTarget | null>(null);
  const [callState, setCallState] = useState<DialerCallState>("idle");
  const [incoming, setIncoming] = useState<IncomingInfo | null>(null);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [onHold, setOnHold] = useState(false);
  const [recordingState, setRecordingState] = useState<RecordingState>("recording");
  const [error, setError] = useState<string | null>(null);
  const [callRowId, setCallRowId] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("connecting");
  const [testCallerNumber, setTestCallerNumber] = useState<string | null>(null);
  // Persisted per-browser so an agent's choice sticks across reloads without
  // affecting anyone else's session or the production default for new agents.
  const [useTestCallerId, setUseTestCallerIdState] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads a per-browser preference from storage on mount
    setUseTestCallerIdState(localStorage.getItem("dialer:useTestCallerId") === "1");
  }, []);
  const setUseTestCallerId = useCallback((next: boolean) => {
    setUseTestCallerIdState(next);
    localStorage.setItem("dialer:useTestCallerId", next ? "1" : "0");
  }, []);

  const clientRef = useRef<TelnyxRTC | null>(null);
  const callRef = useRef<TelnyxCall | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const ourNumberRef = useRef<string | null>(null);
  const testNumberRef = useRef<string | null>(null);
  const credentialIdRef = useRef<string | null>(null);
  const useTestCallerIdRef = useRef(useTestCallerId);
  useEffect(() => {
    useTestCallerIdRef.current = useTestCallerId;
  }, [useTestCallerId]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const targetRef = useRef<DialerTarget | null>(null);
  const callStateRef = useRef<DialerCallState>(callState);
  const connectionStatusRef = useRef<ConnectionStatus>(connectionStatus);
  useEffect(() => {
    targetRef.current = target;
    callStateRef.current = callState;
    connectionStatusRef.current = connectionStatus;
  });

  const stopTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  const handleCallUpdate = useCallback(
    (call: TelnyxCall) => {
      callRef.current = call;

      switch (call.state) {
        case "ringing":
          if (call.direction === "inbound") {
            const info = readCallerId(call);
            setIncoming(info);
            setCallRowId(null);
            setTarget(null);
            setError(null);
            setCallState("incoming");
            setIsOpen(true);
          } else {
            setCallState("ringing");
          }
          break;
        case "active":
          setCallState("in-call");
          setOnHold(false);
          // A resume-from-hold also lands here — only reset duration/start
          // the timer the first time the call goes active, so the total
          // call time keeps running through a hold rather than restarting.
          if (!timerRef.current) {
            setDuration(0);
            setRecordingState("recording");
            timerRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
          }
          break;
        case "held":
          setOnHold(true);
          break;
        case "hangup":
        case "destroy":
        case "purge": {
          const causeInfo = (call as unknown as { cause?: string; causeCode?: number }) ?? {};
          if (causeInfo.cause || causeInfo.causeCode) {
            console.info(`[dialer] call ended — cause: ${causeInfo.cause ?? "unknown"} (${causeInfo.causeCode ?? "?"})`);
          }
          stopTimer();
          callRef.current = null;
          setMuted(false);
          setOnHold(false);
          setRecordingState("stopped");
          setCallState((s) => (s === "idle" ? s : "wrap-up"));
          break;
        }
      }
    },
    [stopTimer],
  );

  // Guards against the effect below being torn down (React StrictMode's
  // double-invoke in dev, or a genuine fast unmount) while getClient's fetch
  // is still in flight. A shared boolean doesn't work here — StrictMode's
  // remount resets it synchronously, in the same tick, before the first
  // invocation's fetch promise ever resolves. A generation counter does:
  // each effect run captures its own number, and a stale invocation notices
  // the ref has since moved on. Otherwise the credential that call resolves
  // to becomes an orphaned Telnyx resource nothing ever releases.
  const generationRef = useRef(0);

  const getClient = useCallback(async (generation: number): Promise<TelnyxRTC | null> => {
    if (clientRef.current) return clientRef.current;
    const res = await fetch("/api/calls/token");
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Couldn't set up the dialer.");
      setConnectionStatus("disconnected");
      return null;
    }
    if (generation !== generationRef.current) {
      if (data.credentialId) {
        fetch(`/api/calls/token?credentialId=${encodeURIComponent(data.credentialId)}`, {
          method: "DELETE",
          keepalive: true,
        }).catch(() => {});
      }
      return null;
    }
    ourNumberRef.current = data.callerNumber || null;
    testNumberRef.current = data.testCallerNumber || null;
    credentialIdRef.current = data.credentialId || null;
    setTestCallerNumber(data.testCallerNumber || null);

    const { TelnyxRTC } = await import("@telnyx/webrtc");
    if (generation !== generationRef.current) {
      const id = credentialIdRef.current;
      credentialIdRef.current = null;
      if (id) {
        fetch(`/api/calls/token?credentialId=${encodeURIComponent(id)}`, { method: "DELETE", keepalive: true }).catch(
          () => {},
        );
      }
      return null;
    }
    const client = new TelnyxRTC({
      login_token: data.token,
      ringtoneFile: RINGTONE_URL,
      ringbackFile: RINGBACK_TONE_URL,
    });

    client.on("telnyx.ready", () => {
      setConnectionStatus("connected");
      setError(null);
    });
    client.on("telnyx.socket.close", () => setConnectionStatus("disconnected"));
    // The SDK reconnects on its own (IClientOptions has no opt-out we need
    // here) — this is just a status flag, not something we retry ourselves.
    client.on("telnyx.error", (event: { error?: { message?: string; description?: string; solutions?: string[] } }) => {
      const inner = event?.error;
      const detail = [inner?.description, inner?.solutions?.[0]].filter(Boolean).join(" — ");
      setError(detail || inner?.message || "Something went wrong with the dialer.");
    });
    client.on("telnyx.notification", (notification: { type: string; call?: TelnyxCall }) => {
      if (notification.type === "callUpdate" && notification.call) handleCallUpdate(notification.call);
    });
    client.connect();
    clientRef.current = client;
    return client;
  }, [handleCallUpdate]);

  const releaseCredential = useCallback(() => {
    const id = credentialIdRef.current;
    if (!id) return;
    credentialIdRef.current = null;
    // keepalive lets this survive a tab close/reload, when the browser would
    // otherwise abort an in-flight fetch before it reaches the server.
    fetch(`/api/calls/token?credentialId=${encodeURIComponent(id)}`, { method: "DELETE", keepalive: true }).catch(
      () => {},
    );
  }, []);

  // Connects as soon as the dashboard mounts so inbound calls ring even if
  // the agent hasn't opened the dial pad yet.
  useEffect(() => {
    const generation = ++generationRef.current;
    getClient(generation);
    window.addEventListener("pagehide", releaseCredential);
    return () => {
      window.removeEventListener("pagehide", releaseCredential);
      clientRef.current?.disconnect();
      clientRef.current = null;
      releaseCredential();
    };
  }, [getClient, releaseCredential]);

  const openDialer = useCallback((number?: string, contactId?: string, contactName?: string) => {
    setTarget(number ? { number, contactId, contactName } : null);
    setError(null);
    setIsOpen(true);
  }, []);

  const closeDialer = useCallback(() => {
    const s = callStateRef.current;
    // Block closing mid-call so an active call isn't hidden — unless the
    // socket is down and never going to deliver a state-changing event, in
    // which case the panel would otherwise be stuck open forever.
    if ((s === "in-call" || s === "connecting" || s === "ringing" || s === "incoming") && connectionStatusRef.current === "connected") {
      return;
    }
    stopTimer();
    callRef.current?.hangup();
    callRef.current = null;
    setMuted(false);
    setCallState("idle");
    setIsOpen(false);
    setDuration(0);
    setCallRowId(null);
    setIncoming(null);
  }, [stopTimer]);

  const placeCall = useCallback(
    async (number: string) => {
      if (!number.trim()) return;
      setError(null);
      setCallState("connecting");
      setCallRowId(null);

      const contactId = targetRef.current?.contactId;
      const res = await fetch("/api/calls/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(contactId ? { contact_id: contactId } : { phone: number }),
      });
      const startData = await res.json();
      if (!res.ok) {
        setError(startData.error || "Couldn't start the call.");
        setCallState("error");
        return;
      }
      setCallRowId(startData.id);

      try {
        const client = await getClient(generationRef.current);
        if (!client) {
          setCallState("error");
          return;
        }
        const callerNumber =
          (useTestCallerIdRef.current && testNumberRef.current) || ourNumberRef.current || undefined;
        const call = client.newCall({
          destinationNumber: number,
          callerNumber,
          clientState: JSON.stringify({ callRowId: startData.id }),
          remoteElement: remoteAudioRef.current ?? undefined,
        });
        callRef.current = call;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't start the call.");
        setCallState("error");
      }
    },
    [getClient],
  );

  const answerIncoming = useCallback(
    () => callRef.current?.answer({ remoteElement: remoteAudioRef.current ?? undefined }),
    [],
  );
  const declineIncoming = useCallback(() => {
    callRef.current?.hangup();
    setCallState("idle");
    setIsOpen(false);
    setIncoming(null);
  }, []);
  const hangUp = useCallback(() => {
    // Don't rely solely on the SDK's hangup/destroy event to reset the UI —
    // if the socket is down it never fires, leaving the panel stuck.
    callRef.current?.hangup();
    stopTimer();
    callRef.current = null;
    setMuted(false);
    setOnHold(false);
    setRecordingState("stopped");
    setCallState((s) => (s === "idle" ? s : "wrap-up"));
  }, [stopTimer]);

  const toggleMute = useCallback(() => {
    if (!callRef.current) return;
    const next = !muted;
    if (next) callRef.current.muteAudio();
    else callRef.current.unmuteAudio();
    setMuted(next);
  }, [muted]);

  const toggleHold = useCallback(() => {
    // Local state isn't flipped here — the "held"/"active" callUpdate event
    // from the SDK is what actually drives onHold, so it stays correct even
    // if the hold request fails or the state moves for another reason.
    callRef.current?.toggleHold();
  }, []);

  const toggleRecording = useCallback(async () => {
    if (!callRowId || recordingState === "stopped") return;
    const action = recordingState === "recording" ? "pause" : "resume";
    const res = await fetch(`/api/calls/${callRowId}/recording`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (res.ok) setRecordingState(action === "pause" ? "paused" : "recording");
  }, [callRowId, recordingState]);

  const sendDigits = useCallback((digit: string) => callRef.current?.dtmf(digit), []);

  const finishWrapUp = useCallback(() => {
    setCallState("idle");
    setDuration(0);
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
        onHold,
        recordingState,
        error,
        callRowId,
        connectionStatus,
        testCallerNumber,
        useTestCallerId,
        setUseTestCallerId,
        openDialer,
        closeDialer,
        placeCall,
        answerIncoming,
        declineIncoming,
        hangUp,
        toggleMute,
        toggleHold,
        toggleRecording,
        sendDigits,
        finishWrapUp,
      }}
    >
      {children}
      {/* The SDK only plays incoming call audio if given a real element to attach
          the remote MediaStream to (client.newCall/call.answer's remoteElement
          option) — without one it silently never plays anywhere. */}
      <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />
    </DialerContext.Provider>
  );
}

export function useDialer() {
  const ctx = useContext(DialerContext);
  if (!ctx) throw new Error("useDialer must be used within a DialerProvider");
  return ctx;
}
