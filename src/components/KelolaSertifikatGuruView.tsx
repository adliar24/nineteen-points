import React, { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion, AnimatePresence } from "motion/react";
import { Award, Plus, Trash2, Search, X, Check, FileSpreadsheet, RefreshCw } from "lucide-react";
import { getAllKegiatanGuru, getTeacherProfiles, addKegiatanGuru, deleteKegiatanGuru } from "../dbStore";
import ModalPortal from "./ModalPortal";
import { toSentenceCase } from "../formatName";

export default function KelolaSertifikatGuruView() {
  const [searchQuery, setSearchQuery] = useState("");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Form State
  const [selectedTeacherId, setSelectedTeacherId] = useState("");
  const [namaKegiatan, setNamaKegiatan] = useState("");
  const [tanggalKegiatan, setTanggalKegiatan] = useState(() => new Date().toISOString().slice(0, 10));
  const [peran, setPeran] = useState("Peserta");
  const [customPeran, setCustomPeran] = useState("");
  const [noSertifikat, setNoSertifikat] = useState("");
  const [penyelenggara, setPenyelenggara] = useState("SMAN 19 Bandung");
  const [durasiJam, setDurasiJam] = useState(32);
  
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Queries
  const { data: kegiatanList = [], isLoading: loadingKegiatan, refetch: refetchKegiatan } = useQuery({
    queryKey: ["allKegiatanGuru"],
    queryFn: getAllKegiatanGuru,
  });

  const { data: teachers = [], isLoading: loadingTeachers } = useQuery({
    queryKey: ["teacherProfiles"],
    queryFn: getTeacherProfiles,
    enabled: isAddModalOpen,
  });

  // Mutations
  const addMutation = useMutation({
    mutationFn: async () => {
      const finalPeran = peran === "Lainnya" ? customPeran : peran;
      return addKegiatanGuru(
        selectedTeacherId,
        namaKegiatan,
        tanggalKegiatan,
        finalPeran,
        noSertifikat,
        penyelenggara,
        durasiJam
      );
    },
    onSuccess: () => {
      setSuccessMsg("Sertifikat baru berhasil diterbitkan!");
      setIsAddModalOpen(false);
      refetchKegiatan();
      
      // Reset Form
      setSelectedTeacherId("");
      setNamaKegiatan("");
      setTanggalKegiatan(new Date().toISOString().slice(0, 10));
      setPeran("Peserta");
      setCustomPeran("");
      setNoSertifikat("");
      setPenyelenggara("SMAN 19 Bandung");
      setDurasiJam(32);

      setTimeout(() => setSuccessMsg(null), 4000);
    },
    onError: (err: any) => {
      setErrorMsg("Gagal menyimpan sertifikat: " + err.message);
      setTimeout(() => setErrorMsg(null), 5000);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteKegiatanGuru(id),
    onSuccess: () => {
      setSuccessMsg("Sertifikat berhasil dihapus.");
      refetchKegiatan();
      setTimeout(() => setSuccessMsg(null), 4000);
    },
    onError: (err: any) => {
      alert("Gagal menghapus sertifikat: " + err.message);
    }
  });

  const handleDelete = (id: string, name: string) => {
    const confirm = window.confirm(`Apakah Anda yakin ingin menghapus data sertifikat untuk "${toSentenceCase(name)}"?`);
    if (confirm) {
      deleteMutation.mutate(id);
    }
  };

  const filteredList = kegiatanList.filter(row => 
    row.user_nama.toLowerCase().includes(searchQuery.toLowerCase()) ||
    row.nama_kegiatan.toLowerCase().includes(searchQuery.toLowerCase()) ||
    row.peran.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6 pb-12 animate-fade-in font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-brand-950 tracking-tight">
            Kelola Sertifikat Guru
          </h2>
          <p className="text-xs text-brand-500 font-semibold mt-1">
            Menerbitkan dan mengelola riwayat sertifikat kegiatan guru seperti IHT, Seminar, dan Workshop.
          </p>
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

      {/* CONTROLS BAR */}
      <div className="bg-white p-5 rounded-3xl border border-brand-100 shadow-xl shadow-brand-900/5 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-brand-500/50 w-5 h-5" />
          <input
            type="text"
            placeholder="Cari berdasarkan nama guru, kegiatan, atau peran..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-11 pr-4 py-3 bg-brand-50/20 rounded-2xl border border-brand-100 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white transition-all text-brand-950 placeholder-brand-500/30"
          />
        </div>

        <div className="flex items-center gap-3.5 w-full md:w-auto justify-end">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center justify-center gap-2 px-5 py-3.5 brand-gradient text-white rounded-2xl text-xs font-black shadow-md cursor-pointer w-full sm:w-auto"
          >
            <Plus className="w-4.5 h-4.5" />
            Terbitkan Sertifikat
          </motion.button>
          <button
            onClick={() => refetchKegiatan()}
            className="p-3 bg-brand-50 text-brand-600 rounded-2xl hover:bg-brand-100 border border-brand-100/50 transition-colors cursor-pointer flex items-center justify-center"
          >
            <RefreshCw className="w-4.5 h-4.5" />
          </button>
        </div>
      </div>

      {/* TABLE */}
      <div className="bg-white rounded-3xl border border-brand-100 shadow-xl shadow-brand-900/5 overflow-hidden">
        <div className="overflow-x-auto min-h-[400px]">
          {loadingKegiatan ? (
            <div className="py-20 text-center">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto text-brand-500" />
              <p className="text-xs font-bold text-brand-400 mt-2">Memuat list sertifikat...</p>
            </div>
          ) : filteredList.length > 0 ? (
            <table className="w-full text-left border-collapse table-fixed">
              <thead>
                <tr className="bg-brand-50/50 border-b border-brand-100 text-brand-500 text-xs font-black uppercase tracking-wider">
                  <th className="py-4 px-6 w-[200px]">Guru Penerima</th>
                  <th className="py-4 px-6 w-[280px]">Nama Kegiatan</th>
                  <th className="py-4 px-6 w-[120px] text-center">Peran</th>
                  <th className="py-4 px-6 w-[110px] text-center">Beban Belajar</th>
                  <th className="py-4 px-6 w-[120px]">Tanggal</th>
                  <th className="py-4 px-6 w-[80px] text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-50 text-xs font-semibold text-brand-900">
                {filteredList.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/40 transition-colors">
                    <td className="py-4 px-6">
                      <span className="font-extrabold text-brand-950 block">{toSentenceCase(row.user_nama)}</span>
                      <span className="text-[10px] text-slate-400 font-bold block mt-1">{row.user_email}</span>
                    </td>
                    <td className="py-4 px-6">
                      <span className="font-extrabold text-brand-950 block leading-snug">{row.nama_kegiatan}</span>
                      {row.no_sertifikat && (
                        <span className="text-[10px] text-slate-400 font-mono block mt-1">No: {row.no_sertifikat}</span>
                      )}
                    </td>
                    <td className="py-4 px-6 text-center">
                      <span className="inline-block px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-xl text-[10px] font-black uppercase">
                        {row.peran}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-center font-mono text-slate-650">
                      {row.durasi_jam ? `${row.durasi_jam} JP` : "-"}
                    </td>
                    <td className="py-4 px-6 text-slate-600">
                      {new Date(row.tanggal_kegiatan).toLocaleDateString("id-ID", { day: 'numeric', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="py-4 px-6 text-right">
                      <button
                        onClick={() => handleDelete(row.id, row.user_nama)}
                        className="p-2 hover:bg-rose-50 text-rose-500 hover:text-rose-700 rounded-xl transition-all cursor-pointer border border-transparent hover:border-rose-100"
                        title="Hapus Sertifikat"
                      >
                        <Trash2 className="w-4.5 h-4.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="py-24 text-center">
              <Award className="w-10 h-10 text-brand-300 mx-auto" />
              <h4 className="text-xs font-black text-brand-500 uppercase tracking-widest mt-2">Tidak Ada Data</h4>
              <p className="text-[10px] text-brand-400 font-semibold max-w-xs mx-auto mt-1">
                Belum ada data sertifikat diterbitkan atau cocok dengan filter.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ADD CERTIFICATE MODAL */}
      <ModalPortal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Terbitkan Sertifikat Guru Baru"
        icon={Award}
        maxWidth="max-w-md"
      >
        {errorMsg && (
          <div className="p-3 bg-rose-50 text-rose-800 text-xs font-semibold rounded-xl border border-rose-200 mb-4">
            {errorMsg}
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!selectedTeacherId) {
              setErrorMsg("Pilih guru terlebih dahulu.");
              return;
            }
            if (peran === "Lainnya" && !customPeran) {
              setErrorMsg("Tulis peran kustom.");
              return;
            }
            addMutation.mutate();
          }}
          className="space-y-4"
        >
          {/* Guru Penerima */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-brand-400 uppercase tracking-widest block">Guru Penerima</label>
            <select
              required
              value={selectedTeacherId}
              onChange={(e) => setSelectedTeacherId(e.target.value)}
              className="w-full border border-brand-100 rounded-xl p-3 text-xs font-bold text-brand-800 bg-white outline-none"
            >
              <option value="">-- Pilih Guru --</option>
              {teachers.map(t => (
                <option key={t.id} value={t.id}>{toSentenceCase(t.nama)} ({t.email})</option>
              ))}
            </select>
          </div>

          {/* Nama Kegiatan */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-brand-400 uppercase tracking-widest block">Nama Kegiatan / Diklat</label>
            <input
              type="text"
              required
              placeholder="Contoh: In-House Training Kurikulum Merdeka"
              value={namaKegiatan}
              onChange={(e) => setNamaKegiatan(e.target.value)}
              className="w-full border border-brand-100 rounded-xl p-3 text-xs font-semibold text-brand-900 outline-none bg-brand-50/10 focus:bg-white"
            />
          </div>

          {/* No Sertifikat */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-brand-400 uppercase tracking-widest block">Nomor Surat Sertifikat</label>
            <input
              type="text"
              placeholder="Contoh: 800/123/SMAN19/2026"
              value={noSertifikat}
              onChange={(e) => setNoSertifikat(e.target.value)}
              className="w-full border border-brand-100 rounded-xl p-3 text-xs font-semibold text-brand-900 outline-none bg-brand-50/10 focus:bg-white"
            />
          </div>

          {/* Peran & Durasi JP */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-brand-400 uppercase tracking-widest block">Peran</label>
              <select
                value={peran}
                onChange={(e) => setPeran(e.target.value)}
                className="w-full border border-brand-100 rounded-xl p-3 text-xs font-bold text-brand-850 bg-white outline-none"
              >
                <option value="Peserta">Peserta</option>
                <option value="Narasumber">Narasumber</option>
                <option value="Panitia">Panitia</option>
                <option value="Lainnya">Lainnya (Kustom)</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-brand-400 uppercase tracking-widest block">Beban Belajar (JP)</label>
              <input
                type="number"
                min="0"
                value={durasiJam}
                onChange={(e) => setDurasiJam(parseInt(e.target.value, 10) || 0)}
                className="w-full border border-brand-100 rounded-xl p-3 text-xs font-bold text-brand-900 font-mono outline-none bg-brand-50/10 focus:bg-white"
              />
            </div>
          </div>

          {/* Kustom Peran */}
          {peran === "Lainnya" && (
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-brand-400 uppercase tracking-widest block">Tulis Peran Kustom</label>
              <input
                type="text"
                required
                placeholder="Contoh: Moderator / Penilai"
                value={customPeran}
                onChange={(e) => setCustomPeran(e.target.value)}
                className="w-full border border-brand-100 rounded-xl p-3 text-xs font-semibold text-brand-900 outline-none bg-brand-50/10 focus:bg-white"
              />
            </div>
          )}

          {/* Tanggal & Penyelenggara */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-brand-400 uppercase tracking-widest block">Tanggal Kegiatan</label>
              <input
                type="date"
                required
                value={tanggalKegiatan}
                onChange={(e) => setTanggalKegiatan(e.target.value)}
                className="w-full border border-brand-100 rounded-xl p-3 text-xs font-bold text-brand-850 outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-brand-400 uppercase tracking-widest block">Penyelenggara</label>
              <input
                type="text"
                required
                value={penyelenggara}
                onChange={(e) => setPenyelenggara(e.target.value)}
                className="w-full border border-brand-100 rounded-xl p-3 text-xs font-semibold text-brand-900 outline-none bg-brand-50/10 focus:bg-white"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2.5 justify-end pt-4 border-t border-brand-50">
            <button
              type="button"
              onClick={() => setIsAddModalOpen(false)}
              className="px-4 py-2.5 border border-brand-100 rounded-xl text-sm font-bold text-brand-600 hover:bg-brand-50 cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={addMutation.isPending}
              className="px-5 py-2.5 brand-gradient text-white text-xs font-black rounded-xl shadow-lg shadow-brand-500/20 cursor-pointer disabled:opacity-50"
            >
              {addMutation.isPending ? "Menerbitkan..." : "Terbitkan"}
            </button>
          </div>
        </form>
      </ModalPortal>
    </div>
  );
}
