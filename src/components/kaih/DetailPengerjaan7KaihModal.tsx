import React, { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  X,
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  BookOpen,
  Sun,
  Moon,
  Dumbbell,
  Utensils,
  HeartHandshake,
  History,
  Lock,
  Unlock,
  ChevronLeft,
  ChevronRight,
  Activity,
  Award,
  User,
  Printer,
  Check,
  Flame,
  FileCheck2,
  ExternalLink,
  Download
} from "lucide-react";
import { Siswa, TujuhKaih } from "../../types";
import {
  getTujuhKaihBySiswaAndDate,
  getTujuhKaihHistoryBySiswa,
  unlockFinal7Kaih
} from "../../dbStore";
import {
  evaluate7KaihHabits,
  calculate7KaihProgress,
  TARGET_BANGUN_PAGI,
  TARGET_TIDUR_CEPAT,
  getWeekRange,
  getMonthRange,
  exportRekapIndividuToExcel
} from "../../services/kaihService";
import { formatLocalDate, parseDateSafe } from "../../parseDateSafe";
import { toSentenceCase } from "../../formatName";

interface DetailPengerjaan7KaihModalProps {
  isOpen: boolean;
  onClose: () => void;
  student: Siswa | null;
  initialDate?: string;
  initialRecord?: TujuhKaih | null;
  userRole?: string;
  onUnlocked?: () => void;
}

export function formatIndonesianDate(dateStr: string): string {
  try {
    const d = parseDateSafe(dateStr);
    return d.toLocaleDateString("id-ID", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric"
    });
  } catch {
    return dateStr;
  }
}

export function formatTimeWib(isoStr?: string | null): string {
  if (!isoStr) return "-";
  try {
    const d = new Date(isoStr);
    const dateFormatted = d.toLocaleDateString("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric"
    });
    const timeFormatted = d.toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit"
    });
    return `${dateFormatted}, ${timeFormatted} WIB`;
  } catch {
    return isoStr;
  }
}

export default function DetailPengerjaan7KaihModal({
  isOpen,
  onClose,
  student,
  initialDate,
  initialRecord,
  userRole = "guru",
  onUnlocked
}: DetailPengerjaan7KaihModalProps) {
  const isAdmin = userRole === "super_admin";

  const [activeTab, setActiveTab] = useState<"detail" | "riwayat">("detail");
  const [selectedDate, setSelectedDate] = useState<string>(
    () => initialDate || formatLocalDate(new Date())
  );
  const [record, setRecord] = useState<TujuhKaih | null>(initialRecord || null);
  const [isLoadingRecord, setIsLoadingRecord] = useState(false);
  const [historyList, setHistoryList] = useState<TujuhKaih[]>([]);
  const [historyFilter, setHistoryFilter] = useState<"semua" | "minggu" | "bulan">("semua");
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [toastMsg, setToastMsg] = useState("");

  // Update selectedDate saat initialDate / modal dibuka
  useEffect(() => {
    if (isOpen) {
      const dateToUse = initialDate || formatLocalDate(new Date());
      setSelectedDate(dateToUse);
      setActiveTab("detail");
      if (initialRecord && initialRecord.tanggal === dateToUse) {
        setRecord(initialRecord);
      } else if (student) {
        fetchRecordForDate(student.id, dateToUse);
      }
      if (student) {
        fetchHistory(student.id);
      }
    }
  }, [isOpen, student?.id, initialDate, initialRecord]);

  // Muat record pengerjaan untuk tanggal terpilih
  const fetchRecordForDate = async (siswaId: string, dateStr: string) => {
    setIsLoadingRecord(true);
    try {
      const rec = await getTujuhKaihBySiswaAndDate(siswaId, dateStr);
      setRecord(rec);
    } catch (err) {
      console.error("Gagal memuat record 7 KAIH murid:", err);
      setRecord(null);
    } finally {
      setIsLoadingRecord(false);
    }
  };

  // Muat riwayat pengisian 30 hari terakhir
  const fetchHistory = async (siswaId: string) => {
    setIsLoadingHistory(true);
    try {
      const hist = await getTujuhKaihHistoryBySiswa(siswaId, 30);
      setHistoryList(hist || []);
    } catch (err) {
      console.error("Gagal memuat riwayat 7 KAIH murid:", err);
      setHistoryList([]);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  // Navigasi tanggal (+1 hari / -1 hari)
  const handleShiftDate = (days: number) => {
    if (!student) return;
    const current = parseDateSafe(selectedDate);
    current.setDate(current.getDate() + days);
    const newDateStr = formatLocalDate(current);
    setSelectedDate(newDateStr);
    fetchRecordForDate(student.id, newDateStr);
  };

  // Ubah tanggal via picker
  const handleDateChange = (newDateStr: string) => {
    if (!student || !newDateStr) return;
    setSelectedDate(newDateStr);
    fetchRecordForDate(student.id, newDateStr);
  };

  // Buka kunci (Admin Only)
  const handleUnlockRecord = async () => {
    if (!student || !record) return;
    const confirmUnlock = window.confirm(
      `Buka kunci checklist 7 KAIH untuk murid ${student.nama} pada tanggal ${record.tanggal}? Murid akan dapat mengedit kembali checklist hari ini.`
    );
    if (!confirmUnlock) return;

    setIsUnlocking(true);
    try {
      const res = await unlockFinal7Kaih(student.id, record.tanggal);
      if (res.success) {
        setRecord((prev) =>
          prev ? { ...prev, is_final: false, waktu_kirim_final: null } : null
        );
        setToastMsg("Checklist berhasil dibuka kuncinya! Murid dapat mengedit kembali.");
        setTimeout(() => setToastMsg(""), 3500);
        if (onUnlocked) onUnlocked();
        fetchHistory(student.id);
      } else {
        alert("Gagal membuka kunci: " + res.error);
      }
    } catch (err: any) {
      alert("Terjadi kesalahan: " + err.message);
    } finally {
      setIsUnlocking(false);
    }
  };

  // Cetak dokumen rincian
  const handlePrint = () => {
    window.print();
  };

  // Evaluasi 7 Kebiasaan pada record aktif
  const evaluations = useMemo(() => {
    if (!record) return [];
    return evaluate7KaihHabits(record);
  }, [record]);

  const progressPercent = useMemo(() => {
    if (!record) return 0;
    return record.progres_persen ?? calculate7KaihProgress(record);
  }, [record]);

  const completedCount = useMemo(() => {
    return evaluations.filter((e) => e.status === "selesai").length;
  }, [evaluations]);

  // Filter Riwayat berdasarkan Periode
  const filteredHistoryRecords = useMemo(() => {
    if (historyFilter === "semua") return historyList;
    const nowD = new Date();
    if (historyFilter === "minggu") {
      const { startDate, endDate } = getWeekRange(formatLocalDate(nowD));
      return historyList.filter((r) => r.tanggal >= startDate && r.tanggal <= endDate);
    } else {
      const { startDate, endDate } = getMonthRange(nowD.getFullYear(), nowD.getMonth() + 1);
      return historyList.filter((r) => r.tanggal >= startDate && r.tanggal <= endDate);
    }
  }, [historyList, historyFilter]);

  // Statistik akumulasi periode murid
  const statsHistory = useMemo(() => {
    const totalHari = filteredHistoryRecords.length;
    if (totalHari === 0) return { totalHari: 0, avgProgress: 0, totalFinal: 0 };
    const sumProgress = filteredHistoryRecords.reduce(
      (acc, curr) => acc + (curr.progres_persen ?? calculate7KaihProgress(curr)),
      0
    );
    const avgProgress = Math.round(sumProgress / totalHari);
    const totalFinal = filteredHistoryRecords.filter((h) => h.is_final).length;
    return { totalHari, avgProgress, totalFinal };
  }, [filteredHistoryRecords]);

  if (!isOpen || !student) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 print:p-0 print:static print:z-auto">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm print:hidden"
          onClick={onClose}
        />

        {/* Modal Window */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.2 }}
          className="bg-white rounded-3xl p-5 sm:p-7 max-w-4xl w-full max-h-[92vh] overflow-y-auto relative z-10 shadow-2xl border border-brand-100 space-y-6 print:shadow-none print:border-none print:max-h-none print:p-0"
        >
          {/* Toast Notification */}
          <AnimatePresence>
            {toastMsg && (
              <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="fixed top-6 right-6 z-50 px-4 py-2.5 rounded-2xl shadow-xl flex items-center gap-2.5 text-xs font-bold text-white bg-emerald-600 print:hidden"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{toastMsg}</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ======================================================== */}
          {/* MODAL HEADER: Profil Murid & Navigasi Tanggal            */}
          {/* ======================================================== */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-100">
            <div className="flex items-center gap-3.5">
              {student.foto_url ? (
                <img
                  src={student.foto_url}
                  alt={student.nama}
                  className="w-13 h-13 rounded-2xl object-cover border-2 border-brand-200 shadow-sm"
                />
              ) : (
                <div className="w-13 h-13 rounded-2xl bg-gradient-to-tr from-brand-600 to-indigo-600 text-white flex items-center justify-center font-black text-base shadow-sm">
                  {student.nama.slice(0, 2).toUpperCase()}
                </div>
              )}
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-black text-brand-950">
                    {toSentenceCase(student.nama)}
                  </h3>
                  <span className="px-2.5 py-0.5 rounded-full bg-brand-50 text-brand-700 border border-brand-200 text-[11px] font-black">
                    {student.kelas}
                  </span>
                </div>
                <p className="text-xs text-slate-500 font-bold mt-0.5">
                  NIS: <span className="text-slate-700 font-mono">{student.nis}</span> • Detail Pengerjaan Jurnal 7 KAIH
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-auto print:hidden">
              <button
                onClick={handlePrint}
                title="Cetak Ringkasan Jurnal"
                className="p-2 text-slate-500 hover:text-brand-700 hover:bg-brand-50 rounded-xl transition-all cursor-pointer border border-slate-200"
              >
                <Printer className="w-4 h-4" />
              </button>
              <button
                onClick={onClose}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all cursor-pointer border border-transparent"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* ======================================================== */}
          {/* TAB SWITCHER & DATE CONTROL                              */}
          {/* ======================================================== */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 p-2.5 rounded-2xl border border-slate-200 print:hidden">
            {/* Tabs */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setActiveTab("detail")}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeTab === "detail"
                    ? "bg-brand-600 text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-200/70"
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                Rincian 7 Kebiasaan
              </button>
              <button
                onClick={() => setActiveTab("riwayat")}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeTab === "riwayat"
                    ? "bg-brand-600 text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-200/70"
                }`}
              >
                <History className="w-3.5 h-3.5" />
                Riwayat Pengisian ({historyList.length})
              </button>
            </div>

            {/* Date Navigator (Hanya aktif di Tab Detail) */}
            {activeTab === "detail" && (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => handleShiftDate(-1)}
                  title="Hari Sebelumnya"
                  className="p-1.5 bg-white hover:bg-slate-100 text-slate-700 rounded-xl border border-slate-200 transition-all cursor-pointer shadow-2xs"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <div className="relative flex items-center bg-white px-2.5 py-1 rounded-xl border border-slate-200 shadow-2xs">
                  <Calendar className="w-3.5 h-3.5 text-brand-600 mr-2 shrink-0" />
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => handleDateChange(e.target.value)}
                    className="text-xs font-bold text-slate-800 bg-transparent outline-none cursor-pointer"
                  />
                </div>
                <button
                  onClick={() => handleShiftDate(1)}
                  title="Hari Berikutnya"
                  className="p-1.5 bg-white hover:bg-slate-100 text-slate-700 rounded-xl border border-slate-200 transition-all cursor-pointer shadow-2xs"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {/* ======================================================== */}
          {/* TAB 1: RINCIAN 7 KEBIASAAN HARI TERPILIH                */}
          {/* ======================================================== */}
          {activeTab === "detail" && (
            <div className="space-y-5">
              {/* Header Status & Tanggal Informasi */}
              <div className="bg-gradient-to-r from-slate-900 via-brand-950 to-indigo-950 text-white rounded-3xl p-5 shadow-sm space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <span className="text-[11px] font-black uppercase tracking-wider text-brand-300">
                      Tanggal Jurnal
                    </span>
                    <h4 className="text-base font-black flex items-center gap-2 mt-0.5">
                      <Calendar className="w-4 h-4 text-amber-300" />
                      {formatIndonesianDate(selectedDate)}
                    </h4>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    {record ? (
                      record.is_final ? (
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 text-xs font-black">
                            <Lock className="w-3.5 h-3.5 text-emerald-400" />
                            Terkirim Final
                          </span>
                          {isAdmin && (
                            <button
                              onClick={handleUnlockRecord}
                              disabled={isUnlocking}
                              className="px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-400/40 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 print:hidden"
                            >
                              <Unlock className="w-3.5 h-3.5" />
                              {isUnlocking ? "Membuka..." : "Buka Kunci"}
                            </button>
                          )}
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-400/30 text-xs font-black">
                          <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400" />
                          Draft (Auto-saved)
                        </span>
                      )
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-400/30 text-xs font-black">
                        <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                        Belum Mengisi Hari Ini
                      </span>
                    )}
                  </div>
                </div>

                {/* Progress bar */}
                <div className="pt-2 border-t border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-300">
                    <Activity className="w-4 h-4 text-amber-300" />
                    <span>Capaian Kebiasaan:</span>
                    <span className="text-white font-black">
                      {completedCount} dari 7 Kebiasaan ({progressPercent}%)
                    </span>
                  </div>

                  {record?.waktu_kirim_final && (
                    <span className="text-[11px] text-slate-400 font-medium">
                      Dikirim: {formatTimeWib(record.waktu_kirim_final)}
                    </span>
                  )}
                </div>

                <div className="w-full bg-black/40 rounded-full h-2.5 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      progressPercent >= 70
                        ? "bg-emerald-400"
                        : progressPercent >= 40
                        ? "bg-amber-400"
                        : "bg-rose-400"
                    }`}
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>

              {/* Konten 7 Kebiasaan */}
              {isLoadingRecord ? (
                <div className="py-16 text-center text-slate-400 space-y-3">
                  <div className="w-8 h-8 border-3 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto" />
                  <p className="text-xs font-bold">Memuat rincian jurnal tanggal {selectedDate}...</p>
                </div>
              ) : !record ? (
                <div className="p-8 text-center bg-slate-50 rounded-3xl border border-dashed border-slate-200 space-y-3">
                  <AlertCircle className="w-10 h-10 text-slate-300 mx-auto" />
                  <div className="space-y-1">
                    <h5 className="text-sm font-black text-slate-700">
                      Belum Ada Catatan Jurnal 7 KAIH pada {formatIndonesianDate(selectedDate)}
                    </h5>
                    <p className="text-xs text-slate-500 max-w-md mx-auto font-medium">
                      Murid belum mengisi checklist 7 Kebiasaan pada tanggal ini. Anda dapat memeriksa riwayat pengerjaan di tab sebelah atau memilih tanggal lain.
                    </p>
                  </div>
                  {historyList.length > 0 && (
                    <button
                      onClick={() => setActiveTab("riwayat")}
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm"
                    >
                      <History className="w-3.5 h-3.5" />
                      Lihat {historyList.length} Riwayat Tersimpan
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  {/* 1. BANGUN PAGI */}
                  <div className="p-4 sm:p-5 rounded-2xl border border-slate-200 bg-white hover:border-amber-300 transition-all shadow-2xs space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-200 shrink-0">
                          <Sun className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-black uppercase tracking-wider text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                              Kebiasaan 1
                            </span>
                            <h5 className="text-sm font-black text-brand-950">Bangun Pagi</h5>
                          </div>
                          <p className="text-xs text-slate-500 font-medium mt-0.5">
                            Target: Bangun pagi sebelum Subuh / fajar (≤ {TARGET_BANGUN_PAGI} WIB)
                          </p>
                        </div>
                      </div>

                      <span
                        className={`text-[11px] font-black px-2.5 py-1 rounded-full border shrink-0 ${
                          record.bangun_pagi_waktu
                            ? record.bangun_pagi_target_sesuai
                              ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                              : "bg-amber-50 text-amber-800 border-amber-300"
                            : "bg-slate-100 text-slate-500 border-slate-200"
                        }`}
                      >
                        {record.bangun_pagi_waktu
                          ? record.bangun_pagi_target_sesuai
                            ? "Target Sesuai ⭐"
                            : "Melewati Target"
                          : "Belum Dicatat"}
                      </span>
                    </div>

                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between text-xs">
                      <span className="text-slate-600 font-semibold flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        Waktu Bangun Tidur:
                      </span>
                      <span className="font-black text-brand-950 text-sm">
                        {record.bangun_pagi_waktu ? `${record.bangun_pagi_waktu} WIB` : "-"}
                      </span>
                    </div>
                  </div>

                  {/* 2. BERIBADAH */}
                  <div className="p-4 sm:p-5 rounded-2xl border border-slate-200 bg-white hover:border-emerald-300 transition-all shadow-2xs space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-200 shrink-0">
                          <Sparkles className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                              Kebiasaan 2
                            </span>
                            <h5 className="text-sm font-black text-brand-950">Beribadah</h5>
                          </div>
                          <p className="text-xs text-slate-500 font-medium mt-0.5">
                            Salat 5 waktu berjamaah/tepat waktu dan amalan tilawah / tadarus Al-Qur'an
                          </p>
                        </div>
                      </div>

                      <span
                        className={`text-[11px] font-black px-2.5 py-1 rounded-full border shrink-0 ${
                          evaluations.find((e) => e.id === "beribadah")?.status === "selesai"
                            ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                            : "bg-slate-100 text-slate-500 border-slate-200"
                        }`}
                      >
                        {evaluations.find((e) => e.id === "beribadah")?.status === "selesai"
                          ? "Tercapai"
                          : "Belum Lengkap"}
                      </span>
                    </div>

                    {/* Salat 5 Waktu Grid */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-700">Checklist Salat 5 Waktu:</span>
                        <span className="text-emerald-700 font-black">
                          {[
                            record.salat_subuh,
                            record.salat_zuhur,
                            record.salat_asar,
                            record.salat_magrib,
                            record.salat_isya
                          ].filter(Boolean).length}{" "}
                          / 5 Waktu Selesai
                        </span>
                      </div>
                      <div className="grid grid-cols-5 gap-2 text-center">
                        {[
                          { label: "Subuh", done: record.salat_subuh },
                          { label: "Zuhur", done: record.salat_zuhur },
                          { label: "Asar", done: record.salat_asar },
                          { label: "Magrib", done: record.salat_magrib },
                          { label: "Isya", done: record.salat_isya }
                        ].map((salat) => (
                          <div
                            key={salat.label}
                            className={`p-2.5 rounded-xl border flex flex-col items-center justify-center gap-1 transition-all ${
                              salat.done
                                ? "bg-emerald-50 border-emerald-300 text-emerald-900"
                                : "bg-slate-50 border-slate-200 text-slate-400"
                            }`}
                          >
                            <span className="text-[11px] font-black">{salat.label}</span>
                            {salat.done ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                            ) : (
                              <X className="w-4 h-4 text-slate-300" />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Pendukung: Mengaji / Tadarus */}
                    <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-700 flex items-center gap-1.5">
                          <BookOpen className="w-3.5 h-3.5 text-brand-600" />
                          Amalan Pendukung: Mengaji / Tadarus
                        </span>
                        <span
                          className={`font-black px-2 py-0.5 rounded-md text-[10px] uppercase ${
                            record.mengaji_status === "sudah"
                              ? "bg-emerald-100 text-emerald-800"
                              : record.mengaji_status === "belum"
                              ? "bg-amber-100 text-amber-800"
                              : "bg-slate-200 text-slate-600"
                          }`}
                        >
                          {record.mengaji_status === "sudah"
                            ? "Sudah Tadarus"
                            : record.mengaji_status === "belum"
                            ? "Belum Dilakukan"
                            : "Belum Diisi"}
                        </span>
                      </div>

                      {record.mengaji_status === "sudah" ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-700 pt-1 border-t border-slate-200">
                          <div>
                            <span className="text-[11px] text-slate-500 font-semibold block">Surah:</span>
                            <span className="font-bold text-brand-950">
                              {record.mengaji_surah || "-"}
                            </span>
                          </div>
                          <div>
                            <span className="text-[11px] text-slate-500 font-semibold block">Ayat:</span>
                            <span className="font-bold text-brand-950">
                              {record.mengaji_ayat_awal && record.mengaji_ayat_akhir
                                ? `Ayat ${record.mengaji_ayat_awal} s/d ${record.mengaji_ayat_akhir}`
                                : record.mengaji_ayat_awal
                                ? `Ayat ${record.mengaji_ayat_awal}`
                                : "-"}
                            </span>
                          </div>
                          {record.mengaji_catatan && (
                            <div className="sm:col-span-2 pt-1 text-[11px] text-slate-600 italic">
                              Catatan: "{record.mengaji_catatan}"
                            </div>
                          )}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  {/* 3. BEROLAHRAGA */}
                  <div className="p-4 sm:p-5 rounded-2xl border border-slate-200 bg-white hover:border-blue-300 transition-all shadow-2xs space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-200 shrink-0">
                          <Dumbbell className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-black uppercase tracking-wider text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">
                              Kebiasaan 3
                            </span>
                            <h5 className="text-sm font-black text-brand-950">Berolahraga</h5>
                          </div>
                          <p className="text-xs text-slate-500 font-medium mt-0.5">
                            Menjaga kebugaran jasmani minimal 15-30 menit setiap hari
                          </p>
                        </div>
                      </div>

                      <span
                        className={`text-[11px] font-black px-2.5 py-1 rounded-full border shrink-0 ${
                          record.olahraga_status === "sudah"
                            ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                            : record.olahraga_status === "belum"
                            ? "bg-amber-50 text-amber-800 border-amber-300"
                            : "bg-slate-100 text-slate-500 border-slate-200"
                        }`}
                      >
                        {record.olahraga_status === "sudah"
                          ? "Sudah Berolahraga"
                          : record.olahraga_status === "belum"
                          ? "Belum Dilakukan"
                          : "Belum Diisi"}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 bg-slate-50 rounded-xl border border-slate-100 text-xs">
                      <div>
                        <span className="text-slate-500 font-semibold block text-[11px]">Jenis Olahraga:</span>
                        <span className="font-bold text-brand-950 text-sm">
                          {record.olahraga_jenis || (record.olahraga_status === "sudah" ? "Olahraga Fisik" : "-")}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 font-semibold block text-[11px]">Durasi Latihan:</span>
                        <span className="font-bold text-brand-950 text-sm">
                          {record.olahraga_durasi_menit ? `${record.olahraga_durasi_menit} Menit` : "-"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 4. MAKAN SEHAT DAN BERGIZI */}
                  <div className="p-4 sm:p-5 rounded-2xl border border-slate-200 bg-white hover:border-teal-300 transition-all shadow-2xs space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center border border-teal-200 shrink-0">
                          <Utensils className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-black uppercase tracking-wider text-teal-700 bg-teal-50 px-2 py-0.5 rounded-md border border-teal-200">
                              Kebiasaan 4
                            </span>
                            <h5 className="text-sm font-black text-brand-950">Makan Sehat dan Bergizi</h5>
                          </div>
                          <p className="text-xs text-slate-500 font-medium mt-0.5">
                            Pola makan teratur (Sarapan, Siang, Malam) dengan menu gizi seimbang
                          </p>
                        </div>
                      </div>

                      <span
                        className={`text-[11px] font-black px-2.5 py-1 rounded-full border shrink-0 ${
                          evaluations.find((e) => e.id === "makan_sehat")?.status === "selesai"
                            ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                            : "bg-slate-100 text-slate-500 border-slate-200"
                        }`}
                      >
                        {evaluations.find((e) => e.id === "makan_sehat")?.status === "selesai"
                          ? "Tercapai"
                          : "Belum Lengkap"}
                      </span>
                    </div>

                    {/* Grid 3 Waktu Makan */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                      {/* Sarapan */}
                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-black text-slate-800">1. Sarapan Pagi</span>
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                              record.sarapan_status === "sudah"
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-slate-200 text-slate-600"
                            }`}
                          >
                            {record.sarapan_status === "sudah" ? "Sudah" : "Belum"}
                          </span>
                        </div>
                        <p className="text-slate-600 font-medium text-[11px] min-h-[32px] line-clamp-2">
                          {record.sarapan_menu ? `Menu: ${record.sarapan_menu}` : "Tidak mencantumkan menu"}
                        </p>
                        {record.sarapan_bergizi && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-teal-800 bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
                            <Check className="w-3 h-3" /> Gizi Seimbang
                          </span>
                        )}
                      </div>

                      {/* Makan Siang */}
                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-black text-slate-800">2. Makan Siang</span>
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                              record.makan_siang_status === "sudah"
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-slate-200 text-slate-600"
                            }`}
                          >
                            {record.makan_siang_status === "sudah" ? "Sudah" : "Belum"}
                          </span>
                        </div>
                        <p className="text-slate-600 font-medium text-[11px] min-h-[32px] line-clamp-2">
                          {record.makan_siang_menu ? `Menu: ${record.makan_siang_menu}` : "Tidak mencantumkan menu"}
                        </p>
                        {record.makan_siang_bergizi && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-teal-800 bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
                            <Check className="w-3 h-3" /> Gizi Seimbang
                          </span>
                        )}
                      </div>

                      {/* Makan Malam */}
                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-black text-slate-800">3. Makan Malam</span>
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                              record.makan_malam_status === "sudah"
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-slate-200 text-slate-600"
                            }`}
                          >
                            {record.makan_malam_status === "sudah" ? "Sudah" : "Belum"}
                          </span>
                        </div>
                        <p className="text-slate-600 font-medium text-[11px] min-h-[32px] line-clamp-2">
                          {record.makan_malam_menu ? `Menu: ${record.makan_malam_menu}` : "Tidak mencantumkan menu"}
                        </p>
                        {record.makan_malam_bergizi && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-teal-800 bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
                            <Check className="w-3 h-3" /> Gizi Seimbang
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 5. GEMAR BELAJAR */}
                  <div className="p-4 sm:p-5 rounded-2xl border border-slate-200 bg-white hover:border-violet-300 transition-all shadow-2xs space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center border border-violet-200 shrink-0">
                          <BookOpen className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-black uppercase tracking-wider text-violet-700 bg-violet-50 px-2 py-0.5 rounded-md border border-violet-200">
                              Kebiasaan 5
                            </span>
                            <h5 className="text-sm font-black text-brand-950">Gemar Belajar</h5>
                          </div>
                          <p className="text-xs text-slate-500 font-medium mt-0.5">
                            Belajar mandiri, mengulang pelajaran sekolah, atau membaca buku
                          </p>
                        </div>
                      </div>

                      <span
                        className={`text-[11px] font-black px-2.5 py-1 rounded-full border shrink-0 ${
                          record.belajar_total_durasi > 0 || (record.belajar_kegiatan && record.belajar_kegiatan.length > 0)
                            ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                            : "bg-slate-100 text-slate-500 border-slate-200"
                        }`}
                      >
                        {record.belajar_total_durasi > 0
                          ? `${record.belajar_total_durasi} Menit Belajar`
                          : "Belum Belajar"}
                      </span>
                    </div>

                    <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-700">Daftar Kegiatan Belajar Mandiri:</span>
                        <span className="text-brand-950 font-black">
                          {Array.isArray(record.belajar_kegiatan) ? record.belajar_kegiatan.length : 0} Aktivitas
                        </span>
                      </div>

                      {Array.isArray(record.belajar_kegiatan) && record.belajar_kegiatan.length > 0 ? (
                        <div className="divide-y divide-slate-200 pt-1">
                          {record.belajar_kegiatan.map((bk, idx) => (
                            <div key={bk.id || idx} className="py-2 flex items-center justify-between gap-3">
                              <span className="font-medium text-slate-800">
                                {idx + 1}. {bk.kegiatan}
                              </span>
                              <span className="px-2 py-0.5 rounded-md bg-white border border-slate-200 font-bold text-violet-700 text-[11px] shrink-0">
                                {bk.durasi_menit} menit
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-slate-400 italic text-[11px] py-1">
                          Tidak ada rincian kegiatan belajar yang dimasukkan.
                        </p>
                      )}
                    </div>
                  </div>

                  {/* 6. BERMASYARAKAT */}
                  <div className="p-4 sm:p-5 rounded-2xl border border-slate-200 bg-white hover:border-pink-300 transition-all shadow-2xs space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-pink-50 text-pink-600 flex items-center justify-center border border-pink-200 shrink-0">
                          <HeartHandshake className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-black uppercase tracking-wider text-pink-700 bg-pink-50 px-2 py-0.5 rounded-md border border-pink-200">
                              Kebiasaan 6
                            </span>
                            <h5 className="text-sm font-black text-brand-950">Bermasyarakat</h5>
                          </div>
                          <p className="text-xs text-slate-500 font-medium mt-0.5">
                            Kepedulian sosial, gotong royong, membantu tetangga, atau kegiatan lingkungan
                          </p>
                        </div>
                      </div>

                      <span
                        className={`text-[11px] font-black px-2.5 py-1 rounded-full border shrink-0 ${
                          record.bermasyarakat_status === "sudah"
                            ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                            : record.bermasyarakat_status === "belum"
                            ? "bg-amber-50 text-amber-800 border-amber-300"
                            : "bg-slate-100 text-slate-500 border-slate-200"
                        }`}
                      >
                        {record.bermasyarakat_status === "sudah"
                          ? "Sudah Bermasyarakat"
                          : record.bermasyarakat_status === "belum"
                          ? "Belum Dilakukan"
                          : "Belum Diisi"}
                      </span>
                    </div>

                    <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100 text-xs space-y-1">
                      <span className="text-slate-500 font-semibold block text-[11px]">
                        Rincian Kegiatan Sosial / Partisipasi Masyarakat:
                      </span>
                      <p className="font-bold text-brand-950 text-xs">
                        {record.bermasyarakat_kegiatan?.trim()
                          ? record.bermasyarakat_kegiatan
                          : record.bermasyarakat_status === "sudah"
                          ? "Kegiatan sosial / gotong royong"
                          : "-"}
                      </p>
                    </div>
                  </div>

                  {/* 7. TIDUR CEPAT */}
                  <div className="p-4 sm:p-5 rounded-2xl border border-slate-200 bg-white hover:border-indigo-300 transition-all shadow-2xs space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-200 shrink-0">
                          <Moon className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-black uppercase tracking-wider text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-200">
                              Kebiasaan 7
                            </span>
                            <h5 className="text-sm font-black text-brand-950">Tidur Cepat</h5>
                          </div>
                          <p className="text-xs text-slate-500 font-medium mt-0.5">
                            Target: Istirahat malam tepat waktu, tidak begadang (≤ {TARGET_TIDUR_CEPAT} WIB)
                          </p>
                        </div>
                      </div>

                      <span
                        className={`text-[11px] font-black px-2.5 py-1 rounded-full border shrink-0 ${
                          record.tidur_cepat_waktu
                            ? record.tidur_cepat_target_sesuai
                              ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                              : "bg-amber-50 text-amber-800 border-amber-300"
                            : "bg-slate-100 text-slate-500 border-slate-200"
                        }`}
                      >
                        {record.tidur_cepat_waktu
                          ? record.tidur_cepat_target_sesuai
                            ? "Target Sesuai ⭐"
                            : "Larut Malam"
                          : "Belum Dicatat"}
                      </span>
                    </div>

                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between text-xs">
                      <span className="text-slate-600 font-semibold flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        Waktu Tidur Malam:
                      </span>
                      <span className="font-black text-brand-950 text-sm">
                        {record.tidur_cepat_waktu ? `${record.tidur_cepat_waktu} WIB` : "-"}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ======================================================== */}
          {/* TAB 2: RIWAYAT & REKAP PENGERJAAN MURID                  */}
          {/* ======================================================== */}
          {activeTab === "riwayat" && (
            <div className="space-y-5">
              {/* Filter Sub-Periode & Tombol Export Excel */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-200">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-black text-slate-500 uppercase mr-1">Filter:</span>
                  <button
                    onClick={() => setHistoryFilter("semua")}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      historyFilter === "semua"
                        ? "bg-brand-600 text-white shadow-2xs"
                        : "bg-white text-slate-600 hover:bg-slate-200 border border-slate-200"
                    }`}
                  >
                    Semua (30 Hari)
                  </button>
                  <button
                    onClick={() => setHistoryFilter("minggu")}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      historyFilter === "minggu"
                        ? "bg-brand-600 text-white shadow-2xs"
                        : "bg-white text-slate-600 hover:bg-slate-200 border border-slate-200"
                    }`}
                  >
                    Minggu Ini
                  </button>
                  <button
                    onClick={() => setHistoryFilter("bulan")}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      historyFilter === "bulan"
                        ? "bg-brand-600 text-white shadow-2xs"
                        : "bg-white text-slate-600 hover:bg-slate-200 border border-slate-200"
                    }`}
                  >
                    Bulan Ini
                  </button>
                </div>

                <button
                  onClick={() =>
                    exportRekapIndividuToExcel(
                      student,
                      filteredHistoryRecords,
                      historyFilter === "minggu"
                        ? "Minggu Ini"
                        : historyFilter === "bulan"
                        ? "Bulan Ini"
                        : "30 Hari Terakhir"
                    )
                  }
                  className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs self-start sm:self-auto shrink-0"
                  title="Unduh laporan rekap murid ini ke file Excel (.xlsx)"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export Rekap Excel</span>
                </button>
              </div>

              {/* Summary KPI Murid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
                  <span className="text-[11px] font-bold text-slate-500 uppercase">Hari Aktif Mengisi</span>
                  <h4 className="text-xl font-black text-brand-950 mt-1">
                    {statsHistory.totalHari} <span className="text-xs font-bold text-slate-400">Hari</span>
                  </h4>
                </div>
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
                  <span className="text-[11px] font-bold text-slate-500 uppercase">Rata-rata Capaian</span>
                  <h4 className="text-xl font-black text-emerald-600 mt-1">
                    {statsHistory.avgProgress}%
                  </h4>
                </div>
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
                  <span className="text-[11px] font-bold text-slate-500 uppercase">Jurnal Final Terkunci</span>
                  <h4 className="text-xl font-black text-indigo-600 mt-1">
                    {statsHistory.totalFinal} <span className="text-xs font-bold text-slate-400">Hari</span>
                  </h4>
                </div>
              </div>

              {/* History Items */}
              {isLoadingHistory ? (
                <div className="py-16 text-center text-slate-400 space-y-3">
                  <div className="w-8 h-8 border-3 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto" />
                  <p className="text-xs font-bold">Memuat riwayat pengerjaan murid...</p>
                </div>
              ) : filteredHistoryRecords.length === 0 ? (
                <div className="p-12 text-center bg-slate-50 rounded-3xl border border-dashed border-slate-200 space-y-2">
                  <History className="w-10 h-10 text-slate-300 mx-auto" />
                  <h5 className="text-sm font-black text-slate-700">Belum Ada Riwayat Jurnal pada Filter Ini</h5>
                  <p className="text-xs text-slate-500">
                    Tidak ditemukan catatan pengerjaan pada filter periode yang dipilih.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredHistoryRecords.map((item) => {
                    const itemEvals = evaluate7KaihHabits(item);
                    const itemCompleted = itemEvals.filter((e) => e.status === "selesai").length;
                    const itemProgress = item.progres_persen ?? calculate7KaihProgress(item);
                    const isSelected = item.tanggal === selectedDate;

                    return (
                      <div
                        key={item.tanggal}
                        className={`p-4 rounded-2xl border transition-all ${
                          isSelected
                            ? "bg-brand-50/70 border-brand-400 shadow-sm"
                            : "bg-white border-slate-200 hover:border-slate-300"
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-slate-100 text-brand-700 flex items-center justify-center font-black text-xs shrink-0">
                              <Calendar className="w-4 h-4" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <h5 className="text-xs font-black text-brand-950">
                                  {formatIndonesianDate(item.tanggal)}
                                </h5>
                                {item.is_final ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 font-black text-[10px] border border-emerald-200">
                                    <Lock className="w-2.5 h-2.5" /> Terkunci
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-cyan-50 text-cyan-800 font-black text-[10px] border border-cyan-200">
                                    Draft
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-slate-500 font-bold mt-0.5">
                                Capaian: {itemCompleted}/7 Kebiasaan ({itemProgress}%)
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 self-end sm:self-auto">
                            {/* Visual mini dots 7 kebiasaan */}
                            <div className="flex items-center gap-1">
                              {itemEvals.map((ev, i) => (
                                <div
                                  key={ev.id}
                                  title={`${i + 1}. ${ev.title}: ${ev.summary}`}
                                  className={`w-4 h-4 rounded-md flex items-center justify-center text-[9px] font-black cursor-help ${
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
                            </div>

                            <button
                              onClick={() => {
                                setSelectedDate(item.tanggal);
                                setRecord(item);
                                setActiveTab("detail");
                              }}
                              className="px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1 shadow-2xs"
                            >
                              Lihat Rincian
                              <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

