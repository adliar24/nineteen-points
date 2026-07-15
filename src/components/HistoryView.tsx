import React, { useState, useEffect } from "react";
import { Search, Calendar, User, Trash2, ArrowUpDown, ShieldCheck, RefreshCw, Undo2, CheckSquare } from "lucide-react";
import { RiwayatPoin } from "../types";
import { getRiwayatList, deleteRiwayat } from "../dbStore";
import ConfirmationModal from "./ConfirmationModal";

import SkeletonLoader from "./SkeletonLoader";

interface HistoryViewProps {
  onRefreshTrigger: () => void;
  refreshCount: number;
}

export default function HistoryView({ onRefreshTrigger, refreshCount }: HistoryViewProps) {
  const [historyList, setHistoryList] = useState<RiwayatPoin[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState("Semua"); // Semua, Positif, Negatif
  const [sortOrder, setSortOrder] = useState<"terbaru" | "terlama">("terbaru");
  const [revertTarget, setRevertTarget] = useState<{ id: string; namaSiswa: string; nilai: number; namaPoin: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Reload logs when requested or when refreshCount changes
  useEffect(() => {
    async function load() {
      setIsLoading(true);
      try {
        setHistoryList(await getRiwayatList());
      } catch (err) {
        console.error("Gagal memuat riwayat:", err);
      }
      setIsLoading(false);
    }
    load();
  }, [refreshCount]);

  const handleRevert = (id: string, namaSiswa: string, nilai: number, namaPoin: string) => {
    setRevertTarget({ id, namaSiswa, nilai, namaPoin });
  };

  const executeRevert = async (id: string) => {
    try {
      await deleteRiwayat(id);
      setHistoryList(await getRiwayatList());
      onRefreshTrigger(); // trigger updates in other views
    } catch (err: any) {
      alert("Gagal membatalkan riwayat poin: " + err.message);
    }
  };

  // Filter logs
  const filteredLogs = historyList.filter((log) => {
    const matchesSearch =
      (log.siswa_nama || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (log.siswa_nis || "").includes(searchQuery) ||
      (log.nama_poin || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (log.guru_email || "").toLowerCase().includes(searchQuery.toLowerCase());

    const matchesType =
      filterType === "Semua" ||
      (filterType === "Positif" && log.nilai_diberikan > 0) ||
      (filterType === "Negatif" && log.nilai_diberikan < 0);

    return matchesSearch && matchesType;
  });

  // Sort logs
  const sortedLogs = [...filteredLogs].sort((a, b) => {
    const dateA = new Date(a.created_at).getTime();
    const dateB = new Date(b.created_at).getTime();
    return sortOrder === "terbaru" ? dateB - dateA : dateA - dateB;
  });

  // Formatter helper
  const formatTanggal = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString("id-ID", {
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="bg-white rounded-3xl border border-brand-100 shadow-xl shadow-brand-900/5 p-6 space-y-4">
      {/* Filter and Sort options bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-brand-50/50 p-4.5 rounded-2xl border border-brand-100/40">
        <div className="flex flex-wrap items-center gap-3 flex-1">
          {/* Search Logs */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3.5 top-3.5 text-brand-500/50 w-4.5 h-4.5" />
            <input
              type="text"
              placeholder="Cari..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-3 py-3 bg-white border border-brand-100 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand-500 text-brand-950 placeholder-brand-500/35 shadow-xs"
            />
          </div>

          {/* Filter Type */}
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="p-3 bg-white border border-brand-100 rounded-xl text-sm font-bold text-brand-800 focus:outline-none focus:ring-2 focus:ring-brand-500 shadow-xs cursor-pointer animate-fade-in"
          >
            <option value="Semua">Semua Jenis</option>
            <option value="Positif">Prestasi (+)</option>
            <option value="Negatif">Pelanggaran (-)</option>
          </select>

          {/* Sort Order */}
          <button
            onClick={() => setSortOrder(sortOrder === "terbaru" ? "terlama" : "terbaru")}
            className="flex items-center gap-1.5 px-4 py-3 bg-white border border-brand-100 text-brand-800 rounded-xl text-sm font-bold transition-all cursor-pointer shadow-xs hover:bg-brand-50"
          >
            <ArrowUpDown className="w-3.5 h-3.5 text-brand-500" />
            <span>Urut: {sortOrder === "terbaru" ? "Terbaru" : "Terlama"}</span>
          </button>

          {/* Segarkan Button */}
          <button
            onClick={async () => {
              setHistoryList(await getRiwayatList());
              onRefreshTrigger();
            }}
            className="flex items-center gap-1.5 px-4 py-3 bg-white border border-brand-100 text-brand-800 hover:bg-brand-50 rounded-xl text-sm font-bold transition-all cursor-pointer shadow-xs"
          >
            <RefreshCw className="w-3.5 h-3.5 text-brand-600" />
            <span>Segarkan</span>
          </button>
        </div>

        <div className="text-xs font-bold text-brand-600">
          Total: <strong className="text-brand-900 font-extrabold">{sortedLogs.length} riwayat</strong>
        </div>
      </div>

      {/* History table */}
      <div className="border border-brand-100 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-brand-50/40 border-b border-brand-100/70 text-brand-500 text-xs font-black uppercase tracking-wider">
                <th className="py-4 px-5">Waktu Dicatat</th>
                <th className="py-4 px-5">Siswa</th>
                <th className="py-4 px-4">Kelas</th>
                <th className="py-4 px-5">Aturan / Deskripsi Poin</th>
                <th className="py-4 px-4 text-center">Nilai Poin</th>
                <th className="py-4 px-5">Guru Pencatat</th>
                <th className="py-4 px-5 text-right">Aksi Audit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-100/30 text-brand-950 text-sm font-semibold">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, idx) => (
                  <tr key={idx} className="animate-pulse">
                    <td className="py-4.5 px-5"><div className="h-4 w-28 bg-slate-200 rounded" /></td>
                    <td className="py-4.5 px-5">
                      <div className="h-4 w-32 bg-slate-200 rounded mb-1" />
                      <div className="h-3 w-16 bg-slate-200 rounded" />
                    </td>
                    <td className="py-4.5 px-4"><div className="h-4 w-12 bg-slate-200 rounded" /></td>
                    <td className="py-4.5 px-5">
                      <div className="h-4 w-48 bg-slate-200 rounded mb-1" />
                      <div className="h-3.5 w-16 bg-slate-200 rounded-full" />
                    </td>
                    <td className="py-4.5 px-4 text-center"><div className="h-4.5 w-10 bg-slate-200 rounded mx-auto" /></td>
                    <td className="py-4.5 px-5"><div className="h-4 w-28 bg-slate-200 rounded" /></td>
                    <td className="py-4.5 px-5 text-right"><div className="h-5 w-16 bg-slate-200 rounded ml-auto" /></td>
                  </tr>
                ))
              ) : sortedLogs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-brand-400 font-medium">
                    Belum ada riwayat poin tercatat yang sesuai filter.
                  </td>
                </tr>
              ) : (
                sortedLogs.map((log) => {
                  const isPositive = log.nilai_diberikan > 0;
                  return (
                    <tr key={log.id} className="hover:bg-brand-50/10 transition-colors">
                      <td className="py-4.5 px-5 text-brand-500/80 font-medium whitespace-nowrap text-xs">
                        {formatTanggal(log.created_at)}
                      </td>
                      <td className="py-4.5 px-5">
                        <div className="font-bold text-brand-950">{log.siswa_nama}</div>
                        <div className="text-xs text-brand-400 font-mono font-bold">NIS: {log.siswa_nis}</div>
                      </td>
                      <td className="py-4.5 px-4 font-black text-brand-600 uppercase">
                        {log.siswa_kelas}
                      </td>
                      <td className="py-4.5 px-5 font-bold max-w-[200px] truncate text-sm" title={log.nama_poin}>
                        {log.nama_poin}
                      </td>
                      <td className="py-4.5 px-4 text-center">
                        <span
                          className={`font-mono font-black px-3 py-1 rounded-xl text-sm border shadow-xs ${
                            isPositive
                              ? "bg-emerald-50 text-emerald-700 border-emerald-150"
                              : "bg-rose-50 text-rose-700 border-rose-150"
                          }`}
                        >
                          {isPositive ? `+${log.nilai_diberikan}` : log.nilai_diberikan}
                        </span>
                      </td>
                      <td className="py-4.5 px-5">
                        <div className="flex items-center gap-1.5 text-brand-700 font-bold text-xs">
                          <ShieldCheck className="w-3.5 h-3.5 text-brand-500" />
                          <span>{log.guru_email}</span>
                        </div>
                      </td>
                      <td className="py-4.5 px-5 text-right">
                        <button
                          onClick={() =>
                            handleRevert(
                              log.id,
                              log.siswa_nama || "Siswa",
                              log.nilai_diberikan,
                              log.nama_poin
                            )
                          }
                          className="text-rose-600 hover:text-rose-800 hover:bg-rose-50 text-sm font-bold px-3 py-1.5 rounded-xl transition-all inline-flex items-center gap-1 cursor-pointer border border-transparent hover:border-rose-100 shadow-xs"
                          title="Batalkan Poin (Revert)"
                        >
                          <Undo2 className="w-3.5 h-3.5" />
                          Batalkan
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Confirmation Modal for Reverting Points */}
      <ConfirmationModal
        isOpen={revertTarget !== null}
        onClose={() => setRevertTarget(null)}
        onConfirm={() => {
          if (revertTarget) {
            executeRevert(revertTarget.id);
          }
        }}
        title="Batalkan Catatan Poin?"
        message={`Apakah Anda yakin ingin membatalkan pemberian poin ini? Siswa "${revertTarget?.namaSiswa}" akan mendapatkan penyesuaian poin kembali sebesar ${revertTarget ? (revertTarget.nilai > 0 ? `-${revertTarget.nilai}` : `+${Math.abs(revertTarget.nilai)}`) : ""} poin.`}
        confirmText="Ya, Batalkan"
        cancelText="Batal"
        type="warning"
      />
    </div>
  );
}
