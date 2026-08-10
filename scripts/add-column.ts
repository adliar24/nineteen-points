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
  console.log("Attempting to add allowed_guru_emails column via SQL endpoint...");
  
  // Try calling rpc or raw query if postgres function exists
  const res = await fetch(`${env["VITE_SUPABASE_URL"]}/rest/v1/rpc/exec_sql`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": env["VITE_SUPABASE_SERVICE_ROLE_KEY"],
      "Authorization": `Bearer ${env["VITE_SUPABASE_SERVICE_ROLE_KEY"]}`,
    },
    body: JSON.stringify({
      query: "ALTER TABLE public.master_poin ADD COLUMN IF NOT EXISTS allowed_guru_emails TEXT[];"
    })
  });

  console.log("RPC Status:", res.status);
  const text = await res.text();
  console.log("RPC Response:", text);
}

main().catch(console.error);
