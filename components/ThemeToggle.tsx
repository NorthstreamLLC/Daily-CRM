"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "@/components/icons";

/**
 * Light / dark switch.
 *
 * Until the person chooses, the app follows the device setting - the class is
 * applied before hydration by the inline script in the root layout, so there is
 * no flash of the wrong theme. Choosing here stores an explicit preference that
 * wins from then on.
 */
export function ThemeToggle() {
  // Read the truth from the DOM after mount; the server cannot know the theme.
  const [dark, setDark] = useState<boolean | null>(null);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      // Storage unavailable (private mode) - the toggle still works for the session.
    }
    setDark(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      className="flex w-full items-center gap-2.5 rounded-control px-2 py-1.5
                 text-small font-medium text-shell-ink-muted transition-colors
                 duration-fast hover:bg-shell-raised/60 hover:text-shell-ink"
    >
      {/* Render both until mounted so server and client HTML agree. */}
      {dark === null ? (
        <Sun size={15} />
      ) : dark ? (
        <Sun size={15} />
      ) : (
        <Moon size={15} />
      )}
      {dark === null ? "Theme" : dark ? "Light mode" : "Dark mode"}
    </button>
  );
}
