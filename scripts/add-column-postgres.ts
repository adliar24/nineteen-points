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

console.log("Supabase URL:", env["VITE_SUPABASE_URL"]);
const sb = createClient(env["VITE_SUPABASE_URL"], env["VITE_SUPABASE_SERVICE_ROLE_KEY"]);

async function run() {
  const { data, error } = await sb.from("master_poin").select("*").limit(1);
  console.log("Columns currently returned by select *:", data ? Object.keys(data[0] || {}) : []);
}

run();
