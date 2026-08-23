import { avatarColor, initials } from "@/lib/utils";
import { cn } from "@/lib/utils";

/** Contact avatar with a deterministic color per name (GHL-style varied initials) instead of one flat brand tint. */
export function Avatar({ name, size = 36, className }: { name: string; size?: number; className?: string }) {
  const color = avatarColor(name || "?");
  return (
    <div
      className={cn("flex shrink-0 items-center justify-center rounded-full font-semibold", className)}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(10, Math.round(size * 0.34)),
        backgroundColor: `${color}26`,
        color,
      }}
    >
      {initials(name)}
    </div>
  );
}
