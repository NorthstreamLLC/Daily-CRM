"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { addPlayer, type ActionState } from "../actions";
import { Button, Field, Input, Select, Textarea, Notice, Card } from "@/components/ui";
import { Plus, X } from "@/components/icons";

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
 * The duplicate check runs on the server against every rep's book, not just
 * yours. A clash in someone else's book is a warning rather than a block -
 * two people can genuinely share a handle across platforms - so the form
 * offers to add anyway, but only after saying whose book it is already in.
 */
export function AddPlayer({
  sources,
  defaultSource,
}: {
  sources: string[];
  defaultSource: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useFormState<ActionState, FormData>(addPlayer, null);

  if (!open) {
    return (
      <Button variant="primary" icon={<Plus size={15} />} onClick={() => setOpen(true)}>
        Add player
      </Button>
    );
  }

  return (
    <Card className="mb-3">
      <form action={formAction}>
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
          <Field label="Player handle" htmlFor="handle" className="lg:col-span-1">
            <Input
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
            hint="Leave blank if they haven't signed up — they'll stay in your queue daily."
          >
            <Input
              id="roobet_username"
              name="roobet_username"
              autoComplete="off"
              placeholder="optional"
            />
          </Field>

          <Field label="Notes" htmlFor="notes">
            <Textarea id="notes" name="notes" rows={1} placeholder="optional" />
          </Field>
        </div>

        {/* Set by the "add anyway" button when a clash was reported. */}
        <input type="hidden" name="force" value={state?.warning ? "1" : "0"} />

        <div className="mt-3 flex items-center gap-2">
          <Submit label={state?.warning ? "Add anyway" : "Add player"} />
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
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
  );
}
