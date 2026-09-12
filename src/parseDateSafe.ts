/**
 * Safari-safe date parser.
 * Safari parses "YYYY-MM-DD" as UTC while Chrome parses it as local time,
 * which shifts the date by 1 day. This function always parses in local time.
 *
 * Usage: parseDateSafe("2024-01-15") — returns Date in local timezone
 *        parseDateSafe("2024-01-15T10:30:00") — works for ISO timestamps too
 *        parseDateSafe("2024-01-15T10:30:00Z") — UTC timestamps stay UTC
 */
export function parseDateSafe(dateStr: string | null | undefined): Date {
  if (!dateStr) return new Date();

  // If it's already a full timestamp with time info, use native parsing
  // (UTC "Z" timestamps are unambiguous, and "T" with timezone offset is too)
  if (dateStr.includes("T")) {
    return new Date(dateStr);
  }

  // For date-only strings "YYYY-MM-DD", append local midnight time
  // to force local timezone parsing instead of UTC
  return new Date(dateStr + "T00:00:00");
}

/**
 * Format Date object into local 'YYYY-MM-DD' without UTC shift.
 */
export function formatLocalDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Convert UTC timestamp (or ISO string) into Indonesia WIB (UTC+7) 'YYYY-MM-DD'.
 */
export function getWibDateStr(isoString: string | null | undefined): string {
  if (!isoString) return formatLocalDate(new Date());
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString.slice(0, 10);
    // Add 7 hours (WIB is UTC+7)
    const wib = new Date(d.getTime() + 7 * 60 * 60 * 1000);
    return wib.toISOString().slice(0, 10);
  } catch {
    return isoString.slice(0, 10);
  }
}
