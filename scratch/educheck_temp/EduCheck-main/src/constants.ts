export const SCHOOL_YEARS = (() => {
  const startYear = 2025;
  const years = [];
  for (let i = 0; i < 30; i++) {
    years.push(`${startYear + i}/${startYear + i + 1}`);
  }
  return years;
})();

export const DEFAULT_SUBJECTS = [
  // SD / MI
  "Pendidikan Agama Islam dan Budi Pekerti",
  "Pendidikan Agama Kristen dan Budi Pekerti",
  "Pendidikan Agama Katolik dan Budi Pekerti",
  "Pendidikan Agama Hindu dan Budi Pekerti",
  "Pendidikan Agama Buddha dan Budi Pekerti",
  "Pendidikan Agama Konghucu dan Budi Pekerti",
  "Pendidikan Pancasila",
  "Bahasa Indonesia",
  "Matematika",
  "Ilmu Pengetahuan Alam dan Sosial (IPAS)",
  "Seni Rupa", "Seni Musik", "Seni Tari", "Seni Teater",
  "PJOK",
  "Bahasa Inggris",
  "Bahasa Daerah",
  "Informatika",
  "Bimbingan Konseling",
  
  // SMP / MTs additions
  "IPA", "IPS", "Prakarya",

  // SMA / MA additions
  "Sejarah", "PKWU",
  "Matematika Lanjut", "Fisika", "Kimia", "Biologi",
  "Geografi", "Ekonomi", "Sosiologi", "Antropologi",
  "Sejarah Peminatan", "Bahasa dan Sastra Indonesia", "Bahasa dan Sastra Inggris",
  "Bahasa Arab", "Bahasa Jepang", "Bahasa Korea", "Bahasa Mandarin", "Bahasa Jerman", "Bahasa Prancis",

  // SMK additions
  "PKK (Projek Kreatif dan Kewirausahaan)",
  "Dasar-dasar Kejuruan", "Konsentrasi Keahlian", "PKL (Praktik Kerja Lapangan)",
  "Akuntansi dan Keuangan Lembaga", "OTKP / Manajemen Perkantoran",
  "Bisnis Daring dan Pemasaran", "TKJ", "RPL", "SIJA",
  "Teknik Elektronika", "Teknik Listrik", "Teknik Mesin", "TKRO", "TSM",
  "Teknik Pengelasan", "DPIB / Konstruksi",
  "Agribisnis Tanaman", "Agribisnis Ternak", "Agribisnis Perikanan",
  "Teknologi Pangan", "Farmasi", "Keperawatan",
  "Perhotelan", "Usaha Perjalanan Wisata", "Tata Boga", "Tata Busana", "Tata Kecantikan",
  "Multimedia", "DKV", "Animasi", "Broadcasting / Perfilman",
  "Logistik", "Pelayaran"
];

// --- Urutan kelas (X -> XI -> XII, lalu A -> B -> ...)
const ROMAN_TO_NUM: Record<string, number> = { X: 10, XI: 11, XII: 12 };

function parseClassNameForSort(name: string) {
  const raw = (name || '').trim().toUpperCase();

  // Ambil token tingkat di awal (X/XI/XII atau 10/11/12)
  const m = raw.match(/^(XII|XI|X|\d{1,2})\b/);
  const gradeToken = m?.[1] ?? '';
  const grade = (gradeToken in ROMAN_TO_NUM)
    ? ROMAN_TO_NUM[gradeToken as keyof typeof ROMAN_TO_NUM]
    : (gradeToken ? Number(gradeToken) : 999);

  const rest = raw.slice(m?.[0].length ?? 0).trim();
  const section = rest.replace(/^[-\s]+/, '').trim();

  return { grade: Number.isFinite(grade) ? grade : 999, section };
}

export function compareClassName(aName: string, bName: string) {
  const a = parseClassNameForSort(aName);
  const b = parseClassNameForSort(bName);

  if (a.grade !== b.grade) return a.grade - b.grade;

  // Urutkan bagian rombel (A/B/C atau angka) secara natural
  return a.section.localeCompare(b.section, 'id', { numeric: true, sensitivity: 'base' });
}
