"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/components/ui";
import { AlertTriangle } from "@/components/icons";
import { setWagererWatch } from "../../actions";

/**
 * FLAG A WAGERER AS ONE TO WATCH.
 *
 * Works for anyone on the list, in a book or not - which is the point. Of the
 * ~880 people wagering on the codes, about twenty are in somebody's book, and
 * the other 860 are exactly the ones nobody notices going quiet.
 *
 * Optimistic: the icon fills the instant it is clicked. A round trip to
 * confirm something the server will almost certainly accept is a round trip
 * spent watching a spinner.
 */
export function WatchWagerer({
  username,
  watching,
}: {
  username: string;
  watching: boolean;
}) {
  const [on, setOn] = useState(watching);
  const [pending, start] = useTransition();
  const router = useRouter();

  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? `Stop watching ${username}` : `Watch ${username}`}
      title={
        on
          ? "On the watch list — click to remove"
          : "Watch this wagerer for a drop-off"
      }
      disabled={pending}
      onClick={() => {
        const next = !on;
        setOn(next); // Optimistic.
        start(async () => {
          const res = await setWagererWatch(username, next);
          // Put it back if the server disagreed.
          if (res?.error) setOn(!next);
          router.refresh();
        });
      }}
      className={cn(
        "inline-flex h-6 w-6 items-center justify-center rounded-control",
        "transition-colors duration-fast",
        on
          ? "bg-warning-soft text-warning"
          : "text-ink-subtle opacity-0 hover:bg-sunken hover:text-ink group-hover:opacity-100",
        pending && "opacity-60"
      )}
    >
      <AlertTriangle size={13} />
    </button>
  );
}
