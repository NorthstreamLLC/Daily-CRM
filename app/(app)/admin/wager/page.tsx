import Link from "next/link";
import { Card, EmptyState, Notice, SectionHeader, cn } from "@/components/ui";
import { TrendingUp, Users, Wallet } from "@/components/icons";
import { getMe } from "@/lib/queries";
import {
  getPeriodPlayers,
  getRepPeriods,
  getWagerOverview,
  getWagerPeriods,
  getWagerReport,
  resolvePeriodKey,
} from "@/lib/admin";
import { resolveRange } from "@/lib/ranges";
import { ymdInZone } from "@/lib/time";
import { RangePicker } from "../../RangePicker";
import { UnclaimedSearch } from "./UnclaimedSearch";
import { UnclaimedPager } from "./UnclaimedPager";
import { RetireUnclaimed } from "./RetireUnclaimed";
import { getChurn } from "@/lib/churn";
import { ChurnList } from "../../ChurnList";
import { PeriodPlayers } from "./PeriodPlayers";
import { AutoSync } from "./AutoSync";

export const dynamic = "force-dynamic";

const money = (n: number) =>
  "$" + n.toLocaleString(undefined, { maximumFractionDigits: 0 });

/**
 * WAGER.
 *
 * What every rep's book actually produces, in dollars wagered. All-time is the
 * sum of current leaderboard totals; the day/week/month figures are movement
 * between snapshots, so they only accumulate once syncing runs regularly.
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

  const range = resolveRange(
    { period: one("period"), from: one("from"), to: one("to") },
    me.timezone,
    "30d"
  );

  const unclaimedSearch = one("wq") ?? "";
  const unclaimedPage = Math.max(1, Number(one("wp")) || 1);

  // Per-player period browser: pp = period, pq = search, ppg = page.
  const periodChoice = one("pp") ?? "month";
  const periodKey = resolvePeriodKey(periodChoice);
  const periodSearch = one("pq") ?? "";
  const periodPage = Math.max(1, Number(one("ppg")) || 1);

  const [overview, report, churn, periods] = await Promise.all([
    getWagerOverview(me.timezone, unclaimedSearch, unclaimedPage),
    getWagerReport(range.start, range.end),
    getChurn(me.timezone),
    getWagerPeriods(),
  ]);

  const repPeriods = await getRepPeriods();

  const periodPlayers = await getPeriodPlayers(
    periodKey.type,
    periodKey.start,
    periodSearch,
    periodPage
  );

  const { totals, unclaimed, snapshotCount, signals } = overview;

  const reportQuery = new URLSearchParams();
  if (range.start) reportQuery.set("from", range.start.toISOString());
  if (range.end) reportQuery.set("to", range.end.toISOString());
  reportQuery.set("label", range.label);

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

          {/* Month by month */}
          {periods.months.length > 0 && (
            <section className="mb-8">
              <SectionHeader
                title="Month by month"
                count={periods.months.length}
                hint="Every calendar month on record, UTC. Run the backfill to load history before you started syncing."
              />
              <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b-2 border-line-strong bg-sunken">
                      <Th>Month</Th>
                      <Th align="right">Wagerers</Th>
                      <Th align="right">Weighted wager</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {periods.months.map((m, i) => (
                      <tr
                        key={m.month}
                        className={cn(
                          "border-b border-line last:border-0",
                          i % 2 === 1 && "bg-sunken/35"
                        )}
                      >
                        <td className="px-4 py-2.5 text-body font-medium text-ink">
                          {m.label}
                        </td>
                        <Td muted>{m.wagerers.toLocaleString()}</Td>
                        <Td strong>{money(m.total)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Who wagered it */}
          <section className="mb-8">
            <SectionHeader
              title="Wager by player"
              hint="Every wagerer for the chosen period, biggest first. Claimed and unclaimed together, so this always adds up to the total above."
            />
            <PeriodPlayers
              rows={periodPlayers.rows}
              total={periodPlayers.total}
              page={periodPlayers.page}
              pages={periodPlayers.pages}
              choice={periodChoice}
              months={periods.months.map((m) => ({ month: m.month, label: m.label }))}
            />
          </section>

          {/* Unclaimed wagerers */}
          <section className="mb-8">
            <SectionHeader
              title="Unclaimed wagerers"
              count={unclaimed.count}
              hint={`Wagering on your codes but in nobody's book — ${money(
                unclaimed.total
              )} of lifetime wager with no owner. Add one to a book with this exact Roobet username and their full history attaches to that player automatically.`}
              action={
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <UnclaimedSearch placeholder="Search Roobet username" />
                  {unclaimed.count > 0 && !unclaimedSearch && (
                    <RetireUnclaimed count={unclaimed.count} />
                  )}
                </div>
              }
            />
            {unclaimed.sample.length === 0 ? (
              <EmptyState
                icon={<Users size={18} />}
                title={
                  unclaimedSearch
                    ? `No unclaimed username matches "${unclaimedSearch}"`
                    : "Everyone wagering is in a book"
                }
                body={
                  unclaimedSearch
                    ? "They may already be in someone's book — check the Book page."
                    : "New names appear here as they show up on your codes."
                }
              />
            ) : (
              <div className="overflow-x-auto rounded-card border border-line bg-surface shadow-card no-scrollbar">
                <table className="w-full min-w-[560px] text-left">
                  <thead>
                    <tr className="border-b border-line bg-sunken">
                      <Th className="w-10">#</Th>
                      <Th>Roobet username</Th>
                      <Th>Code</Th>
                      <Th align="right">This month</Th>
                      <Th align="right">All time</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {unclaimed.sample.map((u, i) => (
                      <tr key={u.username} className="border-b border-line last:border-0">
                        <td className="tabular px-4 py-2.5 text-small text-ink-subtle">
                          {i + 1}
                        </td>
                        <td className="px-4 py-2.5 text-body font-medium text-ink">
                          {u.username}
                        </td>
                        <td className="px-4 py-2.5 text-small text-ink-muted">{u.sources}</td>
                        <Td muted>{money(u.month)}</Td>
                        <Td strong>{money(u.allTime)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <UnclaimedPager
                  page={unclaimed.page}
                  pageCount={unclaimed.pageCount}
                  total={unclaimed.matching}
                  shown={unclaimed.sample.length}
                />
              </div>
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

          {/* Falling away - the company view */}
          <section className="mb-8">
            <SectionHeader
              title="Falling away"
              count={churn.quiet.length + churn.dropping.length}
              hint={`Players wagering below their own recent normal, comparing the last ${churn.windowDays} days with the ${churn.windowDays} before. ${money(
                churn.atRisk
              )} of wager at risk.`}
              action={
                <Link
                  href="/admin/settings"
                  className="text-small font-medium text-accent underline-offset-2 hover:underline"
                >
                  Adjust thresholds
                </Link>
              }
            />

            {churn.quiet.length === 0 && churn.dropping.length === 0 ? (
              <EmptyState
                icon={<TrendingUp size={18} />}
                title="Nobody is falling away"
                body="Players appear here when their wagering drops sharply against their own recent normal - a warning long before they would ever be marked dead."
              />
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                <div>
                  <p className="mb-2 text-small font-semibold text-ink">
                    Gone quiet
                    <span className="tabular ml-2 font-normal text-danger">
                      {churn.quiet.length}
                    </span>
                  </p>
                  <ChurnList
                    players={churn.quiet}
                    kind="quiet"
                    windowDays={churn.windowDays}
                    showOwner
                    limit={10}
                  />
                </div>
                <div>
                  <p className="mb-2 text-small font-semibold text-ink">
                    Wagering less
                    <span className="tabular ml-2 font-normal text-warning">
                      {churn.dropping.length}
                    </span>
                  </p>
                  <ChurnList
                    players={churn.dropping}
                    kind="dropping"
                    windowDays={churn.windowDays}
                    showOwner
                    limit={10}
                  />
                </div>
              </div>
            )}
          </section>

          {/* Deposit signals */}
          <section className="mb-8">
            <SectionHeader
              title="Deposit signals"
              hint="Roobet doesn't expose deposits — but nobody wagers without one. A player's first wager on your codes is a dated deposit confirmation. Admin-only; reps keep logging FTDs as normal."
            />

            {signals.baseline ? (
              <div className="mb-4 grid gap-3 sm:grid-cols-3">
                <Total
                  label="Wagering players — all time"
                  value={signals.allTimeWagerers}
                  plain
                  emphasis
                />
                <Total
                  label={`New since ${signals.baseline}`}
                  value={signals.newSinceBaseline ?? 0}
                  plain
                  plainSub="First wager after tracking began"
                />
                <Total
                  label="New this month"
                  value={signals.newMonth ?? 0}
                  plain
                  plainSub="Excludes pre-existing players"
                />
              </div>
            ) : (
              <>
                <div className="mb-3 grid gap-3 sm:grid-cols-2">
                  <Total
                    label="Wagering players — all time"
                    value={signals.allTimeWagerers}
                    plain
                    emphasis
                  />
                  <Card>
                    <p className="text-label font-medium uppercase tracking-wide text-ink-subtle">
                      New players
                    </p>
                    <p className="mt-1.5 text-body text-ink-muted">
                      Needs a baseline date
                    </p>
                    <Link
                      href="/admin/settings"
                      className="mt-1 inline-block text-small font-medium text-accent
                                 underline-offset-2 hover:underline"
                    >
                      Set it in Settings →
                    </Link>
                  </Card>
                </div>
                <div className="mb-4">
                  <Notice tone="neutral">
                    Counting &ldquo;new&rdquo; players needs a start date. Everyone
                    already wagering when you began tracking arrived at once from the
                    system&rsquo;s point of view, which is why day and week counts were
                    meaningless. Set{" "}
                    <span className="font-medium">New-player baseline date</span> in
                    Settings — August 1st, say — and only first wagers after it count as
                    new business.
                  </Notice>
                </div>
              </>
            )}

            <div className="grid gap-4 lg:grid-cols-2">
              {/* Missed FTDs */}
              <Card padded={false}>
                <div className="border-b border-line px-4 py-3">
                  <p className="text-body font-semibold text-ink">
                    Wagering, never marked deposited
                    <span className="tabular ml-2 text-small font-normal text-warning">
                      {signals.missed.count}
                    </span>
                  </p>
                  <p className="mt-0.5 text-caption text-ink-subtle">
                    Money on the table — these are almost certainly FTDs nobody logged.
                    Worth a status update.
                  </p>
                </div>
                {signals.missed.sample.length === 0 ? (
                  <p className="px-4 py-4 text-small text-ink-muted">
                    Nobody — every wagering player is marked as deposited.
                  </p>
                ) : (
                  <ul>
                    {signals.missed.sample.map((p) => (
                      <li key={p.id} className="border-b border-line last:border-0">
                        <Link
                          href={`/book?owner=${p.ownerId}&q=${encodeURIComponent(p.reference)}`}
                          className="flex items-center justify-between gap-3 px-4 py-3
                                     transition-colors duration-fast hover:bg-sunken"
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-body font-medium text-ink">
                              {p.handle}
                            </span>
                            <span className="tabular block text-caption text-ink-subtle">
                              {p.reference} · {p.ownerName} · {p.status}
                            </span>
                          </span>
                          <span className="tabular shrink-0 text-body font-semibold text-ink">
                            {money(p.wager)}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              {/* Unverified FTDs */}
              <Card padded={false}>
                <div className="border-b border-line px-4 py-3">
                  <p className="text-body font-semibold text-ink">
                    Marked deposited, no wager seen
                    <span className="tabular ml-2 text-small font-normal text-ink-subtle">
                      {signals.unverified.count}
                    </span>
                  </p>
                  <p className="mt-0.5 text-caption text-ink-subtle">
                    Logged as FTDs but nothing on your codes yet. Often a missing or
                    typo'd Roobet username rather than a false claim.
                  </p>
                </div>
                {signals.unverified.sample.length === 0 ? (
                  <p className="px-4 py-4 text-small text-ink-muted">
                    Nobody — every logged FTD shows wager on your codes.
                  </p>
                ) : (
                  <ul>
                    {signals.unverified.sample.map((p) => (
                      <li key={p.id} className="border-b border-line last:border-0">
                        {/* Straight to their row in the Book, where the Roobet
                            username field is one click away in Edit. */}
                        <Link
                          href={`/book?owner=${p.ownerId}&q=${encodeURIComponent(p.reference)}`}
                          className="flex items-center justify-between gap-3 px-4 py-3
                                     transition-colors duration-fast hover:bg-sunken"
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-body font-medium text-ink">
                              {p.handle}
                            </span>
                            <span className="tabular block text-caption text-ink-subtle">
                              {p.reference} · {p.ownerName} · {p.status}
                            </span>
                          </span>
                          <span className="shrink-0 whitespace-nowrap rounded-control border
                                           border-line-strong px-2.5 py-1 text-small
                                           font-medium text-accent">
                            Add username →
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          </section>

          {/* Per-player report for any date window */}
          <section className="mb-8">
            <SectionHeader
              title="Wager report"
              hint="Per player, between any two dates. This is the weekly and monthly review — pick a window, read it, export it."
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

            <RangePicker range={range} today={ymdInZone(new Date(), me.timezone)} />

            <div className="mb-3 grid gap-3 sm:grid-cols-3">
              <Total label={`${range.label} — assigned players`} value={report.total} />
              <Total
                label="Unassigned in window"
                value={report.unclaimedTotal}
                plainSub={`${unclaimed.count.toLocaleString()} usernames`}
              />
              <Total
                label="Players who wagered"
                value={report.playerCount}
                plain
              />
            </div>

            {report.rows.length === 0 ? (
              <EmptyState
                icon={<Wallet size={18} />}
                title={`No assigned player wagered in ${range.label.toLowerCase()}`}
                body="Either the window is quiet, or the wagering is all from usernames nobody owns yet — see Unclaimed wagerers above."
              />
            ) : (
              <div className="overflow-x-auto rounded-card border border-line bg-surface shadow-card no-scrollbar">
                <table className="w-full min-w-[760px] text-left">
                  <thead>
                    <tr className="border-b border-line bg-sunken">
                      <Th className="w-10">#</Th>
                      <Th>Player</Th>
                      <Th>Roobet username</Th>
                      <Th>Rep</Th>
                      <Th>Status</Th>
                      <Th align="right">{range.label}</Th>
                      <Th align="right">All time</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.rows.slice(0, 100).map((r, i) => (
                      <tr key={r.playerId} className="border-b border-line last:border-0">
                        <td className="tabular px-4 py-2.5 text-small text-ink-subtle">
                          {i + 1}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="font-medium text-ink">{r.handle}</span>
                          <span className="tabular ml-2 text-caption text-ink-subtle">
                            {r.reference}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-small text-ink-muted">
                          {r.roobetUsername ?? "—"}
                        </td>
                        <td className="px-4 py-2.5 text-small text-ink-muted">
                          {r.ownerName}
                        </td>
                        <td className="px-4 py-2.5 text-small text-ink-muted">{r.status}</td>
                        <Td strong>{money(r.windowWager)}</Td>
                        <Td muted>{money(r.allTime)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {report.rows.length > 100 && (
                  <p className="border-t border-line px-4 py-2.5 text-small text-ink-muted">
                    Showing the top 100 of {report.rows.length.toLocaleString()}. Export
                    the CSV for the full list.
                  </p>
                )}
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
