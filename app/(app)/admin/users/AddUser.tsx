"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { createUser, type AdminState } from "../actions";
import { Button, Card, Field, Input, Select, Notice } from "@/components/ui";
import { Plus, X } from "@/components/icons";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" loading={pending}>
      {pending ? "Creating…" : "Create person"}
    </Button>
  );
}

/** A readable temporary password. They're told to change it on first sign-in. */
function suggestPassword() {
  const words = ["amber", "harbour", "willow", "cobalt", "meadow", "cinder", "quartz", "lantern"];
  const pick = () => words[Math.floor(Math.random() * words.length)];
  return `${pick()}-${pick()}-${Math.floor(1000 + Math.random() * 9000)}`;
}

export function AddUser({
  sources,
  timezones,
  serviceRoleReady,
  serviceRoleHelp,
}: {
  sources: string[];
  timezones: string[];
  serviceRoleReady: boolean;
  serviceRoleHelp: string;
}) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState(suggestPassword);
  const [state, formAction] = useFormState<AdminState, FormData>(createUser, null);

  if (!open) {
    return (
      <Button variant="primary" icon={<Plus size={15} />} onClick={() => setOpen(true)}>
        Add person
      </Button>
    );
  }

  return (
    <Card className="mb-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-h3 font-semibold text-ink">Add someone to the team</h3>
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

      {!serviceRoleReady && (
        <div className="mb-4">
          <Notice tone="warning">
            Creating logins needs the service role key. {serviceRoleHelp}
          </Notice>
        </div>
      )}

      <form action={formAction}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Name" htmlFor="name">
            <Input id="name" name="name" required autoComplete="off" placeholder="Chella" />
          </Field>

          <Field
            label="Code"
            htmlFor="code"
            hint="2–4 letters. Prefixes their player references, e.g. CH-0001."
          >
            <Input
              id="code"
              name="code"
              required
              maxLength={4}
              autoComplete="off"
              placeholder="CH"
              className="uppercase"
            />
          </Field>

          <Field label="Email" htmlFor="email">
            <Input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="off"
              placeholder="name@example.com"
            />
          </Field>

          <Field label="Role" htmlFor="role">
            <Select id="role" name="role" defaultValue="user">
              <option value="user">Rep — their own book only</option>
              <option value="admin">Admin — plus company views and settings</option>
            </Select>
          </Field>

          <Field
            label="Time zone"
            htmlFor="timezone"
            hint="Decides what 'today' means for them."
          >
            <Select id="timezone" name="timezone" defaultValue="America/New_York">
              {timezones.map((tz) => (
                <option key={tz} value={tz}>
                  {tz.replace("_", " ")}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Default source" htmlFor="default_source">
            <Select id="default_source" name="default_source" defaultValue="">
              <option value="">None</option>
              {sources.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Temporary password"
            htmlFor="password"
            hint="Send it to them privately. They should change it on first sign-in."
            className="sm:col-span-2"
          >
            <div className="flex gap-2">
              <Input
                id="password"
                name="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                required
                autoComplete="off"
              />
              <Button type="button" onClick={() => setPassword(suggestPassword())}>
                New
              </Button>
            </div>
          </Field>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <Submit />
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>

        {state?.error && (
          <div className="mt-3">
            <Notice tone="danger">{state.error}</Notice>
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
