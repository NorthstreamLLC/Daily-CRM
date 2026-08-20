"use client";

import { useEffect, useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import type { TeamMember } from "@/lib/admin";
import { Button, Card, Field, Notice, Select, cn } from "@/components/ui";
import { AlertTriangle, Check, Inbox } from "@/components/icons";
import { previewImport, runImport, type AdminState, type ImportPreview } from "../actions";

function CheckButton({ label, disabled }: { label: string; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" loading={pending} disabled={disabled}>
      {pending ? "Working…" : label}
    </Button>
  );
}

/**
 * CSV IMPORT, in two deliberate steps.
 *
 * Step one reads the file and reports exactly what it found. Step two writes
 * it. Nothing reaches the database until you have seen the row count, the
 * problems, and a sample of what will actually be created.
 *
 * The alternative - import and find out - is how a book ends up with rows
 * nobody trusts and no way to tell which ones.
 */
export function ImportForm({ team }: { team: TeamMember[] }) {
  const [preview, previewAction] = useFormState<ImportPreview | null, FormData>(
    previewImport,
    null
  );
  const [result, runAction] = useFormState<AdminState, FormData>(runImport, null);
  const router = useRouter();
  const lastImport = useRef<string | undefined>(undefined);

  /* An import that lands 300 players and leaves the batch list looking empty
     invites a second run of the same file. */
  useEffect(() => {
    if (!result?.message || result.message === lastImport.current) return;
    lastImport.current = result.message;
    router.refresh();
  }, [result?.message, router]);

  const [target, setTarget] = useState("");
  const [fileName, setFileName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const active = team.filter((u) => u.active);
  const ready = Boolean(preview?.ok && target);

  return (
    <div className="space-y-4">
      {/* Step 1 */}
      <Card>
        <h3 className="text-h3 font-semibold text-ink">1. Check the file</h3>
        <p className="mt-1 text-small text-ink-muted">
          Nothing is written yet. This reads the file and tells you what it found.
        </p>

        <form action={previewAction} className="mt-3 space-y-3">
          {/* The destination is chosen HERE, not in step 2.

              Without it the check could not look at the book it was importing
              into, so it happily reported "250 will import" and then the
              import silently skipped the forty who were already there. A dry
              run that does not know the destination cannot tell you what will
              happen - which is the entire job of a dry run. */}
          <Field
            label="Import into whose book?"
            htmlFor="preview_target"
            hint="Chosen first so the check can compare the file against this book and everyone else's."
          >
            <Select
              id="preview_target"
              name="target_user_id"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              required
            >
              <option value="">Choose a person…</option>
              {active.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.code}) — {u.bookSize.toLocaleString()} already
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="CSV file"
            htmlFor="file"
            hint="A header row is required. The 'Handle' column is the only one that must be present — everything else is optional."
          >
            <input
              ref={fileRef}
              id="file"
              name="file"
              type="file"
              accept=".csv,text/csv"
              required
              onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")}
              className="block w-full cursor-pointer rounded-control border border-line-strong
                         bg-surface text-body text-ink file:mr-3 file:cursor-pointer
                         file:border-0 file:border-r file:border-line-strong file:bg-sunken
                         file:px-3 file:py-2 file:text-body file:font-medium file:text-ink
                         hover:border-ink-subtle"
            />
          </Field>

          <div className="mt-3">
            <CheckButton label="Check file" disabled={!target} />
          </div>
        </form>

        {preview?.error && (
          <div className="mt-3">
            <Notice tone="danger">{preview.error}</Notice>
          </div>
        )}
      </Card>

      {/* Preview */}
      {preview && !preview.error && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-h3 font-semibold text-ink">{preview.filename}</h3>
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-caption font-medium",
                preview.ok ? "bg-success-soft text-success" : "bg-danger-soft text-danger"
              )}
            >
              {preview.ok ? <Check size={12} /> : <AlertTriangle size={12} />}
              {preview.willImport.toLocaleString()} of{" "}
              {preview.totalRows.toLocaleString()} rows will import
            </span>
          </div>

          <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Fact label="Rows in file" value={preview.totalRows.toLocaleString()} />
            <Fact label="Will import" value={preview.willImport.toLocaleString()} />
            <Fact
              label="Problems"
              value={preview.problems.length.toLocaleString()}
              tone={preview.problems.length > 0 ? "warning" : undefined}
            />
            <Fact
              label="Columns matched"
              value={String(Object.keys(preview.mapping).length)}
            />
          </dl>

          <div className="mt-4">
            <h4 className="mb-1.5 text-label font-semibold uppercase tracking-wide text-ink-subtle">
              Columns we recognised
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(preview.mapping).map(([field, index]) => (
                <span
                  key={field}
                  className="rounded bg-sunken px-2 py-1 text-caption text-ink-muted"
                >
                  <span className="font-medium text-ink">{preview.headers[index]}</span>
                  {" → "}
                  {field}
                </span>
              ))}
            </div>
            {preview.headers.length > Object.keys(preview.mapping).length && (
              <p className="mt-2 text-caption text-ink-subtle">
                Unrecognised columns are ignored, not lost — your original file is
                untouched.
              </p>
            )}
          </div>

          {preview.sample.length > 0 && (
            <div className="mt-4">
              <h4 className="mb-1.5 text-label font-semibold uppercase tracking-wide text-ink-subtle">
                First few rows, as they would be created
              </h4>
              <div className="overflow-x-auto rounded-control border border-line no-scrollbar">
                <table className="w-full min-w-[560px] text-left">
                  <thead>
                    <tr className="border-b border-line bg-sunken">
                      <Th>Handle</Th>
                      <Th>Roobet</Th>
                      <Th>Source</Th>
                      <Th>Status</Th>
                      <Th>Last contact</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.sample.map((row, i) => (
                      <tr key={i} className="border-b border-line last:border-0">
                        <Td>{row.handle}</Td>
                        <Td muted>{row.roobet_username || "—"}</Td>
                        <Td muted>{row.source || "—"}</Td>
                        <Td muted>{row.status}</Td>
                        <Td muted>{row.last_contact_at || "—"}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {preview.problems.length > 0 && (
            <div className="mt-4">
              <h4 className="mb-1.5 text-label font-semibold uppercase tracking-wide text-ink-subtle">
                Problems ({preview.problems.length})
              </h4>
              <ul className="max-h-56 space-y-1 overflow-y-auto rounded-control border border-line bg-sunken/50 p-3">
                {preview.problems.map((p, i) => (
                  <li key={i} className="text-caption text-ink-muted">
                    <span className="tabular font-medium text-ink">Row {p.row}</span>
                    {p.handle && <span className="text-ink"> · {p.handle}</span>} —{" "}
                    {p.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}

      {/* Step 2 */}
      <Card className={cn(!preview?.ok && "opacity-60")}>
        <h3 className="text-h3 font-semibold text-ink">2. Import it</h3>
        <p className="mt-1 text-small text-ink-muted">
          Choose the same file again — browsers don&rsquo;t let a page hold on to it
          between steps. It goes into{" "}
          <span className="font-medium text-ink">
            {active.find((u) => u.id === target)?.name ?? "the book you picked above"}
          </span>
          &rsquo;s book.
        </p>

        <form action={runAction} className="mt-3 space-y-3">
          <Field label="CSV file" htmlFor="import-file">
            <input
              id="import-file"
              name="file"
              type="file"
              accept=".csv,text/csv"
              required
              disabled={!preview?.ok}
              className="block w-full cursor-pointer rounded-control border border-line-strong
                         bg-surface text-body text-ink file:mr-3 file:cursor-pointer
                         file:border-0 file:border-r file:border-line-strong file:bg-sunken
                         file:px-3 file:py-2 file:text-body file:font-medium file:text-ink
                         hover:border-ink-subtle disabled:opacity-50"
            />
          </Field>

          {/* Carried from step 1 rather than asked twice. Two selects for the
              same thing is two chances for them to disagree, and the one that
              was checked would not be the one that was written. */}
          <input type="hidden" name="target_user_id" value={target} />

          <CheckButton
            label={
              preview?.ok
                ? `Import ${preview.willImport.toLocaleString()} players`
                : "Check a file first"
            }
            disabled={!ready}
          />
        </form>

        {result?.error && (
          <div className="mt-3">
            <Notice tone="danger">{result.error}</Notice>
          </div>
        )}
        {result?.message && (
          <div className="mt-3">
            <Notice tone="success">{result.message}</Notice>
          </div>
        )}
      </Card>

      {!preview && (
        <p className="flex items-center gap-2 text-small text-ink-subtle">
          <Inbox size={14} />
          Duplicates within the file and players already in that book are skipped
          automatically.
        </p>
      )}
    </div>
  );
}

function Fact({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "warning";
}) {
  return (
    <div>
      <dt className="text-caption text-ink-subtle">{label}</dt>
      <dd
        className={cn(
          "tabular text-h3 font-semibold",
          tone === "warning" ? "text-warning" : "text-ink"
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      scope="col"
      className="px-3 py-2 text-label font-medium uppercase tracking-wide text-ink-subtle"
    >
      {children}
    </th>
  );
}

function Td({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <td className={cn("px-3 py-2 text-small", muted ? "text-ink-muted" : "text-ink")}>
      {children}
    </td>
  );
}
