import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const envLocal = fs.readFileSync(".env.local", "utf-8");
const env: Record<string, string> = {};
envLocal.split("\n").forEach((line) => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return;
  const [key, ...rest] = trimmed.split("=");
  if (key) env[key.trim()] = rest.join("=").trim();
});

const url = env["VITE_SUPABASE_URL"];
const key = env["VITE_SUPABASE_SERVICE_ROLE_KEY"];

async function main() {
  console.log("Applying face_embedding column to public.siswa & public.profiles...");
  
  const sqlQueries = [
    "ALTER TABLE public.siswa ADD COLUMN IF NOT EXISTS face_embedding TEXT;",
    "ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS face_embedding TEXT;"
  ];

  for (const query of sqlQueries) {
    const res = await fetch(`${url}/rest/v1/rpc/exec_sql`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": key,
        "Authorization": `Bearer ${key}`,
      },
      body: JSON.stringify({ query })
    });
    console.log("Query:", query);
    console.log("Status:", res.status);
    console.log("Response:", await res.text());
  }

  // Verify
  const sb = createClient(url, key);
  const { data, error } = await sb.from("siswa").select("id, nama, nis, foto_url, face_embedding").limit(1);
  if (error) {
    console.error("Verification failed:", error.message);
  } else {
    console.log("Verification SUCCESS! Column face_embedding is ready:", data);
  }
}

main().catch(console.error);
