/**
 * Comprehensive fix: handles FK constraints, chain conflicts, and email conflicts.
 * Usage: npx tsx scripts/fix-all-v2.ts [--dry-run] [--execute]
 *
 * Strategy:
 * 1. Null profiles.nis for all affected students (removes FK blocker)
 * 2. Phase 1: Set siswa.nis to TEMP_ values
 * 3. Phase 2: Set siswa.nis from TEMP_ to final
 * 4. Phase 1 auth: Set auth emails to TEMP_NIS@sman19.sch.id
 * 5. Phase 2 auth: Set auth emails from TEMP_ to final
 * 6. Restore profiles.nis and profiles.email
 */

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

const supabaseUrl = env["VITE_SUPABASE_URL"];
const serviceRoleKey = env["VITE_SUPABASE_SERVICE_ROLE_KEY"];
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const excelStudents: { nis: string; nama: string; kelas: string }[] = JSON.parse(
  readFileSync(resolve(__dirname, "../excel_students_v2.json"), "utf-8")
);

const execute = process.argv.includes("--execute");

function normalize(s: string) { return s.toUpperCase().trim(); }
function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function fetchAll(table: string) {
  const all: any[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase.from(table).select("*").range(from, from + 999);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < 1000) break;
    from += 1000;
  }
  return all;
}

async function fetchAllAuthUsers() {
  const all: { id: string; email: string }[] = [];
  let page = 1;
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    if (!data.users || data.users.length === 0) break;
    all.push(...data.users.map((u) => ({ id: u.id, email: u.email || "" })));
    if (data.users.length < 1000) break;
    page++;
  }
  return all;
}

async function main() {
  console.log("=== Fix All V2 ===\n");

  const dbSiswa = await fetchAll("siswa");
  const dbProfiles = await fetchAll("profiles");
  const authUsers = await fetchAllAuthUsers();
  console.log(`siswa: ${dbSiswa.length}, profiles: ${dbProfiles.length}, auth: ${authUsers.length}\n`);

  // Build maps
  const dbByName = new Map<string, any[]>();
  for (const s of dbSiswa) {
    const key = normalize(s.nama);
    if (!dbByName.has(key)) dbByName.set(key, []);
    dbByName.get(key)!.push(s);
  }
  const authByEmail = new Map<string, { id: string; email: string }>();
  for (const u of authUsers) authByEmail.set(u.email.toLowerCase(), u);
  const profileByEmail = new Map<string, any>();
  for (const p of dbProfiles) profileByEmail.set(p.email.toLowerCase(), p);

  // Compute updates
  const siswaUpdates: { id: string; oldNis: string; newNis: string; nama: string }[] = [];
  const emailUpdates: { userId: string; oldEmail: string; newEmail: string; nama: string }[] = [];
  const profileNisUpdates: { profileId: string; siswaId: string; oldNis: string | null; newNis: string; nama: string }[] = [];
  const profileEmailUpdates: { profileId: string; oldEmail: string; newEmail: string; nama: string }[] = [];
  const notFound: string[] = [];

  for (const excel of excelStudents) {
    const matches = dbByName.get(normalize(excel.nama));
    if (!matches || matches.length === 0) { notFound.push(excel.nama); continue; }
    const match = matches[0];

    // Siswa NIS
    if (match.nis !== excel.nis) {
      siswaUpdates.push({ id: match.id, oldNis: match.nis, newNis: excel.nis, nama: excel.nama });
    }

    // Auth email
    const oldEmail = `${match.nis}@sman19.sch.id`;
    const newEmail = `${excel.nis}@sman19.sch.id`;
    const authUser = authByEmail.get(oldEmail.toLowerCase()) || authByEmail.get(newEmail.toLowerCase());
    if (authUser && authUser.email.toLowerCase() !== newEmail.toLowerCase()) {
      emailUpdates.push({ userId: authUser.id, oldEmail: authUser.email, newEmail, nama: excel.nama });
    }

    // Profile NIS + email
    const profile = profileByEmail.get(oldEmail.toLowerCase()) || profileByEmail.get(newEmail.toLowerCase());
    if (profile) {
      if (profile.nis !== excel.nis) {
        profileNisUpdates.push({ profileId: profile.id, siswaId: match.id, oldNis: profile.nis, newNis: excel.nis, nama: excel.nama });
      }
      const profileExpectedEmail = `${excel.nis}@sman19.sch.id`;
      if (profile.email.toLowerCase() !== profileExpectedEmail.toLowerCase()) {
        profileEmailUpdates.push({ profileId: profile.id, oldEmail: profile.email, newEmail: profileExpectedEmail, nama: excel.nama });
      }
    }
  }

  console.log("=== REPORT ===");
  console.log(`Siswa NIS updates: ${siswaUpdates.length}`);
  console.log(`Auth email updates: ${emailUpdates.length}`);
  console.log(`Profile NIS updates: ${profileNisUpdates.length}`);
  console.log(`Profile email updates: ${profileEmailUpdates.length}`);
  console.log(`Not found: ${notFound.length}\n`);

  if (!execute) {
    console.log("=== DRY RUN — run with --execute ===");
    return;
  }

  console.log("=== EXECUTING ===\n");

  // Step 1: Null out profiles.nis for all affected students (removes FK blocker)
  console.log("--- Step 1: Null profiles.nis ---");
  let nullNisOk = 0;
  for (const u of siswaUpdates) {
    const profile = profileByEmail.get(`${u.oldNis}@sman19.sch.id`.toLowerCase()) || profileByEmail.get(`${u.newNis}@sman19.sch.id`.toLowerCase());
    if (profile && profile.nis) {
      const { error } = await supabase.from("profiles").update({ nis: null }).eq("id", profile.id);
      if (error) console.error(`  FAIL null NIS ${u.nama}: ${error.message}`);
      else nullNisOk++;
    }
  }
  console.log(`Nulled ${nullNisOk} profiles.nis\n`);

  // Step 2: Phase 1 siswa - set to TEMP_
  console.log("--- Step 2: Phase 1 siswa (TEMP_) ---");
  let s1Ok = 0, s1Fail = 0;
  for (const u of siswaUpdates) {
    if (u.oldNis.startsWith("TEMP_")) continue;
    const tempNis = `TEMP_${u.newNis}`;
    const { error } = await supabase.from("siswa").update({ nis: tempNis }).eq("id", u.id);
    if (error) { console.error(`  FAIL ${u.nama}: ${error.message}`); s1Fail++; }
    else s1Ok++;
  }
  console.log(`Phase 1 siswa: ${s1Ok} ok, ${s1Fail} fail\n`);

  // Step 3: Phase 2 siswa - set from TEMP_ to final
  console.log("--- Step 3: Phase 2 siswa (final) ---");
  let s2Ok = 0, s2Fail = 0;
  for (const u of siswaUpdates) {
    const tempNis = `TEMP_${u.newNis}`;
    const { error } = await supabase.from("siswa").update({ nis: u.newNis }).eq("id", u.id).eq("nis", tempNis);
    if (error) { console.error(`  FAIL ${u.nama}: ${error.message}`); s2Fail++; }
    else { s2Ok++; }
  }
  console.log(`Phase 2 siswa: ${s2Ok} ok, ${s2Fail} fail\n`);

  // Step 4: Phase 1 auth emails - set to TEMP_NIS@sman19.sch.id
  console.log("--- Step 4: Phase 1 auth emails (TEMP_) ---");
  let a1Ok = 0, a1Fail = 0;
  for (const u of emailUpdates) {
    const tempEmail = `TEMP_${u.newEmail.split("@")[0]}@sman19.sch.id`;
    await sleep(50);
    const { error } = await supabase.auth.admin.updateUserById(u.userId, { email: tempEmail });
    if (error) { console.error(`  FAIL ${u.nama}: ${error.message}`); a1Fail++; }
    else a1Ok++;
  }
  console.log(`Phase 1 auth: ${a1Ok} ok, ${a1Fail} fail\n`);

  // Step 5: Phase 2 auth emails - set from TEMP_ to final
  console.log("--- Step 5: Phase 2 auth emails (final) ---");
  let a2Ok = 0, a2Fail = 0;
  for (const u of emailUpdates) {
    const tempEmail = `TEMP_${u.newEmail.split("@")[0]}@sman19.sch.id`;
    await sleep(50);
    const { error } = await supabase.auth.admin.updateUserById(u.userId, { email: u.newEmail });
    if (error) { console.error(`  FAIL ${u.nama}: ${error.message}`); a2Fail++; }
    else a2Ok++;
  }
  console.log(`Phase 2 auth: ${a2Ok} ok, ${a2Fail} fail\n`);

  // Step 6: Restore profiles.nis and update profile email
  console.log("--- Step 6: Restore profiles ---");
  let pOk = 0, pFail = 0;
  for (const u of siswaUpdates) {
    const profile = profileByEmail.get(`${u.oldNis}@sman19.sch.id`.toLowerCase()) || profileByEmail.get(`${u.newNis}@sman19.sch.id`.toLowerCase());
    if (profile) {
      const newEmail = `${u.newNis}@sman19.sch.id`;
      const { error } = await supabase.from("profiles").update({ nis: u.newNis, email: newEmail }).eq("id", profile.id);
      if (error) { console.error(`  FAIL profile ${u.nama}: ${error.message}`); pFail++; }
      else pOk++;
    }
  }
  console.log(`Profiles restored: ${pOk} ok, ${pFail} fail\n`);

  console.log("=== DONE ===");
  console.log(`siswa: ${s2Ok}/${siswaUpdates.length} (phase1: ${s1Ok}, phase2: ${s2Ok})`);
  console.log(`auth: ${a2Ok}/${emailUpdates.length} (phase1: ${a1Ok}, phase2: ${a2Ok})`);
  console.log(`profiles: ${pOk}/${siswaUpdates.length}`);
}

main().catch((err) => { console.error("Fatal:", err); process.exit(1); });
