"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Field, Notice, Select, Textarea, cn } from "@/components/ui";
import { X } from "@/components/icons";
import { bulkAddPlayers, type BulkAddResult } from "../actions";

/**
 * Twenty names from a Discord thread, in one go.
 *
 * The single-player form asks six questions per person. Pulling a list out of
 * a thread meant answering the same six questions twenty times, changing one
 * field each pass. Source and status are the same for a whole batch by
 * definition - they came from the same place at the same moment - so they get
 * asked once.
 *
 * Duplicates are shown rather than silently dropped: "I pasted 20 and got 17"
 * needs an answer.
 */
export function BulkAdd({
  sources,
  defaultSource,
  statuses,
  onClose,
}: {
  sources: string[];
  defaultSource: string | null;
  statuses: { name: string }[];
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [source, setSource] = useState(defaultSource ?? sources[0] ?? "");
  const [status, setStatus] = useState(statuses[0]?.name ?? "");
  const [contacted, setContacted] = useState(false);
  const [result, setResult] = useState<BulkAddResult | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  // Same parsing the server does, so the count on screen is the real count.
  const parsed = Array.from(
    new Set(
      text
        .split(/[\n,\t]+/)
        .map((h) => h.trim().replace(/^@/, ""))
        .filter(Boolean)
    )
  );

  function submit() {
    start(async () => {
      const res = await bulkAddPlayers(text, source, status, contacted);
      setResult(res);
      if (!res.error && res.added.length > 0) {
        setText("");
        router.refresh();
      }
    });
  }

  return (
    <Card className="mb-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-h3 font-semibold text-ink">Add several at once</h3>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded-control p-1 text-ink-subtle hover:bg-sunken hover:text-ink"
        >
          <X size={15} />
        </button>
      </div>

      <Field
        label="Handles"
        hint="One per line, or separated by commas. A leading @ is fine."
      >
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          placeholder={"szefo0\ntg_jonathan\n@tarikogut"}
          aria-label="Handles to add"
        />
      </Field>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="Source" htmlFor="bulk-source">
          <Select
            id="bulk-source"
            value={source}
            onChange={(e) => setSource(e.target.value)}
          >
            {sources.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Status" htmlFor="bulk-status">
          <Select
            id="bulk-status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            {statuses.map((s) => (
              <option key={s.name} value={s.name}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {/* Same question the single form asks, once for the batch. */}
      <label className="mt-3 flex items-center gap-2 text-body text-ink">
        <input
          type="checkbox"
          checked={contacted}
          onChange={(e) => setContacted(e.target.checked)}
          className="h-4 w-4 rounded border-line-strong"
        />
        I have already messaged all of these
      </label>
      <p className="mt-1 text-caption text-ink-subtle">
        Leave unticked and they appear in tomorrow&rsquo;s queue as a task.
      </p>

      <div className="mt-4 flex items-center gap-3">
        <Button
          variant="primary"
          disabled={parsed.length === 0}
          loading={pending}
          onClick={submit}
        >
          Add {parsed.length > 0 ? parsed.length : ""}{" "}
          {parsed.length === 1 ? "player" : "players"}
        </Button>
        {parsed.length > 0 && (
          <span className="text-caption text-ink-subtle">
            {parsed.length} unique {parsed.length === 1 ? "handle" : "handles"} found
          </span>
        )}
      </div>

      {result?.error && (
        <div className="mt-3">
          <Notice tone="danger">{result.error}</Notice>
        </div>
      )}

      {result?.message && !result.error && (
        <div className="mt-3 space-y-2">
          <Notice tone="success">{result.message}</Notice>

          {result.duplicates.length > 0 && (
            <div className="rounded-card border border-line-strong bg-sunken/50 p-3">
              <p className="mb-1 text-small font-medium text-ink">Skipped</p>
              <ul className="space-y-0.5">
                {result.duplicates.map((d) => (
                  <li key={d.handle} className="text-caption text-ink-muted">
                    <span className="font-medium text-ink">{d.handle}</span> — {d.where}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

/** Toggles between the single form and the paste box. */
export function AddModeTabs({
  mode,
  onChange,
}: {
  mode: "one" | "many";
  onChange: (m: "one" | "many") => void;
}) {
  return (
    <div className="mb-3 flex gap-1">
      {(["one", "many"] as const).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          className={cn(
            "rounded-control px-2.5 py-1 text-small font-medium transition-colors",
            mode === m
              ? "bg-accent text-white btn-on-accent"
              : "text-ink-muted hover:bg-sunken hover:text-ink"
          )}
        >
          {m === "one" ? "One player" : "Paste a list"}
        </button>
      ))}
    </div>
  );
}
