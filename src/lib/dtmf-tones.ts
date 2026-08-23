/**
 * Real DTMF touch-tones for the dial pad's local click feedback — the same
 * dual-frequency pairs a physical phone generates, synthesized with the Web
 * Audio API so no audio asset is needed. Purely local UI feedback; the
 * actual DTMF signal sent over an active call goes through the WebRTC SDK's
 * own dtmf() method (see dialer-context.tsx's sendDigits).
 */
const DTMF_FREQUENCIES: Record<string, [number, number]> = {
  "1": [697, 1209],
  "2": [697, 1336],
  "3": [697, 1477],
  "4": [770, 1209],
  "5": [770, 1336],
  "6": [770, 1477],
  "7": [852, 1209],
  "8": [852, 1336],
  "9": [852, 1477],
  "*": [941, 1209],
  "0": [941, 1336],
  "#": [941, 1477],
};

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!audioCtx) audioCtx = new Ctor();
  if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
  return audioCtx;
}

export function playDtmfTone(key: string, durationMs = 150) {
  const freqs = DTMF_FREQUENCIES[key];
  const ctx = getAudioContext();
  if (!freqs || !ctx) return;

  const gain = ctx.createGain();
  gain.gain.value = 0.12;
  gain.connect(ctx.destination);

  const now = ctx.currentTime;
  const stopAt = now + durationMs / 1000;
  // Quick fade-out avoids an audible click at the end of the tone.
  gain.gain.setValueAtTime(0.12, stopAt - 0.02);
  gain.gain.linearRampToValueAtTime(0, stopAt);

  for (const freq of freqs) {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;
    osc.connect(gain);
    osc.start(now);
    osc.stop(stopAt);
  }
}
