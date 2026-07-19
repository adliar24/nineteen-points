import React, { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion, AnimatePresence } from "motion/react";
import { Calendar, Search, RefreshCw, Edit3, X, Check } from "lucide-react";
import { getKehadiranGuruAll, saveKehadiranGuruManual } from "../dbStore";
import { toSentenceCase } from "../formatName";

export default function KelolaKehadiranGuruView() {
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [searchQuery, setSearchQuery] = useState("");
  const [editingRecord, setEditingRecord] = useState<any | null>(null);
  
  // Edit Form State
  const [editStatus, setEditStatus] = useState<'hadir' | 'sakit' | 'izin' | 'alfa'>('hadir');
  const [editJamMasuk, setEditJamMasuk] = useState("");
  const [editJamKeluar, setEditJamKeluar] = useState("");
  const [editKeterangan, setEditKeterangan] = useState("");
  
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // 1. Query all teachers and their attendance for selectedDate
  const { data: list = [], isLoading, refetch } = useQuery({
    queryKey: ["kehadiranGuruAll", selectedDate],
    queryFn: () => getKehadiranGuruAll(selectedDate),
  });

  // 2. Mutation for manual/override update
  const saveManualMutation = useMutation({
    mutationFn: async () => {
      if (!editingRecord) return;
      return saveKehadiranGuruManual(
        editingRecord.user_id,
        selectedDate,
        editStatus,
        editJamMasuk || null,
        editJamKeluar || null,
        editKeterangan
      );
    },
    onSuccess: () => {
      setSuccessMsg(`Berhasil memperbarui data absensi guru.`);
      setEditingRecord(null);
      refetch();
      setTimeout(() => setSuccessMsg(null), 4000);
    },
    onError: (err: any) => {
      alert("Gagal menyimpan absensi manual: " + err.message);
    }
  });

  const handleEditClick = (record: any) => {
    setEditingRecord(record);
    setEditStatus(record.status || 'hadir');
    setEditJamMasuk(record.jam_masuk || "");
    setEditJamKeluar(record.jam_keluar || "");
    setEditKeterangan(record.keterangan || "");
  };

  const filteredList = list.filter(row => 
    row.user_nama.toLowerCase().includes(searchQuery.toLowerCase()) ||
    row.user_email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6 pb-12 animate-fade-in font-sans">
      {/* Header */}
      <div>
        <h2 className="text-xl font-extrabold text-brand-950 tracking-tight flex items-center gap-2">
          <Calendar className="w-6 h-6 text-brand-600" />
          Monitoring Kehadiran Guru
        </h2>
        <p className="text-xs text-brand-500 font-semibold mt-1">
          Pantau absensi harian dan kelola ketidakhadiran guru secara terpusat.
        </p>
      </div>

      {/* ALERT SUCCESS */}
      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-100 text-emerald-800 rounded-2xl text-xs font-bold flex items-center gap-3 shadow-md">
          <div className="w-6 h-6 bg-emerald-500 rounded-lg text-white flex items-center justify-center flex-shrink-0">
            <Check className="w-3.5 h-3.5" />
          </div>
          <span>{successMsg}</span>
        </div>
      )}

      {/* FILTER & CONTROL BAR */}
      <div className="bg-white p-5 rounded-3xl border border-brand-100 shadow-xl shadow-brand-900/5 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex flex-col sm:flex-row items-center gap-3 flex-1 w-full">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-brand-500/50 w-5 h-5" />
            <input
              type="text"
              placeholder="Cari berdasarkan nama atau email guru..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-11 pr-4 py-3 bg-brand-50/20 rounded-2xl border border-brand-100 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white transition-all text-brand-950 placeholder-brand-500/30"
            />
          </div>

          <div className="relative w-full sm:w-auto">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full sm:w-auto border border-brand-100 rounded-2xl py-3 px-4 text-xs font-bold text-brand-800 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 outline-none"
            />
          </div>
        </div>

        <button
          onClick={() => refetch()}
          className="p-3 bg-brand-50 text-brand-600 rounded-2xl hover:bg-brand-100 border border-brand-100/50 transition-colors cursor-pointer w-full md:w-auto flex items-center justify-center"
        >
          <RefreshCw className="w-4.5 h-4.5" />
        </button>
      </div>

      {/* ATTENDANCE TABLE */}
      <div className="bg-white rounded-3xl border border-brand-100 shadow-xl shadow-brand-900/5 overflow-hidden">
        <div className="overflow-x-auto min-h-[400px]">
          {isLoading ? (
            <div className="py-20 text-center">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto text-brand-500" />
              <p className="text-xs font-bold text-brand-400 mt-2">Memuat rekap absensi guru...</p>
            </div>
          ) : filteredList.length > 0 ? (
            <table className="w-full text-left border-collapse table-fixed">
              <thead>
                <tr className="bg-brand-50/50 border-b border-brand-100 text-brand-500 text-xs font-black uppercase tracking-wider">
                  <th className="py-4 px-6 w-[280px]">Nama Guru</th>
                  <th className="py-4 px-6 w-[130px] text-center">Status</th>
                  <th className="py-4 px-6 w-[120px] text-center">Jam Masuk</th>
                  <th className="py-4 px-6 w-[120px] text-center">Jam Pulang</th>
                  <th className="py-4 px-6 w-[200px]">Keterangan</th>
                  <th className="py-4 px-6 w-[100px] text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-50 text-xs font-semibold text-brand-900">
                {filteredList.map((row) => {
                  const status = row.status;
                  const isPresent = status === "hadir";
                  const isAbsent = status === "alfa";
                  const isSickOrLeave = status === "sakit" || status === "izin";
                  
                  return (
                    <tr key={row.user_id} className="hover:bg-slate-50/40 transition-colors">
                      <td className="py-4 px-6">
                        <span className="font-extrabold text-brand-950 block">{toSentenceCase(row.user_nama)}</span>
                        <span className="text-[10px] text-slate-400 font-bold block mt-1">{row.user_email}</span>
                      </td>
                      <td className="py-4 px-6 text-center">
                        {status ? (
                          <span className={`inline-flex px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider border ${
                            isPresent
                              ? "bg-emerald-50 border-emerald-100 text-emerald-700"
                              : isAbsent
                              ? "bg-rose-50 border-rose-100 text-rose-700"
                              : "bg-purple-50 border-purple-100 text-purple-700"
                          }`}>
                            {status.toUpperCase()}
                          </span>
                        ) : (
                          <span className="text-slate-400 font-bold text-[10px] tracking-wider uppercase bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-lg">
                            BELUM ABSEN
                          </span>
                        )}
                      </td>
                      <td className="py-4 px-6 text-center font-mono font-bold text-slate-700">
                        {row.jam_masuk || "-"}
                      </td>
                      <td className="py-4 px-6 text-center font-mono font-bold text-slate-700">
                        {row.jam_keluar || "-"}
                      </td>
                      <td className="py-4 px-6 text-slate-500 truncate" title={row.keterangan || ""}>
                        {row.keterangan || "-"}
                      </td>
                      <td className="py-4 px-6 text-right">
                        <button
                          onClick={() => handleEditClick(row)}
                          className="p-2 border border-brand-100 rounded-xl hover:bg-slate-50 text-brand-600 transition-colors cursor-pointer"
                          title="Koreksi Absensi"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="py-24 text-center">
              <Calendar className="w-10 h-10 text-brand-300 mx-auto" />
              <h4 className="text-xs font-black text-brand-500 uppercase tracking-widest mt-2">Tidak Ada Data</h4>
              <p className="text-[10px] text-brand-400 font-semibold max-w-xs mx-auto mt-1">
                Tidak ditemukan guru yang terdaftar atau cocok dengan kata kunci pencarian.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* EDIT POPUP MODAL */}
      <AnimatePresence>
        {editingRecord && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-brand-950/60 backdrop-blur-xs"
              onClick={() => setEditingRecord(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              className="bg-white rounded-3xl p-6 w-full max-w-sm border border-brand-100 shadow-2xl relative z-10 space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center border-b pb-3 border-brand-50">
                <h3 className="text-xs font-black text-brand-950 uppercase tracking-widest flex items-center gap-2">
                  <Edit3 className="w-4.5 h-4.5 text-brand-600" />
                  Koreksi Absensi Guru
                </h3>
                <button
                  onClick={() => setEditingRecord(null)}
                  className="p-1 text-slate-400 hover:text-slate-650 hover:bg-slate-50 rounded-xl cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Profile info */}
              <div className="bg-brand-50/50 p-3.5 border border-brand-50 rounded-2xl text-xs font-semibold">
                <p className="font-extrabold text-brand-950 leading-tight">{toSentenceCase(editingRecord.user_nama)}</p>
                <p className="text-[10px] text-slate-450 font-bold mt-1">Tanggal Absen: {selectedDate}</p>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  saveManualMutation.mutate();
                }}
                className="space-y-4"
              >
                {/* Status */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-brand-400 uppercase tracking-widest block">Status Kehadiran</label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value as any)}
                    className="w-full border border-brand-100 rounded-xl p-3 text-xs font-bold text-brand-850 bg-white outline-none"
                  >
                    <option value="hadir">Hadir</option>
                    <option value="sakit">Sakit</option>
                    <option value="izin">Izin</option>
                    <option value="alfa">Alfa</option>
                  </select>
                </div>

                {/* Time range inputs (only if status is hadir) */}
                {editStatus === "hadir" && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-brand-400 uppercase tracking-widest block">Jam Masuk</label>
                      <input
                        type="text"
                        placeholder="HH:MM:SS"
                        value={editJamMasuk}
                        onChange={(e) => setEditJamMasuk(e.target.value)}
                        className="w-full border border-brand-100 rounded-xl p-3 text-xs font-bold text-brand-900 font-mono outline-none"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-brand-400 uppercase tracking-widest block">Jam Keluar</label>
                      <input
                        type="text"
                        placeholder="HH:MM:SS"
                        value={editJamKeluar}
                        onChange={(e) => setEditJamKeluar(e.target.value)}
                        className="w-full border border-brand-100 rounded-xl p-3 text-xs font-bold text-brand-900 font-mono outline-none"
                      />
                    </div>
                  </div>
                )}

                {/* Keterangan */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-brand-400 uppercase tracking-widest block">Keterangan / Catatan</label>
                  <textarea
                    rows={2}
                    placeholder="Contoh: Sakit flu / Terlambat macet / dll..."
                    value={editKeterangan}
                    onChange={(e) => setEditKeterangan(e.target.value)}
                    className="w-full border border-brand-100 rounded-xl p-3 text-xs font-semibold text-brand-900 outline-none resize-none bg-brand-50/10"
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setEditingRecord(null)}
                    className="flex-1 py-3 border border-brand-100 hover:bg-brand-55 text-slate-600 text-xs font-black uppercase tracking-wider rounded-xl cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={saveManualMutation.isPending}
                    className="flex-1 py-3 bg-brand-600 hover:bg-brand-700 text-white text-xs font-black uppercase tracking-wider rounded-xl cursor-pointer disabled:opacity-50"
                  >
                    {saveManualMutation.isPending ? "Menyimpan..." : "Simpan"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
