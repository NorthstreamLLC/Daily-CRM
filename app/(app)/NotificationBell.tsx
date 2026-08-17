"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Notification } from "@/lib/queries";
import { cn } from "@/components/ui";
import { markNotificationsRead } from "./actions";

/**
 * What happened while you were away.
 *
 * The sync runs every half hour, day and night. Without this, a rep learns
 * that a player they chased for two weeks finally started betting by
 * eventually noticing their status changed - which is days late, and the
 * moment right after a first bet is exactly when a check-in lands.
 *
 * Opening the panel marks everything read. No "mark as read" button: if you
 * have looked at them, you have read them, and making someone dismiss a list
 * they just read is busywork.
 */
export function NotificationBell({ unread }: { unread: number }) {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(unread);
  const [items, setItems] = useState<Notification[] | null>(null);
  const [, start] = useTransition();
  const router = useRouter();
  const boxRef = useRef<HTMLDivElement>(null);

  // Server count wins whenever the page re-renders.
  useEffect(() => setCount(unread), [unread]);

  // Click outside, or Escape, closes it.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function toggle() {
    const next = !open;
    setOpen(next);

    if (next) {
      // Load on demand - the layout only ever fetched the count.
      fetch("/api/notifications")
        .then((r) => (r.ok ? r.json() : []))
        .then(setItems)
        .catch(() => setItems([]));
    }

    if (next && count > 0) {
      setCount(0); // Immediate, so the badge does not linger while the call runs.
      start(async () => {
        await markNotificationsRead();
        router.refresh();
      });
    }
  }

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-label={count > 0 ? `${count} unread notifications` : "Notifications"}
        aria-expanded={open}
        className={cn(
          "relative inline-flex h-8 w-8 items-center justify-center rounded-control",
          "text-shell-ink-muted transition-colors hover:bg-white/10 hover:text-white",
          open && "bg-white/10 text-white"
        )}
      >
        <Bell />
        {count > 0 && (
          <span
            className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center
                       justify-center rounded-full bg-danger px-1 text-[10px]
                       font-semibold text-white"
          >
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute bottom-full left-0 z-50 mb-2 w-[320px] overflow-hidden
                     rounded-card border border-line-strong bg-surface shadow-card"
        >
          <div className="border-b border-line-strong px-3 py-2">
            <p className="text-small font-semibold text-ink">Notifications</p>
          </div>

          {items === null ? (
            <p className="px-3 py-6 text-center text-small text-ink-muted">Loading…</p>
          ) : items.length === 0 ? (
            <p className="px-3 py-6 text-center text-small text-ink-muted">
              Nothing yet. You&rsquo;ll hear when a player starts wagering.
            </p>
          ) : (
            <ul className="max-h-[380px] overflow-y-auto">
              {items.map((n) => {
                const row = (
                  <>
                    <p className="text-small font-medium text-ink">{n.title}</p>
                    {n.body && (
                      <p className="mt-0.5 text-caption text-ink-muted">{n.body}</p>
                    )}
                    <p className="mt-1 text-caption text-ink-subtle">{ago(n.createdAt)}</p>
                  </>
                );

                return (
                  <li
                    key={n.id}
                    className={cn(
                      "border-b border-line last:border-0",
                      !n.readAt && "bg-accent-soft/40"
                    )}
                  >
                    {n.playerId ? (
                      <Link
                        href={`/book?player=${n.playerId}`}
                        onClick={() => setOpen(false)}
                        className="block px-3 py-2.5 transition-colors hover:bg-sunken"
                      >
                        {row}
                      </Link>
                    ) : (
                      <div className="px-3 py-2.5">{row}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/** Relative time, because "3h ago" is what you want to know, not a timestamp. */
function ago(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days}d ago`;
}

function Bell() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}
