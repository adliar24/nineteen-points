import React, { useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import { X, Search, History, Calendar, User, Filter, Award, TrendingUp } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Siswa } from "../types";
import { getRiwayatSiswa } from "../dbStore";
import { toSentenceCase } from "../formatName";

interface StudentHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  siswa: Siswa | null;
  poinSummary?: { positif: number; negatif: number };
}

export default function StudentHistoryModal({
  isOpen,
  onClose,
  siswa,
  poinSummary,
}: StudentHistoryModalProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<"semua" | "positif" | "negatif">("semua");

  const { data: riwayatList = [], isLoading } = useQuery({
    queryKey: ["riwayatSiswa", siswa?.id],
    queryFn: () => (siswa ? getRiwayatSiswa(siswa.id) : Promise.resolve([])),
    enabled: !!siswa && isOpen,
  });

  const computedSummary = useMemo(() => {
    if (poinSummary) return poinSummary;
    let positif = 0;
    let negatif = 0;
    riwayatList.forEach((r) => {
      if (r.nilai_diberikan > 0) positif += r.nilai_diberikan;
      else if (r.nilai_diberikan < 0) negatif += Math.abs(r.nilai_diberikan);
    });
    return { positif, negatif };
  }, [poinSummary, riwayatList]);

  const filteredRiwayat = useMemo(() => {
    return riwayatList.filter((r) => {
      const matchSearch =
        !searchQuery ||
        r.nama_poin.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (r.guru_email && r.guru_email.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchType =
        filterType === "semua" ||
        (filterType === "positif" && r.nilai_diberikan > 0) ||
        (filterType === "negatif" && r.nilai_diberikan < 0);

      return matchSearch && matchType;
    });
  }, [riwayatList, searchQuery, filterType]);

  if (!isOpen || !siswa) return null;

  return createPortal(
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 bg-black/75"
          onClick={onClose}
        />

        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 10 }}
          transition={{ type: "spring", stiffness: 420, damping: 32 }}
          className="bg-white rounded-3xl border border-brand-100 shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col relative z-10 overflow-hidden font-sans"
        >
          {/* Header Bar */}
          <div className="px-6 py-4 border-b border-brand-100/60 bg-gradient-to-r from-brand-900 to-brand-950 text-white flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center border border-white/10">
                <History className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <h3 className="text-base font-extrabold tracking-tight">Detail Riwayat Poin Murid</h3>
                <p className="text-xs text-brand-200">Audit log catatan perilaku & presensi keagamaan</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/10 text-brand-300 hover:text-white rounded-xl transition-all cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Student Info & Poin Badge Banner */}
          <div className="p-6 bg-brand-50/40 border-b border-brand-100/60 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              {siswa.foto_url ? (
                <img
                  src={siswa.foto_url}
                  alt={siswa.nama}
                  className="w-14 h-16 rounded-2xl object-cover border-2 border-white shadow-md flex-shrink-0"
                />
              ) : (
                <div className="w-14 h-16 rounded-2xl bg-gradient-to-tr from-accent-500 to-amber-400 flex items-center justify-center font-black text-lg text-white uppercase shadow-md flex-shrink-0">
                  {siswa.nama.slice(0, 2)}
                </div>
              )}
              <div>
                <h4 className="text-base font-extrabold text-brand-950">
                  {toSentenceCase(siswa.nama)}
                </h4>
                <div className="flex items-center gap-2 mt-1 text-xs font-semibold text-brand-600">
                  <span className="bg-white px-2.5 py-0.5 rounded-lg border border-brand-100 font-mono font-bold">
                    NIS: {siswa.nis}
                  </span>
                  <span className="bg-brand-600 text-white px-2.5 py-0.5 rounded-lg font-black uppercase text-[10px]">
                    Kelas {siswa.kelas}
                  </span>
                </div>
              </div>
            </div>

            {/* Poin Cards */}
            <div className="flex items-center gap-3">
              <div className="bg-white px-4 py-2.5 rounded-2xl border border-emerald-200 shadow-xs text-center min-w-[110px]">
                <div className="flex items-center justify-center gap-1 text-[10px] font-black text-emerald-600 uppercase tracking-wider">
                  <Award className="w-3.5 h-3.5" /> Poin (+)
                </div>
                <span className="text-lg font-mono font-black text-emerald-700 block mt-0.5">
                  +{computedSummary.positif}
                </span>
              </div>
              <div className="bg-white px-4 py-2.5 rounded-2xl border border-rose-200 shadow-xs text-center min-w-[110px]">
                <div className="flex items-center justify-center gap-1 text-[10px] font-black text-rose-600 uppercase tracking-wider">
                  <TrendingUp className="w-3.5 h-3.5 rotate-180" /> Poin (-)
                </div>
                <span className="text-lg font-mono font-black text-rose-700 block mt-0.5">
                  -{computedSummary.negatif}
                </span>
              </div>
            </div>
          </div>

          {/* Controls Bar: Search & Filter Tabs */}
          <div className="p-4 border-b border-brand-100/60 bg-white flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-brand-300" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari poin, pelanggaran, atau guru pencatat..."
                className="w-full pl-10 pr-4 py-2 bg-brand-50/50 rounded-xl border border-brand-100 text-xs font-semibold text-brand-900 placeholder:text-brand-300 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200 transition-all"
              />
            </div>

            <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 shrink-0">
              <button
                onClick={() => setFilterType("semua")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  filterType === "semua"
                    ? "bg-white text-brand-950 shadow-xs"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                Semua ({riwayatList.length})
              </button>
              <button
                onClick={() => setFilterType("positif")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  filterType === "positif"
                    ? "bg-emerald-600 text-white shadow-xs"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                Positif (+)
              </button>
              <button
                onClick={() => setFilterType("negatif")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  filterType === "negatif"
                    ? "bg-rose-600 text-white shadow-xs"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                Negatif (-)
              </button>
            </div>
          </div>

          {/* History List Content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 max-h-[450px]">
            {isLoading ? (
              <div className="py-16 text-center space-y-3">
                <div className="w-8 h-8 border-3 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-xs font-bold text-brand-400">Memuat riwayat poin...</p>
              </div>
            ) : filteredRiwayat.length === 0 ? (
              <div className="py-16 text-center space-y-3">
                <History className="w-10 h-10 text-brand-200 mx-auto" />
                <p className="text-xs font-bold text-brand-400">
                  {searchQuery || filterType !== "semua"
                    ? "Tidak ada riwayat yang sesuai dengan filter."
                    : "Belum ada catatan riwayat poin untuk murid ini."}
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {filteredRiwayat.map((record) => {
                  const isPositive = record.nilai_diberikan >= 0;
                  const dateObj = new Date(record.created_at);
                  const dateFormatted = dateObj.toLocaleDateString("id-ID", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  });
                  const timeFormatted = dateObj.toLocaleTimeString("id-ID", {
                    hour: "2-digit",
                    minute: "2-digit",
                  });

                  return (
                    <div
                      key={record.id}
                      className="p-3.5 bg-white hover:bg-brand-50/40 rounded-2xl border border-brand-100 shadow-xs flex items-center justify-between transition-colors gap-3"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-extrabold text-xs text-brand-950">
                            {record.nama_poin}
                          </span>
                          {record.semester && (
                            <span className="text-[9px] font-black text-brand-400 uppercase bg-brand-50 px-2 py-0.5 rounded border border-brand-100">
                              {record.semester}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-[10.5px] text-brand-400 font-semibold flex-wrap">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-brand-300" />
                            {dateFormatted} pukul {timeFormatted}
                          </span>
                          {record.guru_email && (
                            <span className="flex items-center gap-1">
                              <User className="w-3 h-3 text-brand-300" />
                              {record.guru_email}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex-shrink-0">
                        <span
                          className={`inline-flex items-center justify-center px-3 py-1.5 rounded-xl font-mono font-black text-xs border ${
                            isPositive
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : "bg-rose-50 text-rose-700 border-rose-200"
                          }`}
                        >
                          {isPositive ? `+${record.nilai_diberikan}` : record.nilai_diberikan}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-3.5 bg-brand-50/50 border-t border-brand-100/60 flex items-center justify-between text-xs font-semibold text-brand-500">
            <span>Menampilkan {filteredRiwayat.length} dari {riwayatList.length} catatan riwayat</span>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-white hover:bg-brand-100/80 border border-brand-200 text-brand-800 font-extrabold rounded-xl transition-all cursor-pointer shadow-xs"
            >
              Tutup
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>,
    document.body
  );
}
