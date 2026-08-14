"use client";

import { useEffect, useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { addPlayer, type ActionState } from "../actions";
import { Button, Card, Field, Input, Select, Textarea, Notice, cn } from "@/components/ui";
import { Check, Plus, X } from "@/components/icons";
import { AddModeTabs, BulkAdd } from "./BulkAdd";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" loading={pending}>
      {pending ? "Adding…" : label}
    </Button>
  );
}

/**
 * ADD A PLAYER.
 *
 * Two decisions the app must not make on your behalf:
 *
 *   Have you spoken to them? If yes, that is the first contact and they are not
 *   a task today. If no, they belong in today's queue with a tick box. Guessing
 *   either way means the queue lies about what is left to do.
 *
 *   What stage are they at? Usually a new lead, but a dead one being added for
 *   the record should not be dropped into the daily queue.
 *
 * The duplicate check runs on the server against every rep's book. A clash in
 * someone else's book is a warning rather than a block - two people can
 * genuinely share a handle across platforms - so the form offers to add anyway,
 * but only after saying whose book it is already in.
 */
export function AddPlayer({
  sources,
  defaultSource,
  statuses,
}: {
  sources: string[];
  defaultSource: string | null;
  statuses: { name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"one" | "many">("one");
  const [contacted, setContacted] = useState(true);
  const [state, formAction] = useFormState<ActionState, FormData>(addPlayer, null);

  const formRef = useRef<HTMLFormElement>(null);
  const handleRef = useRef<HTMLInputElement>(null);
  const lastMessage = useRef<string | undefined>(undefined);
  const router = useRouter();

  /**
   * Clear the form once a player is actually created.
   *
   * Reps add several people in a row, so the form stays open with the cursor
   * back in the handle field - but leaving the previous name sitting there is
   * how you end up adding the same person twice.
   */
  useEffect(() => {
    if (!state?.message || state.message === lastMessage.current) return;
    lastMessage.current = state.message;
    formRef.current?.reset();
    setContacted(true);
    handleRef.current?.focus();

    /* The server revalidated, but this component submitted the form and
       nothing told the surrounding server components to re-render. So the
       player appeared in the queue on the next navigation while the Active
       Leads counter above it still read the old number - the page
       contradicting itself, which is worse than either number being wrong.
    
       Third time this has bitten in this codebase: the status dropdown and the
       settings rows needed the same line. The rule is that revalidatePath
       marks the cache stale, and router.refresh() is what actually re-renders. */
    router.refresh();
  }, [state?.message, router]);

  if (!open) {
    return (
      <Button variant="primary" icon={<Plus size={15} />} onClick={() => setOpen(true)}>
        Add player
      </Button>
    );
  }

  if (mode === "many") {
    return (
      <div>
        <AddModeTabs mode={mode} onChange={setMode} />
        <BulkAdd
          sources={sources}
          defaultSource={defaultSource}
          statuses={statuses}
          onClose={() => setOpen(false)}
        />
      </div>
    );
  }

  return (
    <div>
      <AddModeTabs mode={mode} onChange={setMode} />
      <Card className="mb-4">
      <form ref={formRef} action={formAction}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-h3 font-semibold text-ink">Add a player</h3>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="inline-flex h-7 w-7 items-center justify-center rounded-control
                       text-ink-subtle hover:bg-sunken hover:text-ink"
          >
            <X size={15} />
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Player handle" htmlFor="handle">
            <Input
              ref={handleRef}
              id="handle"
              name="handle"
              required
              autoFocus
              autoComplete="off"
              placeholder="their username"
            />
          </Field>

          <Field label="Source" htmlFor="source">
            <Select id="source" name="source" defaultValue={defaultSource ?? ""}>
              <option value="">Not recorded</option>
              {sources.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Roobet username"
            htmlFor="roobet_username"
            hint="Blank if they haven't signed up — they'll stay in your queue daily."
          >
            <Input
              id="roobet_username"
              name="roobet_username"
              autoComplete="off"
              placeholder="optional"
            />
          </Field>

          <Field label="Stage" htmlFor="status" hint="Add a dead lead here just to keep track.">
            <Select id="status" name="status" defaultValue="Initial Contact">
              {statuses.map((s) => (
                <option key={s.name} value={s.name}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Notes" htmlFor="notes" className="sm:col-span-2 lg:col-span-4">
            <Textarea id="notes" name="notes" rows={2} placeholder="optional" />
          </Field>
        </div>

        {/* The one thing the app must not assume. */}
        <fieldset className="mt-3">
          <legend className="mb-1.5 text-label font-medium text-ink-muted">
            Have you contacted them yet?
          </legend>
          <div className="flex flex-wrap gap-2">
            <Choice
              checked={contacted}
              onSelect={() => setContacted(true)}
              title="Yes, I've reached out"
              body="Logs the contact. Not a task today."
            />
            <Choice
              checked={!contacted}
              onSelect={() => setContacted(false)}
              title="No, not yet"
              body="Goes into today's queue with a tick box."
            />
          </div>
          <input type="hidden" name="contacted" value={contacted ? "1" : "0"} />
        </fieldset>

        {/* Set once a clash has been reported, so the next submit goes through. */}
        <input type="hidden" name="force" value={state?.warning ? "1" : "0"} />

        <div className="mt-4 flex items-center gap-2">
          <Submit label={state?.warning ? "Add anyway" : "Add player"} />
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Done
          </Button>
        </div>

        {state?.error && (
          <div className="mt-3">
            <Notice tone="danger">{state.error}</Notice>
          </div>
        )}
        {state?.warning && (
          <div className="mt-3">
            <Notice tone="warning">{state.warning}</Notice>
          </div>
        )}
        {state?.message && (
          <div className="mt-3">
            <Notice tone="success">{state.message}</Notice>
          </div>
        )}
      </form>
      </Card>
    </div>
  );
}

/** A radio in everything but appearance - keyboard and screen readers included. */
function Choice({
  checked,
  onSelect,
  title,
  body,
}: {
  checked: boolean;
  onSelect: () => void;
  title: string;
  body: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onSelect}
      className={cn(
        "flex min-w-[220px] flex-1 items-start gap-2.5 rounded-control border px-3 py-2.5",
        "text-left transition-colors duration-fast",
        checked
          ? "border-accent bg-accent-soft"
          : "border-line-strong bg-surface hover:bg-sunken"
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2",
          checked ? "border-accent bg-accent text-white btn-on-accent" : "border-line-strong text-transparent"
        )}
      >
        <Check size={10} />
      </span>
      <span className="min-w-0">
        <span className={cn("block text-small font-medium", checked ? "text-accent" : "text-ink")}>
          {title}
        </span>
        <span className="block text-caption text-ink-subtle">{body}</span>
      </span>
    </button>
  );
}
