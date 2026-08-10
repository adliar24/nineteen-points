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
  fileOrigin: string;
  sheetOrigin: string;
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
                fileOrigin: item.file,
                sheetOrigin: sheetName,
              });
            }
          }
          break;
        }
      }
    }
  }

  // Deduplicate by NIS
  const uniqueMap = new Map<string, MasterExcelSiswa>();
  for (const s of rawList) {
    if (!uniqueMap.has(s.nis)) {
      uniqueMap.set(s.nis, s);
    }
  }

  // Generate unique 2-word usernames
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

async function executeRestoration() {
  console.log("=================================================");
  console.log(" EXECUTION: PENYELARASAN NIS & REKONSILIASI POIN ");
  console.log("=================================================");

  const masterStudents = parseMasterExcelFiles();
  console.log(`📄 Total Master Students dari Excel kelasfix: ${masterStudents.length} murid`);

  let currentSiswa = await fetchAllRows("siswa");
  let currentProfiles = await fetchAllRows("profiles");
  let currentRiwayat = await fetchAllRows("riwayat_poin");

  let authUsers: any[] = [];
  let page = 1;
  while (true) {
    const { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error || !users || users.length === 0) break;
    authUsers.push(...users);
    if (users.length < 1000) break;
    page++;
  }

  console.log(`🗄️ Initial DB State: ${currentSiswa.length} siswa, ${currentProfiles.length} profiles, ${authUsers.length} auth.users, ${currentRiwayat.length} riwayat_poin`);

  // --- TAHAP 0: DISCONNECT FK & UNIQUE CONSTRAINTS ---
  console.log("\n--- TAHAP 0: Clear profiles.nis, siswa.username, set temp siswa.nis ---");
  
  // Single query clear profiles.nis
  const { error: errP } = await supabaseAdmin.from("profiles").update({ nis: null }).eq("role", "siswa");
  if (errP) console.error("Error clearing profiles.nis:", errP.message);

  // Clear username & set temp nis on siswa
  const chunkSize = 100;
  for (let i = 0; i < currentSiswa.length; i += chunkSize) {
    const chunk = currentSiswa.slice(i, i + chunkSize);
    await Promise.all(
      chunk.map((s) => supabaseAdmin.from("siswa").update({ nis: `TEMP_${s.id}`, username: null }).eq("id", s.id))
    );
  }

  console.log("✅ Sukses melepaskan Foreign Key & Unique Constraints.");

  // Re-fetch siswa after Temp NIS
  currentSiswa = await fetchAllRows("siswa");
  const dbSiswaByNameClean = new Map(currentSiswa.map((s) => [s.nama.toUpperCase().replace(/[^A-Z0-9]/g, ""), s]));

  // --- TAHAP 1: UPDATE PUBLIC.SISWA SEQUENTIALLY WITH OFFICIAL EXCEL DATA ---
  console.log("\n--- TAHAP 1: Update public.siswa dengan Data Resmi Excel ---");
  let fixedSiswaCount = 0;
  let errCount = 0;

  for (let i = 0; i < masterStudents.length; i++) {
    const mSiswa = masterStudents[i];
    const cleanName = mSiswa.nama.replace(/[^A-Z0-9]/g, "");
    const targetSiswa = dbSiswaByNameClean.get(cleanName);

    if (targetSiswa) {
      const { error } = await supabaseAdmin.from("siswa").update({
        nis: mSiswa.nis,
        nama: mSiswa.nama,
        kelas: mSiswa.kelas,
        username: mSiswa.username,
      }).eq("id", targetSiswa.id);

      if (!error) {
        fixedSiswaCount++;
      } else {
        errCount++;
        console.error(`Err updating ${mSiswa.nama}:`, error.message);
      }
    } else {
      const { error } = await supabaseAdmin.from("siswa").insert({
        nis: mSiswa.nis,
        nama: mSiswa.nama,
        kelas: mSiswa.kelas,
        username: mSiswa.username,
        total_poin: 0,
      });
      if (!error) fixedSiswaCount++;
      else {
        errCount++;
        console.error(`Err inserting ${mSiswa.nama}:`, error.message);
      }
    }

    if ((i + 1) % 300 === 0 || i + 1 >= masterStudents.length) {
      console.log(`  Processed ${i + 1} / ${masterStudents.length} siswa rows...`);
    }
  }
  console.log(`✅ Selesai memperbarui ${fixedSiswaCount} data murid di public.siswa (Errors: ${errCount}).`);

  // --- TAHAP 2: RECALCULATE & RESTORE TOTAL_POIN FROM RIWAYAT_POIN ---
  console.log("\n--- TAHAP 2: Rekonsiliasi & Pemulihan total_poin dari riwayat_poin ---");

  const updatedSiswa = await fetchAllRows("siswa");
  const updatedRiwayat = await fetchAllRows("riwayat_poin");

  const pointsMapBySiswaId: Record<string, number> = {};
  for (const r of updatedRiwayat) {
    const sId = r.siswa_id;
    const pts = Number(r.nilai_diberikan || 0);
    pointsMapBySiswaId[sId] = (pointsMapBySiswaId[sId] || 0) + pts;
  }

  let restoredPointsCount = 0;
  for (let i = 0; i < updatedSiswa.length; i += chunkSize) {
    const chunk = updatedSiswa.slice(i, i + chunkSize);
    await Promise.all(
      chunk.map(async (s) => {
        const calculatedTotalPoin = pointsMapBySiswaId[s.id] || 0;

        if (Number(s.total_poin || 0) !== calculatedTotalPoin) {
          const { error } = await supabaseAdmin.from("siswa").update({
            total_poin: calculatedTotalPoin,
          }).eq("id", s.id);

          if (!error) {
            restoredPointsCount++;
            console.log(`  [RESTORED POIN] ${s.nama} (${s.nis}): ${s.total_poin} -> ${calculatedTotalPoin}`);
          }
        }
      })
    );
  }
  console.log(`✅ Selesai merekap & memulihkan total_poin untuk ${restoredPointsCount} murid.`);

  // --- TAHAP 3: SYNC AUTH.USERS & PUBLIC.PROFILES ---
  console.log("\n--- TAHAP 3: Penyelarasan Email, NIS, & Profil di auth.users & public.profiles ---");

  const finalSiswa = await fetchAllRows("siswa");
  
  const authByEmailPrefix = new Map<string, any>();
  const authByNameClean = new Map<string, any>();
  for (const u of authUsers) {
    const prefix = (u.email || "").split("@")[0].toLowerCase().trim();
    authByEmailPrefix.set(prefix, u);
    if (u.user_metadata?.fullName) {
      authByNameClean.set(u.user_metadata.fullName.toUpperCase().replace(/[^A-Z0-9]/g, ""), u);
    }
  }

  let syncedProfilesCount = 0;
  const uniformPassword = "murid19*";

  for (let i = 0; i < finalSiswa.length; i += chunkSize) {
    const chunk = finalSiswa.slice(i, i + chunkSize);
    await Promise.all(
      chunk.map(async (s) => {
        const nisStr = String(s.nis).trim();
        if (nisStr.startsWith("TEMP_")) return;

        const nisEmail = `${nisStr}@sman19.sch.id`.toLowerCase();
        const cleanName = s.nama.toUpperCase().replace(/[^A-Z0-9]/g, "");

        let authUser = authByEmailPrefix.get(nisStr.toLowerCase()) || authByNameClean.get(cleanName);
        if (!authUser && s.username) {
          authUser = authByEmailPrefix.get(s.username.toLowerCase());
        }

        if (!authUser) {
          const { data: newAuth, error: createErr } = await supabaseAdmin.auth.admin.createUser({
            email: nisEmail,
            password: uniformPassword,
            email_confirm: true,
            user_metadata: { role: "siswa", fullName: s.nama, nis: nisStr },
          });
          if (!createErr && newAuth?.user) {
            authUser = newAuth.user;
          }
        } else {
          await supabaseAdmin.auth.admin.updateUserById(authUser.id, {
            email: nisEmail,
            password: uniformPassword,
            email_confirm: true,
            user_metadata: { role: "siswa", fullName: s.nama, nis: nisStr },
          });
        }

        if (authUser) {
          const { error: profErr } = await supabaseAdmin.from("profiles").upsert({
            id: authUser.id,
            email: nisEmail,
            nama: s.nama,
            nis: nisStr,
            role: "siswa",
          });

          if (!profErr) syncedProfilesCount++;
        }
      })
    );

    if ((i + chunkSize) % 300 === 0 || i + chunkSize >= finalSiswa.length) {
      console.log(`  Synced ${Math.min(i + chunkSize, finalSiswa.length)} / ${finalSiswa.length} student auth profiles...`);
    }
  }

  console.log(`✅ Selesai menyelaraskan ${syncedProfilesCount} akun & profil autentikasi murid.`);

  console.log("\n=================================================");
  console.log("      RESTORATION & SYNC COMPLETED               ");
  console.log("=================================================");
}

executeRestoration().catch(console.error);
