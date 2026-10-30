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
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  User,
  Layers,
  FileSpreadsheet
} from "lucide-react";
import { UserSession, Siswa, TujuhKaih, GuruPenugasan7Kaih, Profile } from "../../types";
import {
  getSiswaList,
  getTujuhKaihRekap,
  getGuruPenugasan7Kaih,
  assignGuruKelas7Kaih,
  assignMultipleGuruKelas7Kaih,
  removeGuruPenugasan7Kaih,
  unlockFinal7Kaih
} from "../../dbStore";
import { supabase } from "../../supabaseClient";
import {
  evaluate7KaihHabits,
  calculate7KaihProgress,
  getWeekRange,
  getMonthRange,
  MONTH_NAMES_ID,
  calculatePeriodSummary,
  exportRekapIndividuToExcel,
  exportRekapKelasToExcel,
  exportRekapHarianToExcel
} from "../../services/kaihService";
import { formatLocalDate, parseDateSafe } from "../../parseDateSafe";
import { compareClasses, toSentenceCase } from "../../formatName";
import * as XLSX from "xlsx";
import PaginationFooter from "../PaginationFooter";
import DetailPengerjaan7KaihModal from "./DetailPengerjaan7KaihModal";

interface Monitoring7KaihViewProps {
  userSession: UserSession;
}

export default function Monitoring7KaihView({ userSession }: Monitoring7KaihViewProps) {
  const isAdmin = userSession.role === "super_admin";
  const isKepsek = userSession.role === "kepala_sekolah";
  const isGuru = userSession.role === "guru";

  const [activeTab, setActiveTab] = useState<"rekap" | "penugasan">("rekap");

  // Mode Periode & Mode Tinjauan
  const [periodeMode, setPeriodeMode] = useState<"harian" | "mingguan" | "bulanan">("harian");
  const [tinjauanMode, setTinjauanMode] = useState<"kelas" | "individu">("kelas");

  // Filter States
  const [selectedDate, setSelectedDate] = useState<string>(() => formatLocalDate(new Date()));
  const [selectedWeekDate, setSelectedWeekDate] = useState<string>(() => formatLocalDate(new Date()));
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState<number>(() => now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(() => now.getMonth() + 1); // 1-12
  const [selectedKelas, setSelectedKelas] = useState<string>("Semua");
  const [selectedStudentId, setSelectedStudentId] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"Semua" | "Sudah Mengisi" | "Belum Mengisi">("Semua");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  // Rentang Tanggal Aktif Periode
  const currentWeekRange = useMemo(() => getWeekRange(selectedWeekDate), [selectedWeekDate]);
  const currentMonthRange = useMemo(() => getMonthRange(selectedYear, selectedMonth), [selectedYear, selectedMonth]);

  const activePeriodRange = useMemo(() => {
    if (periodeMode === "harian") {
      return { startDate: selectedDate, endDate: selectedDate, label: selectedDate };
    } else if (periodeMode === "mingguan") {
      return currentWeekRange;
    } else {
      return currentMonthRange;
    }
  }, [periodeMode, selectedDate, currentWeekRange, currentMonthRange]);

  const totalDaysInPeriod = useMemo(() => {
    if (periodeMode === "harian") return 1;
    if (periodeMode === "mingguan") return 7;
    return new Date(selectedYear, selectedMonth, 0).getDate();
  }, [periodeMode, selectedYear, selectedMonth]);

  const handleShiftWeek = (weeks: number) => {
    const d = parseDateSafe(selectedWeekDate);
    d.setDate(d.getDate() + (weeks * 7));
    setSelectedWeekDate(formatLocalDate(d));
  };

  const handleShiftMonth = (months: number) => {
    let nextMonth = selectedMonth + months;
    let nextYear = selectedYear;
    if (nextMonth > 12) {
      nextMonth = 1;
      nextYear += 1;
    } else if (nextMonth < 1) {
      nextMonth = 12;
      nextYear -= 1;
    }
    setSelectedMonth(nextMonth);
    setSelectedYear(nextYear);
  };

  // Reset pagination ke halaman 1 saat filter berubah
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedKelas, statusFilter, searchQuery, selectedDate, selectedWeekDate, selectedYear, selectedMonth, periodeMode, tinjauanMode, selectedStudentId]);

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
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<string[]>([]);
  const [teacherSearchQuery, setTeacherSearchQuery] = useState("");
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

  // Label ringkas kelas binaan untuk header agar tidak memenuhi layar mobile
  const kelasBinaanLabel = useMemo(() => {
    if (assignedClasses.includes("Semua")) return "Semua Kelas (Akses Penuh)";
    if (assignedClasses.length === 0) return "Belum Ada Kelas Ditugaskan";
    if (assignedClasses.length > 4) {
      return `${assignedClasses.slice(0, 4).join(", ")} +${assignedClasses.length - 4} lainnya`;
    }
    return assignedClasses.join(", ");
  }, [assignedClasses]);

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

  // Muat data siswa & rekap pengisian tanggal / periode terpilih
  const loadData = async () => {
    setIsLoading(true);
    try {
      const isHarian = periodeMode === "harian";
      const [siswa, rekap] = await Promise.all([
        getSiswaList(),
        getTujuhKaihRekap({
          tanggal: isHarian ? selectedDate : undefined,
          startDate: !isHarian ? activePeriodRange.startDate : undefined,
          endDate: !isHarian ? activePeriodRange.endDate : undefined,
          siswaId: tinjauanMode === "individu" && selectedStudentId ? selectedStudentId : undefined,
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
  }, [selectedDate, selectedWeekDate, selectedYear, selectedMonth, selectedKelas, selectedStudentId, periodeMode, tinjauanMode, userSession.id]);

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

  // Daftar siswa yang berada dalam kewenangan akses pengguna
  const scopedSiswa = useMemo(() => {
    let list = allSiswa;
    if ((isGuru || isKepsek) && !assignedClasses.includes("Semua")) {
      list = allSiswa.filter((s) => assignedClasses.includes(s.kelas));
    }
    return list;
  }, [allSiswa, isGuru, isKepsek, assignedClasses]);

  // Daftar siswa berdasarkan kelas yang dipilih
  const classScopedSiswa = useMemo(() => {
    if (selectedKelas === "Semua") return scopedSiswa;
    return scopedSiswa.filter((s) => s.kelas === selectedKelas);
  }, [scopedSiswa, selectedKelas]);

  // Set default selectedStudentId saat berpindah ke tinjauan individu jika belum ada
  useEffect(() => {
    if (tinjauanMode === "individu" && !selectedStudentId && classScopedSiswa.length > 0) {
      setSelectedStudentId(classScopedSiswa[0].id);
    }
  }, [tinjauanMode, selectedStudentId, classScopedSiswa]);

  // A. REKAP HARIAN: Baris siswa dengan record hari terpilih
  const dailyMergedRows = useMemo(() => {
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
  }, [scopedSiswa, rekapRecords]);

  // B. REKAP MINGGUAN / BULANAN (PER KELAS): Baris akumulasi per siswa
  const periodClassAggregatedRows = useMemo(() => {
    const recordMap = new Map<string, TujuhKaih[]>();
    rekapRecords.forEach((r) => {
      const list = recordMap.get(r.siswa_id) || [];
      list.push(r);
      recordMap.set(r.siswa_id, list);
    });

    return classScopedSiswa.map((s) => {
      const sRecords = recordMap.get(s.id) || [];
      const summary = calculatePeriodSummary(sRecords);
      const isFilled = summary.totalHariTerisi > 0;
      return {
        siswa: s,
        records: sRecords,
        summary,
        isFilled,
        progress: summary.avgProgress
      };
    });
  }, [classScopedSiswa, rekapRecords]);

  // C. REKAP INDIVIDU (PER INDIVIDU): Rincian tanggal per hari untuk murid terpilih
  const periodIndividualDailyRows = useMemo(() => {
    if (tinjauanMode !== "individu" || !selectedStudentId) return [];
    const sRecords = rekapRecords.filter((r) => r.siswa_id === selectedStudentId);
    const dateMap = new Map<string, TujuhKaih>();
    sRecords.forEach((r) => dateMap.set(r.tanggal, r));

    const rows: { tanggal: string; record: TujuhKaih | null; isFilled: boolean; progress: number }[] = [];
    const cur = parseDateSafe(activePeriodRange.startDate);
    const end = parseDateSafe(activePeriodRange.endDate);

    while (cur <= end) {
      const dStr = formatLocalDate(cur);
      const rec = dateMap.get(dStr) || null;
      rows.push({
        tanggal: dStr,
        record: rec,
        isFilled: !!rec,
        progress: rec ? (rec.progres_persen ?? calculate7KaihProgress(rec)) : 0
      });
      cur.setDate(cur.getDate() + 1);
    }
    return rows.reverse();
  }, [tinjauanMode, selectedStudentId, rekapRecords, activePeriodRange]);

  // Filter Harian
  const filteredDailyRows = useMemo(() => {
    return dailyMergedRows.filter((item) => {
      if (selectedKelas !== "Semua" && item.siswa.kelas !== selectedKelas) return false;
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
  }, [dailyMergedRows, selectedKelas, statusFilter, searchQuery]);

  // Filter Mingguan / Bulanan Per Kelas
  const filteredPeriodClassRows = useMemo(() => {
    return periodClassAggregatedRows.filter((item) => {
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
  }, [periodClassAggregatedRows, statusFilter, searchQuery]);

  // Pagination Helper
  const paginatedDailyRows = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredDailyRows.slice(start, start + itemsPerPage);
  }, [filteredDailyRows, currentPage, itemsPerPage]);

  const paginatedPeriodClassRows = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredPeriodClassRows.slice(start, start + itemsPerPage);
  }, [filteredPeriodClassRows, currentPage, itemsPerPage]);

  // Stats Ringkasan
  const dailyStats = useMemo(() => {
    const total = filteredDailyRows.length;
    const sudah = filteredDailyRows.filter((r) => r.isFilled).length;
    const belum = total - sudah;
    const avgProgress =
      sudah > 0
        ? Math.round(
            filteredDailyRows.reduce((acc, curr) => acc + (curr.record ? curr.progress : 0), 0) / sudah
          )
        : 0;
    return { total, sudah, belum, avgProgress };
  }, [filteredDailyRows]);

  const periodClassStats = useMemo(() => {
    const total = filteredPeriodClassRows.length;
    const aktif = filteredPeriodClassRows.filter((r) => r.isFilled).length;
    const kosong = total - aktif;
    const avgProgress =
      aktif > 0
        ? Math.round(
            filteredPeriodClassRows.reduce((acc, curr) => acc + curr.progress, 0) / aktif
          )
        : 0;
    return { total, aktif, kosong, avgProgress };
  }, [filteredPeriodClassRows]);

  const individualStudentStats = useMemo(() => {
    const sRecords = rekapRecords.filter((r) => r.siswa_id === selectedStudentId);
    return calculatePeriodSummary(sRecords);
  }, [rekapRecords, selectedStudentId]);

  // Export ke Excel (.xlsx) dengan deteksi Mode Periode & Tinjauan
  const handleExportExcel = () => {
    // 1. Ekspor Per Individu
    if (tinjauanMode === "individu") {
      const student = allSiswa.find((s) => s.id === selectedStudentId);
      if (!student) {
        alert("Pilih murid terlebih dahulu untuk mengekspor rekap hasil individu.");
        return;
      }
      const sRecords = rekapRecords.filter((r) => r.siswa_id === student.id);
      exportRekapIndividuToExcel(student, sRecords, activePeriodRange.label);
      return;
    }

    // 2. Ekspor Rekap Mingguan atau Bulanan Per Kelas
    if (periodeMode !== "harian") {
      exportRekapKelasToExcel(selectedKelas, rekapRecords, classScopedSiswa, activePeriodRange.label);
      return;
    }

    // 3. Ekspor Rekap Harian (Format Spreadsheet Rapi dengan Kop Resmi)
    if (filteredDailyRows.length === 0) {
      alert("Tidak ada data untuk diekspor pada tanggal ini.");
      return;
    }

    exportRekapHarianToExcel(selectedDate, selectedKelas, filteredDailyRows);
  };

  // Helper & Handler untuk Pilihan Guru (Termasuk Select Semua Guru)
  const isAllTeachersSelected = useMemo(() => {
    if (candidatesList.length === 0) return false;
    return candidatesList.every((t) => selectedCandidateIds.includes(t.id));
  }, [candidatesList, selectedCandidateIds]);

  const filteredCandidatesList = useMemo(() => {
    if (!teacherSearchQuery.trim()) return candidatesList;
    const q = teacherSearchQuery.toLowerCase();
    return candidatesList.filter(
      (t) =>
        (t.nama || "").toLowerCase().includes(q) ||
        (t.email || "").toLowerCase().includes(q)
    );
  }, [candidatesList, teacherSearchQuery]);

  const handleToggleSelectAllTeachers = () => {
    if (isAllTeachersSelected) {
      setSelectedCandidateIds([]);
    } else {
      setSelectedCandidateIds(candidatesList.map((t) => t.id));
    }
  };

  const handleSelectTeachersByRole = (role: "guru" | "kepala_sekolah") => {
    const roleTeachers = candidatesList.filter((t) => t.role === role);
    if (roleTeachers.length === 0) return;

    const roleIds = roleTeachers.map((t) => t.id);
    const allRoleSelected = roleIds.every((id) => selectedCandidateIds.includes(id));

    if (allRoleSelected) {
      setSelectedCandidateIds((prev) => prev.filter((id) => !roleIds.includes(id)));
    } else {
      setSelectedCandidateIds((prev) => Array.from(new Set([...prev, ...roleIds])));
    }
  };

  const handleToggleSingleTeacher = (teacherId: string) => {
    setSelectedCandidateIds((prev) =>
      prev.includes(teacherId)
        ? prev.filter((id) => id !== teacherId)
        : [...prev, teacherId]
    );
  };

  // Helper & Handler untuk Pilihan Akses Kelas (Termasuk Select Semua Kelas)
  const isAllClassesSelected = useMemo(() => {
    if (selectedClassesToAssign.includes("Semua")) return true;
    if (availableClassOptions.length === 0) return false;
    return availableClassOptions.every((c) => selectedClassesToAssign.includes(c));
  }, [selectedClassesToAssign, availableClassOptions]);

  const handleToggleSelectAll = () => {
    if (isAllClassesSelected) {
      setSelectedClassesToAssign([]);
    } else {
      setSelectedClassesToAssign(["Semua", ...availableClassOptions]);
    }
  };

  const handleSelectGrade = (gradePrefix: string) => {
    const gradeClasses = availableClassOptions.filter(
      (c) => c.startsWith(`${gradePrefix}-`) || c.startsWith(`${gradePrefix} `) || c === gradePrefix
    );
    if (gradeClasses.length === 0) return;

    const currentClean = selectedClassesToAssign.filter((c) => c !== "Semua");
    const allGradeSelected = gradeClasses.every((c) => currentClean.includes(c));

    let next: string[];
    if (allGradeSelected) {
      next = currentClean.filter((c) => !gradeClasses.includes(c));
    } else {
      next = Array.from(new Set([...currentClean, ...gradeClasses]));
    }

    if (availableClassOptions.length > 0 && availableClassOptions.every((c) => next.includes(c))) {
      setSelectedClassesToAssign(["Semua", ...availableClassOptions]);
    } else {
      setSelectedClassesToAssign(next);
    }
  };

  const handleToggleSingleClass = (k: string) => {
    let current = isAllClassesSelected
      ? [...availableClassOptions]
      : selectedClassesToAssign.filter((c) => c !== "Semua");

    if (current.includes(k)) {
      current = current.filter((c) => c !== k);
    } else {
      current = [...current, k];
    }

    if (availableClassOptions.length > 0 && availableClassOptions.every((c) => current.includes(c))) {
      setSelectedClassesToAssign(["Semua", ...availableClassOptions]);
    } else {
      setSelectedClassesToAssign(current);
    }
  };

  // Admin: Simpan Penugasan Guru / Kepsek (Mendukung Multi-Guru dan Multi-Kelas)
  const handleSaveTeacherAssignment = async () => {
    if (selectedCandidateIds.length === 0) {
      alert("Silakan pilih minimal satu guru atau kepala sekolah (atau klik 'Select Semua Guru')");
      return;
    }
    if (selectedClassesToAssign.length === 0 && !isAllClassesSelected) {
      alert("Pilih minimal satu kelas (atau 'Select Semua') untuk diberikan izin akses");
      return;
    }

    const finalClasses = isAllClassesSelected
      ? ["Semua"]
      : selectedClassesToAssign.filter((c) => c !== "Semua");

    setIsAssigning(true);
    try {
      const res = await assignMultipleGuruKelas7Kaih(selectedCandidateIds, finalClasses);
      if (res.success) {
        setToastMsg(`Izin akses berhasil disimpan untuk ${selectedCandidateIds.length} guru/kepala sekolah!`);
        loadAdminData();
        setShowAssignModal(false);
        setSelectedCandidateIds([]);
        setTeacherSearchQuery("");
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
      <div className="bg-gradient-to-r from-brand-900 via-brand-800 to-indigo-900 rounded-2xl sm:rounded-3xl p-5 sm:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-5 relative z-10">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 backdrop-blur-md text-[11px] sm:text-xs font-black uppercase tracking-wider mb-2.5 sm:mb-3">
              <Sparkles className="w-3.5 h-3.5 text-amber-300 shrink-0" />
              <span>7 Kebiasaan Anak Indonesia Hebat</span>
            </div>
            <h1 className="text-xl sm:text-3xl font-black tracking-tight">
              Jurnal 7 KAIH
            </h1>
            <p className="text-brand-200 text-xs sm:text-sm mt-1 max-w-2xl leading-relaxed">
              {isAdmin ? (
                "Monitoring capaian karakter murid harian dan kelola izin akses guru atau kepala sekolah."
              ) : (
                <span>
                  Pemantauan karakter murid kelas binaan:{" "}
                  <span
                    className="font-bold text-white bg-white/20 px-2 py-0.5 rounded-lg inline-block my-0.5"
                    title={assignedClasses.join(", ")}
                  >
                    {kelasBinaanLabel}
                  </span>
                </span>
              )}
            </p>
          </div>

          {/* Tab Switcher (Khusus Super Admin) */}
          {isAdmin && (
            <div className="bg-white/10 backdrop-blur-md p-1.5 rounded-2xl border border-white/20 flex items-center gap-1 self-stretch sm:self-start md:self-auto shrink-0">
              <button
                onClick={() => setActiveTab("rekap")}
                className={`flex-1 sm:flex-none text-center px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer ${
                  activeTab === "rekap"
                    ? "bg-white text-brand-900 shadow-md"
                    : "text-white hover:bg-white/15"
                }`}
              >
                Rekap Murid
              </button>
              <button
                onClick={() => setActiveTab("penugasan")}
                className={`flex-1 sm:flex-none justify-center px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeTab === "penugasan"
                    ? "bg-white text-brand-900 shadow-md"
                    : "text-white hover:bg-white/15"
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                <span>Izin Akses</span>
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
          {/* ======================================================== */}
          {/* SWITCHER MODE PERIODE & TINJAUAN                         */}
          {/* ======================================================== */}
          <div className="bg-white rounded-2xl sm:rounded-3xl p-3 sm:p-4 border border-slate-200/80 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-3 sm:gap-4">
            {/* Mode Periode */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2.5">
              <span className="text-[10px] sm:text-[11px] font-black text-slate-400 uppercase tracking-wider shrink-0">
                Periode:
              </span>
              <div className="bg-slate-100/90 p-1 rounded-xl flex items-center gap-1 w-full sm:w-auto">
                <button
                  onClick={() => setPeriodeMode("harian")}
                  className={`flex-1 sm:flex-none justify-center px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                    periodeMode === "harian"
                      ? "bg-white text-slate-900 shadow-2xs font-black"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <Calendar className="w-3.5 h-3.5 text-brand-600 shrink-0" />
                  <span>Harian</span>
                </button>
                <button
                  onClick={() => setPeriodeMode("mingguan")}
                  className={`flex-1 sm:flex-none justify-center px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                    periodeMode === "mingguan"
                      ? "bg-white text-slate-900 shadow-2xs font-black"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <Layers className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                  <span>Mingguan</span>
                </button>
                <button
                  onClick={() => setPeriodeMode("bulanan")}
                  className={`flex-1 sm:flex-none justify-center px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                    periodeMode === "bulanan"
                      ? "bg-white text-slate-900 shadow-2xs font-black"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Bulanan</span>
                </button>
              </div>
            </div>

            {/* Mode Tinjauan */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2.5">
              <span className="text-[10px] sm:text-[11px] font-black text-slate-400 uppercase tracking-wider shrink-0">
                Tinjauan:
              </span>
              <div className="bg-slate-100/90 p-1 rounded-xl flex items-center gap-1 w-full sm:w-auto">
                <button
                  onClick={() => setTinjauanMode("kelas")}
                  className={`flex-1 sm:flex-none justify-center px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                    tinjauanMode === "kelas"
                      ? "bg-brand-600 text-white shadow-2xs font-black"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <Users className="w-3.5 h-3.5 shrink-0" />
                  <span>Per Kelas</span>
                </button>
                <button
                  onClick={() => setTinjauanMode("individu")}
                  className={`flex-1 sm:flex-none justify-center px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                    tinjauanMode === "individu"
                      ? "bg-brand-600 text-white shadow-2xs font-black"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <User className="w-3.5 h-3.5 shrink-0" />
                  <span>Per Murid</span>
                </button>
              </div>
            </div>
          </div>

          {/* ======================================================== */}
          {/* KPI SUMMARY CARDS DYNAMIC                                */}
          {/* ======================================================== */}
          {tinjauanMode === "individu" ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              <div className="bg-white p-3.5 sm:p-5 rounded-2xl sm:rounded-3xl border border-slate-200/80 shadow-xs flex items-center gap-3 sm:gap-4">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-brand-50 text-brand-700 flex items-center justify-center border border-brand-100 shrink-0">
                  <Calendar className="w-5 h-5 sm:w-6 sm:h-6" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] sm:text-xs text-slate-400 font-bold uppercase tracking-wider truncate">Hari Mengisi</p>
                  <h3 className="text-xl sm:text-2xl font-black text-brand-950">
                    {individualStudentStats.totalHariTerisi}{" "}
                    <span className="text-[10px] sm:text-xs font-bold text-slate-400">/ {totalDaysInPeriod}</span>
                  </h3>
                </div>
              </div>

              <div className="bg-white p-3.5 sm:p-5 rounded-2xl sm:rounded-3xl border border-slate-200/80 shadow-xs flex items-center gap-3 sm:gap-4">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-100 shrink-0">
                  <Award className="w-5 h-5 sm:w-6 sm:h-6" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] sm:text-xs text-slate-400 font-bold uppercase tracking-wider truncate">Rata-rata Capaian</p>
                  <h3 className="text-xl sm:text-2xl font-black text-emerald-700">{individualStudentStats.avgProgress}%</h3>
                </div>
              </div>

              <div className="bg-white p-3.5 sm:p-5 rounded-2xl sm:rounded-3xl border border-slate-200/80 shadow-xs flex items-center gap-3 sm:gap-4">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-indigo-50 text-indigo-700 flex items-center justify-center border border-indigo-100 shrink-0">
                  <BookOpen className="w-5 h-5 sm:w-6 sm:h-6" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] sm:text-xs text-slate-400 font-bold uppercase tracking-wider truncate">Total Belajar</p>
                  <h3 className="text-xl sm:text-2xl font-black text-indigo-700">
                    {individualStudentStats.totalDurasiBelajar}{" "}
                    <span className="text-[10px] sm:text-xs font-bold text-slate-400">Mnt</span>
                  </h3>
                </div>
              </div>

              <div className="bg-white p-3.5 sm:p-5 rounded-2xl sm:rounded-3xl border border-slate-200/80 shadow-xs flex items-center gap-3 sm:gap-4">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-amber-50 text-amber-700 flex items-center justify-center border border-amber-100 shrink-0">
                  <Dumbbell className="w-5 h-5 sm:w-6 sm:h-6" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] sm:text-xs text-slate-400 font-bold uppercase tracking-wider truncate">Olahraga</p>
                  <h3 className="text-xl sm:text-2xl font-black text-amber-700">
                    {individualStudentStats.olahragaSudahCount}{" "}
                    <span className="text-[10px] sm:text-xs font-bold text-slate-400">Sesi</span>
                  </h3>
                </div>
              </div>
            </div>
          ) : periodeMode === "harian" ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              <div className="bg-white p-3.5 sm:p-5 rounded-2xl sm:rounded-3xl border border-slate-200/80 shadow-xs flex items-center gap-3 sm:gap-4">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-brand-50 text-brand-700 flex items-center justify-center border border-brand-100 shrink-0">
                  <Users className="w-5 h-5 sm:w-6 sm:h-6" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] sm:text-xs text-slate-400 font-bold uppercase tracking-wider truncate">Total Murid</p>
                  <h3 className="text-xl sm:text-2xl font-black text-brand-950">{dailyStats.total}</h3>
                </div>
              </div>

              <div className="bg-white p-3.5 sm:p-5 rounded-2xl sm:rounded-3xl border border-slate-200/80 shadow-xs flex items-center gap-3 sm:gap-4">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-100 shrink-0">
                  <CheckCircle2 className="w-5 h-5 sm:w-6 sm:h-6" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] sm:text-xs text-slate-400 font-bold uppercase tracking-wider truncate">Sudah Mengisi</p>
                  <h3 className="text-xl sm:text-2xl font-black text-emerald-700">{dailyStats.sudah}</h3>
                </div>
              </div>

              <div className="bg-white p-3.5 sm:p-5 rounded-2xl sm:rounded-3xl border border-slate-200/80 shadow-xs flex items-center gap-3 sm:gap-4">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-rose-50 text-rose-700 flex items-center justify-center border border-rose-100 shrink-0">
                  <AlertCircle className="w-5 h-5 sm:w-6 sm:h-6" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] sm:text-xs text-slate-400 font-bold uppercase tracking-wider truncate">Belum Mengisi</p>
                  <h3 className="text-xl sm:text-2xl font-black text-rose-700">{dailyStats.belum}</h3>
                </div>
              </div>

              <div className="bg-white p-3.5 sm:p-5 rounded-2xl sm:rounded-3xl border border-slate-200/80 shadow-xs flex items-center gap-3 sm:gap-4">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-amber-50 text-amber-700 flex items-center justify-center border border-amber-100 shrink-0">
                  <Award className="w-5 h-5 sm:w-6 sm:h-6" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] sm:text-xs text-slate-400 font-bold uppercase tracking-wider truncate">Rata-rata Progres</p>
                  <h3 className="text-xl sm:text-2xl font-black text-amber-700">{dailyStats.avgProgress}%</h3>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              <div className="bg-white p-3.5 sm:p-5 rounded-2xl sm:rounded-3xl border border-slate-200/80 shadow-xs flex items-center gap-3 sm:gap-4">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-brand-50 text-brand-700 flex items-center justify-center border border-brand-100 shrink-0">
                  <Users className="w-5 h-5 sm:w-6 sm:h-6" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] sm:text-xs text-slate-400 font-bold uppercase tracking-wider truncate">Total Murid</p>
                  <h3 className="text-xl sm:text-2xl font-black text-brand-950">{periodClassStats.total}</h3>
                </div>
              </div>

              <div className="bg-white p-3.5 sm:p-5 rounded-2xl sm:rounded-3xl border border-slate-200/80 shadow-xs flex items-center gap-3 sm:gap-4">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-100 shrink-0">
                  <CheckCircle2 className="w-5 h-5 sm:w-6 sm:h-6" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] sm:text-xs text-slate-400 font-bold uppercase tracking-wider truncate">Aktif Mengisi</p>
                  <h3 className="text-xl sm:text-2xl font-black text-emerald-700">{periodClassStats.aktif}</h3>
                </div>
              </div>

              <div className="bg-white p-3.5 sm:p-5 rounded-2xl sm:rounded-3xl border border-slate-200/80 shadow-xs flex items-center gap-3 sm:gap-4">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-indigo-50 text-indigo-700 flex items-center justify-center border border-indigo-100 shrink-0">
                  <Calendar className="w-5 h-5 sm:w-6 sm:h-6" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] sm:text-xs text-slate-400 font-bold uppercase tracking-wider truncate">Periode</p>
                  <h3 className="text-sm sm:text-base font-black text-indigo-950 truncate" title={activePeriodRange.label}>
                    {activePeriodRange.label}
                  </h3>
                </div>
              </div>

              <div className="bg-white p-3.5 sm:p-5 rounded-2xl sm:rounded-3xl border border-slate-200/80 shadow-xs flex items-center gap-3 sm:gap-4">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-amber-50 text-amber-700 flex items-center justify-center border border-amber-100 shrink-0">
                  <Award className="w-5 h-5 sm:w-6 sm:h-6" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] sm:text-xs text-slate-400 font-bold uppercase tracking-wider truncate">Rata-rata Capaian</p>
                  <h3 className="text-xl sm:text-2xl font-black text-amber-700">{periodClassStats.avgProgress}%</h3>
                </div>
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* FILTER BAR & NAVIGATOR                                    */}
          {/* ======================================================== */}
          <div className="bg-white rounded-2xl sm:rounded-3xl p-3 sm:p-4 border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {/* 1. Selector Tanggal / Minggu / Bulan */}
              {periodeMode === "harian" && (
                <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200 text-xs w-full sm:w-auto justify-between sm:justify-start">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="text-slate-500 font-medium sm:hidden">Tanggal:</span>
                  </div>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="bg-transparent font-bold text-slate-900 outline-none cursor-pointer"
                  />
                </div>
              )}

              {periodeMode === "mingguan" && (
                <div className="flex items-center justify-between sm:justify-start gap-1 bg-slate-50 px-2 py-1 rounded-xl border border-slate-200 text-xs w-full sm:w-auto">
                  <button
                    onClick={() => handleShiftWeek(-1)}
                    title="Minggu Sebelumnya"
                    className="p-1 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors cursor-pointer"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <span className="font-bold text-slate-900 px-1 whitespace-nowrap text-center text-[11px] sm:text-xs">
                    {currentWeekRange.label}
                  </span>
                  <button
                    onClick={() => handleShiftWeek(1)}
                    title="Minggu Berikutnya"
                    className="p-1 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors cursor-pointer"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {periodeMode === "bulanan" && (
                <div className="flex items-center justify-between sm:justify-start gap-1 bg-slate-50 px-2 py-1 rounded-xl border border-slate-200 text-xs w-full sm:w-auto">
                  <button
                    onClick={() => handleShiftMonth(-1)}
                    title="Bulan Sebelumnya"
                    className="p-1 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors cursor-pointer"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <select
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(Number(e.target.value))}
                    className="bg-transparent font-bold text-slate-900 outline-none cursor-pointer"
                  >
                    {MONTH_NAMES_ID.map((mName, i) => (
                      <option key={mName} value={i + 1}>
                        {mName}
                      </option>
                    ))}
                  </select>
                  <select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(Number(e.target.value))}
                    className="bg-transparent font-bold text-slate-900 outline-none cursor-pointer"
                  >
                    {[2024, 2025, 2026, 2027].map((yr) => (
                      <option key={yr} value={yr}>
                        {yr}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => handleShiftMonth(1)}
                    title="Bulan Berikutnya"
                    className="p-1 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors cursor-pointer"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* 2. Filter Kelas */}
              <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1.5 rounded-xl border border-slate-200 text-xs flex-1 sm:flex-none justify-between sm:justify-start">
                <span className="font-medium text-slate-500 shrink-0">Kelas:</span>
                <select
                  value={selectedKelas}
                  onChange={(e) => setSelectedKelas(e.target.value)}
                  className="bg-transparent font-bold text-slate-900 outline-none cursor-pointer min-w-0"
                >
                  <option value="Semua">Semua Kelas</option>
                  {availableClassOptions.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              {/* 3. Selector Murid (Khusus Tinjauan Individu) */}
              {tinjauanMode === "individu" && (
                <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1.5 rounded-xl border border-slate-200 text-xs w-full sm:w-auto justify-between sm:justify-start">
                  <span className="font-medium text-slate-500 shrink-0">Murid:</span>
                  <select
                    value={selectedStudentId}
                    onChange={(e) => setSelectedStudentId(e.target.value)}
                    className="bg-transparent font-bold text-slate-900 outline-none cursor-pointer w-full sm:max-w-[200px] truncate"
                  >
                    {classScopedSiswa.length === 0 ? (
                      <option value="">Tidak ada murid</option>
                    ) : (
                      classScopedSiswa.map((s) => (
                        <option key={s.id} value={s.id}>
                          {toSentenceCase(s.nama)} ({s.kelas})
                        </option>
                      ))
                    )}
                  </select>
                </div>
              )}

              {/* 4. Filter Status (Khusus Tinjauan Kelas) */}
              {tinjauanMode === "kelas" && (
                <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1.5 rounded-xl border border-slate-200 text-xs flex-1 sm:flex-none justify-between sm:justify-start">
                  <span className="font-medium text-slate-500 shrink-0">Status:</span>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as any)}
                    className="bg-transparent font-bold text-slate-900 outline-none cursor-pointer min-w-0"
                  >
                    <option value="Semua">Semua</option>
                    <option value="Sudah Mengisi">Sudah Mengisi</option>
                    <option value="Belum Mengisi">Belum Mengisi</option>
                  </select>
                </div>
              )}
            </div>

            {/* Kanan: Search & Export */}
            <div className="flex items-center gap-2 w-full md:w-auto">
              {tinjauanMode === "kelas" && (
                <div className="relative flex-1 md:w-56">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Cari nama / NIS..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-slate-50 pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 text-xs text-slate-800 outline-none focus:bg-white focus:border-brand-500 transition-colors"
                  />
                </div>
              )}

              <button
                onClick={handleExportExcel}
                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-2xs whitespace-nowrap shrink-0"
                title="Unduh laporan ke file Excel (.xlsx)"
              >
                <Download className="w-3.5 h-3.5 shrink-0" />
                <span>Export Excel</span>
              </button>
            </div>
          </div>

          {/* ======================================================== */}
          {/* DATA TABLES BERDASARKAN MODE PERIODE & TINJAUAN          */}
          {/* ======================================================== */}
          <div className="bg-white rounded-2xl sm:rounded-3xl border border-brand-100 shadow-sm overflow-hidden">
            {/* Mobile Scroll Hint */}
            <div className="block sm:hidden px-4 py-2 bg-slate-50/90 border-b border-slate-100 text-[10px] font-bold text-slate-500 flex items-center justify-between">
              <span>Geser tabel untuk melihat data lengkap</span>
              <span className="text-brand-600">⇄</span>
            </div>

            {isLoading ? (
              <div className="py-20 text-center text-slate-400 space-y-3">
                <div className="w-8 h-8 border-3 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-xs font-bold">Memuat data Jurnal 7 KAIH...</p>
              </div>
            ) : tinjauanMode === "individu" ? (
              /* TABEL TINJAUAN PER INDIVIDU (Kronologi Hari-Hari) */
              periodIndividualDailyRows.length === 0 ? (
                <div className="py-20 text-center text-slate-400 space-y-2">
                  <User className="w-12 h-12 mx-auto text-slate-300" />
                  <p className="text-sm font-bold text-slate-700">Pilih murid untuk melihat rekap pengerjaan individu</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[620px] text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50/75 border-b border-slate-100 text-[11px] font-black uppercase tracking-wider text-slate-500">
                        <th className="py-4 px-5 whitespace-nowrap">Tanggal</th>
                        <th className="py-4 px-4 text-center whitespace-nowrap">Status</th>
                        <th className="py-4 px-4 whitespace-nowrap">Capaian 7 Kebiasaan</th>
                        <th className="py-4 px-4 text-center whitespace-nowrap">Progres</th>
                        <th className="py-4 px-5 text-right whitespace-nowrap">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {periodIndividualDailyRows.map((row) => {
                        const sStudent = allSiswa.find((s) => s.id === selectedStudentId);
                        const evaluations = row.record ? evaluate7KaihHabits(row.record) : [];
                        const completedCount = evaluations.filter((e) => e.status === "selesai").length;

                        return (
                          <tr key={row.tanggal} className="hover:bg-slate-50/70 transition-colors">
                            <td className="py-3.5 px-5">
                              <div className="flex items-center gap-2.5">
                                <Calendar className="w-4 h-4 text-brand-600 shrink-0" />
                                <span className="font-bold text-brand-950 whitespace-nowrap">
                                  {parseDateSafe(row.tanggal).toLocaleDateString("id-ID", {
                                    weekday: "long",
                                    day: "numeric",
                                    month: "short",
                                    year: "numeric"
                                  })}
                                </span>
                              </div>
                            </td>
                            <td className="py-3.5 px-4 text-center">
                              {row.isFilled ? (
                                row.record?.is_final ? (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 font-black text-[10px] border border-emerald-300 whitespace-nowrap">
                                    <Lock className="w-3 h-3 text-emerald-600" />
                                    Terkirim Final
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-cyan-50 text-cyan-800 font-black text-[10px] border border-cyan-200 whitespace-nowrap">
                                    <CheckCircle2 className="w-3 h-3 text-cyan-600" />
                                    Draft
                                  </span>
                                )
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 font-black text-[10px] border border-rose-200 whitespace-nowrap">
                                  <AlertCircle className="w-3 h-3" />
                                  Kosong
                                </span>
                              )}
                            </td>
                            <td className="py-3.5 px-4">
                              {row.isFilled ? (
                                <div className="flex items-center gap-1 whitespace-nowrap">
                                  {evaluations.map((ev, i) => (
                                    <div
                                      key={ev.id}
                                      title={`${i + 1}. ${ev.title}: ${ev.summary}`}
                                      className={`w-5 h-5 rounded-lg flex items-center justify-center text-[10px] font-black cursor-help shrink-0 ${
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
                                <span className="text-[11px] text-slate-400 italic">Belum mengisi</span>
                              )}
                            </td>
                            <td className="py-3.5 px-4 text-center">
                              <span className="font-black text-xs text-brand-950">
                                {row.progress}%
                              </span>
                            </td>
                            <td className="py-3.5 px-5 text-right">
                              <button
                                onClick={() => {
                                  if (sStudent) {
                                    setDetailModalStudent(sStudent);
                                    setDetailModalRecord(row.record);
                                  }
                                }}
                                className="px-3 py-1.5 bg-brand-50 hover:bg-brand-100 text-brand-700 border border-brand-200 rounded-xl text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-1.5 shadow-2xs whitespace-nowrap"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span>Rincian</span>
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )
            ) : periodeMode !== "harian" ? (
              /* TABEL REKAP MINGGUAN / BULANAN (PER KELAS) */
              filteredPeriodClassRows.length === 0 ? (
                <div className="py-20 text-center text-slate-400 space-y-2">
                  <Users className="w-12 h-12 mx-auto text-slate-300" />
                  <p className="text-sm font-bold text-slate-700">Tidak ada data murid yang ditemukan pada periode ini</p>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[760px] text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50/75 border-b border-slate-100 text-[11px] font-black uppercase tracking-wider text-slate-500">
                          <th className="py-4 px-5 whitespace-nowrap">Murid</th>
                          <th className="py-4 px-4 whitespace-nowrap">Kelas</th>
                          <th className="py-4 px-4 text-center whitespace-nowrap">Keaktifan Mengisi</th>
                          <th className="py-4 px-4 text-center whitespace-nowrap">Rata-rata Progres</th>
                          <th className="py-4 px-4 whitespace-nowrap">Ringkasan 7 Kebiasaan</th>
                          <th className="py-4 px-5 text-right whitespace-nowrap">Aksi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs">
                        {paginatedPeriodClassRows.map((item) => {
                          const s = item.summary;
                          const fillPercent = Math.round((s.totalHariTerisi / totalDaysInPeriod) * 100);

                          return (
                            <tr key={item.siswa.id} className="hover:bg-slate-50/70 transition-colors">
                              <td className="py-3.5 px-5">
                                <div
                                  onClick={() => {
                                    setDetailModalStudent(item.siswa);
                                    setDetailModalRecord(null);
                                  }}
                                  className="flex items-center gap-3 cursor-pointer group"
                                  title="Klik untuk melihat detail & riwayat lengkap murid"
                                >
                                  {item.siswa.foto_url ? (
                                    <img
                                      src={item.siswa.foto_url}
                                      alt={item.siswa.nama}
                                      className="w-9 h-9 rounded-xl object-cover border border-slate-200 group-hover:border-brand-500 transition-colors shrink-0"
                                    />
                                  ) : (
                                    <div className="w-9 h-9 rounded-xl bg-brand-100 text-brand-700 flex items-center justify-center font-black text-xs group-hover:bg-brand-600 group-hover:text-white transition-colors shrink-0">
                                      {item.siswa.nama.slice(0, 2).toUpperCase()}
                                    </div>
                                  )}
                                  <div className="min-w-0">
                                    <h4 className="font-black text-brand-950 group-hover:text-brand-600 transition-colors truncate max-w-[140px] sm:max-w-[200px]">
                                      {toSentenceCase(item.siswa.nama)}
                                    </h4>
                                    <p className="text-[10px] text-slate-400 font-bold">NIS: {item.siswa.nis}</p>
                                  </div>
                                </div>
                              </td>

                              <td className="py-3.5 px-4 font-bold text-slate-700 whitespace-nowrap">
                                <span className="px-2.5 py-1 rounded-xl bg-slate-100 text-slate-700 font-black text-[11px]">
                                  {item.siswa.kelas}
                                </span>
                              </td>

                              <td className="py-3.5 px-4 text-center whitespace-nowrap">
                                <div className="inline-flex flex-col items-center">
                                  <span className={`px-2.5 py-1 rounded-full font-black text-[11px] border ${
                                    fillPercent >= 80
                                      ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                                      : fillPercent >= 40
                                      ? "bg-amber-50 text-amber-800 border-amber-300"
                                      : "bg-rose-50 text-rose-800 border-rose-300"
                                  }`}>
                                    {s.totalHariTerisi} / {totalDaysInPeriod} Hari ({fillPercent}%)
                                  </span>
                                </div>
                              </td>

                              <td className="py-3.5 px-4 text-center whitespace-nowrap">
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

                              <td className="py-3.5 px-4 min-w-[220px]">
                                <div className="text-[11px] text-slate-600 space-y-0.5 whitespace-nowrap">
                                  <p>
                                    <span className="font-bold text-slate-700">Bangun:</span> {s.bangunPagiTargetMetCount}x •{" "}
                                    <span className="font-bold text-slate-700">Salat:</span> {s.salat5WaktuLengkapCount}x •{" "}
                                    <span className="font-bold text-slate-700">Tadarus:</span> {s.mengajiSudahCount}x
                                  </p>
                                  <p>
                                    <span className="font-bold text-slate-700">Olahraga:</span> {s.olahragaSudahCount}x ({s.totalDurasiOlahraga} m) •{" "}
                                    <span className="font-bold text-slate-700">Belajar:</span> {s.totalDurasiBelajar} m
                                  </p>
                                </div>
                              </td>

                              <td className="py-3.5 px-5 text-right whitespace-nowrap">
                                <div className="flex items-center justify-end gap-1.5">
                                  <button
                                    onClick={() => {
                                      setDetailModalStudent(item.siswa);
                                      setDetailModalRecord(null);
                                    }}
                                    className="px-2.5 py-1.5 bg-brand-50 hover:bg-brand-100 text-brand-700 rounded-xl text-xs font-bold transition-all cursor-pointer border border-brand-200 inline-flex items-center gap-1 shadow-2xs"
                                    title="Lihat detail pengerjaan & riwayat murid"
                                  >
                                    <Eye className="w-3.5 h-3.5" />
                                    <span>Detail</span>
                                  </button>
                                  <button
                                    onClick={() => exportRekapIndividuToExcel(item.siswa, item.records, activePeriodRange.label)}
                                    className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-xl text-xs font-bold transition-all cursor-pointer border border-emerald-200 inline-flex items-center gap-1 shadow-2xs"
                                    title="Export rekap pengerjaan murid ini ke Excel (.xlsx)"
                                  >
                                    <Download className="w-3.5 h-3.5" />
                                    <span className="hidden sm:inline">Excel</span>
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <PaginationFooter
                    totalItems={filteredPeriodClassRows.length}
                    itemsPerPage={itemsPerPage}
                    currentPage={currentPage}
                    setCurrentPage={setCurrentPage}
                    itemLabel="murid"
                  />
                </>
              )
            ) : (
              /* TABEL HARIAN (DEFAULT) */
              filteredDailyRows.length === 0 ? (
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
                    <table className="w-full min-w-[720px] text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50/75 border-b border-slate-100 text-[11px] font-black uppercase tracking-wider text-slate-500">
                          <th className="py-4 px-5 whitespace-nowrap">Murid</th>
                          <th className="py-4 px-4 whitespace-nowrap">Kelas</th>
                          <th className="py-4 px-4 text-center whitespace-nowrap">Status Pengisian</th>
                          <th className="py-4 px-4 whitespace-nowrap">Capaian 7 Kebiasaan</th>
                          <th className="py-4 px-4 text-center whitespace-nowrap">Progres</th>
                          <th className="py-4 px-5 text-right whitespace-nowrap">Aksi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs">
                        {paginatedDailyRows.map((item) => {
                          const completedCount = item.evaluations.filter((e) => e.status === "selesai").length;

                          return (
                            <tr key={item.siswa.id} className="hover:bg-slate-50/70 transition-colors">
                              <td className="py-3.5 px-5">
                                <div
                                  onClick={() => {
                                    setDetailModalStudent(item.siswa);
                                    setDetailModalRecord(item.record);
                                  }}
                                  className="flex items-center gap-3 cursor-pointer group"
                                  title="Klik untuk melihat detail pengerjaan murid"
                                >
                                  {item.siswa.foto_url ? (
                                    <img
                                      src={item.siswa.foto_url}
                                      alt={item.siswa.nama}
                                      className="w-9 h-9 rounded-xl object-cover border border-slate-200 group-hover:border-brand-500 transition-colors shrink-0"
                                    />
                                  ) : (
                                    <div className="w-9 h-9 rounded-xl bg-brand-100 text-brand-700 flex items-center justify-center font-black text-xs group-hover:bg-brand-600 group-hover:text-white transition-colors shrink-0">
                                      {item.siswa.nama.slice(0, 2).toUpperCase()}
                                    </div>
                                  )}
                                  <div className="min-w-0">
                                    <h4 className="font-black text-brand-950 group-hover:text-brand-600 transition-colors truncate max-w-[140px] sm:max-w-[200px]">
                                      {toSentenceCase(item.siswa.nama)}
                                    </h4>
                                    <p className="text-[10px] text-slate-400 font-bold">NIS: {item.siswa.nis}</p>
                                  </div>
                                </div>
                              </td>

                              <td className="py-3.5 px-4 font-bold text-slate-700 whitespace-nowrap">
                                <span className="px-2.5 py-1 rounded-xl bg-slate-100 text-slate-700 font-black text-[11px]">
                                  {item.siswa.kelas}
                                </span>
                              </td>

                              <td className="py-3.5 px-4 text-center whitespace-nowrap">
                                {item.isFilled ? (
                                  item.record?.is_final ? (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 font-black text-[10px] border border-emerald-300">
                                      <Lock className="w-3 h-3 text-emerald-600" />
                                      Terkirim Final
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-cyan-50 text-cyan-800 font-black text-[10px] border border-cyan-200">
                                      <CheckCircle2 className="w-3 h-3 text-cyan-600" />
                                      Draft
                                    </span>
                                  )
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 font-black text-[10px] border border-rose-200">
                                    <AlertCircle className="w-3 h-3" />
                                    Belum Mengisi
                                  </span>
                                )}
                              </td>

                              <td className="py-3.5 px-4 whitespace-nowrap">
                                {item.isFilled ? (
                                  <div className="flex items-center gap-1">
                                    {item.evaluations.map((ev, i) => (
                                      <div
                                        key={ev.id}
                                        title={`${i + 1}. ${ev.title}: ${ev.summary}`}
                                        className={`w-5 h-5 rounded-lg flex items-center justify-center text-[10px] font-black cursor-help shrink-0 ${
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

                              <td className="py-3.5 px-4 text-center whitespace-nowrap">
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

                              <td className="py-3.5 px-5 text-right whitespace-nowrap">
                                <button
                                  onClick={() => {
                                    setDetailModalStudent(item.siswa);
                                    setDetailModalRecord(item.record);
                                  }}
                                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-1.5 shadow-2xs whitespace-nowrap ${
                                    item.isFilled
                                      ? "bg-brand-50 hover:bg-brand-100 text-brand-700 border border-brand-200"
                                      : "bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-200"
                                  }`}
                                  title={item.isFilled ? "Lihat rincian pengerjaan jurnal hari ini" : "Lihat detail & riwayat jurnal murid"}
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                  <span>Detail</span>
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <PaginationFooter
                    totalItems={filteredDailyRows.length}
                    itemsPerPage={itemsPerPage}
                    currentPage={currentPage}
                    setCurrentPage={setCurrentPage}
                    itemLabel="murid"
                  />
                </>
              )
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
              <h2 className="text-lg font-black text-brand-950">Izin Akses & Penugasan Jurnal 7 KAIH</h2>
              <p className="text-xs text-slate-500 font-medium">
                Pilih guru atau kepala sekolah yang diberi izin untuk memantau data Jurnal 7 KAIH.
              </p>
            </div>
            <button
              onClick={() => {
                setSelectedCandidateIds([]);
                setTeacherSearchQuery("");
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
                  Fitur Jurnal 7 KAIH saat ini hanya aktif di Super Admin dan Murid. Berikan izin akses melalui tombol di atas.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/75 border-b border-slate-100 text-[11px] font-black uppercase tracking-wider text-slate-500">
                      <th className="py-4 px-5 whitespace-nowrap">Nama Pengguna</th>
                      <th className="py-4 px-4 whitespace-nowrap">Email</th>
                      <th className="py-4 px-4 whitespace-nowrap">Kelas yang Diizinkan</th>
                      <th className="py-4 px-5 text-right whitespace-nowrap">Aksi</th>
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
                                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl font-black text-xs border ${
                                    ga.kelas === "Semua"
                                      ? "bg-amber-50 text-amber-900 border-amber-300 shadow-2xs"
                                      : "bg-brand-50 text-brand-700 border-brand-200"
                                  }`}
                                >
                                  {ga.kelas === "Semua" ? "⭐ Semua Kelas (Akses Penuh)" : ga.kelas}
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
                                setSelectedCandidateIds([guruId]);
                                setTeacherSearchQuery("");
                                const existingClasses = userAssignments.map((g) => g.kelas);
                                if (existingClasses.includes("Semua")) {
                                  setSelectedClassesToAssign(["Semua", ...availableClassOptions]);
                                } else {
                                  setSelectedClassesToAssign(existingClasses);
                                }
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
      {/* MODAL RINCIAN & DETAIL PENGERJAAN MURID 7 KAIH           */}
      {/* ======================================================== */}
      <DetailPengerjaan7KaihModal
        isOpen={!!detailModalStudent}
        onClose={() => {
          setDetailModalStudent(null);
          setDetailModalRecord(null);
        }}
        student={detailModalStudent}
        initialDate={selectedDate}
        initialRecord={detailModalRecord}
        userRole={userSession.role}
        onUnlocked={() => {
          loadData();
        }}
      />

      {/* ======================================================== */}
      {/* MODAL PENUGASAN: HANYA GURU & KEPALA SEKOLAH             */}
      {/* ======================================================== */}
      <AnimatePresence>
        {isAdmin && showAssignModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowAssignModal(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 10 }}
              className="bg-white rounded-3xl p-4 sm:p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto relative z-10 shadow-2xl border border-slate-100 space-y-4"
            >
              {/* Header Modal */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div>
                  <h3 className="text-base font-black text-slate-900">Izin Akses Jurnal 7 KAIH</h3>
                  <p className="text-xs text-slate-500 font-medium">
                    Atur wewenang pemantauan untuk guru dan kepala sekolah
                  </p>
                </div>
                <button
                  onClick={() => setShowAssignModal(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* 1. Pilih Guru / Kepala Sekolah */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5 font-bold text-slate-800">
                    <User className="w-3.5 h-3.5 text-brand-600" />
                    <span>Pilih Guru:</span>
                    <span className="text-[11px] font-semibold text-slate-400">
                      ({isAllTeachersSelected ? "Semua dipilih" : `${selectedCandidateIds.length} dipilih`})
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={handleToggleSelectAllTeachers}
                      className="px-2 py-0.5 rounded-lg text-[11px] font-bold text-brand-700 bg-brand-50 hover:bg-brand-100 transition-colors cursor-pointer"
                    >
                      {isAllTeachersSelected ? "Batal Semua" : "Pilih Semua"}
                    </button>
                    {selectedCandidateIds.length > 0 && !isAllTeachersSelected && (
                      <button
                        type="button"
                        onClick={() => setSelectedCandidateIds([])}
                        className="px-1.5 py-0.5 rounded-lg text-[11px] font-bold text-slate-500 hover:bg-slate-100 transition-colors cursor-pointer"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                </div>

                {/* Filter Role & Search Guru */}
                <div className="space-y-1.5">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Cari nama guru atau email..."
                      value={teacherSearchQuery}
                      onChange={(e) => setTeacherSearchQuery(e.target.value)}
                      className="w-full bg-slate-50 pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 text-xs text-slate-800 outline-none focus:bg-white focus:border-brand-500"
                    />
                  </div>

                  {/* Filter Role Quick Pills */}
                  <div className="flex items-center gap-1 text-[11px]">
                    <button
                      type="button"
                      onClick={() => handleSelectTeachersByRole("guru")}
                      className="px-2 py-0.5 rounded-lg font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
                    >
                      Hanya Guru
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSelectTeachersByRole("kepala_sekolah")}
                      className="px-2 py-0.5 rounded-lg font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
                    >
                      Hanya Kepsek
                    </button>
                  </div>
                </div>

                {/* List Guru */}
                <div className="border border-slate-200 rounded-2xl max-h-40 overflow-y-auto divide-y divide-slate-100 bg-slate-50/50">
                  {filteredCandidatesList.length === 0 ? (
                    <p className="text-center text-xs text-slate-400 py-4">Guru tidak ditemukan</p>
                  ) : (
                    filteredCandidatesList.map((t) => {
                      const isSelected = selectedCandidateIds.includes(t.id);
                      return (
                        <div
                          key={t.id}
                          onClick={() => handleToggleSingleTeacher(t.id)}
                          className={`px-3 py-2 text-xs flex items-center justify-between gap-2.5 cursor-pointer transition-colors ${
                            isSelected ? "bg-brand-50/70 text-brand-950" : "hover:bg-white text-slate-700"
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div
                              className={`w-4 h-4 rounded-md flex items-center justify-center shrink-0 border transition-all ${
                                isSelected ? "bg-brand-600 border-brand-600 text-white" : "border-slate-300 bg-white"
                              }`}
                            >
                              {isSelected && <Check className="w-3 h-3" />}
                            </div>
                            <div className="min-w-0">
                              <p className="font-bold truncate text-xs">{toSentenceCase(t.nama)}</p>
                              <p className="text-[10px] text-slate-400 truncate">{t.email || "-"}</p>
                            </div>
                          </div>
                          <span
                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
                              t.role === "kepala_sekolah"
                                ? "bg-indigo-50 text-indigo-700 border border-indigo-200"
                                : "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {t.role === "kepala_sekolah" ? "Kepsek" : "Guru"}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* 2. Pilih Akses Kelas */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5 font-bold text-slate-800">
                    <Filter className="w-3.5 h-3.5 text-brand-600" />
                    <span>Akses Kelas:</span>
                    <span className="text-[11px] font-semibold text-slate-400">
                      ({isAllClassesSelected ? "Semua Kelas" : `${selectedClassesToAssign.length} kelas`})
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={handleToggleSelectAll}
                      className="px-2 py-0.5 rounded-lg text-[11px] font-bold text-brand-700 bg-brand-50 hover:bg-brand-100 transition-colors cursor-pointer"
                    >
                      {isAllClassesSelected ? "Pilih Per Kelas" : "Semua Kelas"}
                    </button>
                    {!isAllClassesSelected && selectedClassesToAssign.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setSelectedClassesToAssign([])}
                        className="px-1.5 py-0.5 rounded-lg text-[11px] font-bold text-slate-500 hover:bg-slate-100 transition-colors cursor-pointer"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                </div>

                {/* Checkbox Utama Semua Kelas */}
                <div
                  onClick={handleToggleSelectAll}
                  className={`p-2.5 rounded-xl border text-xs font-bold cursor-pointer transition-colors flex items-center justify-between ${
                    isAllClassesSelected
                      ? "bg-brand-600 text-white border-brand-600 shadow-2xs"
                      : "bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-4 h-4 rounded-md flex items-center justify-center shrink-0 border ${
                        isAllClassesSelected ? "bg-white border-white text-brand-600" : "border-slate-300 bg-white"
                      }`}
                    >
                      {isAllClassesSelected && <Check className="w-3 h-3" />}
                    </div>
                    <span>Akses Penuh Semua Kelas</span>
                  </div>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      isAllClassesSelected ? "bg-white/20 text-white" : "bg-slate-200 text-slate-600"
                    }`}
                  >
                    {availableClassOptions.length} Kelas
                  </span>
                </div>

                {/* Grid Kelas Spesifik */}
                {!isAllClassesSelected && (
                  <div className="space-y-1.5">
                    {/* Filter Tingkat Cepat */}
                    <div className="flex items-center gap-1 text-[11px]">
                      <span className="text-slate-400 font-medium">Jenjang:</span>
                      {["X", "XI", "XII"].map((grade) => (
                        <button
                          key={grade}
                          type="button"
                          onClick={() => handleSelectGrade(grade)}
                          className="px-2 py-0.5 rounded-md font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
                        >
                          Kls {grade}
                        </button>
                      ))}
                    </div>

                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5 max-h-36 overflow-y-auto p-1 border border-slate-200 rounded-xl bg-slate-50">
                      {availableClassOptions.map((k) => {
                        const isSelected = selectedClassesToAssign.includes(k);
                        return (
                          <button
                            key={k}
                            type="button"
                            onClick={() => handleToggleSingleClass(k)}
                            className={`p-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer border flex items-center justify-center gap-1 ${
                              isSelected
                                ? "bg-brand-600 text-white border-brand-600"
                                : "bg-white text-slate-700 border-slate-200 hover:bg-slate-100"
                            }`}
                          >
                            {isSelected && <Check className="w-3 h-3 shrink-0" />}
                            <span className="truncate">{k}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Actions Footer */}
              <div className="pt-3 flex flex-col-reverse sm:flex-row items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAssignModal(false)}
                  className="w-full sm:w-auto px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer text-center"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleSaveTeacherAssignment}
                  disabled={isAssigning}
                  className="w-full sm:w-auto px-5 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2 shadow-sm"
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
