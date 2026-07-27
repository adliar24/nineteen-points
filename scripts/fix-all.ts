/**
 * Fix script: Set all 7 TEMP_ NIS to final, update 209 siswa NIS (two-phase), 
 * update auth emails, and update profile NIS.
 * Usage: npx tsx scripts/fix-all.ts [--dry-run] [--execute]
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

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing env vars");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const excelStudents: { nis: string; nama: string; kelas: string }[] = JSON.parse(
  readFileSync(resolve(__dirname, "../excel_students_v2.json"), "utf-8")
);

const execute = process.argv.includes("--execute");

function normalize(s: string) { return s.toUpperCase().trim(); }

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

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log("=== Fix All Script ===\n");

  const dbSiswa = await fetchAll("siswa");
  console.log(`DB siswa: ${dbSiswa.length}`);
  const dbProfiles = await fetchAll("profiles");
  console.log(`DB profiles: ${dbProfiles.length}`);
  const authUsers = await fetchAllAuthUsers();
  console.log(`Auth users: ${authUsers.length}\n`);

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

  // Find all updates needed
  const siswaUpdates: { id: string; oldNis: string; newNis: string; nama: string }[] = [];
  const emailUpdates: { userId: string; oldEmail: string; newEmail: string; nama: string }[] = [];
  const profileUpdates: { id: string; oldNis: string | null; newNis: string; nama: string }[] = [];
  const notFound: string[] = [];

  for (const excel of excelStudents) {
    const matches = dbByName.get(normalize(excel.nama));
    if (!matches || matches.length === 0) { notFound.push(excel.nama); continue; }
    const match = matches.length === 1 ? matches[0] : matches[0];

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

    // Profile NIS
    const profile = profileByEmail.get(oldEmail.toLowerCase()) || profileByEmail.get(newEmail.toLowerCase());
    if (profile && profile.nis !== excel.nis) {
      profileUpdates.push({ id: profile.id, oldNis: profile.nis, newNis: excel.nis, nama: excel.nama });
    }
  }

  const tempCount = siswaUpdates.filter(u => u.oldNis.startsWith("TEMP_")).length;
  const normalCount = siswaUpdates.length - tempCount;

  console.log("=== REPORT ===");
  console.log(`Siswa NIS to fix: ${siswaUpdates.length} (${tempCount} TEMP_ + ${normalCount} mismatch)`);
  console.log(`Auth emails to update: ${emailUpdates.length}`);
  console.log(`Profile NIS to update: ${profileUpdates.length}`);
  console.log(`Not found in DB: ${notFound.length}`);
  if (notFound.length > 0) console.log(`  ${notFound.join(", ")}`);
  console.log();

  // Show first few of each
  for (const u of siswaUpdates.slice(0, 5)) {
    console.log(`  siswa: ${u.nama} ${u.oldNis} → ${u.newNis}`);
  }
  if (siswaUpdates.length > 5) console.log(`  ... and ${siswaUpdates.length - 5} more`);
  console.log();

  for (const u of emailUpdates.slice(0, 3)) {
    console.log(`  auth: ${u.nama} ${u.oldEmail} → ${u.newEmail}`);
  }
  if (emailUpdates.length > 3) console.log(`  ... and ${emailUpdates.length - 3} more`);
  console.log();

  for (const u of profileUpdates) {
    console.log(`  profile: ${u.nama} ${u.oldNis} → ${u.newNis}`);
  }
  console.log();

  if (!execute) {
    console.log("=== DRY RUN — run with --execute to apply ===");
    return;
  }

  console.log("=== EXECUTING ===\n");

  // Phase 1: Set all non-TEMP siswa NIS to temp
  console.log("--- Phase 1: Set temp NIS ---");
  let phase1Ok = 0, phase1Fail = 0;
  for (const u of siswaUpdates) {
    if (u.oldNis.startsWith("TEMP_")) continue; // Already TEMP_
    const tempNis = `TEMP_${u.newNis}`;
    const { error } = await supabase.from("siswa").update({ nis: tempNis }).eq("id", u.id);
    if (error) { console.error(`  FAIL ${u.nama}: ${error.message}`); phase1Fail++; }
    else { phase1Ok++; }
  }
  console.log(`Phase 1: ${phase1Ok} ok, ${phase1Fail} fail\n`);

  // Phase 2: Set all TEMP_ to final
  console.log("--- Phase 2: Set final NIS ---");
  let phase2Ok = 0, phase2Fail = 0;
  for (const u of siswaUpdates) {
    const tempNis = `TEMP_${u.newNis}`;
    const { error } = await supabase.from("siswa").update({ nis: u.newNis }).eq("id", u.id).eq("nis", tempNis);
    if (error) { console.error(`  FAIL ${u.nama}: ${error.message}`); phase2Fail++; }
    else { console.log(`  OK ${u.nama} → ${u.newNis}`); phase2Ok++; }
  }
  console.log(`Phase 2: ${phase2Ok} ok, ${phase2Fail} fail\n`);

  // Auth email updates + profile email updates
  console.log("--- Auth email + Profile email updates ---");
  let authOk = 0, authFail = 0;
  for (const u of emailUpdates) {
    await sleep(50); // Small delay to avoid rate limits
    const { error } = await supabase.auth.admin.updateUserById(u.userId, { email: u.newEmail });
    if (error) { console.error(`  FAIL auth ${u.nama}: ${error.message}`); authFail++; }
    else {
      console.log(`  OK auth ${u.nama} → ${u.newEmail}`);
      authOk++;
      // Also update profile email
      const { error: profErr } = await supabase.from("profiles").update({ email: u.newEmail }).eq("id", u.userId);
      if (profErr) console.error(`  WARN profile email ${u.nama}: ${profErr.message}`);
    }
  }
  console.log(`Auth: ${authOk} ok, ${authFail} fail\n`);

  // Profile NIS + email updates (must be after siswa NIS is correct for FK)
  console.log("--- Profile NIS updates ---");
  let profOk = 0, profFail = 0;
  for (const u of profileUpdates) {
    // Check if auth email was already updated (profile email is already new)
    // If not, also update profile email
    const newEmail = `${u.newNis}@sman19.sch.id`;
    const { error } = await supabase.from("profiles").update({ nis: u.newNis, email: newEmail }).eq("id", u.id);
    if (error) { console.error(`  FAIL ${u.nama}: ${error.message}`); profFail++; }
    else { console.log(`  OK ${u.nama} NIS→${u.newNis} email→${newEmail}`); profOk++; }
  }
  console.log(`Profiles: ${profOk} ok, ${profFail} fail\n`);

  console.log("=== SUMMARY ===");
  console.log(`siswa NIS: ${phase2Ok + phase1Ok} updated (${phase1Fail + phase2Fail} failed)`);
  console.log(`auth email: ${authOk} updated (${authFail} failed)`);
  console.log(`profile NIS+email: ${profOk} updated (${profFail} failed)`);
}

main().catch((err) => { console.error("Fatal:", err); process.exit(1); });
