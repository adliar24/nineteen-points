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

async function fixDarra() {
  // 1. Delete duplicate old row in public.siswa where nis = 'darraanugrah'
  await supabaseAdmin.from("siswa").delete().eq("nis", "darraanugrah");
  console.log("Deleted duplicate old siswa row for Darra");

  // 2. Update auth user & profile to 262710271@sman19.sch.id
  let page = 1;
  let authUsers: any[] = [];
  while (true) {
    const { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error || !users || users.length === 0) break;
    authUsers.push(...users);
    if (users.length < 1000) break;
    page++;
  }

  const darraAuth = authUsers.find((u) => u.email?.includes("darra"));
  if (darraAuth) {
    console.log("Updating Darra Auth ID:", darraAuth.id);
    await supabaseAdmin.auth.admin.updateUserById(darraAuth.id, {
      email: "262710271@sman19.sch.id",
      email_confirm: true,
      user_metadata: { role: "siswa", fullName: "DARRA ANUGRAH", nis: "262710271" },
    });
    await supabaseAdmin.from("profiles").upsert({
      id: darraAuth.id,
      email: "262710271@sman19.sch.id",
      nama: "DARRA ANUGRAH",
      nis: "262710271",
      role: "siswa",
    });
    console.log("Darra updated successfully!");
  }
}

fixDarra().catch(console.error);
