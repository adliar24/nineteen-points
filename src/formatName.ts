/**
 * Convert ALL CAPS name to Sentence Case while preserving academic titles.
 * e.g. "HENDRA WIJAYA, S.Pd." → "Hendra Wijaya, S.Pd."
 * e.g. "AHMAD FAUZI" → "Ahmad Fauzi"
 * e.g. "DRA. SITI NURHALIZA, M.PD." → "Dra. Siti Nurhaliza, M.Pd."
 */
export function toSentenceCase(name: string): string {
  if (!name) return name;
  const titleRegex = /^(Dr|Prof|Ir|Hj|H|Dra|Sp|St|M|S|A|B|Ph|S\.Pd|M\.Pd|M\.Si|S\.Kom|S\.T|S\.E|S\.Ag|S\.P|Dr\.h\.c|Drs|Dra|MM|MH|M\.A|Ph\.D)\.?$/i;

  return name.split(/\s+/).map((word) => {
    const clean = word.replace(/[.,;:]/g, "");
    if (titleRegex.test(clean)) return word;
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  }).join(" ");
}
