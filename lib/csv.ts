/**
 * CSV, done properly and without a dependency.
 *
 * Splitting on commas is the usual shortcut and it is wrong: a notes field
 * containing "called him, no answer" would silently shift every column after
 * it. This is a real RFC 4180 parser - quoted fields, escaped quotes, embedded
 * commas and newlines - because import data is exactly where a silent corruption
 * is hardest to notice and most expensive to undo.
 */

export type Row = Record<string, string>;

/** Parse a whole CSV file into header + rows. Handles \r\n, \n and \r. */
export function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  // A byte order mark on the first header would make "Handle" not match "Handle".
  const input = text.replace(/^﻿/, "");

  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  let i = 0;

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    // Skip rows that are entirely empty - trailing newlines are normal.
    if (row.some((c) => c.trim() !== "")) rows.push(row);
    row = [];
  };

  while (i < input.length) {
    const char = input[i];

    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"'; // an escaped quote
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += char;
      i++;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (char === ",") {
      endField();
      i++;
      continue;
    }
    if (char === "\r") {
      if (input[i + 1] === "\n") i++;
      endRow();
      i++;
      continue;
    }
    if (char === "\n") {
      endRow();
      i++;
      continue;
    }

    field += char;
    i++;
  }

  if (field !== "" || row.length > 0) endRow();

  /* FIND THE HEADER ROW. Do not assume it is the first one.

     Every book in this company starts with a title banner:

       row 1   Moneyheist's Book — Player Database,,,,,,,,
       row 2   (blank - dropped above)
       row 3   Player ID,Player Name / Handle,Source,Roobet Username,...

     Taking row 1 as the header did not merely fail. It squashed to
     "moneyheistsbookplayerdatabase", which CONTAINS "player", so the loose
     handle fallback matched it and mapped handle to column 0 - the Player ID
     column. The import would have run happily and created 244 players all
     called MH-0001, MH-0002, with no username, no status and no dates.

     A silent wrong answer is far worse than a refusal, so the header is now
     found by looking for it. */
  const headerIndex = findHeaderRow(rows);
  const headers = (rows[headerIndex] ?? []).map((h) => h.trim());
  return { headers, rows: rows.slice(headerIndex + 1) };
}

/**
 * Which of the first few rows is the header?
 *
 * Scored on how many known column names it contains. A title banner scores
 * zero; a real header row scores several. Only the first ten rows are
 * considered - a header further down than that is not a header, it is a
 * different problem.
 */
function findHeaderRow(rows: string[][]): number {
  let best = 0;
  let bestScore = 0;

  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const squashed = rows[i].map((c) => squash(c.trim()));
    let score = 0;
    for (const aliases of Object.values(ALIASES)) {
      if (squashed.some((h) => h !== "" && aliases.includes(h))) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }

  /* Nothing recognisable anywhere. Fall back to the first row so the caller
     reports "couldn't find a handle column" against something real, rather
     than against an arbitrary row further down. */
  return bestScore === 0 ? 0 : best;
}

/** Quote a value only when it needs it, and escape any quotes inside. */
function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Build a CSV file from rows of objects.
 *
 * Prefixed with a BOM so Excel opens UTF-8 correctly - without it, a name with
 * an accent arrives mangled, which is the single most common complaint about
 * CSV exports.
 */
export function toCsv(headers: { key: string; label: string }[], rows: Row[]): string {
  const lines = [headers.map((h) => escapeCell(h.label)).join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => escapeCell(row[h.key])).join(","));
  }
  return "﻿" + lines.join("\r\n");
}

/**
 * Match a file's headers to our fields.
 *
 * People export from all sorts of places, so "Player Handle", "handle" and
 * "player_handle" all need to mean the same thing. Matching is done on a
 * squashed lowercase form rather than exact text.
 */
const ALIASES: Record<string, string[]> = {
  handle: [
    "handle",
    "playerhandle",
    "player",
    "username",
    "name",
    "leadname",
    // What our own old spreadsheets actually call it.
    "playernamehandle",
    "playername",
    "playerhandlename",
  ],
  roobet_username: [
    "roobetusername",
    "roobet",
    "roobetuser",
    "casinousername",
    "roobetname",
  ],
  source: ["source", "leadsource", "platform", "channel"],
  status: ["status", "stage", "leadstatus", "pipelinestatus"],
  notes: ["notes", "note", "comment", "comments", "remarks"],
  assigned_at: ["assignedat", "dateassigned", "dateadded", "created", "createdat", "added"],
  last_contact_at: [
    "lastcontactat",
    "lastcontact",
    "lastcontacted",
    "lastcontactdate",
    "lasttouch",
  ],
  /* The day they first deposited.

     Left out of the first version, and the Wager page caught it immediately:
     "wagering, never marked deposited" listed exactly the three players whose
     sheet had an FTD date. Without this every imported player who deposited
     looks like a missed FTD forever, and the first-deposit numbers are wrong
     by however many the old sheet already knew about. */
  first_deposit_at: [
    "ftddate",
    "ftd",
    "firstdeposit",
    "firstdepositat",
    "firstdepositdate",
    "depositdate",
  ],
  /* How many times they have been chased. Resetting this to zero on import
     hides everyone who is already close to the give-up threshold, which is
     the one signal that says "stop spending time here". */
  followup_attempts: ["followupattempts", "attempts", "contactattempts", "touches"],
  kyc_status: ["kycstatus", "kyc"],
  deposit_status: ["depositstatus", "deposited", "deposit"],
  reference: ["reference", "ref", "id", "playerid"],
};

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Is this row empty for our purposes?
 *
 * A spreadsheet's unused rows are rarely actually empty, and they are empty in
 * two different ways.
 *
 * Moneyheist's book had 1,555 rows carrying "0" in formula columns, because
 * the formula filled down past the data. Seb's book has 135 rows carrying only
 * a SOURCE - a dropdown he dragged to the bottom of the sheet. Both are
 * nobody; both were being reported as "No player handle", 135 times, burying
 * the two problems that mattered.
 *
 * So emptiness is judged on the columns only a real person has: a handle, a
 * Roobet username, a reference, notes, or a date something happened to them.
 * A source and a status are what the sheet fills in for you.
 *
 * A row with no handle but WITH one of those - a note, a username - is not
 * filler. Somebody lost a name, and that is worth reporting.
 */
const IDENTITY_FIELDS = [
  "handle",
  "roobet_username",
  "reference",
  "notes",
  "last_contact_at",
  "first_deposit_at",
];

export function isBlankRow(
  cells: string[],
  mapping: Record<string, number>
): boolean {
  for (const field of IDENTITY_FIELDS) {
    const index = mapping[field];
    if (index === undefined) continue;
    const value = (cells[index] ?? "").trim();
    if (value === "") continue;

    /* A reference is a code, not prose.

       Seb's book ends with a legend - "Sent to VIP Team - players you've
       personally handed off..." - sitting in the Player ID column. Treating
       that as identity made the row look like a player who had lost their
       name. Anything with a space in it, or longer than a reference could
       plausibly be, is a note somebody typed. */
    if (field === "reference" && (value.length > 24 || /\s/.test(value))) {
      continue;
    }

    return false;
  }
  return true;
}

/**
 * Is this row the header again?
 *
 * Long sheets often repeat their header partway down so it stays readable
 * while scrolling. Seb's book does. Without this it imports as a player
 * called "Player Handle" whose status is "Status".
 */
export function isRepeatedHeader(cells: string[], headers: string[]): boolean {
  const squashedHeaders = new Set(headers.map((h) => squash(h)).filter(Boolean));
  let matches = 0;
  for (const cell of cells) {
    const value = squash(cell);
    if (value && squashedHeaders.has(value)) matches++;
  }
  // Two or more cells that are themselves column names is not a coincidence.
  return matches >= 2;
}

export function guessMapping(headers: string[]): Record<string, number> {
  const mapping: Record<string, number> = {};
  const squashed = headers.map(squash);

  for (const [field, aliases] of Object.entries(ALIASES)) {
    const index = squashed.findIndex((h) => aliases.includes(h));
    if (index !== -1) mapping[field] = index;
  }

  /* Last resort for the one column that is mandatory.
  
     Without a handle the import refuses to run at all, so rather than fail on
     a header nobody anticipated - "Player Name / Handle", "Lead Handle (IG)" -
     take the first column that merely CONTAINS handle, then the first that
     contains player. Never a column already claimed by something else, so
     "Player ID" cannot be mistaken for the name.
  
     Deliberately only for handle. Guessing loosely at a status or a date
     would put wrong data in silently; guessing at the handle either finds the
     name column or produces obvious nonsense the preview will show. */
  /* Only guess loosely if this row looks like a header at all.

     Requiring at least one EXACT match first is what stops the guess running
     on a title banner. "Moneyheist's Book — Player Database" contains
     "player", so without this it confidently mapped the handle to a row that
     was not a header and a column that was not a name. A real header row
     always matches something exactly - source, status, notes, a date. */
  if (mapping.handle === undefined && Object.keys(mapping).length > 0) {
    const taken = new Set(Object.values(mapping));
    const loose = (needle: string) =>
      squashed.findIndex(
        (h, i) => !taken.has(i) && h.includes(needle) && !h.includes("id")
      );

    const byHandle = loose("handle");
    const byPlayer = byHandle !== -1 ? byHandle : loose("player");
    if (byPlayer !== -1) mapping.handle = byPlayer;
  }

  return mapping;
}

/**
 * Read a date from a CSV cell.
 *
 * Ambiguous formats are rejected rather than guessed. 03/04/2026 is either
 * March or April depending on who exported it, and quietly picking one would
 * put a follow-up a month out without anyone noticing. ISO and unambiguous
 * day-month-year forms are accepted; everything else is reported as a problem
 * for that row.
 */
export function parseDate(value: string): { date: Date | null; error?: string } {
  const raw = value.trim();
  if (!raw) return { date: null };

  // ISO: 2026-08-10 or 2026-08-10T09:00:00Z
  if (/^\d{4}-\d{2}-\d{2}([T ]|$)/.test(raw)) {
    const d = new Date(raw.includes("T") ? raw : `${raw}T12:00:00Z`);
    return isNaN(d.getTime()) ? { date: null, error: `Unreadable date "${raw}"` } : { date: d };
  }

  // D/M/YYYY or D-M-YYYY where the first number is clearly a day.
  const slash = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (slash) {
    const [, a, b, y] = slash;
    const first = Number(a);
    const second = Number(b);
    if (first > 12 && second <= 12) {
      return { date: new Date(Date.UTC(Number(y), second - 1, first, 12)) };
    }
    if (second > 12 && first <= 12) {
      return { date: new Date(Date.UTC(Number(y), first - 1, second, 12)) };
    }
    return {
      date: null,
      error: `"${raw}" could be day/month or month/day. Use YYYY-MM-DD.`,
    };
  }

  return { date: null, error: `Unreadable date "${raw}". Use YYYY-MM-DD.` };
}


/* ------------------------------------------------- Retired status names */

/**
 * Statuses the old spreadsheets still offer, mapped to what replaced them.
 *
 * The funnel was simplified: 'Interested' had the same cadence and next
 * action as Initial Contact, and KYC became its own field rather than a
 * stage. Thirteen sheets still have those in their dropdowns, and asking
 * someone to hand-edit every one before an import is work a lookup table can
 * do instead.
 *
 * KYC Complete becomes First Deposit rather than Initial Contact, because
 * someone who finished KYC is further along - dropping them to the start of
 * the funnel would put "check their KYC" in front of a rep for a player whose
 * KYC is done.
 */
export const RETIRED_STATUSES: Record<string, string> = {
  "interested": "Initial Contact",
  "kyc started": "Initial Contact",
  "kyc complete": "First Deposit",
  "kyc completed": "First Deposit",
  "deposited": "First Deposit",
  "first time deposit": "First Deposit",
  "ftd": "First Deposit",
  "vip transfer": "VIP Transferred",
  "vip": "VIP Transferred",
  "dead": "Dead Lead",
  "reactivation": "Reactivation Queue",
  "potential": "Potential Lead",
};

/**
 * Resolve whatever the sheet said into a status the CRM has.
 *
 * Returns the resolved name and whether it was renamed, so the preview can
 * say "these 41 rows will become First Deposit" rather than silently changing
 * them.
 */
export function resolveStatus(
  raw: string,
  valid: Set<string>
): { status: string; renamedFrom?: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { status: "Initial Contact" };
  if (valid.has(trimmed)) return { status: trimmed };

  // Case-insensitive match against the real names first.
  const exact = Array.from(valid).find(
    (v) => v.toLowerCase() === trimmed.toLowerCase()
  );
  if (exact) return { status: exact };

  const mapped = RETIRED_STATUSES[trimmed.toLowerCase()];
  if (mapped && valid.has(mapped)) {
    return { status: mapped, renamedFrom: trimmed };
  }

  return { status: "Initial Contact", renamedFrom: trimmed };
}
