import React, { useState, useMemo, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "../queryClient";
import {
  AlertCircle,
  Check,
  Users,
  RefreshCw,
  Sparkles,
  BookOpen,
  ScanFace,
  QrCode,
  Search,
} from "lucide-react";
import { Siswa, UserSession } from "../types";
import {
  getSiswaListLight,
  addRiwayat,
  getSholatRecapToday,
  updateCachedSiswaPoin,
  SHOLAT_POIN_NAMA,
  SHOLAT_POIN_VALUE,
  SHOLAT_DHUHA_POIN_NAMA,
  SHOLAT_DHUHA_POIN_VALUE,
  SHOLAT_JUMAT_POIN_NAMA,
  SHOLAT_JUMAT_POIN_VALUE
} from "../dbStore";
import { toSentenceCase, compareClasses } from "../formatName";
import FaceScanner from "./face/FaceScanner";
import QrScanner, { QrScanFeedback } from "./scan/QrScanner";
import InputModeTabs, { InputMode, ScanType } from "./scan/InputModeTabs";

interface SholatScanViewProps {
  userSession: UserSession;
}

export default function SholatScanView({ userSession }: SholatScanViewProps) {
  const [sholatType, setSholatType] = useState<"dhuha" | "jumat" | "berjamaah">("dhuha");
  const [manualSelectedClass, setManualSelectedClass] = useState("Semua");

  const currentPoinNama =
    sholatType === "dhuha"
      ? SHOLAT_DHUHA_POIN_NAMA
      : sholatType === "jumat"
      ? SHOLAT_JUMAT_POIN_NAMA
      : SHOLAT_POIN_NAMA;

  const currentPoinValue =
    sholatType === "dhuha"
      ? SHOLAT_DHUHA_POIN_VALUE
      : sholatType === "jumat"
      ? SHOLAT_JUMAT_POIN_VALUE
      : SHOLAT_POIN_VALUE;

  const { data: siswaList = [] } = useQuery({
    queryKey: ["siswa"],
    queryFn: getSiswaListLight,
  });

  const { data: todayRecap = [], refetch: refetchRecap } = useQuery({
    queryKey: ["sholatRecapToday", sholatType],
    queryFn: () => getSholatRecapToday(currentPoinNama),
  });

  // Local Set of siswa_id already recorded today for THIS sholat type.
  // Avoids a Supabase round-trip per scan; updated in-memory on success.
  const recordedTodayRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    recordedTodayRef.current = new Set(todayRecap.map((r) => r.siswa_id));
  }, [todayRecap]);

  const [mode, setMode] = useState<InputMode>("scan");
  const [scanType, setScanType] = useState<ScanType>("qr");
  const [showQrScanner, setShowQrScanner] = useState(false);
  const [showFaceScanner, setShowFaceScanner] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);

  const [manualQuery, setManualQuery] = useState("");

  const [lastScanned, setLastScanned] = useState<{
    nama: string;
    kelas: string;
    status: "success" | "duplicate" | "not_found";
  } | null>(null);

  const handleStudentSholatAttendance = async (student: Siswa) => {
    try {
      if (recordedTodayRef.current.has(student.id)) {
        setLastScanned({ nama: student.nama, kelas: student.kelas, status: "duplicate" });
        setTimeout(() => setLastScanned(null), 3000);
        return;
      }

      await addRiwayat(student.id, currentPoinNama, currentPoinValue, userSession.fullName);
      playBeep();
      recordedTodayRef.current.add(student.id);
      appendToRecap(student);
      updateCachedSiswaPoin(student.id, currentPoinValue);
      setLastScanned({ nama: student.nama, kelas: student.kelas, status: "success" });
      setTimeout(() => setLastScanned(null), 3000);
    } catch (err: any) {
      setScannerError("Gagal mencatat sholat: " + err.message);
      setTimeout(() => setScannerError(null), 4000);
    }
  };

  const handleQrScan = async (decodedText: string): Promise<QrScanFeedback> => {
    const trimmed = decodedText.trim();
    const student = siswaList.find(s => s.nis === trimmed || s.id === trimmed);
    if (!student) {
      return { type: "not_found", title: "TIDAK DIKENALI", message: `QR: ${trimmed}` };
    }

    if (recordedTodayRef.current.has(student.id)) {
      return {
        type: "duplicate",
        title: "SUDAH TERCATAT",
        message: toSentenceCase(student.nama),
        kelas: student.kelas,
        fotoUrl: student.foto_url || undefined,
      };
    }

    await addRiwayat(student.id, currentPoinNama, currentPoinValue, userSession.fullName);
    recordedTodayRef.current.add(student.id);
    appendToRecap(student);
    updateCachedSiswaPoin(student.id, currentPoinValue);
    return {
      type: "success",
      title: "BERHASIL TERCATAT",
      message: toSentenceCase(student.nama),
      kelas: student.kelas,
      fotoUrl: student.foto_url || undefined,
    };
  };

  // Append a just-scanned student to the live recap cache (no refetch needed).
  const appendToRecap = (student: Siswa) => {
    queryClient.setQueryData<any[]>(["sholatRecapToday", sholatType], (old) => {
      if (!old) return old;
      return [
        {
          id: `local-${student.id}-${Date.now()}`,
          siswa_id: student.id,
          siswa_nama: student.nama,
          siswa_kelas: student.kelas,
          siswa_nis: student.nis,
          guru_email: userSession.fullName,
          created_at: new Date().toISOString(),
        },
        ...old,
      ];
    });
  };

  const scannedCount = useMemo(() => todayRecap.length, [todayRecap]);

  // Unique classes for manual filter dropdown (sorted by grade and alphabetically)
  const classes = useMemo(() => {
    const rawClasses = Array.from(new Set(siswaList.map(s => s.kelas).filter(Boolean)));
    return ["Semua", ...rawClasses.sort(compareClasses)];
  }, [siswaList]);

  const filteredStudents = useMemo(() => {
    const list = siswaList.filter(s => {
      const matchesSearch = !manualQuery.trim() ||
                            s.nama.toLowerCase().includes(manualQuery.toLowerCase()) ||
                            s.nis.includes(manualQuery);
      const matchesClass = manualSelectedClass === "Semua" || s.kelas === manualSelectedClass;
      return matchesSearch && matchesClass;
    });
    return list.slice(0, 100);
  }, [siswaList, manualQuery, manualSelectedClass]);

  const playBeep = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.15);
    } catch {
      // Audio context might be restricted, fail silently
    }
  };

  const sholatTypeLabel =
    sholatType === "dhuha" ? "Sholat Dhuha" : sholatType === "jumat" ? "Sholat Jumat" : "Sholat Berjamaah";

  return (
    <div className="space-y-6 pb-12 animate-fade-in font-sans">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-brand-950 tracking-tight flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-emerald-600" />
            Scan {sholatTypeLabel}
          </h2>
          <p className="text-xs text-brand-500 font-semibold mt-1">
            Pindai QR kartu pelajar — otomatis +{currentPoinValue} poin {currentPoinNama.toLowerCase()} tercatat.
          </p>
        </div>

        {/* Tab Selector for Sholat Type */}
        <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200 w-fit shrink-0">
          <button
            onClick={() => setSholatType("dhuha")}
            className={`px-3.5 py-2 rounded-xl text-xs font-black transition-all cursor-pointer ${
              sholatType === "dhuha"
                ? "bg-white text-amber-700 shadow-md"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            Sholat Dhuha
          </button>
          <button
            onClick={() => setSholatType("jumat")}
            className={`px-3.5 py-2 rounded-xl text-xs font-black transition-all cursor-pointer ${
              sholatType === "jumat"
                ? "bg-white text-indigo-700 shadow-md"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            Sholat Jumat
          </button>
          <button
            onClick={() => setSholatType("berjamaah")}
            className={`px-3.5 py-2 rounded-xl text-xs font-black transition-all cursor-pointer ${
              sholatType === "berjamaah"
                ? "bg-white text-emerald-700 shadow-md"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            Berjamaah
          </button>
        </div>
      </div>

      {/* Method Tabs */}
      <InputModeTabs
        mode={mode}
        scanType={scanType}
        onModeChange={setMode}
        onScanTypeChange={setScanType}
      />

      <AnimatePresence>
        {scannerError && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="p-4 bg-rose-50 border border-rose-100 text-rose-800 rounded-2xl text-xs font-bold flex items-center gap-3 shadow-md"
          >
            <div className="w-6 h-6 rounded-lg bg-rose-500 text-white flex items-center justify-center flex-shrink-0">
              <AlertCircle className="w-3.5 h-3.5" />
            </div>
            <span>{scannerError}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* SCAN MODE */}
      {mode === "scan" && (
        <div className="max-w-xl mx-auto bg-white p-6 rounded-3xl border border-brand-100 shadow-xl shadow-brand-900/5 space-y-6 text-center">
          <div className="flex items-center justify-between">
            <div className="text-left space-y-1">
              <h4 className="font-extrabold text-sm text-brand-950">Scanner {sholatTypeLabel}</h4>
              <p className="text-xs text-brand-500 font-semibold">Pilih metode untuk mencatat kehadiran sholat murid.</p>
            </div>
            <div className="text-right">
              <p className="text-[9px] font-black text-brand-400 uppercase tracking-wider">Total Hari Ini</p>
              <p className="text-lg font-mono font-black text-emerald-700">{scannedCount}</p>
            </div>
          </div>

          {scanType === "qr" ? (
            <div className="p-8 text-center space-y-4">
              <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto border border-emerald-100">
                <QrCode className="w-6 h-6 animate-pulse" />
              </div>
              <p className="text-xs text-brand-500 font-semibold max-w-xs mx-auto">
                Arahkan kamera ke QR kartu murid. Scanner terbuka layar penuh dan dapat memindai banyak murid sekaligus.
              </p>
              <button
                onClick={() => setShowQrScanner(true)}
                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl shadow-md cursor-pointer border-0 transition-all flex items-center justify-center gap-2 mx-auto"
              >
                <QrCode className="w-4 h-4" />
                Mulai Scan QR
              </button>
            </div>
          ) : (
            <div className="p-8 text-center space-y-4">
              <div className="w-14 h-14 bg-brand-50 text-brand-600 rounded-full flex items-center justify-center mx-auto border border-brand-100">
                <ScanFace className="w-6 h-6 animate-pulse" />
              </div>
              <p className="text-xs text-brand-500 font-semibold max-w-xs mx-auto">
                Posisikan wajah murid di depan kamera. Sistem AI mencocokkan wajah dan mencatat kehadiran secara otomatis.
              </p>
              <button
                onClick={() => setShowFaceScanner(true)}
                className="px-6 py-2.5 bg-brand-600 hover:bg-brand-700 text-white font-extrabold text-xs rounded-xl shadow-md cursor-pointer border-0 transition-all flex items-center justify-center gap-2 mx-auto"
              >
                <ScanFace className="w-4 h-4" />
                Mulai Scan Wajah
              </button>
            </div>
          )}
        </div>
      )}

      {/* MANUAL MODE */}
      {mode === "manual" && (
        <div className="max-w-xl mx-auto bg-white p-6 rounded-3xl border border-brand-100 shadow-xl shadow-brand-900/5 space-y-4">
          <div className="space-y-1">
            <h4 className="font-extrabold text-sm text-brand-950">Input Manual</h4>
            <p className="text-xs text-brand-500 font-semibold">Cari nama atau NIS murid untuk mencatat kehadiran sholat.</p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-3.5 text-brand-500/50 w-4.5 h-4.5" />
              <input
                type="text"
                placeholder="Masukkan nama atau NIS murid..."
                value={manualQuery}
                onChange={(e) => setManualQuery(e.target.value)}
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

          {filteredStudents.length > 0 && (
            <div className="divide-y border border-brand-100 rounded-2xl overflow-hidden bg-white max-h-60 overflow-y-auto font-sans">
              {filteredStudents.map(student => (
                <button
                  key={student.id}
                  onClick={() => {
                    setManualQuery("");
                    handleStudentSholatAttendance(student);
                  }}
                  className="w-full p-4 hover:bg-brand-50/40 transition-colors flex items-center justify-between text-left cursor-pointer border-0 bg-transparent"
                >
                  <div>
                    <span className="font-extrabold text-xs text-brand-950 block">{toSentenceCase(student.nama)}</span>
                    <span className="text-[10px] text-slate-400 font-bold">NIS {student.nis}</span>
                  </div>
                  <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-lg">
                    Kelas {student.kelas}
                  </span>
                </button>
              ))}
              {filteredStudents.length === 100 && (
                <div className="p-3 bg-amber-50/60 text-[10px] text-amber-800 font-bold border-t border-brand-100 text-center">
                  Menampilkan 100 murid pertama. Gunakan kolom pencarian atau filter kelas untuk hasil spesifik.
                </div>
              )}
            </div>
          )}

          {manualQuery.trim() && filteredStudents.length === 0 && (
            <div className="py-8 text-center text-xs font-bold text-brand-400">
              Murid tidak ditemukan. Silakan periksa kembali ketikan Anda.
            </div>
          )}
        </div>
      )}

      <AnimatePresence>
        {lastScanned && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className={`max-w-xl mx-auto p-4 rounded-2xl border text-xs font-bold flex items-center gap-3 ${
              lastScanned.status === "success"
                ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                : lastScanned.status === "duplicate"
                ? "bg-amber-50 border-amber-200 text-amber-800"
                : "bg-rose-50 border-rose-200 text-rose-800"
            }`}
          >
            <div className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 text-white ${
              lastScanned.status === "success" ? "bg-emerald-500" : lastScanned.status === "duplicate" ? "bg-amber-500" : "bg-rose-500"
            }`}>
              {lastScanned.status === "success" ? <Check className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
            </div>
            <div>
              {lastScanned.status === "success" && (
                <span>{toSentenceCase(lastScanned.nama)} ({lastScanned.kelas}) — <span className="text-emerald-600">+{currentPoinValue} Poin ({currentPoinNama})</span></span>
              )}
              {lastScanned.status === "duplicate" && (
                <span>{toSentenceCase(lastScanned.nama)} ({lastScanned.kelas}) — Sudah tercatat {currentPoinNama} hari ini</span>
              )}
              {lastScanned.status === "not_found" && (
                <span>{lastScanned.nama} — Tidak dikenali</span>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="max-w-xl mx-auto bg-white p-6 rounded-3xl border border-brand-100 shadow-xl shadow-brand-900/5 space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="font-extrabold text-sm text-brand-950 flex items-center gap-2">
            <Users className="w-4 h-4 text-brand-600" />
            Rekap {sholatTypeLabel} Hari Ini
          </h4>
          <button
            onClick={() => refetchRecap()}
            className="p-2 hover:bg-brand-100/60 text-brand-400 hover:text-brand-700 rounded-xl transition-all cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {todayRecap.length === 0 ? (
          <div className="py-12 text-center space-y-3">
            <div className="w-12 h-12 bg-brand-50 text-brand-300 rounded-full flex items-center justify-center mx-auto">
              <Sparkles className="w-6 h-6" />
            </div>
            <p className="text-xs font-bold text-brand-400">Belum ada murid yang melakukan input keagamaan hari ini.</p>
          </div>
        ) : (
          <div className="divide-y border border-brand-100 rounded-2xl overflow-hidden max-h-[300px] overflow-y-auto">
            {todayRecap.map((row) => (
              <div key={row.id} className="px-4 py-3 flex items-center justify-between hover:bg-brand-50/30 transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-white text-[10px] font-black flex-shrink-0">
                    {row.siswa_nama.slice(0, 2)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-brand-950 truncate">{toSentenceCase(row.siswa_nama)}</p>
                    <p className="text-[10px] text-brand-400 font-semibold">{row.siswa_kelas} &bull; NIS {row.siswa_nis}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                    +{SHOLAT_POIN_VALUE}
                  </span>
                  <span className="text-[10px] text-brand-400 font-mono">
                    {new Date(row.created_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showQrScanner && (
        <QrScanner
          title={`Scan QR - ${sholatTypeLabel}`}
          subtitle={`Setiap murid yang terpindai otomatis memperoleh +${currentPoinValue} poin sholat`}
          onScanSuccess={handleQrScan}
          onClose={() => setShowQrScanner(false)}
        />
      )}

      {showFaceScanner && (
        <FaceScanner
          siswaList={siswaList}
          title={`Scan Wajah - ${sholatTypeLabel}`}
          subtitle={`Setiap siswa yang terdeteksi otomatis memperoleh +${currentPoinValue} poin sholat`}
          onMatchSuccess={handleStudentSholatAttendance}
          onClose={() => setShowFaceScanner(false)}
        />
      )}
    </div>
  );
}
