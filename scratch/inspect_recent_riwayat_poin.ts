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

async function fetchRecentRiwayat() {
  console.log("=== INSPECTING RECENT RIWAYAT_POIN TRANSACTIONS ===");

  const { data: recentLogs, error } = await supabaseAdmin
    .from("riwayat_poin")
    .select(`
      id,
      siswa_id,
      nilai_diberikan,
      nama_poin,
      guru_email,
      created_at,
      semester,
      siswa ( id, nis, nama, kelas )
    `)
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) {
    console.error("Error fetching recent logs:", error.message);
    return;
  }

  console.log(`Fetched ${recentLogs?.length || 0} most recent point transactions:\n`);

  recentLogs?.forEach((log: any, idx: number) => {
    const s = log.siswa;
    console.log(`${idx + 1}. [${log.created_at}] Guru: "${log.guru_email}"`);
    console.log(`    Siswa: "${s?.nama || 'UNKNOWN'}" (NIS: ${s?.nis || '-'}, Kelas: ${s?.kelas || '-'})`);
    console.log(`    Poin Diberikan: +${log.nilai_diberikan} | Nama Poin: "${log.nama_poin}" | Semester: ${log.semester}`);
    console.log(`    Log ID: ${log.id} | Siswa ID: ${log.siswa_id}\n`);
  });
}

fetchRecentRiwayat().catch(console.error);
