import React, { useState, useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Sparkles,
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  Plus,
  Trash2,
  ChevronLeft,
  ChevronRight,
  BookOpen,
  HeartHandshake,
  Utensils,
  Dumbbell,
  Moon,
  Sun,
  History,
  Lock,
  Send,
  Check,
  X,
  Activity,
  Zap,
  CheckCheck,
  Eye,
  Download,
  Layers,
  FileSpreadsheet,
  Printer,
  Award,
  FileText
} from "lucide-react";
import { UserSession, TujuhKaih, BelajarItem, HabitStatus, Siswa } from "../../types";
import {
  getTujuhKaihBySiswaAndDate,
  saveTujuhKaih,
  submitFinal7Kaih,
  getTujuhKaihHistoryBySiswa
} from "../../dbStore";
import { supabase } from "../../supabaseClient";
import {
  createDefault7Kaih,
  getCurrentDeviceTime,
  evaluate7KaihHabits,
  calculate7KaihProgress,
  TARGET_BANGUN_PAGI,
  TARGET_TIDUR_CEPAT,
  getWeekRange,
  getMonthRange,
  MONTH_NAMES_ID,
  calculatePeriodSummary,
  exportRekapIndividuToExcel
} from "../../services/kaihService";
import { formatLocalDate, parseDateSafe } from "../../parseDateSafe";
import ConfirmationModal from "../ConfirmationModal";
import DetailPengerjaan7KaihModal from "./DetailPengerjaan7KaihModal";

interface Checklist7KaihViewProps {
  userSession: UserSession;
  siswaId?: string;
}

export default function Checklist7KaihView({ userSession, siswaId: propSiswaId }: Checklist7KaihViewProps) {
  const currentSiswaId = propSiswaId || userSession.id;

  const [mainTab, setMainTab] = useState<"checklist" | "rekap">("checklist");

  // Rekap Hasil Saya States
  const [rekapPeriodMode, setRekapPeriodMode] = useState<"mingguan" | "bulanan">("mingguan");
  const [rekapWeekDate, setRekapWeekDate] = useState<string>(() => formatLocalDate(new Date()));
  const now = new Date();
  const [rekapYear, setRekapYear] = useState<number>(() => now.getFullYear());
  const [rekapMonth, setRekapMonth] = useState<number>(() => now.getMonth() + 1); // 1-12
  const [periodRecords, setPeriodRecords] = useState<TujuhKaih[]>([]);
  const [isLoadingPeriodRekap, setIsLoadingPeriodRekap] = useState(false);

  // Range Rekap Periode Murid
  const rekapWeekRange = useMemo(() => getWeekRange(rekapWeekDate), [rekapWeekDate]);
  const rekapMonthRange = useMemo(() => getMonthRange(rekapYear, rekapMonth), [rekapYear, rekapMonth]);

  const activeRekapRange = useMemo(() => {
    return rekapPeriodMode === "mingguan" ? rekapWeekRange : rekapMonthRange;
  }, [rekapPeriodMode, rekapWeekRange, rekapMonthRange]);

  const totalDaysInRekapPeriod = useMemo(() => {
    if (rekapPeriodMode === "mingguan") return 7;
    return new Date(rekapYear, rekapMonth, 0).getDate();
  }, [rekapPeriodMode, rekapYear, rekapMonth]);

  const handleShiftRekapWeek = (weeks: number) => {
    const d = parseDateSafe(rekapWeekDate);
    d.setDate(d.getDate() + (weeks * 7));
    setRekapWeekDate(formatLocalDate(d));
  };

  const handleShiftRekapMonth = (months: number) => {
    let nextMonth = rekapMonth + months;
    let nextYear = rekapYear;
    if (nextMonth > 12) {
      nextMonth = 1;
      nextYear += 1;
    } else if (nextMonth < 1) {
      nextMonth = 12;
      nextYear -= 1;
    }
    setRekapMonth(nextMonth);
    setRekapYear(nextYear);
  };

  // Muat data rekap untuk periode aktif
  const loadPeriodRekap = async () => {
    setIsLoadingPeriodRekap(true);
    try {
      const list = await getTujuhKaihHistoryBySiswa(
        currentSiswaId,
        60,
        activeRekapRange.startDate,
        activeRekapRange.endDate
      );
      setPeriodRecords(list || []);
    } catch (err) {
      console.error("Gagal memuat rekap periode murid:", err);
      setPeriodRecords([]);
    } finally {
      setIsLoadingPeriodRekap(false);
    }
  };

  useEffect(() => {
    if (mainTab === "rekap") {
      loadPeriodRekap();
    }
  }, [mainTab, activeRekapRange.startDate, activeRekapRange.endDate, currentSiswaId]);

  const periodSummary = useMemo(() => calculatePeriodSummary(periodRecords), [periodRecords]);

  // Export Rekap Murid ke Excel
  const handleExportMyRekap = () => {
    if (!currentStudent) return;
    exportRekapIndividuToExcel(currentStudent, periodRecords, activeRekapRange.label);
  };

  const [selectedDate, setSelectedDate] = useState<string>(() => formatLocalDate(new Date()));
  const [data, setData] = useState<TujuhKaih>(() => createDefault7Kaih(currentSiswaId, formatLocalDate(new Date())));
  const [isLoading, setIsLoading] = useState(true);
  const [autoSaveStatus, setAutoSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [toastMsg, setToastMsg] = useState("");
  const [historyList, setHistoryList] = useState<TujuhKaih[]>([]);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [currentStudent, setCurrentStudent] = useState<Siswa | null>(null);
  const [showConfirmSubmitFinal, setShowConfirmSubmitFinal] = useState(false);
  const [isSubmittingFinal, setIsSubmittingFinal] = useState(false);
  const [activeMakanTab, setActiveMakanTab] = useState<"sarapan" | "siang" | "malam">("sarapan");

  const isToday = selectedDate === formatLocalDate(new Date());
  const isLocked = !!data.is_final;

  // Load informasi data murid
  useEffect(() => {
    const loadStudentInfo = async () => {
      try {
        if (supabase) {
          const { data: sData } = await supabase
            .from("siswa")
            .select("*")
            .eq("id", currentSiswaId)
            .maybeSingle();
          if (sData) {
            setCurrentStudent(sData as Siswa);
            return;
          }
        }
      } catch (e) {
        console.warn("Gagal mengambil data siswa:", e);
      }

      setCurrentStudent({
        id: currentSiswaId,
        nis: userSession.nis || "-",
        nama: userSession.fullName || "Murid",
        kelas: "-",
        total_poin: 0,
        foto_url: userSession.foto_url || null
      });
    };
    loadStudentInfo();
  }, [currentSiswaId, userSession]);

  // Load data untuk tanggal terpilih
  const loadDataForDate = async (dateStr: string) => {
    setIsLoading(true);
    try {
      const record = await getTujuhKaihBySiswaAndDate(currentSiswaId, dateStr);
      if (record) {
        setData(record);
      } else {
        setData(createDefault7Kaih(currentSiswaId, dateStr));
      }
    } catch (err) {
      console.error("Gagal memuat data 7 KAIH:", err);
      setData(createDefault7Kaih(currentSiswaId, dateStr));
    } finally {
      setIsLoading(false);
    }
  };

  const loadHistory = async () => {
    try {
      const hist = await getTujuhKaihHistoryBySiswa(currentSiswaId, 30);
      setHistoryList(hist);
    } catch (err) {
      console.error("Gagal memuat riwayat 7 KAIH:", err);
    }
  };

  useEffect(() => {
    loadDataForDate(selectedDate);
  }, [selectedDate, currentSiswaId]);

  useEffect(() => {
    loadHistory();
  }, [currentSiswaId]);

  // Evaluasi 7 kebiasaan & hitung progres
  const evaluations = useMemo(() => evaluate7KaihHabits(data), [data]);
  const progressPercent = useMemo(() => calculate7KaihProgress(data), [data]);
  const completedHabitsCount = useMemo(
    () => evaluations.filter((h) => h.status === "selesai").length,
    [evaluations]
  );

  // Auto-Save Realtime Helper
  const saveRealtime = async (updatedData: TujuhKaih) => {
    if (isLocked) return; // Jika terkunci, jangan simpan
    setData(updatedData);
    setAutoSaveStatus("saving");

    try {
      await saveTujuhKaih(updatedData);
      setAutoSaveStatus("saved");
      setTimeout(() => setAutoSaveStatus("idle"), 2500);
      loadHistory();
    } catch (err) {
      console.error("Gagal auto-save:", err);
      setAutoSaveStatus("idle");
    }
  };

  // 1. Bangun Pagi 1-Click Realtime
  const handleRecordBangunRealtime = () => {
    if (isLocked) return;
    const nowTime = getCurrentDeviceTime();
    const updated: TujuhKaih = {
      ...data,
      bangun_pagi_waktu: nowTime
    };
    saveRealtime(updated);
    setToastMsg(`Waktu bangun berhasil dicatat pukul ${nowTime} WIB`);
    setTimeout(() => setToastMsg(""), 3000);
  };

  // 7. Tidur Cepat 1-Click Realtime
  const handleRecordTidurRealtime = () => {
    if (isLocked) return;
    const nowTime = getCurrentDeviceTime();
    const updated: TujuhKaih = {
      ...data,
      tidur_cepat_waktu: nowTime
    };
    saveRealtime(updated);
    setToastMsg(`Waktu tidur berhasil dicatat pukul ${nowTime} WIB`);
    setTimeout(() => setToastMsg(""), 3000);
  };

  // 2. Toggle Salat Realtime
  const handleToggleSalat = (key: string) => {
    if (isLocked) return;
    const currentVal = !!(data as any)[key];
    const updated: TujuhKaih = {
      ...data,
      [key]: !currentVal
    };
    saveRealtime(updated);
  };

  // Mengaji Status Realtime
  const handleSetMengajiStatus = (status: HabitStatus) => {
    if (isLocked) return;
    const updated: TujuhKaih = {
      ...data,
      mengaji_status: status
    };
    saveRealtime(updated);
  };

  // 3. Olahraga Realtime
  const handleSetOlahragaStatus = (status: HabitStatus) => {
    if (isLocked) return;
    const updated: TujuhKaih = {
      ...data,
      olahraga_status: status
    };
    saveRealtime(updated);
  };

  // 4. Makan Sehat Realtime
  const handleSetMakanStatus = (mealKey: string, status: HabitStatus) => {
    if (isLocked) return;
    const updated: TujuhKaih = {
      ...data,
      [mealKey]: status
    };
    saveRealtime(updated);
  };

  // 5. Belajar Dinamis
  const handleAddBelajar = () => {
    if (isLocked) return;
    const newItem: BelajarItem = {
      id: Date.now().toString(),
      kegiatan: "",
      durasi_menit: 30
    };
    const updatedList = [...(data.belajar_kegiatan || []), newItem];
    const total = updatedList.reduce((acc, curr) => acc + (Number(curr.durasi_menit) || 0), 0);
    const updated: TujuhKaih = {
      ...data,
      belajar_kegiatan: updatedList,
      belajar_total_durasi: total
    };
    saveRealtime(updated);
  };

  const handleUpdateBelajar = (id: string, key: "kegiatan" | "durasi_menit", value: any) => {
    if (isLocked) return;
    const updatedList = (data.belajar_kegiatan || []).map((item) => {
      if (item.id === id) {
        return {
          ...item,
          [key]: key === "durasi_menit" ? Math.max(0, parseInt(value) || 0) : value
        };
      }
      return item;
    });
    const total = updatedList.reduce((acc, curr) => acc + (Number(curr.durasi_menit) || 0), 0);
    const updated: TujuhKaih = {
      ...data,
      belajar_kegiatan: updatedList,
      belajar_total_durasi: total
    };
    saveRealtime(updated);
  };

  const handleRemoveBelajar = (id: string) => {
    if (isLocked) return;
    const updatedList = (data.belajar_kegiatan || []).filter((item) => item.id !== id);
    const total = updatedList.reduce((acc, curr) => acc + (Number(curr.durasi_menit) || 0), 0);
    const updated: TujuhKaih = {
      ...data,
      belajar_kegiatan: updatedList,
      belajar_total_durasi: total
    };
    saveRealtime(updated);
  };

  // 6. Bermasyarakat Realtime
  const handleSetMasyarakatStatus = (status: HabitStatus) => {
    if (isLocked) return;
    const updated: TujuhKaih = {
      ...data,
      bermasyarakat_status: status
    };
    saveRealtime(updated);
  };

  // Kirim Final Checklist
  const handleConfirmSubmitFinal = async () => {
    setIsSubmittingFinal(true);
    try {
      const res = await submitFinal7Kaih(currentSiswaId, selectedDate);
      if (res.success) {
        setData((prev) => ({
          ...prev,
          is_final: true,
          waktu_kirim_final: new Date().toISOString()
        }));
        setShowConfirmSubmitFinal(false);
        setToastMsg("Data Jurnal 7 KAIH hari ini berhasil dikirim & dikunci!");
        loadHistory();
        setTimeout(() => setToastMsg(""), 4000);
      } else {
        alert("Gagal mengirim data final: " + res.error);
      }
    } catch (err: any) {
      alert("Error: " + err.message);
    } finally {
      setIsSubmittingFinal(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-28 animate-fade-in font-sans">
      {/* Toast Notification */}
      <AnimatePresence>
        {toastMsg && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className="fixed top-24 right-4 sm:right-8 z-50 px-5 py-3 rounded-2xl shadow-xl flex items-center gap-3 text-sm font-bold text-white bg-emerald-600"
          >
            <CheckCircle2 className="w-5 h-5" />
            <span>{toastMsg}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tab Switcher: Checklist Harian vs Rekap Hasil Saya */}
      <div className="flex items-center gap-2 p-1.5 bg-slate-100 rounded-2xl w-fit print:hidden">
        <button
          onClick={() => setMainTab("checklist")}
          className={`px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${
            mainTab === "checklist"
              ? "bg-white text-brand-950 shadow-sm"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <Sparkles className="w-4 h-4 text-amber-500" />
          Checklist Harian
        </button>
        <button
          onClick={() => setMainTab("rekap")}
          className={`px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${
            mainTab === "rekap"
              ? "bg-white text-brand-950 shadow-sm"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <Activity className="w-4 h-4 text-emerald-600" />
          Rekap Hasil Saya
        </button>
      </div>

      {mainTab === "checklist" && (
        <div className="space-y-6">
      {/* Header Banner & Date Selector */}
      <div className="bg-gradient-to-br from-brand-700 via-brand-600 to-indigo-700 rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 backdrop-blur-md text-xs font-black uppercase tracking-wider mb-3">
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              7 Kebiasaan Anak Indonesia Hebat
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
              Jurnal 7 KAIH
            </h1>
            <p className="text-brand-100 text-xs sm:text-sm mt-1 max-w-xl">
              Cukup klik setiap kali Anda melakukan kebiasaan, sistem akan menyimpan otomatis secara real-time.
            </p>
          </div>

          {/* Date Navigator Bar */}
          <div className="bg-white/15 backdrop-blur-md rounded-2xl p-2 flex items-center gap-2 border border-white/20 self-start md:self-auto">
            <button
              onClick={() => {
                const cur = parseDateSafe(selectedDate);
                cur.setDate(cur.getDate() - 1);
                setSelectedDate(formatLocalDate(cur));
              }}
              className="p-2 hover:bg-white/20 rounded-xl transition-all cursor-pointer text-white"
              title="Hari Sebelumnya"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent text-white font-bold text-xs sm:text-sm px-2 py-1 outline-none cursor-pointer [color-scheme:dark]"
            />
            <button
              onClick={() => {
                const cur = parseDateSafe(selectedDate);
                cur.setDate(cur.getDate() + 1);
                setSelectedDate(formatLocalDate(cur));
              }}
              className="p-2 hover:bg-white/20 rounded-xl transition-all cursor-pointer text-white"
              title="Hari Berikutnya"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => setSelectedDate(formatLocalDate(new Date()))}
              className="px-3 py-1.5 bg-white text-brand-700 text-xs font-black rounded-xl hover:bg-brand-50 transition-all cursor-pointer shadow-sm ml-1"
            >
              Hari Ini
            </button>
          </div>
        </div>

        {/* Progress Metric & Auto-save Status Card */}
        <div className="mt-8 pt-6 border-t border-white/15 grid grid-cols-1 sm:grid-cols-3 gap-4 items-center">
          <div className="sm:col-span-2">
            <div className="flex items-center justify-between text-xs font-bold mb-2">
              <span className="flex items-center gap-1.5">
                <Activity className="w-4 h-4 text-amber-300" />
                Capaian Hari Ini:
              </span>
              <span className="text-amber-200 text-sm font-black">
                {completedHabitsCount} dari 7 Kebiasaan ({progressPercent}%)
              </span>
            </div>
            {/* Progress Track */}
            <div className="w-full bg-black/25 rounded-full h-3.5 p-0.5 overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-amber-400 via-emerald-400 to-teal-300 shadow-md"
                initial={{ width: 0 }}
                animate={{ width: `${progressPercent}%` }}
                transition={{ duration: 0.6, ease: "easeOut" }}
              />
            </div>
          </div>

          <div className="flex sm:justify-end items-center gap-3">
            {/* Realtime Save Indicator */}
            {autoSaveStatus === "saving" && (
              <span className="text-xs font-bold text-brand-200 flex items-center gap-1.5 animate-pulse">
                <div className="w-2.5 h-2.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Menyimpan...
              </span>
            )}
            {autoSaveStatus === "saved" && (
              <span className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                <CheckCheck className="w-4 h-4 text-emerald-300" />
                Tersimpan Otomatis
              </span>
            )}
            <button
              onClick={() => setShowDetailModal(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-xl text-xs font-bold transition-all cursor-pointer border border-white/20"
              title="Lihat Rincian Lengkap Pengerjaan Jurnal 7 KAIH"
            >
              <Eye className="w-4 h-4" />
              Detail Pengerjaan
            </button>
            <button
              onClick={() => setShowHistoryModal(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-xl text-xs font-bold transition-all cursor-pointer border border-white/20"
            >
              <History className="w-4 h-4" />
              Riwayat
            </button>
          </div>
        </div>
      </div>

      {/* Locked Status Banner if is_final = true */}
      {isLocked && (
        <div className="bg-amber-500/10 border-2 border-amber-500/30 rounded-3xl p-5 text-amber-900 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center font-bold flex-shrink-0">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-black text-amber-950">
                Checklist Jurnal 7 KAIH Hari Ini Telah Dikirim & Dikunci
              </h4>
              <p className="text-xs text-amber-800 font-medium">
                Data sudah final dan tidak dapat diubah lagi oleh murid. Hanya Super Admin yang memiliki wewenang membuka kunci jika ada perbaikan.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
            <button
              onClick={() => setShowDetailModal(true)}
              className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-sm"
            >
              <Eye className="w-3.5 h-3.5" />
              Lihat Detail
            </button>
            <span className="text-xs font-black px-3 py-1 bg-amber-200 text-amber-950 rounded-xl">
              Terkunci 🔒
            </span>
          </div>
        </div>
      )}

      {/* Grid Overview Pills 7 Kebiasaan */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
        {evaluations.map((h, idx) => {
          let badgeBg = "bg-slate-100 text-slate-500 border-slate-200";
          let badgeDot = "bg-slate-300";
          if (h.status === "selesai") {
            badgeBg = "bg-emerald-50 text-emerald-700 border-emerald-200";
            badgeDot = "bg-emerald-500 animate-pulse";
          } else if (h.status === "belum_dilakukan") {
            badgeBg = "bg-amber-50 text-amber-700 border-amber-200";
            badgeDot = "bg-amber-500";
          }

          return (
            <div
              key={h.id}
              className={`p-3 rounded-2xl border transition-all text-center flex flex-col items-center justify-between ${badgeBg}`}
            >
              <span className="text-[10.5px] font-black uppercase tracking-tight line-clamp-1">
                {idx + 1}. {h.title}
              </span>
              <div className="flex items-center gap-1.5 mt-2">
                <span className={`w-2 h-2 rounded-full ${badgeDot}`} />
                <span className="text-[10px] font-bold">
                  {h.status === "selesai"
                    ? "Tercapai"
                    : h.status === "belum_dilakukan"
                    ? "Belum Dilakukan"
                    : "Belum Diisi"}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* ======================================================== */}
      {/* 7 KARTU KEBIASAAN DENGAN AUTO-SAVE REAL-TIME             */}
      {/* ======================================================== */}
      <div className="space-y-5">
        {/* ====================================================== */}
        {/* 1. BANGUN PAGI                                         */}
        {/* ====================================================== */}
        <div className="bg-white rounded-3xl p-6 border border-brand-100 shadow-sm space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100">
                <Sun className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-black text-brand-950">1. Bangun Pagi</h2>
                <p className="text-xs text-slate-500 font-medium">
                  Klik tombol bangun saat Anda membuka mata untuk mencatat jam bangun secara real-time.
                </p>
              </div>
            </div>
            <span className="text-xs font-bold text-brand-600 bg-brand-50 px-3 py-1 rounded-full border border-brand-100">
              Target: ≤ {TARGET_BANGUN_PAGI} WIB
            </span>
          </div>

          <div className="bg-amber-50/40 rounded-2xl p-4 border border-amber-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Clock className="w-5 h-5 text-amber-600" />
              <div>
                <span className="text-xs font-bold text-slate-500 block">Waktu Bangun Tercatat:</span>
                <span className="text-lg font-black text-amber-950">
                  {data.bangun_pagi_waktu ? `${data.bangun_pagi_waktu} WIB` : "Belum dicatat"}
                </span>
              </div>
            </div>

            {!isLocked && (
              <button
                type="button"
                onClick={handleRecordBangunRealtime}
                className="px-5 py-3 bg-amber-500 hover:bg-amber-600 text-white rounded-2xl text-xs font-black transition-all cursor-pointer shadow-md flex items-center justify-center gap-2"
              >
                <Zap className="w-4 h-4" />
                Catat Saya Sudah Bangun Sekarang ({getCurrentDeviceTime()})
              </button>
            )}
          </div>

          {data.bangun_pagi_waktu && (
            <div
              className={`p-3 rounded-2xl text-xs font-bold flex items-center gap-2 ${
                data.bangun_pagi_waktu <= TARGET_BANGUN_PAGI
                  ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                  : "bg-amber-50 text-amber-800 border border-amber-200"
              }`}
            >
              {data.bangun_pagi_waktu <= TARGET_BANGUN_PAGI ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Hebat! Bangun tepat waktu sesuai target (≤ {TARGET_BANGUN_PAGI} WIB). Data tersimpan real-time ⭐</span>
                </>
              ) : (
                <>
                  <AlertCircle className="w-4 h-4 text-amber-600" />
                  <span>Bangun pukul {data.bangun_pagi_waktu} WIB. Besok yuk usahakan bangun lebih awal sebelum {TARGET_BANGUN_PAGI} WIB!</span>
                </>
              )}
            </div>
          )}
        </div>

        {/* ====================================================== */}
        {/* 2. BERIBADAH (Salat 5 Waktu + Pendukung Mengaji)        */}
        {/* ====================================================== */}
        <div className="bg-white rounded-3xl p-6 border border-brand-100 shadow-sm space-y-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-100">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-brand-950">2. Beribadah</h2>
              <p className="text-xs text-slate-500 font-medium">
                Klik setiap waktu salat yang sudah Anda laksanakan hari ini (otomatis tersimpan).
              </p>
            </div>
          </div>

          {/* 5 Waktu Salat (1-Click Auto Save) */}
          <div>
            <label className="text-xs font-black text-slate-700 uppercase tracking-wider block mb-2.5">
              Salat Wajib 5 Waktu:
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
              {[
                { key: "salat_subuh", label: "Subuh" },
                { key: "salat_zuhur", label: "Zuhur" },
                { key: "salat_asar", label: "Asar" },
                { key: "salat_magrib", label: "Magrib" },
                { key: "salat_isya", label: "Isya" }
              ].map((s) => {
                const isChecked = !!(data as any)[s.key];
                return (
                  <button
                    key={s.key}
                    type="button"
                    disabled={isLocked}
                    onClick={() => handleToggleSalat(s.key)}
                    className={`p-3.5 rounded-2xl border text-center transition-all flex flex-col items-center gap-2 ${
                      isLocked ? "cursor-not-allowed opacity-80" : "cursor-pointer"
                    } ${
                      isChecked
                        ? "bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-600/20"
                        : "bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200"
                    }`}
                  >
                    <span className="text-xs font-black">{s.label}</span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                        isChecked ? "bg-white/20 text-white" : "bg-slate-200 text-slate-600"
                      }`}
                    >
                      {isChecked ? "Sudah" : "Belum"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Pendukung Beribadah: Mengaji / Tadarus */}
          <div className="bg-indigo-50/60 rounded-2xl p-4 border border-indigo-100 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-600" />
                <span className="text-xs font-black text-indigo-950">
                  Pendukung Ibadah: Mengaji / Tadarus Al-Qur'an
                </span>
              </div>
              <div className="flex items-center gap-1.5 bg-white p-1 rounded-xl border border-indigo-100">
                <button
                  type="button"
                  disabled={isLocked}
                  onClick={() => handleSetMengajiStatus("sudah")}
                  className={`px-3 py-1 rounded-lg text-xs font-black transition-all cursor-pointer ${
                    data.mengaji_status === "sudah"
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  Sudah
                </button>
                <button
                  type="button"
                  disabled={isLocked}
                  onClick={() => handleSetMengajiStatus("belum")}
                  className={`px-3 py-1 rounded-lg text-xs font-black transition-all cursor-pointer ${
                    data.mengaji_status === "belum"
                      ? "bg-amber-600 text-white shadow-sm"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  Belum
                </button>
              </div>
            </div>

            {data.mengaji_status === "sudah" && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                <div>
                  <label className="text-[11px] font-bold text-slate-600 block mb-1">Nama Surah:</label>
                  <input
                    type="text"
                    disabled={isLocked}
                    placeholder="Contoh: Al-Baqarah"
                    value={data.mengaji_surah || ""}
                    onChange={(e) => saveRealtime({ ...data, mengaji_surah: e.target.value })}
                    className="w-full bg-white px-3 py-1.5 rounded-xl border border-indigo-200 text-xs font-bold text-slate-800 outline-none"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-600 block mb-1">Rentang Ayat:</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      disabled={isLocked}
                      placeholder="Awal"
                      value={data.mengaji_ayat_awal || ""}
                      onChange={(e) => saveRealtime({ ...data, mengaji_ayat_awal: parseInt(e.target.value) || null })}
                      className="w-full bg-white px-2 py-1.5 rounded-xl border border-indigo-200 text-xs font-bold text-slate-800 outline-none"
                    />
                    <span className="text-xs text-slate-400 font-bold">-</span>
                    <input
                      type="number"
                      disabled={isLocked}
                      placeholder="Akhir"
                      value={data.mengaji_ayat_akhir || ""}
                      onChange={(e) => saveRealtime({ ...data, mengaji_ayat_akhir: parseInt(e.target.value) || null })}
                      className="w-full bg-white px-2 py-1.5 rounded-xl border border-indigo-200 text-xs font-bold text-slate-800 outline-none"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-600 block mb-1">Catatan Tadarus:</label>
                  <input
                    type="text"
                    disabled={isLocked}
                    placeholder="Catatan / tajwid (opsional)"
                    value={data.mengaji_catatan || ""}
                    onChange={(e) => saveRealtime({ ...data, mengaji_catatan: e.target.value })}
                    className="w-full bg-white px-3 py-1.5 rounded-xl border border-indigo-200 text-xs font-bold text-slate-800 outline-none"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ====================================================== */}
        {/* 3. BEROLAHRAGA                                         */}
        {/* ====================================================== */}
        <div className="bg-white rounded-3xl p-6 border border-brand-100 shadow-sm space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
                <Dumbbell className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-black text-brand-950">3. Berolahraga</h2>
                <p className="text-xs text-slate-500 font-medium">
                  Aktivitas fisik menjaga kebugaran tubuh dan daya konsentrasi belajar.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
              <button
                type="button"
                disabled={isLocked}
                onClick={() => handleSetOlahragaStatus("sudah")}
                className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
                  data.olahraga_status === "sudah"
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-200"
                }`}
              >
                Sudah
              </button>
              <button
                type="button"
                disabled={isLocked}
                onClick={() => handleSetOlahragaStatus("belum")}
                className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
                  data.olahraga_status === "belum"
                    ? "bg-amber-600 text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-200"
                }`}
              >
                Belum
              </button>
            </div>
          </div>

          {data.olahraga_status === "sudah" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 bg-emerald-50/50 p-4 rounded-2xl border border-emerald-100">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Jenis Olahraga:</label>
                <input
                  type="text"
                  disabled={isLocked}
                  placeholder="Contoh: Jogging, Sepak Bola, Senam, Bersepeda, dll"
                  value={data.olahraga_jenis || ""}
                  onChange={(e) => saveRealtime({ ...data, olahraga_jenis: e.target.value })}
                  className="w-full bg-white px-3 py-2 rounded-xl border border-emerald-200 text-xs font-bold text-slate-800 outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Durasi Olahraga (menit):</label>
                <input
                  type="number"
                  disabled={isLocked}
                  placeholder="Misal: 30"
                  value={data.olahraga_durasi_menit || ""}
                  onChange={(e) => saveRealtime({ ...data, olahraga_durasi_menit: parseInt(e.target.value) || null })}
                  className="w-full bg-white px-3 py-2 rounded-xl border border-emerald-200 text-xs font-bold text-slate-800 outline-none"
                />
              </div>
            </div>
          )}
        </div>

        {/* ====================================================== */}
        {/* 4. MAKAN SEHAT DAN BERGIZI                             */}
        {/* ====================================================== */}
        <div className="bg-white rounded-3xl p-6 border border-brand-100 shadow-sm space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-orange-50 text-orange-600 flex items-center justify-center border border-orange-100">
                <Utensils className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-black text-brand-950">4. Makan Sehat dan Bergizi</h2>
                <p className="text-xs text-slate-500 font-medium">
                  Klik Sudah saat Anda sarapan, makan siang, atau makan malam.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
              {(["sarapan", "siang", "malam"] as const).map((meal) => (
                <button
                  key={meal}
                  type="button"
                  onClick={() => setActiveMakanTab(meal)}
                  className={`px-3 py-1 rounded-lg text-xs font-black capitalize transition-all cursor-pointer ${
                    activeMakanTab === meal
                      ? "bg-orange-600 text-white shadow-sm"
                      : "text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {meal === "sarapan" ? "Sarapan" : meal === "siang" ? "Makan Siang" : "Makan Malam"}
                </button>
              ))}
            </div>
          </div>

          {(() => {
            const statusKey = activeMakanTab === "sarapan" ? "sarapan_status" : activeMakanTab === "siang" ? "makan_siang_status" : "makan_malam_status";
            const bergiziKey = activeMakanTab === "sarapan" ? "sarapan_bergizi" : activeMakanTab === "siang" ? "makan_siang_bergizi" : "makan_malam_bergizi";
            const menuKey = activeMakanTab === "sarapan" ? "sarapan_menu" : activeMakanTab === "siang" ? "makan_siang_menu" : "makan_malam_menu";

            const mealTitle = activeMakanTab === "sarapan" ? "Sarapan Pagi" : activeMakanTab === "siang" ? "Makan Siang" : "Makan Malam";
            const currentStatus = data[statusKey] as HabitStatus;
            const currentBergizi = !!data[bergiziKey];
            const currentMenu = (data[menuKey] as string) || "";

            return (
              <div className="bg-orange-50/50 rounded-2xl p-4 border border-orange-100 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="text-xs font-black text-orange-950">Status {mealTitle}:</span>
                  <div className="flex items-center gap-1.5 bg-white p-1 rounded-xl border border-orange-200">
                    <button
                      type="button"
                      disabled={isLocked}
                      onClick={() => handleSetMakanStatus(statusKey, "sudah")}
                      className={`px-3 py-1 rounded-lg text-xs font-black transition-all cursor-pointer ${
                        currentStatus === "sudah"
                          ? "bg-orange-600 text-white shadow-sm"
                          : "text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      Sudah
                    </button>
                    <button
                      type="button"
                      disabled={isLocked}
                      onClick={() => handleSetMakanStatus(statusKey, "belum")}
                      className={`px-3 py-1 rounded-lg text-xs font-black transition-all cursor-pointer ${
                        currentStatus === "belum"
                          ? "bg-amber-600 text-white shadow-sm"
                          : "text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      Belum
                    </button>
                  </div>
                </div>

                {currentStatus === "sudah" && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                    <label className="flex items-center gap-2 cursor-pointer bg-white px-3 py-2 rounded-xl border border-orange-200 text-xs font-bold text-slate-800">
                      <input
                        type="checkbox"
                        disabled={isLocked}
                        checked={currentBergizi}
                        onChange={(e) => saveRealtime({ ...data, [bergiziKey]: e.target.checked })}
                        className="w-4 h-4 rounded text-orange-600 accent-orange-600"
                      />
                      <span>Menu Bergizi Seimbang</span>
                    </label>
                    <div className="sm:col-span-2">
                      <input
                        type="text"
                        disabled={isLocked}
                        placeholder="Tulis menu makanan (opsional, misal: nasi, telur, sayur, buah)"
                        value={currentMenu}
                        onChange={(e) => saveRealtime({ ...data, [menuKey]: e.target.value })}
                        className="w-full bg-white px-3 py-2 rounded-xl border border-orange-200 text-xs font-bold text-slate-800 outline-none"
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </div>

        {/* ====================================================== */}
        {/* 5. GEMAR BELAJAR                                       */}
        {/* ====================================================== */}
        <div className="bg-white rounded-3xl p-6 border border-brand-100 shadow-sm space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-cyan-50 text-cyan-600 flex items-center justify-center border border-cyan-100">
                <BookOpen className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-black text-brand-950">5. Gemar Belajar</h2>
                <p className="text-xs text-slate-500 font-medium">
                  Catat kegiatan belajar mandiri / membaca buku di luar jam sekolah (terakumulasi otomatis).
                </p>
              </div>
            </div>

            <div className="text-xs font-black text-cyan-700 bg-cyan-50 px-3 py-1.5 rounded-xl border border-cyan-200">
              Total: {data.belajar_total_durasi || 0} Menit
            </div>
          </div>

          <div className="space-y-2.5">
            {(data.belajar_kegiatan || []).map((item, idx) => (
              <div key={item.id} className="flex items-center gap-2 bg-slate-50 p-2.5 rounded-2xl border border-slate-200">
                <span className="text-xs font-black text-slate-400 w-6 text-center">#{idx + 1}</span>
                <input
                  type="text"
                  disabled={isLocked}
                  placeholder="Nama kegiatan (misal: Membaca Sejarah, Tugas Matematika)"
                  value={item.kegiatan}
                  onChange={(e) => handleUpdateBelajar(item.id, "kegiatan", e.target.value)}
                  className="flex-1 bg-white px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-800 outline-none"
                />
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    disabled={isLocked}
                    placeholder="Menit"
                    value={item.durasi_menit || ""}
                    onChange={(e) => handleUpdateBelajar(item.id, "durasi_menit", e.target.value)}
                    className="w-20 bg-white px-2 py-1.5 rounded-xl border border-slate-200 text-xs font-black text-center text-slate-800 outline-none"
                  />
                  <span className="text-xs text-slate-500 font-bold hidden sm:inline">menit</span>
                </div>
                {!isLocked && (
                  <button
                    type="button"
                    onClick={() => handleRemoveBelajar(item.id)}
                    className="p-2 text-rose-500 hover:bg-rose-50 rounded-xl transition-all cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}

            {!isLocked && (
              <button
                type="button"
                onClick={handleAddBelajar}
                className="w-full py-2.5 border-2 border-dashed border-cyan-200 hover:border-cyan-400 bg-cyan-50/50 hover:bg-cyan-50 text-cyan-700 rounded-2xl text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Tambah Kegiatan Belajar Mandiri
              </button>
            )}
          </div>
        </div>

        {/* ====================================================== */}
        {/* 6. BERMASYARAKAT                                       */}
        {/* ====================================================== */}
        <div className="bg-white rounded-3xl p-6 border border-brand-100 shadow-sm space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center border border-rose-100">
                <HeartHandshake className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-black text-brand-950">6. Bermasyarakat</h2>
                <p className="text-xs text-slate-500 font-medium">
                  Gotong royong, kepedulian sosial, dan interaksi positif di lingkungan sekitar.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
              <button
                type="button"
                disabled={isLocked}
                onClick={() => handleSetMasyarakatStatus("sudah")}
                className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
                  data.bermasyarakat_status === "sudah"
                    ? "bg-rose-600 text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-200"
                }`}
              >
                Sudah
              </button>
              <button
                type="button"
                disabled={isLocked}
                onClick={() => handleSetMasyarakatStatus("belum")}
                className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
                  data.bermasyarakat_status === "belum"
                    ? "bg-amber-600 text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-200"
                }`}
              >
                Belum
              </button>
            </div>
          </div>

          {data.bermasyarakat_status === "sudah" && (
            <div className="pt-2">
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Deskripsi Kegiatan Sosial / Gotong Royong:
              </label>
              <textarea
                rows={2}
                disabled={isLocked}
                placeholder="Contoh: Ikut kerja bakti membersihkan selokan RT, membantu lansia menyeberang jalan, dll."
                value={data.bermasyarakat_kegiatan || ""}
                onChange={(e) => saveRealtime({ ...data, bermasyarakat_kegiatan: e.target.value })}
                className="w-full bg-slate-50 px-3 py-2 rounded-2xl border border-slate-200 text-xs font-bold text-slate-800 outline-none focus:bg-white focus:border-rose-300"
              />
            </div>
          )}
        </div>

        {/* ====================================================== */}
        {/* 7. TIDUR CEPAT                                         */}
        {/* ====================================================== */}
        <div className="bg-white rounded-3xl p-6 border border-brand-100 shadow-sm space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center border border-purple-100">
                <Moon className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-black text-brand-950">7. Tidur Cepat</h2>
                <p className="text-xs text-slate-500 font-medium">
                  Klik sebelum tidur malam untuk mencatat jam tidur secara real-time.
                </p>
              </div>
            </div>
            <span className="text-xs font-bold text-purple-600 bg-purple-50 px-3 py-1 rounded-full border border-purple-100">
              Target: ≤ {TARGET_TIDUR_CEPAT} WIB
            </span>
          </div>

          <div className="bg-purple-50/40 rounded-2xl p-4 border border-purple-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Clock className="w-5 h-5 text-purple-600" />
              <div>
                <span className="text-xs font-bold text-slate-500 block">Waktu Tidur Tercatat:</span>
                <span className="text-lg font-black text-purple-950">
                  {data.tidur_cepat_waktu ? `${data.tidur_cepat_waktu} WIB` : "Belum dicatat"}
                </span>
              </div>
            </div>

            {!isLocked && (
              <button
                type="button"
                onClick={handleRecordTidurRealtime}
                className="px-5 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-2xl text-xs font-black transition-all cursor-pointer shadow-md flex items-center justify-center gap-2"
              >
                <Moon className="w-4 h-4" />
                Catat Saya Hendak Tidur Sekarang ({getCurrentDeviceTime()})
              </button>
            )}
          </div>

          {data.tidur_cepat_waktu && (
            <div
              className={`p-3 rounded-2xl text-xs font-bold flex items-center gap-2 ${
                data.tidur_cepat_waktu <= TARGET_TIDUR_CEPAT && data.tidur_cepat_waktu >= "19:00"
                  ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                  : "bg-amber-50 text-amber-800 border border-amber-200"
              }`}
            >
              {data.tidur_cepat_waktu <= TARGET_TIDUR_CEPAT && data.tidur_cepat_waktu >= "19:00" ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Sangat baik! Jam tidur memenuhi target tidur cepat (≤ {TARGET_TIDUR_CEPAT} WIB).</span>
                </>
              ) : (
                <>
                  <AlertCircle className="w-4 h-4 text-amber-600" />
                  <span>Waktu tidur tercatat pukul {data.tidur_cepat_waktu} WIB. Usahakan tidur maksimal pukul {TARGET_TIDUR_CEPAT} WIB.</span>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Floating Sticky Bottom Bar for FINAL SUBMIT */}
      <div className="fixed bottom-6 left-0 right-0 z-40 px-4 pointer-events-none">
        <div className="max-w-md mx-auto pointer-events-auto">
          {isLocked ? (
            <div className="bg-slate-900/90 backdrop-blur-md text-white py-3 px-5 rounded-3xl text-center shadow-2xl flex items-center justify-center gap-2 border border-white/20">
              <Lock className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-black">Data Hari Ini Telah Dikirim & Dikunci</span>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowConfirmSubmitFinal(true)}
              className="w-full py-4 px-6 bg-gradient-to-r from-emerald-600 via-teal-600 to-brand-700 text-white rounded-3xl font-black text-sm sm:text-base shadow-2xl shadow-emerald-900/30 hover:opacity-95 active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-2 border border-white/20"
            >
              <Send className="w-5 h-5" />
              <span>Kirim Data Final Hari Ini ({progressPercent}%)</span>
            </button>
          )}
        </div>
      </div>

      {/* Confirmation Modal to Submit Final & Lock */}
      <ConfirmationModal
        isOpen={showConfirmSubmitFinal}
        onClose={() => setShowConfirmSubmitFinal(false)}
        onConfirm={handleConfirmSubmitFinal}
        title="Kirim Data Final Jurnal 7 KAIH?"
        message="Setelah dikirim, data checklist hari ini akan dikunci dan TIDAK DAPAT DIUBAH LAGI oleh murid (hanya Admin yang dapat membukanya). Apakah Anda yakin ingin mengirim data final hari ini?"
        confirmText={isSubmittingFinal ? "Mengirim..." : "Ya, Kirim & Kunci Data"}
        cancelText="Periksa Lagi"
        type="warning"
      />

        </div>
      )}

      {/* ======================================================== */}
      {/* TAMPILAN REKAP HASIL SAYA (MINGGUAN / BULANAN)           */}
      {/* ======================================================== */}
      {mainTab === "rekap" && (
        <div className="space-y-6">
          {/* Header Banner Rekap Murid */}
          <div className="bg-gradient-to-br from-indigo-900 via-brand-900 to-slate-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 backdrop-blur-md text-xs font-black uppercase tracking-wider mb-3">
                  <Activity className="w-3.5 h-3.5 text-emerald-400" />
                  Rekapitulasi Capaian Karakter
                </div>
                <h2 className="text-2xl sm:text-3xl font-black tracking-tight">
                  Rekap Hasil Jurnal 7 KAIH
                </h2>
                <p className="text-brand-200 text-xs sm:text-sm mt-1 max-w-xl">
                  {currentStudent?.nama} ({currentStudent?.kelas || "Siswa"}) • Pantau tingkat konsistensi dan capaian 7 Kebiasaan Anak Indonesia Hebat Anda.
                </p>
              </div>

              {/* Selector Periode Mingguan vs Bulanan */}
              <div className="bg-white/15 backdrop-blur-md p-1.5 rounded-2xl flex items-center gap-1 border border-white/20 self-start md:self-auto print:hidden">
                <button
                  onClick={() => setRekapPeriodMode("mingguan")}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${
                    rekapPeriodMode === "mingguan"
                      ? "bg-white text-brand-950 shadow-sm"
                      : "text-white hover:bg-white/15"
                  }`}
                >
                  <Layers className="w-3.5 h-3.5 text-indigo-500" />
                  Mingguan
                </button>
                <button
                  onClick={() => setRekapPeriodMode("bulanan")}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${
                    rekapPeriodMode === "bulanan"
                      ? "bg-white text-brand-950 shadow-sm"
                      : "text-white hover:bg-white/15"
                  }`}
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                  Bulanan
                </button>
              </div>
            </div>

            {/* Sub-bar: Periode Navigator & Tombol Export */}
            <div className="mt-6 pt-5 border-t border-white/15 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              {/* Date Navigator */}
              <div className="flex items-center gap-2">
                {rekapPeriodMode === "mingguan" ? (
                  <div className="flex items-center gap-1.5 bg-black/25 px-2 py-1 rounded-xl border border-white/15">
                    <button
                      onClick={() => handleShiftRekapWeek(-1)}
                      title="Minggu Sebelumnya"
                      className="p-1 hover:bg-white/20 text-white rounded-lg transition-all cursor-pointer"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <div className="flex items-center gap-2 px-2">
                      <Calendar className="w-3.5 h-3.5 text-amber-300" />
                      <span className="text-xs font-black text-white whitespace-nowrap">
                        Minggu: {rekapWeekRange.label}
                      </span>
                    </div>
                    <button
                      onClick={() => handleShiftRekapWeek(1)}
                      title="Minggu Berikutnya"
                      className="p-1 hover:bg-white/20 text-white rounded-lg transition-all cursor-pointer"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 bg-black/25 px-2 py-1 rounded-xl border border-white/15">
                    <button
                      onClick={() => handleShiftRekapMonth(-1)}
                      title="Bulan Sebelumnya"
                      className="p-1 hover:bg-white/20 text-white rounded-lg transition-all cursor-pointer"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <div className="flex items-center gap-2 px-2">
                      <Calendar className="w-3.5 h-3.5 text-amber-300" />
                      <span className="text-xs font-black text-white whitespace-nowrap">
                        Bulan: {MONTH_NAMES_ID[rekapMonth - 1]} {rekapYear}
                      </span>
                    </div>
                    <button
                      onClick={() => handleShiftRekapMonth(1)}
                      title="Bulan Berikutnya"
                      className="p-1 hover:bg-white/20 text-white rounded-lg transition-all cursor-pointer"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              {/* Action Buttons: Export Excel & Cetak PDF */}
              <div className="flex items-center gap-2 print:hidden">
                <button
                  onClick={handleExportMyRekap}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-2 shadow-sm"
                  title="Unduh laporan rekap saya ke Excel (.xlsx)"
                >
                  <Download className="w-4 h-4" />
                  <span>Download Rekap (Excel)</span>
                </button>
                <button
                  onClick={() => window.print()}
                  className="p-2 bg-white/20 hover:bg-white/30 text-white rounded-xl transition-all cursor-pointer border border-white/20"
                  title="Cetak Ringkasan Jurnal"
                >
                  <Printer className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* KPI Summary Cards Murid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-3xl border border-brand-100 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-brand-50 text-brand-700 flex items-center justify-center border border-brand-100">
                <Calendar className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Hari Mengisi</p>
                <h3 className="text-2xl font-black text-brand-950">
                  {periodSummary.totalHariTerisi}{" "}
                  <span className="text-xs font-bold text-slate-400">/ {totalDaysInRekapPeriod} Hari</span>
                </h3>
              </div>
            </div>

            <div className="bg-white p-5 rounded-3xl border border-brand-100 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-100">
                <Award className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Rata-rata Capaian</p>
                <h3 className="text-2xl font-black text-emerald-700">{periodSummary.avgProgress}%</h3>
              </div>
            </div>

            <div className="bg-white p-5 rounded-3xl border border-brand-100 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-700 flex items-center justify-center border border-indigo-100">
                <BookOpen className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Total Belajar</p>
                <h3 className="text-2xl font-black text-indigo-700">
                  {periodSummary.totalDurasiBelajar}{" "}
                  <span className="text-xs font-bold text-slate-400">Menit</span>
                </h3>
              </div>
            </div>

            <div className="bg-white p-5 rounded-3xl border border-brand-100 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-700 flex items-center justify-center border border-amber-100">
                <Dumbbell className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Olahraga Fisik</p>
                <h3 className="text-2xl font-black text-amber-700">
                  {periodSummary.olahragaSudahCount}{" "}
                  <span className="text-xs font-bold text-slate-400">Sesi</span>
                </h3>
              </div>
            </div>
          </div>

          {/* Grid Capaian 7 Kebiasaan Murid */}
          <div className="bg-white rounded-3xl p-6 border border-brand-100 shadow-sm space-y-4">
            <h3 className="text-base font-black text-brand-950 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-500" />
              Tingkat Konsistensi 7 Kebiasaan pada Periode Ini
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3.5">
              {/* 1. Bangun Pagi */}
              <div className="p-4 rounded-2xl bg-amber-50/60 border border-amber-200/80 space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sun className="w-4 h-4 text-amber-600" />
                    <span className="text-xs font-black text-brand-950">1. Bangun Pagi</span>
                  </div>
                  <span className="text-xs font-black text-amber-800 bg-white px-2 py-0.5 rounded-md border border-amber-200">
                    {periodSummary.bangunPagiTargetMetCount}x
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 font-medium">
                  Bangun tepat waktu sebelum Subuh (≤ {TARGET_BANGUN_PAGI} WIB)
                </p>
              </div>

              {/* 2. Beribadah */}
              <div className="p-4 rounded-2xl bg-emerald-50/60 border border-emerald-200/80 space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-emerald-600" />
                    <span className="text-xs font-black text-brand-950">2. Beribadah</span>
                  </div>
                  <span className="text-xs font-black text-emerald-800 bg-white px-2 py-0.5 rounded-md border border-emerald-200">
                    {periodSummary.salat5WaktuLengkapCount}x
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 font-medium">
                  Salat 5 waktu lengkap & {periodSummary.mengajiSudahCount}x tadarus Al-Qur'an
                </p>
              </div>

              {/* 3. Berolahraga */}
              <div className="p-4 rounded-2xl bg-blue-50/60 border border-blue-200/80 space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Dumbbell className="w-4 h-4 text-blue-600" />
                    <span className="text-xs font-black text-brand-950">3. Berolahraga</span>
                  </div>
                  <span className="text-xs font-black text-blue-800 bg-white px-2 py-0.5 rounded-md border border-blue-200">
                    {periodSummary.olahragaSudahCount}x
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 font-medium">
                  Aktivitas fisik dengan total durasi {periodSummary.totalDurasiOlahraga} menit
                </p>
              </div>

              {/* 4. Makan Sehat */}
              <div className="p-4 rounded-2xl bg-teal-50/60 border border-teal-200/80 space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Utensils className="w-4 h-4 text-teal-600" />
                    <span className="text-xs font-black text-brand-950">4. Makan Sehat</span>
                  </div>
                  <span className="text-xs font-black text-teal-800 bg-white px-2 py-0.5 rounded-md border border-teal-200">
                    {periodSummary.sarapanBergiziCount}x
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 font-medium">
                  Hari dengan sarapan bergizi seimbang
                </p>
              </div>

              {/* 5. Gemar Belajar */}
              <div className="p-4 rounded-2xl bg-violet-50/60 border border-violet-200/80 space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-violet-600" />
                    <span className="text-xs font-black text-brand-950">5. Gemar Belajar</span>
                  </div>
                  <span className="text-xs font-black text-violet-800 bg-white px-2 py-0.5 rounded-md border border-violet-200">
                    {periodSummary.totalDurasiBelajar} mnt
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 font-medium">
                  {periodSummary.totalAktivitasBelajar} materi / aktivitas belajar mandiri
                </p>
              </div>

              {/* 6. Bermasyarakat */}
              <div className="p-4 rounded-2xl bg-pink-50/60 border border-pink-200/80 space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <HeartHandshake className="w-4 h-4 text-pink-600" />
                    <span className="text-xs font-black text-brand-950">6. Bermasyarakat</span>
                  </div>
                  <span className="text-xs font-black text-pink-800 bg-white px-2 py-0.5 rounded-md border border-pink-200">
                    {periodSummary.bermasyarakatSudahCount}x
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 font-medium">
                  Partisipasi gotong royong & kegiatan sosial
                </p>
              </div>

              {/* 7. Tidur Cepat */}
              <div className="p-4 rounded-2xl bg-indigo-50/60 border border-indigo-200/80 space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Moon className="w-4 h-4 text-indigo-600" />
                    <span className="text-xs font-black text-brand-950">7. Tidur Cepat</span>
                  </div>
                  <span className="text-xs font-black text-indigo-800 bg-white px-2 py-0.5 rounded-md border border-indigo-200">
                    {periodSummary.tidurCepatTargetMetCount}x
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 font-medium">
                  Istirahat tepat waktu malam hari (≤ {TARGET_TIDUR_CEPAT} WIB)
                </p>
              </div>

              {/* Total Jurnal Final */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Lock className="w-4 h-4 text-slate-700" />
                    <span className="text-xs font-black text-brand-950">Jurnal Final</span>
                  </div>
                  <span className="text-xs font-black text-slate-800 bg-white px-2 py-0.5 rounded-md border border-slate-200">
                    {periodSummary.totalFinalCount}x
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 font-medium">
                  Hari dengan pengiriman final terkunci
                </p>
              </div>
            </div>
          </div>

          {/* Tabel Kronologi Pengisian Periode */}
          <div className="bg-white rounded-3xl border border-brand-100 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h4 className="text-sm font-black text-brand-950">
                  Rincian Catatan Jurnal pada {activeRekapRange.label}
                </h4>
                <p className="text-xs text-slate-400 font-medium">
                  Klik tombol pada baris tanggal untuk melihat atau mengedit checklist
                </p>
              </div>
              <span className="text-xs font-black text-brand-700 bg-brand-50 px-3 py-1 rounded-xl border border-brand-200">
                {periodRecords.length} Hari Terisi
              </span>
            </div>

            {isLoadingPeriodRekap ? (
              <div className="py-16 text-center text-slate-400 space-y-3">
                <div className="w-8 h-8 border-3 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-xs font-bold">Memuat rekap pengerjaan Anda...</p>
              </div>
            ) : periodRecords.length === 0 ? (
              <div className="py-16 text-center text-slate-400 space-y-2">
                <Calendar className="w-10 h-10 mx-auto text-slate-300" />
                <p className="text-xs font-bold text-slate-700">Belum ada catatan jurnal pada periode ini</p>
                <p className="text-[11px] text-slate-400">
                  Kembali ke tab Checklist Harian untuk mulai mencatat 7 kebiasaan Anda.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/75 border-b border-slate-100 text-[11px] font-black uppercase tracking-wider text-slate-500">
                      <th className="py-3.5 px-5">Tanggal</th>
                      <th className="py-3.5 px-4 text-center">Status</th>
                      <th className="py-3.5 px-4">Capaian 7 Kebiasaan</th>
                      <th className="py-3.5 px-4 text-center">Progres</th>
                      <th className="py-3.5 px-5 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {periodRecords.map((r) => {
                      const evals = evaluate7KaihHabits(r);
                      const doneCount = evals.filter((e) => e.status === "selesai").length;
                      const progress = r.progres_persen ?? calculate7KaihProgress(r);

                      return (
                        <tr key={r.tanggal} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-3.5 px-5 font-bold text-brand-950">
                            {parseDateSafe(r.tanggal).toLocaleDateString("id-ID", {
                              weekday: "long",
                              day: "numeric",
                              month: "short",
                              year: "numeric"
                            })}
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            {r.is_final ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 font-black text-[10px] border border-emerald-300">
                                <Lock className="w-2.5 h-2.5" /> Terkunci
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-cyan-50 text-cyan-800 font-black text-[10px] border border-cyan-200">
                                Draft
                              </span>
                            )}
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-1">
                              {evals.map((ev, i) => (
                                <div
                                  key={ev.id}
                                  title={`${i + 1}. ${ev.title}: ${ev.summary}`}
                                  className={`w-5 h-5 rounded-lg flex items-center justify-center text-[10px] font-black cursor-help ${
                                    ev.status === "selesai"
                                      ? "bg-emerald-500 text-white"
                                      : ev.status === "belum_dilakukan"
                                      ? "bg-amber-400 text-amber-950"
                                      : "bg-slate-200 text-slate-400"
                                  }`}
                                >
                                  {i + 1}
                                </div>
                              ))}
                              <span className="ml-2 text-[11px] font-bold text-slate-500">
                                ({doneCount}/7)
                              </span>
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-center font-black text-brand-950">
                            {progress}%
                          </td>
                          <td className="py-3.5 px-5 text-right">
                            <button
                              onClick={() => {
                                setSelectedDate(r.tanggal);
                                setMainTab("checklist");
                              }}
                              className="px-3 py-1.5 bg-brand-50 hover:bg-brand-100 text-brand-700 border border-brand-200 rounded-xl text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-1"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>Lihat Checklist</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
      <AnimatePresence>
        {showHistoryModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowHistoryModal(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-white rounded-3xl p-6 sm:p-8 max-w-2xl w-full max-h-[85vh] overflow-y-auto relative z-10 shadow-2xl border border-brand-100 space-y-5"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center">
                    <History className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-brand-950">Riwayat Pengisian Jurnal 7 KAIH</h3>
                    <p className="text-xs text-slate-500 font-medium">
                      Pilih tanggal untuk melihat detail capaian Anda
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowHistoryModal(false)}
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {historyList.length === 0 ? (
                <div className="py-12 text-center text-slate-400 space-y-2">
                  <Activity className="w-10 h-10 mx-auto text-slate-300" />
                  <p className="text-xs font-bold">Belum ada riwayat pengisian tersimpan.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {historyList.map((item) => {
                    const evalList = evaluate7KaihHabits(item);
                    const doneCount = evalList.filter((e) => e.status === "selesai").length;
                    return (
                      <div
                        key={item.tanggal}
                        onClick={() => {
                          setSelectedDate(item.tanggal);
                          setShowHistoryModal(false);
                        }}
                        className={`p-4 rounded-2xl border transition-all cursor-pointer hover:border-brand-500 hover:shadow-md ${
                          item.tanggal === selectedDate
                            ? "bg-brand-50/70 border-brand-300"
                            : "bg-slate-50 border-slate-200"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-brand-600" />
                            <span className="text-xs font-black text-brand-950">
                              {item.tanggal}
                            </span>
                            {item.is_final && (
                              <span className="text-[10px] bg-slate-800 text-white font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                                <Lock className="w-2.5 h-2.5" /> Terkunci
                              </span>
                            )}
                          </div>
                          <span className="text-xs font-black text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-xl border border-emerald-200">
                            {doneCount} / 7 ({item.progres_persen || calculate7KaihProgress(item)}%)
                          </span>
                        </div>

                        <div className="grid grid-cols-7 gap-1 mt-2">
                          {evalList.map((ev, i) => (
                            <div
                              key={ev.id}
                              title={`${i + 1}. ${ev.title}: ${ev.summary}`}
                              className={`h-2 rounded-full ${
                                ev.status === "selesai"
                                  ? "bg-emerald-500"
                                  : ev.status === "belum_dilakukan"
                                  ? "bg-amber-400"
                                  : "bg-slate-200"
                              }`}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal Detail Pengerjaan Murid */}
      <DetailPengerjaan7KaihModal
        isOpen={showDetailModal}
        onClose={() => setShowDetailModal(false)}
        student={currentStudent}
        initialDate={selectedDate}
        initialRecord={data}
        userRole={userSession.role}
        onUnlocked={() => {
          loadDataForDate(selectedDate);
          loadHistory();
        }}
      />
    </div>
  );
}
