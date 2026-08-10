import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";
import XLSX from "xlsx";

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

export interface MasterExcelSiswa {
  nis: string;
  nama: string;
  kelas: string;
  username: string;
}

function normalizeClassName(file: string, sheetName: string): string {
  let cleanSheet = sheetName.trim().toUpperCase().replace(/[\s_]+/g, "");
  
  if (file.includes("KELAS X.xlsx")) {
    const letter = cleanSheet.replace(/^X-?/, "");
    return `X-${letter}`;
  } else if (file.includes("KELAS XI.xlsx")) {
    const letter = cleanSheet.replace(/^XI-?/, "");
    return `XI-${letter}`;
  } else if (file.includes("KELAS XII.xlsx")) {
    const letter = cleanSheet.replace(/^XII-?/, "");
    return `XII-${letter}`;
  }
  return cleanSheet;
}

export function generate2WordUsername(nama: string): string {
  const words = nama.trim().split(/\s+/).filter(Boolean);
  const first2Words = words.slice(0, 2).join("");
  return first2Words.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function parseMasterExcelFiles(): MasterExcelSiswa[] {
  const folderPath = path.join(process.cwd(), "kelasfix");
  const rawList: MasterExcelSiswa[] = [];

  const filesConfig = [
    { file: "KELAS X.xlsx", sheets: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K"] },
    { file: "KELAS XI.xlsx", sheets: ["XI A", "XI- B", "XI C", "XI D", "XI E", "XI F", "XI G", "XI H", "XI I", "XI J"] },
    { file: "KELAS XII.xlsx", sheets: ["XII- A", "XII- B", "XII- C", "XII- D", "XII- E", "XII- F", "XII- G", "XII- H", "XII- I"] },
  ];

  for (const item of filesConfig) {
    const filePath = path.join(folderPath, item.file);
    if (!fs.existsSync(filePath)) continue;

    const workbook = XLSX.readFile(filePath);

    for (const sheetName of item.sheets) {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) continue;

      const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
      if (!rows || rows.length === 0) continue;

      const normKelas = normalizeClassName(item.file, sheetName);

      let nisIdx = -1;
      let namaIdx = -1;

      for (let r = 0; r < Math.min(rows.length, 15); r++) {
        const row = rows[r];
        if (!row || !Array.isArray(row)) continue;

        for (let c = 0; c < row.length; c++) {
          const val = String(row[c] || "").trim().toUpperCase();
          if (val === "NIS" || val === "NISN" || val.startsWith("NIS")) {
            if (nisIdx === -1) nisIdx = c;
          }
          if (val.includes("NAMA")) {
            if (namaIdx === -1) namaIdx = c;
          }
        }

        if (nisIdx !== -1 && namaIdx !== -1) {
          for (let dr = r + 1; dr < rows.length; dr++) {
            const dataRow = rows[dr];
            if (!dataRow) continue;
            let nisVal = String(dataRow[nisIdx] || "").replace(/\.0$/, "").trim();
            let namaVal = String(dataRow[namaIdx] || "").trim().toUpperCase();

            if (nisVal && namaVal && /^\d+$/.test(nisVal) && nisVal.length >= 4) {
              rawList.push({
                nis: nisVal,
                nama: namaVal,
                kelas: normKelas,
                username: "",
              });
            }
          }
          break;
        }
      }
    }
  }

  // Deduplicate by NIS to get unique master students
  const uniqueMap = new Map<string, MasterExcelSiswa>();
  for (const s of rawList) {
    if (!uniqueMap.has(s.nis)) {
      uniqueMap.set(s.nis, s);
    }
  }

  // Generate strictly unique 2-word usernames
  const usernameCounts = new Map<string, number>();
  const result: MasterExcelSiswa[] = [];

  for (const s of Array.from(uniqueMap.values())) {
    const baseU = generate2WordUsername(s.nama);
    const count = (usernameCounts.get(baseU) || 0) + 1;
    usernameCounts.set(baseU, count);

    const finalU = count > 1 ? `${baseU}${count}` : baseU;
    result.push({
      ...s,
      username: finalU,
    });
  }

  return result;
}

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

async function applyMasterSync() {
  console.log("=================================================");
  console.log("  EXECUTING MASTER EXCEL SYNC & USERNAME GEN     ");
  console.log("=================================================");

  const masterStudents = parseMasterExcelFiles();
  console.log(`Parsed ${masterStudents.length} unique master students from Excel files.`);

  console.log("\nSample Generated 2-Word Usernames:");
  masterStudents.slice(0, 10).forEach((s) => {
    console.log(`  ${s.nama} -> username: "${s.username}" (NIS: ${s.nis}, Kelas: ${s.kelas})`);
  });

  const currentSiswa = await fetchAllRows("siswa");
  const currentProfiles = await fetchAllRows("profiles");

  let authUsers: any[] = [];
  let page = 1;
  while (true) {
    const { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error || !users || users.length === 0) break;
    authUsers.push(...users);
    if (users.length < 1000) break;
    page++;
  }

  console.log(`\nCurrent DB Status: ${currentSiswa.length} siswa, ${currentProfiles.length} profiles, ${authUsers.length} auth.users`);

  const masterNisSet = new Set(masterStudents.map((s) => s.nis));
  const masterNameCleanSet = new Set(masterStudents.map((s) => s.nama.replace(/[^A-Z0-9]/g, "")));

  const currentSiswaByNis = new Map(currentSiswa.map((s) => [String(s.nis).trim(), s]));
  const currentSiswaByNameClean = new Map(currentSiswa.map((s) => [s.nama.toUpperCase().replace(/[^A-Z0-9]/g, ""), s]));
  const profileById = new Map(currentProfiles.map((p) => [p.id, p]));

  // --- STEP 1: Remove Outdated / Graduated Students ---
  console.log("\n--- TAHAP 1: Membersihkan Siswa Non-Aktif / Outdated ---");
  let removedCount = 0;
  for (const s of currentSiswa) {
    const nisStr = String(s.nis).trim();
    const cleanName = s.nama.toUpperCase().replace(/[^A-Z0-9]/g, "");

    if (!masterNisSet.has(nisStr) && !masterNameCleanSet.has(cleanName)) {
      console.log(`[DELETE OUTDATED] Removing ${s.nama} (NIS: ${s.nis}, Kelas: ${s.kelas})`);
      await supabaseAdmin.from("siswa").delete().eq("id", s.id);

      const nisEmail = `${nisStr}@sman19.sch.id`.toLowerCase();
      const matchingAuth = authUsers.find((u) => u.email?.toLowerCase() === nisEmail || profileById.get(u.id)?.nama === s.nama);
      if (matchingAuth) {
        await supabaseAdmin.auth.admin.deleteUser(matchingAuth.id);
        await supabaseAdmin.from("profiles").delete().eq("id", matchingAuth.id);
      }
      removedCount++;
    }
  }
  console.log(`Selesai menghapus ${removedCount} siswa non-aktif.`);

  // --- STEP 2: Upsert public.siswa for all master students ---
  console.log("\n--- TAHAP 2: Upsert Data Master Siswa (Nama, NIS, Kelas, Username) ---");
  let upsertSiswaCount = 0;
  const upsertChunkSize = 30;

  for (let i = 0; i < masterStudents.length; i += upsertChunkSize) {
    const chunk = masterStudents.slice(i, i + upsertChunkSize);
    await Promise.all(
      chunk.map(async (sMaster) => {
        const existing = currentSiswaByNis.get(sMaster.nis) || currentSiswaByNameClean.get(sMaster.nama.replace(/[^A-Z0-9]/g, ""));

        const rowPayload: any = {
          nis: sMaster.nis,
          nama: sMaster.nama,
          kelas: sMaster.kelas,
          username: sMaster.username,
          total_poin: existing ? existing.total_poin : 0,
          foto_url: existing ? existing.foto_url : null,
        };

        if (existing?.id) {
          rowPayload.id = existing.id;
        }

        const { error: upsertErr } = await supabaseAdmin.from("siswa").upsert(rowPayload, { onConflict: "id" });
        if (upsertErr) {
          const { error: updateErr } = await supabaseAdmin.from("siswa").update({
            nama: sMaster.nama,
            kelas: sMaster.kelas,
            username: sMaster.username,
          }).eq("nis", sMaster.nis);

          if (!updateErr) upsertSiswaCount++;
        } else {
          upsertSiswaCount++;
        }
      })
    );

    if ((i + upsertChunkSize) % 300 === 0 || i + upsertChunkSize >= masterStudents.length) {
      console.log(`Upserted ${Math.min(i + upsertChunkSize, masterStudents.length)} / ${masterStudents.length} siswa rows...`);
    }
  }
  console.log(`Selesai meng-upsert ${upsertSiswaCount} data murid di public.siswa.`);

  // --- STEP 3: Sync Auth Accounts, Profiles, and Uniform Passwords ---
  console.log("\n--- TAHAP 3: Sync Auth Accounts, Profiles, and Uniform Passwords ---");

  // Re-fetch auth users
  authUsers = [];
  page = 1;
  while (true) {
    const { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error || !users || users.length === 0) break;
    authUsers.push(...users);
    if (users.length < 1000) break;
    page++;
  }

  const authUsersByNisEmail = new Map(authUsers.map((u) => [(u.email || "").split("@")[0].toLowerCase().trim(), u]));

  let syncSuccessCount = 0;
  const newPassword = "murid19*";
  const chunkSize = 25;

  for (let i = 0; i < masterStudents.length; i += chunkSize) {
    const chunk = masterStudents.slice(i, i + chunkSize);

    await Promise.all(
      chunk.map(async (sMaster) => {
        const nisEmail = `${sMaster.nis}@sman19.sch.id`.toLowerCase();
        let authUser = authUsersByNisEmail.get(sMaster.nis.toLowerCase());

        if (!authUser) {
          // Create missing auth account
          const { data: newAuth, error: createErr } = await supabaseAdmin.auth.admin.createUser({
            email: nisEmail,
            password: newPassword,
            email_confirm: true,
            user_metadata: { role: "siswa", fullName: sMaster.nama, nis: sMaster.nis },
          });

          if (!createErr && newAuth?.user) {
            authUser = newAuth.user;
          }
        } else {
          // Update password & metadata for existing auth user
          await supabaseAdmin.auth.admin.updateUserById(authUser.id, {
            email: nisEmail,
            password: newPassword,
            email_confirm: true,
            user_metadata: { role: "siswa", fullName: sMaster.nama, nis: sMaster.nis },
          });
        }

        if (authUser) {
          // Upsert profiles table row
          await supabaseAdmin.from("profiles").upsert({
            id: authUser.id,
            email: nisEmail,
            nama: sMaster.nama,
            nis: sMaster.nis,
            role: "siswa",
          });
          syncSuccessCount++;
        }
      })
    );

    if ((i + chunkSize) % 100 === 0 || i + chunkSize >= masterStudents.length) {
      console.log(`Synced ${Math.min(i + chunkSize, masterStudents.length)} / ${masterStudents.length} student auth profiles...`);
    }
  }

  console.log("\n=================================================");
  console.log("       MASTER EXCEL SYNC COMPLETED               ");
  console.log("=================================================");
  console.log(`- Total Master Excel Students : ${masterStudents.length}`);
  console.log(`- Total Public Siswa Synced   : ${upsertSiswaCount}`);
  console.log(`- Total Outdated Removed      : ${removedCount}`);
  console.log(`- Total Auth Profiles Synced  : ${syncSuccessCount}`);
  console.log(`- Uniform Password Set        : "${newPassword}"`);
}

applyMasterSync().catch(console.error);
