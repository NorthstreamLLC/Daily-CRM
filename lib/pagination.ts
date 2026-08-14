/**
 * Paging constants, kept free of any server imports.
 *
 * The toolbar is a client component and needs these values, so they cannot
 * live alongside the database queries - importing that module into the browser
 * bundle drags `next/headers` with it and the build fails.
 */

export const PAGE_SIZES = [25, 50, 100, 200] as const;
/* 100, because a real book is 200-300 players. At 50 a rep pages three times
   to see their own book, which is how a list stops being scanned and starts
   being avoided. */
export const DEFAULT_PAGE_SIZE = 100;

/** Only ever a size we offer - a hand-edited URL cannot ask for 100,000 rows. */
export function resolvePageSize(value: string | undefined): number {
  const n = Number(value);
  return (PAGE_SIZES as readonly number[]).includes(n) ? n : DEFAULT_PAGE_SIZE;
}
