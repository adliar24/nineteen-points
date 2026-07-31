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

function normalizeName(s: string): string {
  return (s || "")
    .toUpperCase()
    .trim()
    .replace(/[\u00A0\u200B\u200C\u200D\uFEFF\u00AD]/g, "")
    .replace(/\s+/g, " ");
}

async function main() {
  console.log("=== FIXING ALL STUDENT ACCOUNTS AND PROFILES ===\n");

  // 1. Fetch all siswa
  const dbSiswa: any[] = [];
  let from = 0;
  while (true) {
    const { data } = await sb.from("siswa").select("*").range(from, from + 999);
    if (!data || data.length === 0) break;
    dbSiswa.push(...data);
    if (data.length < 1000) break;
    from += 1000;
  }
  console.log(`Total siswa in DB: ${dbSiswa.length}`);

  // 2. Fetch all profiles
  from = 0;
  const dbProfiles: any[] = [];
  while (true) {
    const { data } = await sb.from("profiles").select("*").range(from, from + 999);
    if (!data || data.length === 0) break;
    dbProfiles.push(...data);
    if (data.length < 1000) break;
    from += 1000;
  }
  console.log(`Total profiles in DB: ${dbProfiles.length}`);

  // 3. Fetch all auth users
  let page = 1;
  const authUsers: any[] = [];
  while (true) {
    const { data } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
    if (!data.users || data.users.length === 0) break;
    authUsers.push(...data.users);
    if (data.users.length < 1000) break;
    page++;
  }
  console.log(`Total auth users in DB: ${authUsers.length}\n`);

  // Build lookup maps
  const profileById = new Map<string, any>();
  const profileByEmail = new Map<string, any>();
  const profileByName = new Map<string, any>();

  dbProfiles.forEach((p) => {
    profileById.set(p.id, p);
    if (p.email) profileByEmail.set(p.email.toLowerCase().trim(), p);
    if (p.nama) profileByName.set(normalizeName(p.nama), p);
  });

  const authById = new Map<string, any>();
  const authByEmail = new Map<string, any>();

  authUsers.forEach((u) => {
    authById.set(u.id, u);
    if (u.email) authByEmail.set(u.email.toLowerCase().trim(), u);
  });

  let fixedCount = 0;
  let createdCount = 0;

  for (const s of dbSiswa) {
    const targetNis = String(s.nis).trim();
    const targetEmail = `${targetNis}@sman19.sch.id`.toLowerCase();
    const targetName = s.nama.trim();

    // 1. Check if auth user exists for targetEmail
    let authUser = authByEmail.get(targetEmail);

    // 2. If not found by targetEmail, check if auth user exists by name in profiles
    if (!authUser) {
      const profByName = profileByName.get(normalizeName(targetName));
      if (profByName) {
        authUser = authById.get(profByName.id);
      }
    }

    // 3. If still not found, check if auth user metadata matches targetName or targetNis
    if (!authUser) {
      authUser = authUsers.find((u) => {
        const metaName = normalizeName(u.user_metadata?.fullName || "");
        const metaNis = String(u.user_metadata?.nis || "").trim();
        return metaName === normalizeName(targetName) || metaNis === targetNis;
      });
    }

    if (authUser) {
      // Fix auth user email if it doesn't match targetEmail
      if (authUser.email.toLowerCase().trim() !== targetEmail) {
        console.log(`[FIX AUTH] ${targetName}: ${authUser.email} → ${targetEmail}`);
        const { error: authErr } = await sb.auth.admin.updateUserById(authUser.id, {
          email: targetEmail,
          user_metadata: {
            fullName: targetName,
            role: "siswa",
            nis: targetNis,
          },
        });
        if (authErr) {
          console.error(`  Error updating auth email for ${targetName}:`, authErr.message);
        }
      } else {
        // Update metadata to ensure consistency
        await sb.auth.admin.updateUserById(authUser.id, {
          user_metadata: {
            fullName: targetName,
            role: "siswa",
            nis: targetNis,
          },
        });
      }

      // Fix profile row for authUser.id
      const currentProf = profileById.get(authUser.id);
      if (currentProf) {
        if (
          currentProf.email.toLowerCase().trim() !== targetEmail ||
          normalizeName(currentProf.nama) !== normalizeName(targetName) ||
          String(currentProf.nis).trim() !== targetNis
        ) {
          console.log(`[FIX PROFILE] ${targetName} (${authUser.id}): nama="${targetName}", email="${targetEmail}", nis="${targetNis}"`);
          const { error: profErr } = await sb
            .from("profiles")
            .update({
              email: targetEmail,
              nama: targetName,
              nis: targetNis,
              role: "siswa",
            })
            .eq("id", authUser.id);

          if (profErr) {
            console.error(`  Error updating profile for ${targetName}:`, profErr.message);
          }
        }
      } else {
        // Insert missing profile row
        console.log(`[CREATE PROFILE] ${targetName} (${authUser.id})`);
        await sb.from("profiles").insert({
          id: authUser.id,
          email: targetEmail,
          nama: targetName,
          role: "siswa",
          nis: targetNis,
          foto_url: s.foto_url || null,
        });
      }

      fixedCount++;
    } else {
      // User doesn't exist in Auth at all — create new Auth User & Profile
      console.log(`[CREATE AUTH] ${targetName} (${targetNis}): ${targetEmail}`);
      const { data: newAuth, error: createErr } = await sb.auth.admin.createUser({
        email: targetEmail,
        password: "murid19*",
        email_confirm: true,
        user_metadata: {
          fullName: targetName,
          role: "siswa",
          nis: targetNis,
        },
      });

      if (createErr) {
        console.error(`  Error creating auth user for ${targetName}:`, createErr.message);
      } else if (newAuth?.user) {
        const { error: pErr } = await sb.from("profiles").upsert({
          id: newAuth.user.id,
          email: targetEmail,
          nama: targetName,
          role: "siswa",
          nis: targetNis,
          foto_url: s.foto_url || null,
        });
        if (pErr) console.error(`  Error upserting profile for ${targetName}:`, pErr.message);
        createdCount++;
      }
    }
  }

  console.log(`\n=== REPAIR COMPLETE ===`);
  console.log(`Checked & Fixed existing accounts: ${fixedCount}`);
  console.log(`Newly created missing accounts: ${createdCount}`);
}

main().catch(console.error);
