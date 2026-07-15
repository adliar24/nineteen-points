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
import { supabase, supabaseAdminAuth } from "../supabaseClient";

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
  const [addSiswaError, setAddSiswaError] = useState("");

  // Import fields
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState("");

  // Toast feedback
  const [toastMessage, setToastMessage] = useState("");
  const [siswaToDelete, setSiswaToDelete] = useState<{ id: string; nama: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      try {
        setSiswaList(await getSiswaList());
      } catch (err) {
        console.error("Gagal memuat siswa:", err);
      }
      setIsLoading(false);
    }
    load();
  }, []);

  const syncSiswa = async () => {
    setIsLoading(true);
    try {
      const list = await getSiswaList();
      setSiswaList(list);
    } catch (err) {
      console.error("Gagal sinkronisasi siswa:", err);
    }
    setIsLoading(false);
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
        total_poin: 0,
      });

      if (error) throw error;

      // Automatically create user auth account
      let authCreated = true;
      try {
        const { error: signUpError } = await supabaseAdminAuth.auth.signUp({
          email: `${newNis}@sman19.sch.id`,
          password: "siswa19",
          options: {
            data: {
              fullName: newNama,
              role: "siswa",
              nis: newNis
            }
          }
        });
        if (signUpError) throw signUpError;
      } catch (authErr: any) {
        console.error("Gagal mendaftarkan akun login siswa:", authErr);
        authCreated = false;
      }

      await syncSiswa();

      // Reset Form
      setNewNis("");
      setNewNama("");
      setNewKelas("XII IPA 1");
      setIsAddSiswaModalOpen(false);
      
      if (authCreated) {
        showToast(`Siswa "${newNama}" & akun login berhasil dibuat.`);
      } else {
        showToast(`Siswa "${newNama}" disimpan (gagal membuat akun login).`);
      }
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

          // Automatically create auth accounts for all imported students
          let authFailedCount = 0;
          for (const s of newSiswaToInsert) {
            try {
              const { error: signUpError } = await supabaseAdminAuth.auth.signUp({
                email: `${s.nis}@sman19.sch.id`,
                password: "siswa19",
                options: {
                  data: {
                    fullName: s.nama,
                    role: "siswa",
                    nis: s.nis
                  }
                }
              });
              if (signUpError) throw signUpError;
            } catch (authErr) {
              console.error(`Gagal membuat akun auth untuk siswa NIS ${s.nis}:`, authErr);
              authFailedCount++;
            }
          }

          await syncSiswa();
          setIsImportModalOpen(false);
          // clear input
          e.target.value = "";
          
          if (authFailedCount === 0) {
            showToast(`Sukses mengimpor ${addedCount} siswa & akun login mereka!${duplicateCount > 0 ? ` (${duplicateCount} NIS duplikat dilewati).` : ""}`);
          } else {
            showToast(`Sukses mengimpor ${addedCount} siswa (${addedCount - authFailedCount} akun berhasil, ${authFailedCount} gagal).`);
          }
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
            backgroundColor: "#ffffff"
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


      <h2 className="text-xl font-extrabold text-brand-950 tracking-tight">Data Siswa & Kartu</h2>

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
        {userSession.role !== "guru" && (
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
        )}
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
                  {userSession.role !== "guru" && (
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
                  )}
                  <th className="py-4 px-4 font-mono">NIS</th>
                  <th className="py-4 px-6">Nama Lengkap</th>
                  <th className="py-4 px-6">Kelas</th>
                  <th className="py-4 px-6 text-center">Skor Poin</th>
                  <th className="py-4 px-6 text-center">Status</th>
                  <th className="py-4 px-6 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-100/40">
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, idx) => (
                    <tr key={idx} className="animate-pulse">
                      {userSession.role !== "guru" && (
                        <td className="py-4 px-6 text-center">
                          <div className="h-4 w-4 bg-slate-200 rounded mx-auto" />
                        </td>
                      )}
                      <td className="py-4 px-4"><div className="h-4 w-20 bg-slate-200 rounded" /></td>
                      <td className="py-4 px-6"><div className="h-4 w-44 bg-slate-200 rounded" /></td>
                      <td className="py-4 px-6"><div className="h-4 w-16 bg-slate-200 rounded" /></td>
                      <td className="py-4 px-6 text-center"><div className="h-4 w-12 bg-slate-200 rounded mx-auto" /></td>
                      <td className="py-4 px-6 text-center"><div className="h-4.5 w-18 bg-slate-200 rounded-full mx-auto" /></td>
                      <td className="py-4 px-6 text-right"><div className="h-4.5 w-24 bg-slate-200 rounded-xl ml-auto" /></td>
                    </tr>
                  ))
                ) : filteredSiswa.length === 0 ? (
                  <tr>
                    <td colSpan={userSession.role === "guru" ? 6 : 7} className="text-center py-12 text-slate-400 text-xs font-bold">
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
                        {userSession.role !== "guru" && (
                          <td className="py-4 px-6 text-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleSelectSiswa(siswa.id)}
                              className="w-4 h-4 rounded-lg border-brand-200 text-brand-600 focus:ring-brand-500 cursor-pointer"
                            />
                          </td>
                        )}
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
                            {userSession.role !== "guru" && (
                              <button
                                onClick={() => handleDeleteSiswa(siswa.id, siswa.nama)}
                                className="p-2 hover:bg-rose-50 text-rose-500 hover:text-rose-700 rounded-xl transition-all cursor-pointer"
                                title="Hapus Siswa"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
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
            {userSession.role !== "guru" && selectedSiswaIds.length > 0 && (
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
        {/* Hidden area for bulk printing targets - Rendered dynamically only during export */}
        {isExporting && (selectedSiswaIds.length > 0 ? selectedSiswaIds : filteredSiswa.map(s => s.id)).map((studentId) => {
          const siswa = siswaList.find(s => s.id === studentId);
          if (!siswa) return null;
          return (
            <div 
              key={`bulk-render-${siswa.id}`}
              id={`card-render-bulk-${siswa.id}`}
              className="w-[290px] h-[458px] rounded-none bg-white text-brand-950 border border-brand-200 relative overflow-hidden flex flex-col items-center justify-between py-8 px-5 shadow-2xl shadow-brand-950/10 flex-shrink-0"
              style={{ width: "290px", height: "458px", fontFamily: "'Poppins', 'Space Grotesk', 'Inter', sans-serif" }}
            >
              {/* TOP WAVE DECORATION (SVG) */}
              <svg className="absolute top-0 inset-x-0 w-full h-32 pointer-events-none" viewBox="0 0 290 128" fill="none" preserveAspectRatio="none">
                {/* Back Translucent Wave */}
                <path d="M0 0H290V92C210 128 160 85 110 112C60 138 30 115 0 120Z" fill="#7c3aed" opacity="0.2" />
                {/* Front Main Wave (Sidebar Purple color #4c1d95) */}
                <path d="M0 0H290V80C210 112 165 72 115 100C65 128 35 102 0 108Z" fill="#4c1d95" />
              </svg>

              {/* Top Left School Branding */}
              <div className="absolute top-4.5 left-5 flex items-center gap-2 z-10 text-white pointer-events-none">
                <img src="/logo.png" className="w-6.5 h-6.5 object-contain" alt="Logo" />
                <div>
                  <h4 className="text-[8px] font-black tracking-widest text-white uppercase leading-tight">SMAN 19 BANDUNG</h4>
                  <p className="text-[6px] text-brand-200 font-bold uppercase tracking-wider font-mono">Student Card</p>
                </div>
              </div>

              {/* CARD CONTENT LAYER */}
              <div className="relative z-10 w-full flex-1 flex flex-col justify-between items-center pt-11 pb-1">
                
                {/* 1. 3x4 Portrait Avatar (Pas Foto Style) */}
                <div className="w-21 h-28 rounded-2xl border-[3px] border-pink-500 bg-white flex items-center justify-center p-[2.5px] shadow-md shadow-pink-500/10 flex-shrink-0">
                  <div className="w-full h-full rounded-xl border border-pink-100 bg-rose-50/50 flex items-center justify-center text-pink-600 font-black text-3xl uppercase tracking-wider">
                    {siswa.nama.slice(0, 2)}
                  </div>
                </div>

                {/* 2. Student Info */}
                <div className="text-center space-y-1 mt-3">
                  <h3 className="text-sm font-black tracking-tight text-[#1e1b4b] px-2 line-clamp-1 leading-snug">
                    {siswa.nama}
                  </h3>
                  <p className="text-[9px] text-[#7c3aed] font-extrabold uppercase tracking-widest">
                    NIS: {siswa.nis} &bull; KELAS: {siswa.kelas}
                  </p>
                </div>

                {/* 3. High quality QR code */}
                <div className="mt-4 flex flex-col items-center">
                  <div className="bg-white p-2.5 rounded-2xl border-[3.5px] border-brand-600">
                    <QRCodeSVG
                      value={siswa.nis}
                      size={95}
                      level="M"
                      includeMargin={false}
                      fgColor="#4c1d95"
                    />
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {/* Hidden area for single student printing target */}
        {printingSiswa && (
          <div 
            id={`card-render-hidden-${printingSiswa.id}`}
            className="w-[290px] h-[458px] rounded-none bg-white text-brand-950 border border-brand-200 relative overflow-hidden flex flex-col items-center justify-between py-8 px-5 shadow-2xl shadow-brand-950/10 flex-shrink-0"
            style={{ width: "290px", height: "458px", fontFamily: "'Poppins', 'Space Grotesk', 'Inter', sans-serif" }}
          >
            {/* TOP WAVE DECORATION (SVG) */}
            <svg className="absolute top-0 inset-x-0 w-full h-32 pointer-events-none" viewBox="0 0 290 128" fill="none" preserveAspectRatio="none">
              {/* Back Translucent Wave */}
              <path d="M0 0H290V92C210 128 160 85 110 112C60 138 30 115 0 120Z" fill="#7c3aed" opacity="0.2" />
              {/* Front Main Wave (Sidebar Purple color #4c1d95) */}
              <path d="M0 0H290V80C210 112 165 72 115 100C65 128 35 102 0 108Z" fill="#4c1d95" />
            </svg>

            {/* Top Left School Branding */}
            <div className="absolute top-4.5 left-5 flex items-center gap-2 z-10 text-white pointer-events-none">
              <img src="/logo.png" className="w-6.5 h-6.5 object-contain" alt="Logo" />
              <div>
                <h4 className="text-[8px] font-black tracking-widest text-white uppercase leading-tight">SMAN 19 BANDUNG</h4>
                <p className="text-[6px] text-brand-200 font-bold uppercase tracking-wider font-mono">Student Card</p>
              </div>
            </div>

            {/* CARD CONTENT LAYER */}
            <div className="relative z-10 w-full flex-1 flex flex-col justify-between items-center pt-11 pb-1">
              
              {/* 1. 3x4 Portrait Avatar (Pas Foto Style) */}
              <div className="w-21 h-28 rounded-2xl border-[3px] border-pink-500 bg-white flex items-center justify-center p-[2.5px] shadow-md shadow-pink-500/10 flex-shrink-0">
                <div className="w-full h-full rounded-xl border border-pink-100 bg-rose-50/50 flex items-center justify-center text-pink-600 font-black text-3xl uppercase tracking-wider">
                  {printingSiswa.nama.slice(0, 2)}
                </div>
              </div>

              {/* 2. Student Info */}
              <div className="text-center space-y-1 mt-3">
                <h3 className="text-sm font-black tracking-tight text-[#1e1b4b] px-2 line-clamp-1 leading-snug">
                  {printingSiswa.nama}
                </h3>
                <p className="text-[9px] text-[#7c3aed] font-extrabold uppercase tracking-widest">
                  NIS: {printingSiswa.nis} &bull; KELAS: {printingSiswa.kelas}
                </p>
              </div>

              {/* 3. High quality QR code */}
              <div className="mt-4 flex flex-col items-center">
                <div className="bg-white p-2.5 rounded-2xl border-[3.5px] border-brand-600">
                  <QRCodeSVG
                    value={printingSiswa.nis}
                    size={95}
                    level="M"
                    includeMargin={false}
                    fgColor="#4c1d95"
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
