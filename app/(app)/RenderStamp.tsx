import { cn } from "@/components/ui";

/**
 * HOW LONG THIS PAGE TOOK, AND WHERE IT RAN.
 *
 * Written because diagnosing "it feels slow" was costing a round trip of
 * "open DevTools, find the document request, read x-vercel-id" every time,
 * and that is a fair thing for someone to not want to do. The two facts that
 * actually settle the question are the server render time and the region, so
 * the page reports them itself.
 *
 * WHAT THE NUMBER MEANS
 *   Time spent fetching this page's data on the server. It excludes the
 *   network hop out to the browser and the browser's own rendering, so it is
 *   the part that is ours to fix.
 *
 * WHAT TO CONCLUDE
 *   under 300ms   the server is fine; anything slow is network or the browser
 *   300ms-1s      queries are the cost - fewer round trips, or cache them
 *   over 1s       something is doing far too much work
 *
 *   Region `iad1` with a database in `us-west-2` means every query crosses the
 *   country. That is the one to check first, and it is why the region is here
 *   rather than only the timing.
 *
 * Admin-only, and deliberately plain text at the very bottom - it is
 * instrumentation, not a feature.
 */
export function RenderStamp({
  ms,
  label,
  parts,
}: {
  ms: number;
  label?: string;
  /* Per-query timings. Six things run in parallel here, so the total is the
     slowest one - and without the breakdown, "8.6 seconds" names six suspects
     and convicts none. */
  parts?: { name: string; ms: number }[];
}) {
  const region = process.env.VERCEL_REGION ?? "local";
  const tone =
    ms < 300 ? "text-ink-subtle" : ms < 1000 ? "text-warning" : "text-danger";

  return (
    <p className={cn("mt-10 text-caption", tone)}>
      {label ? `${label}: ` : ""}
      data fetched in <span className="tabular font-medium">{ms}ms</span> ·{" "}
      region <span className="font-medium">{region}</span>
      {region === "iad1" && (
        <span className="text-danger">
          {" "}
          — database is in us-west-2, so every query is crossing the country.
          Set the function region to pdx1.
        </span>
      )}
      {parts && parts.length > 0 && (
        <>
          <br />
          <span className="text-ink-subtle">
            {[...parts]
              .sort((a, b) => b.ms - a.ms)
              .map((p) => `${p.name} ${p.ms}ms`)
              .join(" · ")}
          </span>
        </>
      )}
    </p>
  );
}

/**
 * Time one promise without changing what it returns.
 *
 * `const [a, b] = await Promise.all([timed("a", f()), timed("b", g())])` gives
 * both the values and a record of which one was slow, which is the only way
 * to tell a parallel batch's total from its culprit.
 */
export async function timed<T>(
  name: string,
  promise: Promise<T>,
  into: { name: string; ms: number }[]
): Promise<T> {
  const t0 = Date.now();
  try {
    return await promise;
  } finally {
    into.push({ name, ms: Date.now() - t0 });
  }
}
