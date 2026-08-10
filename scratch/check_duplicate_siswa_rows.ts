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

async function run() {
  const siswaList = await fetchAllRows("siswa");
  const tempRows = siswaList.filter((s) => String(s.nis).startsWith("TEMP_"));

  console.log("=== CHECKING TEMP & DUPLICATE SISWA ROWS ===");
  console.log(`Total public.siswa: ${siswaList.length}`);
  console.log(`Total rows with NIS starting with 'TEMP_': ${tempRows.length}`);

  if (tempRows.length > 0) {
    console.log("\nAll TEMP_ rows in public.siswa:");
    for (const t of tempRows) {
      console.log(`  - ID: ${t.id} | Nama: "${t.nama}" | NIS: ${t.nis} | Kelas: ${t.kelas} | Poin: ${t.total_poin}`);
    }
  }

  // Check duplicate clean names in public.siswa
  const byCleanName = new Map<string, any[]>();
  for (const s of siswaList) {
    const clean = s.nama.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!byCleanName.has(clean)) byCleanName.set(clean, []);
    byCleanName.get(clean)!.push(s);
  }

  const dupNames = Array.from(byCleanName.entries()).filter(([_, list]) => list.length > 1);
  console.log(`\nJumlah Nama Murid yang Memiliki > 1 Baris di public.siswa: ${dupNames.length}`);

  if (dupNames.length > 0) {
    console.log("\nRincian Siswa Duplikat:");
    dupNames.forEach(([nameKey, list], idx) => {
      console.log(`\n${idx + 1}. Clean Name: ${nameKey} (${list.length} baris)`);
      list.forEach((s) => {
        console.log(`   - ID: ${s.id} | Nama: "${s.nama}" | NIS: "${s.nis}" | Kelas: "${s.kelas}" | Poin: ${s.total_poin}`);
      });
    });
  }
}

run().catch(console.error);
