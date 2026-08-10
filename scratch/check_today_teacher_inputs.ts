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

async function checkToday() {
  const { data: todayLogs } = await supabaseAdmin
    .from("riwayat_poin")
    .select("*, siswa(nama, nis, kelas)")
    .gte("created_at", "2026-08-10T00:00:00.000Z")
    .order("created_at", { ascending: false });

  console.log("=== TRANSAKSI POIN YANG INPUT HARI INI (2026-08-10) ===");
  console.log(`Total transaksi diinput guru hari ini: ${todayLogs?.length || 0} transaksi\n`);

  // Group by Guru
  const byGuru: Record<string, number> = {};
  todayLogs?.forEach((log) => {
    byGuru[log.guru_email] = (byGuru[log.guru_email] || 0) + 1;
  });
  console.log("Rincian per Guru/Pencatat:", byGuru);

  console.log("\nSample 10 transaksi hari ini:");
  todayLogs?.slice(0, 10).forEach((l, i) => {
    console.log(`${i + 1}. [${l.created_at.split('T')[1].split('.')[0]}] Guru: ${l.guru_email}`);
    console.log(`   Siswa: ${l.siswa?.nama} (${l.siswa?.nis}, ${l.siswa?.kelas}) | +${l.nilai_diberikan} | ${l.nama_poin}`);
  });
}

checkToday().catch(console.error);
