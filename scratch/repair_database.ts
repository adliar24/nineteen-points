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

async function repairDatabase() {
  console.log("=================================================");
  console.log("    STARTING DATABASE AUTOMATIC REPAIR & SYNC    ");
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

  console.log(`Initial status: ${siswaList.length} siswa, ${profilesList.length} profiles, ${authUsers.length} auth.users`);

  const siswaByNis = new Map(siswaList.map((s) => [String(s.nis).trim(), s]));
  const siswaByUsername = new Map(siswaList.filter((s) => s.username).map((s) => [s.username.trim().toLowerCase(), s]));
  const profileById = new Map(profilesList.map((p) => [p.id, p]));

  let totalUpdatedEmails = 0;
  let totalUpdatedProfiles = 0;
  let totalCreatedAuthUsers = 0;
  let totalDeletedDuplicates = 0;

  // STEP 1: Loop over all siswa and align auth user & profile
  for (const s of siswaList) {
    const nisStr = String(s.nis).trim();
    const nisEmail = `${nisStr}@sman19.sch.id`.toLowerCase();
    const usernameEmail = s.username ? `${s.username.trim()}@sman19.sch.id`.toLowerCase() : null;

    // Find all auth users associated with this student (by NIS email or Username email)
    const matchingAuthUsers = authUsers.filter((u) => {
      const uEmail = u.email?.toLowerCase().trim() || "";
      if (uEmail === nisEmail) return true;
      if (usernameEmail && uEmail === usernameEmail) return true;
      const p = profileById.get(u.id);
      if (p && String(p.nis).trim() === nisStr) return true;
      return false;
    });

    let primaryAuthUser: any = null;

    if (matchingAuthUsers.length === 0) {
      // Create missing auth user
      console.log(`[CREATE AUTH] Creating missing auth user for ${s.nama} (${nisEmail})`);
      const { data: newUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email: nisEmail,
        password: `siswa19_${nisStr}`, // Standard default password
        email_confirm: true,
        user_metadata: { role: "siswa", fullName: s.nama, nis: nisStr },
      });

      if (createErr) {
        console.error(`Failed to create auth user for ${s.nama}:`, createErr.message);
      } else if (newUser?.user) {
        primaryAuthUser = newUser.user;
        authUsers.push(primaryAuthUser);
        totalCreatedAuthUsers++;
      }
    } else {
      // Pick the NIS auth user if available, otherwise pick the username auth user
      primaryAuthUser = matchingAuthUsers.find((u) => u.email?.toLowerCase().trim() === nisEmail) || matchingAuthUsers[0];

      // If matchingAuthUsers has duplicates (e.g. both NIS and Username auth users exist), delete extra
      if (matchingAuthUsers.length > 1) {
        for (const extraAuth of matchingAuthUsers) {
          if (extraAuth.id !== primaryAuthUser.id) {
            console.log(`[DELETE DUP] Deleting redundant auth user ID ${extraAuth.id} (${extraAuth.email}) for ${s.nama}`);
            await supabaseAdmin.auth.admin.deleteUser(extraAuth.id);
            await supabaseAdmin.from("profiles").delete().eq("id", extraAuth.id);
            totalDeletedDuplicates++;
          }
        }
      }
    }

    if (primaryAuthUser) {
      // Ensure auth.users email is normalized to nisEmail
      if (primaryAuthUser.email?.toLowerCase().trim() !== nisEmail) {
        console.log(`[UPDATE AUTH EMAIL] Updating ${s.nama}: ${primaryAuthUser.email} -> ${nisEmail}`);
        const { error: updateAuthErr } = await supabaseAdmin.auth.admin.updateUserById(primaryAuthUser.id, {
          email: nisEmail,
          email_confirm: true,
          user_metadata: { role: "siswa", fullName: s.nama, nis: nisStr },
        });
        if (updateAuthErr) {
          console.error(`Failed to update auth email for ${s.nama}:`, updateAuthErr.message);
        } else {
          totalUpdatedEmails++;
        }
      }

      // Upsert/Update profile in public.profiles to 100% match public.siswa
      const currentProfile = profileById.get(primaryAuthUser.id);
      if (
        !currentProfile ||
        currentProfile.nama !== s.nama ||
        currentProfile.nis !== nisStr ||
        currentProfile.email?.toLowerCase().trim() !== nisEmail ||
        currentProfile.role !== "siswa"
      ) {
        console.log(`[UPDATE PROFILE] Syncing profile for ${s.nama} (${nisStr})`);
        const { error: upsertProfErr } = await supabaseAdmin.from("profiles").upsert({
          id: primaryAuthUser.id,
          email: nisEmail,
          nama: s.nama,
          nis: nisStr,
          role: "siswa",
        });
        if (upsertProfErr) {
          console.error(`Failed to update profile for ${s.nama}:`, upsertProfErr.message);
        } else {
          totalUpdatedProfiles++;
        }
      }
    }
  }

  // STEP 2: Clean up orphaned profiles or temp profiles
  const currentProfiles = await fetchAllRows("profiles");
  for (const p of currentProfiles) {
    if (p.role === "siswa") {
      const emailPrefix = (p.email || "").split("@")[0].toLowerCase().trim();
      const sMatch = siswaByNis.get(emailPrefix) || siswaByUsername.get(emailPrefix) || (p.nis ? siswaByNis.get(String(p.nis).trim()) : null);
      if (sMatch && (p.nama !== sMatch.nama || p.nis !== String(sMatch.nis).trim())) {
        console.log(`[FIX ORPHAN PROFILE] Repairing profile ${p.id} (${p.email}) to ${sMatch.nama} (${sMatch.nis})`);
        await supabaseAdmin.from("profiles").update({
          nama: sMatch.nama,
          nis: String(sMatch.nis).trim(),
          email: `${sMatch.nis}@sman19.sch.id`.toLowerCase(),
        }).eq("id", p.id);
      }
    }
  }

  console.log("\n=================================================");
  console.log("            REPAIR SUMMARY COMPLETED             ");
  console.log("=================================================");
  console.log(`- Created missing auth users: ${totalCreatedAuthUsers}`);
  console.log(`- Updated auth emails to NIS format: ${totalUpdatedEmails}`);
  console.log(`- Updated/synced profiles: ${totalUpdatedProfiles}`);
  console.log(`- Deleted redundant duplicate accounts: ${totalDeletedDuplicates}`);
}

repairDatabase().catch(console.error);
