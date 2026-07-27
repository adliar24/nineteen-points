/**
 * Script to update NIS in Supabase database (siswa table + auth.users email)
 * Usage: npx tsx scripts/update-nis.ts [--dry-run] [--execute]
 *
 * - Without flags: shows comparison report
 * - --dry-run: same as no flags (just report)
 * - --execute: actually performs the updates
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load env
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
  console.error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const excelPath = resolve(__dirname, "../excel_students_v2.json");
const excelStudents: { nis: string; nama: string; kelas: string; sheet: string }[] = JSON.parse(
  readFileSync(excelPath, "utf-8")
);

const execute = process.argv.includes("--execute");

interface DbSiswa {
  id: string;
  nis: string;
  nama: string;
  kelas: string;
  total_poin: number;
  foto_url: string | null;
}

interface DbProfile {
  id: string;
  email: string;
  nama: string;
  role: string;
  nis: string | null;
}

async function fetchAllSiswa(): Promise<DbSiswa[]> {
  const all: DbSiswa[] = [];
  let from = 0;
  const step = 1000;
  while (true) {
    const { data, error } = await supabase
      .from("siswa")
      .select("*")
      .range(from, from + step - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < step) break;
    from += step;
  }
  return all;
}

async function fetchAllProfiles(): Promise<DbProfile[]> {
  const all: DbProfile[] = [];
  let from = 0;
  const step = 1000;
  while (true) {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .range(from, from + step - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < step) break;
    from += step;
  }
  return all;
}

async function fetchAllAuthUsers(): Promise<{ id: string; email: string }[]> {
  const all: { id: string; email: string }[] = [];
  let page = 1;
  const perPage = 1000;
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage,
    });
    if (error) throw error;
    if (!data.users || data.users.length === 0) break;
    all.push(...data.users.map((u) => ({ id: u.id, email: u.email || "" })));
    if (data.users.length < perPage) break;
    page++;
  }
  return all;
}

function normalize(s: string): string {
  return s.toUpperCase().trim();
}

async function main() {
  console.log("=== NIS Update Script ===\n");
  console.log(`Excel students loaded: ${excelStudents.length}`);

  // 1. Fetch DB data
  console.log("Fetching siswa from DB...");
  const dbSiswa = await fetchAllSiswa();
  console.log(`DB siswa count: ${dbSiswa.length}`);

  console.log("Fetching profiles from DB...");
  const dbProfiles = await fetchAllProfiles();
  console.log(`DB profiles count: ${dbProfiles.length}`);

  console.log("Fetching auth users...");
  const authUsers = await fetchAllAuthUsers();
  console.log(`Auth users count: ${authUsers.length}\n`);

  // 2. Build lookup maps
  // DB siswa by normalized name
  const dbByName = new Map<string, DbSiswa[]>();
  for (const s of dbSiswa) {
    const key = normalize(s.nama);
    if (!dbByName.has(key)) dbByName.set(key, []);
    dbByName.get(key)!.push(s);
  }

  // DB siswa by NIS
  const dbByNis = new Map<string, DbSiswa>();
  for (const s of dbSiswa) {
    if (s.nis) dbByNis.set(s.nis, s);
  }

  // Auth users by email (lowercase)
  const authByEmail = new Map<string, { id: string; email: string }>();
  for (const u of authUsers) {
    authByEmail.set(u.email.toLowerCase(), u);
  }

  // Profiles by email
  const profileByEmail = new Map<string, DbProfile>();
  for (const p of dbProfiles) {
    profileByEmail.set(p.email.toLowerCase(), p);
  }

  // 3. Compare
  const nisUpdates: { id: string; oldNis: string; newNis: string; nama: string }[] = [];
  const emailUpdates: { userId: string; oldEmail: string; newEmail: string; nama: string }[] = [];
  const profileUpdates: { id: string; oldNis: string | null; newNis: string; nama: string }[] = [];
  const classUpdates: { id: string; oldKelas: string; newKelas: string; nama: string }[] = [];
  const notFoundInDb: typeof excelStudents = [];
  const dbNotInExcel: DbSiswa[] = [];
  const duplicates: { nis: string; entries: DbSiswa[] }[] = [];

  // Check for DB duplicates
  const nisCounts = new Map<string, number>();
  for (const s of dbSiswa) {
    if (s.nis) nisCounts.set(s.nis, (nisCounts.get(s.nis) || 0) + 1);
  }
  for (const [nis, count] of nisCounts) {
    if (count > 1) {
      duplicates.push({
        nis,
        entries: dbSiswa.filter((s) => s.nis === nis),
      });
    }
  }

  for (const excel of excelStudents) {
    const matches = dbByName.get(normalize(excel.nama));
    if (!matches || matches.length === 0) {
      notFoundInDb.push(excel);
      continue;
    }

    // Use the first match (or the one with matching kelas)
    const match = matches.length === 1 ? matches[0] : matches.find((m) => normalize(m.kelas).includes(excel.kelas.split(" ")[1])) || matches[0];

    // Check NIS difference
    if (match.nis !== excel.nis) {
      nisUpdates.push({
        id: match.id,
        oldNis: match.nis,
        newNis: excel.nis,
        nama: excel.nama,
      });
    }

    // Check class difference
    if (normalize(match.kelas) !== normalize(excel.kelas)) {
      classUpdates.push({
        id: match.id,
        oldKelas: match.kelas,
        newKelas: excel.kelas,
        nama: excel.nama,
      });
    }

    // Check email for auth (email = NIS@sman19.sch.id)
    const expectedEmail = `${excel.nis}@sman19.sch.id`;
    const expectedEmailLower = expectedEmail.toLowerCase();

    // Find auth user by old email first, then by expected email
    const oldEmail = `${match.nis}@sman19.sch.id`;
    const authUser = authByEmail.get(oldEmail.toLowerCase()) || authByEmail.get(expectedEmailLower);

    if (authUser && authUser.email.toLowerCase() !== expectedEmailLower) {
      emailUpdates.push({
        userId: authUser.id,
        oldEmail: authUser.email,
        newEmail: expectedEmail,
        nama: excel.nama,
      });
    }

    // Check profile NIS
    const profile = profileByEmail.get(oldEmail.toLowerCase()) || profileByEmail.get(expectedEmailLower);
    if (profile && profile.nis !== excel.nis) {
      profileUpdates.push({
        id: profile.id,
        oldNis: profile.nis,
        newNis: excel.nis,
        nama: excel.nama,
      });
    }
  }

  // Find DB students not in Excel
  const excelNameSet = new Set(excelStudents.map((e) => normalize(e.nama)));
  for (const s of dbSiswa) {
    if (!excelNameSet.has(normalize(s.nama))) {
      dbNotInExcel.push(s);
    }
  }

  // 4. Report
  console.log("=== COMPARISON REPORT ===\n");

  console.log(`Students in Excel: ${excelStudents.length}`);
  console.log(`Students in DB: ${dbSiswa.length}`);
  console.log(`Not found in DB: ${notFoundInDb.length}`);
  console.log(`In DB but not in Excel: ${dbNotInExcel.length}`);
  console.log(`NIS updates needed: ${nisUpdates.length}`);
  console.log(`Class updates needed: ${classUpdates.length}`);
  console.log(`Auth email updates needed: ${emailUpdates.length}`);
  console.log(`Profile NIS updates needed: ${profileUpdates.length}`);
  console.log(`Duplicate NIS in DB: ${duplicates.length}\n`);

  if (notFoundInDb.length > 0) {
    console.log("--- NOT FOUND IN DB ---");
    for (const s of notFoundInDb) {
      console.log(`  ${s.nama} (${s.nis}) - ${s.kelas}`);
    }
    console.log();
  }

  if (dbNotInExcel.length > 0) {
    console.log("--- IN DB BUT NOT IN EXCEL ---");
    for (const s of dbNotInExcel) {
      console.log(`  ${s.nama} (${s.nis}) - ${s.kelas} [id: ${s.id}]`);
    }
    console.log();
  }

  if (duplicates.length > 0) {
    console.log("--- DUPLICATE NIS IN DB ---");
    for (const d of duplicates) {
      console.log(`  NIS ${d.nis}:`);
      for (const e of d.entries) {
        console.log(`    - ${e.nama} (${e.kelas}) [id: ${e.id}]`);
      }
    }
    console.log();
  }

  if (nisUpdates.length > 0) {
    console.log("--- NIS UPDATES ---");
    for (const u of nisUpdates) {
      console.log(`  ${u.nama}: ${u.oldNis} → ${u.newNis}`);
    }
    console.log();
  }

  if (classUpdates.length > 0) {
    console.log("--- CLASS UPDATES ---");
    for (const u of classUpdates) {
      console.log(`  ${u.nama}: ${u.oldKelas} → ${u.newKelas}`);
    }
    console.log();
  }

  if (emailUpdates.length > 0) {
    console.log("--- AUTH EMAIL UPDATES ---");
    for (const u of emailUpdates) {
      console.log(`  ${u.nama}: ${u.oldEmail} → ${u.newEmail}`);
    }
    console.log();
  }

  if (profileUpdates.length > 0) {
    console.log("--- PROFILE NIS UPDATES ---");
    for (const u of profileUpdates) {
      console.log(`  ${u.nama}: ${u.oldNis} → ${u.newNis}`);
    }
    console.log();
  }

  // 5. Execute if --execute
  if (!execute) {
    console.log("=== DRY RUN — no changes made. Run with --execute to apply. ===");
    return;
  }

  console.log("\n=== EXECUTING UPDATES ===\n");

  // Phase 1: Set all NIS that need updating to a temporary value first
  // This resolves chain conflicts (A->B->C where B's NIS is A's target)
  console.log("--- Phase 1: Setting temporary NIS values ---\n");
  let tempSet = 0;
  for (const u of nisUpdates) {
    const tempNis = `TEMP_${u.newNis}`;
    const { error } = await supabase.from("siswa").update({ nis: tempNis }).eq("id", u.id);
    if (error) {
      console.error(`  FAILED temp NIS for ${u.nama}:`, JSON.stringify(error));
    } else {
      tempSet++;
    }
  }
  console.log(`Phase 1: ${tempSet}/${nisUpdates.length} temp NIS set\n`);

  // Phase 2: Set all NIS from temp to final values
  console.log("--- Phase 2: Setting final NIS values ---\n");
  let siswaUpdated = 0;
  for (const u of nisUpdates) {
    const tempNis = `TEMP_${u.newNis}`;
    const { error } = await supabase.from("siswa").update({ nis: u.newNis }).eq("id", u.id).eq("nis", tempNis);
    if (error) {
      console.error(`  FAILED siswa NIS update for ${u.nama}:`, JSON.stringify(error));
    } else {
      console.log(`  ✓ siswa NIS: ${u.nama} ${u.oldNis} → ${u.newNis}`);
      siswaUpdated++;
    }
  }
  console.log(`Phase 2: ${siswaUpdated}/${nisUpdates.length} siswa NIS updated\n`);

  // Update class in siswa table
  let classUpdated = 0;
  for (const u of classUpdates) {
    const { error } = await supabase.from("siswa").update({ kelas: u.newKelas }).eq("id", u.id);
    if (error) {
      console.error(`  FAILED siswa class update for ${u.nama}:`, JSON.stringify(error));
    } else {
      console.log(`  ✓ siswa class: ${u.nama} ${u.oldKelas} → ${u.newKelas}`);
      classUpdated++;
    }
  }

  // Update auth user emails
  let authUpdated = 0;
  for (const u of emailUpdates) {
    const { error } = await supabase.auth.admin.updateUserById(u.userId, {
      email: u.newEmail,
    });
    if (error) {
      console.error(`  FAILED auth email update for ${u.nama}:`, JSON.stringify(error));
    } else {
      console.log(`  ✓ auth email: ${u.nama} ${u.oldEmail} → ${u.newEmail}`);
      authUpdated++;
    }
  }

  // Update profile NIS (must run after siswa NIS is updated, due to FK)
  let profileUpdated = 0;
  for (const u of profileUpdates) {
    const { error } = await supabase.from("profiles").update({ nis: u.newNis }).eq("id", u.id);
    if (error) {
      console.error(`  FAILED profile NIS update for ${u.nama}:`, JSON.stringify(error));
    } else {
      console.log(`  ✓ profile NIS: ${u.nama} ${u.oldNis} → ${u.newNis}`);
      profileUpdated++;
    }
  }

  console.log(`\n=== DONE ===`);
  console.log(`siswa NIS updated: ${siswaUpdated}/${nisUpdates.length}`);
  console.log(`siswa class updated: ${classUpdated}/${classUpdates.length}`);
  console.log(`auth email updated: ${authUpdated}/${emailUpdates.length}`);
  console.log(`profile NIS updated: ${profileUpdated}/${profileUpdates.length}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
