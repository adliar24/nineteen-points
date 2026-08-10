import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";

const envLines = fs.readFileSync(".env.local", "utf-8").split("\n");
const envConfig: Record<string, string> = {};
for (const line of envLines) {
  const parts = line.trim().split("=");
  if (parts.length >= 2) {
    envConfig[parts[0].trim()] = parts.slice(1).join("=").trim();
  }
}

const supabaseAdmin = createClient(envConfig.VITE_SUPABASE_URL, envConfig.VITE_SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function verifySilviaAndZaid() {
  console.log("=== CHECKING SILVIA ANGGITA AND ZAID FATTAH ACCOUNTS ===");

  // 1. Check public.siswa for Silvia & Zaid
  const { data: silviaSiswa } = await supabaseAdmin.from("siswa").select("*").ilike("nama", "%SILVIA ANGGITA%");
  const { data: zaidSiswa } = await supabaseAdmin.from("siswa").select("*").ilike("nama", "%ZAID FATTAH%");

  console.log(`\n📌 public.siswa rows for Silvia (${silviaSiswa?.length}):`, silviaSiswa);
  console.log(`📌 public.siswa rows for Zaid (${zaidSiswa?.length}):`, zaidSiswa);

  // 2. Check auth.users
  let authUsers: any[] = [];
  let page = 1;
  while (true) {
    const { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error || !users || users.length === 0) break;
    authUsers.push(...users);
    if (users.length < 1000) break;
    page++;
  }

  const silviaAuth = authUsers.filter((u) => u.email?.includes("242510320") || u.user_metadata?.fullName?.includes("SILVIA ANGGITA"));
  const zaidAuth = authUsers.filter((u) => u.email?.includes("252610185") || u.user_metadata?.fullName?.includes("ZAID FATTAH"));

  console.log(`\n📌 auth.users accounts for Silvia (${silviaAuth.length}):`, silviaAuth.map(u => ({ id: u.id, email: u.email, meta: u.user_metadata })));
  console.log(`📌 auth.users accounts for Zaid (${zaidAuth.length}):`, zaidAuth.map(u => ({ id: u.id, email: u.email, meta: u.user_metadata })));

  // 3. Check public.profiles
  const { data: silviaProfiles } = await supabaseAdmin.from("profiles").select("*").ilike("nama", "%SILVIA ANGGITA%");
  const { data: zaidProfiles } = await supabaseAdmin.from("profiles").select("*").ilike("nama", "%ZAID FATTAH%");

  console.log(`\n📌 public.profiles rows for Silvia (${silviaProfiles?.length}):`, silviaProfiles);
  console.log(`📌 public.profiles rows for Zaid (${zaidProfiles?.length}):`, zaidProfiles);
}

verifySilviaAndZaid().catch(console.error);
