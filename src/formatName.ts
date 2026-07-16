/**
 * Convert ALL CAPS name to Sentence Case while normalizing academic titles.
 * e.g. "HENDRA WIJAYA, S.PD." → "Hendra Wijaya, S.Pd."
 * e.g. "AHMAD FAUZI" → "Ahmad Fauzi"
 * e.g. "DRA. SITI NURHALIZA, M.PD." → "Dra. Siti Nurhaliza, M.Pd."
 * e.g. "S.pd." → "S.Pd."
 */

// Normalized form → raw input pattern
const TITLE_MAP: Record<string, string[]> = {
  // Simple titles (first letter capital, rest lowercase)
  "Dr":    ["dr", "DR", "Dr."],
  "Prof":  ["prof", "PROF", "Prof."],
  "Ir":    ["ir", "IR", "Ir."],
  "Hj":    ["hj", "HJ", "Hj."],
  "H":     ["h", "H."],
  "Dra":   ["dra", "DRA", "Dra."],
  "Drs":   ["drs", "DRS", "Drs."],
  "Mm":    ["mm", "MM", "Mm."],
  "Mh":    ["mh", "MH", "Mh."],

  // Compound titles (each segment: first letter uppercase, rest lowercase)
  "S.Pd":  ["s.pd", "S.PD", "S.pd", "spd", "SPD", "Spd"],
  "M.Pd":  ["m.pd", "M.PD", "M.pd", "mpd", "MPD", "Mpd"],
  "M.Si":  ["m.si", "M.SI", "M.si", "msi", "MSI", "Msi"],
  "S.Kom": ["s.kom", "S.KOM", "S.kom", "skom", "SKOM", "Skom"],
  "S.T":   ["s.t", "S.T", "St", "ST"],
  "S.E":   ["s.e", "S.E", "Se", "SE"],
  "S.Ag":  ["s.ag", "S.AG", "S.ag", "sag", "SAG", "Sag"],
  "S.P":   ["s.p", "S.P", "Sp", "SP"],
  "M.A":   ["m.a", "M.A", "Ma", "MA"],
  "M.M":   ["m.m", "M.M", "Mm", "MM"],
  "Ph.D":  ["ph.d", "PH.D", "Ph.d", "Ph.D", "phd", "PHD"],
  "Dr.h.c":["dr.h.c", "DR.H.C"],
};

// Build lookup: lowercase input → normalized form
const titleLookup = new Map<string, string>();
for (const [normalized, variants] of Object.entries(TITLE_MAP)) {
  for (const v of variants) {
    titleLookup.set(v.toLowerCase(), normalized);
  }
}

function formatTitleWord(word: string): string {
  // Strip trailing punctuation (comma, period, etc.) for matching
  const trailing = word.match(/[.,;:]+$/)?.[0] ?? "";
  const stripped = word.slice(0, word.length - trailing.length);
  const normalized = titleLookup.get(stripped.toLowerCase());
  return normalized ? normalized + trailing : word;
}

export function toSentenceCase(name: string): string {
  if (!name) return name;

  return name
    .split(/\s+/)
    .map((word) => {
      // Check if this word is a known title
      const trailing = word.match(/[.,;:]+$/)?.[0] ?? "";
      const stripped = word.slice(0, word.length - trailing.length);
      if (titleLookup.has(stripped.toLowerCase())) {
        return formatTitleWord(word);
      }
      // Regular word: sentence case
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}
