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

async function run() {
  console.log("=== 1. CHECK EXCEL COLUMNS IN KELASFIX ===");
  const folderPath = path.join(process.cwd(), "kelasfix");
  const files = ["KELAS X.xlsx", "KELAS XI.xlsx", "KELAS XII.xlsx"];
  for (const file of files) {
    const filePath = path.join(folderPath, file);
    if (!fs.existsSync(filePath)) continue;
    const workbook = XLSX.readFile(filePath);
    console.log(`\nFile: ${file}`);
    for (const sheetName of workbook.SheetNames.slice(0, 3)) {
      const sheet = workbook.Sheets[sheetName];
      const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
      if (rows && rows.length > 0) {
        console.log(`  Sheet '${sheetName}' first 5 rows:`, rows.slice(0, 5));
      }
    }
  }

  console.log("\n=== 2. CHECK DATABASE TABLES & SCHEMAS ===");
  // List columns of siswa table
  const { data: sampleSiswa } = await supabaseAdmin.from("siswa").select("*").limit(3);
  console.log("Sample siswa row keys:", sampleSiswa ? Object.keys(sampleSiswa[0]) : "none");
  console.log("Sample siswa rows:", sampleSiswa);

  // Check pelanggaran_siswa or similar tables
  const { data: pelanggaran, error: errP } = await supabaseAdmin.from("pelanggaran_siswa").select("*").limit(5);
  console.log("\npelanggaran_siswa sample:", errP ? errP.message : pelanggaran);

  const { data: prestasi, error: errPr } = await supabaseAdmin.from("prestasi_siswa").select("*").limit(5);
  console.log("\nprestasi_siswa sample:", errPr ? errPr.message : prestasi);

  const { data: riwayat, error: errR } = await supabaseAdmin.from("riwayat_poin").select("*").limit(5);
  console.log("\nriwayat_poin sample:", errR ? errR.message : riwayat);

  // Check students with total_poin > 0
  const { data: siswaWithPoints, count } = await supabaseAdmin.from("siswa").select("id, nis, nama, kelas, total_poin", { count: "exact" }).gt("total_poin", 0);
  console.log(`\nTotal siswa with total_poin > 0: ${siswaWithPoints?.length || 0}`);
  console.log("Siswa with points sample:", siswaWithPoints);

  // Check if any NIS in public.siswa does NOT match NIS in kelasfix Excel
  const excelNisSet = new Set<string>();
  const excelNisNamaMap = new Map<string, { nama: string; kelas: string; file: string; sheet: string }>();
  const excelNamaNisMap = new Map<string, { nis: string; kelas: string; file: string; sheet: string }>();

  for (const file of files) {
    const filePath = path.join(folderPath, file);
    if (!fs.existsSync(filePath)) continue;
    const workbook = XLSX.readFile(filePath);
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
      if (!rows) continue;
      for (const row of rows) {
        if (!row || !Array.isArray(row)) continue;
        for (let c = 0; c < row.length - 1; c++) {
          const v1 = String(row[c] || "").replace(/\.0$/, "").trim();
          const v2 = String(row[c + 1] || "").trim();
          if (/^\d{4,12}$/.test(v1) && v2.length >= 2 && !/^\d+$/.test(v2) && !v2.toUpperCase().includes("NIS")) {
            excelNisSet.add(v1);
            excelNisNamaMap.set(v1, { nama: v2.toUpperCase(), kelas: sheetName, file, sheet: sheetName });
            excelNamaNisMap.set(v2.toUpperCase().replace(/[^A-Z0-9]/g, ""), { nis: v1, kelas: sheetName, file, sheet: sheetName });
          }
        }
      }
    }
  }

  console.log(`\nParsed ${excelNisSet.size} NIS from kelasfix Excel files.`);

  // Compare with Supabase siswa table
  const { data: allSiswa } = await supabaseAdmin.from("siswa").select("id, nis, nama, kelas, username, total_poin");
  if (allSiswa) {
    const nisMismatches: any[] = [];
    const nameMismatches: any[] = [];
    for (const s of allSiswa) {
      const dbNis = String(s.nis).trim();
      const cleanDbName = s.nama.toUpperCase().replace(/[^A-Z0-9]/g, "");
      
      const excelByNis = excelNisNamaMap.get(dbNis);
      const excelByName = excelNamaNisMap.get(cleanDbName);

      if (excelByNis && excelByNis.nama.replace(/[^A-Z0-9]/g, "") !== cleanDbName) {
        nisMismatches.push({
          dbId: s.id,
          dbNis: dbNis,
          dbNama: s.nama,
          dbKelas: s.kelas,
          dbPoin: s.total_poin,
          excelNamaForThisNis: excelByNis.nama,
          excelFile: excelByNis.file,
          excelSheet: excelByNis.sheet,
        });
      }

      if (excelByName && excelByName.nis !== dbNis) {
        nameMismatches.push({
          dbId: s.id,
          dbNama: s.nama,
          dbNis: dbNis,
          dbKelas: s.kelas,
          dbPoin: s.total_poin,
          excelNisForThisName: excelByName.nis,
          excelFile: excelByName.file,
          excelSheet: excelByName.sheet,
        });
      }
    }

    console.log(`\n📌 NIS MISMATCHES (NIS di DB sama dengan NIS Excel, tapi NAMA beda): ${nisMismatches.length}`);
    if (nisMismatches.length > 0) {
      console.log(JSON.stringify(nisMismatches.slice(0, 15), null, 2));
    }

    console.log(`\n📌 NAME MISMATCHES (Nama di DB sama dengan Nama Excel, tapi NIS beda): ${nameMismatches.length}`);
    if (nameMismatches.length > 0) {
      console.log(JSON.stringify(nameMismatches.slice(0, 15), null, 2));
    }
  }
}

run().catch(console.error);
