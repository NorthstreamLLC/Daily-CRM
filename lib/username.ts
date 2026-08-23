/**
 * Username shape checks - deliberately its own file.
 *
 * This lives apart from lib/queries.ts because it is used by a CLIENT
 * component (the player detail panel) and queries.ts imports next/headers,
 * which cannot cross that line.
 *
 * `tsc` did not catch that: shared.tsx had only ever imported a TYPE from
 * queries.ts, and types are erased. Importing one real function pulled the
 * whole server module into the browser bundle, and only `next build` said so.
 * Worth remembering - a green typecheck is not a green build.
 */

/**
 * Could this string be a Roobet username?
 *
 * Not "does this account exist" - that needs the leaderboard. This catches the
 * other thing, which is a rep writing a NOTE in the username box:
 *
 *   "creating account and grabbing stake stats"
 *
 * That is worse than leaving it empty. An empty field is visible - it shows in
 * the Book's "No Roobet username" filter and somebody eventually chases it.
 * A sentence looks filled in, so nothing ever asks about it again, and that
 * player's wager is attributed to nobody for as long as the CRM exists.
 *
 * Deliberately loose. A false positive costs a rep two seconds of reading a
 * hint they can ignore; a false negative costs a player's whole wager history.
 */
export function usernameLooksWrong(value: string | null): string | null {
  const v = (value ?? "").trim();
  if (!v) return null; // Empty is a different problem, already handled.

  if (/\s/.test(v)) return "That has a space in it, so it is probably a note rather than a username.";
  if (v.length > 24) return "That is longer than any Roobet username.";
  if (v.length < 3) return "That is too short to be a Roobet username.";
  if (/^(n\/?a|none|no|tbd|pending|unknown|\?+|-+)$/i.test(v))
    return "That is a placeholder. Leave it empty instead, so they stay on the chase list.";
  if (!/^[A-Za-z0-9_.-]+$/.test(v))
    return "Roobet usernames are letters, digits, underscore, dot or hyphen only.";

  return null;
}
