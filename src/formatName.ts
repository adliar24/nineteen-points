/**
 * Convert ALL CAPS name to Sentence Case while preserving academic titles.
 * e.g. "HENDRA WIJAYA, S.Pd." → "Hendra Wijaya, S.Pd."
 * e.g. "AHMAD FAUZI" → "Ahmad Fauzi"
 * e.g. "DRA. SITI NURHALIZA, M.PD." → "Dra. Siti Nurhaliza, M.Pd."
 */

const SIMPLE_TITLES = new Set([
  "dr", "prof", "ir", "hj", "h", "dra", "drs", "mm", "mh", "sp", "st",
]);

const COMPOUND_TITLES = new Set([
  "s.pd", "m.pd", "m.si", "s.kom", "s.t", "s.e", "s.ag", "s.p",
  "m.a", "ph.d", "dr.h.c",
]);

function isTitleWord(word: string): boolean {
  const stripped = word.replace(/[.,;:]+$/g, "");
  if (SIMPLE_TITLES.has(stripped.toLowerCase())) return true;
  if (COMPOUND_TITLES.has(stripped.toLowerCase())) return true;
  return false;
}

export function toSentenceCase(name: string): string {
  if (!name) return name;

  return name
    .split(/\s+/)
    .map((word) => {
      if (isTitleWord(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}
