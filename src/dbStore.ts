import { Siswa, MasterPoin, RiwayatPoin } from "./types";
import { supabase, supabaseAdminAuth } from "./supabaseClient";
import { parseDateSafe } from "./parseDateSafe";
import { queryClient } from "./queryClient";
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

export const fetchAllPages = async <T>(
  queryFn: (from: number, to: number) => Promise<{ data: T[] | null; error: any }>
): Promise<T[]> => {
  let allRows: T[] = [];
  let from = 0;
  const step = 1000;

  while (true) {
    const { data, error } = await queryFn(from, from + step - 1);
    if (error) {
      console.error("Error in fetchAllPages:", error);
      break;
    }
    if (data && data.length > 0) {
      allRows = allRows.concat(data);
      if (data.length < step) break;
      from += step;
    } else {
      break;
    }
  }

  return allRows;
};

export const getSiswaList = async (): Promise<Siswa[]> => {
  return fetchAllPages<Siswa>((from, to) =>
    supabase.from("siswa").select("*").order("nama", { ascending: true }).range(from, to)
  );
};

/**
 * Lightweight siswa list for scanning/search views — excludes the heavy
 * face_embedding column (a ~1KB string per student) those views never need.
 */
export const getSiswaListLight = async (): Promise<Siswa[]> => {
  return fetchAllPages<Siswa>((from, to) =>
    supabase
      .from("siswa")
      .select("id, nis, nama, kelas, total_poin, foto_url")
      .order("nama", { ascending: true })
      .range(from, to)
  );
};

/**
 * Locally adjust total_poin of one (or many) siswa in the ["siswa"] React Query
 * cache after a point/attendance write. Avoids re-fetching the whole siswa
 * table (with heavy face embeddings) after every single scan.
 */
export const updateCachedSiswaPoin = (siswaId: string, delta: number): void => {
  queryClient.setQueryData<Siswa[]>(["siswa"], (old) => {
    if (!old) return old;
    return old.map((s) =>
      s.id === siswaId ? { ...s, total_poin: (s.total_poin || 0) + delta } : s
    );
  });
};

export const updateCachedSiswaPoinBatch = (updates: { siswaId: string; delta: number }[]): void => {
  if (updates.length === 0) return;
  queryClient.setQueryData<Siswa[]>(["siswa"], (old) => {
    if (!old) return old;
    const map = new Map(updates.map((u) => [u.siswaId, u.delta]));
    return old.map((s) => {
      const delta = map.get(s.id);
      return delta === undefined ? s : { ...s, total_poin: (s.total_poin || 0) + delta };
    });
  });
};

/**
 * Fetches riwayat_poin and returns a map of siswa_id → { positif, negatif }
 * where positif = total nilai_diberikan > 0, negatif = absolute total nilai_diberikan < 0
 *
 * Only 2 columns are pulled to keep the payload small even with large histories.
 */
export const getSiswaSeparatePoinMap = async (): Promise<
  Record<string, { positif: number; negatif: number }>
> => {
  const allRiwayat = await fetchAllPages<{ siswa_id: string; nilai_diberikan: number }>(
    (from, to) =>
      supabase
        .from("riwayat_poin")
        .select("siswa_id, nilai_diberikan")
        .range(from, to)
  );

  const map: Record<string, { positif: number; negatif: number }> = {};
  for (const r of allRiwayat) {
    if (!map[r.siswa_id]) map[r.siswa_id] = { positif: 0, negatif: 0 };
    if (r.nilai_diberikan > 0) {
      map[r.siswa_id].positif += r.nilai_diberikan;
    } else if (r.nilai_diberikan < 0) {
      map[r.siswa_id].negatif += Math.abs(r.nilai_diberikan);
    }
  }
  return map;
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

// --- SERVER-SIDE PAGINATION ---

export interface PaginatedRiwayatParams {
  page: number;
  limit: number;
  search?: string;
  filterType?: "Semua" | "Positif" | "Negatif";
  sortOrder?: "terbaru" | "terlama";
}

export interface PaginatedRiwayatResult {
  data: RiwayatPoin[];
  totalCount: number;
  totalPages: number;
}

export const getRiwayatListPaginated = async (params: PaginatedRiwayatParams): Promise<PaginatedRiwayatResult> => {
  const { page, limit, search = "", filterType = "Semua", sortOrder = "terbaru" } = params;
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = supabase
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
    `, { count: "exact" });

  // Server-side search: match on siswa.nama, siswa.nis, nama_poin, guru_email
  if (search) {
    const pattern = `%${search}%`;
    query = query.or(`nama_poin.ilike.${pattern},guru_email.ilike.${pattern},siswa.nama.ilike.${pattern},siswa.nis.ilike.${pattern}`);
  }

  // Server-side filter on nilai_diberikan
  if (filterType === "Positif") {
    query = query.gt("nilai_diberikan", 0);
  } else if (filterType === "Negatif") {
    query = query.lt("nilai_diberikan", 0);
  }

  // Server-side sort
  query = query.order("created_at", { ascending: sortOrder === "terlama" });

  // Pagination
  query = query.range(from, to);

  const { data, error, count } = await query;

  if (error) {
    console.error("Error fetching paginated riwayat:", error);
    return { data: [], totalCount: 0, totalPages: 0 };
  }

  const totalCount = count || 0;
  const totalPages = Math.ceil(totalCount / limit);

  const mapped = (data || []).map((row: any) => ({
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

  return { data: mapped, totalCount, totalPages };
};

export const getRiwayatList = async (): Promise<RiwayatPoin[]> => {
  const data = await fetchAllPages<any>((from, to) =>
    supabase
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
      .order("created_at", { ascending: false })
      .range(from, to)
  );

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
  // Safety: fetch old entry before deleting, so we can restore if insert fails
  const { data: oldEntry, error: fetchError } = await supabase
    .from("riwayat_poin")
    .select("id, siswa_id, nama_poin, nilai_diberikan, guru_email, semester")
    .eq("id", riwayatId)
    .single();

  if (fetchError || !oldEntry) {
    throw new Error("Gagal mengambil data riwayat lama: " + (fetchError?.message || "Data tidak ditemukan"));
  }

  // Delete old entry (trigger reverts points)
  const { error: deleteError } = await supabase
    .from("riwayat_poin")
    .delete()
    .eq("id", riwayatId);

  if (deleteError) {
    console.error("Error deleting old riwayat for update:", deleteError);
    throw deleteError;
  }

  // Insert new entry (trigger adds points)
  const { error: insertError } = await supabase
    .from("riwayat_poin")
    .insert({
      siswa_id: siswaId,
      nilai_diberikan: nilaiDiberikan,
      nama_poin: namaPoin,
      guru_email: guruEmail,
      semester: semester || oldEntry.semester
    });

  if (insertError) {
    // Rollback: re-insert the old entry to restore points
    console.error("Error inserting updated riwayat, rolling back:", insertError);
    const { error: rollbackError } = await supabase
      .from("riwayat_poin")
      .insert({
        id: oldEntry.id,
        siswa_id: oldEntry.siswa_id,
        nilai_diberikan: oldEntry.nilai_diberikan,
        nama_poin: oldEntry.nama_poin,
        guru_email: oldEntry.guru_email,
        semester: oldEntry.semester
      });

    if (rollbackError) {
      throw new Error("Update gagal dan rollback juga gagal. Hubungi admin. Error: " + insertError.message);
    }
    throw new Error("Update gagal, data asli berhasil dipulihkan: " + insertError.message);
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
  id?: string;
  nis: string;
  nama: string;
  kelas: string;
  poin_positif?: number;
  poin_negatif?: number;
  total_poin?: number;
}

export const exportSummaryData = async (): Promise<SummaryRow[]> => {
  const data = await fetchAllPages<any>((from, to) =>
    supabaseAdminAuth
      .from("siswa")
      .select("id, nis, nama, kelas")
      .order("nama", { ascending: true })
      .range(from, to)
  );

  const poinMap = await getSiswaSeparatePoinMap();

  return (data || []).map((row: any) => {
    const split = poinMap[row.id] || { positif: 0, negatif: 0 };
    return {
      id: row.id,
      nis: row.nis || "-",
      nama: row.nama || "-",
      kelas: row.kelas || "-",
      poin_positif: split.positif,
      poin_negatif: split.negatif,
    };
  });
};

export const importSummaryData = async (rows: SummaryRow[]): Promise<{ updated: number; skipped: number }> => {
  // Load all siswa to map by NIS
  const siswaList = await fetchAllPages<any>((from, to) =>
    supabase.from("siswa").select("id, nis").range(from, to)
  );

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
    const valToUpdate = row.total_poin ?? ((row.poin_positif || 0) - (row.poin_negatif || 0));
    const { error } = await supabase
      .from("siswa")
      .update({ total_poin: valToUpdate })
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

// --- ATTENDANCE SYSTEM INTEGRATIONS ---

export interface AturanKehadiran {
  status: "tepat_waktu" | "telat_5" | "telat_10" | "telat_15" | "alfa" | "sakit" | "izin";
  label: string;
  nilai_poin: number;
}

export const getKehadiranListByPeriod = async (startDate: string, endDate: string): Promise<any[]> => {
  const { data, error } = await supabase
    .from("kehadiran")
    .select(`
      id,
      siswa_id,
      tanggal,
      status,
      nilai_poin_diberikan,
      pencatat_email,
      created_at
    `)
    .gte("tanggal", startDate)
    .lte("tanggal", endDate);
  if (error) {
    console.error("Error fetching attendance by period:", error);
    return [];
  }
  return data || [];
};

export interface KehadiranRow {
  id: string;
  siswa_id: string;
  siswa_nis: string;
  siswa_nama: string;
  siswa_kelas: string;
  siswa_foto_url: string | null;
  tanggal: string;
  status: string;
  nilai_poin_diberikan: number;
  pencatat_email: string;
  created_at: string;
}

export const getAturanKehadiranList = async (): Promise<AturanKehadiran[]> => {
  const { data, error } = await supabase
    .from("aturan_kehadiran")
    .select("*")
    .order("nilai_poin", { ascending: false });
  if (error) {
    console.error("Error fetching attendance rules:", error);
    return [];
  }
  return data || [];
};

export const updateAturanKehadiranList = async (rules: AturanKehadiran[]): Promise<void> => {
  const { error } = await supabase
    .from("aturan_kehadiran")
    .upsert(rules);
  if (error) {
    console.error("Error updating attendance rules:", error);
    throw error;
  }
};

export const getKehadiranListByDate = async (date: string): Promise<KehadiranRow[]> => {
  const { data, error } = await supabase
    .from("kehadiran")
    .select(`
      id,
      siswa_id,
      tanggal,
      status,
      nilai_poin_diberikan,
      pencatat_email,
      created_at,
      siswa (
        nis,
        nama,
        kelas,
        foto_url
      )
    `)
    .eq("tanggal", date);
  if (error) {
    console.error("Error fetching attendance by date:", error);
    return [];
  }
  return (data || []).map((row: any) => ({
    id: row.id,
    siswa_id: row.siswa_id,
    siswa_nis: row.siswa?.nis || "-",
    siswa_nama: row.siswa?.nama || "Tidak Dikenal",
    siswa_kelas: row.siswa?.kelas || "-",
    siswa_foto_url: row.siswa?.foto_url || null,
    tanggal: row.tanggal,
    status: row.status,
    nilai_poin_diberikan: row.nilai_poin_diberikan,
    pencatat_email: row.pencatat_email,
    created_at: row.created_at
  }));
};

export const saveKehadiran = async (
  siswaId: string,
  status: string,
  points: number,
  email: string,
  date?: string
): Promise<void> => {
  const recordDate = date || new Date().toISOString().slice(0, 10);
  const { error } = await supabase
    .from("kehadiran")
    .upsert({
      siswa_id: siswaId,
      tanggal: recordDate,
      status: status,
      nilai_poin_diberikan: points,
      pencatat_email: email
    }, { onConflict: "siswa_id,tanggal" });
  if (error) {
    console.error("Error saving attendance record:", error);
    throw error;
  }
};

export const deleteKehadiran = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from("kehadiran")
    .delete()
    .eq("id", id);
  if (error) {
    console.error("Error deleting attendance record:", error);
    throw error;
  }
};

export const setSisaSiswaSebagaiAlfa = async (email: string, date?: string): Promise<{ updated: number }> => {
  const recordDate = date || new Date().toISOString().slice(0, 10);
  
  // 1. Get all students
  const { data: students, error: sErr } = await supabase
    .from("siswa")
    .select("id");
  if (sErr || !students) {
    throw new Error("Gagal mengambil data siswa: " + (sErr?.message || "Data kosong"));
  }

  // 2. Get students who already have attendance on this date
  const { data: present, error: pErr } = await supabase
    .from("kehadiran")
    .select("siswa_id")
    .eq("tanggal", recordDate);
  if (pErr) {
    throw new Error("Gagal memeriksa data absensi: " + pErr.message);
  }

  const presentSet = new Set((present || []).map((p: any) => p.siswa_id));
  const absentStudents = students.filter(s => !presentSet.has(s.id));

  if (absentStudents.length === 0) {
    return { updated: 0 };
  }

  // 3. Get the alfa points configuration
  const { data: alfaRule, error: rErr } = await supabase
    .from("aturan_kehadiran")
    .select("nilai_poin")
    .eq("status", "alfa")
    .single();
  
  const alfaPoints = rErr || !alfaRule ? -25 : alfaRule.nilai_poin;

  // 4. Insert Alfa records in bulk
  const insertRows = absentStudents.map(s => ({
    siswa_id: s.id,
    tanggal: recordDate,
    status: "alfa",
    nilai_poin_diberikan: alfaPoints,
    pencatat_email: email
  }));

  const { error: insErr } = await supabase
    .from("kehadiran")
    .insert(insertRows);

  if (insErr) {
    console.error("Error bulk inserting alfa records:", insErr);
    throw insErr;
  }

  return { updated: absentStudents.length };
};

// --- TEACHER SYSTEM INTEGRATIONS ---
import { KehadiranGuru, KegiatanGuru } from "./types";

export const getTodayKehadiranGuru = async (userId: string, dateStr: string): Promise<any[]> => {
  const { data, error } = await supabase
    .from("kehadiran_guru")
    .select("*")
    .eq("user_id", userId)
    .eq("tanggal", dateStr);

  if (error) {
    console.error("Error fetching today's teacher attendance:", error);
    return [];
  }
  return data || [];
};

export const getCurrentTimeString = (): string => {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
};

export const checkInGuru = async (
  userId: string,
  dateStr: string,
  timeStr: string,
  status: 'hadir' | 'sakit' | 'izin' | 'alfa',
  keterangan: string,
  jadwalId: string
): Promise<any> => {
  const finalTime = (timeStr || getCurrentTimeString()).replace(/\./g, ":");

  const { data: existing } = await supabase
    .from("kehadiran_guru")
    .select("id")
    .eq("jadwal_id", jadwalId)
    .eq("tanggal", dateStr)
    .maybeSingle();

  if (existing) {
    const { data, error } = await supabase
      .from("kehadiran_guru")
      .update({
        user_id: userId,
        status,
        jam_masuk: finalTime,
        keterangan: keterangan || null
      })
      .eq("id", existing.id)
      .select()
      .single();

    if (error) throw error;
    return data;
  } else {
    const { data, error } = await supabase
      .from("kehadiran_guru")
      .insert({
        user_id: userId,
        tanggal: dateStr,
        jam_masuk: finalTime,
        status,
        keterangan: keterangan || null,
        jadwal_id: jadwalId
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }
};

export const getKehadiranGuruHistory = async (userId: string): Promise<any[]> => {
  const { data, error } = await supabase
    .from("kehadiran_guru")
    .select(`
      *,
      jadwal_guru:jadwal_id (
        hari,
        mata_pelajaran,
        kelas,
        jam_mulai,
        jam_selesai
      )
    `)
    .eq("user_id", userId)
    .order("tanggal", { ascending: false })
    .order("jam_masuk", { ascending: false });

  if (error) {
    console.error("Error fetching teacher attendance history:", error);
    return [];
  }
  return data || [];
};

export const getTeacherProfiles = async (): Promise<any[]> => {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, nama, role")
    .eq("role", "guru")
    .order("nama");

  if (error) {
    console.error("Error fetching teacher profiles:", error);
    return [];
  }
  return data || [];
};

/**
 * Fetch all certifiable profiles: guru, tata_usaha, and murid (siswa role)
 */
export const getAllCertifiableProfiles = async (): Promise<any[]> => {
  const PAGE_SIZE = 1000;
  let from = 0;
  let allData: any[] = [];

  while (true) {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, email, nama, role")
      .in("role", ["guru", "tata_usaha", "murid", "siswa"])
      .order("nama")
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      console.error("Error fetching certifiable profiles:", error);
      break;
    }

    if (data) {
      allData = allData.concat(data);
      if (data.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    } else {
      break;
    }
  }

  return allData;
};

export const getKehadiranGuruAll = async (dateStr: string): Promise<any[]> => {
  const days = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
  const dayName = days[parseDateSafe(dateStr).getDay()];

  const { data: schedules, error: sErr } = await supabase
    .from("jadwal_guru")
    .select(`
      *,
      profiles:user_id ( nama, email )
    `)
    .eq("hari", dayName);

  if (sErr) {
    console.error("Error fetching schedules for attendance:", sErr);
    return [];
  }

  const { data: attendance, error: aErr } = await supabase
    .from("kehadiran_guru")
    .select("*")
    .eq("tanggal", dateStr);

  if (aErr) {
    console.error("Error fetching teacher attendance:", aErr);
    return [];
  }

  return (schedules || []).map(sched => {
    const attRecord = (attendance || []).find(a => a.jadwal_id === sched.id);
    return {
      id: attRecord?.id || null,
      jadwal_id: sched.id,
      user_id: sched.user_id,
      user_nama: sched.profiles?.nama || "Tidak Dikenal",
      user_email: sched.profiles?.email || "",
      hari: sched.hari,
      mata_pelajaran: sched.mata_pelajaran,
      kelas: sched.kelas,
      jam_mulai: sched.jam_mulai,
      jam_selesai: sched.jam_selesai,
      tanggal: dateStr,
      status: attRecord?.status || null,
      jam_masuk: attRecord?.jam_masuk || null,
      keterangan: attRecord?.keterangan || null
    };
  });
};

export const saveKehadiranGuruManual = async (
  userId: string,
  dateStr: string,
  status: 'hadir' | 'sakit' | 'izin' | 'alfa',
  jamMasuk: string | null,
  keterangan: string | null,
  jadwalId: string
): Promise<void> => {
  const finalJamMasuk = (jamMasuk || getCurrentTimeString()).replace(/\./g, ":");

  const { data: existing } = await supabase
    .from("kehadiran_guru")
    .select("id")
    .eq("jadwal_id", jadwalId)
    .eq("tanggal", dateStr)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("kehadiran_guru")
      .update({
        user_id: userId,
        status,
        jam_masuk: finalJamMasuk,
        keterangan: keterangan || null
      })
      .eq("id", existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from("kehadiran_guru")
      .insert({
        user_id: userId,
        jadwal_id: jadwalId,
        tanggal: dateStr,
        status,
        jam_masuk: finalJamMasuk,
        keterangan: keterangan || null
      });
    if (error) throw error;
  }
};

export const getKegiatanGuruList = async (userId: string): Promise<KegiatanGuru[]> => {
  const { data, error } = await supabase
    .from("kegiatan_guru")
    .select("*")
    .eq("user_id", userId)
    .order("tanggal_kegiatan", { ascending: false });

  if (error) {
    console.error("Error fetching teacher kegiatan list:", error);
    return [];
  }
  return data || [];
};

export const getAllKegiatanGuru = async (): Promise<any[]> => {
  const { data, error } = await supabase
    .from("kegiatan_guru")
    .select(`
      *,
      profiles:user_id ( nama, email )
    `)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching all kegiatan guru:", error);
    return [];
  }

  return (data || []).map(row => ({
    ...row,
    user_nama: (row as any).profiles?.nama || "Tidak Dikenal",
    user_email: (row as any).profiles?.email || ""
  }));
};

export const addKegiatanGuru = async (
  userId: string,
  namaKegiatan: string,
  tanggalKegiatan: string,
  peran: string,
  noSertifikat: string,
  penyelenggara: string,
  durasiJam?: number,
  materiJp?: any[] | null
): Promise<void> => {
  const { error } = await supabase
    .from("kegiatan_guru")
    .insert({
      user_id: userId,
      nama_kegiatan: namaKegiatan,
      tanggal_kegiatan: tanggalKegiatan,
      peran,
      no_sertifikat: noSertifikat || null,
      penyelenggara,
      durasi_jam: durasiJam || null,
      materi_jp: materiJp || null
    });

  if (error) throw error;
};

export const addKegiatanGuruBulk = async (
  userIds: string[],
  namaKegiatan: string,
  tanggalKegiatan: string,
  peran: string,
  noSertifikat: string,
  penyelenggara: string,
  durasiJam?: number,
  materiJp?: any[] | null
): Promise<void> => {
  if (userIds.length === 0) return;
  const rows = userIds.map(userId => ({
    user_id: userId,
    nama_kegiatan: namaKegiatan,
    tanggal_kegiatan: tanggalKegiatan,
    peran,
    no_sertifikat: noSertifikat || null,
    penyelenggara,
    durasi_jam: durasiJam || null,
    materi_jp: materiJp || null
  }));

  const { error } = await supabase
    .from("kegiatan_guru")
    .insert(rows);

  if (error) throw error;
};

export const deleteKegiatanGuru = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from("kegiatan_guru")
    .delete()
    .eq("id", id);

  if (error) throw error;
};

export const deleteKegiatanGuruBulk = async (ids: string[]): Promise<void> => {
  const { error } = await supabase
    .from("kegiatan_guru")
    .delete()
    .in("id", ids);

  if (error) throw error;
};

export const deleteAllKegiatanGuru = async (): Promise<void> => {
  const { error } = await supabase
    .from("kegiatan_guru")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");

  if (error) throw error;
};

// =========================================================================
// SHOLAT SCAN SYSTEM
// =========================================================================

export const SHOLAT_POIN_NAMA = "Sholat Berjamaah";
export const SHOLAT_POIN_VALUE = 2;

export const SHOLAT_DHUHA_POIN_NAMA = "Sholat Dhuha";
export const SHOLAT_DHUHA_POIN_VALUE = 2;

export const SHOLAT_JUMAT_POIN_NAMA = "Sholat Jumat";
export const SHOLAT_JUMAT_POIN_VALUE = 2;

export const checkSholatToday = async (siswaId: string, namaPoin: string = SHOLAT_POIN_NAMA): Promise<boolean> => {
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await supabase
    .from("riwayat_poin")
    .select("id")
    .eq("siswa_id", siswaId)
    .eq("nama_poin", namaPoin)
    .gte("created_at", `${today}T00:00:00`)
    .lte("created_at", `${today}T23:59:59`)
    .limit(1);
  return (data && data.length > 0);
};

export const getSholatRecapToday = async (namaPoin: string = SHOLAT_POIN_NAMA): Promise<any[]> => {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("riwayat_poin")
    .select(`
      id,
      siswa_id,
      guru_email,
      created_at,
      siswa (
        nis,
        nama,
        kelas
      )
    `)
    .eq("nama_poin", namaPoin)
    .gte("created_at", `${today}T00:00:00`)
    .lte("created_at", `${today}T23:59:59`)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("Error fetching sholat recap today:", error);
    return [];
  }
  return (data || []).map((row: any) => ({
    id: row.id,
    siswa_id: row.siswa_id,
    siswa_nama: row.siswa?.nama || "Tidak Dikenal",
    siswa_kelas: row.siswa?.kelas || "-",
    siswa_nis: row.siswa?.nis || "-",
    guru_email: row.guru_email,
    created_at: row.created_at,
  }));
};

export interface RekapGabunganRow {
  siswa_id: string;
  siswa_nis: string;
  siswa_nama: string;
  siswa_kelas: string;
  kehadiran: Record<string, string>;
  sholat: Record<string, string>;
  sholatDhuha: Record<string, string>;
  sholatJumat: Record<string, string>;
}

export const getRekapGabungan = async (startDate: string, endDate: string): Promise<RekapGabunganRow[]> => {
  const { data: siswaList, error: sErr } = await supabase
    .from("siswa")
    .select("id, nis, nama, kelas")
    .order("nama", { ascending: true });
  if (sErr || !siswaList) return [];

  const { data: kehadiranData } = await supabase
    .from("kehadiran")
    .select("siswa_id, tanggal, status")
    .gte("tanggal", startDate)
    .lte("tanggal", endDate);

  const { data: sholatData } = await supabase
    .from("riwayat_poin")
    .select("siswa_id, created_at, nama_poin")
    .in("nama_poin", [SHOLAT_POIN_NAMA, SHOLAT_DHUHA_POIN_NAMA, SHOLAT_JUMAT_POIN_NAMA])
    .gte("created_at", `${startDate}T00:00:00`)
    .lte("created_at", `${endDate}T23:59:59`);

  const kehadiranMap: Record<string, Record<string, string>> = {};
  (kehadiranData || []).forEach((k: any) => {
    if (!kehadiranMap[k.siswa_id]) kehadiranMap[k.siswa_id] = {};
    kehadiranMap[k.siswa_id][k.tanggal] = k.status;
  });

  const sholatMap: Record<string, Record<string, string>> = {};
  const sholatDhuhaMap: Record<string, Record<string, string>> = {};
  const sholatJumatMap: Record<string, Record<string, string>> = {};

  (sholatData || []).forEach((s: any) => {
    const dateStr = s.created_at.slice(0, 10);
    if (s.nama_poin === SHOLAT_DHUHA_POIN_NAMA) {
      if (!sholatDhuhaMap[s.siswa_id]) sholatDhuhaMap[s.siswa_id] = {};
      sholatDhuhaMap[s.siswa_id][dateStr] = "dhuha";
    } else if (s.nama_poin === SHOLAT_JUMAT_POIN_NAMA) {
      if (!sholatJumatMap[s.siswa_id]) sholatJumatMap[s.siswa_id] = {};
      sholatJumatMap[s.siswa_id][dateStr] = "jumat";
    } else {
      if (!sholatMap[s.siswa_id]) sholatMap[s.siswa_id] = {};
      sholatMap[s.siswa_id][dateStr] = "sholat";
    }
  });

  return siswaList.map(s => ({
    siswa_id: s.id,
    siswa_nis: s.nis,
    siswa_nama: s.nama,
    siswa_kelas: s.kelas,
    kehadiran: kehadiranMap[s.id] || {},
    sholat: sholatMap[s.id] || {},
    sholatDhuha: sholatDhuhaMap[s.id] || {},
    sholatJumat: sholatJumatMap[s.id] || {},
  }));
};

// =========================================================================
// JADWAL GURU DATABASE SERVICES
// =========================================================================

export const getJadwalGuruList = async (userId?: string): Promise<any[]> => {
  let query = supabase
    .from("jadwal_guru")
    .select(`
      *,
      profiles:user_id ( nama, email )
    `);

  if (userId) {
    query = query.eq("user_id", userId);
  }

  const { data, error } = await query.order("hari", { ascending: true });

  if (error) {
    console.error("Error fetching teacher jadwal list:", error);
    return [];
  }

  return (data || []).map(row => ({
    ...row,
    user_nama: (row as any).profiles?.nama || "Tidak Dikenal",
    user_email: (row as any).profiles?.email || ""
  }));
};

export const addJadwalGuru = async (
  userId: string,
  hari: string,
  mataPelajaran: string,
  kelas: string,
  jamMulai: string,
  jamSelesai: string
): Promise<void> => {
  const { error } = await supabase
    .from("jadwal_guru")
    .insert({
      user_id: userId,
      hari,
      mata_pelajaran: mataPelajaran,
      kelas,
      jam_mulai: jamMulai,
      jam_selesai: jamSelesai
    });

  if (error) throw error;
};

export const deleteJadwalGuru = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from("jadwal_guru")
    .delete()
    .eq("id", id);

  if (error) throw error;
};
