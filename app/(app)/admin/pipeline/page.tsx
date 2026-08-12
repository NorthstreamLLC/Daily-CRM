import Link from "next/link";
import { Badge, Card, EmptyState, SectionHeader, cn } from "@/components/ui";
import { AlertTriangle, TrendingUp, Wallet } from "@/components/icons";
import { getMe } from "@/lib/queries";
import {
  getCompanyDeposits,
  getCompanyVip,
  getWagerReport,
  resolveReportPeriod,
  type CompanyPlayer,
} from "@/lib/admin";
import { resolveRange } from "@/lib/ranges";
import { formatDate, relativeDays } from "@/lib/time";

export const dynamic = "force-dynamic";

/**
 * COMPANY PIPELINE.
 *
 * The two lists the master spreadsheet existed to produce, except live and
 * complete rather than mirrored through IMPORTRANGE and silently truncated at
 * 88 rows.
 */
export default async function PipelinePage() {
  const me = await getMe();
  if (!me) return null;

  const monthRange = resolveRange({ period: "mtd" }, me.timezone, "mtd");

  const [vip, deposits, monthWager] = await Promise.all([
    getCompanyVip(),
    getCompanyDeposits(),
    getWagerReport(resolveReportPeriod("month").period),
  ]);

  // Wager this month for the players sitting at VIP Transferred - the clearest
  // measure of whether transfers are turning into money.
  const monthByPlayer = new Map(monthWager.rows.map((r) => [r.playerId, r.wagered]));
  const vipMonthWager = vip.reduce((a, p) => a + (monthByPlayer.get(p.id) ?? 0), 0);

  const stalled = vip.filter((p) => {
    const due = relativeDays(p.next_followup_at, me.timezone);
    return due !== null && due.days >= 2;
  });

  const thisMonth = deposits.filter((p) => {
    if (!p.first_deposit_at) return false;
    const d = new Date(p.first_deposit_at);
    const now = new Date();
    return d.getUTCFullYear() === now.getUTCFullYear() && d.getUTCMonth() === now.getUTCMonth();
  });

  return (
    <>
      <div className="mb-5">
        <h2 className="text-h2 font-semibold tracking-tight text-ink">Company pipeline</h2>
        <p className="mt-0.5 max-w-2xl text-body text-ink-muted">
          Every rep&rsquo;s VIP transfers and deposits in one place, read straight from
          the live data.
        </p>
      </div>

      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="VIP transfers waiting" value={vip.length} icon={<TrendingUp size={14} />} />
        <Stat
          label="Stalled 2+ days"
          value={stalled.length}
          icon={<AlertTriangle size={14} />}
          tone={stalled.length > 0 ? "danger" : undefined}
        />
        <Stat label="Deposits this month" value={thisMonth.length} icon={<Wallet size={14} />} />
        <Stat
          label="Wagered this month"
          value={monthWager.total}
          icon={<Wallet size={14} />}
          money
          sub={`${monthWager.wagererCount} players`}
        />
        <Stat
          label="From VIP transfers"
          value={vipMonthWager}
          icon={<TrendingUp size={14} />}
          money
          sub="Still at VIP Transferred"
        />
      </div>

      {/* VIP */}
      <section className="mb-10">
        <SectionHeader
          title="VIP transfers in flight"
          count={vip.length}
          hint="Oldest first. A transfer left sitting is the most expensive thing in the company to ignore."
        />
        {vip.length === 0 ? (
          <EmptyState
            icon={<TrendingUp size={18} />}
            title="Nobody at VIP Transferred"
            body="Players appear here the moment any rep moves someone to VIP Transferred."
          />
        ) : (
          <PlayerTable
            rows={vip}
            timezone={me.timezone}
            columns={["owner", "handle", "roobet", "started", "checkins", "due"]}
          />
        )}
      </section>

      {/* Deposits */}
      <section>
        <SectionHeader
          title="First deposits"
          count={deposits.length}
          hint="Every player who has ever deposited, newest first."
        />
        {deposits.length === 0 ? (
          <EmptyState
            icon={<Wallet size={18} />}
            title="No deposits recorded yet"
            body="A player is added here automatically the first time they're moved to First Deposit or Active."
          />
        ) : (
          <PlayerTable
            rows={deposits.slice(0, 300)}
            timezone={me.timezone}
            columns={["owner", "handle", "roobet", "source", "deposited", "status"]}
          />
        )}
        {deposits.length > 300 && (
          <p className="mt-3 text-small text-ink-muted">
            Showing the 300 most recent of {deposits.length.toLocaleString()}.{" "}
            <Link
              href="/admin/import"
              className="font-medium text-accent underline-offset-2 hover:underline"
            >
              Export the full list
            </Link>{" "}
            for the rest.
          </p>
        )}
      </section>
    </>
  );
}

type ColumnKey =
  | "owner"
  | "handle"
  | "roobet"
  | "source"
  | "started"
  | "checkins"
  | "due"
  | "deposited"
  | "status";

const HEADINGS: Record<ColumnKey, string> = {
  owner: "Rep",
  handle: "Player",
  roobet: "Roobet username",
  source: "Source",
  started: "Transferred",
  checkins: "Check-ins",
  due: "Due",
  deposited: "Deposited",
  status: "Status",
};

function PlayerTable({
  rows,
  timezone,
  columns,
}: {
  rows: CompanyPlayer[];
  timezone: string;
  columns: ColumnKey[];
}) {
  return (
    <div className="overflow-x-auto rounded-card border border-line bg-surface shadow-card no-scrollbar">
      <table className="w-full min-w-[720px] text-left">
        <thead>
          <tr className="border-b border-line bg-sunken">
            {columns.map((c) => (
              <th
                key={c}
                scope="col"
                className="px-4 py-2.5 text-label font-medium uppercase tracking-wide text-ink-subtle"
              >
                {HEADINGS[c]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => {
            const due = relativeDays(p.next_followup_at, timezone);
            const late = due !== null && due.days >= 2;

            return (
              <tr key={p.id} className="border-b border-line last:border-0">
                {columns.map((c) => (
                  <td key={c} className="px-4 py-2.5 align-middle">
                    {c === "owner" && (
                      <span className="text-small font-medium text-ink">{p.ownerName}</span>
                    )}

                    {c === "handle" && (
                      <span className="flex items-center gap-2">
                        <span className="text-body text-ink">{p.handle}</span>
                        <span className="tabular text-caption text-ink-subtle">
                          {p.reference}
                        </span>
                      </span>
                    )}

                    {c === "roobet" &&
                      (p.roobet_username ? (
                        <span className="text-small text-ink">{p.roobet_username}</span>
                      ) : (
                        <Badge tone="warning">Missing</Badge>
                      ))}

                    {c === "source" && (
                      <span className="text-small text-ink-muted">{p.source ?? "—"}</span>
                    )}

                    {c === "started" && (
                      <span className="tabular text-small text-ink-muted">
                        {formatDate(p.vip_fasttrack_started_at, timezone)}
                      </span>
                    )}

                    {c === "checkins" && (
                      <span className="tabular text-small text-ink-muted">
                        {p.vip_fasttrack_checkins}
                      </span>
                    )}

                    {c === "due" && (
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 text-small",
                          late ? "font-medium text-danger" : "text-ink-muted"
                        )}
                      >
                        {late && <AlertTriangle size={12} />}
                        {due?.label ?? "—"}
                      </span>
                    )}

                    {c === "deposited" && (
                      <span className="tabular text-small text-ink-muted">
                        {formatDate(p.first_deposit_at, timezone)}
                      </span>
                    )}

                    {c === "status" && (
                      <span className="text-small text-ink-muted">{p.status}</span>
                    )}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Stat({
  label,
  value,
  icon,
  tone,
  money,
  sub,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone?: "danger";
  /** Render as dollars rather than a count. */
  money?: boolean;
  sub?: string;
}) {
  return (
    <Card className={cn(tone === "danger" && value > 0 && "border-danger/30")}>
      <div className="flex items-center gap-2 text-ink-subtle">
        {icon}
        <p className="text-label font-medium uppercase tracking-wide">{label}</p>
      </div>
      <p
        className={cn(
          "tabular mt-1.5 text-metric font-semibold",
          tone === "danger" && value > 0 ? "text-danger" : "text-ink"
        )}
      >
        {money
          ? "$" + value.toLocaleString(undefined, { maximumFractionDigits: 0 })
          : value.toLocaleString()}
      </p>
      {sub && <p className="mt-0.5 text-caption text-ink-subtle">{sub}</p>}
    </Card>
  );
}
