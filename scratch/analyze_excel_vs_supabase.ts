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

interface ExcelStudent {
  nis: string;
  nama: string;
  kelas: string;
  sourceFile: string;
  sheetName: string;
}

function parseExcelFiles(): ExcelStudent[] {
  const folderPath = path.join(process.cwd(), "kelasfix");
  const files = ["KELAS X.xlsx", "KELAS XI.xlsx", "KELAS XII.xlsx"];
  const excelStudents: ExcelStudent[] = [];

  for (const file of files) {
    const filePath = path.join(folderPath, file);
    if (!fs.existsSync(filePath)) {
      console.warn(`File not found: ${filePath}`);
      continue;
    }

    const workbook = XLSX.readFile(filePath);
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

      if (!rows || rows.length === 0) continue;

      // Find header row containing NIS, NAMA, KELAS (or similar)
      let nisIdx = -1;
      let namaIdx = -1;
      let kelasIdx = -1;
      let startRowIdx = -1;

      for (let r = 0; r < Math.min(rows.length, 15); r++) {
        const row = rows[r];
        if (!row || !Array.isArray(row)) continue;
        
        for (let c = 0; c < row.length; c++) {
          const val = String(row[c] || "").trim().toUpperCase();
          if (val === "NIS" || val === "NISN" || val.includes("NIS")) {
            if (nisIdx === -1) nisIdx = c;
          }
          if (val === "NAMA" || val.includes("NAMA SISWA") || val.includes("NAMA")) {
            if (namaIdx === -1) namaIdx = c;
          }
          if (val === "KELAS" || val.includes("KELAS")) {
            if (kelasIdx === -1) kelasIdx = c;
          }
        }

        if (nisIdx !== -1 && namaIdx !== -1) {
          startRowIdx = r + 1;
          break;
        }
      }

      // Fallback index search if header row was not standard
      if (nisIdx === -1 || namaIdx === -1) {
        // Inspect row values to detect NIS (numeric) and Nama (text)
        for (let r = 0; r < rows.length; r++) {
          const row = rows[r];
          if (!row || row.length < 2) continue;
          for (let c = 0; c < row.length - 1; c++) {
            const v1 = String(row[c] || "").trim();
            const v2 = String(row[c + 1] || "").trim();
            if (/^\d{8,10}$/.test(v1) && v2.length > 2 && !/^\d+$/.test(v2)) {
              nisIdx = c;
              namaIdx = c + 1;
              startRowIdx = r;
              break;
            }
          }
          if (nisIdx !== -1) break;
        }
      }

      if (nisIdx === -1 || namaIdx === -1) {
        console.warn(`Could not determine columns for ${file} -> Sheet '${sheetName}'`);
        continue;
      }

      // Parse data rows
      for (let r = startRowIdx; r < rows.length; r++) {
        const row = rows[r];
        if (!row) continue;

        let nisVal = String(row[nisIdx] || "").trim();
        let namaVal = String(row[namaIdx] || "").trim();
        let kelasVal = kelasIdx !== -1 ? String(row[kelasIdx] || "").trim() : "";

        // Fallback for kelas from sheetName if missing in row
        if (!kelasVal) {
          kelasVal = sheetName.trim();
        }

        // Clean up NIS & Nama
        nisVal = nisVal.replace(/\.0$/, "").trim(); // Remove excel trailing decimal if any

        if (nisVal && namaVal && /^\d+$/.test(nisVal) && nisVal.length >= 4) {
          excelStudents.push({
            nis: nisVal,
            nama: namaVal.toUpperCase(),
            kelas: kelasVal.toUpperCase(),
            sourceFile: file,
            sheetName: sheetName,
          });
        }
      }
    }
  }

  return excelStudents;
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

async function analyze() {
  console.log("=================================================");
  console.log("  ANALYSIS: EXCEL KELASFIX VS SUPABASE DATABASE  ");
  console.log("=================================================");

  const excelStudents = parseExcelFiles();
  console.log(`\n📄 TOTAL SISWA DARI 3 FILE EXCEL (KELASFIX): ${excelStudents.length}`);

  // Group Excel by File / Grade
  const excelByFile: Record<string, number> = {};
  const excelByKelas: Record<string, number> = {};
  for (const s of excelStudents) {
    excelByFile[s.sourceFile] = (excelByFile[s.sourceFile] || 0) + 1;
    excelByKelas[s.kelas] = (excelByKelas[s.kelas] || 0) + 1;
  }
  console.log("Rincian per File Excel:", excelByFile);
  console.log("Rincian per Kelas Excel:", excelByKelas);

  // Check Excel duplicates
  const excelNisCounts: Record<string, ExcelStudent[]> = {};
  for (const s of excelStudents) {
    if (!excelNisCounts[s.nis]) excelNisCounts[s.nis] = [];
    excelNisCounts[s.nis].push(s);
  }
  const excelDuplicates = Object.entries(excelNisCounts).filter(([_, list]) => list.length > 1);
  console.log(`\nDuplikat NIS di Excel: ${excelDuplicates.length}`);
  if (excelDuplicates.length > 0) {
    console.log("Sample Excel Duplicates:", JSON.stringify(excelDuplicates.slice(0, 5), null, 2));
  }

  // Fetch Supabase data
  const supabaseSiswa = await fetchAllRows("siswa");
  console.log(`\n🗄️ TOTAL SISWA DI SUPABASE (public.siswa): ${supabaseSiswa.length}`);

  // Maps for comparison
  const excelByNis = new Map(excelStudents.map((s) => [s.nis, s]));
  const excelByNameClean = new Map(excelStudents.map((s) => [s.nama.replace(/[^A-Z0-9]/g, ""), s]));

  const dbByNis = new Map(supabaseSiswa.map((s) => [String(s.nis).trim(), s]));
  const dbByNameClean = new Map(supabaseSiswa.map((s) => [s.nama.toUpperCase().replace(/[^A-Z0-9]/g, ""), s]));

  // --- COMPARISON 1: Siswa Baru (In Excel, NOT in Supabase DB) ---
  const newStudentsInExcel: ExcelStudent[] = [];
  for (const s of excelStudents) {
    const cleanName = s.nama.replace(/[^A-Z0-9]/g, "");
    if (!dbByNis.has(s.nis) && !dbByNameClean.has(cleanName)) {
      newStudentsInExcel.push(s);
    }
  }

  // --- COMPARISON 2: Siswa Keluar / Dihapus (In Supabase DB, NOT in Excel) ---
  const removedStudentsFromDB: any[] = [];
  for (const s of supabaseSiswa) {
    const nisStr = String(s.nis).trim();
    const cleanName = s.nama.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!excelByNis.has(nisStr) && !excelByNameClean.has(cleanName)) {
      removedStudentsFromDB.push(s);
    }
  }

  // --- COMPARISON 3: Siswa Existing dengan Perubahan (NIS, Nama, atau Kelas) ---
  const updatedStudents: any[] = [];
  for (const sExcel of excelStudents) {
    const cleanName = sExcel.nama.replace(/[^A-Z0-9]/g, "");
    let dbMatch = dbByNis.get(sExcel.nis) || dbByNameClean.get(cleanName);

    if (dbMatch) {
      const dbNis = String(dbMatch.nis).trim();
      const dbNama = dbMatch.nama.trim().toUpperCase();
      const dbKelas = (dbMatch.kelas || "").trim().toUpperCase();

      const changes: string[] = [];
      if (dbNis !== sExcel.nis) changes.push(`NIS: "${dbNis}" -> "${sExcel.nis}"`);
      if (dbNama !== sExcel.nama) changes.push(`Nama: "${dbNama}" -> "${sExcel.nama}"`);
      if (dbKelas !== sExcel.kelas) changes.push(`Kelas: "${dbKelas}" -> "${sExcel.kelas}"`);

      if (changes.length > 0) {
        updatedStudents.push({
          dbId: dbMatch.id,
          excelNis: sExcel.nis,
          excelNama: sExcel.nama,
          excelKelas: sExcel.kelas,
          dbNis,
          dbNama,
          dbKelas,
          changes,
        });
      }
    }
  }

  console.log("\n=================================================");
  console.log("            RINGKASAN HASIL ANALISIS             ");
  console.log("=================================================");
  console.log(`1. Siswa Baru (Ada di Excel, Belum Ada di Supabase)  : ${newStudentsInExcel.length} siswa`);
  console.log(`2. Siswa Keluar/Non-aktif (Ada di Supabase, Hilang di Excel) : ${removedStudentsFromDB.length} siswa`);
  console.log(`3. Siswa Mengalami Perubahan (NIS / Nama / Kelas)    : ${updatedStudents.length} siswa`);

  if (newStudentsInExcel.length > 0) {
    console.log("\n📌 SAMPLE SISWA BARU (Tambahan di Excel):");
    console.log(JSON.stringify(newStudentsInExcel.slice(0, 15), null, 2));
  }

  if (removedStudentsFromDB.length > 0) {
    console.log("\n📌 SAMPLE SISWA KELUAR/NON-AKTIF (Tidak ada di Excel baru):");
    console.log(JSON.stringify(removedStudentsFromDB.slice(0, 15).map(s => ({ nis: s.nis, nama: s.nama, kelas: s.kelas })), null, 2));
  }

  if (updatedStudents.length > 0) {
    console.log("\n📌 SAMPLE PERUBAHAN DATA (Kelas / NIS / Nama):");
    console.log(JSON.stringify(updatedStudents.slice(0, 15), null, 2));
  }
}

analyze().catch(console.error);
