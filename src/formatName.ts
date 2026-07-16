/**
 * Convert ALL CAPS name to Sentence Case while normalizing academic titles.
 * Input format doesn't matter — always normalizes to correct form.
 *
 * "HENDRA WIJAYA, S.PD."  → "Hendra Wijaya, S.Pd."
 * "S.pd.i."               → "S.Pd.I."
 * "s.th.i"                → "S.Th.I"
 */

// Normalized title → dotless variants for matching
const TITLE_MAP: Record<string, string[]> = {
  "Dr":      ["dr"],
  "Prof":    ["prof"],
  "Ir":      ["ir"],
  "Hj":      ["hj"],
  "H":       ["h"],
  "Dra":     ["dra"],
  "Drs":     ["drs"],
  "Mm":      ["mm"],
  "Mh":      ["mh"],
  "S.Pd":    ["spd"],
  "S.Pd.I":  ["spdi"],
  "M.Pd":    ["mpd"],
  "M.Si":    ["msi"],
  "S.Kom":   ["skom"],
  "S.Si":    ["ssi"],
  "S.Th.I":  ["sth.i", "sthi"],
  "S.T":     ["st"],
  "S.E":     ["se"],
  "S.Ag":    ["sag"],
  "S.S":     ["ss"],
  "S.P":     ["sp"],
  "M.A":     ["ma"],
  "M.M":     ["mm2"],
  "Ph.D":    ["phd"],
  "Dr.h.c":  ["drh.c", "drhc"],
};

// Build: dotless+lowercase → normalized form
const titleLookup = new Map<string, string>();
for (const [normalized, variants] of Object.entries(TITLE_MAP)) {
  for (const v of variants) {
    titleLookup.set(v.toLowerCase(), normalized);
  }
}

// "Mm" appears in both "Mm" (simple) and "M.M" → M.M wins since it was added after
// Override: "mm" → "M.M" (more specific)
titleLookup.set("mm", "M.M");

function normalizeTitleWord(word: string): string {
  const trailing = word.match(/[.,;:]+$/)?.[0] ?? "";
  const stripped = word.slice(0, word.length - trailing.length);
  const dotless = stripped.replace(/\./g, "").toLowerCase();
  const normalized = titleLookup.get(dotless);
  return normalized ? normalized + trailing : word;
}

function isTitleWord(word: string): boolean {
  const trailing = word.match(/[.,;:]+$/)?.[0] ?? "";
  const stripped = word.slice(0, word.length - trailing.length);
  const dotless = stripped.replace(/\./g, "").toLowerCase();
  return titleLookup.has(dotless);
}

export function toSentenceCase(name: string): string {
  if (!name) return name;

  return name
    .split(/\s+/)
    .map((word) => {
      if (isTitleWord(word)) return normalizeTitleWord(word);
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}
