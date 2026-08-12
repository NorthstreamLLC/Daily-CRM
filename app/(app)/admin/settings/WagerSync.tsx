"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import type { WagerSource } from "@/lib/admin";
import { Badge, Button, Field, Input, Notice, Select, cn } from "@/components/ui";
import { Plus, RefreshCw, X } from "@/components/icons";
import {
  addWagerSource,
  deleteWagerSource,
  setWagerSourceActive,
  type AdminState,
} from "../actions";

type SourceResult = {
  name: string;
  entries: number;
  matched: number;
  unmatchedSample: string[];
  error?: string;
};

type BackfillResult = {
  name: string;
  months: number;
  snapshots: number;
  skipped: number;
  failedMonths: string[];
};

function AddSubmit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" loading={pending}>
      {pending ? "Adding…" : "Add source"}
    </Button>
  );
}

/**
 * WAGER SOURCES.
 *
 * Each leaderboard is a row: name, URL, its own key, and how the key is sent.
 * Keys are write-only from here - once saved, every read shows the last four
 * characters and nothing more.
 *
 * Sync runs every active source and reports per source, because "it worked"
 * from three leaderboards at once is useless the day one of them breaks.
 */
export function WagerSync({
  sources,
  cronReady,
}: {
  sources: WagerSource[];
  cronReady: boolean;
}) {
  const router = useRouter();

  const [adding, setAdding] = useState(sources.length === 0);
  const [authStyle, setAuthStyle] = useState("bearer");
  const [state, formAction] = useFormState<AdminState, FormData>(addWagerSource, null);

  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<SourceResult[] | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const [backfillMonth, setBackfillMonth] = useState("");
  const [backfilling, setBackfilling] = useState(false);
  const [backfillResults, setBackfillResults] = useState<BackfillResult[] | null>(null);
  const [backfillError, setBackfillError] = useState<string | null>(null);

  const [pending, start] = useTransition();
  const [rowResult, setRowResult] = useState<string | null>(null);

  const formRef = useRef<HTMLFormElement>(null);
  const lastMessage = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!state?.message || state.message === lastMessage.current) return;
    lastMessage.current = state.message;
    formRef.current?.reset();
    setAdding(false);
    router.refresh();
  }, [state?.message, router]);

  async function runBackfill() {
    setBackfilling(true);
    setBackfillResults(null);
    setBackfillError(null);
    try {
      const response = await fetch("/api/wager-backfill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startMonth: backfillMonth }),
      });
      const body = await response.json();
      if (body.error) setBackfillError(body.error);
      else setBackfillResults(body.results as BackfillResult[]);
      router.refresh();
    } catch (e) {
      setBackfillError((e as Error).message);
    } finally {
      setBackfilling(false);
    }
  }

  async function runSync() {
    setRunning(true);
    setResults(null);
    setSyncError(null);
    try {
      const response = await fetch("/api/wager-sync", { method: "POST" });
      const body = await response.json();
      if (body.error) setSyncError(body.error);
      else setResults(body.results as SourceResult[]);
      router.refresh();
    } catch (e) {
      setSyncError((e as Error).message);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="p-4">
      {/* Where this data comes from, said with the mark rather than words. */}
      <div className="mb-4 flex items-center gap-2.5 rounded-control bg-shell px-3 py-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/roobet-logo.png"
          alt="Roobet"
          width={806}
          height={300}
          className="h-4 w-auto"
        />
        <span className="text-caption text-shell-ink-muted">
          Affiliate stats API · weighted wager
        </span>
      </div>

      {/* Existing sources */}
      {sources.length > 0 && (
        <ul className="mb-4 overflow-hidden rounded-control border border-line">
          {sources.map((s) => (
            <li
              key={s.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line
                         px-3 py-2.5 last:border-0"
            >
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      "text-body font-medium",
                      s.active ? "text-ink" : "text-ink-subtle line-through"
                    )}
                  >
                    {s.name}
                  </span>
                  <span className="tabular text-caption text-ink-subtle">
                    key {s.keyMasked}
                  </span>
                  {!s.active && <Badge tone="neutral">Paused</Badge>}
                </p>
                <p className="truncate text-caption text-ink-subtle">{s.url}</p>
                {s.last_status && (
                  <p
                    className={cn(
                      "text-caption",
                      s.last_status.startsWith("Failed")
                        ? "text-danger"
                        : "text-success"
                    )}
                  >
                    Last sync: {s.last_status}
                  </p>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-1.5">
                <Button
                  size="sm"
                  loading={pending}
                  onClick={() =>
                    start(async () => {
                      const res = await setWagerSourceActive(s.id, !s.active);
                      setRowResult(res?.error ?? res?.message ?? null);
                    })
                  }
                >
                  {s.active ? "Pause" : "Enable"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<X size={13} />}
                  loading={pending}
                  onClick={() =>
                    start(async () => {
                      const res = await deleteWagerSource(s.id);
                      setRowResult(res?.error ?? res?.message ?? null);
                    })
                  }
                >
                  Remove
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {rowResult && (
        <div className="mb-3">
          <Notice tone="neutral">{rowResult}</Notice>
        </div>
      )}

      {/* Add a source */}
      {adding ? (
        <form
          ref={formRef}
          action={formAction}
          className="mb-4 rounded-control border border-line bg-sunken/50 p-3"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name" htmlFor="ws-name" hint="How it appears in snapshots.">
              <Input id="ws-name" name="name" required placeholder="RoobetCasinoRewards" />
            </Field>

            <Field label="Leaderboard URL" htmlFor="ws-url">
              <Input
                id="ws-url"
                name="url"
                type="url"
                required
                placeholder="https://…/leaderboard"
              />
            </Field>

            <Field label="API key" htmlFor="ws-key" hint="Stored admin-only, shown masked from now on.">
              <Input id="ws-key" name="api_key" required autoComplete="off" />
            </Field>

            <Field label="How is the key sent?" htmlFor="ws-auth">
              <Select
                id="ws-auth"
                name="auth_style"
                value={authStyle}
                onChange={(e) => setAuthStyle(e.target.value)}
              >
                <option value="bearer">Authorization: Bearer (most common)</option>
                <option value="header">Custom header</option>
                <option value="query">In the URL (?key=…)</option>
              </Select>
            </Field>

            {authStyle === "header" && (
              <Field label="Header name" htmlFor="ws-header">
                <Input id="ws-header" name="header_name" defaultValue="x-api-key" />
              </Field>
            )}
          </div>

          <div className="mt-3 flex items-center gap-2">
            <AddSubmit />
            {sources.length > 0 && (
              <Button type="button" variant="ghost" onClick={() => setAdding(false)}>
                Cancel
              </Button>
            )}
          </div>

          {state?.error && (
            <div className="mt-3">
              <Notice tone="danger">{state.error}</Notice>
            </div>
          )}
        </form>
      ) : (
        <Button
          variant="secondary"
          icon={<Plus size={15} />}
          onClick={() => setAdding(true)}
          className="mb-4"
        >
          Add source
        </Button>
      )}

      {/* Sync */}
      <div className="border-t border-line pt-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="primary"
            icon={<RefreshCw size={15} />}
            loading={running}
            disabled={sources.filter((s) => s.active).length === 0}
            onClick={runSync}
          >
            {running ? "Syncing…" : "Sync all sources now"}
          </Button>

          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-caption font-medium",
              cronReady ? "bg-success-soft text-success" : "bg-sunken text-ink-muted"
            )}
          >
            {cronReady ? "Runs automatically every hour" : "Automatic sync not set up"}
          </span>
        </div>

        {!cronReady && (
          <p className="mt-2 max-w-2xl text-caption text-ink-subtle">
            Set CRON_SECRET in your environment and the hourly schedule in
            vercel.json takes over once deployed. Until then this button is the
            only trigger — the day, week and month figures measure movement
            between syncs, so run it at least daily.
          </p>
        )}

        {syncError && (
          <div className="mt-3">
            <Notice tone="danger">{syncError}</Notice>
          </div>
        )}

        {results && (
          <div className="mt-3 space-y-2">
            {results.map((r) => (
              <div key={r.name}>
                {r.error ? (
                  <Notice tone="danger">
                    {r.name}: {r.error}
                  </Notice>
                ) : (
                  <Notice tone="success">
                    {r.name}: {r.matched} of {r.entries} entries matched a player.
                  </Notice>
                )}
                {!r.error && r.unmatchedSample.length > 0 && (
                  <p className="mt-1 text-caption text-ink-subtle">
                    Unmatched: {r.unmatchedSample.join(", ")} — usually a Roobet
                    username typo in someone&rsquo;s book.
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* History backfill */}
      <div className="mt-4 border-t border-line pt-4">
        <h4 className="text-label font-semibold uppercase tracking-wide text-ink-subtle">
          Backfill history
        </h4>
        <p className="mt-1 max-w-2xl text-small text-ink-muted">
          Rebuilds monthly wager history straight from Roobet, from the month you
          joined until now. One snapshot per player per month, so month-by-month
          figures work for the past too. Safe to run twice — months already written
          are skipped. Expect a minute or two per year of history.
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Input
            type="month"
            value={backfillMonth}
            onChange={(e) => setBackfillMonth(e.target.value)}
            aria-label="Month you joined Roobet"
            className="w-auto"
          />
          <Button
            variant="secondary"
            disabled={!backfillMonth || sources.filter((s) => s.active).length === 0}
            loading={backfilling}
            onClick={runBackfill}
          >
            {backfilling ? "Backfilling… don't close this tab" : "Backfill from this month"}
          </Button>
        </div>

        {backfillError && (
          <div className="mt-3">
            <Notice tone="danger">{backfillError}</Notice>
          </div>
        )}

        {backfillResults && (
          <div className="mt-3 space-y-2">
            {backfillResults.map((r) => (
              <div key={r.name}>
                <Notice tone={r.failedMonths.length > 0 ? "warning" : "success"}>
                  {r.name}: {r.snapshots} snapshots written across {r.months} months
                  {r.skipped > 0 && `, ${r.skipped} already existed`}
                  {r.failedMonths.length > 0 &&
                    ` — failed: ${r.failedMonths.join("; ")}`}
                </Notice>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
