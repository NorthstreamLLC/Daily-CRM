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

  const headers = (rows.shift() ?? []).map((h) => h.trim());
  return { headers, rows };
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
  handle: ["handle", "playerhandle", "player", "username", "name", "leadname"],
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
  kyc_status: ["kycstatus", "kyc"],
  deposit_status: ["depositstatus", "deposited", "deposit"],
  reference: ["reference", "ref", "id", "playerid"],
};

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export function guessMapping(headers: string[]): Record<string, number> {
  const mapping: Record<string, number> = {};
  const squashed = headers.map(squash);

  for (const [field, aliases] of Object.entries(ALIASES)) {
    const index = squashed.findIndex((h) => aliases.includes(h));
    if (index !== -1) mapping[field] = index;
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
