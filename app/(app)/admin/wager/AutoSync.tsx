"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * KEEPS THE WAGER PAGE CURRENT BY ITSELF.
 *
 * Checks on load and every few minutes while the tab is open. The endpoint
 * decides whether a sync is actually needed, so this is cheap to call - it is
 * a nudge, not a command.
 *
 * Deliberately silent when nothing happens. It only speaks up when it has just
 * pulled fresh numbers, so it reads as reassurance rather than noise.
 */
const CHECK_EVERY_MS = 5 * 60 * 1000;

export function AutoSync({ lastSyncedAt }: { lastSyncedAt: string | null }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "syncing" | "synced">("idle");
  const running = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      if (running.current || document.hidden) return;
      running.current = true;
      try {
        const response = await fetch("/api/wager-sync/ensure", { method: "POST" });
        const result = await response.json();
        if (cancelled) return;

        if (result.ran && !result.error) {
          setState("synced");
          router.refresh();
          setTimeout(() => !cancelled && setState("idle"), 6000);
        } else {
          setState("idle");
        }
      } catch {
        if (!cancelled) setState("idle");
      } finally {
        running.current = false;
      }
    }

    // A moment's delay so the page paints first.
    const first = setTimeout(() => {
      setState("syncing");
      void check();
    }, 800);

    const timer = setInterval(check, CHECK_EVERY_MS);
    const onVisible = () => !document.hidden && void check();
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      clearTimeout(first);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router]);

  const ago = (() => {
    if (!lastSyncedAt) return "never synced";
    const minutes = Math.round((Date.now() - new Date(lastSyncedAt).getTime()) / 60000);
    if (minutes < 1) return "synced just now";
    if (minutes < 60) return `synced ${minutes} min ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `synced ${hours}h ago`;
    return `synced ${Math.round(hours / 24)}d ago`;
  })();

  return (
    <span className="inline-flex items-center gap-1.5 text-caption text-ink-subtle">
      <span
        aria-hidden
        className={
          "h-1.5 w-1.5 rounded-full " +
          (state === "synced"
            ? "bg-success"
            : state === "syncing"
              ? "animate-pulse bg-accent"
              : "bg-line-strong")
        }
      />
      {state === "synced"
        ? "Just pulled fresh numbers"
        : state === "syncing"
          ? "Checking Roobet…"
          : `Auto-syncing · ${ago}`}
    </span>
  );
}
