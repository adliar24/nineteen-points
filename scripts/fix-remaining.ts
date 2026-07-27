/**
 * Fix remaining siswa: null ALL FK-referencing profiles, two-phase NIS update,
 * then restore profiles and handle auth emails.
 * Usage: npx tsx scripts/fix-remaining.ts [--execute]
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

const supabase = createClient(env["VITE_SUPABASE_URL"], env["VITE_SUPABASE_SERVICE_ROLE_KEY"], {
  auth: { persistSession: false, autoRefreshToken: false },
});

const execute = process.argv.includes("--execute");
function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log("=== Fix Remaining ===\n");

  // Fetch current state
  const dbSiswa: any[] = [];
  let from = 0;
  while (true) {
    const { data } = await supabase.from("siswa").select("*").range(from, from + 999);
    if (!data?.length) break;
    dbSiswa.push(...data);
    if (data.length < 1000) break;
    from += 1000;
  }

  const dbByName = new Map<string, any[]>();
  for (const s of dbSiswa) {
    const k = s.nama.toUpperCase().trim();
    if (!dbByName.has(k)) dbByName.set(k, []);
    dbByName.get(k)!.push(s);
  }

  const excelStudents: { nis: string; nama: string }[] = JSON.parse(
    readFileSync(resolve(__dirname, "../excel_students_v2.json"), "utf-8")
  );

  // Find remaining mismatches (not TEMP_, not already correct)
  const remaining: { id: string; oldNis: string; newNis: string; nama: string }[] = [];
  for (const e of excelStudents) {
    const matches = dbByName.get(e.nama.toUpperCase().trim());
    if (!matches?.length) continue;
    const m = matches[0];
    if (m.nis !== e.nis && !m.nis.startsWith("TEMP_")) {
      remaining.push({ id: m.id, oldNis: m.nis, newNis: e.nis, nama: e.nama });
    }
  }

  // Also find TEMP_ students
  const tempStudents: { id: string; oldNis: string; newNis: string; nama: string }[] = [];
  for (const e of excelStudents) {
    const matches = dbByName.get(e.nama.toUpperCase().trim());
    if (!matches?.length) continue;
    const m = matches[0];
    if (m.nis.startsWith("TEMP_")) {
      tempStudents.push({ id: m.id, oldNis: m.nis, newNis: e.nis, nama: e.nama });
    }
  }

  console.log(`Remaining mismatches: ${remaining.length}`);
  console.log(`TEMP_ students: ${tempStudents.length}`);

  // Also find auth emails that still need updating
  const authUsers: { id: string; email: string }[] = [];
  let page = 1;
  while (true) {
    const { data } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (!data?.users?.length) break;
    authUsers.push(...data.users.map(u => ({ id: u.id, email: u.email || "" })));
    if (data.users.length < 1000) break;
    page++;
  }
  const authByEmail = new Map<string, { id: string; email: string }>();
  for (const u of authUsers) authByEmail.set(u.email.toLowerCase(), u);

  const emailUpdates: { userId: string; oldEmail: string; newEmail: string; nama: string }[] = [];
  for (const e of excelStudents) {
    const matches = dbByName.get(e.nama.toUpperCase().trim());
    if (!matches?.length) continue;
    const m = matches[0];
    const oldEmail = `${m.nis}@sman19.sch.id`;
    const newEmail = `${e.nis}@sman19.sch.id`;
    if (oldEmail.startsWith("TEMP_")) continue;
    const authUser = authByEmail.get(oldEmail.toLowerCase()) || authByEmail.get(newEmail.toLowerCase());
    if (authUser && authUser.email.toLowerCase() !== newEmail.toLowerCase() && !authUser.email.toLowerCase().startsWith("temp_")) {
      emailUpdates.push({ userId: authUser.id, oldEmail: authUser.email, newEmail, nama: e.nama });
    }
  }
  console.log(`Auth emails remaining: ${emailUpdates.length}`);

  // Print details
  for (const u of remaining) console.log(`  siswa: ${u.nama} ${u.oldNis} → ${u.newNis}`);
  for (const u of tempStudents) console.log(`  temp: ${u.nama} ${u.oldNis} → ${u.newNis}`);
  for (const u of emailUpdates.slice(0, 5)) console.log(`  auth: ${u.nama} ${u.oldEmail} → ${u.newEmail}`);
  if (emailUpdates.length > 5) console.log(`  ... and ${emailUpdates.length - 5} more`);
  console.log();

  if (!execute) {
    console.log("=== DRY RUN — run with --execute ===");
    return;
  }

  console.log("=== EXECUTING ===\n");

  const allUpdates = [...remaining, ...tempStudents];

  // Step 1: Null ALL profiles referencing old or new NIS for ALL remaining students
  console.log("--- Step 1: Null all FK-referencing profiles ---");
  let nullCount = 0;
  for (const u of allUpdates) {
    for (const nis of [u.oldNis, u.newNis]) {
      if (nis.startsWith("TEMP_")) continue;
      const { data: profs } = await supabase.from("profiles").select("id,email").eq("nis", nis);
      if (profs) {
        for (const p of profs) {
          await supabase.from("profiles").update({ nis: null }).eq("id", p.id);
          nullCount++;
        }
      }
    }
  }
  console.log(`Nulled ${nullCount} profiles\n`);

  // Step 2: Phase 1 - set TEMP_ (for mismatches only, skip already-TEMP)
  console.log("--- Step 2: Phase 1 siswa (TEMP_) ---");
  let p1ok = 0;
  for (const u of remaining) {
    const { error } = await supabase.from("siswa").update({ nis: `TEMP_${u.newNis}` }).eq("id", u.id);
    if (error) console.error(`  FAIL ${u.nama}: ${error.message}`);
    else p1ok++;
  }
  console.log(`Phase 1: ${p1ok}/${remaining.length}\n`);

  // Step 3: Phase 2 - set final (all remaining + temp)
  console.log("--- Step 3: Phase 2 siswa (final) ---");
  let p2ok = 0;
  for (const u of allUpdates) {
    const { error } = await supabase.from("siswa").update({ nis: u.newNis }).eq("id", u.id).eq("nis", `TEMP_${u.newNis}`);
    if (error) console.error(`  FAIL ${u.nama}: ${error.message}`);
    else { p2ok++; console.log(`  OK ${u.nama} → ${u.newNis}`); }
  }
  console.log(`Phase 2: ${p2ok}/${allUpdates.length}\n`);

  // Step 4: Auth emails - two-phase
  console.log("--- Step 4: Auth emails (two-phase) ---");
  // Phase 1: set TEMP_
  let ae1 = 0;
  for (const u of emailUpdates) {
    const tempEmail = `TEMP_${u.newEmail.split("@")[0]}@sman19.sch.id`;
    await sleep(50);
    const { error } = await supabase.auth.admin.updateUserById(u.userId, { email: tempEmail });
    if (error) console.error(`  FAIL P1 ${u.nama}: ${error.message}`);
    else ae1++;
  }
  console.log(`Auth Phase 1: ${ae1}/${emailUpdates.length}`);
  // Phase 2: set final
  let ae2 = 0;
  for (const u of emailUpdates) {
    await sleep(50);
    const { error } = await supabase.auth.admin.updateUserById(u.userId, { email: u.newEmail });
    if (error) console.error(`  FAIL P2 ${u.nama}: ${error.message}`);
    else ae2++;
  }
  console.log(`Auth Phase 2: ${ae2}/${emailUpdates.length}\n`);

  // Step 5: Restore profiles
  console.log("--- Step 5: Restore profiles ---");
  let profOk = 0;
  for (const u of allUpdates) {
    const profile = await supabase.from("profiles").select("id").eq("email", `${u.oldNis}@sman19.sch.id`).limit(1);
    if (profile.data?.length) {
      const newEmail = `${u.newNis}@sman19.sch.id`;
      const { error } = await supabase.from("profiles").update({ nis: u.newNis, email: newEmail }).eq("id", profile.data[0].id);
      if (error) console.error(`  FAIL ${u.nama}: ${error.message}`);
      else profOk++;
    }
    // Also restore the secondary profiles
    const profile2 = await supabase.from("profiles").select("id").eq("email", `${u.newNis}@sman19.sch.id`).limit(1);
    if (profile2.data?.length && profile2.data[0].id !== profile.data?.[0]?.id) {
      await supabase.from("profiles").update({ nis: u.newNis }).eq("id", profile2.data[0].id);
    }
  }
  console.log(`Profiles restored: ${profOk}\n`);

  // Step 6: Also restore null'd profiles that were originally non-null
  console.log("--- Step 6: Restore additional null'd profiles ---");
  // Find profiles with null nis that should have a NIS
  const { data: nullProfiles } = await supabase.from("profiles").select("id,email").is("nis", null).eq("role", "siswa");
  let extraRestored = 0;
  if (nullProfiles) {
    for (const p of nullProfiles) {
      const nis = p.email.replace("@sman19.sch.id", "");
      if (/^\d+$/.test(nis)) {
        // Check if this NIS exists in siswa
        const { data: siswa } = await supabase.from("siswa").select("id").eq("nis", nis).limit(1);
        if (siswa?.length) {
          await supabase.from("profiles").update({ nis }).eq("id", p.id);
          extraRestored++;
        }
      }
    }
  }
  console.log(`Extra profiles restored: ${extraRestored}\n`);

  console.log("=== DONE ===");
}

main().catch((err) => { console.error("Fatal:", err); process.exit(1); });
