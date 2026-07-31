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
  console.log("=== FIXING SPECIFIC STOLEN / MISMATCHED PROFILES ===\n");

  // 1. Temporary rename stolen emails to temp_ to avoid email unique constraint collision
  const stolenEmailMap: Record<string, string> = {
    "2214b622-21ad-4002-85c1-96c8750dd58a": "262710263@sman19.sch.id", // ADINDA NURUL FATIMAH (stole 262710263)
    "ecc16812-cc31-4927-aad4-56a28bebe81b": "262710264@sman19.sch.id", // ALDA RAINA SETIAWAN (stole 262710264)
    "781044b6-e0e7-4587-8e8f-e254a60d79bf": "262710272@sman19.sch.id", // DARRA ANUGRAH (stole 262710272)
    "d1ef2ea7-a60d-4be3-b0a9-7046bc1a2615": "262710273@sman19.sch.id", // DENDI NABIL FRIZZI (stole 262710273)
  };

  for (const [id, stolenEmail] of Object.entries(stolenEmailMap)) {
    const tempEmail = `temp_${Date.now()}_${stolenEmail}`;
    console.log(`Setting temp email for ID ${id}: ${stolenEmail} → ${tempEmail}`);
    await sb.auth.admin.updateUserById(id, { email: tempEmail });
    await sb.from("profiles").update({ email: tempEmail, nis: null }).eq("id", id);
  }

  // 2. Fetch all siswa to match correctly
  let from = 0;
  const dbSiswa: any[] = [];
  while (true) {
    const { data } = await sb.from("siswa").select("*").range(from, from + 999);
    if (!data || data.length === 0) break;
    dbSiswa.push(...data);
    if (data.length < 1000) break;
    from += 1000;
  }

  const siswaByName = new Map<string, any>();
  const siswaByNis = new Map<string, any>();
  dbSiswa.forEach((s) => {
    siswaByName.set(normalizeName(s.nama), s);
    siswaByNis.set(String(s.nis).trim(), s);
  });

  // 3. Fetch all profiles
  from = 0;
  const dbProfiles: any[] = [];
  while (true) {
    const { data } = await sb.from("profiles").select("*").range(from, from + 999);
    if (!data || data.length === 0) break;
    dbProfiles.push(...data);
    if (data.length < 1000) break;
    from += 1000;
  }

  // Fix each profile based on profile.nama matching siswa.nama
  for (const p of dbProfiles) {
    if (p.role !== "siswa") continue;

    const normName = normalizeName(p.nama);
    const matchingSiswa = siswaByName.get(normName);

    if (matchingSiswa) {
      const correctNis = String(matchingSiswa.nis).trim();
      const correctEmail = `${correctNis}@sman19.sch.id`.toLowerCase();

      if (p.email.toLowerCase().trim() !== correctEmail || String(p.nis).trim() !== correctNis) {
        console.log(`Fixing profile for ${matchingSiswa.nama}: email=${correctEmail}, nis=${correctNis}`);

        // Update auth user
        await sb.auth.admin.updateUserById(p.id, {
          email: correctEmail,
          user_metadata: {
            fullName: matchingSiswa.nama,
            role: "siswa",
            nis: correctNis,
          },
        });

        // Update profile table
        await sb
          .from("profiles")
          .update({
            email: correctEmail,
            nama: matchingSiswa.nama,
            nis: correctNis,
            role: "siswa",
          })
          .eq("id", p.id);
      }
    }
  }

  console.log("\n=== SPECIFIC STOLEN PROFILES FIXED ===");
}

main().catch(console.error);
