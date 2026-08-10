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

async function updateTuRoles() {
  console.log("=== UPDATING ROLES TO 'tata_usaha' ===");
  const tuEmails = ["inah@sman19.sch.id", "sutana@sman19.sch.id", "tahyar@sman19.sch.id"];

  for (const email of tuEmails) {
    console.log(`Updating ${email} -> role = 'tata_usaha'`);
    const { error: profErr } = await supabaseAdmin
      .from("profiles")
      .update({ role: "tata_usaha" })
      .eq("email", email);

    if (profErr) {
      console.error(`Error updating profile for ${email}:`, profErr.message);
    }

    // Also update auth user metadata if auth user exists
    const { data: { users } } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const authUser = users.find((u) => u.email === email);
    if (authUser) {
      await supabaseAdmin.auth.admin.updateUserById(authUser.id, {
        user_metadata: { ...authUser.user_metadata, role: "tata_usaha" },
      });
    }
  }

  console.log("Tata Usaha roles updated successfully!");
}

updateTuRoles().catch(console.error);
