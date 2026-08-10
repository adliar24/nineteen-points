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

async function inspectRizky() {
  console.log("=== DETAIL TRANSAKSI POIN MUHAMMAD RIZKY AZRIAN ===");

  const { data: siswa } = await supabaseAdmin
    .from("siswa")
    .select("*")
    .ilike("nama", "%MUHAMMAD RIZKY AZRIAN%");

  console.log("Data public.siswa:", siswa);

  if (siswa && siswa.length > 0) {
    for (const s of siswa) {
      const { data: logs } = await supabaseAdmin
        .from("riwayat_poin")
        .select("*")
        .eq("siswa_id", s.id)
        .order("created_at", { ascending: true });

      console.log(`\n📌 Transaksi untuk ID ${s.id} (NIS: ${s.nis}, Nama: "${s.nama}"): Total Logs: ${logs?.length || 0}`);
      logs?.forEach((l, idx) => {
        console.log(`   ${idx + 1}. [${l.created_at}] Poin: +${l.nilai_diberikan} | Keterangan: "${l.nama_poin}" | Pencatat: "${l.guru_email}" | Semester: ${l.semester}`);
      });
    }
  }
}

inspectRizky().catch(console.error);
