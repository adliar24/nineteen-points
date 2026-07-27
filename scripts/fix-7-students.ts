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
const execute = process.argv.includes("--execute");

// Helper: create username from name (no spaces, lowercase, remove special chars)
function makeUsername(name: string): string {
  return name.replace(/[^a-zA-Z\s]/g, "").replace(/\s+/g, "").toLowerCase();
}

interface FixPlan {
  nama: string;
  siswaId: string;
  currentSiswaNis: string;
  newNis: string;
  profileId: string;
  currentProfileEmail: string;
  newEmail: string;
  kelas: string;
  isGhost: boolean; // true = already in siswa, false = needs full insert
}

// The 4 ghost students (already in siswa with HOLDER_ NIS, have profiles with wrong email, no auth user)
const ghostStudents = [
  { nama: "ALYA ZAHRA FATIHA", siswaId: "f4c209ac-3550-4db8-bd89-29cd3290de53", currentNis: "HOLDER_262710265", profileId: "03d4199f-e7b4-41b5-90b7-1c86148a1611", currentEmail: "262710265@sman19.sch.id", kelas: "X-G" },
  { nama: "ARIZKA AMALYA SYAHIDA", siswaId: "92dfe78a-05f5-45c5-b633-48fa8ac91220", currentNis: "HOLDER_262710266", profileId: "f5bf6ad6-2311-4644-a0d7-cfc28f9b19d9", currentEmail: "262710266@sman19.sch.id", kelas: "X-G" },
  { nama: "MORENO DWI HARYADI", siswaId: "6087cb41-3695-4484-b682-9690e760b3a4", currentNis: "HOLDER_262710373", profileId: "f0ed31c3-8ff8-4a1b-981d-5183cea39a25", currentEmail: "262710373@sman19.sch.id", kelas: "X-I" },
  { nama: "ALIZA FARAH AZ- ZAHRA", siswaId: "1831bf3f-150e-4576-97ef-2a44ece1ad12", currentNis: "HOLDER_262710399", profileId: "98781bd6-cae7-44b8-b13b-9689d9db6882", currentEmail: "262710399@sman19.sch.id", kelas: "X-J" },
];

// The 3 missing students (need full insert)
const missingStudents = [
  { nama: "NIKKY SYAHWAL BADAR", nis: "262710206", kelas: "X-E" },
  { nama: "AJENG YULIA RAMADHANI", nis: "262710396", kelas: "X-J" },
  { nama: "ZANETA WALUYA PUTRI", nis: "262710435", kelas: "X-J" },
];

// Correct students whose profiles need nis fixed (profile.nis=null, email=correct)
const correctStudentsToFix = [
  { nama: "ADINDA NURUL FATIMAH", profileId: "2214b622-21ad-4002-85c1-96c8750dd58a", nis: "262710265" },
  { nama: "ALDA RAINA SETIAWAN", profileId: "ecc16812-cc31-4927-aad4-56a28bebe81b", nis: "262710266" },
  { nama: "MUHAMMAD RIZKY AZRIAN", profileId: "937eba01-9790-4971-8931-4675a2a10a90", nis: "262710373" },
  { nama: "ASHVIN NU`MAN AWALUDIN", profileId: "09f8b0f8-89b0-4614-9a21-df56e1d8dd5a", nis: "262710399" },
];

async function main() {
  console.log("=== FIX GHOST STUDENTS + ADD MISSING STUDENTS ===\n");

  // New NIS for ghost students (starting after highest current NIS)
  const newNisBase = 262710480;

  // ===== PHASE 1: Fix 4 ghost students =====
  console.log("--- PHASE 1: Fix 4 ghost students (assign new NIS + name-based username) ---\n");

  for (let i = 0; i < ghostStudents.length; i++) {
    const g = ghostStudents[i];
    const newNis = String(newNisBase + i);
    const newEmail = makeUsername(g.nama) + "@sman19.sch.id";

    console.log(`Processing: ${g.nama}`);
    console.log(`  siswa: ${g.currentNis} → ${newNis}`);
    console.log(`  email: ${g.currentEmail} → ${newEmail}`);

    if (!execute) {
      console.log("  [DRY RUN]\n");
      continue;
    }

    // Step 1: Null profile.nis for all profiles referencing the current email (FK constraint)
    const { data: profiles } = await sb.from("profiles").select("id").eq("email", g.currentEmail);
    for (const p of profiles || []) {
      await sb.from("profiles").update({ nis: null }).eq("id", p.id);
    }

    // Step 2: Update siswa NIS from HOLDER_xxx to new NIS
    const { error: siswaErr } = await sb.from("siswa").update({ nis: newNis }).eq("id", g.siswaId);
    if (siswaErr) console.error(`  FAIL siswa: ${siswaErr.message}`);
    else console.log(`  ✓ siswa NIS → ${newNis}`);

    // Step 3: Update profile email and NIS
    const { error: profErr } = await sb.from("profiles").update({ email: newEmail, nis: newNis }).eq("id", g.profileId);
    if (profErr) console.error(`  FAIL profile: ${profErr.message}`);
    else console.log(`  ✓ profile email → ${newEmail}, nis → ${newNis}`);

    // Step 4: Create auth user with name-based email
    // First check if auth user exists for this profile ID
    const { data: users } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 }) as any;
    const existingAuth = users?.users?.find((u: any) => u.id === g.profileId);

    if (existingAuth) {
      // Update existing auth user email (use TEMP_ to avoid conflict)
      const tempEmail = "TEMP_" + newEmail;
      const { error: e1 } = await sb.auth.admin.updateUserById(g.profileId, { email: tempEmail });
      if (e1) console.error(`  FAIL auth TEMP: ${e1.message}`);
      else {
        await sleep(200);
        const { error: e2 } = await sb.auth.admin.updateUserById(g.profileId, { email: newEmail });
        if (e2) console.error(`  FAIL auth final: ${e2.message}`);
        else console.log(`  ✓ auth email → ${newEmail}`);
      }
    } else {
      // Create new auth user
      const username = makeUsername(g.nama);
      const { data: authData, error: authErr } = await sb.auth.admin.createUser({
        email: newEmail,
        email_confirm: true,
        password: "siswa19*",
        user_metadata: { nama: g.nama, role: "siswa" },
      });
      if (authErr) console.error(`  FAIL create auth: ${authErr.message}`);
      else {
        console.log(`  ✓ auth created: ${newEmail} (id: ${authData.user.id})`);
        // Update profile to match new auth user id
        await sb.from("profiles").update({ id: authData.user.id }).eq("id", g.profileId);
        // Also need to update siswa to match
        // Actually, the profile ID should match auth user ID. If we created a new auth user,
        // the profile ID (which is the old one) won't match. We need to handle this.
        // Delete old profile and create new one with correct auth user ID
        await sb.from("profiles").delete().eq("id", g.profileId);
        await sb.from("profiles").insert({
          id: authData.user.id,
          email: newEmail,
          nama: g.nama,
          role: "siswa",
          nis: newNis,
        });
        console.log(`  ✓ profile recreated with auth id`);
      }
    }

    await sleep(200);
    console.log();
  }

  // ===== PHASE 2: Fix correct students' profiles =====
  console.log("\n--- PHASE 2: Fix correct students' profiles (set nis) ---\n");

  for (const c of correctStudentsToFix) {
    if (!execute) {
      console.log(`${c.nama}: profile ${c.profileId} → nis ${c.nis} [DRY RUN]`);
      continue;
    }

    const { error } = await sb.from("profiles").update({ nis: c.nis }).eq("id", c.profileId);
    if (error) console.error(`  FAIL ${c.nama}: ${error.message}`);
    else console.log(`  ✓ ${c.nama}: profile nis → ${c.nis}`);
  }

  // ===== PHASE 3: Insert 3 missing students =====
  console.log("\n--- PHASE 3: Insert 3 missing students ---\n");

  for (const m of missingStudents) {
    const username = makeUsername(m.nama);
    const email = username + "@sman19.sch.id";

    console.log(`Inserting: ${m.nama} (NIS: ${m.nis}, Kelas: ${m.kelas})`);
    console.log(`  email: ${email}`);

    if (!execute) {
      console.log("  [DRY RUN]\n");
      continue;
    }

    // Check if NIS is already taken in siswa
    const { data: existing } = await sb.from("siswa").select("id,nama").eq("nis", m.nis);
    if (existing && existing.length > 0) {
      console.log(`  ⚠ NIS ${m.nis} already taken by ${existing[0].nama}, skipping siswa insert`);
    } else {
      // Create siswa record
      const { data: newSiswa, error: siswaErr } = await sb.from("siswa").insert({
        nis: m.nis,
        nama: m.nama,
        kelas: m.kelas,
        total_poin: 0,
      }).select("id");
      if (siswaErr) console.error(`  FAIL siswa: ${siswaErr.message}`);
      else {
        console.log(`  ✓ siswa created (id: ${newSiswa?.[0]?.id})`);
      }
    }

    // Create auth user
    const { data: authData, error: authErr } = await sb.auth.admin.createUser({
      email: email,
      email_confirm: true,
      password: "siswa19*",
      user_metadata: { nama: m.nama, role: "siswa" },
    });
    if (authErr) {
      console.error(`  FAIL auth: ${authErr.message}`);
    } else {
      console.log(`  ✓ auth created: ${email} (id: ${authData.user.id})`);

      // Create profile
      const { error: profErr } = await sb.from("profiles").insert({
        id: authData.user.id,
        email: email,
        nama: m.nama,
        role: "siswa",
        nis: m.nis,
      });
      if (profErr) console.error(`  FAIL profile: ${profErr.message}`);
      else console.log(`  ✓ profile created`);
    }

    await sleep(200);
    console.log();
  }

  console.log("\n=== DONE ===");
}

main().catch(console.error);
