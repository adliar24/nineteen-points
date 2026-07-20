export interface ElementPosition {
  xPercent: number; // 0 - 100%
  yPercent: number; // 0 - 100%
  fontSize: number; // px at base width 2000px
  color: string;    // HEX / RGB
  align: "center" | "left" | "right";
  fontWeight?: string;
  fontStyle?: string;
}

export interface TtdElementPosition {
  xPercent: number;
  yPercent: number;
  widthPercent: number;
}

export interface SertifikatLayoutConfig {
  templateUrl: string | null; // Data URL or relative URL
  
  // TTD 1 (Penanda Tangan Kiri)
  ttd1Image: string | null;
  ttd1Nama: string;
  ttd1Jabatan: string;

  // TTD 2 (Penanda Tangan Kanan)
  ttd2Image: string | null;
  ttd2Nama: string;
  ttd2Jabatan: string;

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
  };
}

export const DEFAULT_SERTIFIKAT_CONFIG: SertifikatLayoutConfig = {
  templateUrl: null, // Default uses /sertifikat_template.png
  
  ttd1Image: null,
  ttd1Nama: "Ben Harrington",
  ttd1Jabatan: "CEO",

  ttd2Image: null,
  ttd2Nama: "Sameer Shah",
  ttd2Jabatan: "Manager",

  positions: {
    noSertifikat: {
      xPercent: 50,
      yPercent: 22.5,
      fontSize: 26,
      color: "#284478",
      align: "center",
      fontWeight: "bold"
    },
    prefixNama: {
      xPercent: 50,
      yPercent: 32.5,
      fontSize: 24,
      color: "#334155",
      align: "center",
      fontWeight: "normal"
    },
    namaGuru: {
      xPercent: 50,
      yPercent: 46.5,
      fontSize: 72,
      color: "#2d5ca8",
      align: "center",
      fontWeight: "bold",
      fontStyle: "italic"
    },
    deskripsi: {
      xPercent: 50,
      yPercent: 58.0,
      fontSize: 24,
      color: "#334155",
      align: "center",
      fontWeight: "normal"
    },
    
    // TTD 1 (Kiri)
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

    // TTD 2 (Kanan)
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
    }
  }
};

const CONFIG_STORAGE_KEY = "nineteen_points_sertifikat_config_v3";
const DB_NAME = "NineteenPointsSertifikatDB";
const STORE_NAME = "config_store";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function getSertifikatConfig(): SertifikatLayoutConfig {
  try {
    const stored = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        ...DEFAULT_SERTIFIKAT_CONFIG,
        ...parsed,
        positions: {
          ...DEFAULT_SERTIFIKAT_CONFIG.positions,
          ...(parsed.positions || {})
        }
      };
    }
  } catch (e) {
    console.error("Gagal memuat konfigurasi sertifikat:", e);
  }
  return DEFAULT_SERTIFIKAT_CONFIG;
}

export async function getSertifikatConfigAsync(): Promise<SertifikatLayoutConfig> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(CONFIG_STORAGE_KEY);
    return new Promise((resolve) => {
      req.onsuccess = () => {
        if (req.result) {
          resolve({
            ...DEFAULT_SERTIFIKAT_CONFIG,
            ...req.result,
            positions: {
              ...DEFAULT_SERTIFIKAT_CONFIG.positions,
              ...(req.result.positions || {})
            }
          });
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
  // 1. Save to IndexedDB (Supports large Data URLs with no quota limit)
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.put(config, CONFIG_STORAGE_KEY);
  } catch (e) {
    console.error("Gagal menyimpan ke IndexedDB:", e);
  }

  // 2. Try saving to localStorage as fallback
  try {
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
  } catch (e) {
    // If quota exceeded due to large images, save lightweight version without heavy image strings
    try {
      const lightConfig = {
        ...config,
        templateUrl: config.templateUrl && config.templateUrl.length > 500000 ? null : config.templateUrl,
        ttd1Image: config.ttd1Image && config.ttd1Image.length > 500000 ? null : config.ttd1Image,
        ttd2Image: config.ttd2Image && config.ttd2Image.length > 500000 ? null : config.ttd2Image,
      };
      localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(lightConfig));
    } catch (err) {
      console.warn("localStorage quota exceeded, stored in IndexedDB only.");
    }
  }

  // 3. Dispatch global custom event so all views re-render instantly
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("sertifikat_config_updated", { detail: config }));
  }
}

export function saveSertifikatConfig(config: SertifikatLayoutConfig): void {
  saveSertifikatConfigAsync(config);
}

export async function resetSertifikatConfigAsync(): Promise<SertifikatLayoutConfig> {
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
