import React, { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Html5Qrcode } from "html5-qrcode";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "../queryClient";
import {
  Camera,
  Search,
  AlertCircle,
  Check,
  Calendar,
  Clock,
  Settings,
  Trash2,
  Edit3,
  UserCheck,
  Users,
  Zap,
  Download,
  AlertTriangle,
  RefreshCw,
  Sliders,
  ChevronDown,
  X
} from "lucide-react";
import { Siswa, UserSession } from "../types";
import {
  getSiswaList,
  getAturanKehadiranList,
  updateAturanKehadiranList,
  getKehadiranListByDate,
  saveKehadiran,
  deleteKehadiran,
  setSisaSiswaSebagaiAlfa,
  AturanKehadiran,
  KehadiranRow
} from "../dbStore";
import { toSentenceCase } from "../formatName";
import * as XLSX from "xlsx";

interface KehadiranViewProps {
  userSession: UserSession;
  onRefreshHistory?: () => void;
}

export default function KehadiranView({ userSession, onRefreshHistory }: KehadiranViewProps) {
  const isPiket = userSession.role === "piket";
  const isAdmin = userSession.role === "super_admin" || userSession.role === "kepala_sekolah";

  // Tab states
  // Piket: "scan" (QR code scanner & simulator), "rekap_hari_ini"
  // Admin: "rekap_semua", "aturan"
  const [activeTab, setActiveTab] = useState<string>(isPiket ? "scan" : "rekap_semua");

  // Core Data Queries
  const { data: siswaList = [] } = useQuery({
    queryKey: ["siswa"],
    queryFn: getSiswaList,
  });

  const { data: aturanList = [], refetch: refetchAturan } = useQuery({
    queryKey: ["aturanKehadiran"],
    queryFn: getAturanKehadiranList,
  });

  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10));

  const { data: kehadiranList = [], isLoading: loadingKehadiran, refetch: refetchKehadiran } = useQuery({
    queryKey: ["kehadiran", selectedDate],
    queryFn: () => getKehadiranListByDate(selectedDate),
  });

  // Time-based config (defaults to 07:00 WIB)
  const [schoolEntryTime, setSchoolEntryTime] = useState(() => {
    const saved = localStorage.getItem("19points_jam_masuk");
    return saved || "07:00";
  });

  useEffect(() => {
    localStorage.setItem("19points_jam_masuk", schoolEntryTime);
  }, [schoolEntryTime]);

  // Scanner States
  const [cameraActive, setCameraActive] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);

  // Manual search fallback
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedClass, setSelectedClass] = useState("Semua");
  const [manualSelectOpen, setManualSelectOpen] = useState(false);

  // Form recording states
  const [targetSiswa, setTargetSiswa] = useState<Siswa | null>(null);
  const [attendanceStatus, setAttendanceStatus] = useState<AturanKehadiran["status"]>("tepat_waktu");
  const [givenPoints, setGivenPoints] = useState(15);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Admin Config points state
  const [tempPoints, setTempPoints] = useState<Record<string, number>>({});
  const [isSavingConfig, setIsSavingConfig] = useState(false);

  // Editing existing attendance records (Admin / Piket)
  const [editingRecord, setEditingRecord] = useState<KehadiranRow | null>(null);
  const [editStatus, setEditStatus] = useState<AturanKehadiran["status"]>("tepat_waktu");
  const [editPoints, setEditPoints] = useState(15);

  // Initialize Admin Point Config Form
  useEffect(() => {
    if (aturanList.length > 0) {
      const pts: Record<string, number> = {};
      aturanList.forEach(rule => {
        pts[rule.status] = rule.nilai_poin;
      });
      setTempPoints(pts);
    }
  }, [aturanList]);

  // QR Scanner hook
  useEffect(() => {
    if (cameraActive && activeTab === "scan") {
      setScannerError(null);
      const timer = setTimeout(() => {
        try {
          const scanner = new Html5Qrcode("reader-kehadiran");
          scannerRef.current = scanner;

          scanner.start(
            { facingMode: "environment" },
            {
              fps: 10,
              qrbox: { width: 250, height: 250 }
            },
            onScanSuccess,
            onScanFailure
          ).catch((err) => {
            console.error("Camera start failed", err);
            setScannerError("Gagal membuka kamera. Harap izinkan akses kamera.");
            setCameraActive(false);
          });
        } catch (err: any) {
          console.error("Camera init failed", err);
          setScannerError("Gagal mengakses kamera.");
          setCameraActive(false);
        }
      }, 400);

      return () => {
        clearTimeout(timer);
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
    }
  }, [cameraActive, activeTab]);

  const onScanSuccess = (decodedText: string) => {
    const trimmed = decodedText.trim();
    const student = siswaList.find(s => s.nis === trimmed || s.id === trimmed);
    if (student) {
      handleSelectStudent(student);
      setSuccessMsg(null);
      stopScanner();
    } else {
      setScannerError(`QR terbaca "${trimmed}", namun siswa tidak terdaftar.`);
      setTimeout(() => setScannerError(null), 4000);
    }
  };

  const onScanFailure = () => {
    // Silent fail logs
  };

  const stopScanner = () => {
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
          scannerRef.current.stop()
            .then(() => {
              scannerRef.current = null;
              setCameraActive(false);
            })
            .catch(() => {
              scannerRef.current = null;
              setCameraActive(false);
            });
        } else {
          scannerRef.current = null;
          setCameraActive(false);
        }
      } catch (e) {
        scannerRef.current = null;
        setCameraActive(false);
      }
    } else {
      setCameraActive(false);
    }
  };

  // Auto-status time calculator
  const calculateAutoStatus = (siswa: Siswa) => {
    const now = new Date();
    const [entryHour, entryMin] = schoolEntryTime.split(":").map(Number);
    const currHour = now.getHours();
    const currMin = now.getMinutes();

    const diffMinutes = (currHour * 60 + currMin) - (entryHour * 60 + entryMin);

    let status: AturanKehadiran["status"] = "tepat_waktu";
    if (diffMinutes > 0 && diffMinutes <= 5) {
      status = "telat_5";
    } else if (diffMinutes > 5 && diffMinutes <= 10) {
      status = "telat_10";
    } else if (diffMinutes > 10 && diffMinutes <= 15) {
      status = "telat_15";
    } else if (diffMinutes > 15) {
      status = "alfa";
    }

    setAttendanceStatus(status);

    // Set points accordingly
    const matchingRule = aturanList.find(r => r.status === status);
    if (matchingRule) {
      setGivenPoints(matchingRule.nilai_poin);
    }
  };

  const handleSelectStudent = (student: Siswa) => {
    setTargetSiswa(student);
    calculateAutoStatus(student);
  };

  const handleStatusChange = (status: AturanKehadiran["status"]) => {
    setAttendanceStatus(status);
    const matchingRule = aturanList.find(r => r.status === status);
    if (matchingRule) {
      setGivenPoints(matchingRule.nilai_poin);
    }
  };

  const handleSubmitAttendance = async () => {
    if (!targetSiswa) return;
    setIsSubmitting(true);
    try {
      await saveKehadiran(
        targetSiswa.id,
        attendanceStatus,
        givenPoints,
        userSession.email,
        selectedDate
      );
      setSuccessMsg(`Berhasil mencatat kehadiran ${toSentenceCase(targetSiswa.nama)}: ${
        aturanList.find(r => r.status === attendanceStatus)?.label || attendanceStatus
      } (${givenPoints > 0 ? "+" : ""}${givenPoints} Poin).`);
      
      // Reset form
      setTargetSiswa(null);
      
      // Reload queries
      queryClient.invalidateQueries({ queryKey: ["kehadiran"] });
      queryClient.invalidateQueries({ queryKey: ["siswa"] });
      queryClient.invalidateQueries({ queryKey: ["riwayat"] });
      if (onRefreshHistory) onRefreshHistory();

      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (err: any) {
      alert("Gagal menyimpan kehadiran: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSetAllRemainingAlfa = async () => {
    const confirm = window.confirm(
      `Apakah Anda yakin ingin memberi status Alfa (${
        aturanList.find(r => r.status === "alfa")?.nilai_poin || -25
      } Poin) kepada seluruh siswa yang belum melakukan absensi hari ini (${selectedDate})?`
    );
    if (!confirm) return;

    setIsSubmitting(true);
    try {
      const result = await setSisaSiswaSebagaiAlfa(userSession.email, selectedDate);
      alert(`Berhasil! ${result.updated} siswa telah dicatat sebagai Alfa.`);
      
      queryClient.invalidateQueries({ queryKey: ["kehadiran"] });
      queryClient.invalidateQueries({ queryKey: ["siswa"] });
      queryClient.invalidateQueries({ queryKey: ["riwayat"] });
      if (onRefreshHistory) onRefreshHistory();
    } catch (err: any) {
      alert("Gagal memproses Auto-Alfa: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteRecord = async (recordId: string) => {
    const confirm = window.confirm("Apakah Anda yakin ingin menghapus data absensi ini? Poin siswa akan dikembalikan ke posisi semula.");
    if (!confirm) return;

    try {
      await deleteKehadiran(recordId);
      queryClient.invalidateQueries({ queryKey: ["kehadiran"] });
      queryClient.invalidateQueries({ queryKey: ["siswa"] });
      queryClient.invalidateQueries({ queryKey: ["riwayat"] });
      if (onRefreshHistory) onRefreshHistory();
    } catch (err: any) {
      alert("Gagal menghapus absensi: " + err.message);
    }
  };

  const handleEditRecord = (record: KehadiranRow) => {
    setEditingRecord(record);
    setEditStatus(record.status as any);
    setEditPoints(record.nilai_poin_diberikan);
  };

  const handleSaveEdit = async () => {
    if (!editingRecord) return;
    setIsSubmitting(true);
    try {
      await saveKehadiran(
        editingRecord.siswa_id,
        editStatus,
        editPoints,
        userSession.email,
        editingRecord.tanggal
      );
      setEditingRecord(null);
      queryClient.invalidateQueries({ queryKey: ["kehadiran"] });
      queryClient.invalidateQueries({ queryKey: ["siswa"] });
      queryClient.invalidateQueries({ queryKey: ["riwayat"] });
      if (onRefreshHistory) onRefreshHistory();
    } catch (err: any) {
      alert("Gagal mengubah absensi: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveConfig = async () => {
    setIsSavingConfig(true);
    try {
      const updatedRules = aturanList.map(rule => ({
        ...rule,
        nilai_poin: Number(tempPoints[rule.status]) ?? rule.nilai_poin
      }));
      await updateAturanKehadiranList(updatedRules);
      alert("Aturan konfigurasi poin kehadiran berhasil disimpan!");
      refetchAturan();
    } catch (err: any) {
      alert("Gagal menyimpan konfigurasi: " + err.message);
    } finally {
      setIsSavingConfig(false);
    }
  };

  const handleExportExcel = () => {
    if (kehadiranList.length === 0) {
      alert("Tidak ada data kehadiran untuk tanggal ini.");
      return;
    }

    const rows = kehadiranList.map((row) => ({
      Tanggal: row.tanggal,
      NIS: row.siswa_nis,
      Nama: row.siswa_nama,
      Kelas: row.siswa_kelas,
      Status: aturanList.find(r => r.status === row.status)?.label || row.status,
      Poin: row.nilai_poin_diberikan,
      Pencatat: row.pencatat_email,
      "Waktu Pencatatan": new Date(row.created_at).toLocaleTimeString("id-ID")
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    worksheet["!cols"] = [
      { wch: 12 },
      { wch: 12 },
      { wch: 25 },
      { wch: 15 },
      { wch: 25 },
      { wch: 10 },
      { wch: 25 },
      { wch: 15 }
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Rekap Absensi");
    XLSX.writeFile(workbook, `REKAP_KEHADIRAN_${selectedDate}.xlsx`);
  };

  // Filter students by query
  const filteredStudents = useMemo(() => {
    if (!searchQuery) return [];
    return siswaList.filter(s => {
      const matchQuery = s.nama.toLowerCase().includes(searchQuery.toLowerCase()) || s.nis.includes(searchQuery);
      const matchClass = selectedClass === "Semua" || s.kelas === selectedClass;
      return matchQuery && matchClass;
    }).slice(0, 5);
  }, [siswaList, searchQuery, selectedClass]);

  // Distinct classes list
  const classesList = useMemo(() => {
    const classes = new Set<string>();
    siswaList.forEach(s => {
      if (s.kelas) classes.add(s.kelas);
    });
    return ["Semua", ...Array.from(classes).sort()];
  }, [siswaList]);

  return (
    <div className="space-y-6 pb-12 animate-fade-in font-sans">
      
      {/* Header View */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-brand-950 tracking-tight flex items-center gap-2">
            <Calendar className="w-6 h-6 text-brand-600" />
            Rekap Kehadiran Siswa
          </h2>
          <p className="text-xs text-brand-500 font-semibold mt-1">
            {isPiket ? "Pencatatan & pengawasan kehadiran gerbang sekolah harian" : "Manajemen poin & log kehadiran siswa"}
          </p>
        </div>

        {/* Global Date & Time Picker */}
        <div className="flex items-center gap-2.5 bg-white border border-brand-100 p-2 rounded-2xl shadow-xs">
          <Clock className="w-4 h-4 text-brand-500" />
          <span className="text-xs font-black text-brand-950 uppercase tracking-wider">Tgl Rekap:</span>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="text-xs font-bold text-brand-800 focus:outline-none border-none bg-transparent cursor-pointer"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-brand-100 pb-px gap-1 overflow-x-auto scrollbar-none">
        {isPiket && (
          <>
            <button
              onClick={() => setActiveTab("scan")}
              className={`px-5 py-3 text-xs font-black uppercase tracking-wider border-b-2 cursor-pointer transition-all ${
                activeTab === "scan"
                  ? "border-brand-600 text-brand-800"
                  : "border-transparent text-slate-400 hover:text-slate-600"
              }`}
            >
              Scan & Input Hadir
            </button>
            <button
              onClick={() => { setActiveTab("rekap_hari_ini"); refetchKehadiran(); }}
              className={`px-5 py-3 text-xs font-black uppercase tracking-wider border-b-2 cursor-pointer transition-all ${
                activeTab === "rekap_hari_ini"
                  ? "border-brand-600 text-brand-800"
                  : "border-transparent text-slate-400 hover:text-slate-600"
              }`}
            >
              Rekap Absen Hari Ini
            </button>
          </>
        )}
        {isAdmin && (
          <>
            <button
              onClick={() => { setActiveTab("rekap_semua"); refetchKehadiran(); }}
              className={`px-5 py-3 text-xs font-black uppercase tracking-wider border-b-2 cursor-pointer transition-all ${
                activeTab === "rekap_semua"
                  ? "border-brand-600 text-brand-800"
                  : "border-transparent text-slate-400 hover:text-slate-600"
              }`}
            >
              Monitoring Absensi
            </button>
            {userSession.role === "super_admin" && (
              <button
                onClick={() => setActiveTab("aturan")}
                className={`px-5 py-3 text-xs font-black uppercase tracking-wider border-b-2 cursor-pointer transition-all ${
                  activeTab === "aturan"
                    ? "border-brand-600 text-brand-800"
                    : "border-transparent text-slate-400 hover:text-slate-600"
                }`}
              >
                Aturan & Poin Absen
              </button>
            )}
          </>
        )}
      </div>

      {/* SUCCESS MESSAGE */}
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
      </AnimatePresence>

      {/* TAB CONTENT: SCAN & INPUT (PIKET ONLY) */}
      {isPiket && activeTab === "scan" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Left Column: QR Scanner or Manual Lookup */}
          <div className="lg:col-span-7 space-y-6">
            
            {/* Input Config Card */}
            <div className="bg-white p-5 rounded-3xl border border-brand-100/60 shadow-md shadow-brand-900/5 space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-black text-brand-400 uppercase tracking-widest block">Metode Absensi</span>
                
                {/* Time setup */}
                <div className="flex items-center gap-1 bg-brand-50 px-3 py-1.5 rounded-xl border border-brand-100">
                  <Clock className="w-3.5 h-3.5 text-brand-600" />
                  <span className="text-[10px] font-bold text-brand-700">Batas Masuk:</span>
                  <input
                    type="text"
                    value={schoolEntryTime}
                    onChange={(e) => setSchoolEntryTime(e.target.value)}
                    placeholder="07:00"
                    className="w-10 text-[10px] font-black text-brand-950 focus:outline-none border-none bg-transparent"
                  />
                </div>
              </div>

              {/* Camera Activation */}
              <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-brand-100 rounded-2xl bg-brand-50/20 relative overflow-hidden min-h-[300px]">
                {cameraActive ? (
                  <div className="w-full flex flex-col items-center space-y-4">
                    <div id="reader-kehadiran" className="w-full max-w-[280px] overflow-hidden rounded-2xl border border-brand-200 bg-black shadow-lg" />
                    <button
                      onClick={stopScanner}
                      className="px-5 py-2 bg-rose-50 border border-rose-100 hover:bg-rose-100 rounded-xl text-xs font-bold text-rose-700 cursor-pointer"
                    >
                      Matikan Kamera
                    </button>
                  </div>
                ) : (
                  <div className="text-center space-y-4">
                    <div className="w-14 h-14 bg-brand-50 border border-brand-100 rounded-2xl flex items-center justify-center mx-auto text-brand-600 shadow-sm">
                      <Camera className="w-7 h-7" />
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-brand-950">Arahkan Kamera ke QR Code</h4>
                      <p className="text-[11px] text-brand-400 font-semibold max-w-xs mx-auto mt-1 leading-relaxed">
                        Pindai kartu pelajar digital siswa untuk mencatat kehadiran secara instan.
                      </p>
                    </div>
                    <button
                      onClick={() => setCameraActive(true)}
                      className="px-6 py-3 brand-gradient text-white text-xs font-black rounded-xl shadow-lg shadow-brand-500/20 cursor-pointer"
                    >
                      Aktifkan Kamera Scan
                    </button>
                  </div>
                )}

                {scannerError && (
                  <div className="absolute bottom-4 inset-x-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-[10.5px] font-medium leading-relaxed rounded-xl flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-500 flex-shrink-0" />
                    <span>{scannerError}</span>
                  </div>
                )}
              </div>

              {/* Manual search toggle */}
              <div className="border-t border-brand-50 pt-4">
                <button
                  onClick={() => setManualSelectOpen(!manualSelectOpen)}
                  className="w-full flex justify-between items-center text-xs font-black text-brand-700 hover:text-brand-900 focus:outline-none cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <Search className="w-4 h-4" />
                    Cari Siswa Manual (Jika QR rusak/hilang)
                  </span>
                  <ChevronDown className={`w-4 h-4 transition-transform ${manualSelectOpen ? "rotate-180" : ""}`} />
                </button>

                <AnimatePresence>
                  {manualSelectOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden mt-4 space-y-3"
                    >
                      <div className="flex gap-2">
                        <div className="flex-1 relative">
                          <Search className="absolute left-3.5 top-3.5 h-4.5 w-4.5 text-brand-400" />
                          <input
                            type="text"
                            placeholder="Cari NIS atau Nama..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full border border-brand-100 rounded-xl py-3 pl-10 pr-4 text-xs font-bold text-brand-900 bg-brand-50/10 focus:ring-1 focus:ring-brand-500 outline-none"
                          />
                        </div>

                        <select
                          value={selectedClass}
                          onChange={(e) => setSelectedClass(e.target.value)}
                          className="border border-brand-100 rounded-xl px-3 py-2 text-xs font-bold text-brand-800 bg-white cursor-pointer focus:outline-none"
                        >
                          {classesList.map(cls => (
                            <option key={cls} value={cls}>{cls}</option>
                          ))}
                        </select>
                      </div>

                      {/* Filter result */}
                      {searchQuery && (
                        <div className="bg-brand-50/50 border border-brand-100 rounded-2xl p-2 divide-y divide-brand-100">
                          {filteredStudents.length > 0 ? (
                            filteredStudents.map(student => (
                              <button
                                key={student.id}
                                onClick={() => {
                                  handleSelectStudent(student);
                                  setSearchQuery("");
                                }}
                                className="w-full flex items-center justify-between p-3.5 hover:bg-brand-50 text-left rounded-xl transition-all cursor-pointer group"
                              >
                                <div>
                                  <h5 className="text-xs font-extrabold text-brand-950 group-hover:text-brand-700 transition-colors">{toSentenceCase(student.nama)}</h5>
                                  <p className="text-[10px] text-brand-400 font-semibold mt-1">{student.kelas} • NIS: {student.nis}</p>
                                </div>
                                <UserCheck className="w-4 h-4 text-brand-400 group-hover:text-brand-600" />
                              </button>
                            ))
                          ) : (
                            <p className="p-3 text-[10px] text-brand-400 font-bold text-center">Siswa tidak ditemukan.</p>
                          )}
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

            </div>

            {/* Bulk actions */}
            <div className="bg-amber-50/60 p-5 rounded-3xl border border-amber-200/50 shadow-md shadow-brand-900/5 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <h4 className="text-xs font-black text-amber-900 uppercase tracking-wider flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  Mencatat Ketidakhadiran (Alfa)
                </h4>
                <p className="text-[10.5px] text-amber-800 font-medium leading-relaxed max-w-lg">
                  Setelah jam masuk selesai, tandai semua siswa yang tidak absen hari ini sebagai Alfa untuk memotong poin pelanggaran kehadiran harian secara massal.
                </p>
              </div>
              <button
                onClick={handleSetAllRemainingAlfa}
                disabled={isSubmitting}
                className="px-5 py-3 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs font-black rounded-xl cursor-pointer shadow-md tracking-wider flex-shrink-0"
              >
                Set Sisa Sebagai Alfa
              </button>
            </div>

          </div>

          {/* Right Column: Attendance Form Input */}
          <div className="lg:col-span-5">
            <AnimatePresence mode="wait">
              {targetSiswa ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  className="bg-white p-6 rounded-3xl border border-brand-100 shadow-lg shadow-brand-900/5 space-y-6"
                >
                  <div className="flex justify-between items-start">
                    <h3 className="text-sm font-black text-brand-950 uppercase tracking-widest">
                      Konfirmasi Absensi
                    </h3>
                    <button
                      onClick={() => setTargetSiswa(null)}
                      className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-xl cursor-pointer"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Student profile info */}
                  <div className="flex items-center gap-4 bg-brand-50/70 p-4 border border-brand-100 rounded-2xl">
                    {targetSiswa.foto_url ? (
                      <img src={targetSiswa.foto_url} className="w-12 h-16 rounded-xl object-cover shadow-sm border border-brand-200" alt="Avatar" />
                    ) : (
                      <div className="w-12 h-16 rounded-xl bg-gradient-to-tr from-accent-500 to-amber-400 flex items-center justify-center font-bold text-white shadow-sm border border-brand-200">
                        {targetSiswa.nama.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <h4 className="text-sm font-extrabold text-brand-950 leading-tight">{toSentenceCase(targetSiswa.nama)}</h4>
                      <p className="text-[10px] text-brand-400 font-bold mt-1.5 uppercase tracking-wider">{targetSiswa.kelas} • NIS {targetSiswa.nis}</p>
                      <span className="inline-block mt-2 text-[9px] font-black uppercase bg-brand-100 text-brand-800 px-2 py-0.5 rounded-md border border-brand-200">
                        Poin Total: {targetSiswa.total_poin} pts
                      </span>
                    </div>
                  </div>

                  {/* Status Picker Buttons */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-brand-400 uppercase tracking-widest block">
                      Status Kehadiran
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {aturanList.map(rule => {
                        const isSelected = attendanceStatus === rule.status;
                        return (
                          <button
                            key={rule.status}
                            type="button"
                            onClick={() => handleStatusChange(rule.status)}
                            className={`p-3.5 rounded-2xl border text-left flex flex-col justify-between transition-all cursor-pointer min-h-[75px] ${
                              isSelected
                                ? rule.nilai_poin >= 0
                                  ? "bg-emerald-50 border-emerald-200 text-emerald-800 shadow-xs"
                                  : "bg-rose-50 border-rose-200 text-rose-800 shadow-xs"
                                : "bg-white border-brand-100 text-brand-800 hover:bg-slate-50"
                            }`}
                          >
                            <span className="text-[11px] font-black tracking-wide leading-none">{rule.label}</span>
                            <span className={`text-[10px] font-black mt-2 font-mono ${rule.nilai_poin >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                              {rule.nilai_poin >= 0 ? `+${rule.nilai_poin}` : rule.nilai_poin} pts
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Submit Button */}
                  <div className="flex gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setTargetSiswa(null)}
                      className="flex-1 py-3.5 border border-brand-100 hover:bg-brand-50 text-slate-700 text-xs font-black uppercase tracking-wider rounded-2xl cursor-pointer"
                    >
                      Batal
                    </button>
                    <button
                      type="button"
                      onClick={handleSubmitAttendance}
                      disabled={isSubmitting}
                      className="flex-1 py-3.5 brand-gradient disabled:opacity-50 text-white text-xs font-black uppercase tracking-wider rounded-2xl cursor-pointer shadow-lg shadow-brand-500/25 flex items-center justify-center gap-2"
                    >
                      {isSubmitting ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        "Simpan Absensi"
                      )}
                    </button>
                  </div>
                </motion.div>
              ) : (
                <div className="h-full min-h-[300px] flex items-center justify-center border-2 border-dashed border-brand-100 bg-brand-50/10 rounded-3xl p-6 text-center">
                  <div className="space-y-2">
                    <Zap className="w-8 h-8 text-brand-400 mx-auto animate-pulse" />
                    <h4 className="text-xs font-black text-brand-500 uppercase tracking-widest">
                      Konfirmasi Absensi Siswa
                    </h4>
                    <p className="text-[10.5px] text-brand-400 font-semibold max-w-xs">
                      Silakan scan kartu pelajar digital siswa atau cari namanya lewat menu manual.
                    </p>
                  </div>
                </div>
              )}
            </AnimatePresence>
          </div>

        </div>
      )}

      {/* TAB CONTENT: DAILY REKAP TABLE (PIKET & ADMIN MONITORING) */}
      {(activeTab === "rekap_hari_ini" || activeTab === "rekap_semua") && (
        <div className="bg-white rounded-3xl border border-brand-100 shadow-md shadow-brand-900/5 overflow-hidden">
          
          {/* Table Toolbar */}
          <div className="p-5 border-b border-brand-50 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-50/50">
            <div>
              <h3 className="text-sm font-black text-brand-950 uppercase tracking-widest flex items-center gap-2">
                <Users className="w-4.5 h-4.5 text-brand-600" />
                Data Absensi Tanggal: {selectedDate}
              </h3>
              <p className="text-[10.5px] text-brand-400 font-semibold mt-1">
                Ditemukan {kehadiranList.length} log absensi
              </p>
            </div>

            <div className="flex gap-2.5 w-full md:w-auto">
              <button
                onClick={handleExportExcel}
                className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 px-4 py-2.5 text-xs font-black text-emerald-700 rounded-xl cursor-pointer hover:bg-emerald-100 hover:shadow-xs transition-all"
              >
                <Download className="w-4 h-4" />
                Export XLS
              </button>
              <button
                onClick={() => refetchKehadiran()}
                className="flex items-center justify-center p-2.5 border border-brand-100 rounded-xl hover:bg-brand-50 text-brand-600 cursor-pointer"
                title="Refresh Data"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Table Container */}
          <div className="overflow-x-auto">
            {loadingKehadiran ? (
              <div className="py-20 text-center">
                <RefreshCw className="w-8 h-8 animate-spin mx-auto text-brand-500" />
                <p className="text-xs font-bold text-brand-400 mt-2">Memuat data absensi...</p>
              </div>
            ) : kehadiranList.length > 0 ? (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-brand-100 bg-brand-50/20 text-[10px] font-black text-brand-400 uppercase tracking-widest">
                    <th className="py-4 px-5">Siswa</th>
                    <th className="py-4 px-4">Kelas</th>
                    <th className="py-4 px-4">Waktu Scan</th>
                    <th className="py-4 px-4">Status</th>
                    <th className="py-4 px-4">Poin</th>
                    <th className="py-4 px-4">Pencatat</th>
                    <th className="py-4 px-5 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-50 text-xs font-semibold text-brand-900">
                  {kehadiranList.map((row) => {
                    const rule = aturanList.find(r => r.status === row.status);
                    return (
                      <tr key={row.id} className="hover:bg-slate-50/30 transition-colors">
                        <td className="py-3.5 px-5 flex items-center gap-3">
                          {row.siswa_foto_url ? (
                            <img src={row.siswa_foto_url} className="w-8 h-10 rounded-lg object-cover border border-brand-100 shadow-xs" alt="Avatar" />
                          ) : (
                            <div className="w-8 h-10 rounded-lg bg-gradient-to-tr from-brand-500 to-accent-500 text-white flex items-center justify-center font-bold text-[10px] shadow-xs">
                              {row.siswa_nama.slice(0, 2).toUpperCase()}
                            </div>
                          )}
                          <div>
                            <span className="font-extrabold text-brand-950 block">{toSentenceCase(row.siswa_nama)}</span>
                            <span className="text-[10px] text-slate-400 font-bold block mt-1">NIS {row.siswa_nis}</span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4">{row.siswa_kelas}</td>
                        <td className="py-3.5 px-4 font-mono font-medium">
                          {new Date(row.created_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                        </td>
                        <td className="py-3.5 px-4">
                          <span className={`inline-flex px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wide border ${
                            row.status === "tepat_waktu"
                              ? "bg-emerald-50 border-emerald-100 text-emerald-700"
                              : row.status === "alfa"
                              ? "bg-rose-50 border-rose-100 text-rose-700"
                              : "bg-amber-50 border-amber-100 text-amber-700"
                          }`}>
                            {rule?.label || row.status}
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          <span className={`font-mono font-black ${row.nilai_poin_diberikan >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                            {row.nilai_poin_diberikan >= 0 ? `+${row.nilai_poin_diberikan}` : row.nilai_poin_diberikan} pts
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-slate-500 text-[10px] font-bold" title={row.pencatat_email}>
                          {row.pencatat_email.split("@")[0]}
                        </td>
                        <td className="py-3.5 px-5 text-right">
                          <div className="inline-flex gap-1.5">
                            <button
                              onClick={() => handleEditRecord(row)}
                              className="p-2 border border-brand-100 rounded-xl hover:bg-slate-100 text-brand-600 cursor-pointer"
                              title="Ubah Status Absen"
                            >
                              <Edit3 className="w-4.5 h-4.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteRecord(row.id)}
                              className="p-2 border border-rose-100 rounded-xl hover:bg-rose-50 text-rose-600 cursor-pointer"
                              title="Hapus Absen"
                            >
                              <Trash2 className="w-4.5 h-4.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="py-24 text-center space-y-2">
                <Calendar className="w-10 h-10 text-brand-300 mx-auto" />
                <h4 className="text-xs font-black text-brand-500 uppercase tracking-widest">Tidak ada absensi</h4>
                <p className="text-[10px] text-brand-400 font-semibold max-w-xs mx-auto">
                  Belum ada log absensi terdaftar pada tanggal {selectedDate}.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB CONTENT: ADMIN CONFIG POINT SYSTEM */}
      {isAdmin && activeTab === "aturan" && (
        <div className="max-w-2xl bg-white p-6 rounded-3xl border border-brand-100 shadow-md shadow-brand-900/5 space-y-6">
          <div>
            <h3 className="text-sm font-black text-brand-950 uppercase tracking-widest flex items-center gap-2">
              <Sliders className="w-5 h-5 text-brand-600" />
              Pengaturan Poin Kehadiran
            </h3>
            <p className="text-[10.5px] text-brand-400 font-semibold mt-1">
              Admin dapat menentukan bobot poin penghargaan atau hukuman untuk kehadiran harian
            </p>
          </div>

          <div className="space-y-4 border-y border-brand-50 py-4">
            {aturanList.map(rule => (
              <div key={rule.status} className="flex items-center justify-between gap-4 p-3 bg-brand-50/15 border border-brand-50 rounded-2xl">
                <div>
                  <h4 className="text-xs font-extrabold text-brand-950 leading-none">{rule.label}</h4>
                  <span className="text-[9px] font-black uppercase text-slate-400 mt-2 block font-mono">Status: {rule.status}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-slate-500">Bobot Poin:</span>
                  <input
                    type="number"
                    value={tempPoints[rule.status] ?? 0}
                    onChange={(e) => setTempPoints({ ...tempPoints, [rule.status]: Number(e.target.value) })}
                    className="w-20 border border-brand-100 rounded-xl p-2.5 text-xs font-black text-brand-900 font-mono text-center outline-none bg-white focus:ring-1 focus:ring-brand-500"
                  />
                  <span className="text-[11px] font-bold text-slate-400 font-mono">pts</span>
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-end">
            <button
              onClick={handleSaveConfig}
              disabled={isSavingConfig}
              className="px-6 py-3.5 brand-gradient text-white text-xs font-black uppercase tracking-wider rounded-2xl shadow-lg shadow-brand-500/25 cursor-pointer disabled:opacity-50 flex items-center gap-2"
            >
              {isSavingConfig ? <RefreshCw className="w-4 h-4 animate-spin" /> : "Simpan Aturan Absensi"}
            </button>
          </div>
        </div>
      )}

      {/* EDIT MODAL POPUP FOR ABSENSI LOG (Piket / Admin) */}
      <AnimatePresence>
        {editingRecord && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12, ease: "easeOut" }}
              onClick={() => setEditingRecord(null)}
              className="fixed inset-0 bg-brand-950/60 backdrop-blur-xs"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{
                opacity: 0,
                scale: 0.96,
                y: 8,
                transition: { duration: 0.12, ease: "easeInOut" }
              }}
              transition={{ type: "spring", stiffness: 450, damping: 38 }}
              className="bg-white rounded-3xl p-6 w-full max-w-sm border border-brand-100 shadow-2xl relative z-10 space-y-5"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center border-b pb-3 border-brand-50">
                <h3 className="text-xs font-black text-brand-950 uppercase tracking-widest flex items-center gap-2">
                  <Edit3 className="w-4.5 h-4.5 text-brand-600" />
                  Ubah Absensi Siswa
                </h3>
                <button
                  onClick={() => setEditingRecord(null)}
                  className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-xl cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Student header info */}
              <div className="bg-brand-50/70 p-3.5 border border-brand-100 rounded-2xl text-xs font-semibold">
                <p className="font-extrabold text-brand-950 leading-tight">{toSentenceCase(editingRecord.siswa_nama)}</p>
                <p className="text-[10px] text-brand-400 font-bold mt-1.5">Kelas {editingRecord.siswa_kelas} • Tanggal {editingRecord.tanggal}</p>
              </div>

              {/* Edit Status Select */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-brand-400 uppercase tracking-widest block">
                  Status Baru
                </label>
                <select
                  value={editStatus}
                  onChange={(e) => {
                    const statusVal = e.target.value as any;
                    setEditStatus(statusVal);
                    const matching = aturanList.find(r => r.status === statusVal);
                    if (matching) setEditPoints(matching.nilai_poin);
                  }}
                  className="w-full border border-brand-100 rounded-xl p-3 text-xs font-bold text-brand-800 bg-white outline-none focus:ring-1 focus:ring-brand-500"
                >
                  {aturanList.map(rule => (
                    <option key={rule.status} value={rule.status}>{rule.label}</option>
                  ))}
                </select>
              </div>

              {/* Edit points input */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-brand-400 uppercase tracking-widest block">
                  Nilai Poin
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={editPoints}
                    onChange={(e) => setEditPoints(Number(e.target.value))}
                    className="w-full border border-brand-100 rounded-xl p-3 text-xs font-black text-brand-900 font-mono focus:ring-1 focus:ring-brand-500 outline-none"
                  />
                  <span className="text-[11px] font-bold text-slate-400 font-mono">pts</span>
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingRecord(null)}
                  className="flex-1 py-3 border border-brand-100 hover:bg-brand-55 text-slate-600 text-xs font-black uppercase tracking-wider rounded-xl cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  disabled={isSubmitting}
                  className="flex-1 py-3 bg-brand-600 hover:bg-brand-700 text-white text-xs font-black uppercase tracking-wider rounded-xl cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? "Menyimpan..." : "Simpan Perubahan"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
