/**
 * Final fix for remaining issues:
 * 1. 7 auth users with wrong emails (chain shifted) → two-phase email update + profile fix
 * 2. 4 siswa with TEMP_ NIS (blocked by non-Excel holders) → resolve holders first
 * 3. Restore all nulled profiles
 * Usage: npx tsx scripts/fix-final.ts [--execute]
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
  console.log("=== Fix Final ===\n");

  // 1. Find remaining siswa issues
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

  // Remaining mismatches and TEMP_ values
  const remaining: { id: string; oldNis: string; newNis: string; nama: string }[] = [];
  const tempStudents: { id: string; oldNis: string; newNis: string; nama: string }[] = [];
  for (const e of excelStudents) {
    const matches = dbByName.get(e.nama.toUpperCase().trim());
    if (!matches?.length) continue;
    const m = matches[0];
    if (m.nis === e.nis) continue;
    if (m.nis.startsWith("TEMP_")) tempStudents.push({ id: m.id, oldNis: m.nis, newNis: e.nis, nama: e.nama });
    else remaining.push({ id: m.id, oldNis: m.nis, newNis: e.nis, nama: e.nama });
  }

  // 2. Find auth users that need fixing (wrong email)
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

  const authFixes: { userId: string; currentEmail: string; correctEmail: string; nama: string }[] = [];
  for (const e of excelStudents) {
    const matches = dbByName.get(e.nama.toUpperCase().trim());
    if (!matches?.length) continue;
    const m = matches[0];
    const correctEmail = `${e.nis}@sman19.sch.id`;
    // Find auth user by profile email or by ID
    const profileEmail = `${m.nis}@sman19.sch.id`;
    const authUser = authByEmail.get(profileEmail.toLowerCase()) || authByEmail.get(correctEmail.toLowerCase());
    // Also check by user ID match with profile
    if (!authUser) {
      // Check if auth user exists with the profile's current email
      const currentAuth = authUsers.find(u => u.email.toLowerCase() === profileEmail.toLowerCase());
      if (currentAuth && currentAuth.email.toLowerCase() !== correctEmail.toLowerCase()) {
        authFixes.push({ userId: currentAuth.id, currentEmail: currentAuth.email, correctEmail, nama: e.nama });
      }
    } else if (authUser.email.toLowerCase() !== correctEmail.toLowerCase()) {
      authFixes.push({ userId: authUser.id, currentEmail: authUser.email, correctEmail, nama: e.nama });
    }
  }

  // 3. Find nulled profiles that need restoring
  const { data: nulledProfiles } = await supabase.from("profiles").select("id,email,nama").is("nis", null);
  const nisProfilesToRestore: { profileId: string; email: string; correctNis: string; nama: string }[] = [];
  for (const p of (nulledProfiles || [])) {
    const nis = p.email.replace("@sman19.sch.id", "");
    if (/^\d{7}$/.test(nis)) {
      const { data: siswa } = await supabase.from("siswa").select("nis").eq("nis", nis).limit(1);
      if (siswa?.length) {
        nisProfilesToRestore.push({ profileId: p.id, email: p.email, correctNis: nis, nama: p.nama || "unknown" });
      }
    }
  }

  console.log("=== REPORT ===");
  console.log(`Siswa remaining: ${remaining.length} mismatch + ${tempStudents.length} TEMP_`);
  console.log(`Auth fixes needed: ${authFixes.length}`);
  console.log(`Nulled profiles to restore: ${nisProfilesToRestore.length}\n`);

  for (const u of remaining) console.log(`  siswa: ${u.nama} ${u.oldNis} → ${u.newNis}`);
  for (const u of tempStudents) console.log(`  temp: ${u.nama} ${u.oldNis} → ${u.newNis}`);
  for (const u of authFixes) console.log(`  auth: ${u.nama} ${u.currentEmail} → ${u.correctEmail}`);
  for (const u of nisProfilesToRestore) console.log(`  profile: ${u.nama} NIS=${u.correctNis}`);
  console.log();

  if (!execute) {
    console.log("=== DRY RUN — run with --execute ===");
    return;
  }

  console.log("=== EXECUTING ===\n");

  // Handle the 4 remaining non-TEMP students: need to move holders out of the way
  if (remaining.length > 0) {
    console.log("--- Move holders + set remaining to TEMP ---");
    for (const u of remaining) {
      // Check if target NIS is taken
      const { data: holder } = await supabase.from("siswa").select("id,nis,nama").eq("nis", u.newNis).limit(1);
      if (holder?.length && holder[0].id !== u.id) {
        // Null all profiles referencing both old and new NIS
        for (const nis of [u.oldNis, u.newNis]) {
          if (nis.startsWith("TEMP_")) continue;
          const { data: profs } = await supabase.from("profiles").select("id").eq("nis", nis);
          for (const p of (profs || [])) await supabase.from("profiles").update({ nis: null }).eq("id", p.id);
        }
        // Move holder to a temp NIS that doesn't conflict
        const holderTempNis = `HOLDER_${u.newNis}`;
        const { error: hErr } = await supabase.from("siswa").update({ nis: holderTempNis }).eq("id", holder[0].id);
        if (hErr) console.error(`  FAIL move holder ${holder[0].nama}: ${hErr.message}`);
        else console.log(`  Moved holder ${holder[0].nama} to ${holderTempNis}`);
      } else {
        // Just null profiles
        for (const nis of [u.oldNis, u.newNis]) {
          if (nis.startsWith("TEMP_")) continue;
          const { data: profs } = await supabase.from("profiles").select("id").eq("nis", nis);
          for (const p of (profs || [])) await supabase.from("profiles").update({ nis: null }).eq("id", p.id);
        }
      }
      // Set to TEMP_
      const { error } = await supabase.from("siswa").update({ nis: `TEMP_${u.newNis}` }).eq("id", u.id);
      if (error) console.error(`  FAIL TEMP ${u.nama}: ${error.message}`);
      else console.log(`  Set ${u.nama} to TEMP_${u.newNis}`);
    }
    console.log();
  }

  // Phase 2: all TEMP_ to final
  console.log("--- Phase 2: TEMP_ → final ---");
  const allTemp = [...remaining.map(u => ({ ...u, tempNis: `TEMP_${u.newNis}` })), ...tempStudents.map(u => ({ ...u, tempNis: u.oldNis }))];
  let p2ok = 0;
  for (const u of allTemp) {
    const { error } = await supabase.from("siswa").update({ nis: u.newNis }).eq("id", u.id).eq("nis", u.tempNis);
    if (error) console.error(`  FAIL ${u.nama}: ${error.message}`);
    else { p2ok++; console.log(`  OK ${u.nama} → ${u.newNis}`); }
  }
  console.log(`Phase 2: ${p2ok}/${allTemp.length}\n`);

  // Auth email fixes (two-phase)
  console.log("--- Auth email fixes ---");
  // Phase 1: set TEMP_
  let ae1 = 0;
  for (const u of authFixes) {
    const tempEmail = `TEMP_${u.correctEmail.split("@")[0]}@sman19.sch.id`;
    await sleep(50);
    const { error } = await supabase.auth.admin.updateUserById(u.userId, { email: tempEmail });
    if (error) console.error(`  FAIL P1 ${u.nama}: ${error.message}`);
    else ae1++;
  }
  console.log(`Auth Phase 1: ${ae1}/${authFixes.length}`);
  // Phase 2: set final
  let ae2 = 0;
  for (const u of authFixes) {
    await sleep(50);
    const { error } = await supabase.auth.admin.updateUserById(u.userId, { email: u.correctEmail });
    if (error) console.error(`  FAIL P2 ${u.nama}: ${error.message}`);
    else { ae2++; console.log(`  OK auth ${u.nama} → ${u.correctEmail}`); }
  }
  console.log(`Auth Phase 2: ${ae2}/${authFixes.length}\n`);

  // Restore all profiles (siswa nis + email)
  console.log("--- Restore profiles ---");
  const allSiswaUpdates = [...remaining, ...tempStudents];
  let profOk = 0;
  for (const u of allSiswaUpdates) {
    const correctEmail = `${u.newNis}@sman19.sch.id`;
    // Find profile by email (old email pattern)
    const oldEmail = `${u.oldNis.startsWith("TEMP_") ? u.oldNis.replace("TEMP_", "") : u.oldNis}@sman19.sch.id`;
    const { data: prof } = await supabase.from("profiles").select("id").eq("email", oldEmail).limit(1);
    if (prof?.length) {
      const { error } = await supabase.from("profiles").update({ nis: u.newNis, email: correctEmail }).eq("id", prof[0].id);
      if (error) console.error(`  FAIL ${u.nama}: ${error.message}`);
      else profOk++;
    }
  }
  console.log(`Profiles restored: ${profOk}\n`);

  // Restore nulled profiles
  console.log("--- Restore nulled profiles ---");
  let nOk = 0;
  for (const u of nisProfilesToRestore) {
    const { error } = await supabase.from("profiles").update({ nis: u.correctNis }).eq("id", u.profileId);
    if (error) console.error(`  FAIL ${u.nama}: ${error.message}`);
    else nOk++;
  }
  console.log(`Nulled profiles restored: ${nOk}\n`);

  // Restore holder NIS (from HOLDER_xxx back to their original)
  console.log("--- Restore holder NIS ---");
  const { data: holders } = await supabase.from("siswa").select("id,nis,nama").like("nis", "HOLDER_%");
  let hOk = 0;
  if (holders) {
    for (const h of holders) {
      const originalNis = h.nis.replace("HOLDER_", "");
      // Null profiles referencing this
      const { data: profs } = await supabase.from("profiles").select("id").eq("nis", h.nis);
      for (const p of (profs || [])) await supabase.from("profiles").update({ nis: null }).eq("id", p.id);
      // Set back
      const { error } = await supabase.from("siswa").update({ nis: originalNis }).eq("id", h.id);
      if (error) console.error(`  FAIL ${h.nama}: ${error.message}`);
      else { hOk++; console.log(`  OK ${h.nama} → ${originalNis}`); }
      // Restore profile
      const { data: prof } = await supabase.from("profiles").select("id").eq("email", `${originalNis}@sman19.sch.id`).limit(1);
      if (prof?.length) {
        await supabase.from("profiles").update({ nis: originalNis }).eq("id", prof[0].id);
      }
    }
  }
  console.log(`Holders restored: ${hOk}\n`);

  console.log("=== DONE ===");
}

main().catch((err) => { console.error("Fatal:", err); process.exit(1); });
