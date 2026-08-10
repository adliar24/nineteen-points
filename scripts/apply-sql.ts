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
  console.log("Checking if allowed_guru_emails column or poin_akses_guru can be accessed...");
  const { data: pData, error: pErr } = await sb.from("master_poin").select("*").limit(5);
  console.log("Master poin sample:", pData);
}

main().catch(console.error);
