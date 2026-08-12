import Link from "next/link";
import { Card, cn } from "@/components/ui";
import { AlertTriangle, TrendingUp } from "@/components/icons";
import type { ChurnPlayer } from "@/lib/churn";
import { WatchToggle } from "./WatchToggle";

const money = (n: number) =>
  "$" + n.toLocaleString(undefined, { maximumFractionDigits: 0 });

/**
 * Players falling away, ordered by what is being lost.
 *
 * Deliberately shows the previous figure next to the current one - "$0" alone
 * means nothing, but "$0, was $4,200" is a reason to pick up the phone.
 */
export function ChurnList({
  players,
  kind,
  windowDays,
  showOwner = false,
  limit = 10,
  /** Lets a VIP rep pin or unpin straight from the row. */
  allowWatch = false,
  emptyText,
}: {
  players: ChurnPlayer[];
  kind: "quiet" | "dropping" | "watched";
  windowDays: number;
  showOwner?: boolean;
  limit?: number;
  allowWatch?: boolean;
  emptyText?: string;
}) {
  if (players.length === 0) {
    return (
      <Card>
        <p className="text-small text-ink-muted">
          {emptyText ??
            (kind === "quiet"
              ? `Nobody has gone quiet in the last ${windowDays} days.`
              : kind === "watched"
                ? "Nobody is being watched. Use Watch on any player who needs an eye kept on them."
                : "Nobody is wagering significantly below their normal.")}
        </p>
      </Card>
    );
  }

  return (
    <Card padded={false}>
      <ul>
        {players.slice(0, limit).map((p) => {
          const lost = p.previous - p.current;
          return (
            <li key={p.id} className="border-b border-line-strong last:border-0">
              <Link
                href={`/book${showOwner ? `?owner=${p.ownerId}&q=` : "?q="}${encodeURIComponent(
                  p.reference
                )}`}
                className="flex items-center justify-between gap-4 px-4 py-3
                           transition-colors duration-fast hover:bg-sunken"
              >
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-body font-medium text-ink">
                      {p.handle}
                    </span>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-caption font-medium",
                        p.current <= 0
                          ? "bg-danger-soft text-danger"
                          : "bg-warning-soft text-warning"
                      )}
                    >
                      {p.current <= 0 ? (
                        <>
                          <AlertTriangle size={10} /> Gone quiet
                        </>
                      ) : (
                        <>
                          <TrendingUp size={10} className="rotate-180" />
                          {Math.round((1 - Math.min(1, p.dropShare)) * 100)}% down
                        </>
                      )}
                    </span>
                    {p.pinned && (
                      <span className="rounded bg-accent-soft px-1.5 py-0.5 text-caption
                                       font-medium text-accent">
                        Watching
                      </span>
                    )}
                  </span>
                  <span className="tabular mt-0.5 block text-caption text-ink-subtle">
                    {p.reference} · {p.status}
                    {showOwner && ` · ${p.ownerName}`} · {money(p.allTime)} lifetime
                  </span>
                </span>

                <span className="flex shrink-0 items-center gap-3">
                  <span className="text-right">
                    <span className="tabular block text-body font-semibold text-ink">
                      {money(p.current)}
                    </span>
                    <span className="tabular block text-caption text-ink-subtle">
                      was {money(p.previous)}
                      {lost > 0 && (
                        <span className="text-danger"> · −{money(lost)}</span>
                      )}
                    </span>
                  </span>
                  {allowWatch && (
                    <WatchToggle playerId={p.id} watching={p.pinned} compact />
                  )}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      {players.length > limit && (
        <p className="border-t border-line px-4 py-2.5 text-small text-ink-muted">
          Showing the {limit} biggest of {players.length}.
        </p>
      )}
    </Card>
  );
}
