import React, { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion, AnimatePresence } from "motion/react";
import { Calendar, Search, RefreshCw, Edit3, X, Check, Clock, BookOpen, Users, AlertCircle } from "lucide-react";
import { getKehadiranGuruAll, saveKehadiranGuruManual } from "../dbStore";
import { toSentenceCase, formatSubjectName } from "../formatName";

export default function KelolaKehadiranGuruView() {
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [searchQuery, setSearchQuery] = useState("");
  const [editingRecord, setEditingRecord] = useState<any | null>(null);
  
  // Edit Form State
  const [editStatus, setEditStatus] = useState<'hadir' | 'sakit' | 'izin' | 'alfa'>('hadir');
  const [editJamMasuk, setEditJamMasuk] = useState("");
  const [editKeterangan, setEditKeterangan] = useState("");
  
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Determine Day Name
  const days = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
  const selectedDayName = days[new Date(selectedDate).getDay()];

  // 1. Query schedules and matching attendance for selectedDate
  const { data: list = [], isLoading, refetch } = useQuery({
    queryKey: ["kehadiranGuruAll", selectedDate],
    queryFn: () => getKehadiranGuruAll(selectedDate),
  });

  // Compute attendance stats
  const stats = useMemo(() => {
    const total = list.length;
    const hadir = list.filter(row => row.status === "hadir").length;
    const sakitIzin = list.filter(row => row.status === "sakit" || row.status === "izin").length;
    const alfa = list.filter(row => row.status === "alfa").length;
    const belum = list.filter(row => !row.status).length;
    return { total, hadir, sakitIzin, alfa, belum };
  }, [list]);

  // 2. Mutation for manual/override update
  const saveManualMutation = useMutation({
    mutationFn: async () => {
      if (!editingRecord) return;
      return saveKehadiranGuruManual(
        editingRecord.user_id,
        selectedDate,
        editStatus,
        editJamMasuk || null,
        editKeterangan,
        editingRecord.jadwal_id
      );
    },
    onSuccess: () => {
      setSuccessMsg(`Berhasil memperbarui data absensi mengajar guru.`);
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
    setEditJamMasuk(record.jam_masuk?.slice(0, 5) || "07:30");
    setEditKeterangan(record.keterangan || "");
  };

  const filteredList = list.filter(row => 
    row.user_nama.toLowerCase().includes(searchQuery.toLowerCase()) ||
    row.user_email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    row.mata_pelajaran.toLowerCase().includes(searchQuery.toLowerCase()) ||
    row.kelas.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6 pb-12 animate-fade-in font-sans">
      {/* Header */}
      <div>
        <h2 className="text-xl font-extrabold text-brand-950 tracking-tight flex items-center gap-2">
          <Calendar className="w-6 h-6 text-brand-600" />
          Monitoring Absensi Mengajar Guru
        </h2>
        <p className="text-xs text-brand-500 font-semibold mt-1">
          Pantau absensi KBM harian guru dan kelola ketidakhadiran secara terpusat berdasarkan jadwal pelajaran.
        </p>
      </div>

      {/* Summary Statistics Dashboard */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total KBM Card */}
        <div className="bg-[#f0edfc] border border-[#e4dffd] p-5 rounded-3xl flex items-center gap-4 shadow-sm">
          <div className="w-10 h-10 rounded-2xl bg-brand-100/80 text-brand-600 flex items-center justify-center flex-shrink-0">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] text-brand-450 font-black tracking-wider uppercase leading-none">TOTAL KBM</p>
            <h4 className="text-xl font-black text-brand-950 mt-1.5 leading-none">{stats.total}</h4>
          </div>
        </div>

        {/* Hadir Card */}
        <div className="bg-emerald-50/20 border border-emerald-100/60 p-5 rounded-3xl flex items-center gap-4 shadow-sm">
          <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center flex-shrink-0">
            <Check className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] text-emerald-650 font-black tracking-wider uppercase leading-none">GURU HADIR</p>
            <h4 className="text-xl font-black text-emerald-800 mt-1.5 leading-none">{stats.hadir}</h4>
          </div>
        </div>

        {/* Belum Absen Card */}
        <div className="bg-amber-50/20 border border-amber-100/60 p-5 rounded-3xl flex items-center gap-4 shadow-sm">
          <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center flex-shrink-0">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] text-amber-650 font-black tracking-wider uppercase leading-none">BELUM ABSEN</p>
            <h4 className="text-xl font-black text-amber-800 mt-1.5 leading-none">{stats.belum}</h4>
          </div>
        </div>

        {/* Tidak Hadir Card */}
        <div className="bg-rose-50/20 border border-rose-100/60 p-5 rounded-3xl flex items-center gap-4 shadow-sm">
          <div className="w-10 h-10 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center flex-shrink-0">
            <AlertCircle className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] text-rose-650 font-black tracking-wider uppercase leading-none">KETIDAKHADIRAN</p>
            <h4 className="text-xl font-black text-rose-800 mt-1.5 leading-none">
              {stats.sakitIzin + stats.alfa} <span className="text-[9.5px] font-bold text-rose-400">({stats.sakitIzin} S/I, {stats.alfa} A)</span>
            </h4>
          </div>
        </div>
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
              placeholder="Cari guru, mata pelajaran, kelas..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-11 pr-4 py-3 bg-[#faf9ff] rounded-2xl border border-brand-100 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white transition-all text-brand-950 placeholder-brand-500/30"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <span className="text-xs font-black text-brand-500 uppercase tracking-wider flex-shrink-0">Tanggal:</span>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full sm:w-auto px-4 py-3 rounded-2xl border border-brand-100 bg-[#faf9ff] text-xs font-bold text-brand-700 focus:outline-none"
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="px-3.5 py-2.5 bg-brand-50 border border-brand-100 text-brand-700 rounded-2xl text-xs font-black">
            Hari: {selectedDayName}
          </span>
          <button
            onClick={() => refetch()}
            className="p-3 text-brand-500 hover:text-brand-850 hover:bg-brand-50 rounded-2xl transition-all cursor-pointer bg-transparent border-0"
            title="Segarkan data"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* ATTENDANCE LIST TABLE CARD */}
      <div className="bg-white rounded-3xl border border-brand-100/60 shadow-xl shadow-brand-900/5 overflow-hidden">
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-24">
              <RefreshCw className="w-8 h-8 animate-spin text-brand-500" />
              <p className="text-xs font-bold text-brand-400 mt-3">Sedang memuat data absensi...</p>
            </div>
          ) : filteredList.length === 0 ? (
            <div className="py-24 text-center space-y-4">
              <BookOpen className="w-12 h-12 text-brand-300 mx-auto" />
              <div>
                <p className="text-sm font-black text-brand-900">Tidak Ada Jadwal / Absensi</p>
                <p className="text-xs text-brand-500 font-semibold mt-1">
                  Tidak ditemukan jadwal mengajar atau data absen guru pada hari {selectedDayName} ({selectedDate}).
                </p>
              </div>
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-brand-50/50 border-b border-brand-100 text-brand-500 uppercase tracking-widest text-[10px] font-black">
                  <th className="py-4.5 px-6">Guru Pengajar</th>
                  <th className="py-4.5 px-6">Mata Pelajaran</th>
                  <th className="py-4.5 px-6">Kelas</th>
                  <th className="py-4.5 px-6">Jam Mengajar</th>
                  <th className="py-4.5 px-6">Status KBM</th>
                  <th className="py-4.5 px-6">Jam Absen</th>
                  <th className="py-4.5 px-6">Keterangan</th>
                  <th className="py-4.5 px-6 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-50 text-xs font-medium text-brand-850">
                {filteredList.map((row, idx) => {
                  const hasAbsen = row.status !== null;
                  
                  return (
                    <tr key={`${row.jadwal_id}-${idx}`} className="hover:bg-brand-50/20 transition-colors">
                      {/* Guru */}
                      <td className="py-4.5 px-6">
                        <div className="flex flex-col">
                          <span className="font-extrabold text-brand-950 text-xs">{toSentenceCase(row.user_nama)}</span>
                          <span className="text-[10px] text-brand-450 mt-0.5">{row.user_email}</span>
                        </div>
                      </td>

                      {/* Mapel */}
                      <td className="py-4.5 px-6 font-bold text-brand-900">
                        {formatSubjectName(row.mata_pelajaran)}
                      </td>

                      {/* Kelas */}
                      <td className="py-4.5 px-6">
                        <div className="flex items-center gap-1 text-brand-650 font-bold">
                          <Users className="w-3.5 h-3.5 text-brand-350" />
                          <span>{row.kelas}</span>
                        </div>
                      </td>

                      {/* Jam Mengajar */}
                      <td className="py-4.5 px-6 font-bold text-brand-600">
                        <div className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-brand-300" />
                          <span>{row.jam_mulai.slice(0, 5)} - {row.jam_selesai.slice(0, 5)}</span>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-4.5 px-6">
                        {hasAbsen ? (
                          <span className={`px-2.5 py-1 rounded-xl text-[9px] font-black uppercase tracking-wide inline-block ${
                            row.status === "hadir" 
                              ? "bg-emerald-100 text-emerald-800" 
                              : row.status === "sakit" 
                              ? "bg-amber-100 text-amber-800" 
                              : row.status === "izin" 
                              ? "bg-purple-100 text-purple-800" 
                              : "bg-rose-100 text-rose-800"
                          }`}>
                            {row.status === "hadir" ? "Hadir" : row.status === "sakit" ? "Sakit" : row.status === "izin" ? "Izin" : "Alfa"}
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 rounded-xl bg-slate-100 text-slate-500 text-[9px] font-black uppercase tracking-wide inline-block">
                            Belum Absen
                          </span>
                        )}
                      </td>

                      {/* Jam Absen */}
                      <td className="py-4.5 px-6 font-mono font-bold text-brand-700">
                        {row.jam_masuk ? `${row.jam_masuk.slice(0, 5)} WIB` : "-"}
                      </td>

                      {/* Keterangan */}
                      <td className="py-4.5 px-6 text-slate-500 italic max-w-xs truncate">
                        {row.keterangan ? `"${row.keterangan}"` : "-"}
                      </td>

                      {/* Aksi */}
                      <td className="py-4.5 px-6 text-center">
                        <button
                          onClick={() => handleEditClick(row)}
                          className="p-2 text-brand-600 hover:text-brand-850 hover:bg-brand-50 rounded-xl transition-all cursor-pointer border-0 bg-transparent"
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
          )}
        </div>
      </div>

      {/* EDIT MODAL FOR MANUAL OVERRIDE */}
      <AnimatePresence>
        {editingRecord && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-brand-950/60 backdrop-blur-xs">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden border border-brand-150"
            >
              <div className="px-6 py-5 bg-brand-50 border-b border-brand-100 flex items-center justify-between">
                <div>
                  <h3 className="font-black text-brand-950 text-base">Koreksi Absensi Guru</h3>
                  <p className="text-[11px] font-bold text-brand-500 mt-0.5">
                    {toSentenceCase(editingRecord.user_nama)} | {formatSubjectName(editingRecord.mata_pelajaran)} ({editingRecord.kelas})
                  </p>
                </div>
                <button
                  onClick={() => setEditingRecord(null)}
                  className="p-1.5 rounded-xl hover:bg-brand-200/50 text-brand-400 hover:text-brand-800 transition-all cursor-pointer bg-transparent border-0"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-4">
                {/* Status Selection */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-brand-700 uppercase tracking-widest block">Status Kehadiran</label>
                  <div className="grid grid-cols-4 gap-2">
                    {(['hadir', 'sakit', 'izin', 'alfa'] as const).map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setEditStatus(s)}
                        className={`py-2.5 rounded-xl border text-[11px] font-black text-center cursor-pointer transition-all ${
                          editStatus === s
                            ? "bg-brand-600 text-white border-transparent shadow-md"
                            : "bg-[#faf9ff] border-brand-100 text-brand-700 hover:bg-slate-50"
                        }`}
                      >
                        {s === "hadir" ? "Hadir" : s === "sakit" ? "Sakit" : s === "izin" ? "Izin" : "Alfa"}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Jam Absen Input */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-brand-700 uppercase tracking-widest block">Waktu Absen (Jam Masuk)</label>
                  <input
                    type="time"
                    value={editJamMasuk}
                    onChange={(e) => setEditJamMasuk(e.target.value)}
                    className="w-full px-4 py-3 rounded-2xl border border-brand-100 text-xs font-bold text-brand-700 focus:outline-none bg-[#faf9ff]"
                  />
                </div>

                {/* Keterangan */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-brand-700 uppercase tracking-widest block">Keterangan / Catatan</label>
                  <textarea
                    rows={3}
                    placeholder="Tulis catatan penyesuaian..."
                    value={editKeterangan}
                    onChange={(e) => setEditKeterangan(e.target.value)}
                    className="w-full border border-brand-100 rounded-2xl p-3 text-xs font-semibold text-brand-900 focus:ring-2 focus:ring-brand-500 outline-none bg-[#faf9ff]"
                  />
                </div>
              </div>

              <div className="px-6 py-4 bg-brand-50/50 border-t border-brand-100 flex items-center justify-end gap-3">
                <button
                  onClick={() => setEditingRecord(null)}
                  className="px-4 py-2.5 rounded-2xl hover:bg-brand-200/40 text-brand-600 hover:text-brand-900 font-bold text-sm transition-all cursor-pointer bg-transparent border-0"
                >
                  Batal
                </button>
                <button
                  onClick={() => saveManualMutation.mutate()}
                  disabled={saveManualMutation.isPending}
                  className="px-5 py-2.5 rounded-2xl bg-gradient-to-r from-brand-600 to-brand-700 hover:from-brand-700 hover:to-brand-800 text-white font-bold text-sm shadow-md transition-all cursor-pointer border-0"
                >
                  {saveManualMutation.isPending ? "Menyimpan..." : "Simpan Perubahan"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
