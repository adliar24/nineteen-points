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

  const formatted = name
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

  // Pengecualian khusus untuk gelar S.A.B. / A.B. (Sarjana Administrasi Bisnis)
  return formatted
    .replace(/\bS\.A\.Ab\b/g, "S.A.B")
    .replace(/\bA\.Ab\b/g, "A.B")
    .replace(/\bAb\./g, "AB.");
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

/**
 * Custom sort comparator for class names like X-A, XI-B, XII-C.
 * Sorts by grade Roman numeral (X < XI < XII) and then alphabetically.
 */
export function compareClasses(a: string, b: string): number {
  if (a === b) return 0;

  const parseClass = (c: string) => {
    const match = c.match(/^(XII|XI|X)\b[- ]*(.*)$/i);
    if (match) {
      const grade = match[1].toUpperCase();
      const section = match[2];
      const gradeValue = grade === "XII" ? 12 : grade === "XI" ? 11 : 10;
      return { gradeValue, section };
    }
    return { gradeValue: 99, section: c };
  };

  const pA = parseClass(a);
  const pB = parseClass(b);

  if (pA.gradeValue !== pB.gradeValue) {
    return pA.gradeValue - pB.gradeValue;
  }
  return pA.section.localeCompare(pB.section, undefined, { numeric: true, sensitivity: "base" });
}

