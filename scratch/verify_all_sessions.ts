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

async function verifyAllSessions() {
  console.log("=================================================");
  console.log("  SIMULATING SESSION & DASHBOARD NAME RESOLUTION ");
  console.log("=================================================");

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
  const profileById = new Map(profilesList.map((p) => [p.id, p]));

  let totalSiswaProfilesChecked = 0;
  let mismatchedDashboardNames: any[] = [];

  for (const u of authUsers) {
    const p = profileById.get(u.id);
    if (!p || p.role !== "siswa") continue;

    totalSiswaProfilesChecked++;
    const emailPrefix = (p.email || "").split("@")[0].toLowerCase().trim();

    // Match by NIS, profile.nis, or username
    let matchedSiswa = siswaByNis.get(emailPrefix);
    if (!matchedSiswa && p.nis) {
      matchedSiswa = siswaByNis.get(String(p.nis).trim().toLowerCase());
    }
    if (!matchedSiswa) {
      matchedSiswa = siswaByUsername.get(emailPrefix);
    }

    if (!matchedSiswa) {
      mismatchedDashboardNames.push({
        authId: u.id,
        email: p.email,
        profileNama: p.nama,
        profileNis: p.nis,
        reason: "Siswa row not found in public.siswa",
      });
    } else {
      const resolvedNameInDashboard = matchedSiswa.nama;
      const profileNameInDB = p.nama;

      if (resolvedNameInDashboard.trim().toLowerCase() !== profileNameInDB.trim().toLowerCase()) {
        mismatchedDashboardNames.push({
          authId: u.id,
          email: p.email,
          profileNamaInDB: profileNameInDB,
          dashboardResolvedNama: resolvedNameInDashboard,
          siswaNis: matchedSiswa.nis,
        });
      }
    }
  }

  console.log(`Checked ${totalSiswaProfilesChecked} student profiles in Supabase.`);
  console.log(`Total public.siswa: ${siswaList.length}`);
  console.log(`Mismatched Dashboard Names: ${mismatchedDashboardNames.length}`);

  if (mismatchedDashboardNames.length > 0) {
    console.log("Mismatches found:", JSON.stringify(mismatchedDashboardNames.slice(0, 10), null, 2));
  } else {
    console.log("🎉 PERFECT MATCH! 100% of student accounts will show their EXACT real name on their dashboard!");
  }
}

verifyAllSessions().catch(console.error);
