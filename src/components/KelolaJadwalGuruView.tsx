import React, { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion, AnimatePresence } from "motion/react";
import { Calendar, Search, RefreshCw, Plus, Trash2, X, AlertTriangle, BookOpen, Clock, Users } from "lucide-react";
import { supabase } from "../supabaseClient";
import { getJadwalGuruList, addJadwalGuru, deleteJadwalGuru } from "../dbStore";
import { toSentenceCase } from "../formatName";

export default function KelolaJadwalGuruView() {
  const [searchQuery, setSearchQuery] = useState("");
  const [dayFilter, setDayFilter] = useState("Semua");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);

  // Form State
  const [formTeacherId, setFormTeacherId] = useState("");
  const [formHari, setFormHari] = useState("Senin");
  const [formMapel, setFormMapel] = useState("");
  const [formKelas, setFormKelas] = useState("");
  const [formJamMulai, setFormJamMulai] = useState("07:30");
  const [formJamSelesai, setFormJamSelesai] = useState("09:00");
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // 1. Fetch Teacher Profiles (for dropdown selection)
  const { data: teachers = [] } = useQuery({
    queryKey: ["teachersProfiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, nama, email")
        .eq("role", "guru")
        .order("nama", { ascending: true });
      if (error) throw error;
      return data || [];
    }
  });

  // 2. Fetch All Teaching Schedules
  const { data: schedules = [], isLoading, refetch } = useQuery({
    queryKey: ["jadwalGuruAll"],
    queryFn: () => getJadwalGuruList(),
  });

  // 3. Add Schedule Mutation
  const addMutation = useMutation({
    mutationFn: async () => {
      if (!formTeacherId || !formHari || !formMapel || !formKelas || !formJamMulai || !formJamSelesai) {
        throw new Error("Semua field wajib diisi.");
      }
      return addJadwalGuru(
        formTeacherId,
        formHari,
        formMapel,
        formKelas,
        formJamMulai + ":00",
        formJamSelesai + ":00"
      );
    },
    onSuccess: () => {
      setSuccessMsg("Berhasil menambahkan jadwal mengajar.");
      setIsAddModalOpen(false);
      // Reset Form
      setFormTeacherId("");
      setFormHari("Senin");
      setFormMapel("");
      setFormKelas("");
      setFormJamMulai("07:30");
      setFormJamSelesai("09:00");
      refetch();
      setTimeout(() => setSuccessMsg(null), 3000);
    },
    onError: (err: any) => {
      alert("Gagal menambahkan jadwal: " + err.message);
    }
  });

  // 4. Delete Schedule Mutation
  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!deleteTarget) return;
      return deleteJadwalGuru(deleteTarget.id);
    },
    onSuccess: () => {
      setSuccessMsg("Berhasil menghapus jadwal mengajar.");
      setDeleteTarget(null);
      refetch();
      setTimeout(() => setSuccessMsg(null), 3000);
    },
    onError: (err: any) => {
      alert("Gagal menghapus jadwal: " + err.message);
    }
  });

  // Filtering Logic
  const filteredSchedules = schedules.filter(row => {
    const matchesSearch = row.user_nama.toLowerCase().includes(searchQuery.toLowerCase()) ||
      row.mata_pelajaran.toLowerCase().includes(searchQuery.toLowerCase()) ||
      row.kelas.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesDay = dayFilter === "Semua" || row.hari === dayFilter;
    
    return matchesSearch && matchesDay;
  });

  const listHari = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

  return (
    <div className="space-y-6">
      {/* Title Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-brand-950 tracking-tight">Kelola Jadwal Mengajar Guru</h2>
          <p className="text-xs text-brand-500 font-medium">Buat dan kelola pembagian jadwal mengajar harian guru SMAN 19 Bandung.</p>
        </div>

        <button
          onClick={() => setIsAddModalOpen(true)}
          className="py-2.5 px-4 rounded-2xl bg-gradient-to-r from-brand-600 to-brand-700 hover:from-brand-700 hover:to-brand-800 text-white font-bold text-sm shadow-md shadow-brand-500/20 hover:shadow-lg hover:shadow-brand-500/25 transition-all flex items-center justify-center gap-2 cursor-pointer border-0"
        >
          <Plus className="w-4 h-4" />
          Tambah Jadwal
        </button>
      </div>

      {/* Success Notification Toast */}
      <AnimatePresence>
        {successMsg && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="p-4 bg-emerald-50 border border-emerald-250 rounded-2xl text-emerald-800 text-xs font-bold flex items-center gap-2"
          >
            <Clock className="w-4 h-4 text-emerald-600" />
            {successMsg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Filters Card */}
      <div className="bg-white p-6 rounded-3xl border border-brand-100/60 shadow-xl shadow-brand-900/5">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-400" />
            <input
              type="text"
              placeholder="Cari guru, mata pelajaran, kelas..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-11 pr-4 py-3 rounded-2xl border border-brand-100 bg-[#faf9ff] focus:bg-white text-sm text-brand-900 placeholder-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 transition-all font-medium"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-brand-500 uppercase tracking-wide">Hari:</span>
            <select
              value={dayFilter}
              onChange={(e) => setDayFilter(e.target.value)}
              className="px-4 py-3 rounded-2xl border border-brand-100 bg-[#faf9ff] text-sm font-bold text-brand-700 focus:outline-none cursor-pointer"
            >
              <option value="Semua">Semua Hari</option>
              {listHari.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          <button
            onClick={() => {
              setSearchQuery("");
              setDayFilter("Semua");
              refetch();
            }}
            className="p-3 text-brand-550 hover:text-brand-850 hover:bg-brand-50 rounded-2xl transition-all cursor-pointer border-0 bg-transparent flex items-center justify-center"
            title="Refresh"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Schedules Table Card */}
      <div className="bg-white rounded-3xl border border-brand-100/60 shadow-xl shadow-brand-900/5 overflow-hidden">
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-3 border-brand-450 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filteredSchedules.length === 0 ? (
            <div className="py-24 text-center space-y-4">
              <BookOpen className="w-12 h-12 text-brand-350 mx-auto" />
              <div className="space-y-1">
                <p className="text-sm font-black text-brand-900">Belum Ada Jadwal</p>
                <p className="text-xs text-brand-500 font-medium">Tidak ada jadwal mengajar guru yang sesuai filter.</p>
              </div>
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-brand-50/50 border-b border-brand-100 text-brand-500 uppercase tracking-widest text-[10px] font-black">
                  <th className="py-4 px-6">Guru Pengajar</th>
                  <th className="py-4 px-6">Hari</th>
                  <th className="py-4 px-6">Mata Pelajaran</th>
                  <th className="py-4 px-6">Kelas</th>
                  <th className="py-4 px-6">Jam Mengajar</th>
                  <th className="py-4 px-6 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-50 text-sm font-medium text-brand-800">
                {filteredSchedules.map((row) => (
                  <tr key={row.id} className="hover:bg-brand-50/20 transition-colors">
                    <td className="py-4.5 px-6">
                      <div className="flex flex-col">
                        <span className="font-bold text-brand-950">{toSentenceCase(row.user_nama)}</span>
                        <span className="text-[11px] text-brand-450">{row.user_email}</span>
                      </div>
                    </td>
                    <td className="py-4.5 px-6">
                      <span className="px-3 py-1 bg-brand-50 text-brand-700 rounded-full text-xs font-bold border border-brand-100/50">
                        {row.hari}
                      </span>
                    </td>
                    <td className="py-4.5 px-6 font-bold text-brand-900">
                      {row.mata_pelajaran}
                    </td>
                    <td className="py-4.5 px-6">
                      <div className="flex items-center gap-1.5 text-brand-600 font-bold">
                        <Users className="w-3.5 h-3.5 text-brand-400" />
                        {row.kelas}
                      </div>
                    </td>
                    <td className="py-4.5 px-6">
                      <div className="flex items-center gap-1.5 text-brand-650 font-bold">
                        <Clock className="w-3.5 h-3.5 text-brand-400" />
                        {row.jam_mulai.slice(0, 5)} - {row.jam_selesai.slice(0, 5)}
                      </div>
                    </td>
                    <td className="py-4.5 px-6 text-center">
                      <button
                        onClick={() => setDeleteTarget(row)}
                        className="p-2 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-xl transition-all cursor-pointer border-0 bg-transparent"
                        title="Hapus Jadwal"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Add Schedule Modal */}
      <AnimatePresence>
        {isAddModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-brand-950/60 backdrop-blur-xs">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden border border-brand-150"
            >
              <div className="px-6 py-5 bg-brand-50 border-b border-brand-100 flex items-center justify-between">
                <h3 className="font-black text-brand-950 text-base">Tambah Jadwal Mengajar Guru</h3>
                <button
                  onClick={() => setIsAddModalOpen(false)}
                  className="p-1.5 rounded-xl hover:bg-brand-200/50 text-brand-400 hover:text-brand-800 transition-all cursor-pointer bg-transparent border-0"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-4">
                {/* Select Teacher */}
                <div className="space-y-1.5">
                  <label className="text-xs font-black text-brand-700 uppercase tracking-wide">Pilih Guru Pengajar</label>
                  <select
                    value={formTeacherId}
                    onChange={(e) => setFormTeacherId(e.target.value)}
                    className="w-full px-4 py-3 rounded-2xl border border-brand-100 text-sm font-bold text-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500/25 bg-[#faf9ff]"
                  >
                    <option value="">-- Pilih Guru --</option>
                    {teachers.map(t => (
                      <option key={t.id} value={t.id}>{toSentenceCase(t.nama)} ({t.email})</option>
                    ))}
                  </select>
                </div>

                {/* Day & Class row */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-black text-brand-700 uppercase tracking-wide">Hari</label>
                    <select
                      value={formHari}
                      onChange={(e) => setFormHari(e.target.value)}
                      className="w-full px-4 py-3 rounded-2xl border border-brand-100 text-sm font-bold text-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500/25 bg-[#faf9ff]"
                    >
                      {listHari.map(d => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-black text-brand-700 uppercase tracking-wide">Kelas</label>
                    <input
                      type="text"
                      placeholder="Contoh: XII-A, XI-B"
                      value={formKelas}
                      onChange={(e) => setFormKelas(e.target.value)}
                      className="w-full px-4 py-3 rounded-2xl border border-brand-100 text-sm font-medium text-brand-900 focus:outline-none focus:ring-2 focus:ring-brand-500/25 bg-[#faf9ff]"
                    />
                  </div>
                </div>

                {/* Subject */}
                <div className="space-y-1.5">
                  <label className="text-xs font-black text-brand-700 uppercase tracking-wide">Mata Pelajaran</label>
                  <input
                    type="text"
                    placeholder="Contoh: Matematika Wajib, Fisika, Kimia"
                    value={formMapel}
                    onChange={(e) => setFormMapel(e.target.value)}
                    className="w-full px-4 py-3 rounded-2xl border border-brand-100 text-sm font-medium text-brand-900 focus:outline-none focus:ring-2 focus:ring-brand-500/25 bg-[#faf9ff]"
                  />
                </div>

                {/* Hours row */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-black text-brand-700 uppercase tracking-wide">Jam Mulai</label>
                    <input
                      type="time"
                      value={formJamMulai}
                      onChange={(e) => setFormJamMulai(e.target.value)}
                      className="w-full px-4 py-3 rounded-2xl border border-brand-100 text-sm font-bold text-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500/25 bg-[#faf9ff]"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-black text-brand-700 uppercase tracking-wide">Jam Selesai</label>
                    <input
                      type="time"
                      value={formJamSelesai}
                      onChange={(e) => setFormJamSelesai(e.target.value)}
                      className="w-full px-4 py-3 rounded-2xl border border-brand-100 text-sm font-bold text-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500/25 bg-[#faf9ff]"
                    />
                  </div>
                </div>
              </div>

              <div className="px-6 py-4 bg-brand-50/50 border-t border-brand-100 flex items-center justify-end gap-3">
                <button
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2.5 rounded-2xl hover:bg-brand-200/40 text-brand-600 hover:text-brand-900 font-bold text-sm transition-all cursor-pointer bg-transparent border-0"
                >
                  Batal
                </button>
                <button
                  onClick={() => addMutation.mutate()}
                  disabled={addMutation.isPending}
                  className="px-5 py-2.5 rounded-2xl bg-gradient-to-r from-brand-600 to-brand-700 hover:from-brand-700 hover:to-brand-800 text-white font-bold text-sm shadow-md transition-all cursor-pointer border-0"
                >
                  {addMutation.isPending ? "Menyimpan..." : "Simpan Jadwal"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteTarget && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-brand-950/60 backdrop-blur-xs">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl w-full max-w-md shadow-2xl p-6 text-center space-y-5 border border-brand-150"
            >
              <div className="w-14 h-14 bg-rose-50 rounded-2xl flex items-center justify-center mx-auto border border-rose-100">
                <AlertTriangle className="w-7 h-7 text-rose-500" />
              </div>

              <div className="space-y-1">
                <h3 className="text-lg font-black text-brand-950">Hapus Jadwal Mengajar?</h3>
                <p className="text-xs text-brand-500 font-medium leading-relaxed">
                  Apakah Anda yakin ingin menghapus jadwal mengajar <strong>{deleteTarget.mata_pelajaran}</strong> kelas <strong>{deleteTarget.kelas}</strong> oleh <strong>{toSentenceCase(deleteTarget.user_nama)}</strong>? Tindakan ini tidak dapat dibatalkan.
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteTarget(null)}
                  className="flex-1 py-3 px-4 rounded-2xl text-xs font-bold text-brand-550 hover:text-brand-850 hover:bg-brand-50 transition-all cursor-pointer bg-transparent border-0"
                >
                  Batal
                </button>
                <button
                  onClick={() => deleteMutation.mutate()}
                  disabled={deleteMutation.isPending}
                  className="flex-1 py-3 px-4 rounded-2xl text-xs font-bold text-white bg-rose-500 hover:bg-rose-650 transition-all cursor-pointer border-0 shadow-md shadow-rose-500/10"
                >
                  {deleteMutation.isPending ? "Menghapus..." : "Ya, Hapus"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
