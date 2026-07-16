/**
 * Convert name to Sentence Case with proper title casing.
 * Simple rule: first letter of each word is uppercase.
 * After any "." or "," the next letter is uppercase.
 *
 * "HENDRA WIJAYA, S.PD."  → "Hendra Wijaya, S.Pd."
 * "s.pd.i."               → "S.Pd.I."
 * "drs. budi, m.pd."      → "Drs. Budi, M.Pd."
 */
export function toSentenceCase(name: string): string {
  if (!name) return name;

  return name
    .split(/\s+/)
    .map((word) => {
      let result = "";
      let capNext = true;
      for (const ch of word) {
        if (capNext && /[a-zA-Z]/.test(ch)) {
          result += ch.toUpperCase();
          capNext = false;
        } else if (ch === "." || ch === ",") {
          result += ch;
          capNext = true;
        } else {
          result += ch.toLowerCase();
        }
      }
      return result;
    })
    .join(" ");
}
