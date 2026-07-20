import React, { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Html5Qrcode } from "html5-qrcode";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "../queryClient";
import {
  Camera,
  Search,
  AlertCircle,
  Check,
  Calendar,
  Clock,
  UserCheck,
  Users,
  Zap,
  LogIn,
  X,
  RefreshCw,
  BookOpen,
  User
} from "lucide-react";
import { Siswa, UserSession } from "../types";
import {
  getSiswaList,
  getAturanKehadiranList,
  getTodayKehadiranGuru,
  saveKehadiran,
  saveKehadiranGuruManual,
  getJadwalGuruList,
  AturanKehadiran
} from "../dbStore";
import { toSentenceCase, formatSubjectName } from "../formatName";
import { supabase } from "../supabaseClient";

interface InputKehadiranViewProps {
  userSession: UserSession;
}

export default function InputKehadiranView({ userSession }: InputKehadiranViewProps) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Core tab for input type: "scan" (Unified QR Scanner), "manual_siswa", "manual_guru"
  const [inputTab, setInputTab] = useState<"scan" | "siswa" | "guru">("scan");

  // QR Scanner States
  const [cameraActive, setCameraActive] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);

  // Core Data Queries
  const { data: siswaList = [] } = useQuery({
    queryKey: ["siswa"],
    queryFn: getSiswaList,
  });

  const { data: teachersList = [] } = useQuery({
    queryKey: ["teachersList"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, nama, email, role")
        .eq("role", "guru")
        .order("nama", { ascending: true });
      if (error) throw error;
      return data || [];
    }
  });

  const { data: aturanList = [] } = useQuery({
    queryKey: ["aturanKehadiran"],
    queryFn: getAturanKehadiranList,
  });

  // Determine Day Name
  const days = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
  const todayDayName = days[new Date().getDay()];

  // Active check-in targets after scanning / manual lookup
  const [activeSiswa, setActiveSiswa] = useState<Siswa | null>(null);
  const [activeGuru, setActiveGuru] = useState<any | null>(null);

  // Siswa Attendance form states
  const [siswaCategory, setSiswaCategory] = useState<"tepat_waktu" | "terlambat" | "izin_sakit" | "alfa">("tepat_waktu");
  const [siswaStatus, setSiswaStatus] = useState<string>("tepat_waktu");
  const [siswaPoints, setSiswaPoints] = useState(15);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Guru Attendance form states
  const [activeGuruJadwal, setActiveGuruJadwal] = useState<any | null>(null);
  const [guruStatus, setGuruStatus] = useState<'hadir' | 'sakit' | 'izin' | 'alfa'>('hadir');
  const [guruKeterangan, setGuruKeterangan] = useState("");

  // Search filter query inputs
  const [searchSiswaQuery, setSearchSiswaQuery] = useState("");
  const [searchGuruQuery, setSearchGuruQuery] = useState("");

  // Fetch selected teacher's schedules for today
  const { data: activeGuruSchedules = [], isLoading: loadingGuruSchedules } = useQuery({
    queryKey: ["guruSchedulesToday", activeGuru?.id],
    queryFn: async () => {
      if (!activeGuru?.id) return [];
      const list = await getJadwalGuruList(activeGuru.id);
      return list.filter((s: any) => s.hari === todayDayName);
    },
    enabled: !!activeGuru?.id
  });

  // Fetch selected teacher's presence records for today
  const { data: activeGuruTodayAttendance = [], refetch: refetchActiveGuruAttendance } = useQuery({
    queryKey: ["guruTodayKehadiran", activeGuru?.id],
    queryFn: () => getTodayKehadiranGuru(activeGuru.id, todayStr),
    enabled: !!activeGuru?.id
  });

  // Aturan points map
  const aturanMap = useMemo(() => {
    const map: Record<string, AturanKehadiran> = {};
    aturanList.forEach(rule => {
      map[rule.status] = rule;
    });
    return map;
  }, [aturanList]);

  // Handle camera scanning cycle
  useEffect(() => {
    if (cameraActive && inputTab === "scan") {
      setScannerError(null);
      const timer = setTimeout(() => {
        try {
          const scanner = new Html5Qrcode("unified-reader");
          scannerRef.current = scanner;
          scanner.start(
            { facingMode: "environment" },
            { fps: 10, qrbox: { width: 250, height: 250 } },
            onScanSuccess,
            onScanFailure
          ).catch((err) => {
            console.error("Camera start failed", err);
            setScannerError("Gagal membuka kamera. Pastikan akses diizinkan.");
            setCameraActive(false);
          });
        } catch (err) {
          console.error("Camera init failed", err);
          setScannerError("Gagal mengakses kamera.");
          setCameraActive(false);
        }
      }, 400);

      return () => {
        clearTimeout(timer);
        stopScanner();
      };
    }
  }, [cameraActive, inputTab]);

  const stopScanner = () => {
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
          scannerRef.current.stop()
            .then(() => { scannerRef.current = null; })
            .catch(() => { scannerRef.current = null; });
        } else {
          scannerRef.current = null;
        }
      } catch (e) {
        scannerRef.current = null;
      }
    }
  };

  const onScanSuccess = (decodedText: string) => {
    const trimmed = decodedText.trim();
    // 1. Check if matches student
    const student = siswaList.find(s => s.nis === trimmed || s.id === trimmed);
    if (student) {
      setActiveSiswa(student);
      setSiswaCategory("tepat_waktu");
      setSiswaStatus("tepat_waktu");
      setSiswaPoints(aturanMap["tepat_waktu"]?.nilai_poin ?? 15);
      setCameraActive(false);
      setSuccessMsg(null);
      return;
    }

    // 2. Check if matches teacher
    const teacher = teachersList.find(t => t.id === trimmed || t.email === trimmed);
    if (teacher) {
      setActiveGuru(teacher);
      setCameraActive(false);
      setSuccessMsg(null);
      return;
    }

    setScannerError(`Barcode/QR "${trimmed}" tidak dikenali sebagai guru maupun murid.`);
    setTimeout(() => setScannerError(null), 4000);
  };

  const onScanFailure = () => {
    // Silent fail scanning logs
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
      queryClient.invalidateQueries({ queryKey: ["siswa"] });
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (err: any) {
      setErrorMsg("Gagal menyimpan kehadiran: " + err.message);
      setTimeout(() => setErrorMsg(null), 5000);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Helper to merge consecutive teacher schedules
  const mergeSchedules = (list: any[]) => {
    if (list.length === 0) return [];
    const sorted = [...list].sort((a, b) => a.jam_mulai.localeCompare(b.jam_mulai));
    const merged: any[] = [];
    let current = { ...sorted[0], ids: [sorted[0].id] };

    for (let i = 1; i < sorted.length; i++) {
      const next = sorted[i];
      const [currH, currM] = current.jam_selesai.split(":").map(Number);
      const [nextH, nextM] = next.jam_mulai.split(":").map(Number);
      const gapMinutes = (nextH * 60 + nextM) - (currH * 60 + currM);

      const isSame = current.kelas === next.kelas && current.mata_pelajaran === next.mata_pelajaran;
      if (isSame && gapMinutes >= 0 && gapMinutes <= 35) {
        current = {
          ...current,
          jam_selesai: next.jam_selesai,
          ids: [...current.ids, next.id]
        };
      } else {
        merged.push(current);
        current = { ...next, ids: [next.id] };
      }
    }
    merged.push(current);
    return merged;
  };

  const processedGuruSchedules = useMemo(() => mergeSchedules(activeGuruSchedules), [activeGuruSchedules]);

  // Guru Attendance Submit
  const handleSaveGuruAttendance = async () => {
    if (!activeGuruJadwal || !activeGuru) return;
    setIsSubmitting(true);
    try {
      const now = new Date();
      const pad = (n: number) => n.toString().padStart(2, "0");
      const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
      
      const promises = activeGuruJadwal.ids.map((id: string) => 
        saveKehadiranGuruManual(activeGuru.id, todayStr, guruStatus, timeStr, guruKeterangan, id)
      );
      await Promise.all(promises);

      setSuccessMsg(`Absensi mengajar ${toSentenceCase(activeGuru.nama)} berhasil dicatat.`);
      setActiveGuruJadwal(null);
      refetchActiveGuruAttendance();
      queryClient.invalidateQueries({ queryKey: ["kehadiranGuruAll"] });
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (err: any) {
      setErrorMsg("Gagal menyimpan absensi guru: " + err.message);
      setTimeout(() => setErrorMsg(null), 5000);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Inactive vs Active slots styling helper
  const isScheduleActive = (jamMulai: string, jamSelesai: string) => {
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const [startH, startM] = jamMulai.split(":").map(Number);
    const [endH, endM] = jamSelesai.split(":").map(Number);
    return currentMinutes >= (startH * 60 + startM) && currentMinutes <= (endH * 60 + endM);
  };

  // Filters manual dropdown lookup
  const filteredSiswaLookup = useMemo(() => {
    if (!searchSiswaQuery) return [];
    return siswaList.filter(s => 
      s.nama.toLowerCase().includes(searchSiswaQuery.toLowerCase()) ||
      s.nis.includes(searchSiswaQuery)
    ).slice(0, 8);
  }, [siswaList, searchSiswaQuery]);

  const filteredGuruLookup = useMemo(() => {
    if (!searchGuruQuery) return [];
    return teachersList.filter(t => 
      t.nama.toLowerCase().includes(searchGuruQuery.toLowerCase()) ||
      t.email.toLowerCase().includes(searchGuruQuery.toLowerCase())
    ).slice(0, 8);
  }, [teachersList, searchGuruQuery]);

  return (
    <div className="space-y-6 pb-12 animate-fade-in font-sans">
      {/* Header */}
      <div>
        <h2 className="text-xl font-extrabold text-brand-950 tracking-tight">
          Pencatatan Kehadiran Harian (KBM)
        </h2>
        <p className="text-xs text-brand-500 font-semibold mt-1">
          Scan kartu pengenal atau cari nama guru/murid untuk melakukan input kehadiran manual.
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

      {/* Tabs */}
      <div className="flex border-b border-brand-100 pb-px gap-1 overflow-x-auto scrollbar-none">
        <button
          onClick={() => { setInputTab("scan"); setActiveSiswa(null); setActiveGuru(null); }}
          className={`px-5 py-3 text-xs font-black uppercase tracking-wider border-b-2 cursor-pointer transition-all ${
            inputTab === "scan"
              ? "border-brand-600 text-brand-800"
              : "border-transparent text-slate-400 hover:text-slate-600"
          }`}
        >
          Scan QR / Barcode
        </button>
        <button
          onClick={() => { setInputTab("siswa"); setActiveSiswa(null); setActiveGuru(null); }}
          className={`px-5 py-3 text-xs font-black uppercase tracking-wider border-b-2 cursor-pointer transition-all ${
            inputTab === "siswa"
              ? "border-brand-600 text-brand-800"
              : "border-transparent text-slate-400 hover:text-slate-600"
          }`}
        >
          Manual Murid
        </button>
        <button
          onClick={() => { setInputTab("guru"); setActiveSiswa(null); setActiveGuru(null); }}
          className={`px-5 py-3 text-xs font-black uppercase tracking-wider border-b-2 cursor-pointer transition-all ${
            inputTab === "guru"
              ? "border-brand-600 text-brand-800"
              : "border-transparent text-slate-400 hover:text-slate-600"
          }`}
        >
          Manual Guru
        </button>
      </div>

      {/* 1. TAB SCAN QR / BARCODE */}
      {inputTab === "scan" && (
        <div className="max-w-xl mx-auto bg-white p-6 rounded-3xl border border-brand-100 shadow-xl shadow-brand-900/5 space-y-6 text-center">
          <div className="space-y-1">
            <h4 className="font-extrabold text-sm text-brand-950">Scanner Cerdas Terpadu</h4>
            <p className="text-xs text-brand-500 font-semibold">Deteksi cerdas barcode langsung membaca kartu pengenal murid atau guru.</p>
          </div>

          <div className="relative aspect-square w-full max-w-xs mx-auto rounded-2xl overflow-hidden border border-brand-100 bg-[#faf9ff] flex items-center justify-center shadow-inner">
            {cameraActive ? (
              <div id="unified-reader" className="w-full h-full object-cover relative">
                {/* Visual scan line */}
                <div className="absolute left-0 right-0 h-0.5 bg-brand-500/80 animate-scan z-10 shadow-md shadow-brand-500/20" />
              </div>
            ) : (
              <div className="p-8 text-center space-y-4">
                <div className="w-14 h-14 bg-brand-50 text-brand-600 rounded-full flex items-center justify-center mx-auto border border-brand-100">
                  <Camera className="w-6 h-6 animate-pulse" />
                </div>
                <button
                  onClick={() => setCameraActive(true)}
                  className="px-6 py-2.5 bg-brand-600 hover:bg-brand-750 text-white font-extrabold text-xs rounded-xl shadow-md cursor-pointer border-0 transition-all"
                >
                  Aktifkan Kamera
                </button>
              </div>
            )}
          </div>

          {scannerError && (
            <p className="text-xs font-bold text-rose-600 bg-rose-50 border border-rose-100 p-3 rounded-xl max-w-xs mx-auto">
              {scannerError}
            </p>
          )}
        </div>
      )}

      {/* 2. TAB MANUAL MURID */}
      {inputTab === "siswa" && !activeSiswa && (
        <div className="max-w-xl mx-auto bg-white p-6 rounded-3xl border border-brand-100 shadow-xl shadow-brand-900/5 space-y-4">
          <div className="space-y-1">
            <h4 className="font-extrabold text-sm text-brand-950">Lookup Manual Murid</h4>
            <p className="text-xs text-brand-500 font-semibold">Cari nama atau nomor NIS siswa untuk input absensi manual.</p>
          </div>

          <div className="relative">
            <Search className="absolute left-3.5 top-3.5 text-brand-500/50 w-4.5 h-4.5" />
            <input
              type="text"
              placeholder="Masukkan nama atau NIS murid..."
              value={searchSiswaQuery}
              onChange={(e) => setSearchSiswaQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-[#faf9ff] rounded-2xl border border-brand-100 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-brand-500 text-brand-950 placeholder-brand-500/30"
            />
          </div>

          {filteredSiswaLookup.length > 0 && (
            <div className="divide-y border border-brand-100 rounded-2xl overflow-hidden bg-white max-h-60 overflow-y-auto">
              {filteredSiswaLookup.map(student => (
                <button
                  key={student.id}
                  onClick={() => {
                    setActiveSiswa(student);
                    setSiswaCategory("tepat_waktu");
                    setSiswaStatus("tepat_waktu");
                    setSiswaPoints(aturanMap["tepat_waktu"]?.nilai_poin ?? 15);
                  }}
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
            </div>
          )}
        </div>
      )}

      {/* 3. TAB MANUAL GURU */}
      {inputTab === "guru" && !activeGuru && (
        <div className="max-w-xl mx-auto bg-white p-6 rounded-3xl border border-brand-100 shadow-xl shadow-brand-900/5 space-y-4">
          <div className="space-y-1">
            <h4 className="font-extrabold text-sm text-brand-950">Lookup Manual Guru</h4>
            <p className="text-xs text-brand-500 font-semibold">Cari nama atau email guru untuk input absensi mengajar (KBM) hari ini.</p>
          </div>

          <div className="relative">
            <Search className="absolute left-3.5 top-3.5 text-brand-500/50 w-4.5 h-4.5" />
            <input
              type="text"
              placeholder="Masukkan nama atau email guru..."
              value={searchGuruQuery}
              onChange={(e) => setSearchGuruQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-[#faf9ff] rounded-2xl border border-brand-100 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-brand-500 text-brand-950 placeholder-brand-500/30"
            />
          </div>

          {filteredGuruLookup.length > 0 && (
            <div className="divide-y border border-brand-100 rounded-2xl overflow-hidden bg-white max-h-60 overflow-y-auto">
              {filteredGuruLookup.map(teacher => (
                <button
                  key={teacher.id}
                  onClick={() => setActiveGuru(teacher)}
                  className="w-full p-4 hover:bg-brand-50/40 transition-colors flex items-center justify-between text-left cursor-pointer border-0 bg-transparent"
                >
                  <div>
                    <span className="font-extrabold text-xs text-brand-950 block">{toSentenceCase(teacher.nama)}</span>
                    <span className="text-[10px] text-slate-400 font-bold">{teacher.email}</span>
                  </div>
                  <span className="text-[10px] font-black text-brand-600 bg-brand-50 border border-brand-100 px-2.5 py-1 rounded-lg uppercase">
                    GURU
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 4. ACTIVE FORM SISWA POPUP MODAL */}
      {activeSiswa && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-brand-950/60 backdrop-blur-xs">
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

      {/* 5. ACTIVE VIEW GURU DAILY SCHEDULES PANEL */}
      {activeGuru && (
        <div className="max-w-xl mx-auto space-y-6">
          <div className="bg-white p-6 rounded-3xl border border-brand-100 shadow-xl shadow-brand-900/5 space-y-5">
            <div className="flex justify-between items-start border-b pb-4 border-slate-50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-brand-100 rounded-xl flex items-center justify-center text-brand-600">
                  <UserCheck className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-extrabold text-sm text-brand-950">Jadwal Mengajar Guru</h4>
                  <p className="text-[10.5px] font-semibold text-brand-500 mt-0.5">{toSentenceCase(activeGuru.nama)}</p>
                </div>
              </div>
              <button
                onClick={() => setActiveGuru(null)}
                className="p-1.5 rounded-xl hover:bg-brand-100 text-slate-400 hover:text-slate-700 cursor-pointer border-0 bg-transparent"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {loadingGuruSchedules ? (
              <div className="py-12 text-center">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto text-brand-500" />
                <p className="text-[11px] font-bold text-brand-400 mt-2">Memuat jadwal guru...</p>
              </div>
            ) : processedGuruSchedules.length === 0 ? (
              <div className="py-12 text-center text-brand-400 font-bold text-xs space-y-2">
                <BookOpen className="w-10 h-10 text-brand-300 mx-auto" />
                <p>Tidak ada jadwal mengajar KBM untuk guru ini pada hari {todayDayName}.</p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-[10.5px] font-black text-brand-500 uppercase tracking-widest">Daftar Slot KBM Hari Ini ({todayDayName}):</p>
                
                {processedGuruSchedules.map((sched) => {
                  const att = activeGuruTodayAttendance.find((a: any) => sched.ids.includes(a.jadwal_id));
                  const isCheckedIn = !!att;
                  const active = isScheduleActive(sched.jam_mulai, sched.jam_selesai);

                  return (
                    <div
                      key={sched.id}
                      className={`p-5 rounded-2xl border transition-all flex items-center justify-between gap-4 relative overflow-hidden ${
                        isCheckedIn 
                          ? "bg-emerald-50/15 border-emerald-100/60 text-brand-900" 
                          : active
                          ? "bg-brand-800 text-white border-transparent shadow-xl shadow-brand-700/20 scale-[1.01]"
                          : "bg-[#f0edfc] border-[#e4dffd] text-brand-900 shadow-md shadow-brand-900/3"
                      }`}
                    >
                      {/* Left color bar */}
                      <div className={`absolute left-0 top-0 bottom-0 w-1 ${
                        isCheckedIn ? "bg-emerald-400" : active ? "bg-amber-400" : "bg-brand-400"
                      }`} />

                      <div className="space-y-1.5 pl-2">
                        <span className={`px-2 py-0.5 text-[10px] font-black rounded-lg uppercase tracking-wide inline-block ${
                          isCheckedIn
                            ? "bg-emerald-100 text-emerald-800"
                            : active
                            ? "bg-brand-700 text-white border border-brand-600"
                            : "bg-brand-100 text-brand-700"
                        }`}>
                          {sched.jam_mulai.slice(0, 5)} - {sched.jam_selesai.slice(0, 5)} {active && !isCheckedIn ? "• AKTIF KBM" : ""}
                        </span>
                        <h4 className={`font-extrabold text-sm ${active && !isCheckedIn ? "text-white" : "text-brand-950"}`}>
                          {formatSubjectName(sched.mata_pelajaran)}
                        </h4>
                        <div className={`flex items-center gap-1.5 text-xs font-bold ${
                          active && !isCheckedIn ? "text-brand-200" : "text-brand-500"
                        }`}>
                          <Users className="w-3.5 h-3.5" />
                          <span>Kelas {sched.kelas}</span>
                        </div>
                      </div>

                      {isCheckedIn ? (
                        <div className="text-right space-y-1 z-10">
                          <span className={`px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-wide inline-block ${
                            att.status === "hadir" 
                              ? "bg-emerald-150 text-emerald-800 border border-emerald-200" 
                              : att.status === "sakit" 
                              ? "bg-amber-100 text-amber-800" 
                              : "bg-purple-100 text-purple-800"
                          }`}>
                            {att.status === "hadir" ? "Hadir" : att.status === "sakit" ? "Sakit" : "Izin"}
                          </span>
                          <p className="text-[10px] text-brand-450 font-bold">{att.jam_masuk ? `${att.jam_masuk.slice(0, 5)} WIB` : "-"}</p>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            setActiveGuruJadwal(sched);
                            setGuruStatus("hadir");
                            setGuruKeterangan("");
                          }}
                          className={`py-2 px-4 font-extrabold text-xs rounded-xl shadow-md cursor-pointer border-0 transition-all flex items-center gap-1.5 z-10 ${
                            active
                              ? "bg-amber-400 hover:bg-amber-500 text-brand-950"
                              : "bg-brand-600 hover:bg-brand-750 text-white"
                          }`}
                        >
                          <LogIn className="w-3.5 h-3.5" />
                          Absen
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 6. GURU CHECK-IN ACTIVE DIALOG MODAL */}
      <AnimatePresence>
        {activeGuruJadwal && activeGuru && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-brand-950/60 backdrop-blur-xs">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden border border-brand-150"
            >
              <div className="px-6 py-5 bg-brand-50 border-b border-brand-100 flex items-center justify-between">
                <div>
                  <h3 className="font-black text-brand-950 text-sm">Absen Mengajar Guru</h3>
                  <p className="text-[10.5px] font-bold text-brand-500 mt-0.5">
                    {toSentenceCase(activeGuru.nama)} | Kelas {activeGuruJadwal.kelas}
                  </p>
                </div>
                <button
                  onClick={() => setActiveGuruJadwal(null)}
                  className="p-1.5 rounded-xl hover:bg-brand-200/50 text-brand-400 hover:text-brand-800 transition-all cursor-pointer bg-transparent border-0"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-5">
                {/* Select Status */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-brand-700 uppercase tracking-widest block">Status Kehadiran</label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {(['hadir', 'sakit', 'izin', 'alfa'] as const).map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setGuruStatus(s)}
                        className={`py-3 rounded-2xl border text-[10px] font-black text-center cursor-pointer transition-all uppercase tracking-wider ${
                          guruStatus === s
                            ? "bg-brand-600 text-white border-transparent"
                            : "bg-[#faf9ff] border-brand-100 text-brand-700 hover:bg-slate-50"
                        }`}
                      >
                        {s === "hadir" ? "Hadir" : s === "sakit" ? "Sakit" : s === "izin" ? "Izin" : "Alfa"}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Description Textarea */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-brand-700 uppercase tracking-widest block">
                    Keterangan {guruStatus === "hadir" ? "(Opsional)" : ""}
                  </label>
                  <textarea
                    rows={3}
                    placeholder={guruStatus === "hadir" ? "Catatan materi/lainnya (opsional)..." : "Tulis alasan sakit/izin/alfa..."}
                    value={guruKeterangan}
                    onChange={(e) => setGuruKeterangan(e.target.value)}
                    required={guruStatus !== "hadir"}
                    className="w-full border border-brand-100 rounded-2xl p-3 text-xs font-semibold text-brand-900 focus:ring-2 focus:ring-brand-500 outline-none bg-[#faf9ff]"
                  />
                </div>
              </div>

              <div className="px-6 py-4 bg-brand-50/50 border-t border-brand-100 flex items-center justify-end gap-3">
                <button
                  onClick={() => setActiveGuruJadwal(null)}
                  className="px-4 py-2.5 rounded-2xl hover:bg-brand-200/40 text-brand-600 hover:text-brand-900 font-bold text-sm transition-all cursor-pointer bg-transparent border-0"
                >
                  Batal
                </button>
                <button
                  onClick={handleSaveGuruAttendance}
                  disabled={isSubmitting}
                  className="px-5 py-2.5 rounded-2xl bg-gradient-to-r from-brand-600 to-brand-700 hover:from-brand-700 hover:to-brand-800 text-white font-bold text-sm shadow-md transition-all cursor-pointer border-0"
                >
                  {isSubmitting ? "Menyimpan..." : "Simpan Absen"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
