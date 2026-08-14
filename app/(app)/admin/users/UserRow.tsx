"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { TeamMember } from "@/lib/admin";
import { Badge, Button, Field, Input, Select, Notice, cn } from "@/components/ui";
import { ChevronDown, Shield } from "@/components/icons";
import { reassignBook, sendPasswordReset, setTargets, updateUser } from "../actions";

/**
 * One person, with everything about them editable in place.
 *
 * Deliberately not a modal. Editing five people's targets in a row means five
 * open-and-close cycles through a dialog, where an inline panel lets you work
 * straight down the list.
 */
export function UserRow({
  user,
  everyone,
  sources,
  timezones,
  isMe,
}: {
  user: TeamMember;
  everyone: TeamMember[];
  sources: string[];
  timezones: string[];
  isMe: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ error?: string; message?: string } | null>(null);

  const [name, setName] = useState(user.name);
  const [timezone, setTimezone] = useState(user.timezone);
  const [defaultSource, setDefaultSource] = useState(user.default_source ?? "");

  const [leads, setLeads] = useState(String(user.targets.activeLeads));
  const [vip, setVip] = useState(String(user.targets.vipTransfers));
  const [ftd, setFtd] = useState(String(user.targets.ftds));
  const [outreach, setOutreach] = useState(String(user.targets.outreach));

  const [reassignTo, setReassignTo] = useState("");
  const router = useRouter();

  function run(fn: () => Promise<{ error?: string; message?: string } | null>) {
    start(async () => {
      const res = await fn();
      setResult(res);
    /* revalidatePath marks the server cache stale; router.refresh() is what
       re-renders. Without it the change lands in the database and the screen
       keeps showing the old value until a manual reload. */
      if (!res?.error) router.refresh();
    });
  }

  const otherActive = everyone.filter((u) => u.id !== user.id && u.active);

  return (
    <div
      className={cn(
        "overflow-hidden rounded-card border bg-surface shadow-card",
        user.active ? "border-line" : "border-line bg-sunken/40"
      )}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 p-3 sm:p-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "font-medium",
                user.active ? "text-ink" : "text-ink-subtle line-through"
              )}
            >
              {user.name}
            </span>
            <span className="tabular text-caption text-ink-subtle">{user.code}</span>
            {user.role === "admin" && (
              <Badge tone="accent" icon={<Shield size={11} />}>
                Admin
              </Badge>
            )}
            {!user.active && <Badge tone="neutral">Deactivated</Badge>}
            {isMe && <Badge tone="success">You</Badge>}
          </div>
          <p className="mt-0.5 truncate text-caption text-ink-subtle">
            {user.email} · {user.timezone.replace("_", " ")} ·{" "}
            {user.bookSize.toLocaleString()} in book
          </p>
        </div>

        <div className="hidden items-center gap-4 text-caption text-ink-subtle md:flex">
          <Stat label="Leads" value={user.targets.activeLeads} />
          <Stat label="VIP" value={user.targets.vipTransfers} />
          <Stat label="FTD" value={user.targets.ftds} />
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className={cn(
            "inline-flex h-8 items-center gap-1 rounded-control px-2.5 text-small font-medium",
            "transition-colors duration-fast",
            open ? "bg-accent-soft text-accent" : "text-ink-muted hover:bg-sunken hover:text-ink"
          )}
        >
          {open ? "Close" : "Manage"}
          <ChevronDown size={14} className={cn(open && "rotate-180")} />
        </button>
      </div>

      {open && (
        <div className="space-y-5 border-t border-line bg-sunken/50 p-4">
          {/* Details */}
          <div>
            <h4 className="mb-2 text-label font-semibold uppercase tracking-wide text-ink-subtle">
              Details
            </h4>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Name">
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
              <Field label="Time zone" hint="Decides what 'today' means for them.">
                <Select value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                  {timezones.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz.replace("_", " ")}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Default source">
                <Select
                  value={defaultSource}
                  onChange={(e) => setDefaultSource(e.target.value)}
                >
                  <option value="">None</option>
                  {sources.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Button
              className="mt-3"
              variant="primary"
              size="sm"
              loading={pending}
              onClick={() =>
                run(() =>
                  updateUser(user.id, {
                    name: name.trim(),
                    timezone,
                    default_source: defaultSource || null,
                  })
                )
              }
            >
              Save details
            </Button>
          </div>

          {/* Targets */}
          <div className="border-t border-line pt-4">
            <h4 className="mb-1 text-label font-semibold uppercase tracking-wide text-ink-subtle">
              Daily targets
            </h4>
            <p className="mb-2 text-caption text-ink-subtle">
              Saved as a new dated record, so raising a target never makes last month
              look like a failure.
              {user.targets.effectiveFrom && ` In force since ${user.targets.effectiveFrom}.`}
            </p>
            <div className="grid gap-3 sm:grid-cols-4">
              <Field label="Active leads">
                <Input
                  type="number"
                  min={0}
                  value={leads}
                  onChange={(e) => setLeads(e.target.value)}
                />
              </Field>
              <Field label="VIP transfers">
                <Input type="number" min={0} value={vip} onChange={(e) => setVip(e.target.value)} />
              </Field>
              <Field label="First deposits">
                <Input type="number" min={0} value={ftd} onChange={(e) => setFtd(e.target.value)} />
              </Field>
              <Field label="Outreach">
                <Input
                  type="number"
                  min={0}
                  value={outreach}
                  onChange={(e) => setOutreach(e.target.value)}
                />
              </Field>
            </div>
            <Button
              className="mt-3"
              variant="primary"
              size="sm"
              loading={pending}
              onClick={() =>
                run(() =>
                  setTargets(user.id, {
                    activeLeads: Number(leads),
                    vipTransfers: Number(vip),
                    ftds: Number(ftd),
                    outreach: Number(outreach),
                  })
                )
              }
            >
              Save targets
            </Button>
          </div>

          {/* Access */}
          <div className="border-t border-line pt-4">
            <h4 className="mb-2 text-label font-semibold uppercase tracking-wide text-ink-subtle">
              Access
            </h4>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                loading={pending}
                onClick={() =>
                  run(() =>
                    sendPasswordReset(user.id, user.email, window.location.origin)
                  )
                }
              >
                Send password reset
              </Button>

              {!isMe && (
                <Button
                  size="sm"
                  loading={pending}
                  icon={<Shield size={14} />}
                  onClick={() =>
                    run(() =>
                      updateUser(user.id, {
                        role: user.role === "admin" ? "user" : "admin",
                      })
                    )
                  }
                >
                  {user.role === "admin" ? "Remove admin" : "Make admin"}
                </Button>
              )}

              {!isMe && (
                <Button
                  size="sm"
                  variant={user.active ? "danger" : "secondary"}
                  loading={pending}
                  onClick={() => run(() => updateUser(user.id, { active: !user.active }))}
                >
                  {user.active ? "Deactivate" : "Reactivate"}
                </Button>
              )}
            </div>
            <p className="mt-2 text-caption text-ink-subtle">
              Deactivating blocks sign-in and hides them from the app. Their players,
              history and past numbers stay exactly as they are — nothing is deleted.
              {isMe && " You can't change your own access."}
            </p>
          </div>

          {/* Reassign */}
          {user.bookSize > 0 && otherActive.length > 0 && (
            <div className="border-t border-line pt-4">
              <h4 className="mb-1 text-label font-semibold uppercase tracking-wide text-ink-subtle">
                Move their book
              </h4>
              <p className="mb-2 text-caption text-ink-subtle">
                Hands all {user.bookSize.toLocaleString()} players to someone else. Do this
                before deactivating a leaver so nobody is left unworked.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Select
                  value={reassignTo}
                  onChange={(e) => setReassignTo(e.target.value)}
                  className="w-auto min-w-[180px]"
                  aria-label="Move book to"
                >
                  <option value="">Choose a person…</option>
                  {otherActive.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.code})
                    </option>
                  ))}
                </Select>
                <Button
                  size="sm"
                  variant="primary"
                  disabled={!reassignTo}
                  loading={pending}
                  onClick={() => run(() => reassignBook(user.id, reassignTo))}
                >
                  Move {user.bookSize.toLocaleString()} players
                </Button>
              </div>
            </div>
          )}

          {result?.error && <Notice tone="danger">{result.error}</Notice>}
          {result?.message && <Notice tone="success">{result.message}</Notice>}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className="tabular text-small font-medium text-ink">{value}</span>
      <span className="text-caption">{label}</span>
    </span>
  );
}
