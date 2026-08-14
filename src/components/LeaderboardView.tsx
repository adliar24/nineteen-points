import React, { useState, useMemo, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import {
  Trophy,
  Crown,
  Medal,
  Sparkles,
  Search,
  Users,
  TrendingUp,
  ChevronRight,
  RotateCcw,
  ArrowUpRight,
  X,
  Award,
  Sparkle
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getSiswaListLight, getRiwayatList } from "../dbStore";
import { Siswa, UserSession } from "../types";
import { toSentenceCase } from "../formatName";
import SkeletonLoader from "./SkeletonLoader";

interface LeaderboardViewProps {
  userSession?: UserSession | null;
}

interface RankedSiswa extends Siswa {
  score: number;
  positif: number;
  negatif: number;
  net: number;
  rank: number;
}

export default function LeaderboardView({ userSession }: LeaderboardViewProps) {
  const [selectedKelas, setSelectedKelas] = useState<string>("semua");
  const [searchQuery, setSearchQuery] = useState<string>("");
  
  // Selected student for the Large Prestige Showcase Card Modal
  const [showcaseStudent, setShowcaseStudent] = useState<RankedSiswa | null>(null);

  const studentCardRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Data fetching via TanStack Query (Read-only)
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

  // Aggregate positive points per student
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

  // Ranked students (sorted by positive achievement points descending)
  const rankedStudents: RankedSiswa[] = useMemo(() => {
    const list = siswaList.map((siswa) => {
      const stats = studentPoinMap[siswa.id] || { positif: 0, negatif: 0, net: 0 };
      return {
        ...siswa,
        score: stats.positif,
        positif: stats.positif,
        negatif: stats.negatif,
        net: stats.net,
        rank: 0,
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

    // Sort descending by highest positive points
    filtered.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.nama.localeCompare(b.nama);
    });

    // Assign 1-based ranks
    return filtered.map((s, index) => ({
      ...s,
      rank: index + 1,
    }));
  }, [siswaList, studentPoinMap, selectedKelas, searchQuery]);

  // Logged-in user's student position (if student)
  const currentStudentRank = useMemo(() => {
    if (!userSession || userSession.role !== "siswa") return null;
    const userNis = userSession.nis || userSession.email.split("@")[0];
    const found = rankedStudents.find(
      (s) => s.nis === userNis || s.id === userSession.id || s.nama.toLowerCase() === userSession.fullName.toLowerCase()
    );
    if (!found) return null;
    return {
      rank: found.rank,
      student: found,
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

  const isStudentRole = userSession?.role === "siswa";

  const openStudentShowcase = (siswa: RankedSiswa) => {
    // Di akun siswa, klik list siswa tidak memunculkan modal kartu (gunakan tab khusus Peringkatku)
    if (isStudentRole) return;
    setShowcaseStudent(siswa);
  };

  // Lock background scroll when Showcase modal is open
  useEffect(() => {
    if (showcaseStudent) {
      document.body.classList.add("modal-open");
    } else {
      document.body.classList.remove("modal-open");
    }
    return () => {
      document.body.classList.remove("modal-open");
    };
  }, [showcaseStudent]);

  return (
    <div className="space-y-5 pb-20 animate-fade-in font-sans">
      {/* ===== Compact & Space-Efficient Header ===== */}
      <div className="bg-white rounded-3xl p-4 sm:p-5 border border-brand-100/90 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        {/* Title & Badge */}
        <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center shrink-0 shadow-xs mt-0.5 sm:mt-0">
            <Trophy className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-base sm:text-lg font-black text-brand-950 tracking-tight flex items-center gap-1.5 flex-wrap">
              <span>Papan Peringkat Siswa</span>
              <Sparkles className="w-4 h-4 text-amber-500 shrink-0" />
            </h1>
            <p className="text-[11.5px] sm:text-xs text-brand-500 font-medium leading-normal break-words mt-0.5">
              {isStudentRole
                ? "Klasemen perolehan poin prestasi murid di Nineteen Space."
                : "Klasemen prestasi poin tertinggi. Klik siswa untuk kartu prestise."}
            </p>
          </div>
        </div>

        {/* Controls: Filter Kelas, Search, Refresh (No text cut-off on mobile) */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full md:w-auto shrink-0">
          {/* Kelas Dropdown */}
          <div className="relative w-full sm:w-auto sm:min-w-[140px]">
            <select
              value={selectedKelas}
              onChange={(e) => setSelectedKelas(e.target.value)}
              className="w-full pl-3.5 pr-8 py-2.5 sm:py-2 bg-brand-50/70 border border-brand-100 rounded-2xl text-xs font-bold text-brand-900 focus:outline-none focus:ring-2 focus:ring-brand-500 transition-all cursor-pointer truncate"
            >
              <option value="semua">Semua Kelas</option>
              {listKelas.map((k) => (
                <option key={k} value={k}>
                  Kelas {k}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            {/* Search Bar */}
            <div className="relative flex-1 sm:w-48 md:w-56">
              <Search className="w-4 h-4 text-brand-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari siswa / NIS..."
                className="w-full pl-8.5 pr-3 py-2.5 sm:py-2 bg-brand-50/70 border border-brand-100 rounded-2xl text-xs text-brand-900 placeholder:text-brand-300 font-medium focus:outline-none focus:ring-2 focus:ring-brand-500 transition-all"
              />
            </div>

            {/* Refresh Button */}
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="p-2.5 sm:p-2 bg-brand-50 hover:bg-brand-100 active:scale-95 text-brand-700 rounded-2xl border border-brand-200 transition-all cursor-pointer shadow-xs flex items-center justify-center shrink-0"
              title="Segarkan Data"
            >
              <RotateCcw className={`w-4 h-4 ${isRefreshing ? "animate-spin text-brand-600" : ""}`} />
            </button>
          </div>
        </div>
      </div>

      {/* ===== Content Section: PODIUM + RANK 4+ LIST ===== */}
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
                : "Belum ada catatan perolehan poin prestasi."}
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-7">
          {/* Top 3 Podium Container */}
          <div className="relative pt-4 pb-2 px-1 sm:px-6">
            <div className="grid grid-cols-3 gap-2 sm:gap-4 md:gap-6 items-end max-w-3xl mx-auto">
              {/* ===== JUARA 2 (PERAK / SILVER - KIRI) ===== */}
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.15 }}
                className={`flex flex-col items-center group ${isStudentRole ? "cursor-default" : "cursor-pointer"}`}
                onClick={() => top2 && openStudentShowcase(top2)}
              >
                {top2 ? (
                  <>
                    {/* Avatar & Medal */}
                    <div className="relative mb-2 sm:mb-3 flex flex-col items-center">
                      <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-slate-100 border-2 border-slate-300 text-slate-700 flex items-center justify-center font-black text-xs sm:text-sm mb-1">
                        🥈
                      </div>
                      {/* Portrait 3:4 Frame */}
                      <div className={`relative w-18 h-24 sm:w-22 sm:h-29 md:w-26 md:h-35 aspect-[3/4] rounded-2xl p-1 bg-gradient-to-tr from-slate-300 via-slate-100 to-slate-400 border border-slate-300 transition-transform ${!isStudentRole ? "group-hover:scale-105" : ""}`}>
                        {top2.foto_url ? (
                          <img
                            src={top2.foto_url}
                            alt={top2.nama}
                            className="w-full h-full object-cover rounded-xl"
                          />
                        ) : (
                          <div className="w-full h-full rounded-xl bg-slate-200 flex items-center justify-center font-black text-slate-600 text-base sm:text-xl">
                            {top2.nama.slice(0, 2).toUpperCase()}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Student Info (Full text display on mobile without clipping) */}
                    <div className="text-center px-1 w-full max-w-[110px] sm:max-w-[160px] space-y-0.5">
                      <h4 className="font-extrabold text-[11px] sm:text-xs md:text-sm text-brand-950 break-words line-clamp-2 leading-tight group-hover:text-brand-600 transition-colors">
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

                    {/* Podium Pillar (Hanya Angka 2) */}
                    <div className="w-full mt-3 h-28 sm:h-36 md:h-44 rounded-t-2xl sm:rounded-t-3xl bg-gradient-to-b from-slate-200 via-slate-300 to-slate-400 border-t-2 border-slate-100 flex items-center justify-center group-hover:brightness-105 transition-all">
                      <span className="font-black text-3xl sm:text-5xl text-slate-600/80">2</span>
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
                className={`flex flex-col items-center group z-10 ${isStudentRole ? "cursor-default" : "cursor-pointer"}`}
                onClick={() => top1 && openStudentShowcase(top1)}
              >
                {top1 ? (
                  <>
                    {/* Animated Floating Crown & Sparkles */}
                    <div className="relative mb-2 sm:mb-3 flex flex-col items-center">
                      <div className="animate-float-gentle flex flex-col items-center">
                        <Crown className="w-7 h-7 sm:w-9 sm:h-9 text-amber-500 fill-amber-300" />
                        <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-amber-100 border-2 border-amber-400 text-amber-900 flex items-center justify-center font-black text-xs sm:text-sm -mt-1 z-10">
                          🥇
                        </div>
                      </div>

                      {/* Portrait 3:4 Golden Frame */}
                      <div className={`relative w-22 h-29 sm:w-28 sm:h-37 md:w-32 md:h-43 aspect-[3/4] rounded-2xl sm:rounded-3xl p-1 bg-gradient-to-tr from-amber-400 via-yellow-200 to-amber-500 border border-amber-300 transition-transform ${!isStudentRole ? "group-hover:scale-105" : ""}`}>
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
                    <div className="text-center px-1 w-full max-w-[120px] sm:max-w-[180px] space-y-0.5">
                      <h4 className="font-black text-xs sm:text-sm md:text-base text-brand-950 break-words line-clamp-2 leading-tight group-hover:text-amber-600 transition-colors">
                        {toSentenceCase(top1.nama)}
                      </h4>
                      <p className="text-[10px] sm:text-xs font-extrabold text-amber-700">
                        Kelas {top1.kelas}
                      </p>
                      <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-gradient-to-r from-amber-400 to-amber-500 text-white font-black text-[11px] sm:text-sm">
                        <Sparkles className="w-3.5 h-3.5" />
                        {top1.score} pts
                      </div>
                    </div>

                    {/* Champion Podium Pillar (Hanya Angka 1) */}
                    <div className="w-full mt-3 h-36 sm:h-48 md:h-56 rounded-t-2xl sm:rounded-t-3xl bg-gradient-to-b from-amber-300 via-amber-400 to-amber-500 border-t-2 border-yellow-200 flex items-center justify-center group-hover:brightness-105 transition-all">
                      <span className="font-black text-4xl sm:text-6xl text-amber-900/70">1</span>
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
                className={`flex flex-col items-center group ${isStudentRole ? "cursor-default" : "cursor-pointer"}`}
                onClick={() => top3 && openStudentShowcase(top3)}
              >
                {top3 ? (
                  <>
                    {/* Avatar & Medal */}
                    <div className="relative mb-2 sm:mb-3 flex flex-col items-center">
                      <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-amber-50 border-2 border-amber-600/60 text-amber-900 flex items-center justify-center font-black text-xs sm:text-sm mb-1">
                        🥉
                      </div>
                      {/* Portrait 3:4 Frame */}
                      <div className={`relative w-18 h-24 sm:w-22 sm:h-29 md:w-26 md:h-35 aspect-[3/4] rounded-2xl p-1 bg-gradient-to-tr from-amber-700 via-amber-500 to-amber-800 border border-amber-600/40 transition-transform ${!isStudentRole ? "group-hover:scale-105" : ""}`}>
                        {top3.foto_url ? (
                          <img
                            src={top3.foto_url}
                            alt={top3.nama}
                            className="w-full h-full object-cover rounded-xl"
                          />
                        ) : (
                          <div className="w-full h-full rounded-xl bg-amber-100 flex items-center justify-center font-black text-amber-900 text-base sm:text-xl">
                            {top3.nama.slice(0, 2).toUpperCase()}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Student Info */}
                    <div className="text-center px-1 w-full max-w-[110px] sm:max-w-[160px] space-y-0.5">
                      <h4 className="font-extrabold text-[11px] sm:text-xs md:text-sm text-brand-950 break-words line-clamp-2 leading-tight group-hover:text-amber-800 transition-colors">
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

                    {/* Podium Pillar (Hanya Angka 3) */}
                    <div className="w-full mt-3 h-20 sm:h-28 md:h-36 rounded-t-2xl sm:rounded-t-3xl bg-gradient-to-b from-amber-600 via-amber-700 to-amber-800 border-t-2 border-amber-400 flex items-center justify-center group-hover:brightness-105 transition-all">
                      <span className="font-black text-3xl sm:text-5xl text-amber-200/80">3</span>
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
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between px-2">
                <h3 className="text-xs sm:text-sm font-black text-brand-900 uppercase tracking-wider flex items-center gap-2">
                  <Medal className="w-4 h-4 text-brand-500" />
                  Peringkat 4 Seterusnya ({rank4Onwards.length} Siswa)
                </h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {rank4Onwards.map((siswa) => {
                  const isTop10 = siswa.rank <= 10;
                  return (
                    <div
                      key={siswa.id}
                      ref={(el) => {
                        if (el) studentCardRefs.current.set(siswa.id, el);
                        else studentCardRefs.current.delete(siswa.id);
                      }}
                      onClick={() => openStudentShowcase(siswa)}
                      className={`group p-3.5 sm:p-4 rounded-2xl border transition-all flex items-center justify-between gap-3 shadow-xs ${
                        isStudentRole ? "cursor-default" : "cursor-pointer hover:shadow-md hover:-translate-y-0.5"
                      } ${
                        isTop10
                          ? "bg-purple-50/90 border-purple-200 hover:border-purple-400 shadow-purple-500/5"
                          : "bg-white border-slate-100 hover:border-brand-200"
                      }`}
                    >
                      <div className="flex items-center gap-3 sm:gap-3.5 min-w-0 flex-1">
                        {/* Rank Badge */}
                        <div
                          className={`w-8 h-8 rounded-xl flex items-center justify-center font-black text-xs shrink-0 ${
                            isTop10
                              ? "bg-purple-200/80 text-purple-900 border border-purple-300 font-extrabold"
                              : "bg-slate-100 text-slate-600 font-bold"
                          }`}
                        >
                          #{siswa.rank}
                        </div>

                        {/* Avatar (Portrait 3:4) */}
                        <div
                          className={`w-11 h-14 rounded-xl aspect-[3/4] overflow-hidden shrink-0 border ${
                            isTop10
                              ? "border-purple-200 bg-purple-100"
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
                              className={`w-full h-full flex items-center justify-center font-bold text-xs ${
                                isTop10 ? "text-purple-700" : "text-brand-700"
                              }`}
                            >
                              {siswa.nama.slice(0, 2).toUpperCase()}
                            </div>
                          )}
                        </div>

                        {/* Name & Class (No cut-off, wraps properly) */}
                        <div className="min-w-0 flex-1">
                          <h4
                            className={`font-extrabold text-xs sm:text-sm break-words line-clamp-2 leading-snug transition-colors ${
                              isTop10
                                ? "text-purple-950 group-hover:text-purple-700"
                                : "text-brand-950 group-hover:text-brand-600"
                            }`}
                          >
                            {toSentenceCase(siswa.nama)}
                          </h4>
                          <div
                            className={`flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] font-medium ${
                              isTop10 ? "text-purple-700/80" : "text-brand-400"
                            }`}
                          >
                            <span>Kelas {siswa.kelas}</span>
                            {siswa.nis && <span>• NIS: {siswa.nis}</span>}
                          </div>
                        </div>
                      </div>

                      {/* Points & Arrow */}
                      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                        <div
                          className={`px-2.5 sm:px-3 py-1 rounded-xl text-xs font-black flex items-center gap-1 ${
                            isTop10
                              ? "bg-purple-100 text-purple-900 border border-purple-300"
                              : "bg-amber-50 text-amber-800 border border-amber-200"
                          }`}
                        >
                          <TrendingUp className="w-3 h-3" />
                          {siswa.score}
                        </div>
                        {!isStudentRole && (
                          <ChevronRight
                            className={`w-4 h-4 transition-all ${
                              isTop10
                                ? "text-purple-300 group-hover:text-purple-600 group-hover:translate-x-0.5"
                                : "text-slate-300 group-hover:text-brand-500 group-hover:translate-x-0.5"
                            }`}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
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

              <div className="flex items-center gap-2">
                <button
                  onClick={() => openStudentShowcase(currentStudentRank.student)}
                  className="px-3 py-2 bg-amber-400 text-amber-950 hover:bg-amber-300 rounded-2xl text-xs font-black transition-all cursor-pointer shrink-0 flex items-center gap-1 shadow-sm active:scale-95"
                >
                  <span>Kartu</span>
                  <Sparkles className="w-3 h-3" />
                </button>
                <button
                  onClick={() => scrollToMyCard(currentStudentRank.student.id)}
                  className="px-3 py-2 bg-white/20 hover:bg-white/30 text-white rounded-2xl text-xs font-bold transition-all cursor-pointer shrink-0 flex items-center gap-1 shadow-sm active:scale-95"
                >
                  <span>Scroll</span>
                  <ArrowUpRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ========================================================================= */}
      {/* ===== LARGE PRESTIGE TROPHY CARD MODAL (SHOWCASE POPUP DENGAN ANIMASI) ===== */}
      {/* ========================================================================= */}
      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {showcaseStudent && (
              <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 overflow-y-auto">
                {/* Full Backdrop with GPU-Optimized Blur */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="fixed inset-0 bg-brand-950/65 backdrop-blur-md"
                  style={{ backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }}
                  onClick={() => setShowcaseStudent(null)}
                />

                {/* Showcase Card */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.9, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.92, y: 15 }}
                  transition={{ type: "spring", stiffness: 420, damping: 28 }}
                  className="relative w-full max-w-sm sm:max-w-md z-10 my-auto transform-gpu"
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Outer Frame */}
                  <div
                    className={`relative rounded-[36px] p-1.5 shadow-2xl overflow-hidden ${
                      showcaseStudent.rank === 1
                        ? "holo-gradient-gold gold-aura-glow animate-gold-shimmer"
                        : showcaseStudent.rank === 2
                        ? "holo-gradient-silver silver-aura-glow"
                        : showcaseStudent.rank === 3
                        ? "holo-gradient-bronze bronze-aura-glow"
                        : showcaseStudent.rank <= 10
                        ? "bg-gradient-to-tr from-purple-400 via-fuchsia-400 to-indigo-400 shadow-purple-500/30"
                        : "bg-gradient-to-b from-slate-200 via-slate-100 to-slate-200 border border-slate-200"
                    }`}
                  >
                    {/* Inner Card Body */}
                    <div
                      className={`rounded-[32px] p-6 sm:p-8 relative overflow-hidden text-center space-y-6 shadow-inner ${
                        showcaseStudent.rank === 1
                          ? "bg-gradient-to-b from-[#fffbeb] via-[#fef3c7] to-[#fde68a] text-amber-950 border border-amber-300"
                          : showcaseStudent.rank === 2
                          ? "bg-gradient-to-b from-[#f8fafc] via-[#f1f5f9] to-[#e2e8f0] text-slate-900 border border-slate-300"
                          : showcaseStudent.rank === 3
                          ? "bg-gradient-to-b from-[#fff7ed] via-[#ffedd5] to-[#fed7aa] text-amber-950 border border-amber-400/50"
                          : showcaseStudent.rank <= 10
                          ? "bg-gradient-to-b from-[#faf5ff] via-[#f3e8ff] to-[#e9d5ff] text-purple-950 border border-purple-200"
                          : "bg-gradient-to-b from-white via-white to-slate-50 text-slate-900 border border-slate-100"
                      }`}
                    >
                      {/* Decorative background aura lights */}
                      <div
                        className={`absolute -top-24 left-1/2 -translate-x-1/2 w-72 h-72 rounded-full blur-3xl pointer-events-none ${
                          showcaseStudent.rank === 1
                            ? "bg-amber-400/30"
                            : showcaseStudent.rank === 2
                            ? "bg-slate-300/40"
                            : showcaseStudent.rank === 3
                            ? "bg-amber-600/25"
                            : showcaseStudent.rank <= 10
                            ? "bg-purple-400/25"
                            : "bg-slate-200/30"
                        }`}
                      />

                      {/* Close Button */}
                      <button
                        onClick={() => setShowcaseStudent(null)}
                        className={`absolute top-4 right-4 p-2 rounded-full transition-all cursor-pointer z-20 ${
                          showcaseStudent.rank === 1
                            ? "text-amber-800 hover:text-amber-950 hover:bg-amber-200/70 bg-amber-100/90"
                            : showcaseStudent.rank === 2
                            ? "text-slate-600 hover:text-slate-900 hover:bg-slate-200/70 bg-slate-100"
                            : showcaseStudent.rank === 3
                            ? "text-amber-900 hover:text-amber-950 hover:bg-amber-200/70 bg-amber-100"
                            : showcaseStudent.rank <= 10
                            ? "text-purple-700 hover:text-purple-950 hover:bg-purple-200/70 bg-purple-100"
                            : "text-slate-500 hover:text-slate-800 hover:bg-slate-100 bg-slate-50"
                        }`}
                      >
                        <X className="w-5 h-5" />
                      </button>

                      {/* Top Tier Honor Banner */}
                      <div className="relative pt-1">
                        <motion.div
                          initial={{ scale: 0.8, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          transition={{ delay: 0.1 }}
                          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest shadow-md text-white"
                          style={{
                            background:
                              showcaseStudent.rank === 1
                                ? "linear-gradient(135deg, #f59e0b, #d97706)"
                                : showcaseStudent.rank === 2
                                ? "linear-gradient(135deg, #64748b, #475569)"
                                : showcaseStudent.rank === 3
                                ? "linear-gradient(135deg, #b45309, #78350f)"
                                : showcaseStudent.rank <= 10
                                ? "linear-gradient(135deg, #9333ea, #7c3aed)"
                                : "linear-gradient(135deg, #475569, #334155)",
                          }}
                        >
                          {showcaseStudent.rank === 1 ? (
                            <>
                              <Crown className="w-4 h-4 fill-amber-200 animate-bounce" />
                              <span>GOLD CHAMPION • JUARA 1</span>
                            </>
                          ) : showcaseStudent.rank === 2 ? (
                            <>
                              <span>🥈 SILVER MASTER • JUARA 2</span>
                            </>
                          ) : showcaseStudent.rank === 3 ? (
                            <>
                              <span>🥉 BRONZE ACHIEVER • JUARA 3</span>
                            </>
                          ) : showcaseStudent.rank <= 10 ? (
                            <>
                              <Award className="w-4 h-4" />
                              <span>TOP 10 ELITE TIER</span>
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-4 h-4" />
                              <span>STUDENT APPRECIATION</span>
                            </>
                          )}
                        </motion.div>
                      </div>

                      {/* Center Showcase: Large Photo with Trophy / Medal Halo */}
                      <div className="relative flex justify-center items-center py-3">
                        {/* Floating Frame */}
                        <div
                          className={`relative rounded-3xl p-1.5 shadow-2xl transition-all ${
                            showcaseStudent.rank === 1
                              ? "bg-gradient-to-tr from-amber-400 via-yellow-200 to-amber-500 gold-aura-glow ring-4 ring-amber-400/50"
                              : showcaseStudent.rank === 2
                              ? "bg-gradient-to-tr from-slate-300 via-slate-100 to-slate-400 silver-aura-glow ring-4 ring-slate-300/60"
                              : showcaseStudent.rank === 3
                              ? "bg-gradient-to-tr from-amber-700 via-amber-500 to-amber-800 bronze-aura-glow ring-4 ring-amber-600/50"
                              : showcaseStudent.rank <= 10
                              ? "bg-gradient-to-tr from-purple-400 to-fuchsia-400 ring-4 ring-purple-300/50 shadow-purple-500/20"
                              : "bg-slate-100 ring-4 ring-slate-200 shadow-md"
                          }`}
                        >
                          <div className="w-42 h-56 sm:w-51 sm:h-68 aspect-[3/4] rounded-2xl overflow-hidden bg-slate-900 flex items-center justify-center shadow-inner">
                            {showcaseStudent.foto_url ? (
                              <img
                                src={showcaseStudent.foto_url}
                                alt={showcaseStudent.nama}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div
                                className={`w-full h-full flex items-center justify-center font-black text-5xl uppercase ${
                                  showcaseStudent.rank === 1
                                    ? "bg-amber-200 text-amber-900"
                                    : showcaseStudent.rank === 2
                                    ? "bg-slate-300 text-slate-800"
                                    : showcaseStudent.rank === 3
                                    ? "bg-amber-200 text-amber-950"
                                    : showcaseStudent.rank <= 10
                                    ? "bg-purple-200 text-purple-900"
                                    : "bg-slate-100 text-slate-700"
                                }`}
                              >
                                {showcaseStudent.nama.slice(0, 2)}
                              </div>
                            )}
                          </div>

                          {/* Giant Floating Rank Badge on Bottom Corner */}
                          <div
                            className="absolute -bottom-4 -right-4 w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex flex-col items-center justify-center font-black shadow-2xl border-2 border-white text-white transform rotate-3"
                            style={{
                              background:
                                showcaseStudent.rank === 1
                                ? "linear-gradient(135deg, #fbbf24, #d97706)"
                                : showcaseStudent.rank === 2
                                ? "linear-gradient(135deg, #94a3b8, #475569)"
                                : showcaseStudent.rank === 3
                                ? "linear-gradient(135deg, #d97706, #92400e)"
                                : showcaseStudent.rank <= 10
                                ? "linear-gradient(135deg, #a855f7, #6b21a8)"
                                : "linear-gradient(135deg, #64748b, #334155)",
                            }}
                          >
                            <span className="text-[10px] uppercase tracking-tighter opacity-80 leading-none">RANK</span>
                            <span className="text-xl sm:text-2xl leading-none">#{showcaseStudent.rank}</span>
                          </div>
                        </div>
                      </div>

                      {/* Student Identity */}
                      <div className="space-y-2 pt-2">
                        <h3
                          className={`text-xl sm:text-2xl font-black tracking-tight ${
                            showcaseStudent.rank === 1
                              ? "text-amber-950"
                              : showcaseStudent.rank === 2
                              ? "text-slate-900"
                              : showcaseStudent.rank === 3
                              ? "text-amber-950"
                              : showcaseStudent.rank <= 10
                              ? "text-purple-950"
                              : "text-slate-900"
                          }`}
                        >
                          {toSentenceCase(showcaseStudent.nama)}
                        </h3>

                        <div className="flex items-center justify-center gap-2 text-xs font-bold">
                          <span
                            className={`px-3.5 py-1.5 rounded-xl border ${
                              showcaseStudent.rank === 1
                                ? "bg-amber-200/60 border-amber-300 text-amber-900"
                                : showcaseStudent.rank === 2
                                ? "bg-slate-200/70 border-slate-300 text-slate-800"
                                : showcaseStudent.rank === 3
                                ? "bg-amber-200/60 border-amber-300 text-amber-950"
                                : showcaseStudent.rank <= 10
                                ? "bg-purple-200/60 border-purple-300 text-purple-900"
                                : "bg-slate-100 border-slate-200 text-slate-700"
                            }`}
                          >
                            Kelas {showcaseStudent.kelas}
                          </span>
                          {showcaseStudent.nis && (
                            <span
                              className={`px-3.5 py-1.5 rounded-xl border ${
                                showcaseStudent.rank === 1
                                  ? "bg-amber-200/60 border-amber-300 text-amber-900"
                                  : showcaseStudent.rank === 2
                                  ? "bg-slate-200/70 border-slate-300 text-slate-800"
                                  : showcaseStudent.rank === 3
                                  ? "bg-amber-200/60 border-amber-300 text-amber-950"
                                  : showcaseStudent.rank <= 10
                                  ? "bg-purple-200/60 border-purple-300 text-purple-900"
                                  : "bg-slate-100 border-slate-200 text-slate-700"
                              }`}
                            >
                              NIS: {showcaseStudent.nis}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </div>
  );
}
