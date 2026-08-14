import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Search,
  ArrowDownWideNarrow,
  ArrowUpWideNarrow,
  ArrowUpDown,
  ListChecks,
  History,
  Eye,
} from "lucide-react";
import { getSiswaList, getSiswaSeparatePoinMap } from "../dbStore";
import { toSentenceCase } from "../formatName";
import { Siswa, UserSession } from "../types";
import PaginationFooter from "./PaginationFooter";
import StudentHistoryModal from "./StudentHistoryModal";

type SortMode = "tertinggi" | "terendah" | "nama";

const SORT_OPTIONS: { key: SortMode; label: string; icon: React.ReactNode }[] = [
  { key: "tertinggi", label: "Poin (+) Tertinggi", icon: <ArrowDownWideNarrow className="w-3.5 h-3.5" /> },
  { key: "terendah", label: "Poin (-) Terbanyak", icon: <ArrowUpWideNarrow className="w-3.5 h-3.5" /> },
  { key: "nama", label: "Nama A-Z", icon: <ArrowUpDown className="w-3.5 h-3.5" /> },
];

interface RekapPoinViewProps {
  userSession?: UserSession;
}

export default function RekapPoinView({ userSession }: RekapPoinViewProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedKelas, setSelectedKelas] = useState("Semua");
  const [sortMode, setSortMode] = useState<SortMode>("tertinggi");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedSiswaForHistory, setSelectedSiswaForHistory] = useState<Siswa | null>(null);
  const itemsPerPage = 20;

  const { data: siswaList = [], isLoading: loadingSiswa } = useQuery({
    queryKey: ["siswa"],
    queryFn: getSiswaList,
  });
  const { data: poinMap = {}, isLoading: loadingPoin } = useQuery({
    queryKey: ["siswaPoinMap"],
    queryFn: getSiswaSeparatePoinMap,
  });

  const isLoading = loadingSiswa || loadingPoin;

  const classes = useMemo(
    () => [
      "Semua",
      ...Array.from(new Set(siswaList.map((s) => s.kelas))).sort((a: string, b: string) =>
        a.localeCompare(b, "id")
      ),
    ],
    [siswaList]
  );

  const filteredSiswa = useMemo(() => {
    return siswaList.filter((s) => {
      const matchesSearch =
        !searchQuery ||
        s.nama.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.nis.includes(searchQuery);
      const matchesClass = selectedKelas === "Semua" || s.kelas === selectedKelas;
      return matchesSearch && matchesClass;
    });
  }, [siswaList, searchQuery, selectedKelas]);

  const sortedSiswa = useMemo(() => {
    const sorted = [...filteredSiswa];
    if (sortMode === "tertinggi") {
      sorted.sort((a, b) => (poinMap[b.id]?.positif || 0) - (poinMap[a.id]?.positif || 0) || a.nama.localeCompare(b.nama, "id"));
    } else if (sortMode === "terendah") {
      sorted.sort((a, b) => (poinMap[b.id]?.negatif || 0) - (poinMap[a.id]?.negatif || 0) || a.nama.localeCompare(b.nama, "id"));
    } else {
      sorted.sort((a, b) => a.nama.localeCompare(b.nama, "id"));
    }
    return sorted;
  }, [filteredSiswa, sortMode, poinMap]);

  const totalPages = Math.ceil(sortedSiswa.length / itemsPerPage);
  const paginatedSiswa = sortedSiswa.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const medalClass = (rank: number) => {
    if (rank === 1) return "bg-amber-100 text-amber-700 border-amber-300";
    if (rank === 2) return "bg-slate-100 text-slate-600 border-slate-300";
    if (rank === 3) return "bg-orange-100 text-orange-700 border-orange-300";
    return "bg-brand-50 text-brand-600";
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h2 className="text-xl font-extrabold text-brand-950 tracking-tight">Rekapitulasi Poin Murid</h2>
        <div className="bg-white p-5 rounded-3xl border border-brand-100/60 space-y-4">
          <div className="h-11 bg-slate-100 rounded-2xl animate-pulse" />
          <div className="h-72 bg-slate-50 rounded-2xl animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8 animate-fade-in font-sans">
      <div>
        <h2 className="text-xl font-extrabold text-brand-950 tracking-tight">Rekapitulasi Poin Murid</h2>
        <p className="text-xs text-brand-500 font-semibold mt-1">
          Rekapitulasi poin positif dan poin negatif seluruh murid terpisah. Klik nama murid atau tombol Riwayat untuk melihat audit log per individu.
        </p>
      </div>

      {/* FILTER & SORT BAR */}
      <div className="bg-white p-4 rounded-3xl border border-brand-100/60 shadow-md shadow-brand-900/5 flex flex-col lg:flex-row gap-3">
        <div className="relative flex-1 min-w-0">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-brand-300" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari nama atau NIS murid..."
            className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-brand-50/60 border border-brand-100 focus:border-brand-500 focus:ring-2 focus:ring-brand-200 outline-none text-sm font-semibold text-brand-900 placeholder:text-brand-300 transition-all"
          />
        </div>

        <select
          value={selectedKelas}
          onChange={(e) => setSelectedKelas(e.target.value)}
          className="px-4 py-2.5 rounded-2xl bg-brand-50/60 border border-brand-100 focus:border-brand-500 focus:ring-2 focus:ring-brand-200 outline-none text-sm font-semibold text-brand-900 cursor-pointer transition-all lg:w-52"
        >
          {classes.map((kelas) => (
            <option key={kelas} value={kelas}>
              {kelas === "Semua" ? "Semua Kelas" : kelas}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1 flex items-center gap-1">
            <ListChecks className="w-3.5 h-3.5" /> Urutkan
          </span>
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              onClick={() => setSortMode(opt.key)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all cursor-pointer border ${
                sortMode === opt.key
                  ? "bg-brand-600 border-brand-600 text-white shadow-md shadow-brand-500/20"
                  : "bg-slate-50 text-slate-500 border-transparent hover:bg-slate-100"
              }`}
            >
              {opt.icon}
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* TABLE */}
      <div className="bg-white rounded-3xl border border-brand-100/60 shadow-md shadow-brand-900/5 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-brand-100 bg-brand-50/40 text-[10px] font-black uppercase tracking-widest text-slate-400">
                <th className="px-4 py-3.5 w-12">#</th>
                <th className="px-4 py-3.5">Murid</th>
                <th className="px-4 py-3.5">NIS</th>
                <th className="px-4 py-3.5">Kelas</th>
                <th className="px-4 py-3.5 text-center">Poin Positif (+)</th>
                <th className="px-4 py-3.5 text-center">Poin Negatif (-)</th>
                <th className="px-4 py-3.5 text-center">Riwayat</th>
              </tr>
            </thead>
            <tbody>
              {paginatedSiswa.length > 0 ? (
                paginatedSiswa.map((siswa, idx) => {
                  const rank = (currentPage - 1) * itemsPerPage + idx + 1;
                  const split = poinMap[siswa.id] || { positif: 0, negatif: 0 };
                  return (
                    <tr
                      key={siswa.id}
                      className="border-b border-brand-50 last:border-0 hover:bg-brand-50/40 transition-colors cursor-pointer group"
                      onClick={() => setSelectedSiswaForHistory(siswa)}
                    >
                      <td className="px-4 py-3">
                        <span className={`w-7 h-7 rounded-xl flex items-center justify-center font-black text-[10px] border ${medalClass(rank)}`}>
                          {rank}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3 min-w-0">
                          {siswa.foto_url ? (
                            <img
                              src={siswa.foto_url}
                              alt={siswa.nama}
                              className="w-9 h-11 rounded-lg object-cover border border-brand-100 flex-shrink-0"
                            />
                          ) : (
                            <div className="w-9 h-11 rounded-lg bg-gradient-to-tr from-accent-500 to-amber-400 flex items-center justify-center font-black text-[10px] uppercase text-white flex-shrink-0">
                              {siswa.nama.slice(0, 2)}
                            </div>
                          )}
                          <span className="font-extrabold text-xs text-brand-950 leading-tight truncate group-hover:text-brand-600 transition-colors">
                            {toSentenceCase(siswa.nama)}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs font-bold text-brand-500">{siswa.nis}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex px-2.5 py-1 rounded-lg bg-brand-50 border border-brand-100 text-[10px] font-black text-brand-700 uppercase">
                          {siswa.kelas}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex px-3 py-1.5 rounded-xl border border-emerald-200 bg-emerald-50 font-mono font-black text-emerald-700 text-sm">
                          +{split.positif}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex px-3 py-1.5 rounded-xl border border-rose-200 bg-rose-50 font-mono font-black text-rose-700 text-sm">
                          -{split.negatif}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => setSelectedSiswaForHistory(siswa)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-brand-50 hover:bg-brand-100 text-brand-700 font-extrabold text-xs border border-brand-200 transition-all cursor-pointer shadow-xs hover:scale-105"
                        >
                          <History className="w-3.5 h-3.5 text-brand-600" />
                          Detail
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="px-4 py-16 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <Search className="w-6 h-6 text-brand-200" />
                      <p className="text-sm font-bold text-brand-400">Tidak ada murid yang cocok dengan filter.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <PaginationFooter
          totalItems={sortedSiswa.length}
          itemsPerPage={itemsPerPage}
          currentPage={currentPage}
          setCurrentPage={setCurrentPage}
          itemLabel="murid"
        />
      </div>

      {/* Modal Detail Riwayat Poin Individu */}
      <StudentHistoryModal
        isOpen={!!selectedSiswaForHistory}
        onClose={() => setSelectedSiswaForHistory(null)}
        siswa={selectedSiswaForHistory}
        poinSummary={selectedSiswaForHistory ? poinMap[selectedSiswaForHistory.id] : undefined}
        userSession={userSession}
      />
    </div>
  );
}
