import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = resolve(__dirname, "../.env.local");
const envContent = readFileSync(envPath, "utf-8");
const env: Record<string, string> = {};
envContent.split("\n").forEach((line) => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return;
  const [key, ...rest] = trimmed.split("=");
  if (key) env[key.trim()] = rest.join("=").trim();
});
const sb = createClient(env["VITE_SUPABASE_URL"], env["VITE_SUPABASE_SERVICE_ROLE_KEY"], {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  // 1. Find ASHVIN in DB
  const { data: ashvinList } = await sb.from("siswa").select("id,nis,nama,kelas").ilike("nama", "%ASHVIN%MAN%AWALUDIN%");
  console.log("ASHVIN search:", ashvinList?.map((s) => `${s.nama} NIS:${s.nis} KELAS:${s.kelas}`));
  
  if (!ashvinList?.length) {
    console.log("ASHVIN not found in siswa!");
    return;
  }
  
  const ashvin = ashvinList[0];
  console.log("Found:", ashvin.nama, "NIS:", ashvin.nis, "ID:", ashvin.id);
  
  // 2. Check current holder of 262710399
  const { data: holder } = await sb.from("siswa").select("id,nis,nama").eq("nis", "262710399").limit(1);
  console.log("Holder of 262710399:", holder?.[0]?.nama, holder?.[0]?.nis);
  
  // 3. Null profiles for both
  for (const nis of ["262710399", ashvin.nis]) {
    if (nis.startsWith("TEMP_")) continue;
    const { data: profs } = await sb.from("profiles").select("id").eq("nis", nis);
    for (const p of profs || []) {
      await sb.from("profiles").update({ nis: null }).eq("id", p.id);
    }
  }
  
  // 4. Move holder out
  if (holder?.length && holder[0].id !== ashvin.id) {
    const { error } = await sb.from("siswa").update({ nis: "HOLDER_262710399" }).eq("id", holder[0].id);
    console.log("Move holder:", error?.message || "OK");
  }
  
  // 5. If ASHVIN has TEMP_ NIS, set to final
  if (ashvin.nis.startsWith("TEMP_")) {
    const { error } = await sb.from("siswa").update({ nis: "262710399" }).eq("id", ashvin.id).eq("nis", ashvin.nis);
    console.log("Set ASHVIN to 262710399:", error?.message || "OK");
  } else {
    console.log("ASHVIN NIS is", ashvin.nis, "— needs TEMP_ phase first");
    const { error: e1 } = await sb.from("siswa").update({ nis: "TEMP_262710399" }).eq("id", ashvin.id);
    if (e1) console.error("TEMP failed:", e1.message);
    else {
      const { error: e2 } = await sb.from("siswa").update({ nis: "262710399" }).eq("id", ashvin.id).eq("nis", "TEMP_262710399");
      console.log("Set ASHVIN to 262710399:", e2?.message || "OK");
    }
  }
  
  // 6. Fix auth for ASHVIN
  const correctEmail = "262710399@sman19.sch.id";
  const { data: profile } = await sb.from("profiles").select("id,email").eq("email", correctEmail).limit(1);
  if (profile?.length) {
    const userId = profile[0].id;
    const { data: users } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const authUser = users.users.find((u) => u.id === userId);
    if (authUser && authUser.email !== correctEmail) {
      const tempEmail = "TEMP_262710399@sman19.sch.id";
      await sb.auth.admin.updateUserById(userId, { email: tempEmail });
      await new Promise((r) => setTimeout(r, 100));
      const { error } = await sb.auth.admin.updateUserById(userId, { email: correctEmail });
      console.log("Auth fix:", error?.message || "OK -> " + correctEmail);
      await sb.from("profiles").update({ email: correctEmail, nis: "262710399" }).eq("id", userId);
    } else {
      console.log("Auth already correct or not found");
      await sb.from("profiles").update({ email: correctEmail, nis: "262710399" }).eq("id", userId);
    }
  }
  
  // 7. Handle the 3 holders stuck at HOLDER_ - restore them to their original NIS
  // But their original NIS is now taken by the correct students!
  // We need to set them to null NIS for now or find their correct NIS
  const { data: holders } = await sb.from("siswa").select("id,nis,nama").like("nis", "HOLDER_%");
  console.log("\n=== HOLDERS STUCK ===");
  if (holders) {
    for (const h of holders) {
      const originalNis = h.nis.replace("HOLDER_", "");
      // Check if the original NIS is now taken
      const { data: taken } = await sb.from("siswa").select("nama").eq("nis", originalNis).limit(1);
      if (taken?.length) {
        console.log(`${h.nama}: original ${originalNis} is taken by ${taken[0].nama}. Needs manual reassignment.`);
      } else {
        // Can restore
        const { error } = await sb.from("siswa").update({ nis: originalNis }).eq("id", h.id);
        console.log(`${h.nama}: restored to ${originalNis}:`, error?.message || "OK");
        const { data: prof } = await sb.from("profiles").select("id").eq("email", originalNis + "@sman19.sch.id").limit(1);
        if (prof?.length) await sb.from("profiles").update({ nis: originalNis }).eq("id", prof[0].id);
      }
    }
  }
}

main().catch((e) => console.error(e));
