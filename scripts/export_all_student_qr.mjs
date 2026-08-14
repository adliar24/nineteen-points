import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

const supabaseUrl = "https://ijnrugyooonuvngfrnpx.supabase.co";
const serviceRoleKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlqbnJ1Z3lvb29udXZuZ2ZybnB4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDAwOTI0NSwiZXhwIjoyMDk5NTg1MjQ1fQ.kU0_AHiNR4zzVVNjOWQ4t8txcCqpq3mjMRN2d7oxrxY";

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function exportAllStudentsQR() {
  console.log("Memulai pengambil data semua siswa dari Supabase...");
  let allStudents = [];
  let page = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from("siswa")
      .select("id, nis, nama, kelas, foto_url")
      .order("kelas", { ascending: true })
      .order("nama", { ascending: true })
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) {
      console.error("Error fetching siswa:", error.message);
      break;
    }

    if (data && data.length > 0) {
      allStudents = allStudents.concat(data);
      if (data.length < pageSize) {
        hasMore = false;
      } else {
        page++;
      }
    } else {
      hasMore = false;
    }
  }

  console.log(`Berhasil mengambil ${allStudents.length} data murid.`);

  // Format data QR murid
  // Di aplikasi 19points, QR Code murid meng-encode string NIS (siswa.nis)
  const qrDataList = allStudents.map((s, idx) => ({
    no: idx + 1,
    id: s.id,
    nis: s.nis,
    nama: s.nama,
    kelas: s.kelas,
    qr_payload: s.nis, // Isi data yang di-encode ke dalam QR Code
    qr_type: "NIS_PLAIN_TEXT",
    foto_url: s.foto_url || null,
  }));

  // 1. Save JSON file
  const jsonPath = path.resolve("./kumpulan_data_qr_murid.json");
  fs.writeFileSync(jsonPath, JSON.stringify(qrDataList, null, 2), "utf-8");
  console.log(`Saved JSON: ${jsonPath}`);

  // 2. Save CSV file
  const csvHeaders = ["No", "ID_Siswa", "NIS", "Nama_Siswa", "Kelas", "QR_Payload", "QR_Type", "Foto_URL"];
  const csvRows = [
    csvHeaders.join(","),
    ...qrDataList.map((row) =>
      [
        row.no,
        `"${row.id}"`,
        `"${row.nis}"`,
        `"${row.nama.replace(/"/g, '""')}"`,
        `"${row.kelas}"`,
        `"${row.qr_payload}"`,
        `"${row.qr_type}"`,
        `"${row.foto_url || ''}"`,
      ].join(",")
    ),
  ];
  const csvPath = path.resolve("./kumpulan_data_qr_murid.csv");
  fs.writeFileSync(csvPath, csvRows.join("\n"), "utf-8");
  console.log(`Saved CSV: ${csvPath}`);

  return qrDataList;
}

exportAllStudentsQR().catch(console.error);
