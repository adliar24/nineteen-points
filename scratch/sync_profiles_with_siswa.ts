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

async function fetchAllRows(tableName: string, select = "*") {
  let all: any[] = [];
  let from = 0;
  const step = 1000;
  while (true) {
    const { data, error } = await supabaseAdmin.from(tableName).select(select).range(from, from + step - 1);
    if (error || !data || data.length === 0) break;
    all.push(...data);
    if (data.length < step) break;
    from += step;
  }
  return all;
}

async function syncProfilesWithSiswa() {
  console.log("=== SYNCING PUBLIC.PROFILES AND AUTH.USERS WITH PUBLIC.SISWA ===");

  const siswaList = await fetchAllRows("siswa");
  const profilesList = await fetchAllRows("profiles");

  let authUsers: any[] = [];
  let page = 1;
  while (true) {
    const { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error || !users || users.length === 0) break;
    authUsers.push(...users);
    if (users.length < 1000) break;
    page++;
  }

  const siswaByNis = new Map(siswaList.map((s) => [String(s.nis).trim().toLowerCase(), s]));
  const siswaByUsername = new Map(siswaList.filter((s) => s.username).map((s) => [s.username.trim().toLowerCase(), s]));

  let updatedProfilesCount = 0;
  let updatedAuthUsersCount = 0;

  const chunkSize = 25;
  for (let i = 0; i < profilesList.length; i += chunkSize) {
    const chunk = profilesList.slice(i, i + chunkSize);

    await Promise.all(
      chunk.map(async (p) => {
        if (p.role !== "siswa") return;

        const emailPrefix = (p.email || "").split("@")[0].toLowerCase().trim();
        let sMatch = siswaByNis.get(emailPrefix);
        if (!sMatch && p.nis) {
          sMatch = siswaByNis.get(String(p.nis).trim().toLowerCase());
        }
        if (!sMatch) {
          sMatch = siswaByUsername.get(emailPrefix);
        }

        if (sMatch) {
          const targetNama = sMatch.nama;
          const targetNis = String(sMatch.nis).trim();
          const targetEmail = `${targetNis}@sman19.sch.id`.toLowerCase();

          if (p.nama !== targetNama || String(p.nis).trim() !== targetNis || p.email?.toLowerCase().trim() !== targetEmail) {
            // Update profiles
            await supabaseAdmin.from("profiles").update({
              nama: targetNama,
              nis: targetNis,
              email: targetEmail,
            }).eq("id", p.id);
            updatedProfilesCount++;

            // Update auth user metadata
            const authUser = authUsers.find((u) => u.id === p.id);
            if (authUser) {
              await supabaseAdmin.auth.admin.updateUserById(authUser.id, {
                email: targetEmail,
                password: "murid19*",
                email_confirm: true,
                user_metadata: { role: "siswa", fullName: targetNama, nis: targetNis },
              });
              updatedAuthUsersCount++;
            }
          }
        }
      })
    );
  }

  console.log(`Synced ${updatedProfilesCount} profiles and ${updatedAuthUsersCount} auth users to match public.siswa 100%!`);
}

syncProfilesWithSiswa().catch(console.error);
