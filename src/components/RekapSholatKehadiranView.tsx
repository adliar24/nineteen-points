import React, { useState, useMemo } from "react";
import { motion } from "motion/react";
import { useQuery } from "@tanstack/react-query";
import {
  Calendar,
  Search,
  Filter,
  Download,
  Check,
  X,
  Users,
  BookOpen,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck
} from "lucide-react";
import { UserSession } from "../types";
import { getRekapGabungan, RekapGabunganRow } from "../dbStore";
import { toSentenceCase } from "../formatName";

interface RekapSholatKehadiranViewProps {
  userSession: UserSession;
}

type ViewMode = "gabungan" | "sholat" | "kehadiran";

export default function RekapSholatKehadiranView({ userSession }: RekapSholatKehadiranViewProps) {
  const today = new Date().toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [viewMode, setViewMode] = useState<ViewMode>("gabungan");
  const [searchQuery, setSearchQuery] = useState("");
  const [classFilter, setClassFilter] = useState("Semua");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  const { data: rekapData = [], isLoading, refetch } = useQuery({
    queryKey: ["rekapGabungan", startDate, endDate],
    queryFn: () => getRekapGabungan(startDate, endDate),
    enabled: !!startDate && !!endDate,
  });

  const datesInRange = useMemo(() => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const dates: string[] = [];
    const current = new Date(start);
    while (current <= end) {
      dates.push(current.toISOString().slice(0, 10));
      current.setDate(current.getDate() + 1);
    }
    return dates;
  }, [startDate, endDate]);

  const classes = useMemo(
    () => ["Semua", ...Array.from(new Set(rekapData.map((r) => r.siswa_kelas))).sort()],
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

  const summaryStats = useMemo(() => {
    let totalHadir = 0;
    let totalSholat = 0;
    let totalAlfa = 0;
    rekapData.forEach((row) => {
      datesInRange.forEach((d) => {
        if (row.kehadiran[d] === "tepat_waktu" || row.kehadiran[d]?.startsWith("telat")) totalHadir++;
        if (row.kehadiran[d] === "alfa") totalAlfa++;
        if (row.sholat[d]) totalSholat++;
      });
    });
    return { totalHadir, totalSholat, totalAlfa };
  }, [rekapData, datesInRange]);

  const handleExportCSV = () => {
    const headers = ["NIS", "Nama", "Kelas"];
    datesInRange.forEach((d) => {
      const label = new Date(d).toLocaleDateString("id-ID", { day: "2-digit", month: "short" });
      if (viewMode === "gabungan" || viewMode === "kehadiran") headers.push(`Kehadiran ${label}`);
      if (viewMode === "gabungan" || viewMode === "sholat") headers.push(`Sholat ${label}`);
    });

    const rows = filteredData.map((row) => {
      const cells = [row.siswa_nis, row.siswa_nama, row.siswa_kelas];
      datesInRange.forEach((d) => {
        if (viewMode === "gabungan" || viewMode === "kehadiran") {
          const status = row.kehadiran[d] || "-";
          cells.push(status === "tepat_waktu" ? "Hadir" : status === "alfa" ? "Alfa" : status === "sakit" ? "Sakit" : status === "izin" ? "Izin" : status.startsWith("telat") ? "Terlambat" : "-");
        }
        if (viewMode === "gabungan" || viewMode === "sholat") {
          cells.push(row.sholat[d] ? "Ya" : "Tidak");
        }
      });
      return cells.join(",");
    });

    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rekap-${viewMode}-${startDate}-${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getStatusColor = (status: string) => {
    if (status === "tepat_waktu") return "bg-emerald-50 text-emerald-700 border-emerald-100";
    if (status === "alfa") return "bg-rose-50 text-rose-700 border-rose-100";
    if (status === "sakit") return "bg-amber-50 text-amber-700 border-amber-100";
    if (status === "izin") return "bg-blue-50 text-blue-700 border-blue-100";
    if (status.startsWith("telat")) return "bg-orange-50 text-orange-700 border-orange-100";
    return "bg-brand-50 text-brand-400 border-brand-100";
  };

  const getStatusLabel = (status: string) => {
    if (status === "tepat_waktu") return "Hadir";
    if (status === "alfa") return "Alfa";
    if (status === "sakit") return "Sakit";
    if (status === "izin") return "Izin";
    if (status === "telat_15") return "Telat";
    if (status === "telat_30") return "Telat";
    if (status === "telat_60") return "Telat";
    return status;
  };

  return (
    <div className="space-y-6 pb-12 animate-fade-in font-sans">
      <div>
        <h2 className="text-xl font-extrabold text-brand-950 tracking-tight flex items-center gap-2">
          <ClipboardCheck className="w-6 h-6 text-brand-600" />
          Rekap Sholat & Kehadiran
        </h2>
        <p className="text-xs text-brand-500 font-semibold mt-1">
          Lihat rekap kehadiran dan sholat murid secara gabungan atau terpisah.
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-brand-100 shadow-sm text-center">
          <p className="text-[9px] font-black text-brand-400 uppercase tracking-wider">Total Hadir</p>
          <p className="text-xl font-mono font-black text-emerald-700 mt-1">{summaryStats.totalHadir}</p>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-brand-100 shadow-sm text-center">
          <p className="text-[9px] font-black text-brand-400 uppercase tracking-wider">Total Sholat</p>
          <p className="text-xl font-mono font-black text-teal-700 mt-1">{summaryStats.totalSholat}</p>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-brand-100 shadow-sm text-center">
          <p className="text-[9px] font-black text-brand-400 uppercase tracking-wider">Total Alfa</p>
          <p className="text-xl font-mono font-black text-rose-700 mt-1">{summaryStats.totalAlfa}</p>
        </div>
      </div>

      {/* Controls */}
      <div className="bg-white p-4 rounded-2xl border border-brand-100 shadow-sm space-y-3">
        {/* View Mode Tabs */}
        <div className="flex gap-2">
          {([
            { id: "gabungan" as ViewMode, label: "Gabungan", icon: Users },
            { id: "sholat" as ViewMode, label: "Sholat Saja", icon: BookOpen },
            { id: "kehadiran" as ViewMode, label: "Kehadiran Saja", icon: Calendar },
          ]).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => { setViewMode(id); setCurrentPage(1); }}
              className={`flex-1 py-2.5 text-[11px] font-black rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer border ${
                viewMode === id
                  ? "bg-brand-600 text-white border-transparent shadow-md"
                  : "bg-brand-50/50 text-brand-700 border-brand-100 hover:bg-brand-100/30"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>

        {/* Date Range + Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-brand-400" />
            <input
              type="date"
              value={startDate}
              onChange={(e) => { setStartDate(e.target.value); setCurrentPage(1); }}
              className="border border-brand-100 rounded-xl py-2 px-3 text-xs font-bold text-brand-700 outline-none focus:ring-2 focus:ring-brand-500 bg-white"
            />
            <span className="text-xs text-brand-400 font-bold">s/d</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => { setEndDate(e.target.value); setCurrentPage(1); }}
              className="border border-brand-100 rounded-xl py-2 px-3 text-xs font-bold text-brand-700 outline-none focus:ring-2 focus:ring-brand-500 bg-white"
            />
          </div>
          <div className="flex-1 flex gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-brand-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Cari nama atau NIS..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                className="w-full pl-9 pr-4 py-2 border border-brand-100 rounded-xl text-xs font-semibold text-brand-900 outline-none focus:ring-2 focus:ring-brand-500 bg-brand-50/20"
              />
            </div>
            <select
              value={classFilter}
              onChange={(e) => { setClassFilter(e.target.value); setCurrentPage(1); }}
              className="border border-brand-100 rounded-xl py-2 px-3 text-xs font-bold text-brand-700 outline-none focus:ring-2 focus:ring-brand-500 bg-white"
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
            <Users className="w-10 h-10 text-brand-200 mx-auto" />
            <p className="text-xs font-bold text-brand-400">Tidak ada data untuk rentang tanggal ini.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-brand-100 bg-brand-50/50">
                  <th className="px-4 py-3 text-[10px] font-black text-brand-500 uppercase tracking-wider sticky left-0 bg-brand-50/50 z-10">Murid</th>
                  {(viewMode === "gabungan" || viewMode === "kehadiran") && datesInRange.map((d) => (
                    <th key={`k-${d}`} className="px-3 py-3 text-center text-[9px] font-black text-brand-500 uppercase tracking-wider min-w-[70px]">
                      <div>{new Date(d).toLocaleDateString("id-ID", { weekday: "short" })}</div>
                      <div>{new Date(d).toLocaleDateString("id-ID", { day: "2-digit", month: "short" })}</div>
                      <div className="text-[8px] text-teal-600 font-bold">Kehadiran</div>
                    </th>
                  ))}
                  {(viewMode === "gabungan" || viewMode === "sholat") && datesInRange.map((d) => (
                    <th key={`s-${d}`} className="px-3 py-3 text-center text-[9px] font-black text-brand-500 uppercase tracking-wider min-w-[60px]">
                      {viewMode === "gabungan" && (
                        <>
                          <div>{new Date(d).toLocaleDateString("id-ID", { weekday: "short" })}</div>
                          <div>{new Date(d).toLocaleDateString("id-ID", { day: "2-digit", month: "short" })}</div>
                        </>
                      )}
                      {viewMode === "sholat" && (
                        <>
                          <div>{new Date(d).toLocaleDateString("id-ID", { weekday: "short" })}</div>
                          <div>{new Date(d).toLocaleDateString("id-ID", { day: "2-digit", month: "short" })}</div>
                        </>
                      )}
                      <div className="text-[8px] text-emerald-600 font-bold">Sholat</div>
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
                    {(viewMode === "gabungan" || viewMode === "kehadiran") && datesInRange.map((d) => {
                      const status = row.kehadiran[d] || "";
                      return (
                        <td key={`k-${row.siswa_id}-${d}`} className="px-3 py-3 text-center">
                          {status ? (
                            <span className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-black border ${getStatusColor(status)}`}>
                              {getStatusLabel(status)}
                            </span>
                          ) : (
                            <span className="text-[9px] text-brand-300 font-bold">-</span>
                          )}
                        </td>
                      );
                    })}
                    {(viewMode === "gabungan" || viewMode === "sholat") && datesInRange.map((d) => (
                      <td key={`s-${row.siswa_id}-${d}`} className="px-3 py-3 text-center">
                        {row.sholat[d] ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black bg-emerald-50 text-emerald-700 border border-emerald-100">
                            <Check className="w-2.5 h-2.5" />
                            Ya
                          </span>
                        ) : (
                          <span className="text-[9px] text-brand-300 font-bold">Tidak</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
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
