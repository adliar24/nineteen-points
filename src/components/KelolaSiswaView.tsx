import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { QRCodeSVG } from "qrcode.react";
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
  X, 
  Sparkles, 
  ChevronDown,
  Printer,
  Download,
  School,
  ShieldAlert,
  Check,
  CreditCard,
  Settings,
  Grid,
  Users
} from "lucide-react";
import { Siswa, UserSession } from "../types";
import { 
  getSiswaList, 
  saveSiswaList, 
  addRiwayat 
} from "../dbStore";
import ConfirmationModal from "./ConfirmationModal";
import html2canvas from "html2canvas-pro";
import jsPDF from "jspdf";
import * as XLSX from "xlsx";
import { supabase } from "../supabaseClient";

interface KelolaSiswaViewProps {
  userSession: UserSession;
  onRefreshHistory: () => void;
}

export default function KelolaSiswaView({ userSession, onRefreshHistory }: KelolaSiswaViewProps) {
  // State
  const [siswaList, setSiswaList] = useState<Siswa[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedKelas, setSelectedKelas] = useState("Semua");
  const [selectedSiswaIds, setSelectedSiswaIds] = useState<string[]>([]);
  const [printingSiswa, setPrintingSiswa] = useState<Siswa | null>(null);

  // Modals
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isAddSiswaModalOpen, setIsAddSiswaModalOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // New Student fields
  const [newNis, setNewNis] = useState("");
  const [newNama, setNewNama] = useState("");
  const [newKelas, setNewKelas] = useState("XII IPA 1");
  const [newPoin, setNewPoin] = useState("100");
  const [addSiswaError, setAddSiswaError] = useState("");

  // Import fields
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState("");

  // Toast feedback
  const [toastMessage, setToastMessage] = useState("");
  const [siswaToDelete, setSiswaToDelete] = useState<{ id: string; nama: string } | null>(null);

  useEffect(() => {
    async function load() {
      setSiswaList(await getSiswaList());
    }
    load();
  }, []);

  const syncSiswa = async () => {
    const list = await getSiswaList();
    setSiswaList(list);
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(""), 4000);
  };

  const reloadData = () => {
    syncSiswa();
    showToast("Data disinkronkan.");
    onRefreshHistory();
  };

  // Get unique classes list
  const classes = ["Semua", ...Array.from(new Set(siswaList.map((s) => s.kelas)))];

  // Filter students
  const filteredSiswa = siswaList.filter((s) => {
    const matchesSearch =
      s.nama.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.nis.includes(searchQuery);
    const matchesClass = selectedKelas === "Semua" || s.kelas === selectedKelas;
    return matchesSearch && matchesClass;
  });

  // Selection Checkboxes
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

  // Add Student
  const handleAddSiswa = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddSiswaError("");

    if (!newNis || !newNama || !newKelas) {
      setAddSiswaError("Semua bidang harus diisi.");
      return;
    }

    try {
      const { data: existing } = await supabase
        .from("siswa")
        .select("nis")
        .eq("nis", newNis)
        .maybeSingle();

      if (existing) {
        setAddSiswaError("NIS sudah terdaftar.");
        return;
      }

      const { error } = await supabase.from("siswa").insert({
        nis: newNis,
        nama: newNama,
        kelas: newKelas,
        total_poin: parseInt(newPoin, 10) || 100,
      });

      if (error) throw error;

      await syncSiswa();

      // Reset Form
      setNewNis("");
      setNewNama("");
      setNewKelas("XII IPA 1");
      setNewPoin("100");
      setIsAddSiswaModalOpen(false);
      showToast(`Siswa "${newNama}" berhasil ditambahkan.`);
    } catch (err: any) {
      setAddSiswaError("Gagal menambahkan siswa: " + err.message);
    }
  };

  // Delete Student
  const handleDeleteSiswa = (id: string, nama: string) => {
    setSiswaToDelete({ id, nama });
  };

  const executeDeleteSiswa = async (id: string, nama: string) => {
    try {
      const { error } = await supabase
        .from("siswa")
        .delete()
        .eq("id", id);

      if (error) throw error;

      await syncSiswa();
      setSelectedSiswaIds(selectedSiswaIds.filter(item => item !== id));
      showToast(`Siswa "${nama}" telah dihapus.`);
    } catch (err: any) {
      alert("Gagal menghapus siswa: " + err.message);
    }
  };

  // Download Excel Template for imports
  const downloadExcelTemplate = () => {
    try {
      const data = [
        ["NIS", "Nama Siswa", "Kelas", "Skor Poin"],
        ["19001", "Ahmad Fauzi", "XII IPA 1", 100],
        ["19002", "Siti Aminah", "XII IPA 2", 120],
        ["19003", "Rian Hidayat", "XII IPS 1", 95],
        ["19004", "Dewi Sartika", "XII IPS 2", 100]
      ];
      
      const worksheet = XLSX.utils.aoa_to_sheet(data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Template Siswa SMAN 19");
      
      // Auto fit columns optionally
      worksheet["!cols"] = [
        { wch: 12 }, // NIS
        { wch: 25 }, // Nama Siswa
        { wch: 15 }, // Kelas
        { wch: 12 }  // Skor Poin
      ];

      XLSX.writeFile(workbook, "TEMPLATE_IMPORT_SISWA_SMAN19.xlsx");
      showToast("Template Excel berhasil diunduh!");
    } catch (err: any) {
      console.error(err);
      alert("Gagal mengunduh template: " + err.message);
    }
  };

  // Import Actual Excel File / CSV
  const handleExcelImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    setImportError("");
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const workbook = XLSX.read(bstr, { type: "binary" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        // Convert to array of arrays
        const rows = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1 });
        
        if (rows.length < 2) {
          setImportError("File Excel kosong atau tidak memiliki baris data.");
          return;
        }

        const currentList = await getSiswaList();
        let addedCount = 0;
        let duplicateCount = 0;
        const newSiswaToInsert: any[] = [];

        // Start from index 1 (skip header row)
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          if (!row || row.length === 0) continue;

          const nis = String(row[0] || "").trim();
          const nama = String(row[1] || "").trim();
          const kelas = String(row[2] || "").trim();
          const pointsRaw = row[3];
          const poinVal = pointsRaw !== undefined ? parseInt(String(pointsRaw).trim(), 10) : 100;
          const total_poin = isNaN(poinVal) ? 100 : poinVal;

          if (!nis || !nama || !kelas) continue;

          // Check for duplicate NIS
          if (currentList.some((s) => s.nis === nis) || newSiswaToInsert.some((s) => s.nis === nis)) {
            duplicateCount++;
            continue;
          }

          newSiswaToInsert.push({
            nis,
            nama,
            kelas,
            total_poin,
          });
          addedCount++;
        }

        if (newSiswaToInsert.length > 0) {
          const { error } = await supabase.from("siswa").insert(newSiswaToInsert);
          if (error) throw error;

          await syncSiswa();
          setIsImportModalOpen(false);
          // clear input
          e.target.value = "";
          showToast(`Sukses mengimpor ${addedCount} siswa baru dari file Excel!${duplicateCount > 0 ? ` (${duplicateCount} NIS duplikat dilewati).` : ""}`);
        } else {
          setImportError("Tidak ada baris data baru yang valid untuk diimpor. Pastikan NIS unik.");
        }
      } catch (err: any) {
        console.error(err);
        setImportError("Gagal membaca file Excel: " + err.message);
      }
    };

    reader.onerror = () => {
      setImportError("Gagal membaca file.");
    };

    reader.readAsBinaryString(file);
  };

  // Import CSV text fallback
  const handleImportCSV = async (e: React.FormEvent) => {
    e.preventDefault();
    setImportError("");

    if (!importText.trim()) {
      setImportError("Masukkan teks CSV terlebih dahulu.");
      return;
    }

    const lines = importText.split("\n");
    const currentList = await getSiswaList();
    let addedCount = 0;
    let duplicateCount = 0;
    const newSiswaToInsert: any[] = [];

    for (let line of lines) {
      const row = line.trim();
      if (!row) continue;

      const parts = row.split(/[,;\t]/);
      if (parts.length < 3) continue;

      const nis = parts[0].trim();
      const nama = parts[1].trim();
      const kelas = parts[2].trim();
      const poin = parts[3] ? parseInt(parts[3].trim(), 10) : 100;

      if (!nis || !nama || !kelas) continue;

      if (currentList.some((s) => s.nis === nis) || newSiswaToInsert.some((s) => s.nis === nis)) {
        duplicateCount++;
        continue;
      }

      newSiswaToInsert.push({
        nis,
        nama,
        kelas,
        total_poin: isNaN(poin) ? 100 : poin,
      });
      addedCount++;
    }

    try {
      if (newSiswaToInsert.length > 0) {
        const { error } = await supabase.from("siswa").insert(newSiswaToInsert);
        if (error) throw error;

        await syncSiswa();
        setIsImportModalOpen(false);
        setImportText("");
        showToast(`Sukses mengimpor ${addedCount} siswa baru.${duplicateCount > 0 ? ` (${duplicateCount} NIS duplikat dilewati).` : ""}`);
      } else {
        setImportError("Tidak ada baris data valid yang diimpor. Format harus: NIS,Nama,Kelas,PoinAwal");
      }
    } catch (err: any) {
      setImportError("Gagal mengimpor CSV: " + err.message);
    }
  };

  // Download individual student card as high-res PNG image
  const handleDownloadSingleCard = async (siswa: Siswa) => {
    showToast(`Menyiapkan Kartu QR untuk ${siswa.nama}...`);
    setPrintingSiswa(siswa);
    
    // Give state a tick to update the DOM
    setTimeout(async () => {
      const cardElement = document.getElementById(`card-render-hidden-${siswa.id}`);
      if (cardElement) {
        try {
          const canvas = await html2canvas(cardElement, {
            scale: 3, // High quality 3x resolution
            useCORS: true,
            backgroundColor: null
          });
          const imgData = canvas.toDataURL("image/png");
          const link = document.createElement("a");
          link.download = `KARTU_PELAJAR_SMAN19_${siswa.nama.toUpperCase().replace(/\s+/g, "_")}.png`;
          link.href = imgData;
          link.click();
          showToast(`Kartu ${siswa.nama} sukses diunduh!`);
        } catch (error) {
          console.error("Gagal merender kartu:", error);
          alert("Gagal mengunduh kartu. Silakan coba lagi.");
        } finally {
          setPrintingSiswa(null);
        }
      }
    }, 150);
  };

  // Export Cards in bulk as JPG images sequentially
  const exportToJPG = async () => {
    const targets = selectedSiswaIds.length > 0 ? selectedSiswaIds : filteredSiswa.map(s => s.id);
    if (targets.length === 0) {
      alert("Pilih siswa terlebih dahulu untuk dicetak kartunya.");
      return;
    }

    setIsExporting(true);
    showToast(`Mengekspor ${targets.length} Kartu Pelajar ke JPG...`);

    try {
      for (let i = 0; i < targets.length; i++) {
        const studentId = targets[i];
        const studentObj = siswaList.find(s => s.id === studentId);
        if (!studentObj) continue;

        const cardElement = document.getElementById(`card-render-bulk-${studentId}`);
        if (cardElement) {
          const canvas = await html2canvas(cardElement, {
            scale: 3, // Premium ultra crisp 3x resolution
            useCORS: true,
            backgroundColor: "#0b0c10"
          });
          const imgData = canvas.toDataURL("image/jpeg", 0.95);
          const link = document.createElement("a");
          link.download = `KARTU_PELAJAR_SMAN19_${studentObj.nama.toUpperCase().replace(/\s+/g, "_")}.jpg`;
          link.href = imgData;
          link.click();
          
          // Slight delay between downloads to prevent browser blocking
          if (targets.length > 1) {
            await new Promise((resolve) => setTimeout(resolve, 250));
          }
        }
      }
      showToast("Ekspor semua kartu pelajar selesai!");
    } catch (error) {
      console.error("Export to JPG failed", error);
      alert("Gagal mengekspor kartu ke JPG. Silakan coba lagi.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 bg-slate-900 text-white px-5 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-bounce border border-slate-700">
          <Sparkles className="w-5 h-5 text-accent-400" />
          <span className="text-sm font-medium">{toastMessage}</span>
        </div>
      )}

      {/* Main Header & Description */}
      <div className="bg-white rounded-3xl p-6 border border-brand-100 shadow-xl shadow-brand-900/5 flex flex-col md:flex-row md:items-center justify-between gap-5">
        <div>
          <h2 className="text-2xl font-black text-brand-950 flex items-center gap-2.5">
            <Users className="w-7 h-7 text-brand-600" />
            Data Siswa & Kartu
          </h2>
          <p className="text-xs sm:text-sm font-medium text-brand-500 mt-1 leading-relaxed">
            Kelola data siswa dan cetak kartu pelajar ber-QR Code.
          </p>
        </div>
      </div>

      {/* SEARCH & CONTROLS BAR */}
      <div className="bg-white p-5 rounded-3xl border border-brand-100 shadow-xl shadow-brand-900/5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        
        {/* Left Search Controls */}
        <div className="flex flex-wrap items-center gap-3.5 flex-1">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-brand-500/50 w-5 h-5" />
            <input
              type="text"
              placeholder="Cari nama atau NIS..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-11 pr-4 py-3 bg-brand-50/20 rounded-2xl border border-brand-100 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white transition-all text-brand-950 placeholder-brand-500/30"
            />
          </div>

          {/* Class Filter */}
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-brand-500/50">
              <Filter className="w-4 h-4" />
            </span>
            <select
              value={selectedKelas}
              onChange={(e) => {
                setSelectedKelas(e.target.value);
                setSelectedSiswaIds([]); 
              }}
              className="pl-10 pr-9 py-3 bg-brand-50/20 border border-brand-100 rounded-2xl text-xs font-bold text-brand-800 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white appearance-none cursor-pointer"
            >
              {classes.map((cls) => (
                <option key={cls} value={cls}>
                  {cls === "Semua" ? "Semua Kelas" : `Kelas ${cls}`}
                </option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-brand-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          <button
            onClick={reloadData}
            title="Refresh"
            className="p-3 bg-brand-50 text-brand-600 rounded-2xl hover:bg-brand-100 border border-brand-100/50 transition-colors cursor-pointer"
          >
            <RefreshCw className="w-4.5 h-4.5" />
          </button>
        </div>

        {/* Right Actions Bar */}
        <div className="flex flex-wrap items-center gap-2.5">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setIsAddSiswaModalOpen(true)}
            className="flex items-center gap-2 px-5 py-3 brand-gradient text-white rounded-2xl text-sm font-black transition-all shadow-md cursor-pointer"
          >
            <UserPlus className="w-4.5 h-4.5" />
            Siswa Baru
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setIsImportModalOpen(true)}
            className="flex items-center gap-2 px-5 py-3 bg-brand-50 hover:bg-brand-100 text-brand-700 border border-brand-100 rounded-2xl text-sm font-black transition-all cursor-pointer shadow-xs"
          >
            <FileSpreadsheet className="w-4.5 h-4.5 text-brand-600" />
            Impor Excel
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            disabled={isExporting}
            onClick={exportToJPG}
            className="flex items-center gap-2 px-5 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-sm font-black transition-all shadow-md cursor-pointer disabled:opacity-55"
          >
            <Printer className="w-4.5 h-4.5" />
            {isExporting ? "Memproses PDF..." : `Cetak ${selectedSiswaIds.length > 0 ? `Terpilih (${selectedSiswaIds.length})` : "Semua"} (PDF)`}
          </motion.button>
        </div>
      </div>

      {/* VIEW RENDER AREAS */}
      <AnimatePresence mode="wait">
        <motion.div
          key="table-view"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="bg-white rounded-3xl border border-brand-100 shadow-xl shadow-brand-900/5 overflow-hidden"
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-brand-50/50 border-b border-brand-100/70 text-brand-500 text-xs font-black uppercase tracking-wider">
                  <th className="py-4 px-6 w-12 text-center">
                    <input
                      type="checkbox"
                      checked={
                        filteredSiswa.length > 0 &&
                        filteredSiswa.every((s) => selectedSiswaIds.includes(s.id))
                      }
                      onChange={handleSelectAll}
                      className="w-4 h-4 rounded-lg border-brand-200 text-brand-600 focus:ring-brand-500 cursor-pointer"
                    />
                  </th>
                  <th className="py-4 px-4 font-mono">NIS</th>
                  <th className="py-4 px-6">Nama Lengkap</th>
                  <th className="py-4 px-6">Kelas</th>
                  <th className="py-4 px-6 text-center">Skor Poin</th>
                  <th className="py-4 px-6 text-center">Status</th>
                  <th className="py-4 px-6 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-100/40">
                {filteredSiswa.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-slate-400 text-xs font-bold">
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
                        className={`hover:bg-brand-50/20 transition-colors ${
                          isSelected ? "bg-brand-50/40" : ""
                        }`}
                      >
                        <td className="py-4 px-6 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleSelectSiswa(siswa.id)}
                            className="w-4 h-4 rounded-lg border-brand-200 text-brand-600 focus:ring-brand-500 cursor-pointer"
                          />
                        </td>
                        <td className="py-4 px-4 font-mono font-bold text-sm text-brand-900">{siswa.nis}</td>
                        <td className="py-4 px-6">
                          <div className="font-extrabold text-sm text-brand-950">{siswa.nama}</div>
                        </td>
                        <td className="py-4 px-6 text-sm font-semibold text-brand-800">{siswa.kelas}</td>
                        <td className="py-4 px-6 text-center font-mono font-black text-sm">
                          <span className={siswa.total_poin >= 100 ? "text-emerald-600" : siswa.total_poin >= 50 ? "text-amber-500" : "text-rose-500"}>
                            {siswa.total_poin} pts
                          </span>
                        </td>
                        <td className="py-4 px-6 text-center">
                          {isSafe ? (
                            <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider border border-emerald-200 shadow-xs">
                              <Check className="w-3 h-3" /> AMAN
                            </span>
                          ) : isWarning ? (
                            <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider border border-amber-200 shadow-xs">
                              <ShieldAlert className="w-3 h-3" /> WASPADA
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 bg-rose-50 text-rose-700 px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider border border-rose-200 shadow-xs">
                              <ShieldAlert className="w-3 h-3" /> SANKSI
                            </span>
                          )}
                        </td>
                        <td className="py-4 px-6 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => handleDownloadSingleCard(siswa)}
                              className="p-2 hover:bg-brand-50 text-brand-600 hover:text-brand-800 rounded-xl transition-all cursor-pointer"
                              title="Unduh Kartu (PNG)"
                            >
                              <CreditCard className="w-4 h-4 text-brand-600" />
                            </button>
                            <button
                              onClick={() => handleDeleteSiswa(siswa.id, siswa.nama)}
                              className="p-2 hover:bg-rose-50 text-rose-500 hover:text-rose-700 rounded-xl transition-all cursor-pointer"
                              title="Hapus Siswa"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          
          {/* Table Footer info */}
          <div className="bg-brand-50/30 p-4 border-t border-brand-100 text-[10px] text-brand-500 font-bold flex items-center justify-between">
            <span>Menampilkan {filteredSiswa.length} dari {siswaList.length} siswa</span>
            {selectedSiswaIds.length > 0 && (
              <span className="text-brand-600 font-extrabold">{selectedSiswaIds.length} siswa terpilih</span>
            )}
          </div>
        </motion.div>
      </AnimatePresence>

      {/* CONFIRM DELETE MODAL */}
      <ConfirmationModal
        isOpen={!!siswaToDelete}
        onClose={() => setSiswaToDelete(null)}
        onConfirm={() => {
          if (siswaToDelete) {
            executeDeleteSiswa(siswaToDelete.id, siswaToDelete.nama);
            setSiswaToDelete(null);
          }
        }}
        title="Hapus Data Siswa?"
        message={`Apakah Anda yakin ingin menghapus data "${siswaToDelete?.nama}" secara permanen? Semua riwayat absensi & sanksi miliknya akan ikut terhapus.`}
        confirmText="Ya, Hapus"
        cancelText="Batal"
        type="danger"
      />

      {/* ADD STUDENT MODAL */}
      <AnimatePresence>
        {isAddSiswaModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-950/60 backdrop-blur-xs p-4">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl shadow-2xl border border-brand-150 p-6 max-w-md w-full space-y-5"
            >
              <div className="flex justify-between items-center">
                <h4 className="text-lg font-black text-brand-950">Tambah Siswa Baru SMAN 19</h4>
                <button
                  onClick={() => setIsAddSiswaModalOpen(false)}
                  className="p-2 hover:bg-brand-50 text-brand-400 hover:text-brand-700 rounded-xl transition-all cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {addSiswaError && (
                <div className="p-3 bg-rose-50 text-rose-800 text-xs font-semibold rounded-xl border border-rose-200">
                  {addSiswaError}
                </div>
              )}

              <form onSubmit={handleAddSiswa} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-brand-400 uppercase tracking-wider block">Nomor Induk Siswa (NIS)</label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: 19024"
                    value={newNis}
                    onChange={(e) => setNewNis(e.target.value)}
                    className="w-full border border-brand-100 rounded-xl p-3 text-xs font-bold text-brand-900 focus:ring-2 focus:ring-brand-500 outline-none bg-brand-50/10"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-brand-400 uppercase tracking-wider block">Nama Lengkap Siswa</label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: Budi Setiadi"
                    value={newNama}
                    onChange={(e) => setNewNama(e.target.value)}
                    className="w-full border border-brand-100 rounded-xl p-3 text-xs font-bold text-brand-900 focus:ring-2 focus:ring-brand-500 outline-none bg-brand-50/10"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-brand-400 uppercase tracking-wider block">Kelas</label>
                    <input
                      type="text"
                      required
                      placeholder="XII IPA 1"
                      value={newKelas}
                      onChange={(e) => setNewKelas(e.target.value)}
                      className="w-full border border-brand-100 rounded-xl p-3 text-xs font-bold text-brand-900 focus:ring-2 focus:ring-brand-500 outline-none bg-brand-50/10"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-brand-400 uppercase tracking-wider block">Skor Awal Poin</label>
                    <input
                      type="number"
                      required
                      placeholder="100"
                      value={newPoin}
                      onChange={(e) => setNewPoin(e.target.value)}
                      className="w-full border border-brand-100 rounded-xl p-3 text-xs font-bold text-brand-900 focus:ring-2 focus:ring-brand-500 outline-none bg-brand-50/10"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full py-3.5 mt-2 brand-gradient text-white text-xs font-black rounded-xl shadow-lg shadow-brand-500/20 cursor-pointer"
                >
                  Simpan
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* IMPORT EXCEL & CSV MODAL */}
      <AnimatePresence>
        {isImportModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-950/60 backdrop-blur-xs p-4">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl shadow-2xl border border-brand-150 p-6 max-w-lg w-full space-y-5"
            >
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5 text-brand-600" />
                  <h4 className="text-base font-black text-brand-950">Impor Data Siswa</h4>
                </div>
                <button
                  onClick={() => setIsImportModalOpen(false)}
                  className="p-2 hover:bg-brand-50 text-brand-400 hover:text-brand-700 rounded-xl transition-all cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {importError && (
                <div className="p-3 bg-rose-50 text-rose-800 text-xs font-semibold rounded-xl border border-rose-200">
                  {importError}
                </div>
              )}

              {/* Template Download Section */}
              <div className="flex justify-between items-center bg-brand-50 p-3.5 rounded-2xl border border-brand-100">
                <div className="text-left">
                  <p className="text-xs font-black text-brand-950">Belum punya formatnya?</p>
                  <p className="text-[10px] text-brand-500 font-semibold leading-none mt-1">Gunakan template resmi SMAN 19 Bandung.</p>
                </div>
                <button
                  type="button"
                  onClick={downloadExcelTemplate}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-white text-brand-700 hover:text-brand-900 border border-brand-200 hover:border-brand-300 rounded-xl text-[10px] font-black shadow-xs transition-all cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  Unduh Template
                </button>
              </div>

              {/* Excel Upload Zone */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-brand-400 uppercase tracking-wider block">Unggah Berkas Excel (.xlsx, .xls, .csv)</label>
                <div className="border-2 border-dashed border-brand-200 hover:border-brand-400 rounded-2xl p-6 text-center cursor-pointer bg-brand-50/10 hover:bg-brand-50/20 transition-all relative">
                  <input
                    type="file"
                    accept=".xlsx, .xls, .csv"
                    onChange={handleExcelImport}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <FileSpreadsheet className="w-8 h-8 text-brand-500 mx-auto mb-2" />
                  <p className="text-xs font-bold text-brand-950">Pilih atau Seret File Excel</p>
                  <p className="text-[10px] text-brand-400 font-medium mt-1">Sistem akan otomatis mendeteksi kolom NIS, Nama, Kelas, dan Poin.</p>
                </div>
              </div>

              {/* Fallback Copy-Paste Area (Accordion style) */}
              <details className="group border border-brand-100 rounded-2xl p-1 bg-brand-50/20">
                <summary className="text-[11px] font-bold text-brand-600 hover:text-brand-900 p-2 cursor-pointer select-none flex items-center justify-between list-none">
                  <span>Atau gunakan alternatif salin-tempel teks (CSV)...</span>
                  <ChevronDown className="w-3.5 h-3.5 transform group-open:rotate-180 transition-transform" />
                </summary>
                
                <div className="p-3 space-y-3 pt-1">
                  <div className="text-[10px] text-brand-500 font-medium">
                    Ketik langsung atau tempel baris-baris data Anda dengan format:
                    <code className="block p-2 bg-slate-900 text-slate-100 rounded-lg text-[10px] font-mono font-bold select-all mt-1.5">
                      NIS,NamaSiswa,Kelas,SkorPoin<br />
                      19013,Cahya Lestari,XII IPS 1,120
                    </code>
                  </div>
                  
                  <form onSubmit={handleImportCSV} className="space-y-3">
                    <textarea
                      rows={4}
                      placeholder="Contoh: 19025,Amir Hamzah,XII IPA 2,100"
                      value={importText}
                      onChange={(e) => setImportText(e.target.value)}
                      className="w-full border border-brand-100 rounded-xl p-3 text-[11px] font-mono font-semibold text-brand-900 focus:ring-2 focus:ring-brand-500 outline-none bg-white placeholder-brand-300"
                    ></textarea>

                    <button
                      type="submit"
                      className="w-full py-2.5 bg-brand-600 hover:bg-brand-700 text-white text-xs font-black rounded-xl transition-all cursor-pointer"
                    >
                      Proses Impor Teks
                    </button>
                  </form>
                </div>
              </details>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* OFF-SCREEN CARD RENDERERS (Hidden from view, used purely by html2canvas for PDF and PNG downloads) */}
      <div className="absolute top-[-9999px] left-[-9999px] pointer-events-none overflow-hidden">
        {/* Hidden area for bulk printing targets */}
        {siswaList.map((siswa) => (
          <div 
            key={`bulk-render-${siswa.id}`}
            id={`card-render-bulk-${siswa.id}`}
            className="w-[360px] h-[220px] bg-gradient-to-br from-brand-900 via-brand-850 to-brand-900 text-white rounded-2xl p-4.5 relative overflow-hidden flex flex-col justify-between shadow-2xl border border-brand-950/20 flex-shrink-0"
            style={{ fontFamily: "'Space Grotesk', 'Inter', sans-serif" }}
          >
            <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-transparent pointer-events-none" />
            
            {/* Top Header */}
            <div className="flex items-center justify-between relative z-10 border-b border-white/10 pb-2">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 bg-white/10 rounded-lg flex items-center justify-center border border-white/20">
                  <School className="w-4 h-4 text-accent-400" />
                </div>
                <div>
                  <h4 className="text-[10px] font-black tracking-widest text-white uppercase font-sans">SMAN 19 BANDUNG</h4>
                  <p className="text-[7px] text-brand-200/80 font-medium">Jl. Gatot Subroto No. 64, Bandung</p>
                </div>
              </div>
              <span className="font-sans font-black text-[7px] bg-accent-500/80 text-white px-2 py-0.5 rounded-full tracking-wider uppercase border border-accent-400">
                Pelajar
              </span>
            </div>

            {/* Middle Data Rows */}
            <div className="flex justify-between items-center relative z-10 mt-2 flex-1">
              <div className="space-y-1.5">
                <div>
                  <p className="text-[7px] text-brand-300 font-bold uppercase tracking-wider">Nama Lengkap</p>
                  <p className="text-xs font-black text-white tracking-wide truncate max-w-[190px]">{siswa.nama}</p>
                </div>
                <div className="flex gap-4">
                  <div>
                    <p className="text-[7px] text-brand-300 font-bold uppercase tracking-wider">NIS</p>
                    <p className="text-[10px] font-mono font-bold text-white">{siswa.nis}</p>
                  </div>
                  <div>
                    <p className="text-[7px] text-brand-300 font-bold uppercase tracking-wider">Kelas</p>
                    <p className="text-[10px] font-bold text-white">{siswa.kelas}</p>
                  </div>
                </div>
              </div>

              {/* HIGH CONTRAST QR CODE */}
              <div className="bg-white p-2 rounded-xl flex items-center justify-center shadow-md border border-white/10">
                <QRCodeSVG 
                  value={siswa.nis} 
                  size={70} 
                  level="M" 
                  includeMargin={false}
                />
              </div>
            </div>

            {/* Footer Badge decoration */}
            <div className="flex justify-between items-center relative z-10 border-t border-white/10 pt-2 text-[6px] font-semibold text-brand-200/60 font-sans">
              <span>KARTU INTEGRASI KARAKTER SMAN 19</span>
              <span className="font-black text-accent-400 font-sans tracking-widest uppercase">19 POINTS</span>
            </div>
          </div>
        ))}

        {/* Hidden area for single student printing target */}
        {printingSiswa && (
          <div 
            id={`card-render-hidden-${printingSiswa.id}`}
            className="w-[360px] h-[220px] bg-gradient-to-br from-brand-900 via-brand-850 to-brand-900 text-white rounded-2xl p-4.5 relative overflow-hidden flex flex-col justify-between shadow-2xl border border-brand-950/20 flex-shrink-0"
            style={{ fontFamily: "'Space Grotesk', 'Inter', sans-serif" }}
          >
            <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-transparent pointer-events-none" />
            
            {/* Top Header */}
            <div className="flex items-center justify-between relative z-10 border-b border-white/10 pb-2">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 bg-white/10 rounded-lg flex items-center justify-center border border-white/20">
                  <School className="w-4 h-4 text-accent-400" />
                </div>
                <div>
                  <h4 className="text-[10px] font-black tracking-widest text-white uppercase font-sans">SMAN 19 BANDUNG</h4>
                  <p className="text-[7px] text-brand-200/80 font-medium">Jl. Gatot Subroto No. 64, Bandung</p>
                </div>
              </div>
              <span className="font-sans font-black text-[7px] bg-accent-500/80 text-white px-2 py-0.5 rounded-full tracking-wider uppercase border border-accent-400">
                Pelajar
              </span>
            </div>

            {/* Middle Data Rows */}
            <div className="flex justify-between items-center relative z-10 mt-2 flex-1">
              <div className="space-y-1.5">
                <div>
                  <p className="text-[7px] text-brand-300 font-bold uppercase tracking-wider">Nama Lengkap</p>
                  <p className="text-xs font-black text-white tracking-wide truncate max-w-[190px]">{printingSiswa.nama}</p>
                </div>
                <div className="flex gap-4">
                  <div>
                    <p className="text-[7px] text-brand-300 font-bold uppercase tracking-wider">NIS</p>
                    <p className="text-[10px] font-mono font-bold text-white">{printingSiswa.nis}</p>
                  </div>
                  <div>
                    <p className="text-[7px] text-brand-300 font-bold uppercase tracking-wider">Kelas</p>
                    <p className="text-[10px] font-bold text-white">{printingSiswa.kelas}</p>
                  </div>
                </div>
              </div>

              {/* HIGH CONTRAST QR CODE */}
              <div className="bg-white p-2 rounded-xl flex items-center justify-center shadow-md border border-white/10">
                <QRCodeSVG 
                  value={printingSiswa.nis} 
                  size={70} 
                  level="M" 
                  includeMargin={false}
                />
              </div>
            </div>

            {/* Footer Badge decoration */}
            <div className="flex justify-between items-center relative z-10 border-t border-white/10 pt-2 text-[6px] font-semibold text-brand-200/60 font-sans">
              <span>KARTU INTEGRASI KARAKTER SMAN 19</span>
              <span className="font-black text-accent-400 font-sans tracking-widest uppercase">19 POINTS</span>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
