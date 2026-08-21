import Link from "next/link";
import { Card, EmptyState, Notice, SectionHeader, cn } from "@/components/ui";
import { TrendingUp, Users, Wallet } from "@/components/icons";
import { getMe } from "@/lib/queries";
import {
  getRepPeriods,
  getTeam,
  getWagerOverview,
  getWagerPeriods,
  getWagerReport,
  resolveReportPeriod,
} from "@/lib/admin";
import { getChurn } from "@/lib/churn";
import { ReportControls } from "./ReportControls";
import { DateRangeWager } from "./DateRangeWager";
import { RetireUnclaimed } from "./RetireUnclaimed";
import { WagererTable } from "./WagererTable";
import { ChurnList } from "../../ChurnList";
import { AutoSync } from "./AutoSync";
import { WagerTrend } from "./WagerTrend";

export const dynamic = "force-dynamic";

const money = (n: number) =>
  "$" + n.toLocaleString(undefined, { maximumFractionDigits: 0 });

/**
 * WAGER - the company's numbers.
 *
 * Every figure here is a fact Roobet returned for an exact UTC window, not a
 * difference between two readings. That is what makes "this month" right on
 * the first sync, and what lets the same number appear in more than one place
 * without the two disagreeing.
 *
 * There is deliberately ONE per-player list. There used to be two - an
 * unclaimed panel beside a claimed one - which invited the question of which
 * was correct, and the honest answer was neither alone. Claimed and unclaimed
 * now sit in the same list, and a name is recognised where it sits.
 */
export default async function WagerPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const me = await getMe();
  if (!me) return null;

  const one = (key: string) => {
    const v = searchParams[key];
    return Array.isArray(v) ? v[0] : v;
  };

  // Report: rp = period, ro = rep filter.
  const reportChoice = one("rp") ?? "all";
  const reportOwner = one("ro") ?? "";
  const reportPeriod = resolveReportPeriod(reportChoice);

  /* All seven in one pass. These were three sequential awaits, which on a
     page already doing a dozen queries meant three full round trips stacked
     end to end for no reason - none of them needs another's answer. */
  const [overview, report, churn, periods, team, repPeriods] =
    await Promise.all([
      getWagerOverview(me.timezone, "", 1),
      /* 2,000 rather than 500. The table pages client-side now, so the limit
         is no longer "how many to show" but "how many exist at all" - and a
         501st wagerer would simply have been unreachable. */
      getWagerReport(reportPeriod.period, reportOwner || undefined, 2000),
      getChurn(me.timezone),
      getWagerPeriods(),
      getTeam(),
      getRepPeriods(),
    ]);

  /* Every dollar figure on this page comes from wager_periods. The ledger
     (wager_external) is still read for counts and the retire action, but not
     for money - two sources for one total is how the page ended up showing
     $80,987,664 in one place and $81,066,311 in another. */
  const { totals, unclaimed, snapshotCount, signals } = overview;

  const reportQuery = new URLSearchParams({ period: reportChoice });
  if (reportOwner) reportQuery.set("owner", reportOwner);

  const activeReps = repPeriods.reps.filter((r) => r.all > 0 || r.players > 0);

  return (
    <>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-h2 font-semibold tracking-tight text-ink">Wager</h2>
          <p className="mt-0.5 max-w-2xl text-body text-ink-muted">
            Weighted wager across every book, matched by Roobet username.
          </p>
          <div className="mt-1.5">
            <AutoSync lastSyncedAt={periods.lastSyncedAt} />
          </div>
        </div>
        <Link
          href="/admin/settings"
          className="text-small font-medium text-accent underline-offset-2 hover:underline"
        >
          Manage sources &amp; sync
        </Link>
      </div>

      {snapshotCount === 0 && totals.allTime === 0 && periods.all.total === 0 ? (
        <EmptyState
          icon={<Wallet size={18} />}
          title="No wager data yet"
          body="Run a sync in Settings → Wager sources. If a sync already reported matched entries but this stays empty, the ledger migration (20260811000010_wager_external.sql) probably hasn't been run — the sync will now say so explicitly."
        />
      ) : (
        <>
          {!periods.ready && (
            <div className="mb-5">
              <Notice tone="warning">
                Period figures come from asking Roobet for each exact UTC window.
                Run a sync to populate them — every number below fills in on the
                first run, not the second.
              </Notice>
            </div>
          )}

          {/* Exact UTC periods, straight from Roobet */}
          <div className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Total label={`Today · ${periods.labels.day} UTC`} value={periods.day.total} />
            <Total label={`This week · ${periods.labels.week}`} value={periods.week.total} />
            <Total label={`${periods.labels.month} · UTC month`} value={periods.month.total} />
            <Total label="All time" value={periods.all.total} emphasis />
          </div>

          <p className="mb-8 text-caption text-ink-subtle">
            Exact figures for each UTC window, asked of Roobet directly — the same
            months the affiliate panel shows. This month splits{" "}
            <span className="font-medium text-ink">{money(periods.month.claimed)}</span> to
            players in a book and{" "}
            <span className="font-medium text-ink">{money(periods.month.unclaimed)}</span>{" "}
            unclaimed, across {periods.month.wagerers.toLocaleString()} wagerers.
          </p>

          {/* Per code, this month */}
          <section className="mb-8">
            <SectionHeader
              title="By code"
              count={periods.month.byCode.length}
              hint={`Every wagerer on each code — in a book or not. ${periods.labels.month} and all time, UTC.`}
            />
            <div className="overflow-x-auto rounded-card border border-line bg-surface shadow-card no-scrollbar">
              <table className="w-full min-w-[620px] text-left">
                <thead>
                  <tr className="border-b-2 border-line-strong bg-sunken">
                    <Th>Code</Th>
                    <Th align="right">Wagerers</Th>
                    <Th align="right">Today</Th>
                    <Th align="right">This week</Th>
                    <Th align="right">{periods.labels.month}</Th>
                    <Th align="right">All time</Th>
                  </tr>
                </thead>
                <tbody>
                  {periods.all.byCode.map((c, i) => {
                    const find = (rows: { source: string; total: number }[]) =>
                      rows.find((r) => r.source === c.source)?.total ?? 0;
                    return (
                      <tr
                        key={c.source}
                        className={cn(
                          "border-b border-line last:border-0",
                          i % 2 === 1 && "bg-sunken/35"
                        )}
                      >
                        <td className="px-4 py-2.5 text-body font-medium text-ink">
                          {c.source}
                        </td>
                        <Td muted>{c.wagerers.toLocaleString()}</Td>
                        <Td>{money(find(periods.day.byCode))}</Td>
                        <Td>{money(find(periods.week.byCode))}</Td>
                        <Td>{money(find(periods.month.byCode))}</Td>
                        <Td strong>{money(c.total)}</Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* Wagered over time */}
          <section className="mb-8">
            <SectionHeader
              title="Wagered over time"
              hint="Each bar is one whole UTC period, exactly as Roobet reported it. The last bar is still running, so it is drawn faded — a half-finished day is not a drop."
            />
            <WagerTrend history={periods.history} />
          </section>

          {/* THE ONE PLAYER-LEVEL LIST.

              There were three: "Wager by player", "Wager between two dates"
              and "Wager report", whose own descriptions were near enough the
              same sentence. They had grown apart rather than been designed
              apart - one got search and the pre-existing toggle, another got
              the rep filter and the CSV, the third got live date ranges - so
              you had to know which was which to find anything.

              One list, three ways to choose the window. */}
          <section className="mb-8">
            <SectionHeader
              title="Every wagerer"
              hint="Everyone who wagered in the window, in a book or not. Pick a period or exact dates, filter to a rep, export it."
              action={
                <a
                  href={`/api/wager-report?${reportQuery.toString()}`}
                  className="inline-flex h-9 items-center gap-1.5 rounded-control border
                             border-line-strong bg-surface px-3.5 text-body font-medium
                             text-ink-muted transition-colors duration-fast hover:bg-sunken
                             hover:text-ink"
                >
                  Export CSV
                </a>
              }
            />

            <ReportControls
              choice={reportChoice}
              owner={reportOwner}
              months={periods.months.map((m) => ({ month: m.month, label: m.label }))}
              years={Array.from(
                new Set(periods.months.map((m) => m.month.slice(0, 4)))
              ).sort((a, b) => b.localeCompare(a))}
              reps={team.filter((t) => t.active).map((t) => ({ id: t.id, name: t.name }))}
            />

            {/* Exact dates, for a window the stored periods cannot answer - a
                promo run, a stream week, a partial month. Asked of Roobet
                directly, so it is exact rather than estimated. */}
            <div className="mb-4">
              <DateRangeWager />
            </div>

            {/* One-time housekeeping: draw the line under everyone who was
                already wagering before any of this existed, so "unclaimed"
                comes to mean "new, and worth chasing". */}
            {unclaimed.count > 0 && (
              <div className="mb-4">
                <RetireUnclaimed count={unclaimed.count} />
              </div>
            )}

            <div className="mb-3 grid gap-3 sm:grid-cols-3">
              <Total label={`${reportPeriod.label} — total`} value={report.total} emphasis />
              <Total label="In a rep's book" value={report.claimedTotal} />
              <Total
                label="No owner"
                value={report.unclaimedTotal}
                plainSub={`${report.wagererCount.toLocaleString()} wagerers in this window`}
              />
            </div>

            {report.rows.length === 0 ? (
              <EmptyState
                icon={<Wallet size={18} />}
                title={`Nothing wagered in ${reportPeriod.label.toLowerCase()}`}
                body={
                  reportOwner
                    ? "No player in this rep's book wagered in this window."
                    : "Run a sync, or use the backfill in Settings to load months from before you started syncing."
                }
              />
            ) : (
              <WagererTable rows={report.rows} periodLabel={reportPeriod.label} />
            )}
          </section>


          {/* Per rep */}
          <section className="mb-8">
            <SectionHeader
              title="Contribution by rep"
              count={activeReps.length}
              hint="Each rep's own players, for the exact UTC period — the same facts as the totals above, not a difference between syncs."
            />
            {activeReps.length === 0 ? (
              <EmptyState
                icon={<Users size={18} />}
                title="No matched players yet"
                body="Wager attaches to a rep when one of their players' Roobet usernames matches a leaderboard entry."
              />
            ) : (
              <div className="overflow-x-auto rounded-card border border-line bg-surface shadow-card no-scrollbar">
                <table className="w-full min-w-[760px] text-left">
                  <thead>
                    <tr className="border-b-2 border-line-strong bg-sunken">
                      <Th>Rep</Th>
                      <Th align="right">Players wagering</Th>
                      <Th align="right">Today</Th>
                      <Th align="right">This week</Th>
                      <Th align="right">{periods.labels.month}</Th>
                      <Th align="right">All time</Th>
                      <Th align="right">Share</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeReps.map((r, i) => {
                      const share =
                        repPeriods.allTotal > 0 ? (r.all / repPeriods.allTotal) * 100 : 0;
                      return (
                        <tr
                          key={r.userId}
                          className={cn(
                            "border-b border-line last:border-0",
                            i % 2 === 1 && "bg-sunken/35"
                          )}
                        >
                          <td className="px-4 py-2.5">
                            <Link
                              href={`/book?owner=${r.userId}&sort=weighted_wager&dir=desc`}
                              className="font-medium text-ink underline-offset-2 hover:text-accent hover:underline"
                            >
                              {r.name}
                            </Link>
                          </td>
                          <Td muted>{r.players.toLocaleString()}</Td>
                          <Td>{money(r.day)}</Td>
                          <Td>{money(r.week)}</Td>
                          <Td>{money(r.month)}</Td>
                          <Td strong={r.all > 0}>{money(r.all)}</Td>
                          <td className="px-4 py-2.5 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <div className="h-1.5 w-16 overflow-hidden rounded-full bg-sunken">
                                <div
                                  className="h-full rounded-full bg-accent"
                                  style={{ width: `${Math.min(100, share)}%` }}
                                />
                              </div>
                              <span className="tabular w-10 text-small text-ink-muted">
                                {share.toFixed(0)}%
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>


        </>
      )}
    </>
  );
}

function Total({
  label,
  value,
  emphasis,
  plain,
  plainSub,
}: {
  label: string;
  value: number;
  emphasis?: boolean;
  /** Plain count rather than a dollar figure. */
  plain?: boolean;
  plainSub?: string;
}) {
  return (
    <Card className={cn(emphasis && "border-accent/30")}>
      <p className="text-label font-medium uppercase tracking-wide text-ink-subtle">
        {label}
      </p>
      <p
        className={cn(
          "tabular mt-1.5 text-metric font-semibold",
          emphasis ? "text-accent" : "text-ink"
        )}
      >
        {plain ? value.toLocaleString() : money(value)}
      </p>
      {plainSub && <p className="mt-0.5 text-caption text-ink-subtle">{plainSub}</p>}
    </Card>
  );
}

function Th({
  children,
  align = "left",
  className,
}: {
  children?: React.ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={cn(
        "px-4 py-2.5 text-label font-medium uppercase tracking-wide text-ink-subtle",
        align === "right" && "text-right",
        className
      )}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  strong,
  muted,
}: {
  children: React.ReactNode;
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <td
      className={cn(
        "tabular px-4 py-2.5 text-right text-body",
        strong ? "font-semibold text-ink" : muted ? "text-ink-subtle" : "text-ink-muted"
      )}
    >
      {children}
    </td>
  );
}
