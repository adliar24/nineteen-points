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

async function deepCheck() {
  const siswaList = await fetchAllRows("siswa", "id, nis, nama, kelas, username");
  const profilesList = await fetchAllRows("profiles", "id, email, role, nama, nis");

  let authUsers: any[] = [];
  let page = 1;
  while (true) {
    const { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error || !users || users.length === 0) break;
    authUsers.push(...users);
    if (users.length < 1000) break;
    page++;
  }

  const authByEmail = new Map(authUsers.map((u) => [u.email?.toLowerCase().trim(), u]));

  let countNisEmail = 0;
  let countUsernameEmail = 0;
  let countOtherEmail = 0;

  const siswaAuthFormatMismatch: any[] = [];
  const siswaCannotLoginWithResolvedNis: any[] = [];

  for (const s of siswaList) {
    const nisEmail = `${String(s.nis).trim()}@sman19.sch.id`.toLowerCase();
    const usernameEmail = s.username ? `${s.username.trim()}@sman19.sch.id`.toLowerCase() : null;

    const authByNis = authByEmail.get(nisEmail);
    const authByUsername = usernameEmail ? authByEmail.get(usernameEmail) : null;

    if (authByNis) countNisEmail++;
    if (authByUsername) countUsernameEmail++;
    if (!authByNis && !authByUsername) countOtherEmail++;

    // What if resolve_login gives nisEmail, BUT auth.users ONLY has usernameEmail?
    if (!authByNis && authByUsername) {
      siswaCannotLoginWithResolvedNis.push({
        nama: s.nama,
        nis: s.nis,
        username: s.username,
        expectedNisEmail: nisEmail,
        actualAuthEmail: usernameEmail,
      });
    }
  }

  console.log("=== EMAIL FORMAT IN AUTH.USERS FOR SISWA ===");
  console.log(`Siswa with auth email = NIS@sman19.sch.id: ${countNisEmail}`);
  console.log(`Siswa with auth email = USERNAME@sman19.sch.id: ${countUsernameEmail}`);
  console.log(`Siswa with NO auth email matching NIS or Username: ${countOtherEmail}`);
  console.log(`\nCRITICAL BUG FOUND: Siswa where resolve_login resolves to NIS@sman19.sch.id, but auth.users ONLY has USERNAME@sman19.sch.id: ${siswaCannotLoginWithResolvedNis.length}`);
  
  if (siswaCannotLoginWithResolvedNis.length > 0) {
    console.log("Sample siswa blocked by email format mismatch:", JSON.stringify(siswaCannotLoginWithResolvedNis.slice(0, 15), null, 2));
  }

  // Check profiles table: check if profiles.email vs auth.users.email mismatch or profiles.id mismatch
  console.log("\n=== CHECKING PROFILES VS AUTH.USERS LINKING ===");
  let profilesWrongEmail: any[] = [];
  for (const p of profilesList) {
    const authUser = authUsers.find((u) => u.id === p.id);
    if (authUser && authUser.email?.toLowerCase().trim() !== p.email?.toLowerCase().trim()) {
      profilesWrongEmail.push({
        profileId: p.id,
        profileEmail: p.email,
        authEmail: authUser.email,
        profileNama: p.nama,
      });
    }
  }
  console.log(`Profiles where profile.email != auth.users.email: ${profilesWrongEmail.length}`);

  // Check "Wrong Person" - Profiles assigned to wrong student NIS or name
  console.log("\n=== DETAILED ANALYSIS OF 'WRONG PERSON' LOGINS ===");
  // Let's check profiles where role='siswa' and profile.nama or profile.nis differs from public.siswa for that email prefix
  const profileSiswaList = profilesList.filter((p) => p.role === "siswa");
  const siswaByNis = new Map(siswaList.map((s) => [String(s.nis).trim(), s]));
  const siswaByUsername = new Map(siswaList.filter((s) => s.username).map((s) => [s.username.trim().toLowerCase(), s]));

  const wrongPersonLogins: any[] = [];

  for (const p of profileSiswaList) {
    const authUser = authUsers.find((u) => u.id === p.id);
    if (!authUser) continue;

    const authEmailPrefix = (authUser.email || "").split("@")[0].toLowerCase().trim();
    
    // Find what siswa row matches this auth email prefix
    const matchedSiswaByNis = siswaByNis.get(authEmailPrefix);
    const matchedSiswaByUsername = siswaByUsername.get(authEmailPrefix);
    const matchedSiswa = matchedSiswaByNis || matchedSiswaByUsername;

    if (matchedSiswa) {
      if (p.nama && matchedSiswa.nama.trim().toLowerCase() !== p.nama.trim().toLowerCase()) {
        wrongPersonLogins.push({
          authUserId: authUser.id,
          authEmail: authUser.email,
          profileNamaInDB: p.nama,
          profileNisInDB: p.nis,
          siswaTableActualNama: matchedSiswa.nama,
          siswaTableActualNis: matchedSiswa.nis,
          siswaTableActualUsername: matchedSiswa.username,
        });
      }
    } else {
      // Auth email prefix doesn't exist in public.siswa at all!
      wrongPersonLogins.push({
        authUserId: authUser.id,
        authEmail: authUser.email,
        profileNamaInDB: p.nama,
        profileNisInDB: p.nis,
        reason: `Auth email prefix '${authEmailPrefix}' does NOT exist in public.siswa!`,
      });
    }
  }

  console.log(`Total Wrong Person / Broken Profile Mappings: ${wrongPersonLogins.length}`);
  if (wrongPersonLogins.length > 0) {
    console.log("Details of Wrong Person / Broken Profiles:", JSON.stringify(wrongPersonLogins.slice(0, 20), null, 2));
  }
}

deepCheck().catch(console.error);
