import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";

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

async function check() {
  console.log("=== FULL AUDIT OF RIWAYAT POIN & KEHADIRAN ===");

  const siswaList = await fetchAllRows("siswa");
  const riwayatList = await fetchAllRows("riwayat_poin");
  const kehadiranList = await fetchAllRows("kehadiran");

  console.log(`Total public.siswa    : ${siswaList.length}`);
  console.log(`Total riwayat_poin    : ${riwayatList.length}`);
  console.log(`Total kehadiran       : ${kehadiranList.length}`);

  const siswaById = new Map(siswaList.map((s) => [s.id, s]));

  // Check all students who have riwayat_poin records
  const studentPointsSummary: Record<string, { totalPts: number; count: number; nama: string; nis: string; kelas: string; logs: any[] }> = {};

  for (const r of riwayatList) {
    const s = siswaById.get(r.siswa_id);
    const sName = s ? `${s.nama} (${s.nis}, ${s.kelas})` : `UNKNOWN ID: ${r.siswa_id}`;

    if (!studentPointsSummary[r.siswa_id]) {
      studentPointsSummary[r.siswa_id] = {
        totalPts: 0,
        count: 0,
        nama: s?.nama || "UNKNOWN",
        nis: s?.nis || "-",
        kelas: s?.kelas || "-",
        logs: [],
      };
    }
    studentPointsSummary[r.siswa_id].totalPts += Number(r.nilai_diberikan || 0);
    studentPointsSummary[r.siswa_id].count += 1;
    studentPointsSummary[r.siswa_id].logs.push({
      namaPoin: r.nama_poin,
      nilai: r.nilai_diberikan,
      guru: r.guru_email,
      tgl: r.created_at,
    });
  }

  const studentsWithPoints = Object.values(studentPointsSummary);
  console.log(`\nJumlah Siswa yang memiliki transaksi di riwayat_poin: ${studentsWithPoints.length} siswa`);

  console.log("\nSample 20 Siswa dengan Poin terbanyak/transaksi:");
  studentsWithPoints
    .sort((a, b) => b.totalPts - a.totalPts)
    .slice(0, 20)
    .forEach((item, idx) => {
      console.log(`${idx + 1}. ${item.nama} | NIS: ${item.nis} | Kelas: ${item.kelas} | Total Poin: ${item.totalPts} (${item.count} transaksi)`);
    });

  // Check kehadiran table as well
  const kehadiranPointsBySiswaId: Record<string, number> = {};
  for (const k of kehadiranList) {
    kehadiranPointsBySiswaId[k.siswa_id] = (kehadiranPointsBySiswaId[k.siswa_id] || 0) + Number(k.nilai_poin_diberikan || 0);
  }

  const siswaWithKehadiranPts = Object.keys(kehadiranPointsBySiswaId);
  console.log(`\nJumlah Siswa yang memiliki transaksi di tabel kehadiran: ${siswaWithKehadiranPts.length} siswa`);

  // Check if total_poin in public.siswa matches sum(riwayat_poin)
  let mismatchCount = 0;
  for (const s of siswaList) {
    const calcPts = studentPointsSummary[s.id]?.totalPts || 0;
    if (Number(s.total_poin || 0) !== calcPts) {
      mismatchCount++;
      console.log(`MISMATCH: ${s.nama} (${s.nis}): DB total_poin=${s.total_poin}, Calc from riwayat_poin=${calcPts}`);
    }
  }
  console.log(`\nTotal Mismatch antara siswa.total_poin dan SUM(riwayat_poin): ${mismatchCount}`);
}

check().catch(console.error);
