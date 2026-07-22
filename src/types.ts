export interface Siswa {
  id: string;
  nis: string;
  nama: string;
  kelas: string;
  total_poin: number;
  foto_url?: string | null;
}

export interface MasterPoin {
  id: string;
  nama_poin: string;
  nilai_poin: number;
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
