import { Skeleton } from "@/components/ui";

/**
 * The Book, mid-load.
 *
 * The filter bar is drawn solid rather than as a skeleton would be, because it
 * is the part people reach for first and it never depends on the query.
 */
export default function Loading() {
  return (
    <div role="status" aria-label="Loading the book">
      <span className="sr-only">Loading the book…</span>

      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <Skeleton className="h-7 w-24" />
          <Skeleton className="mt-2 h-4 w-48" />
        </div>
        <Skeleton className="h-8 w-28" />
      </div>

      {/* Filter bar */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-8 w-24" />
      </div>

      <div className="overflow-hidden rounded-card border border-line-strong bg-surface">
        <div className="border-b-2 border-line-heavy bg-sunken px-3 py-2">
          <Skeleton className="h-3 w-28" />
        </div>
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className={`flex items-center gap-3 border-b border-line px-3 py-2.5 last:border-0 ${
              i % 2 === 1 ? "bg-sunken/40" : ""
            }`}
          >
            <Skeleton className="h-4 w-full max-w-[160px]" />
            <Skeleton className="hidden h-4 w-24 sm:block" />
            <Skeleton className="hidden h-4 w-20 md:block" />
            <Skeleton className="ml-auto h-4 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}
