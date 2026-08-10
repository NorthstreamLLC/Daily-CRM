import Link from "next/link";
import { Card, EmptyState, SectionHeader, cn } from "@/components/ui";
import { Users, Wallet, TrendingUp, UserCheck, History } from "@/components/icons";
import { getMe } from "@/lib/queries";
import { getRecentAudit } from "@/lib/admin";
import { PERIOD_LABEL, getLeaderboard, periodStart, type Period } from "@/lib/stats";
import { formatDateTime } from "@/lib/time";

export const dynamic = "force-dynamic";

const PERIODS: Period[] = ["7d", "30d", "90d", "mtd", "all"];

const AUDIT_LABEL: Record<string, string> = {
  create_user: "created",
  update_user: "updated",
  password_reset_sent: "sent a reset link to",
  reassign_book: "reassigned the book of",
  set_targets: "changed targets for",
  update_setting: "changed a setting",
  update_stage: "changed a funnel stage",
  add_source: "added a source",
  retire_source: "retired a source",
  enable_source: "re-enabled a source",
  import: "imported players for",
  undo_import: "undid an import",
  reassign_players: "reassigned players from",
};

export default async function AdminOverview({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const me = await getMe();
  if (!me) return null;

  const raw = searchParams.period;
  const requested = (Array.isArray(raw) ? raw[0] : raw) as Period;
  const period: Period = PERIODS.includes(requested) ? requested : "30d";

  const [rows, audit] = await Promise.all([
    getLeaderboard(me, periodStart(period, me.timezone)),
    getRecentAudit(8),
  ]);

  const totals = rows.reduce(
    (acc, r) => ({
      leads: acc.leads + r.leads,
      vip: acc.vip + r.vip,
      ftd: acc.ftd + r.ftd,
      book: acc.book + r.bookSize,
    }),
    { leads: 0, vip: 0, ftd: 0, book: 0 }
  );

  return (
    <>
      <nav aria-label="Time period" className="mb-6 flex flex-wrap gap-1.5">
        {PERIODS.map((p) => (
          <Link
            key={p}
            href={`/admin?period=${p}`}
            aria-current={p === period ? "true" : undefined}
            className={cn(
              "rounded-full border px-3 py-1 text-small font-medium transition-colors duration-fast",
              p === period
                ? "border-accent bg-accent text-white"
                : "border-line-strong bg-surface text-ink-muted hover:bg-sunken hover:text-ink"
            )}
          >
            {PERIOD_LABEL[p]}
          </Link>
        ))}
      </nav>

      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Summary label="Players in all books" value={totals.book} icon={<Users size={14} />} />
        <Summary label="Leads added" value={totals.leads} icon={<UserCheck size={14} />} />
        <Summary label="VIP transfers" value={totals.vip} icon={<TrendingUp size={14} />} />
        <Summary label="First deposits" value={totals.ftd} icon={<Wallet size={14} />} />
      </div>

      <section className="mb-8">
        <SectionHeader
          title="Team leaderboard"
          count={rows.length}
          hint={`Ranked by deposits, then VIP transfers, then leads. ${PERIOD_LABEL[period]}.`}
        />

        {rows.length === 0 ? (
          <EmptyState
            icon={<Users size={18} />}
            title="No active team members"
            body="Once people are added and start logging work, they'll be ranked here."
          />
        ) : (
          <div className="overflow-x-auto rounded-card border border-line bg-surface shadow-card no-scrollbar">
            <table className="w-full min-w-[640px] text-left">
              <thead>
                <tr className="border-b border-line bg-sunken">
                  <Th className="w-10">#</Th>
                  <Th>Person</Th>
                  <Th align="right">Leads</Th>
                  <Th align="right">VIP</Th>
                  <Th align="right">Deposits</Th>
                  <Th align="right">Contacts logged</Th>
                  <Th align="right">Book size</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.userId} className="border-b border-line last:border-0">
                    <td className="tabular px-4 py-2.5 text-small text-ink-subtle">{i + 1}</td>
                    <td className="px-4 py-2.5">
                      <span className="text-body font-medium text-ink">{r.name}</span>
                      <span className="ml-2 text-caption text-ink-subtle">
                        {r.code}
                        {r.role === "admin" && " · Admin"}
                      </span>
                    </td>
                    <Td>{r.leads}</Td>
                    <Td>{r.vip}</Td>
                    <Td strong={r.ftd > 0}>{r.ftd}</Td>
                    <Td muted>{r.touches}</Td>
                    <Td muted>{r.bookSize}</Td>
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
  icon,
}: {
  label: string;
  value: number;
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
    </Card>
  );
}

function Th({
  children,
  align = "left",
  className,
}: {
  children: React.ReactNode;
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
