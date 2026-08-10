import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";

// Load .env.local manually
const envLines = fs.readFileSync(".env.local", "utf-8").split("\n");
const envConfig: Record<string, string> = {};
for (const line of envLines) {
  const parts = line.trim().split("=");
  if (parts.length >= 2) {
    envConfig[parts[0].trim()] = parts.slice(1).join("=").trim();
  }
}

const supabaseUrl = envConfig.VITE_SUPABASE_URL;
const serviceRoleKey = envConfig.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing Supabase credentials in .env.local");
  process.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function fetchAllRows(tableName: string, select = "*") {
  let all: any[] = [];
  let from = 0;
  const step = 1000;
  while (true) {
    const { data, error } = await supabaseAdmin
      .from(tableName)
      .select(select)
      .range(from, from + step - 1);
    if (error) {
      console.error(`Error fetching ${tableName}:`, error);
      break;
    }
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < step) break;
    from += step;
  }
  return all;
}

async function analyze() {
  console.log("=== STARTING FULL DEEP SUPABASE ANALYSIS ===");

  // Fetch ALL rows using range pagination
  const siswaList = await fetchAllRows("siswa", "id, nis, nama, kelas, username");
  const profilesList = await fetchAllRows("profiles", "id, email, role, nama, nis");

  let authUsers: any[] = [];
  let page = 1;
  const perPage = 1000;
  while (true) {
    const { data: { users }, error: authErr } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage,
    });
    if (authErr) {
      console.error("Error listing auth.users:", authErr);
      break;
    }
    if (!users || users.length === 0) break;
    authUsers.push(...users);
    if (users.length < perPage) break;
    page++;
  }

  console.log(`\nREAL TOTALS:`);
  console.log(`Total public.siswa: ${siswaList.length}`);
  console.log(`Total public.profiles: ${profilesList.length}`);
  console.log(`Total auth.users: ${authUsers.length}`);

  // Maps
  const siswaByNis = new Map(siswaList.map((s) => [String(s.nis).trim(), s]));
  const siswaByUsername = new Map(siswaList.filter((s) => s.username).map((s) => [s.username.toLowerCase().trim(), s]));
  const profileById = new Map(profilesList.map((p) => [p.id, p]));
  const profileByEmail = new Map(profilesList.map((p) => [p.email?.toLowerCase().trim(), p]));

  // --- ISSUE 1: Duplicate Auth Users (Same student having multiple auth accounts) ---
  console.log("\n--- ISSUE 1: Checking for duplicate Auth Users for same student ---");
  const authUsersByEmailPrefix = new Map<string, any[]>();
  for (const u of authUsers) {
    const email = u.email?.toLowerCase().trim() || "";
    const prefix = email.split("@")[0];
    if (!authUsersByEmailPrefix.has(prefix)) {
      authUsersByEmailPrefix.set(prefix, []);
    }
    authUsersByEmailPrefix.get(prefix)!.push(u);
  }

  // Check if a student has an auth account with NIS email AND an auth account with username email
  const duplicateAuthForSiswa: any[] = [];
  for (const s of siswaList) {
    const nisPrefix = String(s.nis).trim().toLowerCase();
    const usernamePrefix = s.username ? s.username.toLowerCase().trim() : null;

    const nisAuth = authUsersByEmailPrefix.get(nisPrefix);
    const usernameAuth = usernamePrefix ? authUsersByEmailPrefix.get(usernamePrefix) : null;

    if (nisAuth && usernameAuth && usernamePrefix !== nisPrefix) {
      duplicateAuthForSiswa.push({
        nama: s.nama,
        nis: s.nis,
        username: s.username,
        nisAuthUserIds: nisAuth.map((u) => u.id),
        usernameAuthUserIds: usernameAuth.map((u) => u.id),
      });
    }
  }

  console.log(`Students with MULTIPLE auth accounts (one for NIS email, one for Username email): ${duplicateAuthForSiswa.length}`);
  if (duplicateAuthForSiswa.length > 0) {
    console.log("Sample duplicate auth accounts for same student:", JSON.stringify(duplicateAuthForSiswa.slice(0, 10), null, 2));
  }

  // --- ISSUE 2: auth.users without profiles or profiles without auth.users ---
  console.log("\n--- ISSUE 2: Auth Users vs Profiles vs Siswa alignment ---");
  const authWithoutProfile = authUsers.filter((u) => !profileById.has(u.id));
  console.log(`Auth users WITHOUT profile row in public.profiles: ${authWithoutProfile.length}`);
  if (authWithoutProfile.length > 0) {
    console.log("Sample auth without profile:", authWithoutProfile.slice(0, 10).map((u) => ({ id: u.id, email: u.email, createdAt: u.created_at })));
  }

  const profileWithoutAuth = profilesList.filter((p) => !authUsers.some((u) => u.id === p.id));
  console.log(`Profiles WITHOUT matching auth.user ID: ${profileWithoutAuth.length}`);

  // --- ISSUE 3: Siswa unable to login (Siswa with NO auth account at all) ---
  console.log("\n--- ISSUE 3: Siswa with NO auth account matching NIS or Username ---");
  const siswaNoAuthAtAll: any[] = [];
  for (const s of siswaList) {
    const nisPrefix = String(s.nis).trim().toLowerCase();
    const usernamePrefix = s.username ? s.username.toLowerCase().trim() : null;
    const hasNisAuth = authUsersByEmailPrefix.has(nisPrefix);
    const hasUsernameAuth = usernamePrefix ? authUsersByEmailPrefix.has(usernamePrefix) : false;

    if (!hasNisAuth && !hasUsernameAuth) {
      siswaNoAuthAtAll.push(s);
    }
  }
  console.log(`Total siswa in public.siswa that have NO auth account at all: ${siswaNoAuthAtAll.length}`);
  if (siswaNoAuthAtAll.length > 0) {
    console.log("Sample siswa with no auth account:", siswaNoAuthAtAll.slice(0, 10));
  }

  // --- ISSUE 4: "Log in as WRONG person" analysis ---
  console.log("\n--- ISSUE 4: Analyzing why users log in as the WRONG person ---");
  // Check if profile.id != auth.user.id or profile.nama/nis does not match public.siswa for that profile
  const wrongPersonCases: any[] = [];
  for (const p of profilesList) {
    if (p.role !== "siswa") continue;
    
    // Find matching auth user
    const authUser = authUsers.find((u) => u.id === p.id);
    if (!authUser) continue;

    const emailPrefix = (p.email || "").split("@")[0].toLowerCase().trim();
    const sByNis = siswaByNis.get(emailPrefix) || (p.nis ? siswaByNis.get(String(p.nis).trim()) : null);
    const sByUsername = siswaByUsername.get(emailPrefix);

    const sActual = sByNis || sByUsername;
    if (sActual && sActual.nama.trim().toLowerCase() !== p.nama?.trim().toLowerCase()) {
      wrongPersonCases.push({
        profileId: p.id,
        authEmail: authUser.email,
        profileNama: p.nama,
        profileNis: p.nis,
        siswaNamaActual: sActual.nama,
        siswaNisActual: sActual.nis,
      });
    }
  }
  console.log(`Profiles where profile.nama does NOT match public.siswa.nama for that NIS/email: ${wrongPersonCases.length}`);
  if (wrongPersonCases.length > 0) {
    console.log("Sample WRONG PERSON cases:", JSON.stringify(wrongPersonCases.slice(0, 15), null, 2));
  }

  // --- ISSUE 5: Check resolve_login RPC in DB ---
  console.log("\n--- ISSUE 5: Check resolve_login function in DB ---");
  // Test resolve_login for a sample NIS and sample username
  if (siswaList.length > 0) {
    const sampleSiswa = siswaList[0];
    console.log("Testing sample siswa:", sampleSiswa);
    const { data: res1 } = await supabaseAdmin.rpc("resolve_login", { p_login: sampleSiswa.nis });
    console.log(`resolve_login('${sampleSiswa.nis}') =>`, res1);
    if (sampleSiswa.username) {
      const { data: res2 } = await supabaseAdmin.rpc("resolve_login", { p_login: sampleSiswa.username });
      console.log(`resolve_login('${sampleSiswa.username}') =>`, res2);
    }
    const { data: res3 } = await supabaseAdmin.rpc("resolve_login", { p_login: sampleSiswa.nama });
    console.log(`resolve_login('${sampleSiswa.nama}') =>`, res3);
  }
}

analyze().catch(console.error);
