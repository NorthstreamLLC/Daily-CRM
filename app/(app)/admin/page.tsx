import Link from "next/link";
import { Badge, Card, EmptyState, Notice, SectionHeader, cn } from "@/components/ui";
import { AlertTriangle, Check, ChevronRight, History, TrendingUp, UserCheck, Users, Wallet } from "@/components/icons";
import { getMe } from "@/lib/queries";
import { getDepositSignals, getDuplicates, getRecentAudit } from "@/lib/admin";
import { getChurn } from "@/lib/churn";
import { ChurnList } from "../ChurnList";
import { getLeaderboard, resolveRange } from "@/lib/stats";
import { formatDateTime, ymdInZone } from "@/lib/time";
import { RangePicker } from "../RangePicker";
import { RenderStamp, timed } from "../RenderStamp";


const money = (n: number) =>
  "$" + n.toLocaleString(undefined, { maximumFractionDigits: 0 });

/** Same card as the Wager page uses, so the two read alike. */
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

export const dynamic = "force-dynamic";

const AUDIT_LABEL: Record<string, string> = {
  create_user: "created",
  update_user: "updated",
  password_reset_sent: "sent a reset link to",
  reassign_book: "reassigned the book of",
  reassign_players: "reassigned players from",
  set_targets: "changed targets for",
  update_setting: "changed a setting",
  update_stage: "changed a funnel stage",
  add_source: "added a source",
  retire_source: "retired a source",
  enable_source: "re-enabled a source",
  import: "imported players for",
  undo_import: "undid an import",
};

export default async function AdminOverview({
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
    "today"
  );

  const startedAt = Date.now();
  const timings: { name: string; ms: number }[] = [];

  const [rows, audit, churn, signals, duplicates] = await Promise.all([
    timed("leaderboard", getLeaderboard(me, range), timings),
    timed("audit", getRecentAudit(8), timings),
    timed("churn", getChurn(me.timezone, null), timings),
    /* Just the deposit signals. This used to call getWagerOverview - eleven
       queries producing per-rep totals, top players and per-code breakdowns
       that this page does not render - and it was 660ms of a 666ms page. */
    timed("signals", getDepositSignals(me.timezone), timings),
    timed("duplicates", getDuplicates(), timings),
  ]);

  const totals = rows.reduce(
    (acc, r) => ({
      leads: acc.leads + r.leads,
      vip: acc.vip + r.vip,
      vipAllTime: acc.vipAllTime + r.vipAllTime,
      ftd: acc.ftd + r.ftd,
      book: acc.book + r.bookSize,
      outstanding: acc.outstanding + r.outstanding,
    }),
    { leads: 0, vip: 0, vipAllTime: 0, ftd: 0, book: 0, outstanding: 0 }
  );

  const behind = rows.filter((r) => r.outstanding > 0);

  return (
    <>
      <RangePicker range={range} today={ymdInZone(new Date(), me.timezone)} />

      {/* Whether today's work is done is the first thing an admin wants. */}
      <div
        className={cn(
          "mb-6 flex flex-wrap items-center gap-3 rounded-card border px-4 py-3",
          totals.outstanding > 0
            ? "border-danger/30 bg-danger-soft"
            : "border-success/25 bg-success-soft"
        )}
        role="status"
      >
        <span
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
            totals.outstanding > 0 ? "bg-danger/10 text-danger" : "bg-success/10 text-success"
          )}
        >
          {totals.outstanding > 0 ? <AlertTriangle size={16} /> : <Check size={16} />}
        </span>

        <div className="min-w-0">
          <p
            className={cn(
              "text-body font-semibold",
              totals.outstanding > 0 ? "text-danger" : "text-success"
            )}
          >
            {totals.outstanding > 0
              ? `${totals.outstanding.toLocaleString()} tasks outstanding across the team`
              : "Every queue is clear"}
          </p>
          <p className="mt-0.5 text-small text-ink-muted">
            {behind.length > 0
              ? `${behind.map((r) => r.name).join(", ")} ${
                  behind.length === 1 ? "has" : "have"
                } work still due today.`
              : "Nobody has anything due that hasn't been worked today."}
          </p>
        </div>
      </div>

      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Summary label="Players in all books" value={totals.book} icon={<Users size={14} />} />
        <Summary label="Leads added" value={totals.leads} icon={<UserCheck size={14} />} />
        <Summary
          label="VIP transfers"
          value={totals.vip}
          sub={`${totals.vipAllTime.toLocaleString()} all time`}
          icon={<TrendingUp size={14} />}
        />
        <Summary label="First deposits" value={totals.ftd} icon={<Wallet size={14} />} />
      </div>

      <section className="mb-8">
        <SectionHeader
          title="Team leaderboard"
          count={rows.length}
          hint={`Ranked by deposits, then VIP transfers, then leads. ${range.label}. Click a name to open their book.`}
        />

        {rows.length === 0 ? (
          <EmptyState
            icon={<Users size={18} />}
            title="No active team members"
            body="Once people are added and start logging work, they'll be ranked here."
          />
        ) : (
          <div className="overflow-x-auto rounded-card border border-line bg-surface shadow-card no-scrollbar">
            <table className="w-full min-w-[860px] text-left">
              <thead>
                <tr className="border-b border-line bg-sunken">
                  <Th className="w-10">#</Th>
                  <Th>Person</Th>
                  <Th align="right">Outstanding</Th>
                  <Th align="right">Leads</Th>
                  <Th align="right">VIP</Th>
                  <Th align="right">VIP all time</Th>
                  <Th align="right">Deposits</Th>
                  <Th align="right">Logged</Th>
                  <Th align="right">Book</Th>
                  <Th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr
                    key={r.userId}
                    className={cn(
                      "group border-b border-line transition-colors duration-fast last:border-0",
                      "hover:bg-sunken/60",
                      r.outstanding > 0 && "bg-danger-soft/40"
                    )}
                  >
                    <td className="tabular px-4 py-2.5 text-small text-ink-subtle">{i + 1}</td>

                    <td className="px-4 py-2.5">
                      <Link
                        href={`/book?owner=${r.userId}`}
                        className="inline-flex items-baseline gap-2 rounded font-medium text-ink
                                   underline-offset-2 hover:text-accent hover:underline"
                      >
                        {r.name}
                        <span className="text-caption font-normal text-ink-subtle">
                          {r.code}
                          {r.role === "admin" && " · Admin"}
                        </span>
                      </Link>
                    </td>

                    <td className="px-4 py-2.5 text-right">
                      {r.outstanding > 0 ? (
                        <Badge tone="danger" icon={<AlertTriangle size={11} />}>
                          {r.outstanding}
                        </Badge>
                      ) : (
                        <Badge tone="success" icon={<Check size={11} />}>
                          Clear
                        </Badge>
                      )}
                    </td>

                    <Td>{r.leads}</Td>
                    <Td>{r.vip}</Td>
                    <Td muted>{r.vipAllTime}</Td>
                    <Td strong={r.ftd > 0}>{r.ftd}</Td>
                    <Td muted>{r.touches}</Td>
                    <Td muted>{r.bookSize}</Td>

                    <td className="px-2 py-2.5 text-right">
                      <Link
                        href={`/book?owner=${r.userId}`}
                        aria-label={`Open ${r.name}'s book`}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-control
                                   text-ink-subtle opacity-0 transition-opacity duration-fast
                                   group-hover:opacity-100 hover:bg-sunken hover:text-ink
                                   focus-visible:opacity-100"
                      >
                        <ChevronRight size={15} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* WHAT NEEDS ATTENTION.

          Moved here from the Wager page, which was trying to be two things at
          once: a set of figures to check, and a set of lists to work. Seven
          sections stacked with no separation between "how much money" and
          "who needs chasing" is why it read as a mess.

          Wager answers how much. This answers who. */}
      {/* Falling away - the company view */}
      <section className="mb-8">
        <SectionHeader
          title="Falling away"
          count={churn.quiet.length + churn.dropping.length}
          hint={`Players wagering below their own recent normal, comparing the last ${churn.windowDays} days with the ${churn.windowDays} before. ${money(
            churn.atRisk
          )} of wager at risk. Comparing ${churn.basisLabel}.`}
          action={
            <Link
              href="/admin/settings"
              className="text-small font-medium text-accent underline-offset-2 hover:underline"
            >
              Adjust thresholds
            </Link>
          }
        />

        {churn.watched.length > 0 && (
          <div className="mb-4">
            <p className="mb-2 text-small font-semibold text-ink">
              Watched by a rep
              <span className="tabular ml-2 font-normal text-accent">
                {churn.watched.length}
              </span>
            </p>
            <ChurnList
              players={churn.watched}
              kind="watched"
              windowDays={churn.windowDays}
              showOwner
              allowWatch
              limit={20}
            />
          </div>
        )}

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
                allowWatch
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
                allowWatch
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



      {/* THE SAME PERSON IN TWO BOOKS.

          Only rendered when there are any, because an empty "Duplicates"
          heading on every page load trains you to scroll past it - and then
          you scroll past it on the day it is not empty. */}
      {duplicates.length > 0 && (
        <section className="mb-8">
          <SectionHeader
            title="In more than one book"
            count={duplicates.length}
            hint="The same person appears twice. Where they share a Roobet username the wager is credited to whichever record was touched last, which is arbitrary — decide who owns them and delete the other."
          />

          <div className="space-y-2">
            {duplicates.slice(0, 25).map((group) => (
              <Card key={`${group.kind}-${group.value}`} padded={false}>
                <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2">
                  <Badge tone={group.kind === "roobet" ? "danger" : "neutral"}>
                    {group.kind === "roobet" ? "Same Roobet username" : "Same handle"}
                  </Badge>
                  <span className="font-medium text-ink">{group.value}</span>
                  <span className="tabular text-caption text-ink-subtle">
                    {group.players.length} records
                  </span>
                </div>

                <ul>
                  {group.players.map((p) => (
                    <li
                      key={p.playerId}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b
                                 border-line px-4 py-2 last:border-0"
                    >
                      <Link
                        href={`/book?player=${p.playerId}`}
                        className="font-medium text-accent underline-offset-2 hover:underline"
                      >
                        {p.handle}
                      </Link>
                      <span className="tabular text-caption text-ink-subtle">
                        {p.reference}
                      </span>
                      <span className="text-small text-ink-muted">{p.ownerName}</span>
                      <span className="text-small text-ink-subtle">{p.status}</span>
                      {p.wagered > 0 && (
                        <span className="tabular ml-auto text-small font-semibold text-ink">
                          {money(p.wagered)}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>

          {duplicates.length > 25 && (
            <p className="mt-2 text-small text-ink-muted">
              Showing 25 of {duplicates.length.toLocaleString()}.
            </p>
          )}
        </section>
      )}

      <section>
        <SectionHeader
          title="Recent admin activity"
          hint="Changes to people, targets and settings are recorded permanently."
        />
        {audit.length === 0 ? (
          <EmptyState
            icon={<History size={18} />}
            title="Nothing recorded yet"
            body="Admin actions will appear here as they happen."
          />
        ) : (
          <Card padded={false}>
            <ul>
              {audit.map((a) => (
                <li
                  key={a.id}
                  className="flex flex-wrap items-baseline justify-between gap-2 border-b
                             border-line px-4 py-2.5 last:border-0"
                >
                  <span className="text-small text-ink">
                    <span className="font-medium">{a.actorName}</span>{" "}
                    {AUDIT_LABEL[a.action] ?? a.action}
                    {a.targetName && <span className="font-medium"> {a.targetName}</span>}
                  </span>
                  <span className="text-caption text-ink-subtle">
                    {formatDateTime(a.occurred_at, me.timezone)}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>

      <RenderStamp ms={Date.now() - startedAt} label="Overview" parts={timings} />
    </>
  );
}

function Summary({
  label,
  value,
  sub,
  icon,
}: {
  label: string;
  value: number;
  sub?: string;
  icon: React.ReactNode;
}) {
  return (
    <Card>
      <div className="flex items-center gap-2 text-ink-subtle">
        {icon}
        <p className="text-label font-medium uppercase tracking-wide">{label}</p>
      </div>
      <p className="tabular mt-1.5 text-metric font-semibold text-ink">
        {value.toLocaleString()}
      </p>
      {sub && <p className="mt-0.5 text-caption text-ink-subtle">{sub}</p>}
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
        strong ? "font-semibold text-success" : muted ? "text-ink-subtle" : "text-ink-muted"
      )}
    >
      {children}
    </td>
  );
}
