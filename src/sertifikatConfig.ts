import { supabase } from "./supabaseClient";

export interface ElementPosition {
  xPercent: number; // 0 - 100%
  yPercent: number; // 0 - 100%
  fontSize: number; // px at base width 2000px
  color: string;    // HEX / RGB
  align: "center" | "left" | "right";
  fontWeight?: string;
  fontStyle?: string;
  lineHeightMultiplier?: number; // Spasi antar baris (misal 1.0 - 2.5)
  wordSpacingMultiplier?: number; // Spasi antar kata (misal 0.5 - 3.0)
}

export interface TtdElementPosition {
  xPercent: number;
  yPercent: number;
  widthPercent: number;
}

export interface SertifikatLayoutConfig {
  templateUrl: string | null; // Data URL or relative URL
  
  // Jumlah TTD (1, 2, atau 3)
  jumlahTtd: 1 | 2 | 3;

  // Garis otomatis
  showJudulLine: boolean;
  judulLineWidth: number;
  showNamaLine: boolean;
  namaLineWidth: number;
  showTtdLines: boolean;
  ttdLineWidth: number;

  // TTD 1
  ttd1Image: string | null;
  ttd1Nama: string;
  ttd1Jabatan: string;
  ttd1SubText1: string; // Opsional Kolom Tambahan 1 (misal NIP)
  ttd1SubText2: string; // Opsional Kolom Tambahan 2 (misal Instansi)

  // TTD 2
  ttd2Image: string | null;
  ttd2Nama: string;
  ttd2Jabatan: string;
  ttd2SubText1: string;
  ttd2SubText2: string;

  // TTD 3
  ttd3Image: string | null;
  ttd3Nama: string;
  ttd3Jabatan: string;
  ttd3SubText1: string;
  ttd3SubText2: string;

  // Template Deskripsi Kustom (Mendukung Markdown **bold**)
  deskripsiTemplate: string;

  // Tempat & Tanggal Halaman Depan
  tempatTanggalTemplate: string;

  // Halaman Belakang (JP)
  hasJpPage: boolean;
  templateJpUrl: string | null;
  materiJpRows: { materi: string; jp: number }[];
  jpHeaderTitle?: string;
  jpHeaderSubtitle?: string;
  jpHeaderSub2?: string;

  // Posisi & Styling Elemen
  positions: {
    noSertifikat: ElementPosition;
    prefixNama: ElementPosition; // e.g., "Diberikan kepada:"
    namaGuru: ElementPosition;
    deskripsi: ElementPosition;
    tanggalKegiatan: ElementPosition; // Tempat & Tanggal
    
    // TTD 1
    ttd1ImagePos: TtdElementPosition;
    ttd1NamaPos: ElementPosition;
    ttd1JabatanPos: ElementPosition;
    ttd1SubText1Pos: ElementPosition;
    ttd1SubText2Pos: ElementPosition;

    // TTD 2
    ttd2ImagePos: TtdElementPosition;
    ttd2NamaPos: ElementPosition;
    ttd2JabatanPos: ElementPosition;
    ttd2SubText1Pos: ElementPosition;
    ttd2SubText2Pos: ElementPosition;

    // TTD 3
    ttd3ImagePos: TtdElementPosition;
    ttd3NamaPos: ElementPosition;
    ttd3JabatanPos: ElementPosition;
    ttd3SubText1Pos: ElementPosition;
    ttd3SubText2Pos: ElementPosition;

    // Halaman Belakang (JP)
    jpHeaderTitlePos: ElementPosition;
    jpHeaderSubtitlePos: ElementPosition;
    jpHeaderSub2Pos: ElementPosition;
  };
}

export const DEFAULT_SERTIFIKAT_CONFIG: SertifikatLayoutConfig = {
  templateUrl: null, // Default uses /sertifikat_template.png
  
  jumlahTtd: 2,

  showJudulLine: true,
  judulLineWidth: 980,
  showNamaLine: true,
  namaLineWidth: 1260,
  showTtdLines: true,
  ttdLineWidth: 390,

  ttd1Image: null,
  ttd1Nama: "Ben Harrington",
  ttd1Jabatan: "CEO",
  ttd1SubText1: "",
  ttd1SubText2: "",

  ttd2Image: null,
  ttd2Nama: "Sameer Shah",
  ttd2Jabatan: "Manager",
  ttd2SubText1: "",
  ttd2SubText2: "",

  ttd3Image: null,
  ttd3Nama: "Drs. H. Sukarno, M.Pd.",
  ttd3Jabatan: "Kepala SMAN 19 Bandung",
  ttd3SubText1: "",
  ttd3SubText2: "",

  deskripsiTemplate: 'Atas partisipasi aktifnya sebagai **{peran}** dalam kegiatan **"{nama_kegiatan}"** yang diselenggarakan oleh **{penyelenggara}**.',
  tempatTanggalTemplate: 'Bandung, {tanggal}',

  hasJpPage: false,
  templateJpUrl: null,
  materiJpRows: [
    { materi: "Pembelajaran Paradigma Baru", jp: 4 },
    { materi: "Asesmen Pembelajaran Kurikulum Merdeka", jp: 8 },
    { materi: "Penyusunan Kurikulum Satuan Pendidikan (KSP)", jp: 8 },
    { materi: "Pemanfaatan Platform Merdeka Mengajar (PMM)", jp: 6 },
    { materi: "Pembuatan Projek Penguatan Profil Pelajar Pancasila (P5)", jp: 6 }
  ],
  jpHeaderTitle: "STRUKTUR PROGRAM DAN MATERI PELATIHAN",
  jpHeaderSubtitle: "{nama_kegiatan}",
  jpHeaderSub2: "{penyelenggara}",

  positions: {
    noSertifikat: {
      xPercent: 50,
      yPercent: 22.5,
      fontSize: 26,
      color: "#284478",
      align: "center",
      fontWeight: "bold",
      lineHeightMultiplier: 1.4
    },
    prefixNama: {
      xPercent: 50,
      yPercent: 32.5,
      fontSize: 24,
      color: "#334155",
      align: "center",
      fontWeight: "normal",
      lineHeightMultiplier: 1.4
    },
    namaGuru: {
      xPercent: 50,
      yPercent: 46.5,
      fontSize: 72,
      color: "#2d5ca8",
      align: "center",
      fontWeight: "bold",
      fontStyle: "italic",
      lineHeightMultiplier: 1.2
    },
    deskripsi: {
      xPercent: 50,
      yPercent: 58.0,
      fontSize: 24,
      color: "#334155",
      align: "center",
      fontWeight: "normal",
      lineHeightMultiplier: 1.45
    },
    tanggalKegiatan: {
      xPercent: 50,
      yPercent: 68.0,
      fontSize: 18,
      color: "#1e1b4b",
      align: "center",
      fontWeight: "normal"
    },
    
    // TTD 1
    ttd1ImagePos: {
      xPercent: 27,
      yPercent: 74,
      widthPercent: 12
    },
    ttd1NamaPos: {
      xPercent: 27,
      yPercent: 85.5,
      fontSize: 24,
      color: "#1e293b",
      align: "center",
      fontWeight: "bold"
    },
    ttd1JabatanPos: {
      xPercent: 27,
      yPercent: 88.5,
      fontSize: 18,
      color: "#64748b",
      align: "center",
      fontWeight: "normal"
    },
    ttd1SubText1Pos: {
      xPercent: 27,
      yPercent: 91.5,
      fontSize: 18,
      color: "#64748b",
      align: "center",
      fontWeight: "normal"
    },
    ttd1SubText2Pos: {
      xPercent: 27,
      yPercent: 94.5,
      fontSize: 18,
      color: "#64748b",
      align: "center",
      fontWeight: "normal"
    },

    // TTD 2
    ttd2ImagePos: {
      xPercent: 73,
      yPercent: 74,
      widthPercent: 12
    },
    ttd2NamaPos: {
      xPercent: 73,
      yPercent: 85.5,
      fontSize: 24,
      color: "#1e293b",
      align: "center",
      fontWeight: "bold"
    },
    ttd2JabatanPos: {
      xPercent: 73,
      yPercent: 88.5,
      fontSize: 18,
      color: "#64748b",
      align: "center",
      fontWeight: "normal"
    },
    ttd2SubText1Pos: {
      xPercent: 73,
      yPercent: 91.5,
      fontSize: 18,
      color: "#64748b",
      align: "center",
      fontWeight: "normal"
    },
    ttd2SubText2Pos: {
      xPercent: 73,
      yPercent: 94.5,
      fontSize: 18,
      color: "#64748b",
      align: "center",
      fontWeight: "normal"
    },

    // TTD 3
    ttd3ImagePos: {
      xPercent: 50,
      yPercent: 74,
      widthPercent: 12
    },
    ttd3NamaPos: {
      xPercent: 50,
      yPercent: 85.5,
      fontSize: 24,
      color: "#1e293b",
      align: "center",
      fontWeight: "bold"
    },
    ttd3JabatanPos: {
      xPercent: 50,
      yPercent: 88.5,
      fontSize: 18,
      color: "#64748b",
      align: "center",
      fontWeight: "normal"
    },
    ttd3SubText1Pos: {
      xPercent: 50,
      yPercent: 91.5,
      fontSize: 18,
      color: "#64748b",
      align: "center",
      fontWeight: "normal"
    },
    ttd3SubText2Pos: {
      xPercent: 50,
      yPercent: 94.5,
      fontSize: 18,
      color: "#64748b",
      align: "center",
      fontWeight: "normal"
    },
    jpHeaderTitlePos: {
      xPercent: 50,
      yPercent: 7.7,
      fontSize: 38,
      color: "#1e1b4b",
      align: "center",
      fontWeight: "bold"
    },
    jpHeaderSubtitlePos: {
      xPercent: 50,
      yPercent: 11.6,
      fontSize: 28,
      color: "#1e1b4b",
      align: "center",
      fontWeight: "bold"
    },
    jpHeaderSub2Pos: {
      xPercent: 50,
      yPercent: 15.2,
      fontSize: 24,
      color: "#1e1b4b",
      align: "center",
      fontWeight: "bold"
    }
  }
};

const CONFIG_STORAGE_KEY = "nineteen_points_sertifikat_config_v7";
const DB_NAME = "NineteenPointsSertifikatDB_v7";
const STORE_NAME = "config_store";

// Memory cache for synchronous instant access
let cachedConfig: SertifikatLayoutConfig | null = null;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB not supported"));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function getSertifikatConfig(): SertifikatLayoutConfig {
  if (cachedConfig) return cachedConfig;
  try {
    const stored = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      cachedConfig = {
        ...DEFAULT_SERTIFIKAT_CONFIG,
        ...parsed,
        positions: {
          ...DEFAULT_SERTIFIKAT_CONFIG.positions,
          ...(parsed.positions || {})
        }
      };
      return cachedConfig;
    }
  } catch (e) {
    console.error("Gagal memuat konfigurasi sertifikat:", e);
  }
  return DEFAULT_SERTIFIKAT_CONFIG;
}

export async function getSertifikatConfigAsync(): Promise<SertifikatLayoutConfig> {
  if (cachedConfig) return cachedConfig;

  // 1. Coba ambil dari Supabase terlebih dahulu
  try {
    const { data, error } = await supabase
      .from("sertifikat_config")
      .select("config")
      .eq("id", "default")
      .maybeSingle();

    if (data && data.config) {
      cachedConfig = {
        ...DEFAULT_SERTIFIKAT_CONFIG,
        ...data.config,
        positions: {
          ...DEFAULT_SERTIFIKAT_CONFIG.positions,
          ...(data.config.positions || {})
        }
      };

      // Simpan salinan ke lokal untuk cadangan/offline
      try {
        localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(cachedConfig));
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        store.put(cachedConfig, CONFIG_STORAGE_KEY);
      } catch (localErr) {
        console.warn("Gagal menyimpan cadangan lokal:", localErr);
      }

      return cachedConfig;
    }
  } catch (e) {
    console.error("Gagal memuat konfigurasi dari Supabase, beralih ke lokal:", e);
  }

  // 2. Fallback ke IndexedDB lokal jika Supabase gagal/belum ada datanya
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(CONFIG_STORAGE_KEY);
    return new Promise((resolve) => {
      req.onsuccess = () => {
        if (req.result) {
          cachedConfig = {
            ...DEFAULT_SERTIFIKAT_CONFIG,
            ...req.result,
            positions: {
              ...DEFAULT_SERTIFIKAT_CONFIG.positions,
              ...(req.result.positions || {})
            }
          };
          resolve(cachedConfig);
        } else {
          resolve(getSertifikatConfig());
        }
      };
      req.onerror = () => resolve(getSertifikatConfig());
    });
  } catch (e) {
    return getSertifikatConfig();
  }
}

export async function saveSertifikatConfigAsync(config: SertifikatLayoutConfig): Promise<void> {
  cachedConfig = config;

  // 1. Simpan ke Supabase agar tersinkronisasi antar device
  try {
    const { error } = await supabase
      .from("sertifikat_config")
      .upsert({
        id: "default",
        config: config,
        updated_at: new Date().toISOString()
      });
    if (error) {
      console.error("Gagal menyimpan ke Supabase:", error);
    }
  } catch (e) {
    console.error("Gagal menyimpan ke Supabase:", e);
  }

  // 2. Simpan secara lokal (IndexedDB)
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.put(config, CONFIG_STORAGE_KEY);
  } catch (e) {
    console.error("Gagal menyimpan ke IndexedDB:", e);
  }

  // 3. Simpan ke localStorage
  try {
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
  } catch (e) {
    try {
      const lightConfig = {
        ...config,
        templateUrl: config.templateUrl && config.templateUrl.length > 500000 ? null : config.templateUrl,
        templateJpUrl: config.templateJpUrl && config.templateJpUrl.length > 500000 ? null : config.templateJpUrl,
        ttd1Image: config.ttd1Image && config.ttd1Image.length > 500000 ? null : config.ttd1Image,
        ttd2Image: config.ttd2Image && config.ttd2Image.length > 500000 ? null : config.ttd2Image,
        ttd3Image: config.ttd3Image && config.ttd3Image.length > 500000 ? null : config.ttd3Image,
      };
      localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(lightConfig));
    } catch (err) {
      console.warn("localStorage quota exceeded, stored in IndexedDB only.");
    }
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("sertifikat_config_updated", { detail: config }));
  }
}

export function saveSertifikatConfig(config: SertifikatLayoutConfig): void {
  saveSertifikatConfigAsync(config);
}

export async function resetSertifikatConfigAsync(): Promise<SertifikatLayoutConfig> {
  cachedConfig = DEFAULT_SERTIFIKAT_CONFIG;

  // 1. Reset di Supabase
  try {
    const { error } = await supabase
      .from("sertifikat_config")
      .upsert({
        id: "default",
        config: DEFAULT_SERTIFIKAT_CONFIG,
        updated_at: new Date().toISOString()
      });
    if (error) {
      console.error("Gagal mereset di Supabase:", error);
    }
  } catch (e) {
    console.error("Gagal mereset di Supabase:", e);
  }

  // 2. Reset di lokal
  try {
    localStorage.removeItem(CONFIG_STORAGE_KEY);
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.delete(CONFIG_STORAGE_KEY);
  } catch (e) {
    console.error("Gagal mereset konfigurasi sertifikat:", e);
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("sertifikat_config_updated", { detail: DEFAULT_SERTIFIKAT_CONFIG }));
  }
  return DEFAULT_SERTIFIKAT_CONFIG;
}

export function resetSertifikatConfig(): SertifikatLayoutConfig {
  resetSertifikatConfigAsync();
  return DEFAULT_SERTIFIKAT_CONFIG;
}
