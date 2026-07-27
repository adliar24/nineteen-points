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
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const fixes = [
  { temp: "ADINDA NURUL FATIMAH", tempNis: "TEMP_262710265", target: "262710265", holder: "ALYA ZAHRA FATIHA" },
  { temp: "ALDA RAINA SETIAWAN", tempNis: "TEMP_262710266", target: "262710266", holder: "ARIZKA AMALYA SYAHIDA" },
  { temp: "MUHAMMAD RIZKY AZRIAN", tempNis: "TEMP_262710373", target: "262710373", holder: "MORENO DWI HARYADI" },
  { temp: "ASHVIN NU MAN AWALUDIN", tempNis: "TEMP_262710399", target: "262710399", holder: "ALIZA FARAH AZ-ZAHRA" },
];

async function main() {
  console.log("=== Fix 4 blocked students ===\n");

  for (const f of fixes) {
    const { data: holder } = await sb.from("siswa").select("id,nis,nama").eq("nama", f.holder).limit(1);
    if (!holder?.length) { console.log("Holder not found:", f.holder); continue; }

    // Null profiles for holder
    const { data: p1 } = await sb.from("profiles").select("id").eq("nis", holder[0].nis);
    for (const p of p1 || []) await sb.from("profiles").update({ nis: null }).eq("id", p.id);

    // Move holder temporarily
    const holderTemp = "HOLDER_" + holder[0].nis;
    const { error: hErr } = await sb.from("siswa").update({ nis: holderTemp }).eq("id", holder[0].id);
    if (hErr) { console.error("FAIL move holder", f.holder, ":", hErr.message); continue; }
    console.log("Moved", f.holder, "->", holderTemp);

    // Null profiles for target NIS
    const { data: p2 } = await sb.from("profiles").select("id").eq("nis", f.target);
    for (const p of p2 || []) await sb.from("profiles").update({ nis: null }).eq("id", p.id);

    // Get temp student
    const { data: ts } = await sb.from("siswa").select("id").eq("nama", f.temp).limit(1);
    if (!ts?.length) { console.log("Temp student not found:", f.temp); continue; }

    // Update temp student to target
    const { error: tErr } = await sb.from("siswa").update({ nis: f.target }).eq("id", ts[0].id).eq("nis", f.tempNis);
    if (tErr) console.error("FAIL update", f.temp, ":", tErr.message);
    else console.log("OK", f.temp, "->", f.target);

    // Restore holder
    const { error: rErr } = await sb.from("siswa").update({ nis: holder[0].nis }).eq("id", holder[0].id);
    if (rErr) console.error("FAIL restore holder", f.holder, ":", rErr.message);
    else console.log("Restored", f.holder, "->", holder[0].nis);

    // Restore holder profile
    const { data: hp } = await sb.from("profiles").select("id").eq("email", holder[0].nis + "@sman19.sch.id").limit(1);
    if (hp?.length) await sb.from("profiles").update({ nis: holder[0].nis }).eq("id", hp[0].id);
  }

  // Fix auth emails for these 4
  console.log("\nFixing auth emails...");
  for (const f of fixes) {
    const { data: ts } = await sb.from("siswa").select("nis").eq("nama", f.temp).limit(1);
    if (!ts?.length) continue;
    const nis = ts[0].nis;
    const correctEmail = nis + "@sman19.sch.id";

    const { data: prof } = await sb.from("profiles").select("id,email").eq("email", correctEmail).limit(1);
    if (!prof?.length) { console.log("No profile for", f.temp); continue; }
    const userId = prof[0].id;

    const { data: users } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const authUser = users.users.find((u) => u.id === userId);
    if (!authUser) { console.log("No auth user for", f.temp); continue; }
    if (authUser.email === correctEmail) { console.log("Already correct:", f.temp); continue; }

    const tempEmail = "TEMP_" + nis + "@sman19.sch.id";
    await sleep(100);
    const r1 = await sb.auth.admin.updateUserById(userId, { email: tempEmail });
    if (r1.error) { console.error("FAIL auth P1", f.temp, ":", r1.error.message); continue; }
    await sleep(100);
    const r2 = await sb.auth.admin.updateUserById(userId, { email: correctEmail });
    if (r2.error) { console.error("FAIL auth P2", f.temp, ":", r2.error.message); continue; }
    console.log("OK auth", f.temp, "->", correctEmail);
    await sb.from("profiles").update({ email: correctEmail, nis }).eq("id", userId);
  }

  console.log("\nDone!");
}

main().catch((e) => console.error(e));
