"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { cn } from "@/components/ui";

/**
 * Today's two views.
 *
 * WORK is what has to be done now - overdue and due today. COMING UP is the
 * schedule, and nothing on it is actionable yet.
 *
 * They were stacked on one page. At ten players that reads as context; at
 * three hundred it means scrolling past a hundred rows you cannot act on to
 * reach the ones you can. Splitting them keeps the default view answering one
 * question: what do I do next.
 *
 * The choice lives in the URL, so a refresh or a back button lands where the
 * rep left off.
 */
export function TodayTabs({
  current,
  workCount,
  comingCount,
}: {
  current: "work" | "coming";
  workCount: number;
  comingCount: number;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, start] = useTransition();

  function go(tab: "work" | "coming") {
    const next = new URLSearchParams(params.toString());
    if (tab === "work") next.delete("tab");
    else next.set("tab", tab);
    const qs = next.toString();
    start(() => router.push(qs ? `/today?${qs}` : "/today", { scroll: false }));
  }

  const tabs = [
    { key: "work" as const, label: "To do", count: workCount },
    { key: "coming" as const, label: "Coming up", count: comingCount },
  ];

  return (
    <div
      role="tablist"
      aria-label="Today"
      className="mb-4 flex items-center gap-1 border-b-2 border-line-heavy"
    >
      {tabs.map((t) => {
        const active = t.key === current;
        return (
          <button
            key={t.key}
            role="tab"
            aria-selected={active}
            disabled={pending}
            onClick={() => go(t.key)}
            className={cn(
              "-mb-0.5 inline-flex items-center gap-2 border-b-2 px-3 py-2 text-body",
              "font-medium transition-colors duration-fast",
              active
                ? "border-accent text-ink"
                : "border-transparent text-ink-muted hover:text-ink"
            )}
          >
            {t.label}
            <span
              className={cn(
                "tabular rounded px-1.5 py-0.5 text-caption font-semibold",
                active ? "bg-accent text-white btn-on-accent" : "bg-sunken text-ink-subtle"
              )}
            >
              {t.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
