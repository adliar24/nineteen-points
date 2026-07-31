import React, { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Html5Qrcode } from "html5-qrcode";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "../queryClient";
import {
  Camera,
  AlertCircle,
  Check,
  X,
  Zap,
  Users,
  Clock,
  RefreshCw,
  Sparkles,
  BookOpen
} from "lucide-react";
import { Siswa, UserSession } from "../types";
import {
  getSiswaList,
  addRiwayat,
  checkSholatToday,
  getSholatRecapToday,
  SHOLAT_POIN_NAMA,
  SHOLAT_POIN_VALUE,
  SHOLAT_DHUHA_POIN_NAMA,
  SHOLAT_DHUHA_POIN_VALUE,
  SHOLAT_JUMAT_POIN_NAMA,
  SHOLAT_JUMAT_POIN_VALUE
} from "../dbStore";
import { toSentenceCase } from "../formatName";

interface SholatScanViewProps {
  userSession: UserSession;
}

export default function SholatScanView({ userSession }: SholatScanViewProps) {
  const [sholatType, setSholatType] = useState<"dhuha" | "jumat" | "berjamaah">("dhuha");

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
    queryFn: getSiswaList,
  });

  const { data: todayRecap = [], refetch: refetchRecap } = useQuery({
    queryKey: ["sholatRecapToday", sholatType],
    queryFn: () => getSholatRecapToday(currentPoinNama),
  });

  const [cameraActive, setCameraActive] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);

  const [lastScanned, setLastScanned] = useState<{
    nama: string;
    kelas: string;
    status: "success" | "duplicate" | "not_found";
  } | null>(null);

  const lastProcessedRef = useRef<string>("");
  const processingRef = useRef(false);

  const scannedCount = useMemo(() => todayRecap.length, [todayRecap]);

  const stopScanner = () => {
    if (scannerRef.current) {
      const s = scannerRef.current;
      scannerRef.current = null;
      try {
        s.stop().then(() => { try { s.clear(); } catch {} }).catch(() => { try { s.clear(); } catch {} });
      } catch {
        try { s.clear(); } catch {}
      }
    }
  };

  useEffect(() => {
    return () => {
      if (scannerRef.current) {
        const s = scannerRef.current;
        scannerRef.current = null;
        try { s.stop().then(() => { try { s.clear(); } catch {} }).catch(() => { try { s.clear(); } catch {} }); } catch { try { s.clear(); } catch {} }
      }
    };
  }, []);

  useEffect(() => {
    if (cameraActive) {
      setScannerError(null);
      const timer = setTimeout(() => {
        try {
          const scanner = new Html5Qrcode("sholat-reader");
          scannerRef.current = scanner;
          scanner.start(
            { facingMode: "environment" },
            { fps: 10, qrbox: { width: 250, height: 250 } },
            onScanSuccess,
            () => {}
          ).catch(() => {
            setScannerError("Gagal mengaktifkan kamera. Berikan izin kamera pada browser.");
            setCameraActive(false);
          });
        } catch {
          setScannerError("Gagal mengakses kamera.");
          setCameraActive(false);
        }
      }, 400);

      return () => {
        clearTimeout(timer);
        stopScanner();
      };
    }
  }, [cameraActive, sholatType]);

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

  const onScanSuccess = async (decodedText: string) => {
    const trimmed = decodedText.trim();

    if (processingRef.current || trimmed === lastProcessedRef.current) return;
    processingRef.current = true;
    lastProcessedRef.current = trimmed;
    setTimeout(() => { lastProcessedRef.current = ""; }, 2000);

    try {
      const student = siswaList.find(s => s.nis === trimmed || s.id === trimmed);
      if (!student) {
        setLastScanned({ nama: `QR: ${trimmed}`, kelas: "-", status: "not_found" });
        setTimeout(() => setLastScanned(null), 3000);
        return;
      }

      const alreadyScanned = await checkSholatToday(student.id, currentPoinNama);
      if (alreadyScanned) {
        setLastScanned({ nama: student.nama, kelas: student.kelas, status: "duplicate" });
        setTimeout(() => setLastScanned(null), 3000);
        return;
      }

      await addRiwayat(student.id, currentPoinNama, currentPoinValue, userSession.fullName);
      playBeep();
      setLastScanned({ nama: student.nama, kelas: student.kelas, status: "success" });
      await refetchRecap();
      await queryClient.invalidateQueries({ queryKey: ["siswa"] });
      setTimeout(() => setLastScanned(null), 2000);
    } catch (err: any) {
      setScannerError("Gagal mencatat: " + err.message);
      setTimeout(() => setScannerError(null), 4000);
    } finally {
      processingRef.current = false;
    }
  };

  const handleToggleCamera = () => {
    if (cameraActive) {
      stopScanner();
      setCameraActive(false);
    } else {
      setLastScanned(null);
      setCameraActive(true);
    }
  };

  return (
    <div className="space-y-6 pb-12 animate-fade-in font-sans">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-brand-950 tracking-tight flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-emerald-600" />
            Scan {sholatType === "dhuha" ? "Sholat Dhuha" : sholatType === "jumat" ? "Sholat Jumat" : "Sholat Berjamaah"}
          </h2>
          <p className="text-xs text-brand-500 font-semibold mt-1">
            Pindai QR kartu pelajar — otomatis +{currentPoinValue} poin {currentPoinNama.toLowerCase()} tercatat.
          </p>
        </div>

        {/* Tab Selector for Sholat Type */}
        <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200 w-fit shrink-0">
          <button
            onClick={() => {
              if (cameraActive) stopScanner();
              setCameraActive(false);
              setSholatType("dhuha");
            }}
            className={`px-3.5 py-2 rounded-xl text-xs font-black transition-all cursor-pointer ${
              sholatType === "dhuha"
                ? "bg-white text-amber-700 shadow-md"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            Sholat Dhuha
          </button>
          <button
            onClick={() => {
              if (cameraActive) stopScanner();
              setCameraActive(false);
              setSholatType("jumat");
            }}
            className={`px-3.5 py-2 rounded-xl text-xs font-black transition-all cursor-pointer ${
              sholatType === "jumat"
                ? "bg-white text-indigo-700 shadow-md"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            Sholat Jumat
          </button>
          <button
            onClick={() => {
              if (cameraActive) stopScanner();
              setCameraActive(false);
              setSholatType("berjamaah");
            }}
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

      <div className="max-w-xl mx-auto bg-white p-6 rounded-3xl border border-brand-100 shadow-xl shadow-brand-900/5 space-y-6 text-center">
        <div className="flex items-center justify-between">
          <div className="text-left space-y-1">
            <h4 className="font-extrabold text-sm text-brand-950">Scanner {sholatType === "dhuha" ? "Sholat Dhuha" : "Sholat Berjamaah"}</h4>
            <p className="text-xs text-brand-500 font-semibold">Aktifkan kamera lalu arahkan ke QR murid.</p>
          </div>
          <div className="text-right">
            <p className="text-[9px] font-black text-brand-400 uppercase tracking-wider">Total Hari Ini</p>
            <p className="text-lg font-mono font-black text-emerald-700">{scannedCount}</p>
          </div>
        </div>

        <div className="relative aspect-square w-full max-w-xs mx-auto rounded-2xl overflow-hidden border border-brand-100 bg-[#faf9ff] flex items-center justify-center shadow-inner">
          {cameraActive ? (
            <>
              <div id="sholat-reader" className="w-full h-full object-cover relative" />
              <div className="absolute left-0 right-0 h-0.5 bg-emerald-500/80 animate-scan z-10 shadow-md shadow-emerald-500/20" />
            </>
          ) : (
            <div className="p-8 text-center space-y-4">
              <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto border border-emerald-100">
                <Camera className="w-6 h-6 animate-pulse" />
              </div>
              <button
                onClick={handleToggleCamera}
                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl shadow-md cursor-pointer border-0 transition-all"
              >
                Aktifkan Kamera
              </button>
            </div>
          )}
          {cameraActive && (
            <button
              onClick={handleToggleCamera}
              className="absolute bottom-3 right-3 z-10 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shadow-lg cursor-pointer"
            >
              Tutup
            </button>
          )}
        </div>

        <AnimatePresence>
          {lastScanned && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className={`p-4 rounded-2xl border text-xs font-bold flex items-center gap-3 ${
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
      </div>

      <div className="max-w-xl mx-auto bg-white p-6 rounded-3xl border border-brand-100 shadow-xl shadow-brand-900/5 space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="font-extrabold text-sm text-brand-950 flex items-center gap-2">
            <Users className="w-4 h-4 text-brand-600" />
            Rekap {sholatType === "dhuha" ? "Sholat Dhuha" : "Sholat Berjamaah"} Hari Ini
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
            <p className="text-xs font-bold text-brand-400">Belum ada murid yang scan sholat hari ini.</p>
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
    </div>
  );
}
