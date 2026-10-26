import React, { useState, useEffect, useMemo } from "react";
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
  Save,
  Check,
  X,
  History,
  Info,
  Award,
  Zap,
  Activity
} from "lucide-react";
import { UserSession, TujuhKaih, BelajarItem, HabitStatus } from "../../types";
import {
  getTujuhKaihBySiswaAndDate,
  saveTujuhKaih,
  getTujuhKaihHistoryBySiswa
} from "../../dbStore";
import {
  createDefault7Kaih,
  getCurrentDeviceTime,
  evaluate7KaihHabits,
  calculate7KaihProgress,
  TARGET_BANGUN_PAGI,
  TARGET_TIDUR_CEPAT
} from "../../services/kaihService";
import { formatLocalDate, parseDateSafe } from "../../parseDateSafe";
import { toSentenceCase } from "../../formatName";

interface Checklist7KaihViewProps {
  userSession: UserSession;
  siswaId?: string;
}

export default function Checklist7KaihView({ userSession, siswaId: propSiswaId }: Checklist7KaihViewProps) {
  // Tentukan siswaId (dari prop atau dari session)
  const currentSiswaId = propSiswaId || userSession.id;

  const [selectedDate, setSelectedDate] = useState<string>(() => formatLocalDate(new Date()));
  const [data, setData] = useState<TujuhKaih>(() => createDefault7Kaih(currentSiswaId, formatLocalDate(new Date())));
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [toastMsg, setToastMsg] = useState("");
  const [historyList, setHistoryList] = useState<TujuhKaih[]>([]);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [activeMakanTab, setActiveMakanTab] = useState<"sarapan" | "siang" | "malam">("sarapan");

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

  // Muat riwayat pengisian
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

  // Navigasi Tanggal
  const handlePrevDay = () => {
    const cur = parseDateSafe(selectedDate);
    cur.setDate(cur.getDate() - 1);
    setSelectedDate(formatLocalDate(cur));
  };

  const handleNextDay = () => {
    const cur = parseDateSafe(selectedDate);
    cur.setDate(cur.getDate() + 1);
    setSelectedDate(formatLocalDate(cur));
  };

  const handleSetToday = () => {
    setSelectedDate(formatLocalDate(new Date()));
  };

  // Handler Pengisian Waktu Jam Perangkat
  const handleUseCurrentTime = (field: "bangun_pagi_waktu" | "tidur_cepat_waktu") => {
    const nowTime = getCurrentDeviceTime();
    setData((prev) => ({
      ...prev,
      [field]: nowTime
    }));
  };

  // Handler Kegiatan Belajar Dinamis
  const handleAddBelajar = () => {
    const newItem: BelajarItem = {
      id: Date.now().toString(),
      kegiatan: "",
      durasi_menit: 30
    };
    const updated = [...(data.belajar_kegiatan || []), newItem];
    const total = updated.reduce((acc, curr) => acc + (Number(curr.durasi_menit) || 0), 0);
    setData((prev) => ({
      ...prev,
      belajar_kegiatan: updated,
      belajar_total_durasi: total
    }));
  };

  const handleUpdateBelajar = (id: string, key: "kegiatan" | "durasi_menit", value: any) => {
    const updated = (data.belajar_kegiatan || []).map((item) => {
      if (item.id === id) {
        return {
          ...item,
          [key]: key === "durasi_menit" ? Math.max(0, parseInt(value) || 0) : value
        };
      }
      return item;
    });
    const total = updated.reduce((acc, curr) => acc + (Number(curr.durasi_menit) || 0), 0);
    setData((prev) => ({
      ...prev,
      belajar_kegiatan: updated,
      belajar_total_durasi: total
    }));
  };

  const handleRemoveBelajar = (id: string) => {
    const updated = (data.belajar_kegiatan || []).filter((item) => item.id !== id);
    const total = updated.reduce((acc, curr) => acc + (Number(curr.durasi_menit) || 0), 0);
    setData((prev) => ({
      ...prev,
      belajar_kegiatan: updated,
      belajar_total_durasi: total
    }));
  };

  // Simpan data
  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await saveTujuhKaih({
        ...data,
        siswa_id: currentSiswaId,
        tanggal: selectedDate
      });
      if (res.success) {
        setToastMsg("Checklist 7 KAIH berhasil disimpan!");
        loadHistory();
        setTimeout(() => setToastMsg(""), 3500);
      } else {
        setToastMsg(`Gagal menyimpan: ${res.error}`);
        setTimeout(() => setToastMsg(""), 4000);
      }
    } catch (e: any) {
      setToastMsg(`Terjadi kesalahan: ${e.message}`);
      setTimeout(() => setToastMsg(""), 4000);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-24 animate-fade-in font-sans">
      {/* Toast Notification */}
      <AnimatePresence>
        {toastMsg && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className={`fixed top-24 right-4 sm:right-8 z-50 px-5 py-3 rounded-2xl shadow-xl flex items-center gap-3 text-sm font-bold text-white ${
              toastMsg.includes("Gagal") || toastMsg.includes("kesalahan")
                ? "bg-rose-600"
                : "bg-emerald-600"
            }`}
          >
            <CheckCircle2 className="w-5 h-5" />
            <span>{toastMsg}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header Banner & Date Selector */}
      <div className="bg-gradient-to-br from-brand-700 via-brand-600 to-accent-600 rounded-3xl p-6 sm:p-8 text-white shadow-xl shadow-brand-900/10 relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-12 -translate-y-8 w-64 h-64 bg-white/10 rounded-full blur-2xl pointer-events-none" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 backdrop-blur-md text-xs font-black uppercase tracking-wider mb-3">
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              7 Kebiasaan Anak Indonesia Hebat (7 KAIH)
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
              Checklist Karakter Harian
            </h1>
            <p className="text-brand-100 text-xs sm:text-sm mt-1 max-w-xl">
              Catat dan kembangkan 7 kebiasaan mulia setiap hari untuk membangun karakter hebat, mandiri, dan berprestasi.
            </p>
          </div>

          {/* Date Navigator Bar */}
          <div className="bg-white/15 backdrop-blur-md rounded-2xl p-2 flex items-center gap-2 border border-white/20 self-start md:self-auto">
            <button
              onClick={handlePrevDay}
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
              onClick={handleNextDay}
              className="p-2 hover:bg-white/20 rounded-xl transition-all cursor-pointer text-white"
              title="Hari Berikutnya"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              onClick={handleSetToday}
              className="px-3 py-1.5 bg-white text-brand-700 text-xs font-black rounded-xl hover:bg-brand-50 transition-all cursor-pointer shadow-sm ml-1"
            >
              Hari Ini
            </button>
          </div>
        </div>

        {/* Progress Metric Card */}
        <div className="mt-8 pt-6 border-t border-white/15 grid grid-cols-1 sm:grid-cols-3 gap-4 items-center">
          <div className="sm:col-span-2">
            <div className="flex items-center justify-between text-xs font-bold mb-2">
              <span className="flex items-center gap-1.5">
                <Activity className="w-4 h-4 text-amber-300" />
                Capaian Kebiasaan Hari Ini:
              </span>
              <span className="text-amber-200 text-sm font-black">
                {completedHabitsCount} dari 7 Kebiasaan Tercapai ({progressPercent}%)
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

          <div className="flex sm:justify-end gap-2">
            <button
              onClick={() => setShowHistoryModal(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-xl text-xs font-bold transition-all cursor-pointer border border-white/20"
            >
              <History className="w-4 h-4" />
              Lihat Riwayat
            </button>
          </div>
        </div>
      </div>

      {/* Grid Status 7 Kebiasaan (Overview Pills) */}
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
      {/* FORM INPUT CHECKLIST 7 KEBIASAAN                        */}
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
                  Bangun pagi melatih kesiapan, kedisiplinan, dan kesehatan jasmani.
                </p>
              </div>
            </div>
            <span className="text-xs font-bold text-brand-600 bg-brand-50 px-3 py-1 rounded-full border border-brand-100">
              Target Ideal: ≤ {TARGET_BANGUN_PAGI} WIB
            </span>
          </div>

          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Clock className="w-4 h-4 text-slate-400" />
              <label className="text-xs font-bold text-slate-700">Waktu Bangun Pagi:</label>
              <input
                type="time"
                value={data.bangun_pagi_waktu || ""}
                onChange={(e) => setData({ ...data, bangun_pagi_waktu: e.target.value })}
                className="bg-white px-3 py-1.5 rounded-xl border border-slate-200 text-sm font-black text-brand-900 outline-none focus:border-brand-500"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleUseCurrentTime("bangun_pagi_waktu")}
                className="px-3 py-1.5 bg-brand-50 hover:bg-brand-100 text-brand-700 rounded-xl text-xs font-bold transition-all cursor-pointer border border-brand-100 flex items-center gap-1.5"
              >
                <Clock className="w-3.5 h-3.5" />
                Gunakan Jam Sekarang ({getCurrentDeviceTime()})
              </button>
            </div>
          </div>

          {/* Indikator Kesesuaian Target */}
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
                  <span>Hebat! Anda bangun tepat waktu sesuai target (≤ {TARGET_BANGUN_PAGI} WIB). Pertahankan!</span>
                </>
              ) : (
                <>
                  <AlertCircle className="w-4 h-4 text-amber-600" />
                  <span>Bangun pukul {data.bangun_pagi_waktu} WIB. Besok yuk usahakan tidur lebih awal agar bisa bangun sebelum {TARGET_BANGUN_PAGI} WIB!</span>
                </>
              )}
            </div>
          )}
        </div>

        {/* ====================================================== */}
        {/* 2. BERIBADAH (Salat 5 Waktu + Mengaji)                  */}
        {/* ====================================================== */}
        <div className="bg-white rounded-3xl p-6 border border-brand-100 shadow-sm space-y-5">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-100">
                <BookOpen className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-black text-brand-950">2. Beribadah</h2>
                <p className="text-xs text-slate-500 font-medium">
                  Ibadah salat 5 waktu dan tadarus Al-Qur'an sebagai tiang akhlak mulia.
                </p>
              </div>
            </div>
          </div>

          {/* 5 Waktu Salat */}
          <div>
            <label className="text-xs font-black text-slate-700 uppercase tracking-wider block mb-2.5">
              Checklist Salat Wajib 5 Waktu:
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
                    onClick={() => setData({ ...data, [s.key]: !isChecked })}
                    className={`p-3 rounded-2xl border text-center transition-all cursor-pointer flex flex-col items-center gap-2 ${
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
                  onClick={() => setData({ ...data, mengaji_status: "sudah" })}
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
                  onClick={() => setData({ ...data, mengaji_status: "belum" })}
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
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2"
              >
                <div>
                  <label className="text-[11px] font-bold text-slate-600 block mb-1">
                    Nama Surah:
                  </label>
                  <input
                    type="text"
                    placeholder="Contoh: Al-Baqarah"
                    value={data.mengaji_surah || ""}
                    onChange={(e) => setData({ ...data, mengaji_surah: e.target.value })}
                    className="w-full bg-white px-3 py-1.5 rounded-xl border border-indigo-200 text-xs font-bold text-slate-800 outline-none"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-600 block mb-1">
                    Rentang Ayat:
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      placeholder="Ayat awal"
                      value={data.mengaji_ayat_awal || ""}
                      onChange={(e) => setData({ ...data, mengaji_ayat_awal: parseInt(e.target.value) || null })}
                      className="w-full bg-white px-3 py-1.5 rounded-xl border border-indigo-200 text-xs font-bold text-slate-800 outline-none"
                    />
                    <span className="text-xs text-slate-400 font-bold">-</span>
                    <input
                      type="number"
                      placeholder="Ayat akhir"
                      value={data.mengaji_ayat_akhir || ""}
                      onChange={(e) => setData({ ...data, mengaji_ayat_akhir: parseInt(e.target.value) || null })}
                      className="w-full bg-white px-3 py-1.5 rounded-xl border border-indigo-200 text-xs font-bold text-slate-800 outline-none"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-600 block mb-1">
                    Catatan Tadarus (Opsional):
                  </label>
                  <input
                    type="text"
                    placeholder="Misal: Mempelajari tajwid nun mati"
                    value={data.mengaji_catatan || ""}
                    onChange={(e) => setData({ ...data, mengaji_catatan: e.target.value })}
                    className="w-full bg-white px-3 py-1.5 rounded-xl border border-indigo-200 text-xs font-bold text-slate-800 outline-none"
                  />
                </div>
              </motion.div>
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
                onClick={() => setData({ ...data, olahraga_status: "sudah" })}
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
                onClick={() => setData({ ...data, olahraga_status: "belum" })}
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
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 bg-emerald-50/50 p-4 rounded-2xl border border-emerald-100"
            >
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Jenis Olahraga:
                </label>
                <input
                  type="text"
                  placeholder="Contoh: Jogging, Sepak Bola, Senam, Bersepeda, dll"
                  value={data.olahraga_jenis || ""}
                  onChange={(e) => setData({ ...data, olahraga_jenis: e.target.value })}
                  className="w-full bg-white px-3 py-2 rounded-xl border border-emerald-200 text-xs font-bold text-slate-800 outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Durasi Olahraga (menit, opsional):
                </label>
                <input
                  type="number"
                  placeholder="Misal: 30"
                  value={data.olahraga_durasi_menit || ""}
                  onChange={(e) => setData({ ...data, olahraga_durasi_menit: parseInt(e.target.value) || null })}
                  className="w-full bg-white px-3 py-2 rounded-xl border border-emerald-200 text-xs font-bold text-slate-800 outline-none"
                />
              </div>
            </motion.div>
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
                  Catat asupan sarapan, makan siang, dan makan malam bergizi seimbang.
                </p>
              </div>
            </div>

            {/* Sub-tab Sarapan / Siang / Malam */}
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

          {/* Dynamic Panel for Active Meal */}
          {(() => {
            const statusKey = activeMakanTab === "sarapan" ? "sarapan_status" : activeMakanTab === "siang" ? "makan_siang_status" : "makan_malam_status";
            const bergiziKey = activeMakanTab === "sarapan" ? "sarapan_bergizi" : activeMakanTab === "siang" ? "makan_siang_bergizi" : "makan_malam_bergizi";
            const menuKey = activeMakanTab === "sarapan" ? "sarapan_menu" : activeMakanTab === "siang" ? "makan_siang_menu" : "makan_malam_menu";

            const mealTitle = activeMakanTab === "sarapan" ? "Sarapan Pagi" : activeMakanTab === "siang" ? "Makan Siang" : "Makan Malam";
            const currentStatus = data[statusKey] as HabitStatus;
            const currentBergizi = !!data[bergiziKey];
            const currentMenu = (data[menuKey] as string) || "";

            return (
              <div className="bg-orange-50/50 rounded-2xl p-4 border border-orange-100 space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="text-xs font-black text-orange-950">
                    Status {mealTitle}:
                  </span>
                  <div className="flex items-center gap-1.5 bg-white p-1 rounded-xl border border-orange-200">
                    <button
                      type="button"
                      onClick={() => setData({ ...data, [statusKey]: "sudah" })}
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
                      onClick={() => setData({ ...data, [statusKey]: "belum" })}
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
                    <div className="flex items-center gap-2 sm:col-span-1">
                      <label className="flex items-center gap-2 cursor-pointer bg-white px-3 py-2 rounded-xl border border-orange-200 text-xs font-bold text-slate-800 w-full">
                        <input
                          type="checkbox"
                          checked={currentBergizi}
                          onChange={(e) => setData({ ...data, [bergiziKey]: e.target.checked })}
                          className="w-4 h-4 rounded text-orange-600 accent-orange-600"
                        />
                        <span>Menu Bergizi Seimbang</span>
                      </label>
                    </div>
                    <div className="sm:col-span-2">
                      <input
                        type="text"
                        placeholder="Tulis menu makanan (opsional, misal: nasi, telur, sayur bayam, buah)"
                        value={currentMenu}
                        onChange={(e) => setData({ ...data, [menuKey]: e.target.value })}
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
                  Catat kegiatan belajar mandiri / eksplorasi ilmu di luar jam pelajaran sekolah.
                </p>
              </div>
            </div>

            <div className="text-xs font-black text-cyan-700 bg-cyan-50 px-3 py-1.5 rounded-xl border border-cyan-200">
              Total Durasi: {data.belajar_total_durasi || 0} Menit
            </div>
          </div>

          {/* List Kegiatan Belajar */}
          <div className="space-y-2.5">
            {(data.belajar_kegiatan || []).map((item, idx) => (
              <div
                key={item.id}
                className="flex items-center gap-2 bg-slate-50 p-2.5 rounded-2xl border border-slate-200"
              >
                <span className="text-xs font-black text-slate-400 w-6 text-center">
                  #{idx + 1}
                </span>
                <input
                  type="text"
                  placeholder="Nama kegiatan (misal: Membaca Sejarah, Mengerjakan Tugas MTK)"
                  value={item.kegiatan}
                  onChange={(e) => handleUpdateBelajar(item.id, "kegiatan", e.target.value)}
                  className="flex-1 bg-white px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-800 outline-none"
                />
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    placeholder="Menit"
                    value={item.durasi_menit || ""}
                    onChange={(e) => handleUpdateBelajar(item.id, "durasi_menit", e.target.value)}
                    className="w-20 bg-white px-2 py-1.5 rounded-xl border border-slate-200 text-xs font-black text-center text-slate-800 outline-none"
                  />
                  <span className="text-xs text-slate-500 font-bold hidden sm:inline">menit</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveBelajar(item.id)}
                  className="p-2 text-rose-500 hover:bg-rose-50 rounded-xl transition-all cursor-pointer"
                  title="Hapus Kegiatan"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}

            <button
              type="button"
              onClick={handleAddBelajar}
              className="w-full py-2.5 border-2 border-dashed border-cyan-200 hover:border-cyan-400 bg-cyan-50/50 hover:bg-cyan-50 text-cyan-700 rounded-2xl text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Tambah Kegiatan Belajar Mandiri
            </button>
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
                onClick={() => setData({ ...data, bermasyarakat_status: "sudah" })}
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
                onClick={() => setData({ ...data, bermasyarakat_status: "belum" })}
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
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="pt-2"
            >
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Deskripsi Kegiatan Sosial / Gotong Royong:
              </label>
              <textarea
                rows={2}
                placeholder="Contoh: Ikut kerja bakti membersihkan selokan RT, membantu lansia menyeberang jalan, menyantuni anak yatim, dll."
                value={data.bermasyarakat_kegiatan || ""}
                onChange={(e) => setData({ ...data, bermasyarakat_kegiatan: e.target.value })}
                className="w-full bg-slate-50 px-3 py-2 rounded-2xl border border-slate-200 text-xs font-bold text-slate-800 outline-none focus:bg-white focus:border-rose-300"
              />
            </motion.div>
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
                  Tidur lebih awal memulihkan energi tubuh untuk aktivitas esok hari.
                </p>
              </div>
            </div>
            <span className="text-xs font-bold text-purple-600 bg-purple-50 px-3 py-1 rounded-full border border-purple-100">
              Target Ideal: ≤ {TARGET_TIDUR_CEPAT} WIB
            </span>
          </div>

          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Clock className="w-4 h-4 text-slate-400" />
              <label className="text-xs font-bold text-slate-700">Waktu Tidur Malam:</label>
              <input
                type="time"
                value={data.tidur_cepat_waktu || ""}
                onChange={(e) => setData({ ...data, tidur_cepat_waktu: e.target.value })}
                className="bg-white px-3 py-1.5 rounded-xl border border-slate-200 text-sm font-black text-brand-900 outline-none focus:border-purple-500"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleUseCurrentTime("tidur_cepat_waktu")}
                className="px-3 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-xl text-xs font-bold transition-all cursor-pointer border border-purple-100 flex items-center gap-1.5"
              >
                <Clock className="w-3.5 h-3.5" />
                Gunakan Jam Sekarang ({getCurrentDeviceTime()})
              </button>
            </div>
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
                  <span>Waktu tidur tercatat pukul {data.tidur_cepat_waktu} WIB. Disarankan tidur maksimal pukul {TARGET_TIDUR_CEPAT} WIB agar kesehatan optimal.</span>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Floating Sticky Save Button Bar */}
      <div className="fixed bottom-6 left-0 right-0 z-40 px-4 pointer-events-none">
        <div className="max-w-md mx-auto pointer-events-auto">
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="w-full py-4 px-6 bg-gradient-to-r from-brand-700 via-brand-600 to-accent-600 text-white rounded-3xl font-black text-sm sm:text-base shadow-2xl shadow-brand-900/30 hover:opacity-95 active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-2 border border-white/20"
          >
            {isSaving ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Menyimpan Checklist...</span>
              </>
            ) : (
              <>
                <Save className="w-5 h-5" />
                <span>Simpan Checklist 7 KAIH ({progressPercent}%)</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* History Modal */}
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
                    <h3 className="text-lg font-black text-brand-950">Riwayat Pengisian 7 KAIH</h3>
                    <p className="text-xs text-slate-500 font-medium">
                      Pilih tanggal untuk melihat atau memperbarui kembali data Anda
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
                  <p className="text-xs font-bold">Belum ada riwayat pengisian 7 KAIH tersimpan.</p>
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
                            {item.tanggal === formatLocalDate(new Date()) && (
                              <span className="text-[10px] bg-brand-600 text-white font-black px-2 py-0.5 rounded-full">
                                Hari Ini
                              </span>
                            )}
                          </div>
                          <span className="text-xs font-black text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-xl border border-emerald-200">
                            {doneCount} / 7 Kebiasaan ({item.progres_persen || calculate7KaihProgress(item)}%)
                          </span>
                        </div>

                        {/* Visual mini-pill 7 dots */}
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
    </div>
  );
}
