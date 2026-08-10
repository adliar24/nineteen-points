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

async function fixStaffRoles() {
  console.log("=== FIXING STAFF ROLES & TIARA SAKINAH ===");

  // 1. Sutana, Inah, Tahyar are staff/guru whose role was wrongly set to 'siswa'
  const staffEmails = ["sutana@sman19.sch.id", "inah@sman19.sch.id", "tahyar@sman19.sch.id"];
  for (const email of staffEmails) {
    console.log(`Setting role='guru' for ${email}`);
    await supabaseAdmin.from("profiles").update({ role: "guru" }).eq("email", email);
  }

  // 2. Check Tiara Sakinah Salsabila in public.siswa
  const { data: tiaraSiswa } = await supabaseAdmin.from("siswa").select("*").ilike("nama", "%TIARA SAKINAH%");
  console.log("Tiara in public.siswa:", tiaraSiswa);

  if (tiaraSiswa && tiaraSiswa.length > 0) {
    const realTiara = tiaraSiswa[0];
    const { data: { users } } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const tiaraAuth = users.find((u) => u.email === "tiarasakinah@sman19.sch.id");
    if (tiaraAuth) {
      console.log(`Updating Tiara Auth & Profile to NIS ${realTiara.nis}`);
      await supabaseAdmin.auth.admin.updateUserById(tiaraAuth.id, {
        email: `${realTiara.nis}@sman19.sch.id`,
        email_confirm: true,
        user_metadata: { role: "siswa", fullName: realTiara.nama, nis: realTiara.nis },
      });
      await supabaseAdmin.from("profiles").update({
        email: `${realTiara.nis}@sman19.sch.id`,
        nama: realTiara.nama,
        nis: realTiara.nis,
        role: "siswa",
      }).eq("id", tiaraAuth.id);
    }
  }
}

fixStaffRoles().catch(console.error);
