"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Button, cn } from "@/components/ui";
import { ChevronLeft, ChevronRight } from "@/components/icons";

/** Paging for the unclaimed list. Page number lives in the URL like every
 *  other piece of view state, so a position survives a refresh. */
export function UnclaimedPager({
  page,
  pageCount,
  total,
  shown,
}: {
  page: number;
  pageCount: number;
  total: number;
  shown: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();

  function go(next: number) {
    const sp = new URLSearchParams(params.toString());
    if (next <= 1) sp.delete("wp");
    else sp.set("wp", String(next));
    start(() => router.replace(`${pathname}?${sp.toString()}`, { scroll: false }));
  }

  const first = (page - 1) * 50 + 1;
  const last = first + shown - 1;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-2.5">
      <p className="tabular text-small text-ink-muted">
        {first.toLocaleString()}–{last.toLocaleString()} of {total.toLocaleString()}
        {pageCount === 10 && total > 500 && (
          <span className="text-ink-subtle"> · search to reach the rest</span>
        )}
      </p>

      {pageCount > 1 && (
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            disabled={page <= 1 || pending}
            onClick={() => go(page - 1)}
            icon={<ChevronLeft size={14} />}
          >
            Previous
          </Button>

          <div className="flex items-center gap-0.5">
            {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => go(n)}
                aria-current={n === page ? "page" : undefined}
                className={cn(
                  "tabular h-8 min-w-[32px] rounded-control px-1.5 text-small font-medium",
                  "transition-colors duration-fast",
                  n === page
                    ? "bg-accent text-white btn-on-accent"
                    : "text-ink-muted hover:bg-sunken hover:text-ink"
                )}
              >
                {n}
              </button>
            ))}
          </div>

          <Button size="sm" disabled={page >= pageCount || pending} onClick={() => go(page + 1)}>
            Next <ChevronRight size={14} />
          </Button>
        </div>
      )}
    </div>
  );
}
