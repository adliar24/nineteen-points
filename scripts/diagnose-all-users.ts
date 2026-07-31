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
  console.log("=== DIAGNOSING ALL USERS, PROFILES, AND SISWA ===\n");

  // Fetch all siswa
  const siswaMapByNis = new Map<string, any>();
  const siswaMapByName = new Map<string, any>();
  let from = 0;
  while (true) {
    const { data } = await sb.from("siswa").select("*").range(from, from + 999);
    if (!data || data.length === 0) break;
    data.forEach((s) => {
      siswaMapByNis.set(String(s.nis).trim(), s);
      siswaMapByName.set(s.nama.trim().toUpperCase(), s);
    });
    if (data.length < 1000) break;
    from += 1000;
  }
  console.log(`Total siswa in DB: ${siswaMapByNis.size}`);

  // Fetch all profiles
  from = 0;
  const profiles: any[] = [];
  while (true) {
    const { data } = await sb.from("profiles").select("*").range(from, from + 999);
    if (!data || data.length === 0) break;
    profiles.push(...data);
    if (data.length < 1000) break;
    from += 1000;
  }
  console.log(`Total profiles in DB: ${profiles.length}`);

  // Fetch all auth users
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

  const authById = new Map<string, any>();
  authUsers.forEach((u) => authById.set(u.id, u));

  let mismatchedCount = 0;
  const issues: string[] = [];

  for (const p of profiles) {
    if (p.role === "siswa") {
      const emailNis = p.email ? p.email.split("@")[0].trim() : "";
      const profileNis = p.nis ? String(p.nis).trim() : "";
      const profileName = p.nama ? p.nama.trim().toUpperCase() : "";

      const expectedSiswa = siswaMapByNis.get(emailNis) || siswaMapByNis.get(profileNis) || siswaMapByName.get(profileName);

      if (expectedSiswa) {
        const nameMatch = profileName === expectedSiswa.nama.trim().toUpperCase();
        const nisMatch = emailNis === expectedSiswa.nis || profileNis === expectedSiswa.nis;

        if (!nameMatch || !nisMatch || emailNis !== expectedSiswa.nis || profileNis !== expectedSiswa.nis) {
          mismatchedCount++;
          issues.push(
            `[MISMATCH] Profile ID: ${p.id}\n  Profile Email: ${p.email} | Profile Name: ${p.nama} | Profile NIS: ${p.nis}\n  Expected Siswa: NIS=${expectedSiswa.nis} | Nama=${expectedSiswa.nama}\n`
          );
        }
      } else {
        issues.push(`[NO SISWA RECORD] Profile Email: ${p.email} | Name: ${p.nama} | NIS: ${p.nis}`);
      }
    }
  }

  console.log(`=== FOUND ${mismatchedCount} MISMATCHED STUDENT PROFILES ===\n`);
  issues.slice(0, 30).forEach((issue) => console.log(issue));
  if (issues.length > 30) {
    console.log(`... and ${issues.length - 30} more issues.`);
  }
}

main().catch(console.error);
