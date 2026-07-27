/**
 * Extract students from KELAS X (1).xlsx, skip PRESENSI FOTO sheet, proper dedup
 */
import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import XLSX from "xlsx";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const excelPath = resolve(__dirname, "../KELAS X (1).xlsx");
const wb = XLSX.readFile(excelPath);

console.log(`All sheets: ${wb.SheetNames.join(", ")}`);

// Only include sheets A through K (skip PRESENSI FOTO)
const classSheets = wb.SheetNames.filter((s) => /^[A-K]$/.test(s.trim()));
console.log(`Class sheets: ${classSheets.join(", ")}`);

const allStudents: { nis: string; nama: string; kelas: string; sheet: string; jk: string; keterangan: string }[] = [];

for (const sheetName of classSheets) {
  const ws = wb.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1 });

  console.log(`\nSheet ${sheetName}: ${data.length} rows`);

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row) continue;

    const no = row[0];
    const nis = String(row[1] || "").trim();
    const nama = String(row[2] || "").trim();
    const jk = String(row[3] || "").trim();
    const keterangan = String(row[4] || "").trim();

    if (!nis || !nama || nis === "NIS" || nama === "NAMA") continue;
    if (no === "NO" || no === undefined) continue;

    allStudents.push({
      nis,
      nama,
      kelas: `X-${sheetName}`,
      sheet: sheetName,
      jk,
      keterangan,
    });
  }
}

console.log(`\nTotal students (before dedup): ${allStudents.length}`);

// Dedup by NIS (keep first occurrence = from class sheet)
const seen = new Set<string>();
const deduped = allStudents.filter((s) => {
  if (seen.has(s.nis)) return false;
  seen.add(s.nis);
  return true;
});

// Find real duplicates (different students, same NIS)
const nisCount = new Map<string, number>();
for (const s of allStudents) {
  nisCount.set(s.nis, (nisCount.get(s.nis) || 0) + 1);
}
const realDuplicates: { nis: string; entries: typeof allStudents }[] = [];
for (const [nis, count] of nisCount) {
  if (count > 1) {
    const entries = allStudents.filter((s) => s.nis === nis);
    // Check if different names
    const names = [...new Set(entries.map((e) => e.nama))];
    if (names.length > 1) {
      realDuplicates.push({ nis, entries });
    }
  }
}

console.log(`After dedup: ${deduped.length}`);
console.log(`Real duplicates (different students, same NIS): ${realDuplicates.length}`);

if (realDuplicates.length > 0) {
  console.log("\n--- REAL DUPLICATES ---");
  for (const d of realDuplicates) {
    console.log(`  NIS ${d.nis}:`);
    for (const e of d.entries) {
      console.log(`    - ${e.nama} (${e.kelas})`);
    }
  }
}

// Show NIS stats
const nises = deduped.map((s) => s.nis);
const numericNis = nises.filter((n) => /^\d+$/.test(n));
console.log(`\nNIS stats:`);
console.log(`  Total unique students: ${deduped.length}`);
console.log(`  Numeric NIS: ${numericNis.length}`);
console.log(`  Non-numeric NIS: ${nises.length - numericNis.length}`);

if (nises.length - numericNis.length > 0) {
  console.log(`  Non-numeric NIS values:`);
  for (const n of nises) {
    if (!/^\d+$/.test(n)) {
      console.log(`    "${n}" (${deduped.find((s) => s.nis === n)?.nama})`);
    }
  }
}

// Show sample
console.log("\nFirst 5 students:");
for (const s of deduped.slice(0, 5)) {
  console.log(`  ${s.nis} | ${s.nama} | ${s.kelas} | ${s.jk}`);
}

writeFileSync(resolve(__dirname, "../excel_students_v2.json"), JSON.stringify(deduped, null, 2));
console.log(`\nSaved to excel_students_v2.json`);
