import React, { useState, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "../queryClient";
import {
  Search,
  AlertCircle,
  Check,
  Zap,
  X,
  User,
  ScanFace,
  QrCode,
} from "lucide-react";
import { Siswa, UserSession } from "../types";
import {
  getSiswaListLight,
  getAturanKehadiranList,
  saveKehadiran,
  updateCachedSiswaPoin,
  AturanKehadiran
} from "../dbStore";
import { toSentenceCase, compareClasses } from "../formatName";
import FaceScanner from "./face/FaceScanner";
import QrScanner, { QrScanFeedback } from "./scan/QrScanner";
import InputModeTabs, { InputMode, ScanType } from "./scan/InputModeTabs";

interface InputKehadiranViewProps {
  userSession: UserSession;
}

export default function InputKehadiranView({ userSession }: InputKehadiranViewProps) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Two big tabs: "Scan" (QR / Wajah) and "Input Manual"
  const [mode, setMode] = useState<InputMode>("scan");
  const [scanType, setScanType] = useState<ScanType>("qr");

  // Fullscreen scanner states
  const [showQrScanner, setShowQrScanner] = useState(false);
  const [showFaceScanner, setShowFaceScanner] = useState(false);

  // Core Data Queries
  const { data: siswaList = [] } = useQuery({
    queryKey: ["siswa"],
    queryFn: getSiswaListLight,
  });

  const { data: aturanList = [] } = useQuery({
    queryKey: ["aturanKehadiran"],
    queryFn: getAturanKehadiranList,
  });

  // Active check-in target after scanning / manual lookup
  const [activeSiswa, setActiveSiswa] = useState<Siswa | null>(null);

  // Siswa Attendance form states
  const [siswaCategory, setSiswaCategory] = useState<"tepat_waktu" | "terlambat" | "izin_sakit" | "alfa">("tepat_waktu");
  const [siswaStatus, setSiswaStatus] = useState<string>("tepat_waktu");
  const [siswaPoints, setSiswaPoints] = useState(15);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Search filter query inputs
  const [searchSiswaQuery, setSearchSiswaQuery] = useState("");
  const [manualSelectedClass, setManualSelectedClass] = useState("Semua");

  // Aturan points map
  const aturanMap = useMemo(() => {
    const map: Record<string, AturanKehadiran> = {};
    aturanList.forEach(rule => {
      map[rule.status] = rule;
    });
    return map;
  }, [aturanList]);

  const handleQrScan = async (decodedText: string): Promise<QrScanFeedback> => {
    const trimmed = decodedText.trim();
    const student = siswaList.find(s => s.nis === trimmed || s.id === trimmed);
    if (!student) {
      return {
        type: "not_found",
        title: "TIDAK DIKENALI",
        message: `QR: "${trimmed}"`,
      };
    }
    setActiveSiswa(student);
    setSiswaCategory("tepat_waktu");
    setSiswaStatus("tepat_waktu");
    setSiswaPoints(aturanMap["tepat_waktu"]?.nilai_poin ?? 15);
    setSuccessMsg(null);
    setTimeout(() => setShowQrScanner(false), 900);
    return {
      type: "success",
      title: "BERHASIL TERDETEKSI",
      message: toSentenceCase(student.nama),
      kelas: student.kelas,
      fotoUrl: student.foto_url || undefined,
    };
  };

  const handleFaceMatch = (student: Siswa) => {
    setActiveSiswa(student);
    setSiswaCategory("tepat_waktu");
    setSiswaStatus("tepat_waktu");
    setSiswaPoints(aturanMap["tepat_waktu"]?.nilai_poin ?? 15);
    setSuccessMsg(null);
    setShowFaceScanner(false);
  };

  // Student Attendance Submit
  const handleSaveSiswaAttendance = async () => {
    if (!activeSiswa) return;
    setIsSubmitting(true);
    try {
      await saveKehadiran(
        activeSiswa.id,
        siswaStatus,
        siswaPoints,
        userSession.email,
        todayStr
      );
      setSuccessMsg(`Berhasil mencatat kehadiran ${toSentenceCase(activeSiswa.nama)}.`);
      setActiveSiswa(null);
      queryClient.invalidateQueries({ queryKey: ["kehadiran"] });
      updateCachedSiswaPoin(activeSiswa.id, siswaPoints);
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (err: any) {
      setErrorMsg("Gagal menyimpan kehadiran: " + err.message);
      setTimeout(() => setErrorMsg(null), 5000);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Unique classes for manual filter dropdown (sorted by grade and alphabetically)
  const classes = useMemo(() => {
    const rawClasses = Array.from(new Set(siswaList.map(s => s.kelas).filter(Boolean)));
    return ["Semua", ...rawClasses.sort(compareClasses)];
  }, [siswaList]);

  // Filters manual dropdown lookup
  const filteredSiswaLookup = useMemo(() => {
    const list = siswaList.filter(s => {
      const matchesSearch = !searchSiswaQuery.trim() ||
                            s.nama.toLowerCase().includes(searchSiswaQuery.toLowerCase()) ||
                            s.nis.includes(searchSiswaQuery);
      const matchesClass = manualSelectedClass === "Semua" || s.kelas === manualSelectedClass;
      return matchesSearch && matchesClass;
    });
    return list.slice(0, 100);
  }, [siswaList, searchSiswaQuery, manualSelectedClass]);

  const activateSiswa = (student: Siswa) => {
    setActiveSiswa(student);
    setSiswaCategory("tepat_waktu");
    setSiswaStatus("tepat_waktu");
    setSiswaPoints(aturanMap["tepat_waktu"]?.nilai_poin ?? 15);
  };

  return (
    <div className="space-y-6 pb-12 animate-fade-in font-sans">
      {/* Header */}
      <div>
        <h2 className="text-xl font-extrabold text-brand-950 tracking-tight">
          Pencatatan Kehadiran Harian (KBM)
        </h2>
        <p className="text-xs text-brand-500 font-semibold mt-1">
          Scan kartu pelajar atau cari nama murid untuk melakukan input kehadiran manual.
        </p>
      </div>

      {/* SUCCESS / ERROR ALERTS */}
      <AnimatePresence>
        {successMsg && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="p-4 bg-emerald-50 border border-emerald-100 text-emerald-800 rounded-2xl text-xs font-bold flex items-center gap-3 shadow-md"
          >
            <div className="w-6 h-6 rounded-lg bg-emerald-500 text-white flex items-center justify-center flex-shrink-0">
              <Check className="w-3.5 h-3.5" />
            </div>
            <span>{successMsg}</span>
          </motion.div>
        )}

        {errorMsg && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="p-4 bg-rose-50 border border-rose-100 text-rose-800 rounded-2xl text-xs font-bold flex items-center gap-3 shadow-md"
          >
            <div className="w-6 h-6 rounded-lg bg-rose-500 text-white flex items-center justify-center flex-shrink-0">
              <AlertCircle className="w-3.5 h-3.5" />
            </div>
            <span>{errorMsg}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Method Tabs */}
      {!activeSiswa && (
        <InputModeTabs
          mode={mode}
          scanType={scanType}
          onModeChange={setMode}
          onScanTypeChange={setScanType}
        />
      )}

      {/* 1. TAB SCAN QR */}
      {!activeSiswa && mode === "scan" && scanType === "qr" && (
        <div className="max-w-xl mx-auto bg-white p-6 rounded-3xl border border-brand-100 shadow-xl shadow-brand-900/5 space-y-6 text-center">
          <div className="space-y-1">
            <h4 className="font-extrabold text-sm text-brand-950">Scan QR Kartu Pelajar</h4>
            <p className="text-xs text-brand-500 font-semibold">Pindai QR untuk langsung mengenali murid dan mencatat kehadiran.</p>
          </div>

          <div className="p-8 text-center space-y-4">
            <div className="w-14 h-14 bg-brand-50 text-brand-600 rounded-full flex items-center justify-center mx-auto border border-brand-100">
              <QrCode className="w-6 h-6 animate-pulse" />
            </div>
            <p className="text-xs text-brand-500 font-semibold max-w-xs mx-auto">
              Arahkan kamera ke QR kartu pelajar. Scanner terbuka layar penuh dan otomatis mendeteksi murid.
            </p>
            <button
              onClick={() => setShowQrScanner(true)}
              className="px-6 py-2.5 bg-brand-600 hover:bg-brand-700 text-white font-extrabold text-xs rounded-xl shadow-md cursor-pointer border-0 transition-all flex items-center justify-center gap-2 mx-auto"
            >
              <QrCode className="w-4 h-4" />
              Mulai Scan QR
            </button>
          </div>
        </div>
      )}

      {/* 2. TAB SCAN WAJAH */}
      {!activeSiswa && mode === "scan" && scanType === "face" && (
        <div className="max-w-xl mx-auto bg-white p-6 rounded-3xl border border-brand-100 shadow-xl shadow-brand-900/5 space-y-6 text-center">
          <div className="space-y-1">
            <h4 className="font-extrabold text-sm text-brand-950">Scan Wajah (AI)</h4>
            <p className="text-xs text-brand-500 font-semibold">Posisikan wajah murid di depan kamera untuk absensi otomatis.</p>
          </div>

          <div className="p-8 text-center space-y-4">
            <div className="w-14 h-14 bg-brand-50 text-brand-600 rounded-full flex items-center justify-center mx-auto border border-brand-100">
              <ScanFace className="w-6 h-6 animate-pulse" />
            </div>
            <p className="text-xs text-brand-500 font-semibold max-w-xs mx-auto">
              Sistem AI mencocokkan wajah murid dengan data tersimpan lalu membuka form kehadiran.
            </p>
            <button
              onClick={() => setShowFaceScanner(true)}
              className="px-6 py-2.5 bg-brand-600 hover:bg-brand-700 text-white font-extrabold text-xs rounded-xl shadow-md cursor-pointer border-0 transition-all flex items-center justify-center gap-2 mx-auto"
            >
              <ScanFace className="w-4 h-4" />
              Mulai Scan Wajah
            </button>
          </div>
        </div>
      )}

      {/* 3. TAB MANUAL */}
      {!activeSiswa && mode === "manual" && (
        <div className="max-w-xl mx-auto bg-white p-6 rounded-3xl border border-brand-100 shadow-xl shadow-brand-900/5 space-y-4">
          <div className="space-y-1">
            <h4 className="font-extrabold text-sm text-brand-950">Lookup Manual Murid</h4>
            <p className="text-xs text-brand-500 font-semibold">Cari nama atau nomor NIS siswa untuk input absensi manual.</p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-3.5 text-brand-500/50 w-4.5 h-4.5" />
              <input
                type="text"
                placeholder="Masukkan nama atau NIS murid..."
                value={searchSiswaQuery}
                onChange={(e) => setSearchSiswaQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-[#faf9ff] rounded-2xl border border-brand-100 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-brand-500 text-brand-950 placeholder-brand-500/30"
              />
            </div>
            <select
              value={manualSelectedClass}
              onChange={(e) => setManualSelectedClass(e.target.value)}
              className="border border-brand-100 rounded-2xl py-3 px-4 text-xs font-bold text-brand-700 outline-none focus:ring-2 focus:ring-brand-500 bg-white"
            >
              {classes.map(c => (
                <option key={c} value={c}>Kelas: {c}</option>
              ))}
            </select>
          </div>

          {filteredSiswaLookup.length > 0 && (
            <div className="divide-y border border-brand-100 rounded-2xl overflow-hidden bg-white max-h-60 overflow-y-auto">
              {filteredSiswaLookup.map(student => (
                <button
                  key={student.id}
                  onClick={() => activateSiswa(student)}
                  className="w-full p-4 hover:bg-brand-50/40 transition-colors flex items-center justify-between text-left cursor-pointer border-0 bg-transparent"
                >
                  <div>
                    <span className="font-extrabold text-xs text-brand-950 block">{toSentenceCase(student.nama)}</span>
                    <span className="text-[10px] text-slate-400 font-bold">NIS {student.nis}</span>
                  </div>
                  <span className="text-[10px] font-black text-brand-600 bg-brand-50 border border-brand-100 px-2.5 py-1 rounded-lg">
                    Kelas {student.kelas}
                  </span>
                </button>
              ))}
              {filteredSiswaLookup.length === 100 && (
                <div className="p-3 bg-amber-50/60 text-[10px] text-amber-800 font-bold border-t border-brand-100 text-center">
                  Menampilkan 100 murid pertama. Gunakan kolom pencarian atau filter kelas untuk hasil spesifik.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 4. ACTIVE FORM SISWA POPUP MODAL */}
      {activeSiswa && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/75">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden border border-brand-150"
          >
            <div className="px-6 py-5 bg-brand-50 border-b border-brand-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-brand-100 rounded-xl flex items-center justify-center text-brand-600">
                  <User className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-brand-950 text-sm">Absensi Siswa</h3>
                  <p className="text-[10.5px] font-semibold text-brand-500 mt-0.5">
                    {toSentenceCase(activeSiswa.nama)} ({activeSiswa.kelas})
                  </p>
                </div>
              </div>
              <button
                onClick={() => setActiveSiswa(null)}
                className="p-1.5 rounded-xl hover:bg-brand-200/50 text-brand-400 hover:text-brand-800 transition-all cursor-pointer bg-transparent border-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Category Tab selectors */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-brand-700 uppercase tracking-widest block">Kategori Absen</label>
                <div className="grid grid-cols-4 gap-1.5">
                  {(["tepat_waktu", "terlambat", "izin_sakit", "alfa"] as const).map(cat => {
                    const active = siswaCategory === cat;
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => {
                          setSiswaCategory(cat);
                          if (cat === "tepat_waktu") {
                            setSiswaStatus("tepat_waktu");
                            setSiswaPoints(aturanMap["tepat_waktu"]?.nilai_poin ?? 15);
                          } else if (cat === "alfa") {
                            setSiswaStatus("alfa");
                            setSiswaPoints(aturanMap["alfa"]?.nilai_poin ?? -100);
                          } else if (cat === "terlambat") {
                            setSiswaStatus("telat_15");
                            setSiswaPoints(aturanMap["telat_15"]?.nilai_poin ?? -10);
                          } else {
                            setSiswaStatus("sakit");
                            setSiswaPoints(aturanMap["sakit"]?.nilai_poin ?? 0);
                          }
                        }}
                        className={`py-2 px-1 rounded-xl border text-[10px] font-black text-center cursor-pointer transition-all uppercase tracking-wider ${
                          active
                            ? "bg-brand-600 text-white border-transparent"
                            : "bg-[#faf9ff] border-brand-100 text-brand-700 hover:bg-slate-50"
                        }`}
                      >
                        {cat.replace("_", " ")}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Status Selectors */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-brand-700 uppercase tracking-widest block">Status Detail</label>
                {siswaCategory === "terlambat" && (
                  <select
                    value={siswaStatus}
                    onChange={(e) => {
                      setSiswaStatus(e.target.value);
                      setSiswaPoints(aturanMap[e.target.value]?.nilai_poin ?? 0);
                    }}
                    className="w-full border border-brand-100 rounded-xl p-3 text-xs font-bold text-brand-800 bg-[#faf9ff] outline-none cursor-pointer"
                  >
                    <option value="telat_15">Terlambat &le; 15 menit ({aturanMap["telat_15"]?.nilai_poin ?? 0} Poin)</option>
                    <option value="telat_30">Terlambat &le; 30 menit ({aturanMap["telat_30"]?.nilai_poin ?? 0} Poin)</option>
                    <option value="telat_60">Terlambat &le; 60 menit ({aturanMap["telat_60"]?.nilai_poin ?? 0} Poin)</option>
                    <option value="telat_over">Terlambat &gt; 60 menit ({aturanMap["telat_over"]?.nilai_poin ?? 0} Poin)</option>
                  </select>
                )}

                {siswaCategory === "izin_sakit" && (
                  <select
                    value={siswaStatus}
                    onChange={(e) => {
                      setSiswaStatus(e.target.value);
                      setSiswaPoints(aturanMap[e.target.value]?.nilai_poin ?? 0);
                    }}
                    className="w-full border border-brand-100 rounded-xl p-3 text-xs font-bold text-brand-800 bg-[#faf9ff] outline-none cursor-pointer"
                  >
                    <option value="sakit">Sakit ({aturanMap["sakit"]?.nilai_poin ?? 0} Poin)</option>
                    <option value="izin">Izin ({aturanMap["izin"]?.nilai_poin ?? 0} Poin)</option>
                  </select>
                )}

                {siswaCategory === "tepat_waktu" && (
                  <input
                    type="text"
                    value="Hadir Tepat Waktu"
                    disabled
                    className="w-full border border-brand-100 rounded-xl p-3 text-xs font-bold text-slate-400 bg-brand-50/50 outline-none"
                  />
                )}

                {siswaCategory === "alfa" && (
                  <input
                    type="text"
                    value="Alfa (Tanpa Keterangan)"
                    disabled
                    className="w-full border border-brand-100 rounded-xl p-3 text-xs font-bold text-slate-400 bg-brand-50/50 outline-none"
                  />
                )}
              </div>

              {/* Point Feedback Value Display */}
              <div className="bg-brand-50/50 border border-brand-100 rounded-2xl p-4 flex items-center justify-between">
                <span className="text-[10px] font-black text-brand-700 uppercase tracking-widest flex items-center gap-1.5">
                  <Zap className="w-4 h-4 text-brand-500" />
                  Konsekuensi Poin:
                </span>
                <span className={`font-mono text-base font-black ${siswaPoints >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                  {siswaPoints >= 0 ? `+${siswaPoints}` : siswaPoints} Poin
                </span>
              </div>
            </div>

            <div className="px-6 py-4 bg-brand-50/50 border-t border-brand-100 flex items-center justify-end gap-3">
              <button
                onClick={() => setActiveSiswa(null)}
                className="px-4 py-2.5 rounded-2xl hover:bg-brand-200/40 text-brand-600 hover:text-brand-900 font-bold text-sm transition-all cursor-pointer bg-transparent border-0"
              >
                Batal
              </button>
              <button
                onClick={handleSaveSiswaAttendance}
                disabled={isSubmitting}
                className="px-5 py-2.5 rounded-2xl bg-gradient-to-r from-brand-600 to-brand-700 hover:from-brand-700 hover:to-brand-800 text-white font-bold text-sm shadow-md transition-all cursor-pointer border-0"
              >
                {isSubmitting ? "Menyimpan..." : "Simpan Absen"}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {showQrScanner && (
        <QrScanner
          title="Scan QR - Kehadiran"
          subtitle="Pindai kartu pelajar murid untuk mencatat kehadiran"
          onScanSuccess={handleQrScan}
          onClose={() => setShowQrScanner(false)}
        />
      )}

      {showFaceScanner && (
        <FaceScanner
          siswaList={siswaList}
          title="Scan Wajah - Kehadiran"
          subtitle="Posisikan wajah murid untuk membuka form kehadiran"
          onMatchSuccess={handleFaceMatch}
          onClose={() => setShowFaceScanner(false)}
        />
      )}
    </div>
  );
}
