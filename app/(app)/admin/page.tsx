import Link from "next/link";
import { Badge, Card, EmptyState, SectionHeader, cn } from "@/components/ui";
import { AlertTriangle, Check, ChevronRight, History, TrendingUp, UserCheck, Users, Wallet } from "@/components/icons";
import { getMe } from "@/lib/queries";
import { getRecentAudit } from "@/lib/admin";
import { getLeaderboard, resolveRange } from "@/lib/stats";
import { formatDateTime, ymdInZone } from "@/lib/time";
import { RangePicker } from "../RangePicker";

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

  const [rows, audit] = await Promise.all([
    getLeaderboard(me, range),
    getRecentAudit(8),
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
