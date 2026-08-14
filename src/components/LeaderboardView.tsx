import React, { useState, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Trophy,
  Crown,
  Medal,
  Award,
  Sparkles,
  Search,
  Filter,
  Users,
  TrendingUp,
  Flame,
  Star,
  ChevronRight,
  ShieldCheck,
  RotateCcw,
  Layers,
  ListOrdered,
  Eye,
  ArrowUpRight
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getSiswaListLight, getRiwayatList } from "../dbStore";
import { Siswa, UserSession } from "../types";
import { toSentenceCase } from "../formatName";
import SkeletonLoader from "./SkeletonLoader";
import StudentHistoryModal from "./StudentHistoryModal";

interface LeaderboardViewProps {
  userSession?: UserSession | null;
}

type ViewMode = "podium" | "list";
type RankCategory = "prestasi" | "disiplin";

export default function LeaderboardView({ userSession }: LeaderboardViewProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("podium");
  const [category, setCategory] = useState<RankCategory>("prestasi");
  const [selectedKelas, setSelectedKelas] = useState<string>("semua");
  const [searchQuery, setSearchQuery] = useState<string>("");
  
  // Modal state for student history breakdown
  const [selectedStudent, setSelectedStudent] = useState<Siswa | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const studentCardRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Data fetching via TanStack Query
  const {
    data: siswaList = [],
    isLoading: loadingSiswa,
    refetch: refetchSiswa,
    isRefetching: refetchingSiswa
  } = useQuery({
    queryKey: ["siswa"],
    queryFn: getSiswaListLight,
    staleTime: 2 * 60_000,
  });

  const {
    data: riwayatList = [],
    isLoading: loadingRiwayat,
    refetch: refetchRiwayat,
    isRefetching: refetchingRiwayat
  } = useQuery({
    queryKey: ["riwayat"],
    queryFn: getRiwayatList,
    staleTime: 2 * 60_000,
  });

  const isLoading = loadingSiswa || loadingRiwayat;
  const isRefreshing = refetchingSiswa || refetchingRiwayat;

  const handleRefresh = () => {
    refetchSiswa();
    refetchRiwayat();
  };

  // Aggregate positive and negative points per student
  const studentPoinMap = useMemo(() => {
    const map: Record<string, { positif: number; negatif: number; net: number }> = {};
    riwayatList.forEach((r) => {
      if (!map[r.siswa_id]) {
        map[r.siswa_id] = { positif: 0, negatif: 0, net: 0 };
      }
      if (r.nilai_diberikan > 0) {
        map[r.siswa_id].positif += r.nilai_diberikan;
      } else if (r.nilai_diberikan < 0) {
        map[r.siswa_id].negatif += Math.abs(r.nilai_diberikan);
      }
      map[r.siswa_id].net += r.nilai_diberikan;
    });
    return map;
  }, [riwayatList]);

  // Unique list of classes for dropdown
  const listKelas = useMemo(() => {
    const set = new Set<string>();
    siswaList.forEach((s) => {
      if (s.kelas) set.add(s.kelas);
    });
    return Array.from(set).sort();
  }, [siswaList]);

  // Ranked students based on category, filter, and search
  const rankedStudents = useMemo(() => {
    const list = siswaList.map((siswa) => {
      const stats = studentPoinMap[siswa.id] || { positif: 0, negatif: 0, net: 0 };
      const score = category === "prestasi" ? stats.positif : stats.negatif;
      return {
        ...siswa,
        score,
        positif: stats.positif,
        negatif: stats.negatif,
        net: stats.net,
      };
    });

    // Filter by class
    let filtered = list;
    if (selectedKelas !== "semua") {
      filtered = filtered.filter((s) => s.kelas === selectedKelas);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (s) =>
          s.nama.toLowerCase().includes(q) ||
          (s.nis && s.nis.toLowerCase().includes(q)) ||
          (s.kelas && s.kelas.toLowerCase().includes(q))
      );
    }

    // Sort descending by target score
    filtered.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.nama.localeCompare(b.nama);
    });

    return filtered;
  }, [siswaList, studentPoinMap, category, selectedKelas, searchQuery]);

  // Logged-in user's student position (if student)
  const currentStudentRank = useMemo(() => {
    if (!userSession || userSession.role !== "siswa") return null;
    const userNis = userSession.nis || userSession.email.split("@")[0];
    const index = rankedStudents.findIndex(
      (s) => s.nis === userNis || s.id === userSession.id || s.nama.toLowerCase() === userSession.fullName.toLowerCase()
    );
    if (index === -1) return null;
    return {
      rank: index + 1,
      student: rankedStudents[index],
    };
  }, [userSession, rankedStudents]);

  const scrollToMyCard = (studentId: string) => {
    const el = studentCardRefs.current.get(studentId);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-4", "ring-brand-500");
      setTimeout(() => {
        el.classList.remove("ring-4", "ring-brand-500");
      }, 2000);
    }
  };

  // Split top 3 for podium
  const top1 = rankedStudents[0] || null;
  const top2 = rankedStudents[1] || null;
  const top3 = rankedStudents[2] || null;
  const rank4Onwards = rankedStudents.slice(3);

  const openStudentDetail = (siswa: Siswa) => {
    setSelectedStudent(siswa);
    setIsModalOpen(true);
  };

  return (
    <div className="space-y-6 pb-20 animate-fade-in font-sans">
      {/* ===== Header & Banner ===== */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-900 via-brand-800 to-accent-600 text-white p-6 sm:p-8 shadow-xl border border-brand-700/50">
        <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full bg-amber-400/10 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-20 -left-20 w-64 h-64 rounded-full bg-accent-500/20 blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-amber-300 text-xs font-bold uppercase tracking-wider">
              <Trophy className="w-3.5 h-3.5 text-amber-300 animate-bounce" />
              Papan Peringkat Terkini
            </div>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight text-white flex items-center gap-3">
              Hall of Fame Siswa
              <Sparkles className="w-6 h-6 text-amber-300 animate-pulse hidden sm:inline-block" />
            </h1>
            <p className="text-xs sm:text-sm text-brand-100/90 max-w-xl leading-relaxed">
              Pantau posisi dan prestasi terbaik siswa dengan animasi badge kehormatan emas, perak, dan perunggu.
            </p>
          </div>

          {/* View Mode Switcher & Refresh */}
          <div className="flex items-center gap-2.5 self-start md:self-center">
            <div className="bg-white/10 backdrop-blur-md p-1 rounded-2xl border border-white/20 flex items-center shadow-inner">
              <button
                onClick={() => setViewMode("podium")}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  viewMode === "podium"
                    ? "bg-white text-brand-950 shadow-md scale-[1.02]"
                    : "text-white/80 hover:text-white hover:bg-white/10"
                }`}
                title="Tampilan Podium Top 3"
              >
                <Layers className="w-4 h-4 text-amber-500" />
                <span className="hidden sm:inline">Mode</span> Podium
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  viewMode === "list"
                    ? "bg-white text-brand-950 shadow-md scale-[1.02]"
                    : "text-white/80 hover:text-white hover:bg-white/10"
                }`}
                title="Tampilan Seluruh List Kartu"
              >
                <ListOrdered className="w-4 h-4 text-brand-600" />
                <span className="hidden sm:inline">Mode</span> List Lengkap
              </button>
            </div>

            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="p-2.5 bg-white/10 hover:bg-white/20 active:scale-95 text-white rounded-2xl border border-white/20 transition-all cursor-pointer shadow-sm flex items-center justify-center"
              title="Perbarui Data"
            >
              <RotateCcw className={`w-4 h-4 ${isRefreshing ? "animate-spin text-amber-300" : ""}`} />
            </button>
          </div>
        </div>
      </div>

      {/* ===== Filters & Controls Bar ===== */}
      <div className="bg-white rounded-3xl p-4 sm:p-5 border border-brand-100/80 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        {/* Category Toggle (Prestasi vs Disiplin) */}
        <div className="flex items-center bg-brand-50/80 p-1 rounded-2xl border border-brand-100 max-w-fit">
          <button
            onClick={() => setCategory("prestasi")}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              category === "prestasi"
                ? "bg-gradient-to-r from-amber-500 to-amber-600 text-white shadow-sm"
                : "text-brand-700 hover:text-brand-950 hover:bg-brand-100/50"
            }`}
          >
            <Star className="w-3.5 h-3.5" />
            Poin Prestasi (Tertinggi)
          </button>
          <button
            onClick={() => setCategory("disiplin")}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              category === "disiplin"
                ? "bg-gradient-to-r from-rose-500 to-rose-600 text-white shadow-sm"
                : "text-brand-700 hover:text-brand-950 hover:bg-brand-100/50"
            }`}
          >
            <Flame className="w-3.5 h-3.5" />
            Catatan Disiplin
          </button>
        </div>

        {/* Filter Kelas & Search */}
        <div className="flex flex-wrap sm:flex-nowrap items-center gap-3">
          {/* Kelas Dropdown */}
          <div className="relative min-w-[140px] flex-1 sm:flex-initial">
            <select
              value={selectedKelas}
              onChange={(e) => setSelectedKelas(e.target.value)}
              className="w-full pl-3 pr-8 py-2 bg-brand-50/60 border border-brand-100 rounded-2xl text-xs font-bold text-brand-900 focus:outline-none focus:ring-2 focus:ring-brand-500 transition-all cursor-pointer"
            >
              <option value="semua">Semua Kelas</option>
              {listKelas.map((k) => (
                <option key={k} value={k}>
                  Kelas {k}
                </option>
              ))}
            </select>
          </div>

          {/* Search Bar */}
          <div className="relative flex-1 min-w-[180px]">
            <Search className="w-4 h-4 text-brand-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari siswa atau NIS..."
              className="w-full pl-9 pr-3.5 py-2 bg-brand-50/60 border border-brand-100 rounded-2xl text-xs text-brand-900 placeholder:text-brand-300 font-medium focus:outline-none focus:ring-2 focus:ring-brand-500 transition-all"
            />
          </div>
        </div>
      </div>

      {/* ===== Content Section ===== */}
      {isLoading ? (
        <div className="space-y-4 py-4">
          <SkeletonLoader type="list" count={6} />
        </div>
      ) : rankedStudents.length === 0 ? (
        <div className="bg-white rounded-3xl p-12 text-center border border-brand-100 space-y-4 shadow-sm">
          <div className="w-16 h-16 bg-amber-50 rounded-2xl flex items-center justify-center mx-auto text-amber-500 border border-amber-100">
            <Trophy className="w-8 h-8 opacity-60" />
          </div>
          <div>
            <h3 className="text-base font-bold text-brand-950">Tidak Ada Siswa Ditemukan</h3>
            <p className="text-xs text-brand-400 max-w-sm mx-auto mt-1">
              {searchQuery || selectedKelas !== "semua"
                ? "Coba ubah kata kunci pencarian atau filter kelas yang dipilih."
                : "Belum ada catatan poin untuk kategori ini."}
            </p>
          </div>
        </div>
      ) : viewMode === "podium" ? (
        /* ============================================================== */
        /* ====================== MODE PODIUM =========================== */
        /* ============================================================== */
        <div className="space-y-8">
          {/* Top 3 Podium Container */}
          <div className="relative pt-6 pb-2 px-2 sm:px-6">
            <div className="grid grid-cols-3 gap-2 sm:gap-4 md:gap-6 items-end max-w-3xl mx-auto">
              {/* ===== JUARA 2 (PERAK / SILVER - KIRI) ===== */}
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.15 }}
                className="flex flex-col items-center cursor-pointer group"
                onClick={() => top2 && openStudentDetail(top2)}
              >
                {top2 ? (
                  <>
                    {/* Avatar & Medal */}
                    <div className="relative mb-3 flex flex-col items-center">
                      <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-slate-100 border-2 border-slate-300 text-slate-700 flex items-center justify-center font-black text-xs sm:text-sm shadow-md mb-1">
                        🥈
                      </div>
                      <div className="relative w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 rounded-2xl sm:rounded-3xl p-1 bg-gradient-to-tr from-slate-300 via-slate-100 to-slate-400 silver-aura-glow shadow-lg transition-transform group-hover:scale-105">
                        {top2.foto_url ? (
                          <img
                            src={top2.foto_url}
                            alt={top2.nama}
                            className="w-full h-full object-cover rounded-xl sm:rounded-2xl"
                          />
                        ) : (
                          <div className="w-full h-full rounded-xl sm:rounded-2xl bg-slate-200 flex items-center justify-center font-black text-slate-600 text-base sm:text-xl">
                            {top2.nama.slice(0, 2).toUpperCase()}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Student Info */}
                    <div className="text-center px-1 max-w-[110px] sm:max-w-[160px] space-y-0.5">
                      <h4 className="font-extrabold text-xs sm:text-sm text-brand-950 truncate group-hover:text-brand-600 transition-colors">
                        {toSentenceCase(top2.nama)}
                      </h4>
                      <p className="text-[10px] sm:text-xs font-bold text-slate-500">
                        Kelas {top2.kelas}
                      </p>
                      <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 border border-slate-300 text-slate-800 font-black text-[10px] sm:text-xs">
                        <TrendingUp className="w-3 h-3 text-slate-600" />
                        {top2.score} pts
                      </div>
                    </div>

                    {/* Podium Pillar */}
                    <div className="w-full mt-3 h-28 sm:h-36 md:h-44 rounded-t-2xl sm:rounded-t-3xl bg-gradient-to-b from-slate-200 via-slate-300 to-slate-400 border-t-2 border-slate-100 shadow-md flex flex-col items-center justify-start pt-3 sm:pt-4">
                      <span className="font-black text-2xl sm:text-4xl text-slate-600/80 drop-shadow-sm">2</span>
                      <span className="text-[9px] sm:text-[11px] font-bold text-slate-600 uppercase tracking-wider">Perak</span>
                    </div>
                  </>
                ) : (
                  <div className="w-full h-32 rounded-t-2xl bg-slate-100 flex items-center justify-center text-slate-400 text-xs font-bold">
                    Kosong
                  </div>
                )}
              </motion.div>

              {/* ===== JUARA 1 (EMAS / GOLD - TENGAH) ===== */}
              <motion.div
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.05 }}
                className="flex flex-col items-center cursor-pointer group z-10"
                onClick={() => top1 && openStudentDetail(top1)}
              >
                {top1 ? (
                  <>
                    {/* Animated Floating Crown & Sparkles */}
                    <div className="relative mb-3 flex flex-col items-center">
                      <div className="animate-float-gentle flex flex-col items-center">
                        <Crown className="w-7 h-7 sm:w-9 sm:h-9 text-amber-400 drop-shadow-[0_4px_8px_rgba(245,158,11,0.5)] fill-amber-300" />
                        <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-amber-100 border-2 border-amber-400 text-amber-900 flex items-center justify-center font-black text-xs sm:text-sm shadow-lg -mt-1 z-10">
                          🥇
                        </div>
                      </div>

                      {/* Golden Glowing Frame with Shimmer */}
                      <div className="relative w-20 h-20 sm:w-26 sm:h-26 md:w-32 md:h-32 rounded-2xl sm:rounded-3xl p-1 bg-gradient-to-tr from-amber-400 via-yellow-200 to-amber-500 gold-aura-glow animate-gold-shimmer shadow-2xl transition-transform group-hover:scale-105">
                        {top1.foto_url ? (
                          <img
                            src={top1.foto_url}
                            alt={top1.nama}
                            className="w-full h-full object-cover rounded-xl sm:rounded-2xl border-2 border-amber-300"
                          />
                        ) : (
                          <div className="w-full h-full rounded-xl sm:rounded-2xl bg-amber-200 flex items-center justify-center font-black text-amber-800 text-lg sm:text-2xl border-2 border-amber-300">
                            {top1.nama.slice(0, 2).toUpperCase()}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Student Info */}
                    <div className="text-center px-1 max-w-[120px] sm:max-w-[180px] space-y-0.5">
                      <span className="inline-block px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-extrabold text-[9px] sm:text-[10px] tracking-wide uppercase shadow-xs">
                        👑 Juara 1 (MVP)
                      </span>
                      <h4 className="font-black text-xs sm:text-base text-brand-950 truncate group-hover:text-amber-600 transition-colors">
                        {toSentenceCase(top1.nama)}
                      </h4>
                      <p className="text-[10px] sm:text-xs font-extrabold text-amber-700">
                        Kelas {top1.kelas}
                      </p>
                      <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-gradient-to-r from-amber-400 to-amber-500 text-white font-black text-[11px] sm:text-sm shadow-md">
                        <Sparkles className="w-3.5 h-3.5" />
                        {top1.score} pts
                      </div>
                    </div>

                    {/* Champion Podium Pillar */}
                    <div className="w-full mt-3 h-36 sm:h-48 md:h-56 rounded-t-2xl sm:rounded-t-3xl bg-gradient-to-b from-amber-300 via-amber-400 to-amber-500 border-t-2 border-yellow-200 shadow-xl flex flex-col items-center justify-start pt-3 sm:pt-4">
                      <span className="font-black text-3xl sm:text-5xl text-amber-900/70 drop-shadow-md">1</span>
                      <span className="text-[10px] sm:text-xs font-black text-amber-900 uppercase tracking-widest">Juara Utama</span>
                    </div>
                  </>
                ) : (
                  <div className="w-full h-40 rounded-t-2xl bg-amber-100 flex items-center justify-center text-amber-500 text-xs font-bold">
                    Kosong
                  </div>
                )}
              </motion.div>

              {/* ===== JUARA 3 (PERUNGGU / BRONZE - KANAN) ===== */}
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.25 }}
                className="flex flex-col items-center cursor-pointer group"
                onClick={() => top3 && openStudentDetail(top3)}
              >
                {top3 ? (
                  <>
                    {/* Avatar & Medal */}
                    <div className="relative mb-3 flex flex-col items-center">
                      <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-amber-50 border-2 border-amber-600/60 text-amber-900 flex items-center justify-center font-black text-xs sm:text-sm shadow-md mb-1">
                        🥉
                      </div>
                      <div className="relative w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 rounded-2xl sm:rounded-3xl p-1 bg-gradient-to-tr from-amber-700 via-amber-500 to-amber-800 bronze-aura-glow shadow-lg transition-transform group-hover:scale-105">
                        {top3.foto_url ? (
                          <img
                            src={top3.foto_url}
                            alt={top3.nama}
                            className="w-full h-full object-cover rounded-xl sm:rounded-2xl"
                          />
                        ) : (
                          <div className="w-full h-full rounded-xl sm:rounded-2xl bg-amber-100 flex items-center justify-center font-black text-amber-900 text-base sm:text-xl">
                            {top3.nama.slice(0, 2).toUpperCase()}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Student Info */}
                    <div className="text-center px-1 max-w-[110px] sm:max-w-[160px] space-y-0.5">
                      <h4 className="font-extrabold text-xs sm:text-sm text-brand-950 truncate group-hover:text-amber-800 transition-colors">
                        {toSentenceCase(top3.nama)}
                      </h4>
                      <p className="text-[10px] sm:text-xs font-bold text-amber-800/80">
                        Kelas {top3.kelas}
                      </p>
                      <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 border border-amber-600/40 text-amber-900 font-black text-[10px] sm:text-xs">
                        <TrendingUp className="w-3 h-3 text-amber-700" />
                        {top3.score} pts
                      </div>
                    </div>

                    {/* Podium Pillar */}
                    <div className="w-full mt-3 h-20 sm:h-28 md:h-36 rounded-t-2xl sm:rounded-t-3xl bg-gradient-to-b from-amber-600 via-amber-700 to-amber-800 border-t-2 border-amber-400 shadow-md flex flex-col items-center justify-start pt-3 sm:pt-4">
                      <span className="font-black text-2xl sm:text-4xl text-amber-200/80 drop-shadow-sm">3</span>
                      <span className="text-[9px] sm:text-[11px] font-bold text-amber-200 uppercase tracking-wider">Perunggu</span>
                    </div>
                  </>
                ) : (
                  <div className="w-full h-24 rounded-t-2xl bg-amber-50 flex items-center justify-center text-amber-600 text-xs font-bold">
                    Kosong
                  </div>
                )}
              </motion.div>
            </div>
          </div>

          {/* Rank 4+ List Section */}
          {rank4Onwards.length > 0 && (
            <div className="space-y-3 pt-4">
              <div className="flex items-center justify-between px-2">
                <h3 className="text-sm font-black text-brand-900 uppercase tracking-wider flex items-center gap-2">
                  <Medal className="w-4 h-4 text-brand-500" />
                  Peringkat 4 Seterusnya ({rank4Onwards.length} Siswa)
                </h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {rank4Onwards.map((siswa, idx) => {
                  const rank = idx + 4;
                  const isTop10 = rank <= 10;
                  return (
                    <div
                      key={siswa.id}
                      ref={(el) => {
                        if (el) studentCardRefs.current.set(siswa.id, el);
                        else studentCardRefs.current.delete(siswa.id);
                      }}
                      onClick={() => openStudentDetail(siswa)}
                      className={`group p-3.5 sm:p-4 rounded-2xl bg-white border transition-all cursor-pointer flex items-center justify-between gap-3 shadow-xs hover:shadow-md hover:-translate-y-0.5 ${
                        isTop10
                          ? "border-brand-200/80 hover:border-brand-400 bg-gradient-to-r from-white via-white to-brand-50/40"
                          : "border-slate-100 hover:border-brand-200"
                      }`}
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        {/* Rank Badge */}
                        <div
                          className={`w-8 h-8 rounded-xl flex items-center justify-center font-black text-xs shrink-0 ${
                            isTop10
                              ? "bg-brand-100 text-brand-700 border border-brand-200"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          #{rank}
                        </div>

                        {/* Avatar */}
                        <div className="w-10 h-10 rounded-xl bg-brand-50 border border-brand-100 overflow-hidden shrink-0">
                          {siswa.foto_url ? (
                            <img
                              src={siswa.foto_url}
                              alt={siswa.nama}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center font-bold text-brand-700 text-xs">
                              {siswa.nama.slice(0, 2).toUpperCase()}
                            </div>
                          )}
                        </div>

                        {/* Name & Class */}
                        <div className="min-w-0">
                          <h4 className="font-extrabold text-xs sm:text-sm text-brand-950 truncate group-hover:text-brand-600 transition-colors">
                            {toSentenceCase(siswa.nama)}
                          </h4>
                          <div className="flex items-center gap-2 text-[11px] text-brand-400 font-medium">
                            <span>Kelas {siswa.kelas}</span>
                            {siswa.nis && <span>• NIS: {siswa.nis}</span>}
                          </div>
                        </div>
                      </div>

                      {/* Points & Arrow */}
                      <div className="flex items-center gap-2 shrink-0">
                        <div
                          className={`px-3 py-1 rounded-xl text-xs font-black flex items-center gap-1 ${
                            category === "prestasi"
                              ? "bg-amber-50 text-amber-800 border border-amber-200"
                              : "bg-rose-50 text-rose-700 border border-rose-200"
                          }`}
                        >
                          <TrendingUp className="w-3 h-3" />
                          {siswa.score}
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-brand-500 group-hover:translate-x-0.5 transition-all" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* ============================================================== */
        /* ================= MODE LIST LENGKAP / PRESTIGE =============== */
        /* ============================================================== */
        <div className="space-y-3">
          {rankedStudents.map((siswa, idx) => {
            const rank = idx + 1;
            const isRank1 = rank === 1;
            const isRank2 = rank === 2;
            const isRank3 = rank === 3;
            const isTop10 = rank <= 10;

            return (
              <motion.div
                key={siswa.id}
                ref={(el) => {
                  if (el) studentCardRefs.current.set(siswa.id, el);
                  else studentCardRefs.current.delete(siswa.id);
                }}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: Math.min(idx * 0.03, 0.5) }}
                onClick={() => openStudentDetail(siswa)}
                className={`group relative p-4 sm:p-5 rounded-3xl transition-all cursor-pointer flex items-center justify-between gap-4 shadow-sm hover:shadow-lg hover:-translate-y-0.5 ${
                  isRank1
                    ? "bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-300 text-brand-950 border-2 border-amber-300 animate-gold-shimmer gold-aura-glow"
                    : isRank2
                    ? "bg-gradient-to-r from-slate-200 via-slate-100 to-slate-300 text-slate-900 border-2 border-slate-300 silver-aura-glow"
                    : isRank3
                    ? "bg-gradient-to-r from-amber-100 via-amber-50 to-amber-200 text-amber-950 border-2 border-amber-400/70 bronze-aura-glow"
                    : isTop10
                    ? "bg-white border border-brand-200/90 hover:border-brand-400"
                    : "bg-white border border-slate-100 hover:border-brand-200"
                }`}
              >
                {/* Left side: Rank Badge & Student Details */}
                <div className="flex items-center gap-3.5 sm:gap-5 min-w-0">
                  {/* Rank Badge */}
                  <div
                    className={`w-10 h-10 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center font-black text-sm sm:text-base shrink-0 shadow-xs ${
                      isRank1
                        ? "bg-amber-900 text-amber-300 border border-amber-400"
                        : isRank2
                        ? "bg-slate-700 text-slate-100 border border-slate-400"
                        : isRank3
                        ? "bg-amber-800 text-amber-100 border border-amber-600"
                        : isTop10
                        ? "bg-brand-50 text-brand-700 border border-brand-200"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {isRank1 ? "🥇" : isRank2 ? "🥈" : isRank3 ? "🥉" : `#${rank}`}
                  </div>

                  {/* Photo */}
                  <div
                    className={`w-12 h-12 sm:w-14 sm:h-14 rounded-2xl overflow-hidden shrink-0 border-2 shadow-xs ${
                      isRank1
                        ? "border-amber-300 ring-2 ring-amber-400/50"
                        : isRank2
                        ? "border-slate-300 ring-2 ring-slate-400/30"
                        : isRank3
                        ? "border-amber-500/50"
                        : "border-brand-100 bg-brand-50"
                    }`}
                  >
                    {siswa.foto_url ? (
                      <img
                        src={siswa.foto_url}
                        alt={siswa.nama}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div
                        className={`w-full h-full flex items-center justify-center font-black text-sm ${
                          isRank1
                            ? "bg-amber-200 text-amber-900"
                            : isRank2
                            ? "bg-slate-300 text-slate-800"
                            : isRank3
                            ? "bg-amber-200 text-amber-950"
                            : "bg-brand-50 text-brand-700"
                        }`}
                      >
                        {siswa.nama.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                  </div>

                  {/* Name & Class */}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h4
                        className={`font-black text-sm sm:text-base truncate transition-colors ${
                          isRank1
                            ? "text-amber-950 group-hover:text-amber-900"
                            : isRank2
                            ? "text-slate-900"
                            : isRank3
                            ? "text-amber-950"
                            : "text-brand-950 group-hover:text-brand-600"
                        }`}
                      >
                        {toSentenceCase(siswa.nama)}
                      </h4>
                      {isRank1 && (
                        <Crown className="w-4 h-4 text-amber-900 fill-amber-400 animate-bounce shrink-0" />
                      )}
                    </div>
                    <div
                      className={`flex items-center gap-2 text-xs font-semibold ${
                        isRank1
                          ? "text-amber-900/80"
                          : isRank2
                          ? "text-slate-600"
                          : isRank3
                          ? "text-amber-900/70"
                          : "text-brand-400"
                      }`}
                    >
                      <span>Kelas {siswa.kelas}</span>
                      {siswa.nis && <span>• NIS: {siswa.nis}</span>}
                    </div>
                  </div>
                </div>

                {/* Right side: Score & Inspection Icon */}
                <div className="flex items-center gap-3 shrink-0">
                  <div
                    className={`px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-2xl font-black text-xs sm:text-sm flex items-center gap-1.5 shadow-xs ${
                      isRank1
                        ? "bg-amber-900 text-amber-300 border border-amber-400"
                        : isRank2
                        ? "bg-slate-800 text-slate-100"
                        : isRank3
                        ? "bg-amber-900 text-amber-200"
                        : category === "prestasi"
                        ? "bg-amber-50 text-amber-800 border border-amber-200"
                        : "bg-rose-50 text-rose-700 border border-rose-200"
                    }`}
                  >
                    <Star className={`w-3.5 h-3.5 ${isRank1 ? "fill-amber-300" : ""}`} />
                    <span>{siswa.score} pts</span>
                  </div>

                  <div
                    className={`p-2 rounded-xl transition-colors ${
                      isRank1
                        ? "bg-amber-600/20 text-amber-950"
                        : "bg-brand-50/70 text-brand-400 group-hover:text-brand-600 group-hover:bg-brand-100"
                    }`}
                  >
                    <Eye className="w-4 h-4" />
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* ===== Sticky "Peringkat Kamu" Bar (Khusus Siswa) ===== */}
      <AnimatePresence>
        {currentStudentRank && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-4 left-4 right-4 md:left-auto md:right-8 md:max-w-md z-40"
          >
            <div className="bg-gradient-to-r from-brand-900 via-brand-800 to-accent-600 text-white p-4 rounded-3xl shadow-2xl border border-brand-500/40 backdrop-blur-md flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-2xl bg-amber-400 text-brand-950 flex items-center justify-center font-black text-sm shrink-0 shadow-md">
                  #{currentStudentRank.rank}
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] text-amber-300 font-bold uppercase tracking-wider">
                    Posisi Kamu Saat Ini
                  </p>
                  <h5 className="text-xs sm:text-sm font-extrabold truncate text-white">
                    {toSentenceCase(currentStudentRank.student.nama)} ({currentStudentRank.student.score} pts)
                  </h5>
                </div>
              </div>

              <button
                onClick={() => scrollToMyCard(currentStudentRank.student.id)}
                className="px-3.5 py-2 bg-white text-brand-950 hover:bg-amber-300 rounded-2xl text-xs font-bold transition-all cursor-pointer shrink-0 flex items-center gap-1.5 shadow-sm active:scale-95"
              >
                <span>Lihat</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ===== Student Point History Modal ===== */}
      <StudentHistoryModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedStudent(null);
        }}
        siswa={selectedStudent}
      />
    </div>
  );
}
