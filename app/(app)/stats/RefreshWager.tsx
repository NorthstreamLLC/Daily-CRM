"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/components/ui";
import { RefreshCw } from "@/components/icons";

/**
 * "These figures are stale" - answered where the figures are.
 *
 * The wager table reads stored facts, so it is only ever as fresh as the last
 * sync. When a number looked wrong the only way to do anything about it was
 * Admin > Settings > Wager, which is three clicks away from the table you are
 * doubting and does not tell you it worked in terms of that table.
 *
 * Isac asked for a refresh on each row. There is no such thing: Roobet answers
 * with a whole leaderboard for a window, so one player costs one request and
 * so does everybody. This refetches the windows the table is showing - the
 * current month, the current leaderboard cycle, and all time - and fills in
 * any past cycle the database has never held.
 *
 * Admin only. It spends real API calls and can take a minute on the first run.
 */
export function RefreshWager() {
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function run() {
    setRunning(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/wager-cycles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cycles: 12 }),
      });
      const body = await response.json();
      if (body.error) setError(String(body.error));
      else {
        setMessage(String(body.message));
        /* revalidatePath marks the cache stale; this is what re-renders. The
           distinction has cost an afternoon in this codebase already. */
        router.refresh();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={run}
        disabled={running}
        title="Ask Roobet again for this month, this leaderboard cycle and all time. For everything including missing days, use Sync everything in Admin > Settings > Wager."
        className={cn(
          "inline-flex items-center gap-1.5 rounded-control border border-line px-2.5 py-1",
          "text-small font-medium text-ink-muted transition-colors duration-fast",
          "hover:border-accent hover:text-accent disabled:opacity-50"
        )}
      >
        <RefreshCw size={12} className={running ? "animate-spin" : undefined} />
        {running ? "Refreshing…" : "Refresh figures"}
      </button>

      {/* The first press has a year of cycles to fetch and no way to hurry it.
          Saying so beats a button that looks stuck. */}
      {running && (
        <span className="text-caption text-ink-subtle">
          Fetching each window from every source — up to a minute.
        </span>
      )}
      {message && !running && (
        <span className="text-caption text-success">{message}</span>
      )}
      {error && !running && <span className="text-caption text-danger">{error}</span>}
    </div>
  );
}
