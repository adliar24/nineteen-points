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
