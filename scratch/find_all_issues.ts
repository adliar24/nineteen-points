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

async function findALlIssues() {
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

  const siswaByNis = new Map(siswaList.map((s) => [String(s.nis).trim(), s]));
  const siswaByUsername = new Map(siswaList.filter((s) => s.username).map((s) => [s.username.trim().toLowerCase(), s]));
  const profileById = new Map(profilesList.map((p) => [p.id, p]));
  const authById = new Map(authUsers.map((u) => [u.id, u]));

  console.log("=================================================");
  console.log("           DATABASE INTEGRITY REPORT             ");
  console.log("=================================================");
  console.log(`Total public.siswa: ${siswaList.length}`);
  console.log(`Total public.profiles: ${profilesList.length}`);
  console.log(`Total auth.users: ${authUsers.length}\n`);

  // Issue Category 1: Wrong Person Profiles (profile.nama / profile.nis doesn't match public.siswa for that auth email)
  const wrongPersonList: any[] = [];
  for (const u of authUsers) {
    const p = profileById.get(u.id);
    const emailPrefix = (u.email || "").split("@")[0].toLowerCase().trim();
    const sActual = siswaByNis.get(emailPrefix) || siswaByUsername.get(emailPrefix);

    if (sActual && p) {
      if (p.nama?.trim().toLowerCase() !== sActual.nama.trim().toLowerCase() || (p.nis && String(p.nis).trim() !== String(sActual.nis).trim())) {
        wrongPersonList.push({
          authId: u.id,
          authEmail: u.email,
          profileNama: p.nama,
          profileNis: p.nis,
          siswaActualNama: sActual.nama,
          siswaActualNis: sActual.nis,
          siswaActualKelas: sActual.kelas,
        });
      }
    }
  }

  console.log(`📌 ISSUE 1: AKUN TERTUKAR / PROFILE BEDA SISWA (${wrongPersonList.length} akun)`);
  wrongPersonList.forEach((item, idx) => {
    console.log(`  ${idx + 1}. Auth Email: ${item.authEmail}`);
    console.log(`     Nama di Profile DB : "${item.profileNama}" (NIS Profile: ${item.profileNis})`);
    console.log(`     Pemilik Asli Siswa : "${item.siswaActualNama}" (NIS Siswa: ${item.siswaActualNis}, Kelas: ${item.siswaActualKelas})`);
  });

  // Issue Category 2: Siswa where resolve_login returns NIS, but auth account email is USERNAME or TEMP email
  const emailMismatchList: any[] = [];
  for (const s of siswaList) {
    const nisEmail = `${String(s.nis).trim()}@sman19.sch.id`.toLowerCase();
    const usernameEmail = s.username ? `${s.username.trim()}@sman19.sch.id`.toLowerCase() : null;

    const authNis = authUsers.find((u) => u.email?.toLowerCase().trim() === nisEmail);
    const authUsername = usernameEmail ? authUsers.find((u) => u.email?.toLowerCase().trim() === usernameEmail) : null;

    if (!authNis && authUsername) {
      emailMismatchList.push({
        siswaNama: s.nama,
        siswaNis: s.nis,
        username: s.username,
        expectedNisEmail: nisEmail,
        actualAuthEmail: authUsername.email,
        authId: authUsername.id,
      });
    }
  }

  console.log(`\n📌 ISSUE 2: SISWA GAGAL LOGIN KARENA EMAIL AUTH PAKAI USERNAME (Bukan NIS) (${emailMismatchList.length} akun)`);
  emailMismatchList.forEach((item, idx) => {
    console.log(`  ${idx + 1}. ${item.siswaNama} (NIS: ${item.siswaNis})`);
    console.log(`     Sistem cari : ${item.expectedNisEmail}`);
    console.log(`     Email di Auth: ${item.actualAuthEmail}`);
  });

  // Issue Category 3: Siswa with NO Auth Account at all
  const noAuthList: any[] = [];
  for (const s of siswaList) {
    const nisEmail = `${String(s.nis).trim()}@sman19.sch.id`.toLowerCase();
    const usernameEmail = s.username ? `${s.username.trim()}@sman19.sch.id`.toLowerCase() : null;

    const hasAuthNis = authUsers.some((u) => u.email?.toLowerCase().trim() === nisEmail);
    const hasAuthUsername = usernameEmail ? authUsers.some((u) => u.email?.toLowerCase().trim() === usernameEmail) : false;

    if (!hasAuthNis && !hasAuthUsername) {
      noAuthList.push(s);
    }
  }

  console.log(`\n📌 ISSUE 3: SISWA BELUM PUNYA AKUN AUTH SAMA SEKALI (${noAuthList.length} siswa)`);
  noAuthList.forEach((item, idx) => {
    console.log(`  ${idx + 1}. ${item.nama} | NIS: ${item.nis} | Kelas: ${item.kelas} | Username: ${item.username}`);
  });

  // Issue Category 4: Temp emails in auth.users
  const tempAuthList = authUsers.filter((u) => u.email?.toLowerCase().includes("temp_"));
  console.log(`\n📌 ISSUE 4: AKUN DENGAN EMAIL SEMENTARA (temp_...) (${tempAuthList.length} akun)`);
  tempAuthList.forEach((item, idx) => {
    const p = profileById.get(item.id);
    console.log(`  ${idx + 1}. Auth Email: ${item.email} | Profile Nama: ${p?.nama || "-"} | Profile NIS: ${p?.nis || "-"}`);
  });

  // Issue Category 5: Duplicate Auth Users for same student
  const dupAuthList: any[] = [];
  for (const s of siswaList) {
    const nisEmail = `${String(s.nis).trim()}@sman19.sch.id`.toLowerCase();
    const usernameEmail = s.username ? `${s.username.trim()}@sman19.sch.id`.toLowerCase() : null;

    const authNis = authUsers.find((u) => u.email?.toLowerCase().trim() === nisEmail);
    const authUsername = usernameEmail ? authUsers.find((u) => u.email?.toLowerCase().trim() === usernameEmail) : null;

    if (authNis && authUsername && authNis.id !== authUsername.id) {
      dupAuthList.push({
        siswaNama: s.nama,
        siswaNis: s.nis,
        nisAuthId: authNis.id,
        nisAuthEmail: authNis.email,
        usernameAuthId: authUsername.id,
        usernameAuthEmail: authUsername.email,
      });
    }
  }

  console.log(`\n📌 ISSUE 5: AKUN AUTH GANDA UNTUK 1 SISWA (${dupAuthList.length} siswa)`);
  dupAuthList.forEach((item, idx) => {
    console.log(`  ${idx + 1}. ${item.siswaNama} (NIS: ${item.siswaNis})`);
    console.log(`     Akun 1 (NIS)     : ${item.nisAuthEmail} (ID: ${item.nisAuthId})`);
    console.log(`     Akun 2 (Username): ${item.usernameAuthEmail} (ID: ${item.usernameAuthId})`);
  });
}

findALlIssues().catch(console.error);
