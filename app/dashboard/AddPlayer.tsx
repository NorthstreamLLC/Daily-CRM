"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { addPlayer, type ActionState } from "./actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-navy px-4 py-2 text-sm font-semibold text-white
                 transition hover:opacity-90 disabled:opacity-50"
    >
      {pending ? "Adding…" : "Add player"}
    </button>
  );
}

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
      <button
        onClick={() => setOpen(true)}
        className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm
                   font-medium text-slate-700 transition hover:bg-slate-50"
      >
        + Add player
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <form action={formAction} className="flex flex-wrap items-end gap-3">
        <div className="min-w-[180px] flex-1">
          <label className="block text-xs font-medium text-slate-600">
            Player handle
          </label>
          <input
            name="handle"
            required
            autoFocus
            placeholder="their username"
            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm
                       outline-none focus:border-navy"
          />
        </div>

        <div className="w-40">
          <label className="block text-xs font-medium text-slate-600">Source</label>
          <select
            name="source"
            defaultValue={defaultSource ?? ""}
            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5
                       text-sm outline-none focus:border-navy"
          >
            <option value="">—</option>
            {sources.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div className="w-44">
          <label className="block text-xs font-medium text-slate-600">
            Roobet username
          </label>
          <input
            name="roobet_username"
            placeholder="optional"
            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm
                       outline-none focus:border-navy"
          />
        </div>

        <Submit />
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="px-2 py-2 text-sm text-slate-500 hover:text-slate-700"
        >
          Cancel
        </button>
      </form>

      {state?.error && (
        <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}
      {state?.message && (
        <p className="mt-3 rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
          {state.message}
        </p>
      )}
    </div>
  );
}
