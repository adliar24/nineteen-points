import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://ijnrugyooonuvngfrnpx.supabase.co";
const serviceRoleKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlqbnJ1Z3lvb29udXZuZ2ZybnB4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDAwOTI0NSwiZXhwIjoyMDk5NTg1MjQ1fQ.kU0_AHiNR4zzVVNjOWQ4t8txcCqpq3mjMRN2d7oxrxY";

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const NEW_EMAIL = "198601032025212006@sman19.sch.id";
const NEW_USERNAME = "198601032025212006";
const TARGET_NAME = "Rani Rahayu Ningsri";

async function main() {
  // 1. Cari profile berdasarkan nama
  const { data: profiles, error: profileErr } = await supabase
    .from("profiles")
    .select("id, email, nama, role")
    .ilike("nama", `%${TARGET_NAME}%`)
    .eq("role", "guru");

  if (profileErr) {
    console.error("Gagal mengambil profiles:", profileErr.message);
    return;
  }

  if (!profiles || profiles.length === 0) {
    console.error("Profil tidak ditemukan untuk:", TARGET_NAME);
    return;
  }

  const profile = profiles[0];
  console.log("Ditemukan:", profile.nama, "| Email lama:", profile.email, "| ID:", profile.id);

  // 2. Update email di auth.users via admin API
  const { error: authErr } = await supabase.auth.admin.updateUserById(profile.id, {
    email: NEW_EMAIL,
    user_metadata: { nip: NEW_USERNAME },
  });

  if (authErr) {
    console.error("Gagal update auth.users:", authErr.message);
    return;
  }
  console.log("auth.users updated → email:", NEW_EMAIL);

  // 3. Update email di profiles
  const { error: updateProfileErr } = await supabase
    .from("profiles")
    .update({ email: NEW_EMAIL })
    .eq("id", profile.id);

  if (updateProfileErr) {
    console.error("Gagal update profiles:", updateProfileErr.message);
    return;
  }
  console.log("profiles updated → email:", NEW_EMAIL);

  console.log("\n✅ Selesai! Username Rani Rahayu Ningsri sekarang:", NEW_USERNAME);
}

main();
