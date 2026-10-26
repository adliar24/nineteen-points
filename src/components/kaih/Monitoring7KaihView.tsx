import React, { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Users,
  Search,
  Filter,
  Calendar,
  Download,
  CheckCircle2,
  AlertCircle,
  Eye,
  ShieldCheck,
  UserPlus,
  Trash2,
  X,
  Sparkles,
  BookOpen,
  Sun,
  Moon,
  Dumbbell,
  Utensils,
  HeartHandshake,
  Clock,
  ChevronDown,
  RefreshCw,
  Award,
  Lock,
  Unlock,
  CheckCheck
} from "lucide-react";
import { UserSession, Siswa, TujuhKaih, GuruPenugasan7Kaih, Profile } from "../../types";
import {
  getSiswaList,
  getTujuhKaihRekap,
  getGuruPenugasan7Kaih,
  assignGuruKelas7Kaih,
  removeGuruPenugasan7Kaih,
  unlockFinal7Kaih
} from "../../dbStore";
import { supabase } from "../../supabaseClient";
import { evaluate7KaihHabits, calculate7KaihProgress } from "../../services/kaihService";
import { formatLocalDate, parseDateSafe } from "../../parseDateSafe";
import { compareClasses, toSentenceCase } from "../../formatName";
import * as XLSX from "xlsx";
import PaginationFooter from "../PaginationFooter";

interface Monitoring7KaihViewProps {
  userSession: UserSession;
}

export default function Monitoring7KaihView({ userSession }: Monitoring7KaihViewProps) {
  const isAdmin = userSession.role === "super_admin";
  const isKepsek = userSession.role === "kepala_sekolah";
  const isGuru = userSession.role === "guru";

  const [activeTab, setActiveTab] = useState<"rekap" | "penugasan">("rekap");

  // Filter States
  const [selectedDate, setSelectedDate] = useState<string>(() => formatLocalDate(new Date()));
  const [selectedKelas, setSelectedKelas] = useState<string>("Semua");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"Semua" | "Sudah Mengisi" | "Belum Mengisi">("Semua");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  // Reset pagination ke halaman 1 saat filter berubah
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedKelas, statusFilter, searchQuery, selectedDate]);

  // Data States
  const [allSiswa, setAllSiswa] = useState<Siswa[]>([]);
  const [rekapRecords, setRekapRecords] = useState<TujuhKaih[]>([]);
  const [assignedClasses, setAssignedClasses] = useState<string[]>([]);
  const [allAssignments, setAllAssignments] = useState<GuruPenugasan7Kaih[]>([]);
  const [candidatesList, setCandidatesList] = useState<Profile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [toastMsg, setToastMsg] = useState("");

  // Detail Modal State
  const [detailModalStudent, setDetailModalStudent] = useState<Siswa | null>(null);
  const [detailModalRecord, setDetailModalRecord] = useState<TujuhKaih | null>(null);

  // Admin Assignment Form Modal
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedCandidateId, setSelectedCandidateId] = useState("");
  const [selectedClassesToAssign, setSelectedClassesToAssign] = useState<string[]>([]);
  const [isAssigning, setIsAssigning] = useState(false);

  // Muat data penugasan kelas untuk guru / kepala sekolah yang sedang login
  const loadUserAssignments = async () => {
    if (isGuru || isKepsek) {
      const assignments = await getGuruPenugasan7Kaih(userSession.id);
      const classes = assignments.map((a) => a.kelas);
      setAssignedClasses(classes);
    }
  };

  // Muat data master guru & kepsek serta penugasan untuk Super Admin
  const loadAdminData = async () => {
    if (isAdmin) {
      try {
        const [assignments, { data: profiles }] = await Promise.all([
          getGuruPenugasan7Kaih(),
          supabase
            .from("profiles")
            .select("*")
            .in("role", ["guru", "kepala_sekolah"])
            .order("nama", { ascending: true })
        ]);
        setAllAssignments(assignments || []);
        if (profiles) setCandidatesList(profiles as Profile[]);
      } catch (err) {
        console.error("Gagal memuat kandidat guru/kepsek penugasan:", err);
      }
    }
  };

  // Muat data siswa & rekap pengisian tanggal terpilih
  const loadData = async () => {
    setIsLoading(true);
    try {
      const [siswa, rekap] = await Promise.all([
        getSiswaList(),
        getTujuhKaihRekap({
          tanggal: selectedDate,
          guruId: (isGuru || isKepsek) ? userSession.id : undefined,
          role: userSession.role
        })
      ]);
      setAllSiswa(siswa);
      setRekapRecords(rekap);
    } catch (err) {
      console.error("Gagal memuat data 7 KAIH:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadUserAssignments();
    loadAdminData();
  }, [userSession]);

  useEffect(() => {
    loadData();
  }, [selectedDate, userSession.id]);

  // Daftar kelas unik yang relevan
  const availableClassOptions = useMemo(() => {
    let rawClasses: string[] = [];
    if (isGuru || isKepsek) {
      if (assignedClasses.includes("Semua")) {
        rawClasses = Array.from(new Set(allSiswa.map((s) => s.kelas).filter(Boolean)));
      } else {
        rawClasses = assignedClasses;
      }
    } else {
      rawClasses = Array.from(new Set(allSiswa.map((s) => s.kelas).filter(Boolean)));
    }
    return rawClasses.sort(compareClasses);
  }, [allSiswa, isGuru, isKepsek, assignedClasses]);

  // Gabungkan daftar siswa dengan rekap hari ini
  const mergedSiswaRows = useMemo(() => {
    let scopedSiswa = allSiswa;
    if ((isGuru || isKepsek) && !assignedClasses.includes("Semua")) {
      scopedSiswa = allSiswa.filter((s) => assignedClasses.includes(s.kelas));
    }

    const rekapMap = new Map<string, TujuhKaih>();
    rekapRecords.forEach((r) => {
      rekapMap.set(r.siswa_id, r);
    });

    return scopedSiswa.map((s) => {
      const record = rekapMap.get(s.id);
      const isFilled = !!record;
      const progress = record ? (record.progres_persen ?? calculate7KaihProgress(record)) : 0;
      const evaluations = record ? evaluate7KaihHabits(record) : [];

      return {
        siswa: s,
        record: record || null,
        isFilled,
        progress,
        evaluations
      };
    });
  }, [allSiswa, rekapRecords, isGuru, isKepsek, assignedClasses]);

  // Filter hasil pencarian dan filter dropdown
  const filteredRows = useMemo(() => {
    return mergedSiswaRows.filter((item) => {
      if (selectedKelas !== "Semua" && item.siswa.kelas !== selectedKelas) {
        return false;
      }

      if (statusFilter === "Sudah Mengisi" && !item.isFilled) return false;
      if (statusFilter === "Belum Mengisi" && item.isFilled) return false;

      if (searchQuery.trim() !== "") {
        const q = searchQuery.toLowerCase();
        const namaMatch = (item.siswa.nama || "").toLowerCase().includes(q);
        const nisMatch = (item.siswa.nis || "").toLowerCase().includes(q);
        if (!namaMatch && !nisMatch) return false;
      }

      return true;
    });
  }, [mergedSiswaRows, selectedKelas, statusFilter, searchQuery]);

  // Paginated rows (20 murid per halaman agar ringan & tidak lag)
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredRows.slice(start, start + itemsPerPage);
  }, [filteredRows, currentPage, itemsPerPage]);

  // KPI Stats
  const stats = useMemo(() => {
    const total = mergedSiswaRows.length;
    const sudah = mergedSiswaRows.filter((r) => r.isFilled).length;
    const belum = total - sudah;
    const avgProgress =
      sudah > 0
        ? Math.round(
            mergedSiswaRows.reduce((acc, curr) => acc + (curr.record ? curr.progress : 0), 0) / sudah
          )
        : 0;

    return { total, sudah, belum, avgProgress };
  }, [mergedSiswaRows]);

  // Export ke Excel (.xlsx)
  const handleExportExcel = () => {
    if (filteredRows.length === 0) {
      alert("Tidak ada data untuk diekspor");
      return;
    }

    const rows = filteredRows.map((item, idx) => {
      const r = item.record;
      const salatList = r
        ? [
            r.salat_subuh && "Subuh",
            r.salat_zuhur && "Zuhur",
            r.salat_asar && "Asar",
            r.salat_magrib && "Magrib",
            r.salat_isya && "Isya"
          ]
            .filter(Boolean)
            .join(", ")
        : "-";

      const mengajiText = r?.mengaji_status === "sudah"
        ? `Sudah (${r.mengaji_surah || ""}: ${r.mengaji_ayat_awal || ""}-${r.mengaji_ayat_akhir || ""})`
        : r?.mengaji_status === "belum" ? "Belum" : "-";

      const olahragaText = r?.olahraga_status === "sudah"
        ? `${r.olahraga_jenis || "Olahraga"} (${r.olahraga_durasi_menit || 0} menit)`
        : r?.olahraga_status === "belum" ? "Belum" : "-";

      const makanText = r
        ? `Sarapan: ${r.sarapan_status}, Siang: ${r.makan_siang_status}, Malam: ${r.makan_malam_status}`
        : "-";

      const belajarText = r
        ? `${r.belajar_total_durasi || 0} menit (${r.belajar_kegiatan?.length || 0} kegiatan)`
        : "-";

      const masyarakatText = r?.bermasyarakat_status === "sudah"
        ? r.bermasyarakat_kegiatan || "Sudah"
        : r?.bermasyarakat_status === "belum" ? "Belum" : "-";

      return {
        No: idx + 1,
        NIS: item.siswa.nis,
        Nama: item.siswa.nama,
        Kelas: item.siswa.kelas,
        Tanggal: selectedDate,
        "Status Pengisian": item.isFilled ? (r?.is_final ? "Terkirim Final" : "Draft (Auto-saved)") : "Belum Mengisi",
        "Progres 7 KAIH (%)": item.progress,
        "1. Bangun Pagi": r?.bangun_pagi_waktu || "-",
        "Target Bangun": r?.bangun_pagi_target_sesuai ? "Tercapai" : "-",
        "2. Salat Wajib": salatList,
        "2b. Mengaji": mengajiText,
        "3. Berolahraga": olahragaText,
        "4. Makan Sehat": makanText,
        "5. Gemar Belajar": belajarText,
        "6. Bermasyarakat": masyarakatText,
        "7. Tidur Cepat": r?.tidur_cepat_waktu || "-",
        "Target Tidur": r?.tidur_cepat_target_sesuai ? "Tercapai" : "-"
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Rekap 7 KAIH");
    XLSX.writeFile(workbook, `Rekap_7KAIH_${selectedKelas}_${selectedDate}.xlsx`);
  };

  // Admin: Simpan Penugasan Guru / Kepsek
  const handleSaveTeacherAssignment = async () => {
    if (!selectedCandidateId) {
      alert("Silakan pilih guru atau kepala sekolah terlebih dahulu");
      return;
    }
    if (selectedClassesToAssign.length === 0) {
      alert("Pilih minimal satu kelas (atau 'Semua') untuk diberikan izin akses");
      return;
    }

    setIsAssigning(true);
    try {
      const res = await assignGuruKelas7Kaih(selectedCandidateId, selectedClassesToAssign);
      if (res.success) {
        setToastMsg("Izin akses & penugasan kelas berhasil disimpan!");
        loadAdminData();
        setShowAssignModal(false);
        setSelectedCandidateId("");
        setSelectedClassesToAssign([]);
        setTimeout(() => setToastMsg(""), 3500);
      } else {
        alert("Gagal menyimpan penugasan: " + res.error);
      }
    } catch (e: any) {
      alert("Terjadi kesalahan: " + e.message);
    } finally {
      setIsAssigning(false);
    }
  };

  // Admin: Cabut Penugasan Kelas
  const handleRemoveAssignment = async (guruId: string, kelas: string) => {
    if (!window.confirm(`Yakin ingin mencabut akses kelas ${kelas} dari pengguna ini?`)) return;
    try {
      const res = await removeGuruPenugasan7Kaih(guruId, kelas);
      if (res.success) {
        setToastMsg(`Akses kelas ${kelas} berhasil dicabut.`);
        loadAdminData();
        setTimeout(() => setToastMsg(""), 3500);
      } else {
        alert("Gagal mencabut penugasan: " + res.error);
      }
    } catch (e: any) {
      alert("Error: " + e.message);
    }
  };

  // Admin: Buka Kunci (Unlock) Checklist Murid
  const handleUnlockRecord = async () => {
    if (!detailModalStudent || !detailModalRecord) return;
    if (!window.confirm(`Buka kunci checklist untuk murid ${detailModalStudent.nama} pada tanggal ${detailModalRecord.tanggal}? Murid akan dapat mengedit kembali checklist hari ini.`)) return;

    setIsUnlocking(true);
    try {
      const res = await unlockFinal7Kaih(detailModalStudent.id, detailModalRecord.tanggal);
      if (res.success) {
        setDetailModalRecord((prev) => (prev ? { ...prev, is_final: false, waktu_kirim_final: null } : null));
        setToastMsg("Checklist berhasil dibuka kuncinya! Murid dapat mengedit kembali.");
        loadData();
        setTimeout(() => setToastMsg(""), 3500);
      } else {
        alert("Gagal membuka kunci: " + res.error);
      }
    } catch (e: any) {
      alert("Error: " + e.message);
    } finally {
      setIsUnlocking(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-20 font-sans animate-fade-in">
      {/* Toast Notification */}
      <AnimatePresence>
        {toastMsg && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-24 right-4 sm:right-8 z-50 px-5 py-3 rounded-2xl shadow-xl flex items-center gap-3 text-sm font-bold text-white bg-emerald-600"
          >
            <CheckCircle2 className="w-5 h-5" />
            <span>{toastMsg}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header Banner */}
      <div className="bg-gradient-to-r from-brand-900 via-brand-800 to-indigo-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 backdrop-blur-md text-xs font-black uppercase tracking-wider mb-3">
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              7 Kebiasaan Anak Indonesia Hebat
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
              7 KAIH
            </h1>
            <p className="text-brand-200 text-xs sm:text-sm mt-1 max-w-2xl">
              {isAdmin
                ? "Monitoring capaian karakter murid harian dan kelola izin akses guru atau kepala sekolah."
                : `Pemantauan data karakter murid di kelas binaan Anda: ${
                    assignedClasses.includes("Semua") ? "Semua Kelas" : assignedClasses.join(", ")
                  }.`}
            </p>
          </div>

          {/* Tab Switcher (Khusus Super Admin) */}
          {isAdmin && (
            <div className="bg-white/10 backdrop-blur-md p-1.5 rounded-2xl border border-white/20 flex items-center gap-1 self-start md:self-auto">
              <button
                onClick={() => setActiveTab("rekap")}
                className={`px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer ${
                  activeTab === "rekap"
                    ? "bg-white text-brand-900 shadow-md"
                    : "text-white hover:bg-white/15"
                }`}
              >
                Rekap Murid
              </button>
              <button
                onClick={() => setActiveTab("penugasan")}
                className={`px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeTab === "penugasan"
                    ? "bg-white text-brand-900 shadow-md"
                    : "text-white hover:bg-white/15"
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                Izin & Penugasan Akses
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ======================================================== */}
      {/* KONTEN TAB: REKAP PEMANTAUAN MURID                       */}
      {/* ======================================================== */}
      {activeTab === "rekap" && (
        <div className="space-y-6">
          {/* KPI Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-3xl border border-brand-100 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-brand-50 text-brand-700 flex items-center justify-center border border-brand-100">
                <Users className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Total Murid</p>
                <h3 className="text-2xl font-black text-brand-950">{stats.total}</h3>
              </div>
            </div>

            <div className="bg-white p-5 rounded-3xl border border-brand-100 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-100">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Sudah Mengisi</p>
                <h3 className="text-2xl font-black text-emerald-700">{stats.sudah}</h3>
              </div>
            </div>

            <div className="bg-white p-5 rounded-3xl border border-brand-100 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-700 flex items-center justify-center border border-rose-100">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Belum Mengisi (Kosong)</p>
                <h3 className="text-2xl font-black text-rose-700">{stats.belum}</h3>
              </div>
            </div>

            <div className="bg-white p-5 rounded-3xl border border-brand-100 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-700 flex items-center justify-center border border-amber-100">
                <Award className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Rata-rata Progres</p>
                <h3 className="text-2xl font-black text-amber-700">{stats.avgProgress}%</h3>
              </div>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="bg-white rounded-3xl p-5 border border-brand-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              {/* Tanggal */}
              <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-2xl border border-slate-200">
                <Calendar className="w-4 h-4 text-slate-400" />
                <span className="text-xs font-bold text-slate-600 hidden sm:inline">Tanggal:</span>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="bg-transparent text-xs font-black text-brand-950 outline-none cursor-pointer"
                />
              </div>

              {/* Kelas */}
              <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-2xl border border-slate-200">
                <Filter className="w-4 h-4 text-slate-400" />
                <span className="text-xs font-bold text-slate-600">Kelas:</span>
                <select
                  value={selectedKelas}
                  onChange={(e) => setSelectedKelas(e.target.value)}
                  className="bg-transparent text-xs font-black text-brand-950 outline-none cursor-pointer"
                >
                  <option value="Semua">Semua Kelas</option>
                  {availableClassOptions.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              {/* Status */}
              <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-2xl border border-slate-200">
                <span className="text-xs font-bold text-slate-600">Status:</span>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as any)}
                  className="bg-transparent text-xs font-black text-brand-950 outline-none cursor-pointer"
                >
                  <option value="Semua">Semua Status</option>
                  <option value="Sudah Mengisi">Sudah Mengisi</option>
                  <option value="Belum Mengisi">Belum Mengisi</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="relative flex-1 md:w-64">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Cari nama atau NIS..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-50 pl-9 pr-3 py-2 rounded-2xl border border-slate-200 text-xs font-bold text-slate-800 outline-none focus:bg-white focus:border-brand-500"
                />
              </div>

              <button
                onClick={handleExportExcel}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-xs font-black transition-all cursor-pointer flex items-center gap-2 shadow-sm"
              >
                <Download className="w-4 h-4" />
                <span className="hidden sm:inline">Export Excel</span>
              </button>
            </div>
          </div>

          {/* Data Table */}
          <div className="bg-white rounded-3xl border border-brand-100 shadow-sm overflow-hidden">
            {isLoading ? (
              <div className="py-20 text-center text-slate-400 space-y-3">
                <div className="w-8 h-8 border-3 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-xs font-bold">Memuat data 7 KAIH...</p>
              </div>
            ) : filteredRows.length === 0 ? (
              <div className="py-20 text-center text-slate-400 space-y-2">
                <Users className="w-12 h-12 mx-auto text-slate-300" />
                <p className="text-sm font-bold text-slate-700">Tidak ada data murid yang ditemukan</p>
                <p className="text-xs text-slate-400">
                  Coba ubah tanggal, kelas, atau kata kunci pencarian Anda.
                </p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50/75 border-b border-slate-100 text-[11px] font-black uppercase tracking-wider text-slate-500">
                        <th className="py-4 px-5">Murid</th>
                        <th className="py-4 px-4">Kelas</th>
                        <th className="py-4 px-4 text-center">Status Pengisian</th>
                        <th className="py-4 px-4">Capaian 7 Kebiasaan</th>
                        <th className="py-4 px-4 text-center">Progres</th>
                        <th className="py-4 px-5 text-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {paginatedRows.map((item) => {
                      const completedCount = item.evaluations.filter((e) => e.status === "selesai").length;

                      return (
                        <tr key={item.siswa.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="py-3.5 px-5">
                            <div className="flex items-center gap-3">
                              {item.siswa.foto_url ? (
                                <img
                                  src={item.siswa.foto_url}
                                  alt={item.siswa.nama}
                                  className="w-9 h-9 rounded-xl object-cover border border-slate-200"
                                />
                              ) : (
                                <div className="w-9 h-9 rounded-xl bg-brand-100 text-brand-700 flex items-center justify-center font-black text-xs">
                                  {item.siswa.nama.slice(0, 2).toUpperCase()}
                                </div>
                              )}
                              <div>
                                <h4 className="font-black text-brand-950">{toSentenceCase(item.siswa.nama)}</h4>
                                <p className="text-[10px] text-slate-400 font-bold">NIS: {item.siswa.nis}</p>
                              </div>
                            </div>
                          </td>

                          <td className="py-3.5 px-4 font-bold text-slate-700">
                            <span className="px-2.5 py-1 rounded-xl bg-slate-100 text-slate-700 font-black text-[11px]">
                              {item.siswa.kelas}
                            </span>
                          </td>

                          <td className="py-3.5 px-4 text-center">
                            {item.isFilled ? (
                              item.record?.is_final ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 font-black text-[10px] border border-emerald-300">
                                  <Lock className="w-3 h-3 text-emerald-600" />
                                  Terkirim Final
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-cyan-50 text-cyan-800 font-black text-[10px] border border-cyan-200">
                                  <CheckCircle2 className="w-3 h-3 text-cyan-600" />
                                  Draft (Auto-saved)
                                </span>
                              )
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 font-black text-[10px] border border-rose-200">
                                <AlertCircle className="w-3 h-3" />
                                Belum Mengisi
                              </span>
                            )}
                          </td>

                          <td className="py-3.5 px-4">
                            {item.isFilled ? (
                              <div className="flex items-center gap-1">
                                {item.evaluations.map((ev, i) => (
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
                                  ({completedCount}/7)
                                </span>
                              </div>
                            ) : (
                              <span className="text-[11px] text-slate-400 italic">Kosong</span>
                            )}
                          </td>

                          <td className="py-3.5 px-4 text-center">
                            <div className="flex items-center justify-center gap-2">
                              <div className="w-16 bg-slate-100 rounded-full h-2 overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${
                                    item.progress >= 70
                                      ? "bg-emerald-500"
                                      : item.progress >= 40
                                      ? "bg-amber-500"
                                      : "bg-rose-500"
                                  }`}
                                  style={{ width: `${item.progress}%` }}
                                />
                              </div>
                              <span className="font-black text-xs text-brand-950 w-8 text-right">
                                {item.progress}%
                              </span>
                            </div>
                          </td>

                          <td className="py-3.5 px-5 text-right">
                            {item.isFilled ? (
                              <button
                                onClick={() => {
                                  setDetailModalStudent(item.siswa);
                                  setDetailModalRecord(item.record);
                                }}
                                className="px-3 py-1.5 bg-brand-50 hover:bg-brand-100 text-brand-700 rounded-xl text-xs font-bold transition-all cursor-pointer border border-brand-200 inline-flex items-center gap-1.5"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                Rincian
                              </button>
                            ) : (
                              <span className="text-slate-300 text-xs">-</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <PaginationFooter
                totalItems={filteredRows.length}
                itemsPerPage={itemsPerPage}
                currentPage={currentPage}
                setCurrentPage={setCurrentPage}
                itemLabel="murid"
              />
            </>
          )}
        </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* KONTEN TAB: PENUGASAN GURU & KEPSEK (SUPER ADMIN)        */}
      {/* ======================================================== */}
      {isAdmin && activeTab === "penugasan" && (
        <div className="space-y-6">
          <div className="bg-white rounded-3xl p-6 border border-brand-100 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-black text-brand-950">Izin Akses & Penugasan 7 KAIH</h2>
              <p className="text-xs text-slate-500 font-medium">
                Pilih guru atau kepala sekolah yang diberi izin untuk memantau data 7 KAIH.
              </p>
            </div>
            <button
              onClick={() => {
                setSelectedCandidateId("");
                setSelectedClassesToAssign([]);
                setShowAssignModal(true);
              }}
              className="px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-2xl text-xs font-black transition-all cursor-pointer flex items-center gap-2 shadow-sm"
            >
              <UserPlus className="w-4 h-4" />
              Beri Akses / Atur Penugasan
            </button>
          </div>

          <div className="bg-white rounded-3xl border border-brand-100 shadow-sm overflow-hidden">
            {allAssignments.length === 0 ? (
              <div className="py-20 text-center text-slate-400 space-y-2">
                <ShieldCheck className="w-12 h-12 mx-auto text-slate-300" />
                <p className="text-sm font-bold text-slate-700">Belum ada guru / kepala sekolah yang diberi akses</p>
                <p className="text-xs text-slate-400">
                  Fitur 7 KAIH saat ini hanya aktif di Super Admin dan Murid. Berikan izin akses melalui tombol di atas.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/75 border-b border-slate-100 text-[11px] font-black uppercase tracking-wider text-slate-500">
                      <th className="py-4 px-5">Nama Pengguna</th>
                      <th className="py-4 px-4">Email</th>
                      <th className="py-4 px-4">Kelas yang Diizinkan</th>
                      <th className="py-4 px-5 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {Array.from(new Set(allAssignments.map((a) => a.guru_id))).map((guruId) => {
                      const userAssignments = allAssignments.filter((a) => a.guru_id === guruId);
                      const userInfo = userAssignments[0];

                      return (
                        <tr key={guruId} className="hover:bg-slate-50/50">
                          <td className="py-4 px-5">
                            <span className="font-black text-brand-950 text-sm">
                              {toSentenceCase(userInfo.guru_nama || "Pengguna")}
                            </span>
                          </td>
                          <td className="py-4 px-4 font-mono text-slate-500 text-xs">
                            {userInfo.guru_email || "-"}
                          </td>
                          <td className="py-4 px-4">
                            <div className="flex flex-wrap gap-1.5">
                              {userAssignments.map((ga) => (
                                <span
                                  key={ga.kelas}
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-brand-50 text-brand-700 border border-brand-200 font-black text-xs"
                                >
                                  {ga.kelas === "Semua" ? "Semua Kelas" : ga.kelas}
                                  <button
                                    onClick={() => handleRemoveAssignment(guruId, ga.kelas)}
                                    className="hover:text-rose-600 transition-colors cursor-pointer"
                                    title={`Cabut akses ${ga.kelas}`}
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="py-4 px-5 text-right">
                            <button
                              onClick={() => {
                                setSelectedCandidateId(guruId);
                                setSelectedClassesToAssign(userAssignments.map((g) => g.kelas));
                                setShowAssignModal(true);
                              }}
                              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
                            >
                              Edit Izin
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

      {/* ======================================================== */}
      {/* MODAL RINCIAN CHECKLIST MURID                            */}
      {/* ======================================================== */}
      <AnimatePresence>
        {detailModalStudent && detailModalRecord && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => {
                setDetailModalStudent(null);
                setDetailModalRecord(null);
              }}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-white rounded-3xl p-6 sm:p-8 max-w-2xl w-full max-h-[88vh] overflow-y-auto relative z-10 shadow-2xl border border-brand-100 space-y-6"
            >
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  {detailModalStudent.foto_url ? (
                    <img
                      src={detailModalStudent.foto_url}
                      alt={detailModalStudent.nama}
                      className="w-12 h-12 rounded-2xl object-cover border border-slate-200"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-2xl bg-brand-100 text-brand-700 flex items-center justify-center font-black text-sm">
                      {detailModalStudent.nama.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <h3 className="text-base font-black text-brand-950">
                      {toSentenceCase(detailModalStudent.nama)}
                    </h3>
                    <p className="text-xs text-slate-500 font-bold">
                      Kelas: {detailModalStudent.kelas} • NIS: {detailModalStudent.nis} • Tanggal: {detailModalRecord.tanggal}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {isAdmin && detailModalRecord.is_final && (
                    <button
                      onClick={handleUnlockRecord}
                      disabled={isUnlocking}
                      className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-xl text-xs font-bold transition-all border border-amber-200 flex items-center gap-1.5 cursor-pointer"
                    >
                      <Unlock className="w-3.5 h-3.5" />
                      {isUnlocking ? "Membuka..." : "Buka Kunci"}
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setDetailModalStudent(null);
                      setDetailModalRecord(null);
                    }}
                    className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Status Header */}
              <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-200">
                <div className="flex items-center gap-2 text-xs font-bold">
                  {detailModalRecord.is_final ? (
                    <>
                      <Lock className="w-4 h-4 text-emerald-600" />
                      <span className="text-emerald-800 font-black">Data Final Terkunci</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-cyan-600" />
                      <span className="text-cyan-800 font-black">Data Draft (Auto-saved)</span>
                    </>
                  )}
                </div>
                <span className="text-xs font-black text-brand-950">
                  Progres: {detailModalRecord.progres_persen || calculate7KaihProgress(detailModalRecord)}%
                </span>
              </div>

              {/* Rincian 7 Kebiasaan */}
              <div className="space-y-4">
                {evaluate7KaihHabits(detailModalRecord).map((h) => (
                  <div
                    key={h.id}
                    className="p-4 rounded-2xl border border-slate-200 bg-slate-50/60 flex items-start justify-between gap-3"
                  >
                    <div>
                      <h4 className="text-xs font-black text-brand-950 mb-1">{h.nomenklatur}</h4>
                      <p className="text-xs font-bold text-slate-700">{h.summary}</p>

                      {h.id === "beribadah" && (
                        <div className="mt-2 text-[11px] text-slate-600 space-y-1">
                          <p>
                            Salat Wajib:{" "}
                            {[
                              detailModalRecord.salat_subuh && "Subuh",
                              detailModalRecord.salat_zuhur && "Zuhur",
                              detailModalRecord.salat_asar && "Asar",
                              detailModalRecord.salat_magrib && "Magrib",
                              detailModalRecord.salat_isya && "Isya"
                            ]
                              .filter(Boolean)
                              .join(", ") || "Belum ada yang dicentang"}
                          </p>
                          {detailModalRecord.mengaji_status === "sudah" && (
                            <p>
                              Tadarus: Surah {detailModalRecord.mengaji_surah || "-"} Ayat{" "}
                              {detailModalRecord.mengaji_ayat_awal || 0}-
                              {detailModalRecord.mengaji_ayat_akhir || 0}{" "}
                              {detailModalRecord.mengaji_catatan ? `(${detailModalRecord.mengaji_catatan})` : ""}
                            </p>
                          )}
                        </div>
                      )}

                      {h.id === "makan_sehat" && (
                        <div className="mt-2 text-[11px] text-slate-600 space-y-1">
                          <p>
                            Sarapan: {detailModalRecord.sarapan_status}{" "}
                            {detailModalRecord.sarapan_menu ? `(${detailModalRecord.sarapan_menu})` : ""}
                          </p>
                          <p>
                            Makan Siang: {detailModalRecord.makan_siang_status}{" "}
                            {detailModalRecord.makan_siang_menu ? `(${detailModalRecord.makan_siang_menu})` : ""}
                          </p>
                          <p>
                            Makan Malam: {detailModalRecord.makan_malam_status}{" "}
                            {detailModalRecord.makan_malam_menu ? `(${detailModalRecord.makan_malam_menu})` : ""}
                          </p>
                        </div>
                      )}

                      {h.id === "gemar_belajar" && Array.isArray(detailModalRecord.belajar_kegiatan) && (
                        <div className="mt-2 text-[11px] text-slate-600 space-y-1">
                          {detailModalRecord.belajar_kegiatan.map((bk, i) => (
                            <p key={bk.id || i}>
                              • {bk.kegiatan} ({bk.durasi_menit} menit)
                            </p>
                          ))}
                        </div>
                      )}
                    </div>

                    <span
                      className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-full border ${
                        h.status === "selesai"
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : h.status === "belum_dilakukan"
                          ? "bg-amber-50 text-amber-700 border-amber-200"
                          : "bg-slate-200 text-slate-600 border-slate-300"
                      }`}
                    >
                      {h.status === "selesai"
                        ? "Tercapai"
                        : h.status === "belum_dilakukan"
                        ? "Belum Dilakukan"
                        : "Belum Diisi"}
                    </span>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ======================================================== */}
      {/* MODAL PENUGASAN: HANYA GURU & KEPALA SEKOLAH             */}
      {/* ======================================================== */}
      <AnimatePresence>
        {isAdmin && showAssignModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowAssignModal(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-white rounded-3xl p-6 sm:p-8 max-w-lg w-full relative z-10 shadow-2xl border border-brand-100 space-y-5"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-black text-brand-950">Beri Izin Akses 7 KAIH</h3>
                  <p className="text-xs text-slate-500 font-medium">
                    Hanya guru dan kepala sekolah yang dapat dipilih
                  </p>
                </div>
                <button
                  onClick={() => setShowAssignModal(false)}
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Pilih Guru / Kepsek */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Pilih Guru / Kepala Sekolah:</label>
                <select
                  value={selectedCandidateId}
                  onChange={(e) => setSelectedCandidateId(e.target.value)}
                  className="w-full bg-slate-50 px-3 py-2.5 rounded-2xl border border-slate-200 text-xs font-bold text-slate-800 outline-none"
                >
                  <option value="">-- Pilih Guru / Kepala Sekolah --</option>
                  {candidatesList.map((t) => (
                    <option key={t.id} value={t.id}>
                      {toSentenceCase(t.nama)} ({t.role === "kepala_sekolah" ? "Kepala Sekolah" : "Guru"}) - {t.email}
                    </option>
                  ))}
                </select>
              </div>

              {/* Pilih Kelas Binaan (Termasuk "Semua Kelas") */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-slate-700">Pilih Akses Kelas:</label>
                  <div className="flex items-center gap-2 text-[11px] font-bold">
                    <button
                      type="button"
                      onClick={() => setSelectedClassesToAssign(["Semua"])}
                      className="text-brand-600 hover:underline cursor-pointer"
                    >
                      Akses Semua Kelas
                    </button>
                    <span className="text-slate-300">•</span>
                    <button
                      type="button"
                      onClick={() => setSelectedClassesToAssign([])}
                      className="text-slate-500 hover:underline cursor-pointer"
                    >
                      Reset
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 max-h-48 overflow-y-auto p-2 border border-slate-200 rounded-2xl bg-slate-50">
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedClassesToAssign.includes("Semua")) {
                        setSelectedClassesToAssign([]);
                      } else {
                        setSelectedClassesToAssign(["Semua"]);
                      }
                    }}
                    className={`col-span-3 p-2 rounded-xl text-xs font-black transition-all cursor-pointer border ${
                      selectedClassesToAssign.includes("Semua")
                        ? "bg-brand-600 text-white border-brand-600 shadow-sm"
                        : "bg-white text-slate-700 border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    ⭐ Semua Kelas (Akses Penuh Seluruh Siswa)
                  </button>

                  {availableClassOptions.map((k) => {
                    const isSelected = selectedClassesToAssign.includes(k);
                    return (
                      <button
                        key={k}
                        type="button"
                        onClick={() => {
                          if (selectedClassesToAssign.includes("Semua")) {
                            setSelectedClassesToAssign([k]);
                          } else if (isSelected) {
                            setSelectedClassesToAssign(selectedClassesToAssign.filter((c) => c !== k));
                          } else {
                            setSelectedClassesToAssign([...selectedClassesToAssign, k]);
                          }
                        }}
                        className={`p-2 rounded-xl text-xs font-black transition-all cursor-pointer border ${
                          isSelected && !selectedClassesToAssign.includes("Semua")
                            ? "bg-brand-600 text-white border-brand-600 shadow-sm"
                            : "bg-white text-slate-700 border-slate-200 hover:bg-slate-100"
                        }`}
                      >
                        {k}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Actions */}
              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAssignModal(false)}
                  className="px-4 py-2.5 rounded-2xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-all cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleSaveTeacherAssignment}
                  disabled={isAssigning}
                  className="px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-2xl text-xs font-black transition-all cursor-pointer flex items-center gap-2 shadow-sm"
                >
                  {isAssigning ? "Menyimpan..." : "Simpan Izin Akses"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
