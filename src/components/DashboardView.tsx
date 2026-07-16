import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Search,
  Plus,
  Trash2,
  FileSpreadsheet,
  CheckSquare,
  Award,
  Filter,
  UserPlus,
  RefreshCw,
  TrendingUp,
  X,
  Sparkles,
  ChevronDown
} from "lucide-react";
import { Siswa, MasterPoin, RiwayatPoin, UserSession } from "../types";
import {
  getSiswaList,
  saveSiswaList,
  getMasterPoinList,
  saveMasterPoinList,
  addRiwayat
} from "../dbStore";
import ConfirmationModal from "./ConfirmationModal";

interface DashboardViewProps {
  userSession: UserSession;
  onNavigate: (view: string) => void;
  onRefreshHistory: () => void;
}

export default function DashboardView({ userSession, onNavigate, onRefreshHistory }: DashboardViewProps) {
  // State
  const [siswaList, setSiswaList] = useState<Siswa[]>([]);
  const [masterPoin, setMasterPoin] = useState<MasterPoin[]>([]);

  useEffect(() => {
    async function loadData() {
      setSiswaList(await getSiswaList());
      setMasterPoin(await getMasterPoinList());
    }
    loadData();
  }, []);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedKelas, setSelectedKelas] = useState("Semua");
  const [selectedSiswaIds, setSelectedSiswaIds] = useState<string[]>([]);
  
  // Modals
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isAddSiswaModalOpen, setIsAddSiswaModalOpen] = useState(false);
  const [isSinglePointModalOpen, setIsSinglePointModalOpen] = useState(false);
  const [selectedSingleSiswa, setSelectedSingleSiswa] = useState<Siswa | null>(null);

  // New forms
  const [selectedPoinId, setSelectedPoinId] = useState("");
  const [customPointValue, setCustomPointValue] = useState<number>(10);
  const [customPointName, setCustomPointName] = useState("");
  const [isCustomPoint, setIsCustomPoint] = useState(false);

  // Import fields
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState("");

  // New Student fields
  const [newNis, setNewNis] = useState("");
  const [newNama, setNewNama] = useState("");
  const [newKelas, setNewKelas] = useState("XII IPA 1");
  const [newPoin, setNewPoin] = useState("0");
  const [addSiswaError, setAddSiswaError] = useState("");

  // Toast feedback
  const [toastMessage, setToastMessage] = useState("");
  const [siswaToDelete, setSiswaToDelete] = useState<{ id: string; nama: string } | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(""), 4000);
  };

  const reloadData = async () => {
    setSiswaList(await getSiswaList());
    setMasterPoin(await getMasterPoinList());
    showToast("Data disinkronkan kembali.");
    onRefreshHistory();
  };

  // Get list of unique classes
  const classes = ["Semua", ...Array.from(new Set(siswaList.map((s) => s.kelas)))];

  // Filter students based on search and selected class
  const filteredSiswa = siswaList.filter((s) => {
    const matchesSearch =
      s.nama.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.nis.includes(searchQuery);
    const matchesClass = selectedKelas === "Semua" || s.kelas === selectedKelas;
    return matchesSearch && matchesClass;
  });

  // Handle multi-select checkboxes
  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedSiswaIds(filteredSiswa.map((s) => s.id));
    } else {
      setSelectedSiswaIds([]);
    }
  };

  const handleSelectSiswa = (siswaId: string) => {
    if (selectedSiswaIds.includes(siswaId)) {
      setSelectedSiswaIds(selectedSiswaIds.filter((id) => id !== siswaId));
    } else {
      setSelectedSiswaIds([...selectedSiswaIds, siswaId]);
    }
  };

  // Handle Bulk Point Assignment
  const applyBulkPoints = () => {
    if (selectedSiswaIds.length === 0) {
      alert("Silakan pilih minimal 1 siswa.");
      return;
    }

    let name = "";
    let value = 0;

    if (isCustomPoint) {
      if (!customPointName) {
        alert("Nama poin kustom tidak boleh kosong.");
        return;
      }
      name = customPointName;
      value = customPointValue;
    } else {
      const selected = masterPoin.find((mp) => mp.id === selectedPoinId);
      if (!selected) {
        alert("Silakan pilih jenis pelanggaran / prestasi.");
        return;
      }
      name = selected.nama_poin;
      value = selected.nilai_poin;
    }

    // Assign to all selected students
    selectedSiswaIds.forEach((siswaId) => {
      addRiwayat(siswaId, name, value, userSession.fullName);
    });

    // Reset states
    setSiswaList(getSiswaList());
    setSelectedSiswaIds([]);
    setIsBulkModalOpen(false);
    setSelectedPoinId("");
    setCustomPointName("");
    setIsCustomPoint(false);
    onRefreshHistory();
    showToast(`Poin "${name}" berhasil diberikan ke ${selectedSiswaIds.length} siswa.`);
  };

  // Handle Single Point Assignment
  const openSinglePointModal = (siswa: Siswa) => {
    setSelectedSingleSiswa(siswa);
    setIsSinglePointModalOpen(true);
  };

  const applySinglePoint = async () => {
    if (!selectedSingleSiswa) return;

    let name = "";
    let value = 0;

    if (isCustomPoint) {
      if (!customPointName) {
        alert("Nama poin kustom tidak boleh kosong.");
        return;
      }
      name = customPointName;
      value = customPointValue;
    } else {
      const selected = masterPoin.find((mp) => mp.id === selectedPoinId);
      if (!selected) {
        alert("Silakan pilih jenis pelanggaran / prestasi.");
        return;
      }
      name = selected.nama_poin;
      value = selected.nilai_poin;
    }

    await addRiwayat(selectedSingleSiswa.id, name, value, userSession.fullName);

    setSiswaList(await getSiswaList());
    setIsSinglePointModalOpen(false);
    setSelectedSingleSiswa(null);
    setSelectedPoinId("");
    setCustomPointName("");
    setIsCustomPoint(false);
    onRefreshHistory();
    showToast(`Berhasil memberikan poin ke ${selectedSingleSiswa.nama}.`);
  };

  // Import Siswa via CSV parser
  const handleImportCSV = async () => {
    if (!importText.trim()) {
      setImportError("Kolom input tidak boleh kosong.");
      return;
    }

    const lines = importText.split("\n");
    const addedStudents: Siswa[] = [];
    let errorLines = 0;

    lines.forEach((line, index) => {
      const parts = line.split(",").map((p) => p.trim());
      if (parts.length >= 3) {
        const [nis, nama, kelas, pts] = parts;
        if (nis && nama && kelas) {
          addedStudents.push({
            id: "s_" + Math.random().toString(36).substr(2, 9),
            nis,
            nama,
            kelas,
            total_poin: pts ? parseInt(pts, 10) || 0 : 100,
          });
        } else {
          errorLines++;
        }
      } else if (line.trim() !== "") {
        errorLines++;
      }
    });

    if (addedStudents.length === 0) {
      setImportError("Format salah. Pastikan baris memiliki minimal 3 kolom (nis, nama, kelas).");
      return;
    }

    const currentList = await getSiswaList();
    // Prevent duplicate NIS in imported batch
    const uniqueBatch = addedStudents.filter(
      (newS) => !currentList.some((oldS) => oldS.nis === newS.nis)
    );

    const merged = [...currentList, ...uniqueBatch];
    await saveSiswaList(merged);
    setSiswaList(merged);
    setImportText("");
    setIsImportModalOpen(false);
    setImportError("");
    
    showToast(
      `Berhasil mengimpor ${uniqueBatch.length} siswa baru.${
        addedStudents.length - uniqueBatch.length > 0
          ? ` (${addedStudents.length - uniqueBatch.length} NIS ganda dilewati)`
          : ""
      }`
    );
  };

  // Add individual student manual
  const handleAddSiswa = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddSiswaError("");

    if (!newNis || !newNama || !newKelas) {
      setAddSiswaError("Mohon lengkapi semua kolom wajib.");
      return;
    }

    const currentList = await getSiswaList();
    if (currentList.some((s) => s.nis === newNis)) {
      setAddSiswaError(`Siswa dengan NIS "${newNis}" sudah terdaftar.`);
      return;
    }

    const newStudent: Siswa = {
      id: "s_" + Math.random().toString(36).substr(2, 9),
      nis: newNis,
      nama: newNama,
      kelas: newKelas,
      total_poin: parseInt(newPoin, 10) || 100,
    };

    const updated = [...currentList, newStudent];
    await saveSiswaList(updated);
    setSiswaList(updated);

    // Reset form
    setNewNis("");
    setNewNama("");
    setNewKelas("XII IPA 1");
    setNewPoin("100");
    setIsAddSiswaModalOpen(false);
    showToast(`Siswa "${newNama}" berhasil ditambahkan.`);
  };

  const handleDeleteSiswa = (id: string, nama: string) => {
    setSiswaToDelete({ id, nama });
  };

  const executeDeleteSiswa = async (id: string, nama: string) => {
    const currentList = await getSiswaList();
    const filtered = currentList.filter((s) => s.id !== id);
    await saveSiswaList(filtered);
    setSiswaList(filtered);
    showToast(`Siswa "${nama}" telah dihapus.`);
  };

  return (
    <div className="space-y-6 pb-8">
      {/* Toast Notification */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            className="fixed bottom-5 right-5 z-50 bg-slate-900 text-white px-5 py-3 rounded-xl shadow-2xl flex items-center gap-3 border border-slate-700"
          >
            <Sparkles className="w-5 h-5 text-zinc-350" />
            <span className="text-sm font-medium">{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header Cards / Analytics with luxurious brand-gradient and glowing fuchsia borders from the reference */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <motion.div 
          whileHover={{ scale: 1.025, y: -4 }}
          transition={{ type: "spring", stiffness: 350, damping: 22 }}
          className="brand-gradient rounded-3xl p-6 text-white shadow-xl shadow-brand-500/25 flex items-center justify-between wave-bg relative overflow-hidden"
        >
          <div className="relative z-10">
            <p className="text-brand-100/80 text-[10px] font-bold uppercase tracking-wider">
              Total Database Siswa
            </p>
            <h3 className="text-4xl font-black tracking-tight mt-1">
              {siswaList.length}
            </h3>
            <p className="text-brand-200/80 text-[11px] mt-1.5 font-medium">
              Aktif terdaftar di SMAN 19
            </p>
          </div>
          <div className="p-4 bg-white/10 backdrop-blur-md rounded-2xl border border-white/15 shadow-md relative z-10">
            <TrendingUp className="w-8 h-8 text-white" />
          </div>
        </motion.div>

        <motion.div 
          whileHover={{ scale: 1.025, y: -4 }}
          transition={{ type: "spring", stiffness: 350, damping: 22 }}
          className="bg-white rounded-3xl p-6 border border-brand-100 shadow-xl shadow-brand-900/5 flex items-center justify-between relative overflow-hidden"
        >
          <div>
            <p className="text-brand-500/60 text-[10px] font-bold uppercase tracking-wider">
              Rata-rata Poin
            </p>
            <h3 className="text-4xl font-black text-brand-900 tracking-tight mt-1">
              {siswaList.length > 0
                ? Math.round(siswaList.reduce((acc, curr) => acc + curr.total_poin, 0) / siswaList.length)
                : 0}
            </h3>
            <p className="text-brand-500/50 text-[11px] mt-1.5 font-medium">Standar kelulusan min. 75 poin</p>
          </div>
          <div className="p-4 bg-brand-50 rounded-2xl border border-brand-100 shadow-sm">
            <Award className="w-8 h-8 text-brand-600" />
          </div>
        </motion.div>

        <motion.div 
          whileHover={{ scale: 1.025, y: -4 }}
          transition={{ type: "spring", stiffness: 350, damping: 22 }}
          className="bg-white rounded-3xl p-6 border border-brand-100 shadow-xl shadow-brand-900/5 flex items-center justify-between relative overflow-hidden"
        >
          <div>
            <p className="text-brand-500/60 text-[10px] font-bold uppercase tracking-wider">
              Item Master Aturan
            </p>
            <h3 className="text-4xl font-black text-brand-900 tracking-tight mt-1">{masterPoin.length}</h3>
            <p className="text-brand-500/50 text-[11px] mt-1.5 font-medium">Pelanggaran & prestasi baku</p>
          </div>
          <div className="p-4 bg-accent-500/10 rounded-2xl border border-accent-500/20 shadow-sm">
            <FileSpreadsheet className="w-8 h-8 text-accent-600" />
          </div>
        </motion.div>
      </div>

      {/* Main Filter & Action Bar - redesigned to match high-fidelity cards */}
      <div className="bg-white p-6 rounded-3xl border border-brand-100 shadow-xl shadow-brand-900/5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          
          {/* Searching and filtering */}
          <div className="flex flex-wrap items-center gap-3.5 flex-1">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="absolute left-4 top-4 text-brand-500/50 w-5 h-5" />
              <input
                type="text"
                placeholder="Cari Siswa Berdasarkan Nama atau NIS..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-12 pr-4 py-3.5 bg-brand-50/20 rounded-2xl border border-brand-100 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white transition-all text-brand-950 placeholder-brand-500/30"
              />
            </div>

            {/* Filter Kelas */}
            <div className="relative">
              <span className="absolute left-4 top-4 text-brand-500/50">
                <Filter className="w-4 h-4" />
              </span>
              <select
                value={selectedKelas}
                onChange={(e) => {
                  setSelectedKelas(e.target.value);
                  setSelectedSiswaIds([]); // reset selection
                }}
                className="pl-10 pr-10 py-3.5 bg-brand-50/20 border border-brand-100 rounded-2xl text-sm font-bold text-brand-800 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white appearance-none cursor-pointer"
              >
                {classes.map((cls) => (
                  <option key={cls} value={cls}>
                    {cls === "Semua" ? "Semua Kelas" : `Kelas ${cls}`}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 text-brand-500 absolute right-4 top-4.5 pointer-events-none" />
            </div>

            <button
              onClick={reloadData}
              title="Refresh Data"
              className="p-3.5 bg-brand-50 text-brand-600 rounded-2xl hover:bg-brand-100 border border-brand-100/50 transition-colors cursor-pointer"
            >
              <RefreshCw className="w-5 h-5 animate-hover" />
            </button>
          </div>

          {/* Action buttons with gorgeous reference color accents */}
          <div className="flex flex-wrap items-center gap-2.5">
            {selectedSiswaIds.length > 0 && (
              <motion.button
                whileHover={{ scale: 1.02, y: -1 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setIsBulkModalOpen(true)}
                className="flex items-center gap-2 px-5 py-3.5 bg-gradient-to-r from-accent-500 to-fuchsia-600 hover:opacity-95 text-white rounded-2xl text-sm font-bold transition-all shadow-lg shadow-accent-500/20 cursor-pointer"
              >
                <Award className="w-4.5 h-4.5" />
                Beri Poin Massal ({selectedSiswaIds.length})
              </motion.button>
            )}

            <motion.button
              whileHover={{ scale: 1.02, y: -1 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setIsAddSiswaModalOpen(true)}
              className="flex items-center gap-2 px-5 py-3.5 brand-gradient text-white rounded-2xl text-sm font-bold transition-all shadow-lg shadow-brand-500/20 cursor-pointer"
            >
              <UserPlus className="w-4.5 h-4.5" />
              Siswa Baru
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.02, y: -1 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setIsImportModalOpen(true)}
              className="flex items-center gap-2 px-5 py-3.5 bg-brand-50 hover:bg-brand-100 text-brand-700 border border-brand-100 rounded-2xl text-sm font-bold transition-all cursor-pointer shadow-sm"
            >
              <FileSpreadsheet className="w-4.5 h-4.5 text-brand-600" />
              Impor Excel (CSV)
            </motion.button>
          </div>
        </div>
      </div>

      {/* Students Table - stylized in glass card container */}
      <div className="bg-white rounded-3xl border border-brand-100 shadow-xl shadow-brand-900/5 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-brand-50/50 border-b border-brand-100/70 text-brand-500 text-[11px] font-extrabold uppercase tracking-widest">
                <th className="py-4.5 px-6 w-12 text-center">
                  <input
                    type="checkbox"
                    checked={
                      filteredSiswa.length > 0 &&
                      filteredSiswa.every((s) => selectedSiswaIds.includes(s.id))
                    }
                    onChange={handleSelectAll}
                    className="w-4.5 h-4.5 rounded-lg border-brand-200 text-brand-600 focus:ring-brand-500 cursor-pointer"
                  />
                </th>
                <th className="py-4.5 px-4 font-mono">NIS</th>
                <th className="py-4.5 px-6">Nama Lengkap</th>
                <th className="py-4.5 px-6">Kelas</th>
                <th className="py-4.5 px-6 text-center">Total Poin</th>
                <th className="py-4.5 px-6 text-center">Status Kelayakan</th>
                <th className="py-4.5 px-6 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-100/40">
              {filteredSiswa.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-slate-400 text-sm">
                    Tidak ada siswa yang ditemukan.
                  </td>
                </tr>
              ) : (
                filteredSiswa.map((siswa) => {
                  const isSelected = selectedSiswaIds.includes(siswa.id);
                  const isSafe = siswa.total_poin >= 100;
                  const isWarning = siswa.total_poin >= 50 && siswa.total_poin < 100;

                  return (
                    <tr
                      key={siswa.id}
                      className={`hover:bg-brand-50/30 transition-colors ${
                        isSelected ? "bg-brand-50/50 border-l-4 border-brand-500" : ""
                      }`}
                    >
                      <td className="py-4.5 px-6 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleSelectSiswa(siswa.id)}
                          className="w-4.5 h-4.5 rounded-lg border-brand-200 text-brand-600 focus:ring-brand-500 cursor-pointer"
                        />
                      </td>
                      <td className="py-4.5 px-4 font-mono text-xs font-semibold text-brand-500/80">
                        {siswa.nis}
                      </td>
                      <td className="py-4.5 px-6">
                        <div className="font-bold text-brand-950 flex items-center gap-2.5">
                          <div className="w-8.5 h-8.5 rounded-xl bg-brand-100 text-brand-700 font-extrabold text-xs flex items-center justify-center shadow-inner uppercase">
                            {siswa.nama.slice(0, 2)}
                          </div>
                          <span>{siswa.nama}</span>
                        </div>
                      </td>
                      <td className="py-4.5 px-6 text-xs text-brand-700 font-bold uppercase tracking-wider">
                        {siswa.kelas}
                      </td>
                      <td className="py-4.5 px-6 text-center">
                        <span
                          className={`font-mono text-sm font-black px-3.5 py-1.5 rounded-full shadow-xs ${
                            isSafe
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
                              : isWarning
                              ? "bg-amber-50 text-amber-700 border border-amber-100"
                              : "bg-rose-50 text-rose-700 border border-rose-100 animate-pulse"
                          }`}
                        >
                          {siswa.total_poin}
                        </span>
                      </td>
                      <td className="py-4.5 px-6 text-center">
                        {isSafe ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider px-3 py-1 bg-emerald-50 text-emerald-700 rounded-full border border-emerald-100">
                            Layak Beasiswa
                          </span>
                        ) : isWarning ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider px-3 py-1 bg-amber-50 text-amber-700 rounded-full border border-amber-100">
                            Pembinaan Ringan
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider px-3 py-1 bg-rose-50 text-rose-700 rounded-full border border-rose-100 animate-bounce">
                            Skorsing / BK Alert
                          </span>
                        )}
                      </td>
                      <td className="py-4.5 px-6 text-right space-x-1.5">
                        <button
                          onClick={() => openSinglePointModal(siswa)}
                          className="text-brand-700 hover:text-brand-950 hover:bg-brand-50 text-xs font-bold px-3 py-2 rounded-xl transition-all border border-brand-100/50 inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Award className="w-3.5 h-3.5 text-brand-600" />
                          Update Poin
                        </button>
                        <button
                          onClick={() => {
                            // Quick navigate to card generator with NIS preselected
                            onNavigate("cards");
                          }}
                          className="text-accent-600 hover:text-accent-800 text-xs font-bold px-3 py-2 hover:bg-accent-50 rounded-xl transition-all inline-flex items-center gap-1 cursor-pointer"
                        >
                          Kartu QR
                        </button>
                        <button
                          onClick={() => handleDeleteSiswa(siswa.id, siswa.nama)}
                          className="text-brand-400 hover:text-rose-600 text-xs p-2 hover:bg-rose-50 rounded-xl transition-all inline-flex cursor-pointer"
                          title="Hapus Siswa"
                        >
                          <Trash2 className="w-4 h-4" />
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

      {/* MODAL 1: BULK POINT ASSIGNMENT */}
      {isBulkModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-lg p-6 flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Award className="w-5 h-5 text-zinc-800" />
                Penghargaan / Pelanggaran Massal
              </h3>
              <button
                onClick={() => setIsBulkModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-500 mb-4">
              Pemberian poin untuk <strong>{selectedSiswaIds.length} siswa</strong> yang dipilih.
            </p>

            <div className="space-y-4 flex-1 overflow-y-auto pr-1">
              {/* Point source selector */}
              <div className="flex gap-4 border-b border-slate-100 pb-3">
                <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                  <input
                    type="radio"
                    checked={!isCustomPoint}
                    onChange={() => setIsCustomPoint(false)}
                    className="text-zinc-800 focus:ring-zinc-800"
                  />
                  Gunakan Aturan Baku SMAN 19
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                  <input
                    type="radio"
                    checked={isCustomPoint}
                    onChange={() => setIsCustomPoint(true)}
                    className="text-zinc-800 focus:ring-zinc-800"
                  />
                  Tulis Manual (Poin Kustom)
                </label>
              </div>

              {!isCustomPoint ? (
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-600 uppercase">
                    Pilih Jenis Aturan
                  </label>
                  <select
                    value={selectedPoinId}
                    onChange={(e) => setSelectedPoinId(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl p-3 bg-slate-50 text-sm focus:ring-2 focus:ring-zinc-800 outline-none"
                  >
                    <option value="">-- Pilih Penghargaan / Pelanggaran --</option>
                    {masterPoin.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nilai_poin > 0 ? `[+${p.nilai_poin}]` : `[${p.nilai_poin}]`} {p.nama_poin}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-600 uppercase">
                      Deskripsi Penghargaan / Pelanggaran
                    </label>
                    <input
                      type="text"
                      placeholder="Contoh: Menjadi panitia ujian sekolah"
                      value={customPointName}
                      onChange={(e) => setCustomPointName(e.target.value)}
                      className="w-full border border-slate-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-zinc-800 outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-600 uppercase">
                      Nilai Poin (Positif untuk Prestasi, Negatif untuk Pelanggaran)
                    </label>
                    <input
                      type="number"
                      value={customPointValue}
                      onChange={(e) => setCustomPointValue(parseInt(e.target.value, 10) || 0)}
                      className="w-full border border-slate-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-zinc-800 outline-none"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3 justify-end border-t border-slate-100 pt-4 mt-6">
              <button
                onClick={() => setIsBulkModalOpen(false)}
                className="px-4 py-2 border border-slate-200 rounded-xl text-sm text-slate-500 hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                onClick={applyBulkPoints}
                className="px-5 py-2.5 bg-zinc-900 hover:bg-zinc-950 text-white rounded-xl text-sm font-semibold shadow-md shadow-zinc-200"
              >
                Berikan Poin Sekarang
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: SINGLE POINT ASSIGNMENT */}
      {isSinglePointModalOpen && selectedSingleSiswa && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-lg p-6 flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Award className="w-5 h-5 text-zinc-800" />
                Catat Poin: {selectedSingleSiswa.nama}
              </h3>
              <button
                onClick={() => {
                  setIsSinglePointModalOpen(false);
                  setSelectedSingleSiswa(null);
                }}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-500 mb-4">
              NIS: <strong>{selectedSingleSiswa.nis}</strong> | Kelas: <strong>{selectedSingleSiswa.kelas}</strong> | Poin Saat Ini: <strong>{selectedSingleSiswa.total_poin}</strong>
            </p>

            <div className="space-y-4 flex-1 overflow-y-auto pr-1">
              <div className="flex gap-4 border-b border-slate-100 pb-3">
                <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                  <input
                    type="radio"
                    checked={!isCustomPoint}
                    onChange={() => setIsCustomPoint(false)}
                    className="text-zinc-800 focus:ring-zinc-800"
                  />
                  Gunakan Aturan Baku
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                  <input
                    type="radio"
                    checked={isCustomPoint}
                    onChange={() => setIsCustomPoint(true)}
                    className="text-zinc-800 focus:ring-zinc-800"
                  />
                  Tulis Manual (Poin Kustom)
                </label>
              </div>

              {!isCustomPoint ? (
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-600 uppercase">
                    Pilih Jenis Aturan
                  </label>
                  <select
                    value={selectedPoinId}
                    onChange={(e) => setSelectedPoinId(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl p-3 bg-slate-50 text-sm focus:ring-2 focus:ring-zinc-800 outline-none"
                  >
                    <option value="">-- Pilih Aturan SMAN 19 --</option>
                    {masterPoin.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nilai_poin > 0 ? `[+${p.nilai_poin}]` : `[${p.nilai_poin}]`} {p.nama_poin}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-600 uppercase">
                      Deskripsi Poin Kustom
                    </label>
                    <input
                      type="text"
                      placeholder="Contoh: Sangat aktif dalam diskusi literasi"
                      value={customPointName}
                      onChange={(e) => setCustomPointName(e.target.value)}
                      className="w-full border border-slate-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-zinc-800 outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-600 uppercase">
                      Nilai Poin
                    </label>
                    <input
                      type="number"
                      value={customPointValue}
                      onChange={(e) => setCustomPointValue(parseInt(e.target.value, 10) || 0)}
                      className="w-full border border-slate-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-zinc-800 outline-none"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3 justify-end border-t border-slate-100 pt-4 mt-6">
              <button
                onClick={() => {
                  setIsSinglePointModalOpen(false);
                  setSelectedSingleSiswa(null);
                }}
                className="px-4 py-2 border border-slate-200 rounded-xl text-sm text-slate-500 hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                onClick={applySinglePoint}
                className="px-5 py-2.5 bg-zinc-900 hover:bg-zinc-950 text-white rounded-xl text-sm font-semibold shadow-md shadow-zinc-200"
              >
                Terapkan Poin
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: IMPORT CSV / EXCEL */}
      {isImportModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-xl p-6 flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-zinc-800" />
                Impor Data Siswa SMAN 19 (Excel / CSV)
              </h3>
              <button
                onClick={() => setIsImportModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {importError && (
              <div className="p-3 bg-red-50 text-red-700 rounded-xl border border-red-200 text-xs mb-4">
                {importError}
              </div>
            )}

            <div className="space-y-4 flex-1 overflow-y-auto pr-1">
              <div className="p-4 bg-slate-50 rounded-xl border border-dashed border-slate-200 text-xs text-slate-600 space-y-2">
                <p className="font-semibold text-slate-700">Format Baris CSV:</p>
                <code className="block bg-slate-100 p-2.5 rounded font-mono text-[11px] leading-relaxed">
                  nis, nama_lengkap, kelas, total_poin_awal (opsional)<br />
                  19013, Chika Jessica, XI IPS 2, 100<br />
                  19014, David Kurniawan, XII IPA 1, 95
                </code>
                <p className="text-[11px] text-slate-500">
                  Tip: Anda bisa menyalin tabel dari Excel (kolom NIS, NAMA, KELAS, POIN) lalu memisahkan dengan koma ke dalam kotak input di bawah ini.
                </p>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600 uppercase">
                  Tempel Baris CSV Di Sini
                </label>
                <textarea
                  rows={8}
                  placeholder="19013, Chika Jessica, XI IPS 2, 100&#10;19014, David Kurniawan, XII IPA 1, 95"
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl p-3 font-mono text-xs focus:ring-2 focus:ring-zinc-800 outline-none bg-slate-50/30"
                ></textarea>
              </div>
            </div>

            <div className="flex gap-3 justify-end border-t border-slate-100 pt-4 mt-6">
              <button
                onClick={() => setIsImportModalOpen(false)}
                className="px-4 py-2 border border-slate-200 rounded-xl text-sm text-slate-500 hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                onClick={handleImportCSV}
                className="px-5 py-2.5 bg-zinc-900 hover:bg-zinc-950 text-white rounded-xl text-sm font-semibold shadow-md shadow-zinc-200"
              >
                Impor Data Siswa
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: ADD INDIVIDUAL STUDENT */}
      {isAddSiswaModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-md p-6 flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-zinc-900" />
                Tambah Siswa Baru
              </h3>
              <button
                onClick={() => setIsAddSiswaModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {addSiswaError && (
              <div className="p-3 bg-red-50 text-red-700 rounded-xl border border-red-200 text-xs mb-4">
                {addSiswaError}
              </div>
            )}

            <form onSubmit={handleAddSiswa} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600 uppercase">
                  Nomor Induk Siswa (NIS) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: 19013"
                  value={newNis}
                  onChange={(e) => setNewNis(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-zinc-800 outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600 uppercase">
                  Nama Lengkap Siswa *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Chika Jessica"
                  value={newNama}
                  onChange={(e) => setNewNama(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-zinc-800 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-600 uppercase">
                    Kelas *
                  </label>
                  <select
                    value={newKelas}
                    onChange={(e) => setNewKelas(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-zinc-800 outline-none bg-slate-50"
                  >
                    <option value="XII IPA 1">XII IPA 1</option>
                    <option value="XII IPA 2">XII IPA 2</option>
                    <option value="XI IPS 1">XI IPS 1</option>
                    <option value="XI IPS 2">XI IPS 2</option>
                    <option value="X-A">X-A</option>
                    <option value="X-B">X-B</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-600 uppercase">
                    Saldo Poin Awal
                  </label>
                  <input
                    type="number"
                    value={newPoin}
                    onChange={(e) => setNewPoin(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-zinc-800 outline-none"
                  />
                </div>
              </div>

              <div className="flex gap-3 justify-end border-t border-slate-100 pt-4 mt-6">
                <button
                  type="button"
                  onClick={() => setIsAddSiswaModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-sm text-slate-500 hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-zinc-900 hover:bg-zinc-950 text-white rounded-xl text-sm font-semibold shadow-md shadow-zinc-200"
                >
                  Simpan Siswa
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Student Deletion */}
      <ConfirmationModal
        isOpen={siswaToDelete !== null}
        onClose={() => setSiswaToDelete(null)}
        onConfirm={() => {
          if (siswaToDelete) {
            executeDeleteSiswa(siswaToDelete.id, siswaToDelete.nama);
          }
        }}
        title="Hapus Profil Siswa?"
        message={`Apakah Anda yakin ingin menghapus data siswa "${siswaToDelete?.nama}"? Semua riwayat poin yang sudah tercatat akan tetap tersimpan di database log, namun profil siswa ini akan dihapus permanen.`}
        confirmText="Ya, Hapus"
        cancelText="Batal"
        type="danger"
      />
    </div>
  );
}
