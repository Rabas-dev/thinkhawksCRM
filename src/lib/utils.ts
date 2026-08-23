import { clsx, type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

const AVATAR_PALETTE = [
  "#2f6fed",
  "#8b5cf6",
  "#0d9488",
  "#d97706",
  "#db2777",
  "#4f46e5",
  "#059669",
  "#dc2626",
];

/** Deterministic color per name, so the same contact always gets the same avatar tint across the app. */
export function avatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}

export function formatPhone(phone: string | null | undefined) {
  if (!phone) return "";
  return phone;
}

export function formatDuration(seconds: number | null | undefined) {
  if (!seconds && seconds !== 0) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Normalizes a phone number to E.164-ish by stripping everything but digits and a leading +. */
export function toE164(raw: string) {
  const trimmed = raw.trim();
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/[^\d]/g, "");
  return hasPlus ? `+${digits}` : `+${digits}`;
}
