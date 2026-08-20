import { Skeleton, ListSkeleton } from "@/components/ui";

/**
 * Today, mid-load.
 *
 * The three target cards and the status banner are always there, whatever the
 * data says, so they are drawn in place. Only the queue is unknown.
 */
export default function Loading() {
  return (
    <div role="status" aria-label="Loading today">
      <span className="sr-only">Loading your day…</span>

      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <Skeleton className="h-7 w-28" />
          <Skeleton className="mt-2 h-4 w-52" />
        </div>
        <Skeleton className="h-8 w-32" />
      </div>

      {/* Status banner */}
      <div className="mb-6 flex items-center gap-3 rounded-card border border-line bg-surface px-4 py-3">
        <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="mt-2 h-3 w-full max-w-[380px]" />
        </div>
      </div>

      {/* Targets */}
      <div className="mb-8 grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-card border border-line bg-surface p-4">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-3 h-7 w-20" />
            <Skeleton className="mt-3 h-1.5 w-full rounded-full" />
          </div>
        ))}
      </div>

      <ListSkeletonRowsOnly />
    </div>
  );
}

/** The queue, without repeating the page heading the block above already drew. */
function ListSkeletonRowsOnly() {
  return (
    <div className="overflow-hidden rounded-card border border-line-strong bg-surface">
      <div className="border-b-2 border-line-heavy bg-sunken px-3 py-2">
        <Skeleton className="h-3 w-20" />
      </div>
      {Array.from({ length: 7 }).map((_, i) => (
        <div
          key={i}
          className={`flex items-center gap-3 border-b border-line px-3 py-2.5 last:border-0 ${
            i % 2 === 1 ? "bg-sunken/40" : ""
          }`}
        >
          <Skeleton className="h-4 w-4 shrink-0 rounded-sm" />
          <Skeleton className="h-4 w-full max-w-[170px]" />
          <Skeleton className="hidden h-4 w-28 sm:block" />
          <Skeleton className="ml-auto h-4 w-14" />
        </div>
      ))}
    </div>
  );
}
