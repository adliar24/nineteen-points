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

async function mergeDuplicates() {
  console.log("=================================================");
  console.log("   MERGING DUPLICATE STUDENT ROWS & RELINKING POIN");
  console.log("=================================================");

  const siswaList = await fetchAllRows("siswa");
  const riwayatList = await fetchAllRows("riwayat_poin");

  // Group siswa rows by clean name
  const byCleanName = new Map<string, any[]>();
  for (const s of siswaList) {
    const clean = s.nama.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!byCleanName.has(clean)) byCleanName.set(clean, []);
    byCleanName.get(clean)!.push(s);
  }

  const duplicates = Array.from(byCleanName.entries()).filter(([_, list]) => list.length > 1);
  console.log(`Found ${duplicates.length} duplicate student names in public.siswa:`);

  for (const [cleanName, list] of duplicates) {
    console.log(`\n📌 Processing duplicate for "${list[0].nama}":`);
    
    // Official target row is the one with real numeric NIS (not TEMP_)
    const officialTarget = list.find((s) => !String(s.nis).startsWith("TEMP_"));
    const tempSources = list.filter((s) => String(s.nis).startsWith("TEMP_"));

    if (!officialTarget || tempSources.length === 0) {
      console.log(`  Skipping merge: Official target or temp sources missing.`, list);
      continue;
    }

    console.log(`  Target Official Row : ID ${officialTarget.id} | NIS ${officialTarget.nis} | Nama "${officialTarget.nama}"`);
    for (const tempS of tempSources) {
      console.log(`  Source Temp Row     : ID ${tempS.id} | NIS ${tempS.nis} | Poin ${tempS.total_poin}`);

      // 1. Relink riwayat_poin from tempS.id -> officialTarget.id
      const { data: updatedLogs, error: relinkErr } = await supabaseAdmin
        .from("riwayat_poin")
        .update({ siswa_id: officialTarget.id })
        .eq("siswa_id", tempS.id)
        .select();

      if (relinkErr) {
        console.error(`  Err relinking riwayat_poin for ${tempS.id}:`, relinkErr.message);
      } else {
        console.log(`  ✅ Relinked ${updatedLogs?.length || 0} riwayat_poin transactions to official ID ${officialTarget.id}`);
      }

      // 2. Relink kehadiran if any
      await supabaseAdmin.from("kehadiran").update({ siswa_id: officialTarget.id }).eq("siswa_id", tempS.id);

      // 3. Delete temp row from public.siswa
      const { error: delErr } = await supabaseAdmin.from("siswa").delete().eq("id", tempS.id);
      if (!delErr) {
        console.log(`  ✅ Deleted temp row ID ${tempS.id} from public.siswa`);
      } else {
        console.error(`  Err deleting temp row ID ${tempS.id}:`, delErr.message);
      }
    }
  }

  // --- RECALCULATE TOTAL_POIN FOR ALL SISWA ---
  console.log("\n--- RECALCULATING & RESTORING TOTAL_POIN FOR ALL SISWA ---");
  const finalSiswaList = await fetchAllRows("siswa");
  const finalRiwayatList = await fetchAllRows("riwayat_poin");

  const sumPointsBySiswaId: Record<string, number> = {};
  for (const r of finalRiwayatList) {
    const pts = Number(r.nilai_diberikan || 0);
    sumPointsBySiswaId[r.siswa_id] = (sumPointsBySiswaId[r.siswa_id] || 0) + pts;
  }

  let updatedPointsCount = 0;
  for (const s of finalSiswaList) {
    const calcPts = sumPointsBySiswaId[s.id] || 0;
    if (Number(s.total_poin || 0) !== calcPts) {
      const { error } = await supabaseAdmin.from("siswa").update({ total_poin: calcPts }).eq("id", s.id);
      if (!error) {
        updatedPointsCount++;
        console.log(`  [POIN UPDATED] ${s.nama} (${s.nis}): ${s.total_poin} -> ${calcPts}`);
      }
    }
  }

  console.log(`\n✅ Completed merging duplicates and recalculated points for ${updatedPointsCount} students!`);
}

mergeDuplicates().catch(console.error);
