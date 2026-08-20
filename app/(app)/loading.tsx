import { ListSkeleton } from "@/components/ui";

/**
 * THE FALLBACK EVERY PAGE IN THE APP GETS.
 *
 * One file, and every route under (app) that has no loading.tsx of its own
 * now responds the instant it is clicked instead of freezing the page you are
 * leaving. Nothing got faster - but the app stopped looking broken while it
 * works, and that was most of the complaint.
 *
 * Pages with a distinctive shape (Today, Book) have their own version so the
 * skeleton settles into the real layout rather than jumping.
 */
export default function Loading() {
  return <ListSkeleton rows={6} />;
}
