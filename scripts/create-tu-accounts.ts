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

const tuUsers = [
  { nama: "SALMAN HAPID, S.AB", username: "198403112014081002" },
  { nama: "SARIAH, S.Pd", username: "196907172025212009" },
  { nama: "RENI KURNIASIH, S.Pd", username: "198206242025212042" },
  { nama: "RACHMAT FITRIANTHO, SE.", username: "198606092025211102" },
  { nama: "SANTI SUSILAWATI, S.Pd", username: "198809302025212065" },
  { nama: "TENI SUTARSIH, A.Md.", username: "198108062025212045" },
  { nama: "VITA AULIYANTI NUR FADHILLAH.,S.Pd", username: "199511282025212071" },
  { nama: "AGUS GANI, S.Sos", username: "197708202025211034" },
  { nama: "IPAN SOPIANDI", username: "197904082025211035" },
  { nama: "DARYAT HIDAYAT", username: "198608222025211069" },
  { nama: "TAHYAR", username: "198402232025211049" },
  { nama: "INAH", username: "197407282025212014" },
  { nama: "YADI CAHYADI", username: "198608032025211103" },
  { nama: "SUTANA", username: "199009112025211072" },
  { nama: "ABRAHAM MARBUM", username: "198809102025211138" },
  { nama: "KURNIA SALEH", username: "197211152025211039" },
  { nama: "WIDI FEBRIYANTO", username: "widi_febriyanto" },
];

const PASSWORD = "tatausaha19*";

async function main() {
  console.log("=== Creating 17 Tata Usaha accounts ===\n");

  for (const u of tuUsers) {
    const email = u.username + "@sman19.sch.id";
    console.log(`${u.nama} (${email})`);

    // Check if already exists
    const { data: existing } = await sb.from("profiles").select("id").eq("email", email).limit(1);
    if (existing && existing.length > 0) {
      console.log("  SKIP (already exists)\n");
      continue;
    }

    // Create auth user via raw fetch (SDK admin.createUser has 500 bug)
    const r = await fetch(env.VITE_SUPABASE_URL + "/auth/v1/admin/users", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + env.VITE_SUPABASE_SERVICE_ROLE_KEY,
        "Content-Type": "application/json",
        apikey: env.VITE_SUPABASE_SERVICE_ROLE_KEY,
      },
      body: JSON.stringify({
        email,
        password: PASSWORD,
        email_confirm: true,
        user_metadata: { nama: u.nama, role: "tata_usaha" },
      }),
    });
    const data = await r.json();
    if (!r.ok || !data.id) {
      console.error("  FAIL auth:", data.msg || data.error || JSON.stringify(data), "\n");
      continue;
    }
    const userId: string = data.id;
    console.log("  ✓ auth created (id:", userId + ")");

    // Profile is auto-created by trigger, just update nama + role
    const { error: profErr } = await sb.from("profiles").update({
      nama: u.nama,
      role: "tata_usaha",
    }).eq("id", userId);
    if (profErr) console.error("  FAIL profile:", profErr.message);
    else console.log("  ✓ profile updated");

    await sleep(200);
    console.log();
  }

  console.log("=== DONE ===");
}

main().catch(console.error);
