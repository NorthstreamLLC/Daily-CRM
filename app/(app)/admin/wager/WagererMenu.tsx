"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/components/ui";
import { AlertTriangle, BookOpen, Check, X } from "@/components/icons";
import { setWagererWatch } from "../../actions";

const money = (n: number) =>
  "$" + n.toLocaleString(undefined, { maximumFractionDigits: 0 });

/**
 * CLICK A WAGERER, DO SOMETHING ABOUT THEM.
 *
 * The first version of this was a small triangle that appeared on hover at the
 * left of the row. It worked, and nobody would ever have found it: a control
 * that is invisible until you hover the right cell is a control that does not
 * exist for anyone who was not told about it.
 *
 * The username is the thing people already want to click. So it is the button,
 * and everything you might do about that person is behind it.
 *
 * Watched wagerers carry a visible mark whether or not you are hovering,
 * because "who have I flagged" should be answerable by looking.
 */
export function WagererMenu({
  username,
  watching,
  playerId,
  handle,
  ownerName,
  status,
  periodLabel,
  wagered,
  allTime,
}: {
  username: string;
  watching: boolean;
  playerId: string | null;
  handle: string | null;
  ownerName: string | null;
  status: string | null;
  periodLabel: string;
  wagered: number;
  allTime: number;
}) {
  const [open, setOpen] = useState(false);
  const [on, setOn] = useState(watching);
  const [pending, start] = useTransition();
  const boxRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Server truth wins on re-render.
  useEffect(() => setOn(watching), [watching]);

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

  function toggleWatch() {
    const next = !on;
    setOn(next); // Optimistic - the server will almost certainly agree.
    start(async () => {
      const res = await setWagererWatch(username, next);
      if (res?.error) setOn(!next); // It did not.
      router.refresh();
    });
  }

  return (
    <div ref={boxRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-control px-1 -mx-1 text-body font-medium",
          "transition-colors duration-fast hover:bg-sunken",
          open ? "bg-sunken text-ink" : "text-ink"
        )}
      >
        {on && (
          <AlertTriangle
            size={12}
            className="shrink-0 text-warning"
            aria-label="On the watch list"
          />
        )}
        {username}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={username}
          className="absolute left-0 top-full z-50 mt-1 w-[290px] overflow-hidden
                     rounded-card border border-line-strong bg-surface shadow-card"
        >
          <div className="border-b border-line-strong px-3 py-2.5">
            <p className="truncate text-body font-semibold text-ink">{username}</p>
            <p className="mt-0.5 text-caption text-ink-subtle">
              {handle ? (
                <>
                  {handle}
                  {ownerName && ` · ${ownerName}`}
                  {status && ` · ${status}`}
                </>
              ) : (
                "Not in anyone's book"
              )}
            </p>
          </div>

          <dl className="grid grid-cols-2 border-b border-line-strong">
            <div className="border-r border-line-strong px-3 py-2">
              <dt className="text-caption text-ink-subtle">{periodLabel}</dt>
              <dd className="tabular text-body font-semibold text-ink">
                {money(wagered)}
              </dd>
            </div>
            <div className="px-3 py-2">
              <dt className="text-caption text-ink-subtle">All time</dt>
              <dd className="tabular text-body font-semibold text-ink">
                {money(allTime)}
              </dd>
            </div>
          </dl>

          <div className="p-2">
            <button
              type="button"
              onClick={toggleWatch}
              disabled={pending}
              className={cn(
                "flex w-full items-center gap-2 rounded-control px-2.5 py-2 text-left",
                "text-small font-medium transition-colors duration-fast",
                on
                  ? "text-ink-muted hover:bg-sunken hover:text-ink"
                  : "text-warning hover:bg-warning-soft",
                pending && "opacity-60"
              )}
            >
              {on ? <X size={14} /> : <AlertTriangle size={14} />}
              {on ? "Stop watching" : "Watch for a drop-off"}
            </button>

            {playerId ? (
              <Link
                href={`/book?player=${playerId}`}
                onClick={() => setOpen(false)}
                className="flex w-full items-center gap-2 rounded-control px-2.5 py-2
                           text-small font-medium text-accent transition-colors
                           duration-fast hover:bg-accent-soft"
              >
                <BookOpen size={14} />
                Open in the Book
              </Link>
            ) : (
              /* No player to open. Said plainly rather than shown as a dead
                 link - the whole reason this list exists is that most of these
                 people are in nobody's book. */
              <p className="px-2.5 py-2 text-caption text-ink-subtle">
                Nobody owns this username. Add them to a book from the Book
                page to track them properly.
              </p>
            )}
          </div>

          {on && (
            <p className="flex items-center gap-1.5 border-t border-line-strong
                          bg-warning-soft px-3 py-2 text-caption text-warning">
              <Check size={11} /> On the watch list
            </p>
          )}
        </div>
      )}
    </div>
  );
}
