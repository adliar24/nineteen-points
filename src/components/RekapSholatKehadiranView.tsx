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
  ClipboardList
} from "lucide-react";
import { UserSession } from "../types";
import { getRekapGabungan } from "../dbStore";
import { toSentenceCase, compareClasses } from "../formatName";

interface RekapSholatKehadiranViewProps {
  userSession: UserSession;
}

export default function RekapSholatKehadiranView({ userSession }: RekapSholatKehadiranViewProps) {
  const today = new Date().toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [searchQuery, setSearchQuery] = useState("");
  const [classFilter, setClassFilter] = useState("Semua");
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

  const totalSholat = useMemo(() => {
    let count = 0;
    rekapData.forEach((row) => {
      datesInRange.forEach((d) => {
        if (row.sholat && row.sholat[d]) count++;
        if (row.sholatDhuha && row.sholatDhuha[d]) count++;
        if (row.sholatJumat && row.sholatJumat[d]) count++;
      });
    });
    return count;
  }, [rekapData, datesInRange]);

  const handleExportCSV = () => {
    const headers = ["NIS", "Nama", "Kelas"];
    datesInRange.forEach((d) => {
      const label = parseDateSafe(d).toLocaleDateString("id-ID", { day: "2-digit", month: "short" });
      headers.push(`Sholat Dhuha (${label})`);
      headers.push(`Sholat Jumat (${label})`);
      headers.push(`Sholat Berjamaah (${label})`);
    });

    const rows = filteredData.map((row) => {
      const cells = [row.siswa_nis, row.siswa_nama, row.siswa_kelas];
      datesInRange.forEach((d) => {
        cells.push(row.sholatDhuha && row.sholatDhuha[d] ? "Ya" : "Tidak");
        cells.push(row.sholatJumat && row.sholatJumat[d] ? "Ya" : "Tidak");
        cells.push(row.sholat && row.sholat[d] ? "Ya" : "Tidak");
      });
      return cells.join(",");
    });

    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rekap-sholat-${startDate}-${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 pb-12 animate-fade-in font-sans">
      <div>
        <h2 className="text-xl font-extrabold text-brand-950 tracking-tight flex items-center gap-2">
          <ClipboardList className="w-6 h-6 text-brand-600" />
          Rekap Sholat (Berjamaah & Dhuha)
        </h2>
        <p className="text-xs text-brand-500 font-semibold mt-1">
          Lihat rekap sholat berjamaah dan sholat dhuha murid per tanggal.
        </p>
      </div>

      {/* Summary */}
      <div className="bg-white p-4 rounded-2xl border border-brand-100 shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center border border-emerald-100">
            <BookOpen className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <p className="text-[9px] font-black text-brand-400 uppercase tracking-wider">Total Sholat Periode Ini</p>
            <p className="text-lg font-mono font-black text-emerald-700">{totalSholat}</p>
          </div>
        </div>
        <p className="text-[10px] text-brand-400 font-semibold text-right">
          {filteredData.length} murid &bull; {datesInRange.length} hari
        </p>
      </div>

      {/* Keterangan / Legend Card */}
      <div className="bg-white p-4 rounded-2xl border border-brand-100 shadow-sm space-y-2">
        <h4 className="text-xs font-black text-brand-950 uppercase tracking-wider flex items-center gap-1.5">
          <BookOpen className="w-4 h-4 text-emerald-600" />
          Keterangan Singkatan Sholat
        </h4>
        <div className="flex flex-wrap items-center gap-3 sm:gap-6 text-xs font-bold text-slate-700 pt-1">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 font-extrabold border border-amber-300">Dh</span>
            <span>Sholat Dhuha</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-800 font-extrabold border border-indigo-300">Jm</span>
            <span>Sholat Jumat</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-extrabold border border-emerald-300">Bj</span>
            <span>Sholat Berjamaah</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 font-extrabold border border-slate-200">-</span>
            <span className="text-slate-400">Belum Ada Catatan</span>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="bg-white p-4 rounded-2xl border border-brand-100 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-brand-400" />
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setCurrentPage(1);
              }}
              className="px-3 py-2 bg-brand-50/50 rounded-xl border border-brand-100 text-xs font-bold text-brand-900 outline-none"
            />
            <span className="text-xs text-brand-400 font-bold">s/d</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setCurrentPage(1);
              }}
              className="px-3 py-2 bg-brand-50/50 rounded-xl border border-brand-100 text-xs font-bold text-brand-900 outline-none"
            />
          </div>
          <div className="flex-1 relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-brand-400" />
            <input
              type="text"
              placeholder="Cari nama / NIS murid..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-9 pr-4 py-2 bg-brand-50/50 rounded-xl border border-brand-100 text-xs font-bold text-brand-900 outline-none"
            />
          </div>
          <div className="w-full sm:w-44">
            <select
              value={classFilter}
              onChange={(e) => {
                setClassFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 bg-brand-50/50 rounded-xl border border-brand-100 text-xs font-bold text-brand-900 outline-none"
            >
              {classes.map((c) => (
                <option key={c} value={c}>{c === "Semua" ? "Semua Kelas" : `Kelas ${c}`}</option>
              ))}
            </select>
          </div>
          <button
            onClick={handleExportCSV}
            className="px-4 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-bold rounded-xl border border-emerald-200 transition-all cursor-pointer flex items-center gap-1.5 flex-shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            Export
          </button>
        </div>
      </div>

      {/* Data Table */}
      <div className="bg-white rounded-3xl border border-brand-100 shadow-xl shadow-brand-900/5 overflow-hidden">
        {isLoading ? (
          <div className="py-16 text-center">
            <div className="w-8 h-8 border-3 border-brand-400 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xs font-bold text-brand-400 mt-3">Memuat data rekap...</p>
          </div>
        ) : paginatedData.length === 0 ? (
          <div className="py-16 text-center space-y-3">
            <BookOpen className="w-10 h-10 text-brand-200 mx-auto" />
            <p className="text-xs font-bold text-brand-400">Tidak ada data sholat untuk rentang tanggal ini.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-brand-100 bg-brand-50/50">
                  <th className="px-4 py-3.5 text-xs font-black text-brand-700 uppercase tracking-wider sticky left-0 bg-brand-50/50 z-10">Murid</th>
                  {datesInRange.map((d) => (
                    <th key={d} className="px-3 py-3.5 text-center text-xs font-black text-brand-700 uppercase tracking-wider min-w-[130px]">
                      <div>{parseDateSafe(d).toLocaleDateString("id-ID", { weekday: "short" })}</div>
                      <div className="text-[10px] text-brand-400 font-bold">{parseDateSafe(d).toLocaleDateString("id-ID", { day: "2-digit", month: "short" })}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-50">
                {paginatedData.map((row) => (
                  <tr key={row.siswa_id} className="hover:bg-brand-50/30 transition-colors">
                    <td className="px-4 py-3 sticky left-0 bg-white z-10">
                      <p className="text-xs font-black text-brand-950">{toSentenceCase(row.siswa_nama)}</p>
                      <p className="text-[10px] text-brand-400 font-semibold">{row.siswa_kelas} &bull; {row.siswa_nis}</p>
                    </td>
                    {datesInRange.map((d) => (
                      <td key={`${row.siswa_id}-${d}`} className="px-3 py-3 text-center">
                        <div className="flex flex-col gap-1.5 items-center">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-black text-amber-900 bg-amber-100 px-2 py-0.5 rounded-md border border-amber-200">Dh</span>
                            {row.sholatDhuha && row.sholatDhuha[d] ? (
                              <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                                <Check className="w-3 h-3 text-amber-600" /> Ya
                              </span>
                            ) : (
                              <span className="text-xs text-slate-300 font-semibold px-2">-</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-black text-indigo-900 bg-indigo-100 px-2 py-0.5 rounded-md border border-indigo-200">Jm</span>
                            {row.sholatJumat && row.sholatJumat[d] ? (
                              <span className="inline-flex items-center gap-1 text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-200">
                                <Check className="w-3 h-3 text-indigo-600" /> Ya
                              </span>
                            ) : (
                              <span className="text-xs text-slate-300 font-semibold px-2">-</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-black text-emerald-900 bg-emerald-100 px-2 py-0.5 rounded-md border border-emerald-200">Bj</span>
                            {row.sholat && row.sholat[d] ? (
                              <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                                <Check className="w-3 h-3 text-emerald-600" /> Ya
                              </span>
                            ) : (
                              <span className="text-xs text-slate-300 font-semibold px-2">-</span>
                            )}
                          </div>
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-brand-100 flex items-center justify-between">
            <p className="text-[10px] font-bold text-brand-400">
              {(currentPage - 1) * itemsPerPage + 1}–{Math.min(currentPage * itemsPerPage, filteredData.length)} dari {filteredData.length}
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-1.5 rounded-lg hover:bg-brand-100 text-brand-500 disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-1.5 rounded-lg hover:bg-brand-100 text-brand-500 disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
