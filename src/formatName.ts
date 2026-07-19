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

export function formatSubjectName(subject: string): string {
  if (!subject) return "";

  const uppercaseAcronyms = ["PKWU", "PAIBP", "PJOK", "KKA", "KBM", "IHT", "TL"];
  const lowercaseWords = ["dan", "atau", "ke", "di", "dari", "yang", "untuk"];

  return subject
    .split(/\s+/)
    .map(word => {
      const cleanWord = word.replace(/[^a-zA-Z]/g, "").toUpperCase();
      if (uppercaseAcronyms.includes(cleanWord)) {
        return word.toUpperCase();
      }

      const cleanLower = word.toLowerCase();
      if (lowercaseWords.includes(cleanLower)) {
        return cleanLower;
      }

      if (word.length === 0) return "";
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}
