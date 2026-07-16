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
}

export interface UserSession {
  email: string;
  fullName: string;
  role: string;
  nis?: string;
  foto_url?: string | null;
}
