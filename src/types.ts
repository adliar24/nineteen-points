export interface Siswa {
  id: string;
  nis: string;
  nama: string;
  kelas: string;
  total_poin: number;
  foto_url?: string | null;
  face_embedding?: string | null;
}

export interface MasterPoin {
  id: string;
  nama_poin: string;
  nilai_poin: number;
  allowed_guru_emails?: string[] | null;
}

export interface RiwayatPoin {
  id: string;
  siswa_id: string;
  siswa_nama?: string;
  siswa_kelas?: string;
  siswa_nis?: string;
  siswa_foto_url?: string | null;
  nama_poin: string;
  nilai_diberikan: number;
  guru_email: string;
  created_at: string;
  semester?: string;
}

export interface UserSession {
  id: string;
  email: string;
  fullName: string;
  role: string;
  nis?: string;
  foto_url?: string | null;
}

export interface Profile {
  id: string;
  email: string;
  nama: string;
  role: string;
  nis: string | null;
  foto_url: string | null;
  face_embedding?: string | null;
  created_at: string;
}

export interface KehadiranGuru {
  id: string;
  user_id: string;
  tanggal: string;
  jam_masuk: string | null;
  jam_keluar: string | null;
  status: 'hadir' | 'sakit' | 'izin' | 'alfa';
  keterangan: string | null;
  created_at: string;
  user_nama?: string;
  user_email?: string;
}

export interface KegiatanGuru {
  id: string;
  user_id: string;
  nama_kegiatan: string;
  tanggal_kegiatan: string;
  peran: string;
  no_sertifikat: string | null;
  penyelenggara: string;
  durasi_jam: number | null;
  materi_jp?: { materi: string; jp: number }[] | null;
  created_at: string;
  user_nama?: string;
  user_email?: string;
}

export interface JadwalGuru {
  id: string;
  user_id: string;
  hari: string;
  mata_pelajaran: string;
  kelas: string;
  jam_mulai: string;
  jam_selesai: string;
  created_at: string;
  user_nama?: string;
  user_email?: string;
}

export interface BelajarItem {
  id: string;
  kegiatan: string;
  durasi_menit: number;
}

export type HabitStatus = 'belum_diisi' | 'belum' | 'sudah';

export interface TujuhKaih {
  id?: string;
  siswa_id: string;
  tanggal: string; // YYYY-MM-DD

  // 1. Bangun Pagi
  bangun_pagi_waktu: string | null; // HH:mm
  bangun_pagi_target_sesuai?: boolean;

  // 2. Beribadah
  salat_subuh: boolean;
  salat_zuhur: boolean;
  salat_asar: boolean;
  salat_magrib: boolean;
  salat_isya: boolean;

  // 2b. Pendukung Beribadah: Mengaji
  mengaji_status: HabitStatus;
  mengaji_surah?: string | null;
  mengaji_ayat_awal?: number | null;
  mengaji_ayat_akhir?: number | null;
  mengaji_catatan?: string | null;

  // 3. Berolahraga
  olahraga_status: HabitStatus;
  olahraga_jenis?: string | null;
  olahraga_durasi_menit?: number | null;

  // 4. Makan Sehat dan Bergizi
  sarapan_status: HabitStatus;
  sarapan_bergizi: boolean;
  sarapan_menu?: string | null;

  makan_siang_status: HabitStatus;
  makan_siang_bergizi: boolean;
  makan_siang_menu?: string | null;

  makan_malam_status: HabitStatus;
  makan_malam_bergizi: boolean;
  makan_malam_menu?: string | null;

  // 5. Gemar Belajar
  belajar_kegiatan: BelajarItem[];
  belajar_total_durasi: number;

  // 6. Bermasyarakat
  bermasyarakat_status: HabitStatus;
  bermasyarakat_kegiatan?: string | null;

  // 7. Tidur Cepat
  tidur_cepat_waktu: string | null; // HH:mm
  tidur_cepat_target_sesuai?: boolean;

  progres_persen: number; // 0 - 100
  created_at?: string;
  updated_at?: string;

  // Joined fields
  siswa_nama?: string;
  siswa_nis?: string;
  siswa_kelas?: string;
  siswa_foto_url?: string | null;
}

export interface GuruPenugasan7Kaih {
  id?: string;
  guru_id: string;
  kelas: string;
  created_at?: string;
  guru_nama?: string;
  guru_email?: string;
}

export interface HabitEvaluation {
  id: string;
  title: string;
  nomenklatur: string;
  status: 'selesai' | 'belum_dilakukan' | 'belum_diisi';
  summary: string;
  targetMet?: boolean;
}

