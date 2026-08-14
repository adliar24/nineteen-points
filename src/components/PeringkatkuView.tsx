import React, { useMemo } from "react";
import { motion } from "motion/react";
import {
  Trophy,
  Crown,
  Sparkles,
  Award,
  TrendingUp,
  User,
  ShieldCheck,
  Sparkle
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getSiswaListLight, getRiwayatList } from "../dbStore";
import { UserSession, Siswa } from "../types";
import { toSentenceCase } from "../formatName";
import SkeletonLoader from "./SkeletonLoader";

interface PeringkatkuViewProps {
  userSession?: UserSession | null;
}

interface RankedSiswa extends Siswa {
  score: number;
  positif: number;
  negatif: number;
  net: number;
  rank: number;
}

export default function PeringkatkuView({ userSession }: PeringkatkuViewProps) {
  // Read-only data queries
  const { data: siswaList = [], isLoading: loadingSiswa } = useQuery({
    queryKey: ["siswa"],
    queryFn: getSiswaListLight,
    staleTime: 2 * 60_000,
  });

  const { data: riwayatList = [], isLoading: loadingRiwayat } = useQuery({
    queryKey: ["riwayat"],
    queryFn: getRiwayatList,
    staleTime: 2 * 60_000,
  });

  const isLoading = loadingSiswa || loadingRiwayat;

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

  // Ranked students by highest positive points
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

    list.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.nama.localeCompare(b.nama);
    });

    return list.map((s, index) => ({
      ...s,
      rank: index + 1,
    }));
  }, [siswaList, studentPoinMap]);

  // Find the logged-in student's rank data
  const myData = useMemo(() => {
    if (!userSession) return null;
    const userNis = userSession.nis || userSession.email.split("@")[0];
    return rankedStudents.find(
      (s) =>
        s.nis === userNis ||
        s.id === userSession.id ||
        s.nama.toLowerCase() === userSession.fullName.toLowerCase()
    );
  }, [userSession, rankedStudents]);

  if (isLoading) {
    return (
      <div className="max-w-md mx-auto py-8 space-y-4">
        <SkeletonLoader type="card" count={1} />
      </div>
    );
  }

  if (!myData) {
    return (
      <div className="max-w-md mx-auto bg-white rounded-3xl p-8 border border-brand-100 text-center space-y-4 shadow-sm my-6">
        <div className="w-16 h-16 bg-amber-50 rounded-2xl flex items-center justify-center mx-auto text-amber-500 border border-amber-100">
          <Trophy className="w-8 h-8 opacity-60" />
        </div>
        <h3 className="text-base font-bold text-brand-950">Data Peringkat Belum Tersedia</h3>
        <p className="text-xs text-brand-400">
          Akun siswa Anda belum terhubung dengan data perolehan poin prestasi di sistem.
        </p>
      </div>
    );
  }

  const rank = myData.rank;

  return (
    <div className="space-y-6 pb-20 animate-fade-in font-sans max-w-lg mx-auto">
      {/* Header Info */}
      <div className="text-center space-y-1.5 px-2">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-50 border border-brand-100 text-brand-700 text-xs font-black">
          <Trophy className="w-3.5 h-3.5 text-amber-500" />
          <span>KARTU PRESTISE SISWA</span>
        </div>
        <h1 className="text-xl sm:text-2xl font-black text-brand-950 tracking-tight">
          Peringkat Prestasi Saya
        </h1>
        <p className="text-xs text-brand-500 font-medium">
          Kartu kehormatan resmi berdasarkan akumulasi poin prestasi Anda di Nineteen Space.
        </p>
      </div>

      {/* ===== THE LARGE PRESTIGE TROPHY CARD ===== */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 24 }}
        className="relative w-full"
      >
        {/* Outer Frame Glow */}
        <div
          className={`relative rounded-[36px] p-1.5 shadow-2xl overflow-hidden ${
            rank === 1
              ? "holo-gradient-gold gold-aura-glow animate-gold-shimmer"
              : rank === 2
              ? "holo-gradient-silver silver-aura-glow"
              : rank === 3
              ? "holo-gradient-bronze bronze-aura-glow"
              : rank <= 10
              ? "bg-gradient-to-tr from-purple-400 via-fuchsia-400 to-indigo-400 shadow-purple-500/30"
              : "bg-gradient-to-b from-slate-200 via-slate-100 to-slate-200 border border-slate-200"
          }`}
        >
          {/* Inner Card Body */}
          <div
            className={`rounded-[32px] p-6 sm:p-8 relative overflow-hidden text-center space-y-6 shadow-inner ${
              rank === 1
                ? "bg-gradient-to-b from-[#fffbeb] via-[#fef3c7] to-[#fde68a] text-amber-950 border border-amber-300"
                : rank === 2
                ? "bg-gradient-to-b from-[#f8fafc] via-[#f1f5f9] to-[#e2e8f0] text-slate-900 border border-slate-300"
                : rank === 3
                ? "bg-gradient-to-b from-[#fff7ed] via-[#ffedd5] to-[#fed7aa] text-amber-950 border border-amber-400/50"
                : rank <= 10
                ? "bg-gradient-to-b from-[#faf5ff] via-[#f3e8ff] to-[#e9d5ff] text-purple-950 border border-purple-200"
                : "bg-gradient-to-b from-white via-white to-slate-50 text-slate-900 border border-slate-100"
            }`}
          >
            {/* Decorative background aura lights */}
            <div
              className={`absolute -top-24 left-1/2 -translate-x-1/2 w-72 h-72 rounded-full blur-3xl pointer-events-none ${
                rank === 1
                  ? "bg-amber-400/30"
                  : rank === 2
                  ? "bg-slate-300/40"
                  : rank === 3
                  ? "bg-amber-600/25"
                  : rank <= 10
                  ? "bg-purple-400/25"
                  : "bg-slate-200/30"
              }`}
            />

            {/* Top Tier Honor Banner */}
            <div className="relative pt-1">
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.1 }}
                className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest shadow-md text-white"
                style={{
                  background:
                    rank === 1
                      ? "linear-gradient(135deg, #f59e0b, #d97706)"
                      : rank === 2
                      ? "linear-gradient(135deg, #64748b, #475569)"
                      : rank === 3
                      ? "linear-gradient(135deg, #b45309, #78350f)"
                      : rank <= 10
                      ? "linear-gradient(135deg, #9333ea, #7c3aed)"
                      : "linear-gradient(135deg, #475569, #334155)",
                }}
              >
                {rank === 1 ? (
                  <>
                    <Crown className="w-4 h-4 fill-amber-200 animate-bounce" />
                    <span>GOLD CHAMPION • JUARA 1</span>
                  </>
                ) : rank === 2 ? (
                  <>
                    <span>🥈 SILVER MASTER • JUARA 2</span>
                  </>
                ) : rank === 3 ? (
                  <>
                    <span>🥉 BRONZE ACHIEVER • JUARA 3</span>
                  </>
                ) : rank <= 10 ? (
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

            {/* Center Showcase: Photo with Ring & Badge */}
            <div className="relative flex justify-center items-center py-3">
              {/* Floating Frame */}
              <div
                className={`relative rounded-3xl p-1.5 shadow-2xl transition-all ${
                  rank === 1
                    ? "bg-gradient-to-tr from-amber-400 via-yellow-200 to-amber-500 gold-aura-glow ring-4 ring-amber-400/50"
                    : rank === 2
                    ? "bg-gradient-to-tr from-slate-300 via-slate-100 to-slate-400 silver-aura-glow ring-4 ring-slate-300/60"
                    : rank === 3
                    ? "bg-gradient-to-tr from-amber-700 via-amber-500 to-amber-800 bronze-aura-glow ring-4 ring-amber-600/50"
                    : rank <= 10
                    ? "bg-gradient-to-tr from-purple-400 to-fuchsia-400 ring-4 ring-purple-300/50 shadow-purple-500/20"
                    : "bg-slate-100 ring-4 ring-slate-200 shadow-md"
                }`}
              >
                <div className="w-42 h-56 sm:w-51 sm:h-68 aspect-[3/4] rounded-2xl overflow-hidden bg-slate-900 flex items-center justify-center shadow-inner">
                  {myData.foto_url ? (
                    <img
                      src={myData.foto_url}
                      alt={myData.nama}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div
                      className={`w-full h-full flex items-center justify-center font-black text-5xl uppercase ${
                        rank === 1
                          ? "bg-amber-200 text-amber-900"
                          : rank === 2
                          ? "bg-slate-300 text-slate-800"
                          : rank === 3
                          ? "bg-amber-200 text-amber-950"
                          : rank <= 10
                          ? "bg-purple-200 text-purple-900"
                          : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {myData.nama.slice(0, 2)}
                    </div>
                  )}
                </div>

                {/* Giant Floating Rank Badge on Bottom Corner */}
                <div
                  className="absolute -bottom-4 -right-4 w-16 h-16 sm:w-18 sm:h-18 rounded-2xl flex flex-col items-center justify-center font-black shadow-2xl border-2 border-white text-white transform rotate-3"
                  style={{
                    background:
                      rank === 1
                        ? "linear-gradient(135deg, #fbbf24, #d97706)"
                        : rank === 2
                        ? "linear-gradient(135deg, #94a3b8, #475569)"
                        : rank === 3
                        ? "linear-gradient(135deg, #d97706, #92400e)"
                        : rank <= 10
                        ? "linear-gradient(135deg, #a855f7, #6b21a8)"
                        : "linear-gradient(135deg, #64748b, #334155)",
                  }}
                >
                  <span className="text-[10px] uppercase tracking-tighter opacity-80 leading-none">RANK</span>
                  <span className="text-2xl sm:text-3xl leading-none">#{rank}</span>
                </div>
              </div>
            </div>

            {/* Student Identity (Clean, readable text without truncate on mobile) */}
            <div className="space-y-2.5 pt-1 px-1">
              <h2
                className={`text-lg sm:text-2xl font-black tracking-tight leading-snug break-words ${
                  rank === 1
                    ? "text-amber-950"
                    : rank === 2
                    ? "text-slate-900"
                    : rank === 3
                    ? "text-amber-950"
                    : rank <= 10
                    ? "text-purple-950"
                    : "text-slate-900"
                }`}
              >
                {toSentenceCase(myData.nama)}
              </h2>

              <div className="flex flex-wrap items-center justify-center gap-2 text-xs font-bold">
                <span
                  className={`px-3.5 py-1.5 rounded-xl border ${
                    rank === 1
                      ? "bg-amber-200/60 border-amber-300 text-amber-900"
                      : rank === 2
                      ? "bg-slate-200/70 border-slate-300 text-slate-800"
                      : rank === 3
                      ? "bg-amber-200/60 border-amber-300 text-amber-950"
                      : rank <= 10
                      ? "bg-purple-200/60 border-purple-300 text-purple-900"
                      : "bg-slate-100 border-slate-200 text-slate-700"
                  }`}
                >
                  Kelas {myData.kelas}
                </span>
                {myData.nis && (
                  <span
                    className={`px-3.5 py-1.5 rounded-xl border ${
                      rank === 1
                        ? "bg-amber-200/60 border-amber-300 text-amber-900"
                        : rank === 2
                        ? "bg-slate-200/70 border-slate-300 text-slate-800"
                        : rank === 3
                        ? "bg-amber-200/60 border-amber-300 text-amber-950"
                        : rank <= 10
                        ? "bg-purple-200/60 border-purple-300 text-purple-900"
                        : "bg-slate-100 border-slate-200 text-slate-700"
                    }`}
                  >
                    NIS: {myData.nis}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
