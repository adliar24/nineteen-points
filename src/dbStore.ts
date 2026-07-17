import { Siswa, MasterPoin, RiwayatPoin } from "./types";
import { supabase, supabaseAdminAuth } from "./supabaseClient";
import * as XLSX from "xlsx";

// Helper functions for LocalStorage management (fallback/session tracking only)
export const getLocalStorage = <T>(key: string, initialValue: T): T => {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : initialValue;
  } catch (error) {
    console.error("Error reading localStorage key", key, error);
    return initialValue;
  }
};

export const setLocalStorage = <T>(key: string, value: T): void => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error("Error setting localStorage key", key, error);
  }
};

// --- SUPABASE DIRECT INTEGRATIONS ---

export const getSiswaList = async (): Promise<Siswa[]> => {
  const { data, error } = await supabase
    .from("siswa")
    .select("*")
    .order("nama", { ascending: true });
  if (error) {
    console.error("Error fetching students from Supabase:", error);
    return [];
  }
  return data || [];
};

export const saveSiswaList = async (siswa: Siswa[]): Promise<void> => {
  // Instead of rewriting the whole database, we upsert the rows.
  // This helps preserve the logic of existing Excel / bulk imports.
  const { error } = await supabase
    .from("siswa")
    .upsert(siswa);
  if (error) {
    console.error("Error upserting siswa list to Supabase:", error);
    throw error;
  }
};

export const getMasterPoinList = async (): Promise<MasterPoin[]> => {
  const { data, error } = await supabase
    .from("master_poin")
    .select("*")
    .order("nilai_poin", { ascending: false });
  if (error) {
    console.error("Error fetching master points from Supabase:", error);
    return [];
  }
  return data || [];
};

export const saveMasterPoinList = async (poin: MasterPoin[]): Promise<void> => {
  const { error } = await supabase
    .from("master_poin")
    .upsert(poin);
  if (error) {
    console.error("Error saving master points to Supabase:", error);
    throw error;
  }
};

export const getRiwayatList = async (): Promise<RiwayatPoin[]> => {
  const { data, error } = await supabase
    .from("riwayat_poin")
    .select(`
      id,
      siswa_id,
      nilai_diberikan,
      nama_poin,
      guru_email,
      created_at,
      semester,
      siswa (
        nis,
        nama,
        kelas,
        foto_url
      )
    `)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching history from Supabase:", error);
    return [];
  }

  // Format relation to match RiwayatPoin structure
  return (data || []).map((row: any) => ({
    id: row.id,
    siswa_id: row.siswa_id,
    siswa_nama: row.siswa?.nama || "Tidak Dikenal",
    siswa_kelas: row.siswa?.kelas || "-",
    siswa_nis: row.siswa?.nis || "-",
    siswa_foto_url: row.siswa?.foto_url || null,
    nama_poin: row.nama_poin,
    nilai_diberikan: row.nilai_diberikan,
    guru_email: row.guru_email,
    created_at: row.created_at,
    semester: row.semester || "2025/2026 Ganjil",
  }));
};

export const saveRiwayatList = async (riwayat: RiwayatPoin[]): Promise<void> => {
  const { error } = await supabase
    .from("riwayat_poin")
    .upsert(riwayat);
  if (error) {
    console.error("Error saving history list to Supabase:", error);
    throw error;
  }
};

export const addRiwayat = async (
  siswaId: string,
  namaPoin: string,
  nilaiDiberikan: number,
  guruEmail: string,
  semester?: string
): Promise<void> => {
  // With PostgreSQL Triggers configured, inserting a row in 'riwayat_poin'
  // automatically calculates and updates 'total_poin' in 'siswa' table.
  const insertData: Record<string, any> = {
    siswa_id: siswaId,
    nilai_diberikan: nilaiDiberikan,
    nama_poin: namaPoin,
    guru_email: guruEmail,
  };
  if (semester) insertData.semester = semester;

  const { error } = await supabase
    .from("riwayat_poin")
    .insert(insertData);

  if (error) {
    console.error("Error adding history to Supabase:", error);
    throw error;
  }
};

export const deleteRiwayat = async (riwayatId: string): Promise<void> => {
  // With PostgreSQL Triggers configured, deleting a row from 'riwayat_poin'
  // automatically reverts the points in the 'siswa' table.
  const { error } = await supabase
    .from("riwayat_poin")
    .delete()
    .eq("id", riwayatId);

  if (error) {
    console.error("Error deleting history from Supabase:", error);
    throw error;
  }
};

export const updateRiwayat = async (
  riwayatId: string,
  siswaId: string,
  namaPoin: string,
  nilaiDiberikan: number,
  guruEmail: string,
  semester?: string
): Promise<void> => {
  // Delete old entry (trigger reverts points) then insert new entry (trigger adds points)
  const { error: deleteError } = await supabase
    .from("riwayat_poin")
    .delete()
    .eq("id", riwayatId);

  if (deleteError) {
    console.error("Error deleting old riwayat for update:", deleteError);
    throw deleteError;
  }

  const { error: insertError } = await supabase
    .from("riwayat_poin")
    .insert({
      siswa_id: siswaId,
      nilai_diberikan: nilaiDiberikan,
      nama_poin: namaPoin,
      guru_email: guruEmail,
      semester: semester || "2025/2026 Ganjil"
    });

  if (insertError) {
    console.error("Error inserting updated riwayat:", insertError);
    throw insertError;
  }
};

// --- AKHIRI AKTIVITAS ---

export const getRiwayatCount = async (): Promise<number> => {
  const { count, error } = await supabase
    .from("riwayat_poin")
    .select("*", { count: "exact", head: true });

  if (error) {
    console.error("Error counting riwayat:", error);
    return 0;
  }
  return count || 0;
};

export const akhiriAktivitas = async (): Promise<void> => {
  // Step 1: Delete ALL riwayat_poin (DELETE trigger will subtract each entry's nilai_diberikan from siswa.total_poin)
  const { error: deleteError } = await supabase
    .from("riwayat_poin")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000"); // match all rows

  if (deleteError) throw new Error("Gagal menghapus riwayat: " + deleteError.message);

  // Step 2: Reset ALL siswa.total_poin to 0
  const { error: resetError } = await supabase
    .from("siswa")
    .update({ total_poin: 0 })
    .neq("id", "00000000-0000-0000-0000-000000000000");

  if (resetError) throw new Error("Gagal mereset poin siswa: " + resetError.message);
};

// --- EXPORT / IMPORT SUMMARY ---

export interface SummaryRow {
  nis: string;
  nama: string;
  kelas: string;
  total_poin: number;
}

export const exportSummaryData = async (): Promise<SummaryRow[]> => {
  const { data, error } = await supabaseAdminAuth
    .from("siswa")
    .select("nis, nama, kelas, total_poin")
    .order("nama", { ascending: true });

  if (error) throw new Error("Gagal mengambil data siswa: " + error.message);

  return (data || []).map((row: any) => ({
    nis: row.nis || "-",
    nama: row.nama || "-",
    kelas: row.kelas || "-",
    total_poin: row.total_poin ?? 0,
  }));
};

export const importSummaryData = async (rows: SummaryRow[]): Promise<{ updated: number; skipped: number }> => {
  // Load all siswa to map by NIS
  const { data: siswaList, error: fetchError } = await supabase
    .from("siswa")
    .select("id, nis");

  if (fetchError) throw new Error("Gagal mengambil data siswa: " + fetchError.message);

  const nisToId: Record<string, string> = {};
  (siswaList || []).forEach((s: any) => {
    nisToId[s.nis] = s.id;
  });

  let updated = 0;
  let skipped = 0;

  const updatePromises = rows.map(async (row) => {
    const siswaId = nisToId[row.nis];
    if (!siswaId) {
      skipped++;
      return;
    }
    const { error } = await supabase
      .from("siswa")
      .update({ total_poin: row.total_poin })
      .eq("id", siswaId);
    if (error) {
      console.error(`Error updating siswa ${row.nis}:`, error);
      skipped++;
    } else {
      updated++;
    }
  });

  await Promise.all(updatePromises);
  return { updated, skipped };
};
