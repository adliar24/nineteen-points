import { TujuhKaih, HabitEvaluation, BelajarItem } from "../types";

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
