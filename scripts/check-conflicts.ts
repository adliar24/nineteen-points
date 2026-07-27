import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const envContent = readFileSync(resolve(__dirname, "../.env.local"), "utf-8");
const env: Record<string, string> = {};
envContent.split("\n").forEach((line) => {
  const t = line.trim();
  if (!t || t.startsWith("#")) return;
  const [k, ...r] = t.split("=");
  if (k) env[k.trim()] = r.join("=").trim();
});

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const excelStudents: { nis: string; nama: string; kelas: string }[] = JSON.parse(
  readFileSync(resolve(__dirname, "../excel_students_v2.json"), "utf-8")
);

const { data: allSiswa } = await supabase.from("siswa").select("id, nis, nama, kelas");
const currentNisSet = new Set(allSiswa?.map((s) => s.nis) || []);
const dbByName = new Map<string, any>();
for (const s of allSiswa || []) {
  dbByName.set(s.nama.toUpperCase().trim(), s);
}

let conflicts = 0;
let free = 0;
for (const excel of excelStudents) {
  const db = dbByName.get(excel.nama.toUpperCase().trim());
  if (db && db.nis !== excel.nis) {
    if (currentNisSet.has(excel.nis)) {
      const other = allSiswa?.find((s) => s.nis === excel.nis && s.id !== db.id);
      console.log(
        `CONFLICT: ${excel.nama}: DB NIS ${db.nis} -> target ${excel.nis} (owned by ${other?.nama || "?"} ${other?.kelas || ""})`
      );
      conflicts++;
    } else {
      free++;
    }
  }
}
console.log(`\nConflicts: ${conflicts} / Free (no conflict): ${free}`);
