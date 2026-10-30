import { TujuhKaih, HabitEvaluation, BelajarItem, Siswa } from "../types";
import { formatLocalDate, parseDateSafe } from "../parseDateSafe";
import * as XLSX from "xlsx";

/**
 * Target waktu default untuk 7 Kebiasaan Anak Indonesia Hebat
 * 1. Bangun Pagi: <= 05:30
 * 7. Tidur Cepat: <= 22:00
 */
export const TARGET_BANGUN_PAGI = "05:30";
export const TARGET_TIDUR_CEPAT = "22:00";

/**
 * Mengambil waktu jam sekarang perangkat dalam format "HH:mm"
 */
export function getCurrentDeviceTime(): string {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

/**
 * Mengecek apakah waktu bangun memenuhi target bangun pagi (<= 05:30)
 */
export function isBangunPagiTargetMet(timeStr: string | null | undefined): boolean {
  if (!timeStr) return false;
  return timeStr <= TARGET_BANGUN_PAGI;
}

/**
 * Mengecek apakah waktu tidur memenuhi target tidur cepat (<= 22:00 dan >= 19:00)
 */
export function isTidurCepatTargetMet(timeStr: string | null | undefined): boolean {
  if (!timeStr) return false;
  // Rentang tidur malam: antara jam 19:00 sampai 22:00 dianggap cepat
  return timeStr <= TARGET_TIDUR_CEPAT && timeStr >= "19:00";
}

/**
 * Buat template data kosong 7 KAIH untuk siswa dan tanggal tertentu
 */
export function createDefault7Kaih(siswaId: string, tanggal: string): TujuhKaih {
  return {
    siswa_id: siswaId,
    tanggal,
    bangun_pagi_waktu: null,
    bangun_pagi_target_sesuai: false,
    salat_subuh: false,
    salat_zuhur: false,
    salat_asar: false,
    salat_magrib: false,
    salat_isya: false,
    mengaji_status: "belum_diisi",
    mengaji_surah: "",
    mengaji_ayat_awal: null,
    mengaji_ayat_akhir: null,
    mengaji_catatan: "",
    olahraga_status: "belum_diisi",
    olahraga_jenis: "",
    olahraga_durasi_menit: null,
    sarapan_status: "belum_diisi",
    sarapan_bergizi: false,
    sarapan_menu: "",
    makan_siang_status: "belum_diisi",
    makan_siang_bergizi: false,
    makan_siang_menu: "",
    makan_malam_status: "belum_diisi",
    makan_malam_bergizi: false,
    makan_malam_menu: "",
    belajar_kegiatan: [],
    belajar_total_durasi: 0,
    bermasyarakat_status: "belum_diisi",
    bermasyarakat_kegiatan: "",
    tidur_cepat_waktu: null,
    tidur_cepat_target_sesuai: false,
    progres_persen: 0,
    is_final: false,
    waktu_kirim_final: null,
  };
}

/**
 * Evaluasi status tiap kebiasaan dari 7 Kebiasaan Anak Indonesia Hebat (7 KAIH):
 * Nomenklatur Resmi:
 * 1. Bangun Pagi
 * 2. Beribadah (termasuk pendukung Mengaji)
 * 3. Berolahraga
 * 4. Makan Sehat dan Bergizi
 * 5. Gemar Belajar
 * 6. Bermasyarakat
 * 7. Tidur Cepat
 */
export function evaluate7KaihHabits(item: Partial<TujuhKaih>): HabitEvaluation[] {
  // 1. Bangun Pagi
  let statusBangun: 'selesai' | 'belum_dilakukan' | 'belum_diisi' = 'belum_diisi';
  let summaryBangun = 'Belum diisi';
  const targetBangunMet = isBangunPagiTargetMet(item.bangun_pagi_waktu);

  if (item.bangun_pagi_waktu && item.bangun_pagi_waktu.trim() !== "") {
    statusBangun = 'selesai';
    summaryBangun = `Bangun pukul ${item.bangun_pagi_waktu}${targetBangunMet ? " (Target Sesuai ⭐)" : ""}`;
  }

  // 2. Beribadah (Salat 5 Waktu + Pendukung Mengaji)
  let statusIbadah: 'selesai' | 'belum_dilakukan' | 'belum_diisi' = 'belum_diisi';
  let summaryIbadah = 'Belum diisi';
  const salatCount = [
    item.salat_subuh,
    item.salat_zuhur,
    item.salat_asar,
    item.salat_magrib,
    item.salat_isya
  ].filter(Boolean).length;
  const mengajiDone = item.mengaji_status === 'sudah';
  const mengajiUndone = item.mengaji_status === 'belum';

  if (salatCount === 0 && item.mengaji_status === 'belum_diisi') {
    statusIbadah = 'belum_diisi';
    summaryIbadah = 'Belum diisi';
  } else if (salatCount > 0 || mengajiDone) {
    statusIbadah = 'selesai';
    const detailList: string[] = [];
    if (salatCount > 0) detailList.push(`${salatCount}/5 Salat`);
    if (mengajiDone) {
      detailList.push(item.mengaji_surah ? `Tadarus ${item.mengaji_surah}` : 'Tadarus/Mengaji');
    }
    summaryIbadah = detailList.join(' • ');
  } else if (salatCount === 0 && mengajiUndone) {
    statusIbadah = 'belum_dilakukan';
    summaryIbadah = 'Belum dilaksanakan';
  } else {
    statusIbadah = 'belum_diisi';
    summaryIbadah = 'Belum diisi';
  }

  // 3. Berolahraga
  let statusOlahraga: 'selesai' | 'belum_dilakukan' | 'belum_diisi' = 'belum_diisi';
  let summaryOlahraga = 'Belum diisi';
  if (item.olahraga_status === 'sudah') {
    statusOlahraga = 'selesai';
    const detail = [
      item.olahraga_jenis || 'Olahraga',
      item.olahraga_durasi_menit ? `${item.olahraga_durasi_menit} menit` : null
    ].filter(Boolean).join(' - ');
    summaryOlahraga = detail;
  } else if (item.olahraga_status === 'belum') {
    statusOlahraga = 'belum_dilakukan';
    summaryOlahraga = 'Belum berolahraga hari ini';
  }

  // 4. Makan Sehat dan Bergizi
  let statusMakan: 'selesai' | 'belum_dilakukan' | 'belum_diisi' = 'belum_diisi';
  let summaryMakan = 'Belum diisi';
  const makanSudah = [
    item.sarapan_status === 'sudah',
    item.makan_siang_status === 'sudah',
    item.makan_malam_status === 'sudah'
  ].filter(Boolean).length;
  const makanSemuaBelumDiisi = 
    (item.sarapan_status === 'belum_diisi' || !item.sarapan_status) &&
    (item.makan_siang_status === 'belum_diisi' || !item.makan_siang_status) &&
    (item.makan_malam_status === 'belum_diisi' || !item.makan_malam_status);

  if (makanSemuaBelumDiisi) {
    statusMakan = 'belum_diisi';
    summaryMakan = 'Belum diisi';
  } else if (makanSudah > 0) {
    statusMakan = 'selesai';
    const bergiziCount = [
      item.sarapan_status === 'sudah' && item.sarapan_bergizi,
      item.makan_siang_status === 'sudah' && item.makan_siang_bergizi,
      item.makan_malam_status === 'sudah' && item.makan_malam_bergizi
    ].filter(Boolean).length;
    summaryMakan = `${makanSudah}x makan (${bergiziCount}x menu bergizi)`;
  } else {
    statusMakan = 'belum_dilakukan';
    summaryMakan = 'Belum makan sehat';
  }

  // 5. Gemar Belajar
  let statusBelajar: 'selesai' | 'belum_dilakukan' | 'belum_diisi' = 'belum_diisi';
  let summaryBelajar = 'Belum diisi';
  const totalBelajar = Number(item.belajar_total_durasi || 0);
  const kegiatanBelajar = Array.isArray(item.belajar_kegiatan) ? item.belajar_kegiatan : [];

  if (kegiatanBelajar.length === 0 && totalBelajar === 0) {
    statusBelajar = 'belum_diisi';
    summaryBelajar = 'Belum diisi';
  } else if (totalBelajar > 0 || kegiatanBelajar.length > 0) {
    statusBelajar = 'selesai';
    summaryBelajar = `${totalBelajar} menit (${kegiatanBelajar.length} kegiatan)`;
  } else {
    statusBelajar = 'belum_dilakukan';
    summaryBelajar = '0 menit belajar';
  }

  // 6. Bermasyarakat
  let statusMasyarakat: 'selesai' | 'belum_dilakukan' | 'belum_diisi' = 'belum_diisi';
  let summaryMasyarakat = 'Belum diisi';
  if (item.bermasyarakat_status === 'sudah') {
    statusMasyarakat = 'selesai';
    summaryMasyarakat = item.bermasyarakat_kegiatan?.trim() 
      ? item.bermasyarakat_kegiatan.trim() 
      : 'Kegiatan sosial / gotong royong';
  } else if (item.bermasyarakat_status === 'belum') {
    statusMasyarakat = 'belum_dilakukan';
    summaryMasyarakat = 'Belum bermasyarakat hari ini';
  }

  // 7. Tidur Cepat
  let statusTidur: 'selesai' | 'belum_dilakukan' | 'belum_diisi' = 'belum_diisi';
  let summaryTidur = 'Belum diisi';
  const targetTidurMet = isTidurCepatTargetMet(item.tidur_cepat_waktu);

  if (item.tidur_cepat_waktu && item.tidur_cepat_waktu.trim() !== "") {
    statusTidur = 'selesai';
    summaryTidur = `Tidur pukul ${item.tidur_cepat_waktu}${targetTidurMet ? " (Target Sesuai ⭐)" : ""}`;
  }

  return [
    {
      id: "bangun_pagi",
      title: "Bangun Pagi",
      nomenklatur: "1. Bangun Pagi",
      status: statusBangun,
      summary: summaryBangun,
      targetMet: targetBangunMet
    },
    {
      id: "beribadah",
      title: "Beribadah",
      nomenklatur: "2. Beribadah",
      status: statusIbadah,
      summary: summaryIbadah
    },
    {
      id: "berolahraga",
      title: "Berolahraga",
      nomenklatur: "3. Berolahraga",
      status: statusOlahraga,
      summary: summaryOlahraga
    },
    {
      id: "makan_sehat",
      title: "Makan Sehat dan Bergizi",
      nomenklatur: "4. Makan Sehat dan Bergizi",
      status: statusMakan,
      summary: summaryMakan
    },
    {
      id: "gemar_belajar",
      title: "Gemar Belajar",
      nomenklatur: "5. Gemar Belajar",
      status: statusBelajar,
      summary: summaryBelajar
    },
    {
      id: "bermasyarakat",
      title: "Bermasyarakat",
      nomenklatur: "6. Bermasyarakat",
      status: statusMasyarakat,
      summary: summaryMasyarakat
    },
    {
      id: "tidur_cepat",
      title: "Tidur Cepat",
      nomenklatur: "7. Tidur Cepat",
      status: statusTidur,
      summary: summaryTidur,
      targetMet: targetTidurMet
    }
  ];
}

/**
 * Menghitung persentase progres harian berdasarkan 7 Kebiasaan Utama.
 * Rumus: (jumlah kebiasaan dengan status 'selesai' / 7) * 100%
 */
export function calculate7KaihProgress(item: Partial<TujuhKaih>): number {
  const evaluations = evaluate7KaihHabits(item);
  const completedCount = evaluations.filter((h) => h.status === 'selesai').length;
  return Math.round((completedCount / 7) * 100);
}

// ==========================================
// REKAP & PERIOD AGGREGATION UTILITIES
// ==========================================

export const MONTH_NAMES_ID = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember"
];

/**
 * Menghitung rentang hari Senin s/d Minggu untuk tanggal referensi
 */
export function getWeekRange(refDateStr?: string): { startDate: string; endDate: string; label: string } {
  const base = refDateStr ? parseDateSafe(refDateStr) : new Date();
  const day = base.getDay(); // 0: Minggu, 1: Senin, dst.
  const diffToMon = base.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(base);
  monday.setDate(diffToMon);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const startDate = formatLocalDate(monday);
  const endDate = formatLocalDate(sunday);

  const labelMon = monday.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
  const labelSun = sunday.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });

  return {
    startDate,
    endDate,
    label: `${labelMon} - ${labelSun}`
  };
}

/**
 * Menghitung rentang tanggal 1 s/d akhir bulan
 */
export function getMonthRange(year: number, month: number): { startDate: string; endDate: string; label: string } {
  const mStr = String(month).padStart(2, "0");
  const lastDay = new Date(year, month, 0).getDate();
  const startDate = `${year}-${mStr}-01`;
  const endDate = `${year}-${mStr}-${String(lastDay).padStart(2, "0")}`;
  const label = `${MONTH_NAMES_ID[month - 1]} ${year}`;

  return { startDate, endDate, label };
}

export interface KaihPeriodSummary {
  totalHariTerisi: number;
  avgProgress: number;
  bangunPagiCount: number;
  bangunPagiTargetMetCount: number;
  salat5WaktuLengkapCount: number;
  salatSubuhCount: number;
  salatZuhurCount: number;
  salatAsarCount: number;
  salatMagribCount: number;
  salatIsyaCount: number;
  mengajiSudahCount: number;
  olahragaSudahCount: number;
  totalDurasiOlahraga: number;
  sarapanBergiziCount: number;
  makanSiangBergiziCount: number;
  makanMalamBergiziCount: number;
  totalDurasiBelajar: number;
  totalAktivitasBelajar: number;
  bermasyarakatSudahCount: number;
  tidurCepatCount: number;
  tidurCepatTargetMetCount: number;
  totalFinalCount: number;
}

/**
 * Menghitung rekapitulasi data pengerjaan dalam suatu periode
 */
export function calculatePeriodSummary(records: TujuhKaih[]): KaihPeriodSummary {
  const totalHariTerisi = records.length;
  if (totalHariTerisi === 0) {
    return {
      totalHariTerisi: 0,
      avgProgress: 0,
      bangunPagiCount: 0,
      bangunPagiTargetMetCount: 0,
      salat5WaktuLengkapCount: 0,
      salatSubuhCount: 0,
      salatZuhurCount: 0,
      salatAsarCount: 0,
      salatMagribCount: 0,
      salatIsyaCount: 0,
      mengajiSudahCount: 0,
      olahragaSudahCount: 0,
      totalDurasiOlahraga: 0,
      sarapanBergiziCount: 0,
      makanSiangBergiziCount: 0,
      makanMalamBergiziCount: 0,
      totalDurasiBelajar: 0,
      totalAktivitasBelajar: 0,
      bermasyarakatSudahCount: 0,
      tidurCepatCount: 0,
      tidurCepatTargetMetCount: 0,
      totalFinalCount: 0
    };
  }

  let sumProgress = 0;
  let bangunPagiCount = 0;
  let bangunPagiTargetMetCount = 0;
  let salat5WaktuLengkapCount = 0;
  let salatSubuhCount = 0;
  let salatZuhurCount = 0;
  let salatAsarCount = 0;
  let salatMagribCount = 0;
  let salatIsyaCount = 0;
  let mengajiSudahCount = 0;
  let olahragaSudahCount = 0;
  let totalDurasiOlahraga = 0;
  let sarapanBergiziCount = 0;
  let makanSiangBergiziCount = 0;
  let makanMalamBergiziCount = 0;
  let totalDurasiBelajar = 0;
  let totalAktivitasBelajar = 0;
  let bermasyarakatSudahCount = 0;
  let tidurCepatCount = 0;
  let tidurCepatTargetMetCount = 0;
  let totalFinalCount = 0;

  records.forEach((r) => {
    sumProgress += r.progres_persen ?? calculate7KaihProgress(r);
    if (r.is_final) totalFinalCount++;

    // 1. Bangun Pagi
    if (r.bangun_pagi_waktu && r.bangun_pagi_waktu.trim() !== "") {
      bangunPagiCount++;
      if (r.bangun_pagi_target_sesuai ?? isBangunPagiTargetMet(r.bangun_pagi_waktu)) {
        bangunPagiTargetMetCount++;
      }
    }

    // 2. Beribadah
    if (r.salat_subuh) salatSubuhCount++;
    if (r.salat_zuhur) salatZuhurCount++;
    if (r.salat_asar) salatAsarCount++;
    if (r.salat_magrib) salatMagribCount++;
    if (r.salat_isya) salatIsyaCount++;
    if (r.salat_subuh && r.salat_zuhur && r.salat_asar && r.salat_magrib && r.salat_isya) {
      salat5WaktuLengkapCount++;
    }
    if (r.mengaji_status === "sudah") mengajiSudahCount++;

    // 3. Olahraga
    if (r.olahraga_status === "sudah") {
      olahragaSudahCount++;
      totalDurasiOlahraga += Number(r.olahraga_durasi_menit || 0);
    }

    // 4. Makan Sehat
    if (r.sarapan_status === "sudah" && r.sarapan_bergizi) sarapanBergiziCount++;
    if (r.makan_siang_status === "sudah" && r.makan_siang_bergizi) makanSiangBergiziCount++;
    if (r.makan_malam_status === "sudah" && r.makan_malam_bergizi) makanMalamBergiziCount++;

    // 5. Gemar Belajar
    totalDurasiBelajar += Number(r.belajar_total_durasi || 0);
    if (Array.isArray(r.belajar_kegiatan)) {
      totalAktivitasBelajar += r.belajar_kegiatan.length;
    }

    // 6. Bermasyarakat
    if (r.bermasyarakat_status === "sudah") bermasyarakatSudahCount++;

    // 7. Tidur Cepat
    if (r.tidur_cepat_waktu && r.tidur_cepat_waktu.trim() !== "") {
      tidurCepatCount++;
      if (r.tidur_cepat_target_sesuai ?? isTidurCepatTargetMet(r.tidur_cepat_waktu)) {
        tidurCepatTargetMetCount++;
      }
    }
  });

  return {
    totalHariTerisi,
    avgProgress: Math.round(sumProgress / totalHariTerisi),
    bangunPagiCount,
    bangunPagiTargetMetCount,
    salat5WaktuLengkapCount,
    salatSubuhCount,
    salatZuhurCount,
    salatAsarCount,
    salatMagribCount,
    salatIsyaCount,
    mengajiSudahCount,
    olahragaSudahCount,
    totalDurasiOlahraga,
    sarapanBergiziCount,
    makanSiangBergiziCount,
    makanMalamBergiziCount,
    totalDurasiBelajar,
    totalAktivitasBelajar,
    bermasyarakatSudahCount,
    tidurCepatCount,
    tidurCepatTargetMetCount,
    totalFinalCount
  };
}

/**
 * Export rekap pengerjaan satu murid (Individu) ke Excel (.xlsx)
 */
export function exportRekapIndividuToExcel(
  siswa: Siswa,
  records: TujuhKaih[],
  periodLabel: string
) {
  if (records.length === 0) {
    alert("Tidak ada data pengerjaan untuk diekspor pada periode ini.");
    return;
  }

  const summary = calculatePeriodSummary(records);

  // Sheet 1: Rincian Hari per Hari
  const rows = records.map((r, idx) => {
    const salatList = [
      r.salat_subuh && "Subuh",
      r.salat_zuhur && "Zuhur",
      r.salat_asar && "Asar",
      r.salat_magrib && "Magrib",
      r.salat_isya && "Isya"
    ].filter(Boolean).join(", ") || "-";

    const mengajiText = r.mengaji_status === "sudah"
      ? `Sudah (${r.mengaji_surah || ""}: ${r.mengaji_ayat_awal || ""}-${r.mengaji_ayat_akhir || ""})`
      : r.mengaji_status === "belum" ? "Belum" : "-";

    const olahragaText = r.olahraga_status === "sudah"
      ? `${r.olahraga_jenis || "Olahraga"} (${r.olahraga_durasi_menit || 0} menit)`
      : r.olahraga_status === "belum" ? "Belum" : "-";

    const makanText = `Sarapan: ${r.sarapan_status}${r.sarapan_bergizi ? " [Gizi Seimbang]" : ""}, Siang: ${r.makan_siang_status}, Malam: ${r.makan_malam_status}`;
    const belajarText = `${r.belajar_total_durasi || 0} menit (${r.belajar_kegiatan?.length || 0} kegiatan)`;
    const masyarakatText = r.bermasyarakat_status === "sudah"
      ? r.bermasyarakat_kegiatan || "Sudah"
      : r.bermasyarakat_status === "belum" ? "Belum" : "-";

    return {
      No: idx + 1,
      Tanggal: r.tanggal,
      "Status Jurnal": r.is_final ? "Terkirim Final" : "Draft (Auto-saved)",
      "Progres (%)": r.progres_persen ?? calculate7KaihProgress(r),
      "1. Bangun Pagi": r.bangun_pagi_waktu || "-",
      "Target Bangun": r.bangun_pagi_target_sesuai ? "Tercapai" : "-",
      "2. Salat Wajib": salatList,
      "2b. Mengaji / Tadarus": mengajiText,
      "3. Olahraga": olahragaText,
      "4. Makan Sehat & Bergizi": makanText,
      "5. Gemar Belajar": belajarText,
      "6. Bermasyarakat": masyarakatText,
      "7. Tidur Cepat": r.tidur_cepat_waktu || "-",
      "Target Tidur": r.tidur_cepat_target_sesuai ? "Tercapai" : "-"
    };
  });

  // Sheet 2: Ringkasan Metrik Akumulasi
  const summaryRows = [
    { Parameter: "Nama Murid", Nilai: siswa.nama },
    { Parameter: "NIS", Nilai: siswa.nis },
    { Parameter: "Kelas", Nilai: siswa.kelas },
    { Parameter: "Periode Rekap", Nilai: periodLabel },
    { Parameter: "Total Hari Mengisi Jurnal", Nilai: `${summary.totalHariTerisi} Hari` },
    { Parameter: "Rata-rata Capaian Progres Jurnal", Nilai: `${summary.avgProgress}%` },
    { Parameter: "Jurnal Terkirim Final & Terkunci", Nilai: `${summary.totalFinalCount} Hari` },
    { Parameter: "1. Bangun Pagi Tepat Waktu (<= 05.30)", Nilai: `${summary.bangunPagiTargetMetCount} Hari` },
    { Parameter: "2. Salat 5 Waktu Lengkap", Nilai: `${summary.salat5WaktuLengkapCount} Hari` },
    { Parameter: "2b. Mengaji / Tadarus Al-Qur'an", Nilai: `${summary.mengajiSudahCount} Hari` },
    { Parameter: "3. Frekuensi Berolahraga", Nilai: `${summary.olahragaSudahCount} Hari (Total ${summary.totalDurasiOlahraga} menit)` },
    { Parameter: "4. Hari Sarapan Bergizi Seimbang", Nilai: `${summary.sarapanBergiziCount} Hari` },
    { Parameter: "5. Total Waktu Belajar Mandiri", Nilai: `${summary.totalDurasiBelajar} menit (${summary.totalAktivitasBelajar} kegiatan)` },
    { Parameter: "6. Keikutsertaan Bermasyarakat", Nilai: `${summary.bermasyarakatSudahCount} Hari` },
    { Parameter: "7. Tidur Cepat Tepat Waktu (<= 22.00)", Nilai: `${summary.tidurCepatTargetMetCount} Hari` }
  ];

  const wb = XLSX.utils.book_new();
  const ws1 = XLSX.utils.json_to_sheet(rows);
  const ws2 = XLSX.utils.json_to_sheet(summaryRows);

  XLSX.utils.book_append_sheet(wb, ws1, "Rincian Harian 7 KAIH");
  XLSX.utils.book_append_sheet(wb, ws2, "Ringkasan Capaian");

  const sanitizedNama = (siswa.nama || "Murid").replace(/[^a-zA-Z0-9]/g, "_");
  const sanitizedPeriod = periodLabel.replace(/[^a-zA-Z0-9]/g, "_");
  XLSX.writeFile(wb, `Rekap_7KAIH_${sanitizedNama}_${sanitizedPeriod}.xlsx`);
}

/**
 * Export rekap pengerjaan seluruh kelas (Per Kelas / Semua Kelas) ke Excel (.xlsx)
 */
export function exportRekapKelasToExcel(
  kelas: string,
  records: TujuhKaih[],
  allSiswaInKelas: Siswa[],
  periodLabel: string
) {
  if (allSiswaInKelas.length === 0) {
    alert("Tidak ada data siswa untuk diekspor.");
    return;
  }

  // Petakan record per siswa
  const recordsBySiswa = new Map<string, TujuhKaih[]>();
  records.forEach((r) => {
    const list = recordsBySiswa.get(r.siswa_id) || [];
    list.push(r);
    recordsBySiswa.set(r.siswa_id, list);
  });

  const rows = allSiswaInKelas.map((siswa, idx) => {
    const sRecords = recordsBySiswa.get(siswa.id) || [];
    const summary = calculatePeriodSummary(sRecords);

    return {
      No: idx + 1,
      NIS: siswa.nis,
      Nama: siswa.nama,
      Kelas: siswa.kelas,
      "Periode": periodLabel,
      "Hari Mengisi": summary.totalHariTerisi,
      "Rata-rata Progres (%)": summary.totalHariTerisi > 0 ? `${summary.avgProgress}%` : "0%",
      "Bangun Pagi Sesuai": `${summary.bangunPagiTargetMetCount}x`,
      "Salat 5 Waktu Lengkap": `${summary.salat5WaktuLengkapCount}x`,
      "Mengaji / Tadarus": `${summary.mengajiSudahCount}x`,
      "Olahraga": `${summary.olahragaSudahCount}x (${summary.totalDurasiOlahraga} mnt)`,
      "Sarapan Bergizi": `${summary.sarapanBergiziCount}x`,
      "Total Belajar (Menit)": summary.totalDurasiBelajar,
      "Bermasyarakat": `${summary.bermasyarakatSudahCount}x`,
      "Tidur Cepat Sesuai": `${summary.tidurCepatTargetMetCount}x`,
      "Jurnal Final": `${summary.totalFinalCount}x`
    };
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, "Rekap Kelas 7 KAIH");

  const sanitizedKelas = (kelas || "Semua").replace(/[^a-zA-Z0-9]/g, "_");
  const sanitizedPeriod = periodLabel.replace(/[^a-zA-Z0-9]/g, "_");
  XLSX.writeFile(wb, `Rekap_7KAIH_Kelas_${sanitizedKelas}_${sanitizedPeriod}.xlsx`);
}

