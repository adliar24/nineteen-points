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

async function findMissingAccounts() {
  console.log("=================================================");
  console.log("   AUDIT: SISWA VS AUTH.USERS & PUBLIC.PROFILES  ");
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

  console.log(`🗄️ Total public.siswa    : ${siswaList.length}`);
  console.log(`🗄️ Total public.profiles : ${profilesList.length}`);
  console.log(`🗄️ Total auth.users      : ${authUsers.length}\n`);

  const authByEmail = new Map(authUsers.map((u) => [(u.email || "").toLowerCase().trim(), u]));
  const authByCleanName = new Map(authUsers.map((u) => [(u.user_metadata?.fullName || "").toUpperCase().replace(/[^A-Z0-9]/g, ""), u]));
  const profileById = new Map(profilesList.map((p) => [p.id, p]));

  const missingAuthAccount: any[] = [];
  const missingProfileRow: any[] = [];
  const emailMismatch: any[] = [];

  for (const s of siswaList) {
    const nisStr = String(s.nis).trim();
    const expectedNisEmail = `${nisStr}@sman19.sch.id`.toLowerCase();
    const cleanName = s.nama.toUpperCase().replace(/[^A-Z0-9]/g, "");

    const authNis = authByEmail.get(expectedNisEmail);
    const authName = authByCleanName.get(cleanName);

    if (!authNis && !authName) {
      missingAuthAccount.push(s);
    } else {
      const activeAuth = authNis || authName;
      const prof = profileById.get(activeAuth.id);

      if (!prof) {
        missingProfileRow.push({ siswa: s, authUser: activeAuth });
      }

      if (authNis && activeAuth.email?.toLowerCase().trim() !== expectedNisEmail) {
        emailMismatch.push({ siswa: s, actualEmail: activeAuth.email, expectedEmail: expectedNisEmail });
      }
    }
  }

  console.log(`📌 KATEGORI 1: SISWA TIDAK PUNYA AKUN AUTH SAMA SEKALI (${missingAuthAccount.length} siswa)`);
  if (missingAuthAccount.length > 0) {
    missingAuthAccount.forEach((s, idx) => {
      console.log(`   ${idx + 1}. Nama: "${s.nama}" | NIS: ${s.nis} | Kelas: ${s.kelas} | Username: ${s.username}`);
    });
  }

  console.log(`\n📌 KATEGORI 2: PUNYA AKUN AUTH TAPI TIDAK PUNYA ROW PROFILES (${missingProfileRow.length} siswa)`);
  if (missingProfileRow.length > 0) {
    missingProfileRow.forEach((item, idx) => {
      console.log(`   ${idx + 1}. Nama: "${item.siswa.nama}" | NIS: ${item.siswa.nis} | Auth Email: ${item.authUser.email}`);
    });
  }

  console.log(`\n📌 KATEGORI 3: EMAIL AUTH BEDA DENGAN NIS RESMI EXCEL (${emailMismatch.length} siswa)`);
  if (emailMismatch.length > 0) {
    emailMismatch.slice(0, 10).forEach((item, idx) => {
      console.log(`   ${idx + 1}. Nama: "${item.siswa.nama}" | NIS: ${item.siswa.nis} | Email Asli: ${item.actualEmail} | Expected: ${item.expectedEmail}`);
    });
  }
}

findMissingAccounts().catch(console.error);
