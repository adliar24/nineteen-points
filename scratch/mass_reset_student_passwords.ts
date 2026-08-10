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

async function massResetStudentPasswords() {
  console.log("=================================================");
  console.log("    FAST MASS RESET PASSWORDS TO 'murid19*'      ");
  console.log("=================================================");

  const profilesList = await fetchAllRows("profiles");
  const studentProfiles = profilesList.filter((p) => p.role === "siswa");
  const studentProfileIds = new Set(studentProfiles.map((p) => p.id));

  let authUsers: any[] = [];
  let page = 1;
  while (true) {
    const { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error || !users || users.length === 0) break;
    authUsers.push(...users);
    if (users.length < 1000) break;
    page++;
  }

  const studentAuthUsers = authUsers.filter((u) => studentProfileIds.has(u.id));

  console.log(`Targeting ${studentAuthUsers.length} student auth accounts.`);
  console.log("Resetting passwords in parallel chunks...\n");

  let successCount = 0;
  let failCount = 0;
  const newPassword = "murid19*";
  const chunkSize = 25;

  for (let i = 0; i < studentAuthUsers.length; i += chunkSize) {
    const chunk = studentAuthUsers.slice(i, i + chunkSize);
    await Promise.all(
      chunk.map(async (u) => {
        try {
          const { error } = await supabaseAdmin.auth.admin.updateUserById(u.id, {
            password: newPassword,
          });
          if (error) {
            failCount++;
          } else {
            successCount++;
          }
        } catch {
          failCount++;
        }
      })
    );

    console.log(`Processed ${Math.min(i + chunkSize, studentAuthUsers.length)} / ${studentAuthUsers.length} accounts...`);
  }

  console.log("\n=================================================");
  console.log("       FAST MASS RESET COMPLETED                 ");
  console.log("=================================================");
  console.log(`- Total Student Accounts Processed : ${studentAuthUsers.length}`);
  console.log(`- Successfully Reset Passwords     : ${successCount}`);
  console.log(`- Failed Resets                    : ${failCount}`);
  console.log(`- Uniform Password                 : "${newPassword}"`);
}

massResetStudentPasswords().catch(console.error);
