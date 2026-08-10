import { Card, EmptyState, SectionHeader, cn } from "@/components/ui";
import { History, Inbox } from "@/components/icons";
import { getMe } from "@/lib/queries";
import { getImportHistory, getTeam } from "@/lib/admin";
import { formatDateTime } from "@/lib/time";
import { ImportForm } from "./ImportForm";
import { UndoImport } from "./UndoImport";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const me = await getMe();
  if (!me) return null;

  const [team, history] = await Promise.all([getTeam(), getImportHistory()]);
  const active = team.filter((u) => u.active);

  return (
    <>
      <div className="mb-5">
        <h2 className="text-h2 font-semibold tracking-tight text-ink">Import &amp; export</h2>
        <p className="mt-0.5 max-w-2xl text-body text-ink-muted">
          Bring the spreadsheets across, and take the data back out whenever you want
          it. Nothing here is one-way.
        </p>
      </div>

      {/* Export */}
      <section className="mb-10">
        <SectionHeader
          title="Export"
          hint="Downloads a CSV that this importer can read back in — so an export is also a backup."
        />
        <Card>
          <div className="flex flex-wrap items-center gap-2">
            <a
              href="/api/export?scope=company"
              className="inline-flex h-9 items-center gap-1.5 rounded-control bg-accent px-3.5
                         text-body font-medium text-white transition-colors duration-fast
                         hover:bg-accent-hover"
            >
              Export everyone
            </a>
            <span className="text-small text-ink-muted">or one person:</span>
            {active.map((u) => (
              <a
                key={u.id}
                href={`/api/export?owner=${u.id}`}
                className="inline-flex h-9 items-center rounded-control border border-line-strong
                           bg-surface px-3 text-small font-medium text-ink-muted
                           transition-colors duration-fast hover:bg-sunken hover:text-ink"
              >
                {u.name}
                <span className="tabular ml-1.5 text-ink-subtle">
                  {u.bookSize.toLocaleString()}
                </span>
              </a>
            ))}
          </div>
        </Card>
      </section>

      {/* Import */}
      <section className="mb-10">
        <SectionHeader
          title="Import"
          hint="Checked first, written second. You see exactly what will happen before anything is created."
        />
        <ImportForm team={team} />
      </section>

      {/* History */}
      <section>
        <SectionHeader
          title="Import history"
          count={history.length}
          hint="Every run is recorded with what was skipped and why."
        />

        {history.length === 0 ? (
          <EmptyState
            icon={<Inbox size={18} />}
            title="Nothing imported yet"
            body="Runs appear here with their row counts and any rejections, so an import can always be traced."
          />
        ) : (
          <div className="space-y-2">
            {history.map((batch) => (
              <Card key={batch.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-body font-medium text-ink">
                      {batch.filename ?? "Untitled file"}
                    </p>
                    <p className="mt-0.5 text-caption text-ink-subtle">
                      Into {batch.targetName} ·{" "}
                      {formatDateTime(batch.created_at, me.timezone)}
                    </p>
                    <p className="mt-1.5 flex flex-wrap gap-x-3 text-small">
                      <span className="text-success">
                        {batch.rows_imported.toLocaleString()} imported
                      </span>
                      {batch.rows_rejected > 0 && (
                        <span className="text-warning">
                          {batch.rows_rejected.toLocaleString()} skipped
                        </span>
                      )}
                      <span className="text-ink-subtle">
                        {batch.rows_total.toLocaleString()} in file
                      </span>
                    </p>
                  </div>

                  {batch.rows_imported > 0 && (
                    <UndoImport batchId={batch.id} count={batch.rows_imported} />
                  )}
                </div>

                {batch.rejections.length > 0 && (
                  <details className="mt-3">
                    <summary
                      className="cursor-pointer text-small font-medium text-accent
                                 underline-offset-2 hover:underline"
                    >
                      <span className="inline-flex items-center gap-1.5">
                        <History size={13} />
                        See why {batch.rejections.length.toLocaleString()} rows were
                        skipped
                      </span>
                    </summary>
                    <ul
                      className={cn(
                        "mt-2 max-h-56 space-y-1 overflow-y-auto rounded-control",
                        "border border-line bg-sunken/50 p-3"
                      )}
                    >
                      {batch.rejections.map((r, i) => (
                        <li key={i} className="text-caption text-ink-muted">
                          <span className="tabular font-medium text-ink">Row {r.row}</span>
                          {r.handle && <span className="text-ink"> · {r.handle}</span>} —{" "}
                          {r.reason}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </Card>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
