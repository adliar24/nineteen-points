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
  // 1. Check 4 ghost students
  console.log("=== 4 GHOST STUDENTS ===\n");
  const ghostNames = [
    "ALYA ZAHRA FATIHA",
    "ARIZKA AMALYA SYAHIDA",
    "MORENO DWI HARYADI",
    "ALIZA FARAH AZ- ZAHRA", // Note space in name
  ];
  for (const name of ghostNames) {
    const { data: s } = await sb.from("siswa").select("id,nis,nama,kelas").eq("nama", name);
    const { data: p } = await sb.from("profiles").select("id,nis,email,role,nama").eq("nama", name);
    console.log(`${name}:`);
    console.log("  siswa:", JSON.stringify(s?.[0] || "NOT FOUND"));
    console.log("  profile:", JSON.stringify(p?.[0] || "NOT FOUND"));

    // Check auth user
    if (s?.[0]) {
      const { data: authUsers } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const authUser = authUsers?.users.find((u) => u.id === s[0].id);
      console.log("  auth user:", authUser ? `${authUser.email}` : "NOT FOUND");
    }
    console.log();
  }

  // 2. Check profiles with stolen NIS emails
  console.log("=== PROFILES WITH STOLEN NIS EMAILS ===\n");
  const emails = ["262710265@sman19.sch.id", "262710266@sman19.sch.id", "262710373@sman19.sch.id", "262710399@sman19.sch.id"];
  for (const email of emails) {
    const { data: p } = await sb.from("profiles").select("id,nis,email,role,nama").eq("email", email);
    const nis = email.split("@")[0];
    const { data: s } = await sb.from("siswa").select("id,nis,nama").eq("nis", nis);
    console.log(`${email}:`);
    console.log("  profile(s):", JSON.stringify(p || []));
    console.log("  siswa (correct owner):", JSON.stringify(s?.[0] || "NOT FOUND"));
    console.log();
  }

  // 3. Check highest NIS
  const { data: topNis } = await sb.from("siswa").select("nis").gte("nis", "262710000").order("nis", { ascending: false }).limit(5);
  console.log("=== HIGHEST NIS VALUES ===");
  console.log(topNis?.map((r) => r.nis));
}

main().catch(console.error);
