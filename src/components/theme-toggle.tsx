"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

/** Manual light/dark switch — persisted in localStorage, applied via a .dark class on <html> (see layout.tsx's anti-flash init script). */
export function ThemeToggle() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads the class the anti-flash script already applied, not synchronizing render state
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  }

  return (
    <button
      onClick={toggle}
      role="switch"
      aria-checked={isDark}
      className="flex items-center gap-3 cursor-pointer"
    >
      <span
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
          isDark ? "bg-primary" : "bg-border",
        )}
      >
        <span
          className={cn(
            "inline-flex h-4 w-4 items-center justify-center rounded-full bg-surface shadow-sm transition-transform",
            isDark ? "translate-x-6" : "translate-x-1",
          )}
        >
          {isDark ? <Moon size={10} className="text-primary-dark" /> : <Sun size={10} className="text-warning" />}
        </span>
      </span>
      <span className="text-sm text-ink">{isDark ? "Dark mode" : "Light mode"}</span>
    </button>
  );
}
