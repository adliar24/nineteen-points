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

async function fixAllStudentAuths() {
  console.log("=================================================");
  console.log(" FIX & ENSURE 100% STUDENT AUTH ACCOUNTS & PROFILES ");
  console.log("=================================================");

  const siswaList = await fetchAllRows("siswa");
  console.log(`📄 Total siswa di public.siswa: ${siswaList.length}`);

  let authUsers: any[] = [];
  let page = 1;
  while (true) {
    const { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error || !users || users.length === 0) break;
    authUsers.push(...users);
    if (users.length < 1000) break;
    page++;
  }
  console.log(`🗄️ Total auth.users awal: ${authUsers.length}`);

  const authByEmail = new Map(authUsers.map((u) => [(u.email || "").toLowerCase().trim(), u]));
  const authByNameClean = new Map();
  const authByMetadataNis = new Map();

  for (const u of authUsers) {
    if (u.user_metadata?.fullName) {
      const clean = u.user_metadata.fullName.toUpperCase().replace(/[^A-Z0-9]/g, "");
      authByNameClean.set(clean, u);
    }
    if (u.user_metadata?.nis) {
      authByMetadataNis.set(String(u.user_metadata.nis).trim(), u);
    }
  }

  let createdCount = 0;
  let updatedCount = 0;
  let profileSyncedCount = 0;
  const defaultPassword = "murid19*";
  const chunkSize = 50;

  for (let i = 0; i < siswaList.length; i += chunkSize) {
    const chunk = siswaList.slice(i, i + chunkSize);
    await Promise.all(
      chunk.map(async (s) => {
        const nisStr = String(s.nis).trim();
        const expectedEmail = `${nisStr}@sman19.sch.id`.toLowerCase();
        const cleanName = s.nama.toUpperCase().replace(/[^A-Z0-9]/g, "");

        let authUser = authByEmail.get(expectedEmail) || authByNameClean.get(cleanName) || authByMetadataNis.get(nisStr);

        if (!authUser) {
          const { data: newAuth, error: createErr } = await supabaseAdmin.auth.admin.createUser({
            email: expectedEmail,
            password: defaultPassword,
            email_confirm: true,
            user_metadata: { role: "siswa", fullName: s.nama, nis: nisStr },
          });

          if (!createErr && newAuth?.user) {
            authUser = newAuth.user;
            createdCount++;
            console.log(`  [CREATED AUTH] ${s.nama} (${s.nis}) -> ${expectedEmail}`);
          }
        } else {
          if (authUser.email?.toLowerCase().trim() !== expectedEmail || authUser.user_metadata?.fullName !== s.nama) {
            const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(authUser.id, {
              email: expectedEmail,
              password: defaultPassword,
              email_confirm: true,
              user_metadata: { role: "siswa", fullName: s.nama, nis: nisStr },
            });

            if (!updateErr) updatedCount++;
          }
        }

        if (authUser) {
          const { error: profErr } = await supabaseAdmin.from("profiles").upsert({
            id: authUser.id,
            email: expectedEmail,
            nama: s.nama,
            nis: nisStr,
            role: "siswa",
          });

          if (!profErr) profileSyncedCount++;
        }
      })
    );

    if ((i + chunkSize) % 300 === 0 || i + chunkSize >= siswaList.length) {
      console.log(`  Processed ${Math.min(i + chunkSize, siswaList.length)} / ${siswaList.length} siswa auth accounts...`);
    }
  }

  console.log("\n=================================================");
  console.log("       SUMMARY OF AUTH & PROFILE RESTORATION      ");
  console.log("=================================================");
  console.log(`- Created New Auth Accounts : ${createdCount}`);
  console.log(`- Updated Existing Auth     : ${updatedCount}`);
  console.log(`- Synced Profiles Rows     : ${profileSyncedCount} / ${siswaList.length}`);
}

fixAllStudentAuths().catch(console.error);
