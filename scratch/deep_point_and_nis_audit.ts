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
  file: string;
  sheet: string;
}

function parseExcelMaster(): ExcelStudent[] {
  const folderPath = path.join(process.cwd(), "kelasfix");
  const filesConfig = [
    { file: "KELAS X.xlsx", prefix: "X-" },
    { file: "KELAS XI.xlsx", prefix: "XI-" },
    { file: "KELAS XII.xlsx", prefix: "XII-" },
  ];

  const excelList: ExcelStudent[] = [];

  for (const cfg of filesConfig) {
    const filePath = path.join(folderPath, cfg.file);
    if (!fs.existsSync(filePath)) continue;
    const workbook = XLSX.readFile(filePath);

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) continue;
      const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
      if (!rows || rows.length === 0) continue;

      // Find header row or NIS & NAMA columns
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
              excelList.push({
                nis: nisVal,
                nama: namaVal,
                kelas: sheetName.trim(),
                file: cfg.file,
                sheet: sheetName.trim(),
              });
            }
          }
          break;
        }
      }
    }
  }

  return excelList;
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

async function audit() {
  console.log("=================================================");
  console.log("   AUDIT MENDALAM: POIN & NIS EXCEL VS DB       ");
  console.log("=================================================");

  const excelStudents = parseExcelMaster();
  console.log(`📄 Total Data Excel di kelasfix: ${excelStudents.length} baris`);

  const siswaRows = await fetchAllRows("siswa");
  const profilesRows = await fetchAllRows("profiles");
  const riwayatRows = await fetchAllRows("riwayat_poin");

  let authUsers: any[] = [];
  let page = 1;
  while (true) {
    const { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error || !users || users.length === 0) break;
    authUsers.push(...users);
    if (users.length < 1000) break;
    page++;
  }

  console.log(`🗄️ Total public.siswa    : ${siswaRows.length}`);
  console.log(`🗄️ Total public.profiles : ${profilesRows.length}`);
  console.log(`🗄️ Total auth.users      : ${authUsers.length}`);
  console.log(`🗄️ Total riwayat_poin    : ${riwayatRows.length}\n`);

  // --- 1. AUDIT RIWAYAT POIN VS SISWA.TOTAL_POIN ---
  console.log("--- 1. AUDIT RIWAYAT POIN VS TOTAL POIN SISWA ---");
  const pointsBySiswaId: Record<string, number> = {};
  const riwayatCountBySiswaId: Record<string, number> = {};
  for (const r of riwayatRows) {
    const sId = r.siswa_id;
    const pts = Number(r.nilai_diberikan || 0);
    pointsBySiswaId[sId] = (pointsBySiswaId[sId] || 0) + pts;
    riwayatCountBySiswaId[sId] = (riwayatCountBySiswaId[sId] || 0) + 1;
  }

  const siswaMap = new Map(siswaRows.map((s) => [s.id, s]));
  const orphanRiwayatSiswaIds = Object.keys(pointsBySiswaId).filter((id) => !siswaMap.has(id));

  console.log(`📌 Orphan riwayat_poin (siswa_id tidak ada di public.siswa): ${orphanRiwayatSiswaIds.length} ID`);
  if (orphanRiwayatSiswaIds.length > 0) {
    for (const orphanId of orphanRiwayatSiswaIds) {
      const sampleLogs = riwayatRows.filter((r) => r.siswa_id === orphanId);
      console.log(`   - Orphan ID ${orphanId}: ${sampleLogs.length} transaksi, total poin: ${pointsBySiswaId[orphanId]}`);
      console.log(`     Sample log:`, sampleLogs[0]);
    }
  }

  // Compare sum(riwayat_poin) vs total_poin in public.siswa
  const pointDiscrepancies: any[] = [];
  for (const s of siswaRows) {
    const calcPts = pointsBySiswaId[s.id] || 0;
    const dbPts = Number(s.total_poin || 0);
    if (calcPts !== dbPts) {
      pointDiscrepancies.push({
        siswaId: s.id,
        nis: s.nis,
        nama: s.nama,
        kelas: s.kelas,
        totalPoinInSiswaTable: dbPts,
        totalPoinCalculatedFromRiwayat: calcPts,
        totalRiwayatTransactions: riwayatCountBySiswaId[s.id] || 0,
      });
    }
  }

  console.log(`\n📌 Perbedaan total_poin (tabel siswa) vs Kalkulasi riwayat_poin: ${pointDiscrepancies.length} siswa`);
  if (pointDiscrepancies.length > 0) {
    console.log("Sample point discrepancies:", JSON.stringify(pointDiscrepancies.slice(0, 10), null, 2));
  }

  // --- 2. AUDIT EXCEL NIS VS DB SISWA NIS ---
  console.log("\n--- 2. AUDIT NIS EXCEL KELASFIX VS SUPABASE DB ---");
  const excelNisMap = new Map(excelStudents.map((e) => [e.nis, e]));
  const excelNameCleanMap = new Map(excelStudents.map((e) => [e.nama.replace(/[^A-Z0-9]/g, ""), e]));

  const dbNisMap = new Map(siswaRows.map((s) => [String(s.nis).trim(), s]));
  const dbNameCleanMap = new Map(siswaRows.map((s) => [s.nama.toUpperCase().replace(/[^A-Z0-9]/g, ""), s]));

  // Check NIS mismatch (Name matches, but NIS is different)
  const nisMismatchCases: any[] = [];
  for (const e of excelStudents) {
    const cleanName = e.nama.replace(/[^A-Z0-9]/g, "");
    const sDb = dbNameCleanMap.get(cleanName);
    if (sDb && String(sDb.nis).trim() !== e.nis) {
      nisMismatchCases.push({
        nama: e.nama,
        excelFile: e.file,
        excelSheet: e.sheet,
        excelNis: e.nis,
        dbNis: sDb.nis,
        dbSiswaId: sDb.id,
        dbTotalPoin: sDb.total_poin,
      });
    }
  }

  console.log(`📌 NIS Beda antara Excel & DB untuk Nama Siswa yang Sama: ${nisMismatchCases.length} kasus`);
  if (nisMismatchCases.length > 0) {
    console.log(JSON.stringify(nisMismatchCases.slice(0, 15), null, 2));
  }

  // Check Auth accounts / Profiles where NIS != Excel NIS
  const authNisMismatchCases: any[] = [];
  for (const p of profilesRows) {
    const cleanName = (p.nama || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    const eMatch = excelNameCleanMap.get(cleanName);
    if (eMatch && p.nis && String(p.nis).trim() !== eMatch.nis) {
      authNisMismatchCases.push({
        profileId: p.id,
        nama: p.nama,
        profileEmail: p.email,
        profileNis: p.nis,
        excelNis: eMatch.nis,
      });
    }
  }

  console.log(`\n📌 NIS Beda di Profile/Auth vs Excel: ${authNisMismatchCases.length} kasus`);
  if (authNisMismatchCases.length > 0) {
    console.log(JSON.stringify(authNisMismatchCases.slice(0, 15), null, 2));
  }
}

audit().catch(console.error);
