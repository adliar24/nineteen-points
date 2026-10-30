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
 * Menghitung lebar kolom otomatis (Auto-fit) pada Worksheet XLSX
 * Berdasarkan panjang karakter data dan header, dengan batas min dan max.
 */
export function autoFitWorksheetCols(
  ws: XLSX.WorkSheet,
  startRowIndex = 0,
  minWidth = 10,
  maxWidth = 65
) {
  if (!ws || !ws["!ref"]) return;
  const range = XLSX.utils.decode_range(ws["!ref"]);
  const colWidths: { wch: number }[] = [];

  for (let C = range.s.c; C <= range.e.c; ++C) {
    let maxLen = minWidth;
    for (let R = Math.max(range.s.r, startRowIndex); R <= range.e.r; ++R) {
      const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
      const cell = ws[cellAddress];
      if (cell && cell.v !== undefined && cell.v !== null) {
        const valStr = String(cell.v);
        const lines = valStr.split("\n");
        for (const line of lines) {
          if (line.length > maxLen) {
            maxLen = line.length;
          }
        }
      }
    }
    colWidths.push({ wch: Math.min(Math.max(maxLen + 3, minWidth), maxWidth) });
  }
  ws["!cols"] = colWidths;
}

/**
 * Export rekap pengerjaan satu murid (Individu) ke Excel (.xlsx) dengan format rapi
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

  // Sheet 1: Rincian Hari per Hari dengan Kop Resmi
  const rincianHeaders = [
    "No",
    "Hari, Tanggal",
    "Status Jurnal",
    "Capaian (%)",
    "1. Bangun Pagi",
    "Target Bangun (<= 05.30)",
    "2. Salat 5 Waktu Wajib",
    "2b. Tadarus / Mengaji",
    "3. Olahraga",
    "4. Makan Sehat & Bergizi",
    "5. Gemar Belajar Mandiri",
    "6. Kegiatan Bermasyarakat",
    "7. Tidur Cepat",
    "Target Tidur (<= 22.00)",
    "Waktu Final / Kirim"
  ];

  const rincianDataRows = records.map((r, idx) => {
    const salatList = [
      r.salat_subuh && "Subuh",
      r.salat_zuhur && "Zuhur",
      r.salat_asar && "Asar",
      r.salat_magrib && "Magrib",
      r.salat_isya && "Isya"
    ].filter(Boolean).join(", ") || "-";

    const mengajiText = r.mengaji_status === "sudah"
      ? `Sudah (QS. ${r.mengaji_surah || ""}: ayat ${r.mengaji_ayat_awal || ""}-${r.mengaji_ayat_akhir || ""})`
      : r.mengaji_status === "belum" ? "Belum" : "-";

    const olahragaText = r.olahraga_status === "sudah"
      ? `${r.olahraga_jenis || "Olahraga"} (${r.olahraga_durasi_menit || 0} menit)`
      : r.olahraga_status === "belum" ? "Belum" : "-";

    const makanText = `Sarapan: ${r.sarapan_status}${r.sarapan_bergizi ? " [Gizi Seimbang]" : ""}, Siang: ${r.makan_siang_status}, Malam: ${r.makan_malam_status}`;
    const belajarText = `${r.belajar_total_durasi || 0} menit (${r.belajar_kegiatan?.length || 0} kegiatan)`;
    const masyarakatText = r.bermasyarakat_status === "sudah"
      ? r.bermasyarakat_kegiatan || "Sudah"
      : r.bermasyarakat_status === "belum" ? "Belum" : "-";

    const dateFormatted = parseDateSafe(r.tanggal).toLocaleDateString("id-ID", {
      weekday: "long",
      day: "numeric",
      month: "short",
      year: "numeric"
    });

    return [
      idx + 1,
      dateFormatted,
      r.is_final ? "Terkirim Final" : "Draft (Auto-saved)",
      `${r.progres_persen ?? calculate7KaihProgress(r)}%`,
      r.bangun_pagi_waktu || "-",
      r.bangun_pagi_target_sesuai ? "Tercapai" : "Terlambat / Belum",
      salatList,
      mengajiText,
      olahragaText,
      makanText,
      belajarText,
      masyarakatText,
      r.tidur_cepat_waktu || "-",
      r.tidur_cepat_target_sesuai ? "Tercapai" : "Terlambat / Belum",
      r.waktu_kirim_final ? new Date(r.waktu_kirim_final).toLocaleString("id-ID") : "-"
    ];
  });

  const sheet1AOA: any[][] = [
    ["LAPORAN JURNAL 7 KEBIASAAN ANAK INDONESIA HEBAT (7 KAIH)"],
    ["SMAN 19 BANDUNG - LEMBAR RINCIAN HARIAN INDIVIDU"],
    [`Nama: ${siswa.nama}`, `NIS: ${siswa.nis}`, `Kelas: ${siswa.kelas}`],
    [`Periode: ${periodLabel}`, "", `Waktu Ekspor: ${new Date().toLocaleString("id-ID")}`],
    [], // Baris kosong pemisah
    rincianHeaders,
    ...rincianDataRows
  ];

  // Sheet 2: Ringkasan & Evaluasi Capaian Periode
  const sheet2AOA: any[][] = [
    ["LEMBAR EVALUASI CAPAIAN 7 KAIH (RINGKASAN INDIVIDU)"],
    ["SMAN 19 BANDUNG"],
    [`Nama Murid: ${siswa.nama}`, `NIS: ${siswa.nis}`, `Kelas: ${siswa.kelas}`],
    [`Periode Rekap: ${periodLabel}`, "", `Tanggal Ekspor: ${new Date().toLocaleDateString("id-ID")}`],
    [],
    ["No", "Indikator / Kebiasaan 7 KAIH", "Capaian Periode Ini", "Target Standar", "Evaluasi Konsistensi"],
    [1, "Total Keaktifan Mengisi Jurnal", `${summary.totalHariTerisi} Hari`, "Setiap Hari", summary.totalHariTerisi >= 5 ? "Sangat Baik" : "Perlu Ditingkatkan"],
    [2, "Rata-rata Capaian Progres Harian", `${summary.avgProgress}%`, "Minimal 80%", summary.avgProgress >= 80 ? "Memenuhi Target" : "Perlu Bimbingan"],
    [3, "Jurnal Terkirim Final & Terkunci", `${summary.totalFinalCount} Hari`, "Terkirim Tepat Waktu", `${summary.totalFinalCount} hari dikirim final`],
    [4, "1. Bangun Pagi (<= 05.30)", `${summary.bangunPagiTargetMetCount} Hari Tepat`, "Rutin Setiap Hari", summary.bangunPagiTargetMetCount >= 5 ? "Sangat Disiplin" : "Cukup"],
    [5, "2. Salat 5 Waktu Wajib Lengkap", `${summary.salat5WaktuLengkapCount} Hari Lengkap`, "5 Waktu Setiap Hari", summary.salat5WaktuLengkapCount >= 5 ? "Sangat Baik" : "Tingkatkan"],
    [6, "2b. Tadarus / Mengaji Al-Qur'an", `${summary.mengajiSudahCount} Hari Mengaji`, "Rutin Setiap Hari", `${summary.mengajiSudahCount} hari terlaksana`],
    [7, "3. Frekuensi & Durasi Olahraga", `${summary.olahragaSudahCount} Hari (${summary.totalDurasiOlahraga} mnt)`, "3-5x per minggu", `${summary.totalDurasiOlahraga} menit akumulasi`],
    [8, "4. Sarapan Bergizi Seimbang", `${summary.sarapanBergiziCount} Hari Seimbang`, "Setiap Hari", `${summary.sarapanBergiziCount} hari bergizi seimbang`],
    [9, "5. Gemar Belajar Mandiri", `${summary.totalDurasiBelajar} Menit (${summary.totalAktivitasBelajar} kegiatan)`, "Rutin Belajar", `${summary.totalDurasiBelajar} menit total belajar`],
    [10, "6. Kegiatan Sosial Bermasyarakat", `${summary.bermasyarakatSudahCount} Hari`, "Aktif di Lingkungan", `${summary.bermasyarakatSudahCount} hari tercatat`],
    [11, "7. Tidur Cepat Tepat Waktu (<= 22.00)", `${summary.tidurCepatTargetMetCount} Hari Tepat`, "Sebelum 22.00 WIB", summary.tidurCepatTargetMetCount >= 5 ? "Pola Tidur Sehat" : "Hindari Begadang"]
  ];

  const wb = XLSX.utils.book_new();
  const ws1 = XLSX.utils.aoa_to_sheet(sheet1AOA);
  const ws2 = XLSX.utils.aoa_to_sheet(sheet2AOA);

  // Format lebar kolom otomatis
  autoFitWorksheetCols(ws1, 5, 12, 60);
  ws2["!cols"] = [{ wch: 6 }, { wch: 38 }, { wch: 32 }, { wch: 22 }, { wch: 28 }];

  XLSX.utils.book_append_sheet(wb, ws1, "Rincian Harian 7 KAIH");
  XLSX.utils.book_append_sheet(wb, ws2, "Ringkasan Capaian");

  const sanitizedNama = (siswa.nama || "Murid").replace(/[^a-zA-Z0-9]/g, "_");
  const sanitizedPeriod = periodLabel.replace(/[^a-zA-Z0-9]/g, "_");
  XLSX.writeFile(wb, `Rekap_7KAIH_${sanitizedNama}_${sanitizedPeriod}.xlsx`);
}

/**
 * Export rekap pengerjaan seluruh kelas (Per Kelas / Semua Kelas) ke Excel (.xlsx) dengan format rapi
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

  const headers = [
    "No",
    "NIS",
    "Nama Murid",
    "Kelas",
    "Periode",
    "Hari Mengisi",
    "Rata-rata Capaian (%)",
    "1. Bangun Pagi Sesuai",
    "2. Salat 5 Waktu Lengkap",
    "2b. Mengaji / Tadarus",
    "3. Olahraga (Frekuensi & Durasi)",
    "4. Sarapan Bergizi",
    "5. Total Belajar (Menit)",
    "6. Bermasyarakat",
    "7. Tidur Tepat Waktu",
    "Jurnal Final"
  ];

  const dataRows = allSiswaInKelas.map((siswa, idx) => {
    const sRecords = recordsBySiswa.get(siswa.id) || [];
    const summary = calculatePeriodSummary(sRecords);

    return [
      idx + 1,
      siswa.nis || "-",
      siswa.nama,
      siswa.kelas || "-",
      periodLabel,
      `${summary.totalHariTerisi} Hari`,
      summary.totalHariTerisi > 0 ? `${summary.avgProgress}%` : "0%",
      `${summary.bangunPagiTargetMetCount}x`,
      `${summary.salat5WaktuLengkapCount}x`,
      `${summary.mengajiSudahCount}x`,
      `${summary.olahragaSudahCount}x (${summary.totalDurasiOlahraga} mnt)`,
      `${summary.sarapanBergiziCount}x`,
      `${summary.totalDurasiBelajar} mnt`,
      `${summary.bermasyarakatSudahCount}x`,
      `${summary.tidurCepatTargetMetCount}x`,
      `${summary.totalFinalCount}x`
    ];
  });

  const sheetAOA: any[][] = [
    ["REKAPITULASI JURNAL 7 KEBIASAAN ANAK INDONESIA HEBAT (7 KAIH)"],
    ["SMAN 19 BANDUNG"],
    [`Kelas: ${kelas === "Semua" ? "Semua Kelas" : kelas}`, `Periode: ${periodLabel}`, `Total Murid: ${allSiswaInKelas.length}`],
    [`Tanggal Unduh: ${new Date().toLocaleString("id-ID")}`],
    [],
    headers,
    ...dataRows
  ];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(sheetAOA);

  autoFitWorksheetCols(ws, 5, 10, 50);
  XLSX.utils.book_append_sheet(wb, ws, "Rekap Kelas 7 KAIH");

  const sanitizedKelas = (kelas || "Semua").replace(/[^a-zA-Z0-9]/g, "_");
  const sanitizedPeriod = periodLabel.replace(/[^a-zA-Z0-9]/g, "_");
  XLSX.writeFile(wb, `Rekap_7KAIH_Kelas_${sanitizedKelas}_${sanitizedPeriod}.xlsx`);
}

/**
 * Export rekap harian Jurnal 7 KAIH ke Excel (.xlsx) dengan format rapi
 */
export function exportRekapHarianToExcel(
  tanggal: string,
  kelas: string,
  dailyRows: {
    siswa: Siswa;
    record: TujuhKaih | null;
    isFilled: boolean;
    progress: number;
  }[]
) {
  if (dailyRows.length === 0) {
    alert("Tidak ada data untuk diekspor pada tanggal ini.");
    return;
  }

  const dateFormatted = parseDateSafe(tanggal).toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  });

  const headers = [
    "No",
    "NIS",
    "Nama Murid",
    "Kelas",
    "Status Pengisian",
    "Capaian (%)",
    "1. Bangun Pagi",
    "2. Salat Wajib",
    "2b. Tadarus / Mengaji",
    "3. Olahraga",
    "4. Makan Sehat",
    "5. Gemar Belajar",
    "6. Bermasyarakat",
    "7. Tidur Cepat",
    "Waktu Final / Kirim"
  ];

  const dataRows = dailyRows.map((item, idx) => {
    const r = item.record;
    const salatList = r
      ? [
          r.salat_subuh && "Subuh",
          r.salat_zuhur && "Zuhur",
          r.salat_asar && "Asar",
          r.salat_magrib && "Magrib",
          r.salat_isya && "Isya"
        ]
          .filter(Boolean)
          .join(", ") || "-"
      : "-";

    const mengajiText = r?.mengaji_status === "sudah"
      ? `Sudah (QS. ${r.mengaji_surah || ""}: ${r.mengaji_ayat_awal || ""}-${r.mengaji_ayat_akhir || ""})`
      : r?.mengaji_status === "belum" ? "Belum" : "-";

    const olahragaText = r?.olahraga_status === "sudah"
      ? `${r.olahraga_jenis || "Olahraga"} (${r.olahraga_durasi_menit || 0} menit)`
      : r?.olahraga_status === "belum" ? "Belum" : "-";

    const makanText = r
      ? `Sarapan: ${r.sarapan_status}${r.sarapan_bergizi ? " [Gizi Seimbang]" : ""}, Siang: ${r.makan_siang_status}, Malam: ${r.makan_malam_status}`
      : "-";

    const belajarText = r ? `${r.belajar_total_durasi || 0} menit (${r.belajar_kegiatan?.length || 0} kegiatan)` : "-";

    const masyarakatText = r?.bermasyarakat_status === "sudah"
      ? r.bermasyarakat_kegiatan || "Sudah"
      : r?.bermasyarakat_status === "belum" ? "Belum" : "-";

    let statusText = "Belum Mengisi";
    if (item.isFilled) {
      statusText = r?.is_final ? "Terkirim Final" : "Draft (Auto-saved)";
    }

    return [
      idx + 1,
      item.siswa.nis || "-",
      item.siswa.nama,
      item.siswa.kelas || "-",
      statusText,
      item.isFilled ? `${item.progress}%` : "0%",
      r?.bangun_pagi_waktu || "-",
      salatList,
      mengajiText,
      olahragaText,
      makanText,
      belajarText,
      masyarakatText,
      r?.tidur_cepat_waktu || "-",
      r?.waktu_kirim_final ? new Date(r.waktu_kirim_final).toLocaleString("id-ID") : "-"
    ];
  });

  const sheetAOA: any[][] = [
    ["LAPORAN HARIAN JURNAL 7 KEBIASAAN ANAK INDONESIA HEBAT (7 KAIH)"],
    ["SMAN 19 BANDUNG"],
    [`Tanggal: ${dateFormatted}`, `Kelas: ${kelas === "Semua" ? "Semua Kelas" : kelas}`, `Total Siswa: ${dailyRows.length}`],
    [`Waktu Ekspor: ${new Date().toLocaleString("id-ID")}`],
    [],
    headers,
    ...dataRows
  ];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(sheetAOA);

  autoFitWorksheetCols(ws, 5, 10, 55);
  XLSX.utils.book_append_sheet(wb, ws, "Rekap Harian 7 KAIH");

  const sanitizedKelas = (kelas || "Semua").replace(/[^a-zA-Z0-9]/g, "_");
  XLSX.writeFile(wb, `Rekap_Harian_7KAIH_${sanitizedKelas}_${tanggal}.xlsx`);
}

