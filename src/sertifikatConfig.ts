export interface ElementPosition {
  xPercent: number; // 0 - 100%
  yPercent: number; // 0 - 100%
  fontSize: number; // px at base width 2000px
  color: string;    // HEX / RGB
  align: "center" | "left" | "right";
  fontWeight?: string;
  fontStyle?: string;
  lineHeightMultiplier?: number; // Spasi antar baris (misal 1.0 - 2.5)
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

  // TTD 2
  ttd2Image: string | null;
  ttd2Nama: string;
  ttd2Jabatan: string;

  // TTD 3
  ttd3Image: string | null;
  ttd3Nama: string;
  ttd3Jabatan: string;

  // Template Deskripsi Kustom (Mendukung Markdown **bold**)
  deskripsiTemplate: string;

  // Posisi & Styling Elemen
  positions: {
    noSertifikat: ElementPosition;
    prefixNama: ElementPosition; // e.g., "Diberikan kepada:"
    namaGuru: ElementPosition;
    deskripsi: ElementPosition;
    
    // TTD 1
    ttd1ImagePos: TtdElementPosition;
    ttd1NamaPos: ElementPosition;
    ttd1JabatanPos: ElementPosition;

    // TTD 2
    ttd2ImagePos: TtdElementPosition;
    ttd2NamaPos: ElementPosition;
    ttd2JabatanPos: ElementPosition;

    // TTD 3
    ttd3ImagePos: TtdElementPosition;
    ttd3NamaPos: ElementPosition;
    ttd3JabatanPos: ElementPosition;
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

  ttd2Image: null,
  ttd2Nama: "Sameer Shah",
  ttd2Jabatan: "Manager",

  ttd3Image: null,
  ttd3Nama: "Drs. H. Sukarno, M.Pd.",
  ttd3Jabatan: "Kepala SMAN 19 Bandung",

  deskripsiTemplate: 'Atas partisipasi aktifnya sebagai **{peran}** dalam kegiatan **"{nama_kegiatan}"** yang diselenggarakan oleh **{penyelenggara}**.',

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
    }
  }
};

const CONFIG_STORAGE_KEY = "nineteen_points_sertifikat_config_v6";
const DB_NAME = "NineteenPointsSertifikatDB_v6";
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

  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.put(config, CONFIG_STORAGE_KEY);
  } catch (e) {
    console.error("Gagal menyimpan ke IndexedDB:", e);
  }

  try {
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
  } catch (e) {
    try {
      const lightConfig = {
        ...config,
        templateUrl: config.templateUrl && config.templateUrl.length > 500000 ? null : config.templateUrl,
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
