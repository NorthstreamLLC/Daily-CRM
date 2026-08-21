import { Card, EmptyState, SectionHeader, cn } from "@/components/ui";
import { AlertTriangle, History, Inbox } from "@/components/icons";
import { getMe } from "@/lib/queries";
import { getImportHistory, getTeam, type ImportBatch } from "@/lib/admin";
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
              /* An undone import stays in the list, greyed, saying so.
                 Removing the row would claim it never happened; leaving it
                 unchanged claimed its players were still here. Neither is
                 true, and this log is the only record of where a book's
                 players came from. */
              <Card key={batch.id} className={cn(batch.undone_at && "opacity-60")}>
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
                      {batch.undone_at ? (
                        <span className="text-ink-subtle line-through">
                          {batch.rows_imported.toLocaleString()} imported
                        </span>
                      ) : (
                        <span className="text-success">
                          {batch.rows_imported.toLocaleString()} imported
                        </span>
                      )}
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

                  {batch.undone_at ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-sunken
                                     px-2.5 py-1 text-caption font-medium text-ink-muted">
                      Undone {formatDateTime(batch.undone_at, me.timezone)}
                    </span>
                  ) : (
                    batch.rows_imported > 0 && (
                      <UndoImport batchId={batch.id} count={batch.rows_imported} />
                    )
                  )}
                </div>

                {batch.rejections.length > 0 &&
                  (() => {
                    /* Two lists, not one.

                       A row with an unreadable date IS imported - the date is
                       just left empty. Listing it under "why N rows were
                       skipped" made a book that imported perfectly look like a
                       book that had failed, which is how this was reported:
                       "But these didn't go in bc of the date?? wtf".

                       Older batches carry no kind. They are treated as
                       skipped, which is what the report called them at the
                       time. */
                    const skipped = batch.rejections.filter(
                      (r) => (r.kind ?? "skipped") === "skipped"
                    );
                    const noted = batch.rejections.filter((r) => r.kind === "imported");

                    const list = (
                      rows: ImportBatch["rejections"],
                      tone: "skipped" | "imported"
                    ) => (
                      <ul
                        className={cn(
                          "mt-2 max-h-56 space-y-1 overflow-y-auto rounded-control p-3",
                          tone === "skipped"
                            ? "border border-line bg-sunken/50"
                            : "border border-warning/25 bg-warning-soft/40"
                        )}
                      >
                        {rows.map((r, i) => (
                          <li key={i} className="text-caption text-ink-muted">
                            {r.row > 0 && (
                              <span className="tabular font-medium text-ink">
                                Row {r.row}
                              </span>
                            )}
                            {r.handle && <span className="text-ink"> · {r.handle}</span>}
                            {r.row > 0 ? " — " : ""}
                            {r.reason}
                          </li>
                        ))}
                      </ul>
                    );

                    return (
                      <div className="mt-3 space-y-2">
                        {skipped.length > 0 && (
                          <details>
                            <summary
                              className="cursor-pointer text-small font-medium text-accent
                                         underline-offset-2 hover:underline"
                            >
                              <span className="inline-flex items-center gap-1.5">
                                <History size={13} />
                                {skipped.length.toLocaleString()} rows were skipped
                              </span>
                            </summary>
                            {list(skipped, "skipped")}
                          </details>
                        )}

                        {noted.length > 0 && (
                          <details>
                            <summary
                              className="cursor-pointer text-small font-medium text-warning
                                         underline-offset-2 hover:underline"
                            >
                              <span className="inline-flex items-center gap-1.5">
                                <AlertTriangle size={13} />
                                {noted.length.toLocaleString()} imported, with something
                                worth knowing
                              </span>
                            </summary>
                            {list(noted, "imported")}
                          </details>
                        )}
                      </div>
                    );
                  })()}
              </Card>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
