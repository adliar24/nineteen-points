import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";
import XLSX from "xlsx";

const envLines = fs.readFileSync(".env.local", "utf-8").split("\n");
const envConfig: Record<string, string> = {};
for (const line of envLines) {
  const parts = line.trim().split("=");
  if (parts.length >= 2) {
    envConfig[parts[0].trim()] = parts.slice(1).join("=").trim();
  }
}

const supabaseAdmin = createClient(envConfig.VITE_SUPABASE_URL, envConfig.VITE_SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export interface MasterExcelSiswa {
  nis: string;
  nama: string;
  kelas: string;
  fileOrigin: string;
  sheetOrigin: string;
}

function normalizeClassName(file: string, sheetName: string): string {
  let cleanSheet = sheetName.trim().toUpperCase().replace(/[\s_]+/g, "");
  
  if (file.includes("KELAS X.xlsx")) {
    // Sheet names are A, B, C, D, E, F, G, H, I, J, K
    const letter = cleanSheet.replace(/^X-?/, "");
    return `X-${letter}`;
  } else if (file.includes("KELAS XI.xlsx")) {
    // Sheet names are XI A, XI- B, XI C, etc.
    const letter = cleanSheet.replace(/^XI-?/, "");
    return `XI-${letter}`;
  } else if (file.includes("KELAS XII.xlsx")) {
    // Sheet names are XII- A, XII- B, etc.
    const letter = cleanSheet.replace(/^XII-?/, "");
    return `XII-${letter}`;
  }
  return cleanSheet;
}

export function parseMasterExcelFiles(): MasterExcelSiswa[] {
  const folderPath = path.join(process.cwd(), "kelasfix");
  const result: MasterExcelSiswa[] = [];

  const filesConfig = [
    {
      file: "KELAS X.xlsx",
      sheets: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K"],
    },
    {
      file: "KELAS XI.xlsx",
      sheets: ["XI A", "XI- B", "XI C", "XI D", "XI E", "XI F", "XI G", "XI H", "XI I", "XI J"],
    },
    {
      file: "KELAS XII.xlsx",
      sheets: ["XII- A", "XII- B", "XII- C", "XII- D", "XII- E", "XII- F", "XII- G", "XII- H", "XII- I"],
    },
  ];

  for (const item of filesConfig) {
    const filePath = path.join(folderPath, item.file);
    if (!fs.existsSync(filePath)) {
      console.warn(`File missing: ${filePath}`);
      continue;
    }

    const workbook = XLSX.readFile(filePath);

    for (const sheetName of item.sheets) {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) {
        console.warn(`Sheet '${sheetName}' not found in ${item.file}`);
        continue;
      }

      const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
      if (!rows || rows.length === 0) continue;

      const normKelas = normalizeClassName(item.file, sheetName);

      // Find header row or column indices for NIS & NAMA
      let nisIdx = -1;
      let namaIdx = -1;

      for (let r = 0; r < Math.min(rows.length, 15); r++) {
        const row = rows[r];
        if (!row || !Array.isArray(row)) continue;

        for (let c = 0; c < row.length; c++) {
          const val = String(row[c] || "").trim().toUpperCase();
          if (val === "NIS" || val === "NISN" || val.startsWith("NIS")) {
            if (nisIdx === -1) nisIdx = c;
          }
          if (val.includes("NAMA")) {
            if (namaIdx === -1) namaIdx = c;
          }
        }
        if (nisIdx !== -1 && namaIdx !== -1) {
          for (let dr = r + 1; dr < rows.length; dr++) {
            const dataRow = rows[dr];
            if (!dataRow) continue;
            let nisVal = String(dataRow[nisIdx] || "").replace(/\.0$/, "").trim();
            let namaVal = String(dataRow[namaIdx] || "").trim().toUpperCase();

            if (nisVal && namaVal && /^\d+$/.test(nisVal) && nisVal.length >= 4) {
              result.push({
                nis: nisVal,
                nama: namaVal,
                kelas: normKelas,
                fileOrigin: item.file,
                sheetOrigin: sheetName,
              });
            }
          }
          break;
        }
      }
    }
  }

  return result;
}

async function fetchAllRows(tableName: string, select = "*") {
  let all: any[] = [];
  let from = 0;
  const step = 1000;
  while (true) {
    const { data, error } = await supabaseAdmin.from(tableName).select(select).range(from, from + step - 1);
    if (error || !data || data.length === 0) break;
    all.push(...data);
    if (data.length < step) break;
    from += step;
  }
  return all;
}

async function runAnalysis() {
  const masterExcel = parseMasterExcelFiles();
  const supabaseSiswa = await fetchAllRows("siswa");

  console.log("=================================================");
  console.log("   ANALISIS MASTER DATABASE KELASFIX VS SUPABASE ");
  console.log("=================================================");
  console.log(`📄 Total Murid di Master Excel Kelasfix : ${masterExcel.length} murid`);
  console.log(`🗄️ Total Murid di Database Supabase     : ${supabaseSiswa.length} murid\n`);

  // Class distribution in Master Excel
  const excelByClass: Record<string, number> = {};
  for (const s of masterExcel) {
    excelByClass[s.kelas] = (excelByClass[s.kelas] || 0) + 1;
  }
  console.log("📌 Rincian Jumlah Murid per Kelas di Excel Fix:", excelByClass);

  // Duplicates in Master Excel
  const nisMapExcel: Record<string, MasterExcelSiswa[]> = {};
  for (const s of masterExcel) {
    if (!nisMapExcel[s.nis]) nisMapExcel[s.nis] = [];
    nisMapExcel[s.nis].push(s);
  }
  const excelDups = Object.entries(nisMapExcel).filter(([_, list]) => list.length > 1);
  console.log(`\n📌 Duplikat NIS di Master Excel Fix: ${excelDups.length}`);
  if (excelDups.length > 0) {
    console.log("Sample Excel Duplicates:", JSON.stringify(excelDups.slice(0, 5), null, 2));
  }

  // Maps for cross-matching
  const excelByNis = new Map(masterExcel.map((s) => [s.nis, s]));
  const excelByNameClean = new Map(masterExcel.map((s) => [s.nama.replace(/[^A-Z0-9]/g, ""), s]));

  const dbByNis = new Map(supabaseSiswa.map((s) => [String(s.nis).trim(), s]));
  const dbByNameClean = new Map(supabaseSiswa.map((s) => [s.nama.toUpperCase().replace(/[^A-Z0-9]/g, ""), s]));

  // 1. Siswa Baru (In Excel Fix, NOT in Supabase DB)
  const newStudents: MasterExcelSiswa[] = [];
  for (const s of masterExcel) {
    const cleanName = s.nama.replace(/[^A-Z0-9]/g, "");
    if (!dbByNis.has(s.nis) && !dbByNameClean.has(cleanName)) {
      newStudents.push(s);
    }
  }

  // 2. Siswa Keluar / Sudah Tidak Ada di Excel Fix (In Supabase DB, NOT in Excel Fix)
  const removedStudents: any[] = [];
  for (const s of supabaseSiswa) {
    const nisStr = String(s.nis).trim();
    const cleanName = s.nama.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!excelByNis.has(nisStr) && !excelByNameClean.has(cleanName)) {
      removedStudents.push(s);
    }
  }

  // 3. Siswa Perubahan Data (NIS / Nama / Kelas)
  const modifiedStudents: any[] = [];
  for (const sExcel of masterExcel) {
    const cleanName = sExcel.nama.replace(/[^A-Z0-9]/g, "");
    const dbMatch = dbByNis.get(sExcel.nis) || dbByNameClean.get(cleanName);

    if (dbMatch) {
      const dbNis = String(dbMatch.nis).trim();
      const dbNama = dbMatch.nama.trim().toUpperCase();
      const dbKelas = (dbMatch.kelas || "").trim().toUpperCase();

      const diffs: string[] = [];
      if (dbNis !== sExcel.nis) diffs.push(`NIS: "${dbNis}" -> "${sExcel.nis}"`);
      if (dbNama !== sExcel.nama) diffs.push(`Nama: "${dbNama}" -> "${sExcel.nama}"`);
      if (dbKelas !== sExcel.kelas) diffs.push(`Kelas: "${dbKelas}" -> "${sExcel.kelas}"`);

      if (diffs.length > 0) {
        modifiedStudents.push({
          dbId: dbMatch.id,
          excelNis: sExcel.nis,
          excelNama: sExcel.nama,
          excelKelas: sExcel.kelas,
          dbNis,
          dbNama,
          dbKelas,
          diffs,
        });
      }
    }
  }

  // Summarize Grade Totals:
  const excelGradeCounts = {
    X: masterExcel.filter((s) => s.kelas.startsWith("X-")).length,
    XI: masterExcel.filter((s) => s.kelas.startsWith("XI-")).length,
    XII: masterExcel.filter((s) => s.kelas.startsWith("XII-")).length,
  };
  const dbGradeCounts = {
    X: supabaseSiswa.filter((s) => String(s.kelas).startsWith("X-")).length,
    XI: supabaseSiswa.filter((s) => String(s.kelas).startsWith("XI-")).length,
    XII: supabaseSiswa.filter((s) => String(s.kelas).startsWith("XII-")).length,
  };

  console.log("\n=================================================");
  console.log("            RINGKASAN PERBANDINGAN DATA          ");
  console.log("=================================================");
  console.log(`📊 Perbandingan Total Murid per Angkatan:`);
  console.log(`   - Kelas X   : Excel Fix = ${excelGradeCounts.X} murid | Database DB = ${dbGradeCounts.X} murid`);
  console.log(`   - Kelas XI  : Excel Fix = ${excelGradeCounts.XI} murid | Database DB = ${dbGradeCounts.XI} murid`);
  console.log(`   - Kelas XII : Excel Fix = ${excelGradeCounts.XII} murid | Database DB = ${dbGradeCounts.XII} murid`);

  console.log(`\n📋 Perbedaan Status Murid:`);
  console.log(`   1. Siswa Baru (Perlu Ditambahkan ke DB)      : ${newStudents.length} murid`);
  console.log(`   2. Siswa Keluar (Perlu Dihapus/Non-aktif DB) : ${removedStudents.length} murid`);
  console.log(`   3. Siswa Berubah Data (Perlu Update NIS/Kelas): ${modifiedStudents.length} murid`);

  if (newStudents.length > 0) {
    console.log("\n📌 DETAIL SISWA BARU (Contoh 15 murid):");
    console.log(JSON.stringify(newStudents.slice(0, 15), null, 2));
  }

  if (removedStudents.length > 0) {
    console.log("\n📌 DETAIL SISWA KELUAR / TIDAK ADA DI EXCEL FIX (Contoh 15 murid):");
    console.log(JSON.stringify(removedStudents.slice(0, 15).map(s => ({ nis: s.nis, nama: s.nama, kelas: s.kelas })), null, 2));
  }

  if (modifiedStudents.length > 0) {
    console.log("\n📌 DETAIL PERUBAHAN DATA (Contoh 15 murid):");
    console.log(JSON.stringify(modifiedStudents.slice(0, 15), null, 2));
  }
}

runAnalysis().catch(console.error);
