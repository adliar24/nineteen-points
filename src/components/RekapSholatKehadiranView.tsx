import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { parseDateSafe } from "../parseDateSafe";
import {
  Calendar,
  Search,
  Download,
  Check,
  Users,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Sparkles,
  Sun,
  Moon,
} from "lucide-react";
import { UserSession } from "../types";
import { getRekapGabungan } from "../dbStore";
import { toSentenceCase, compareClasses } from "../formatName";
import PaginationFooter from "./PaginationFooter";

interface RekapSholatKehadiranViewProps {
  userSession: UserSession;
}

type SholatTab = "dhuha" | "jumat" | "berjamaah" | "semua";

export default function RekapSholatKehadiranView({ userSession }: RekapSholatKehadiranViewProps) {
  const today = new Date().toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [searchQuery, setSearchQuery] = useState("");
  const [classFilter, setClassFilter] = useState("Semua");
  const [activeTab, setActiveTab] = useState<SholatTab>("dhuha");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  const { data: rekapData = [], isLoading } = useQuery({
    queryKey: ["rekapGabungan", startDate, endDate],
    queryFn: () => getRekapGabungan(startDate, endDate),
    enabled: !!startDate && !!endDate,
  });

  const datesInRange = useMemo(() => {
    const start = parseDateSafe(startDate);
    const end = parseDateSafe(endDate);
    const dates: string[] = [];
    const current = new Date(start);
    while (current <= end) {
      dates.push(current.toISOString().slice(0, 10));
      current.setDate(current.getDate() + 1);
    }
    return dates;
  }, [startDate, endDate]);

  const classes = useMemo(
    () => ["Semua", ...Array.from(new Set(rekapData.map((r) => r.siswa_kelas).filter(Boolean))).sort(compareClasses)],
    [rekapData]
  );

  const filteredData = useMemo(() => {
    return rekapData.filter((row) => {
      const matchSearch =
        !searchQuery ||
        row.siswa_nama.toLowerCase().includes(searchQuery.toLowerCase()) ||
        row.siswa_nis.includes(searchQuery);
      const matchClass = classFilter === "Semua" || row.siswa_kelas === classFilter;
      return matchSearch && matchClass;
    });
  }, [rekapData, searchQuery, classFilter]);

  const totalPages = Math.ceil(filteredData.length / itemsPerPage);
  const paginatedData = filteredData.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Statistics per prayer type in range
  const stats = useMemo(() => {
    let dhuhaCount = 0;
    let jumatCount = 0;
    let berjamaahCount = 0;

    rekapData.forEach((row) => {
      datesInRange.forEach((d) => {
        if (row.sholatDhuha && row.sholatDhuha[d]) dhuhaCount++;
        if (row.sholatJumat && row.sholatJumat[d]) jumatCount++;
        if (row.sholat && row.sholat[d]) berjamaahCount++;
      });
    });

    return { dhuhaCount, jumatCount, berjamaahCount, total: dhuhaCount + jumatCount + berjamaahCount };
  }, [rekapData, datesInRange]);

  const handleExportCSV = () => {
    const headers = ["NIS", "Nama", "Kelas"];
    datesInRange.forEach((d) => {
      const label = parseDateSafe(d).toLocaleDateString("id-ID", { day: "2-digit", month: "short" });
      if (activeTab === "dhuha") headers.push(`Sholat Dhuha (${label})`);
      else if (activeTab === "jumat") headers.push(`Sholat Jumat (${label})`);
      else if (activeTab === "berjamaah") headers.push(`Sholat Berjamaah (${label})`);
      else {
        headers.push(`Sholat Dhuha (${label})`);
        headers.push(`Sholat Jumat (${label})`);
        headers.push(`Sholat Berjamaah (${label})`);
      }
    });

    const rows = filteredData.map((row) => {
      const cells = [row.siswa_nis, row.siswa_nama, row.siswa_kelas];
      datesInRange.forEach((d) => {
        if (activeTab === "dhuha") cells.push(row.sholatDhuha && row.sholatDhuha[d] ? "Ya" : "Tidak");
        else if (activeTab === "jumat") cells.push(row.sholatJumat && row.sholatJumat[d] ? "Ya" : "Tidak");
        else if (activeTab === "berjamaah") cells.push(row.sholat && row.sholat[d] ? "Ya" : "Tidak");
        else {
          cells.push(row.sholatDhuha && row.sholatDhuha[d] ? "Ya" : "Tidak");
          cells.push(row.sholatJumat && row.sholatJumat[d] ? "Ya" : "Tidak");
          cells.push(row.sholat && row.sholat[d] ? "Ya" : "Tidak");
        }
      });
      return cells.join(",");
    });

    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rekap-sholat-${activeTab}-${startDate}-${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const medalClass = (rank: number) => {
    if (rank === 1) return "bg-amber-100 text-amber-700 border-amber-300";
    if (rank === 2) return "bg-slate-100 text-slate-600 border-slate-300";
    if (rank === 3) return "bg-orange-100 text-orange-700 border-orange-300";
    return "bg-brand-50 text-brand-600";
  };

  return (
    <div className="space-y-6 pb-12 animate-fade-in font-sans">
      <div>
        <h2 className="text-xl font-extrabold text-brand-950 tracking-tight flex items-center gap-2">
          <ClipboardList className="w-6 h-6 text-brand-600" />
          Rekapitulasi Sholat Murid
        </h2>
        <p className="text-xs text-brand-500 font-semibold mt-1">
          Rekap kehadiran sholat murid dengan tampilan foto profil & tabel per jenis sholat.
        </p>
      </div>

      {/* Summary Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div
          onClick={() => setActiveTab("dhuha")}
          className={`p-4 rounded-3xl border transition-all cursor-pointer shadow-xs ${
            activeTab === "dhuha"
              ? "bg-amber-500 text-white border-amber-600 shadow-md scale-[1.02]"
              : "bg-white text-brand-950 border-brand-100 hover:bg-amber-50/40"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider opacity-80">Sholat Dhuha</span>
            <Sun className="w-4 h-4" />
          </div>
          <p className="text-2xl font-mono font-black mt-2">{stats.dhuhaCount}</p>
          <p className="text-[10px] opacity-70 mt-0.5">Catatan Hadir</p>
        </div>

        <div
          onClick={() => setActiveTab("jumat")}
          className={`p-4 rounded-3xl border transition-all cursor-pointer shadow-xs ${
            activeTab === "jumat"
              ? "bg-indigo-600 text-white border-indigo-700 shadow-md scale-[1.02]"
              : "bg-white text-brand-950 border-brand-100 hover:bg-indigo-50/40"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider opacity-80">Sholat Jumat</span>
            <BookOpen className="w-4 h-4" />
          </div>
          <p className="text-2xl font-mono font-black mt-2">{stats.jumatCount}</p>
          <p className="text-[10px] opacity-70 mt-0.5">Catatan Hadir</p>
        </div>

        <div
          onClick={() => setActiveTab("berjamaah")}
          className={`p-4 rounded-3xl border transition-all cursor-pointer shadow-xs ${
            activeTab === "berjamaah"
              ? "bg-emerald-600 text-white border-emerald-700 shadow-md scale-[1.02]"
              : "bg-white text-brand-950 border-brand-100 hover:bg-emerald-50/40"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider opacity-80">Berjamaah</span>
            <Users className="w-4 h-4" />
          </div>
          <p className="text-2xl font-mono font-black mt-2">{stats.berjamaahCount}</p>
          <p className="text-[10px] opacity-70 mt-0.5">Catatan Hadir</p>
        </div>

        <div
          onClick={() => setActiveTab("semua")}
          className={`p-4 rounded-3xl border transition-all cursor-pointer shadow-xs ${
            activeTab === "semua"
              ? "bg-brand-900 text-white border-brand-950 shadow-md scale-[1.02]"
              : "bg-white text-brand-950 border-brand-100 hover:bg-brand-50"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider opacity-80">Ringkasan Semua</span>
            <Sparkles className="w-4 h-4" />
          </div>
          <p className="text-2xl font-mono font-black mt-2">{stats.total}</p>
          <p className="text-[10px] opacity-70 mt-0.5">Total Presensi Sholat</p>
        </div>
      </div>

      {/* FILTER & SORT BAR */}
      <div className="bg-white p-4 rounded-3xl border border-brand-100/60 shadow-md shadow-brand-900/5 flex flex-col lg:flex-row gap-3">
        {/* Date Pickers */}
        <div className="flex items-center gap-2 bg-brand-50/60 px-3 py-2 rounded-2xl border border-brand-100 shrink-0">
          <Calendar className="w-4 h-4 text-brand-400" />
          <input
            type="date"
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              setCurrentPage(1);
            }}
            className="bg-transparent text-xs font-extrabold text-brand-900 outline-none"
          />
          <span className="text-xs text-brand-400 font-bold">s/d</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => {
              setEndDate(e.target.value);
              setCurrentPage(1);
            }}
            className="bg-transparent text-xs font-extrabold text-brand-900 outline-none"
          />
        </div>

        {/* Search Bar */}
        <div className="relative flex-1 min-w-0">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-brand-300" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="Cari nama atau NIS murid..."
            className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-brand-50/60 border border-brand-100 focus:border-brand-500 focus:ring-2 focus:ring-brand-200 outline-none text-sm font-semibold text-brand-900 placeholder:text-brand-300 transition-all"
          />
        </div>

        {/* Class Dropdown */}
        <select
          value={classFilter}
          onChange={(e) => {
            setClassFilter(e.target.value);
            setCurrentPage(1);
          }}
          className="px-4 py-2.5 rounded-2xl bg-brand-50/60 border border-brand-100 focus:border-brand-500 focus:ring-2 focus:ring-brand-200 outline-none text-sm font-semibold text-brand-900 cursor-pointer transition-all lg:w-48"
        >
          {classes.map((c) => (
            <option key={c} value={c}>
              {c === "Semua" ? "Semua Kelas" : `Kelas ${c}`}
            </option>
          ))}
        </select>

        {/* Export Button */}
        <button
          onClick={handleExportCSV}
          className="px-4 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-extrabold rounded-2xl border border-emerald-200 transition-all cursor-pointer flex items-center justify-center gap-1.5 flex-shrink-0"
        >
          <Download className="w-4 h-4" />
          Export CSV
        </button>
      </div>

      {/* PRAYER TYPE TABS BAR */}
      <div className="flex bg-slate-100 p-1.5 rounded-2xl border border-slate-200 w-fit max-w-full overflow-x-auto">
        <button
          onClick={() => setActiveTab("dhuha")}
          className={`px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-2 ${
            activeTab === "dhuha"
              ? "bg-amber-500 text-white shadow-md"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <Sun className="w-3.5 h-3.5" />
          Sholat Dhuha
        </button>
        <button
          onClick={() => setActiveTab("jumat")}
          className={`px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-2 ${
            activeTab === "jumat"
              ? "bg-indigo-600 text-white shadow-md"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <BookOpen className="w-3.5 h-3.5" />
          Sholat Jumat
        </button>
        <button
          onClick={() => setActiveTab("berjamaah")}
          className={`px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-2 ${
            activeTab === "berjamaah"
              ? "bg-emerald-600 text-white shadow-md"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          Sholat Berjamaah
        </button>
        <button
          onClick={() => setActiveTab("semua")}
          className={`px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-2 ${
            activeTab === "semua"
              ? "bg-brand-900 text-white shadow-md"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          Semua Sholat (Matrix)
        </button>
      </div>

      {/* DATA TABLE (Identical styling to RekapPoinView.tsx) */}
      <div className="bg-white rounded-3xl border border-brand-100/60 shadow-md shadow-brand-900/5 overflow-hidden">
        {isLoading ? (
          <div className="py-16 text-center">
            <div className="w-8 h-8 border-3 border-brand-400 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xs font-bold text-brand-400 mt-3">Memuat data rekap sholat...</p>
          </div>
        ) : paginatedData.length === 0 ? (
          <div className="py-16 text-center space-y-3">
            <BookOpen className="w-10 h-10 text-brand-200 mx-auto" />
            <p className="text-xs font-bold text-brand-400">Tidak ada data sholat untuk kriteria ini.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-brand-100 bg-brand-50/40 text-[10px] font-black uppercase tracking-widest text-slate-400">
                  <th className="px-4 py-3.5 w-12 sticky left-0 bg-brand-50/40 z-20">#</th>
                  <th className="px-4 py-3.5 sticky left-12 bg-brand-50/40 z-20 min-w-[200px]">Murid</th>
                  <th className="px-4 py-3.5">NIS</th>
                  <th className="px-4 py-3.5">Kelas</th>
                  {datesInRange.map((d) => (
                    <th key={d} className="px-3 py-3.5 text-center min-w-[130px]">
                      <div className="text-brand-900">{parseDateSafe(d).toLocaleDateString("id-ID", { weekday: "short" })}</div>
                      <div className="text-[9px] text-brand-400 font-bold">{parseDateSafe(d).toLocaleDateString("id-ID", { day: "2-digit", month: "short" })}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-50">
                {paginatedData.map((row, idx) => {
                  const rank = (currentPage - 1) * itemsPerPage + idx + 1;
                  return (
                    <tr key={row.siswa_id} className="hover:bg-brand-50/30 transition-colors">
                      {/* Rank */}
                      <td className="px-4 py-3 sticky left-0 bg-white z-10">
                        <span className={`w-7 h-7 rounded-xl flex items-center justify-center font-black text-[10px] border ${medalClass(rank)}`}>
                          {rank}
                        </span>
                      </td>

                      {/* Murid with Photo (Same as RekapPoinView) */}
                      <td className="px-4 py-3 sticky left-12 bg-white z-10">
                        <div className="flex items-center gap-3 min-w-0">
                          {row.foto_url ? (
                            <img
                              src={row.foto_url}
                              alt={row.siswa_nama}
                              className="w-9 h-11 rounded-lg object-cover border border-brand-100 flex-shrink-0"
                            />
                          ) : (
                            <div className="w-9 h-11 rounded-lg bg-gradient-to-tr from-accent-500 to-amber-400 flex items-center justify-center font-black text-[10px] uppercase text-white flex-shrink-0">
                              {row.siswa_nama.slice(0, 2)}
                            </div>
                          )}
                          <span className="font-extrabold text-xs text-brand-950 leading-tight truncate">
                            {toSentenceCase(row.siswa_nama)}
                          </span>
                        </div>
                      </td>

                      {/* NIS */}
                      <td className="px-4 py-3 font-mono text-xs font-bold text-brand-500">{row.siswa_nis}</td>

                      {/* Kelas */}
                      <td className="px-4 py-3">
                        <span className="inline-flex px-2.5 py-1 rounded-lg bg-brand-50 border border-brand-100 text-[10px] font-black text-brand-700 uppercase">
                          {row.siswa_kelas}
                        </span>
                      </td>

                      {/* Date Columns */}
                      {datesInRange.map((d) => {
                        if (activeTab === "dhuha") {
                          const isHadir = row.sholatDhuha && row.sholatDhuha[d];
                          return (
                            <td key={`${row.siswa_id}-${d}`} className="px-3 py-3 text-center">
                              {isHadir ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-amber-50 text-amber-700 font-extrabold text-xs border border-amber-200">
                                  <Check className="w-3.5 h-3.5 text-amber-600" /> Hadir
                                </span>
                              ) : (
                                <span className="text-xs text-slate-300 font-bold px-2">-</span>
                              )}
                            </td>
                          );
                        }

                        if (activeTab === "jumat") {
                          const isHadir = row.sholatJumat && row.sholatJumat[d];
                          return (
                            <td key={`${row.siswa_id}-${d}`} className="px-3 py-3 text-center">
                              {isHadir ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-indigo-50 text-indigo-700 font-extrabold text-xs border border-indigo-200">
                                  <Check className="w-3.5 h-3.5 text-indigo-600" /> Hadir
                                </span>
                              ) : (
                                <span className="text-xs text-slate-300 font-bold px-2">-</span>
                              )}
                            </td>
                          );
                        }

                        if (activeTab === "berjamaah") {
                          const isHadir = row.sholat && row.sholat[d];
                          return (
                            <td key={`${row.siswa_id}-${d}`} className="px-3 py-3 text-center">
                              {isHadir ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-emerald-50 text-emerald-700 font-extrabold text-xs border border-emerald-200">
                                  <Check className="w-3.5 h-3.5 text-emerald-600" /> Hadir
                                </span>
                              ) : (
                                <span className="text-xs text-slate-300 font-bold px-2">-</span>
                              )}
                            </td>
                          );
                        }

                        // Tab "semua" (Matrix overview)
                        const isDhuha = row.sholatDhuha && row.sholatDhuha[d];
                        const isJumat = row.sholatJumat && row.sholatJumat[d];
                        const isBj = row.sholat && row.sholat[d];

                        return (
                          <td key={`${row.siswa_id}-${d}`} className="px-3 py-3 text-center">
                            <div className="flex flex-col gap-1 items-center">
                              {isDhuha && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-black text-amber-800 bg-amber-100 px-2 py-0.5 rounded-md border border-amber-200">
                                  <Check className="w-2.5 h-2.5" /> Dhuha
                                </span>
                              )}
                              {isJumat && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-black text-indigo-800 bg-indigo-100 px-2 py-0.5 rounded-md border border-indigo-200">
                                  <Check className="w-2.5 h-2.5" /> Jumat
                                </span>
                              )}
                              {isBj && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-black text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-md border border-emerald-200">
                                  <Check className="w-2.5 h-2.5" /> Berjamaah
                                </span>
                              )}
                              {!isDhuha && !isJumat && !isBj && (
                                <span className="text-xs text-slate-300 font-bold">-</span>
                              )}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <PaginationFooter
          totalItems={filteredData.length}
          itemsPerPage={itemsPerPage}
          currentPage={currentPage}
          setCurrentPage={setCurrentPage}
          itemLabel="murid"
        />
      </div>
    </div>
  );
}
