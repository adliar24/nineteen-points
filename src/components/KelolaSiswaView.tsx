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
  Camera,
  Image
} from "lucide-react";
interface UserSessionProps { // dummy, we just need types import
}
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

// Helper 1: Dice's Coefficient Fuzzy Matching Algorithm
export function calculateSimilarity(s1: string, s2: string): number {
  const str1 = s1.toLowerCase().replace(/[^a-z0-9]/g, "");
  const str2 = s2.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (str1 === str2) return 1.0;
  if (str1.length < 2 || str2.length < 2) return 0.0;

  const bigrams1 = new Set<string>();
  for (let i = 0; i < str1.length - 1; i++) {
    bigrams1.add(str1.slice(i, i + 2));
  }

  const bigrams2 = new Set<string>();
  for (let i = 0; i < str2.length - 1; i++) {
    bigrams2.add(str2.slice(i, i + 2));
  }

  let intersection = 0;
  bigrams1.forEach(b => {
    if (bigrams2.has(b)) intersection++;
  });

  return (2 * intersection) / (bigrams1.size + bigrams2.size);
}

// Helper 2: Client-side Image Compression using Canvas (outputs 3:4 aspect-ratio JPEG blob)
export function compressImage(file: File, maxWidth = 300, maxHeight = 400, quality = 0.75): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error(`File "${file.name}" bukan file gambar (tipe: ${file.type || "tidak diketahui"})`));
      return;
    }

    const objectUrl = URL.createObjectURL(file);

    const cleanupAndReject = (msg: string) => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error(msg));
    };

    const img = new window.Image();
    img.onload = () => {
      try {
        const targetRatio = maxWidth / maxHeight;
        const canvas = document.createElement("canvas");
        canvas.width = maxWidth;
        canvas.height = maxHeight;
        
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          cleanupAndReject("Gagal membuat context canvas");
          return;
        }
        
        const sourceWidth = img.naturalWidth;
        const sourceHeight = img.naturalHeight;
        
        if (sourceWidth === 0 || sourceHeight === 0) {
          cleanupAndReject(`Gambar memiliki dimensi 0x0. File "${file.name}" mungkin korup.`);
          return;
        }
        
        let sWidth = sourceWidth;
        let sHeight = sourceHeight;
        let sx = 0;
        let sy = 0;
        
        if (sourceWidth / sourceHeight > targetRatio) {
          sWidth = sourceHeight * targetRatio;
          sx = (sourceWidth - sWidth) / 2;
        } else {
          sHeight = sourceWidth / targetRatio;
          sy = (sourceHeight - sHeight) / 2;
        }
        
        ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, maxWidth, maxHeight);
        URL.revokeObjectURL(objectUrl);
        
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error("Gagal mengompresi gambar ke JPEG"));
            }
          },
          "image/jpeg",
          quality
        );
      } catch (drawErr: any) {
        cleanupAndReject("Gagal memproses gambar: " + drawErr.message);
      }
    };
    img.onerror = () => {
      cleanupAndReject(`Gagal membaca file gambar "${file.name}". Pastikan format file valid (JPG/PNG/WebP) dan bukan HEIC/HEIF.`);
    };
    img.src = objectUrl;
  });
}

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
  const [isImportPhotoOpen, setIsImportPhotoOpen] = useState(false);

  // Photo Bulk Upload states
  const [isUploadingPhotos, setIsUploadingPhotos] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatusMsg, setUploadStatusMsg] = useState("");
  
  interface PhotoMatchItem {
    id: string;
    file: File;
    previewUrl: string;
    status: "matched" | "suggested" | "nomatch";
    matchedSiswaId: string | null;
    similarity: number;
  }
  const [photoMatchItems, setPhotoMatchItems] = useState<PhotoMatchItem[]>([]);

  // Pagination & Bulk Delete states
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const [isBulkDeleteConfirm, setIsBulkDeleteConfirm] = useState(false);
  const [photoUploadSiswaId, setPhotoUploadSiswaId] = useState<string | null>(null);

  // Reset pagination on search or class filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedKelas]);

  // New Student fields
  const [newNis, setNewNis] = useState("");
  const [newNama, setNewNama] = useState("");
  const [newKelas, setNewKelas] = useState("XII IPA 1");
  const [addSiswaError, setAddSiswaError] = useState("");

  // Import fields
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState("");

  // Excel import loading states
  const [isImportingExcel, setIsImportingExcel] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importStatusMsg, setImportStatusMsg] = useState("");

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
  const classes = ["Semua", ...Array.from(new Set(siswaList.map((s) => s.kelas))).sort((a: string, b: string) => a.localeCompare(b, 'id'))];

  // Filter students
  const filteredSiswa = siswaList.filter((s) => {
    const matchesSearch =
      s.nama.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.nis.includes(searchQuery);
    const matchesClass = selectedKelas === "Semua" || s.kelas === selectedKelas;
    return matchesSearch && matchesClass;
  });

  // Pagination logic
  const totalPages = Math.ceil(filteredSiswa.length / itemsPerPage);
  const paginatedSiswa = filteredSiswa.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  
  const renderPageNumbers = () => {
    const pageNumbers = [];
    const maxVisiblePages = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
    
    if (endPage - startPage + 1 < maxVisiblePages) {
      startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }
    
    for (let i = startPage; i <= endPage; i++) {
      pageNumbers.push(i);
    }
    return pageNumbers;
  };

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

      const upperNama = newNama.trim().toUpperCase();

      const { error } = await supabase.from("siswa").insert({
        nis: newNis,
        nama: upperNama,
        kelas: newKelas,
        total_poin: 0,
      });

      if (error) throw error;

      // Automatically create user auth account
      let authCreated = true;
      try {
        const { error: signUpError } = await supabaseAdminAuth.auth.admin.createUser({
          email: `${newNis}@sman19.sch.id`,
          password: "siswa19",
          email_confirm: true,
          user_metadata: {
            fullName: upperNama,
            role: "siswa",
            nis: newNis
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
        showToast(`Siswa "${upperNama}" & akun login berhasil dibuat.`);
      } else {
        showToast(`Siswa "${upperNama}" disimpan (gagal membuat akun login).`);
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

  // Bulk Delete Selected Students
  const handleDeleteSelected = () => {
    setIsBulkDeleteConfirm(true);
  };

  const executeDeleteSelected = async () => {
    try {
      const { error } = await supabase
        .from("siswa")
        .delete()
        .in("id", selectedSiswaIds);
        
      if (error) throw error;
      
      await syncSiswa();
      const count = selectedSiswaIds.length;
      setSelectedSiswaIds([]);
      showToast(`Sukses menghapus ${count} data siswa terpilih.`);
    } catch (err: any) {
      alert("Gagal menghapus data siswa: " + err.message);
    }
  };

  // Download Excel Template for imports
  const downloadExcelTemplate = () => {
    try {
      const data = [
        ["NIS", "Nama Siswa", "Kelas"],
        ["19001", "Ahmad Fauzi", "XII IPA 1"],
        ["19002", "Siti Aminah", "XII IPA 2"],
        ["19003", "Rian Hidayat", "XII IPS 1"],
        ["19004", "Dewi Sartika", "XII IPS 2"]
      ];
      
      const worksheet = XLSX.utils.aoa_to_sheet(data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Template Siswa SMAN 19");
      
      // Auto fit columns optionally
      worksheet["!cols"] = [
        { wch: 12 }, // NIS
        { wch: 25 }, // Nama Siswa
        { wch: 15 }  // Kelas
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
      setIsImportingExcel(true);
      setImportProgress(0);
      setImportStatusMsg("Membaca data berkas Excel...");
      try {
        const bstr = evt.target?.result;
        const workbook = XLSX.read(bstr, { type: "binary" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        // Convert to array of arrays
        const rows = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1 });
        
        if (rows.length < 2) {
          setImportError("File Excel kosong atau tidak memiliki baris data.");
          setIsImportingExcel(false);
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
          const nama = String(row[1] || "").trim().toUpperCase(); // Force imported names to UPPERCASE
          const kelas = String(row[2] || "").trim();
          const total_poin = 0; // Default all new students to 0 points initial

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
          setImportStatusMsg(`Menyimpan ${newSiswaToInsert.length} data siswa baru...`);
          const { error } = await supabase.from("siswa").insert(newSiswaToInsert);
          if (error) throw error;

          // Automatically create auth accounts for all imported students
          let authFailedCount = 0;
          for (let idx = 0; idx < newSiswaToInsert.length; idx++) {
            const s = newSiswaToInsert[idx];
            setImportStatusMsg(`Membuat akun (${idx + 1}/${newSiswaToInsert.length}): ${s.nama}...`);
            setImportProgress(Math.round((idx / newSiswaToInsert.length) * 100));
            try {
              const { error: signUpError } = await supabaseAdminAuth.auth.admin.createUser({
                email: `${s.nis}@sman19.sch.id`,
                password: "siswa19",
                email_confirm: true,
                user_metadata: {
                  fullName: s.nama,
                  role: "siswa",
                  nis: s.nis
                }
              });
              if (signUpError) throw signUpError;
            } catch (authErr) {
              console.error(`Gagal membuat akun auth untuk siswa NIS ${s.nis}:`, authErr);
              authFailedCount++;
            }
          }

          setImportProgress(100);
          setImportStatusMsg("Menyinkronkan data...");
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
      } finally {
        setIsImportingExcel(false);
        setImportProgress(0);
        setImportStatusMsg("");
      }
    };

    reader.onerror = () => {
      setImportError("Gagal membaca file.");
      setIsImportingExcel(false);
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

    setIsImportingExcel(true);
    setImportProgress(0);
    setImportStatusMsg("Memproses teks CSV...");

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
      const nama = parts[1].trim().toUpperCase();
      const kelas = parts[2].trim();
      const total_poin = parts[3] ? (parseInt(parts[3].trim(), 10) || 0) : 0;

      if (!nis || !nama || !kelas) continue;

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

    try {
      if (newSiswaToInsert.length > 0) {
        setImportStatusMsg(`Menyimpan ${newSiswaToInsert.length} data siswa baru...`);
        const { error } = await supabase.from("siswa").insert(newSiswaToInsert);
        if (error) throw error;

        // Automatically create auth accounts for all imported students
        let authFailedCount = 0;
        for (let idx = 0; idx < newSiswaToInsert.length; idx++) {
          const s = newSiswaToInsert[idx];
          setImportStatusMsg(`Membuat akun (${idx + 1}/${newSiswaToInsert.length}): ${s.nama}...`);
          setImportProgress(Math.round((idx / newSiswaToInsert.length) * 100));
          try {
            const { error: signUpError } = await supabaseAdminAuth.auth.admin.createUser({
              email: `${s.nis}@sman19.sch.id`,
              password: "siswa19",
              email_confirm: true,
              user_metadata: {
                fullName: s.nama,
                role: "siswa",
                nis: s.nis
              }
            });
            if (signUpError) throw signUpError;
          } catch (authErr) {
            console.error(`Gagal membuat akun auth untuk siswa NIS ${s.nis}:`, authErr);
            authFailedCount++;
          }
        }

        setImportProgress(100);
        setImportStatusMsg("Menyinkronkan data...");
        await syncSiswa();
        setIsImportModalOpen(false);
        setImportText("");
        
        if (authFailedCount === 0) {
          showToast(`Sukses mengimpor ${addedCount} siswa & akun login mereka!${duplicateCount > 0 ? ` (${duplicateCount} NIS duplikat dilewati).` : ""}`);
        } else {
          showToast(`Sukses mengimpor ${addedCount} siswa (${addedCount - authFailedCount} akun berhasil, ${authFailedCount} gagal).`);
        }
      } else {
        setImportError("Tidak ada baris data valid yang diimpor. Format harus: NIS,Nama,Kelas");
      }
    } catch (err: any) {
      setImportError("Gagal mengimpor CSV: " + err.message);
    } finally {
      setIsImportingExcel(false);
      setImportProgress(0);
      setImportStatusMsg("");
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

  // Export Cards in bulk as a ZIP package containing high-res JPG images
  const exportToZIP = async () => {
    const targets = selectedSiswaIds.length > 0 ? selectedSiswaIds : filteredSiswa.map(s => s.id);
    if (targets.length === 0) {
      alert("Pilih siswa terlebih dahulu untuk dicetak kartunya.");
      return;
    }

    setIsExporting(true);
    showToast(`Mengekspor ${targets.length} Kartu Ujian ke ZIP...`);

    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      
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
          
          const imgDataUrl = canvas.toDataURL("image/jpeg", 0.92);
          const base64Data = imgDataUrl.split(',')[1];
          const filename = `KARTU_UJIAN_SMAN19_${studentObj.nis}_${studentObj.nama.toUpperCase().replace(/\s+/g, "_")}.jpg`;
          
          zip.file(filename, base64Data, { base64: true });
        }
      }
      
      const zipContent = await zip.generateAsync({ type: "blob" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(zipContent);
      link.download = `KARTU_UJIAN_SMAN19_${Date.now()}.zip`;
      link.click();
      URL.revokeObjectURL(link.href);
      
      showToast("Unduh ZIP kartu ujian selesai!");
    } catch (error) {
      console.error("Export to ZIP failed", error);
      alert("Gagal mengekspor kartu ke ZIP. Silakan coba lagi.");
    } finally {
      setIsExporting(false);
    }
  };

  // Helper inside component to find best matching student for a filename
  const matchFileToStudent = (filename: string): { matchedSiswaId: string | null; status: "matched" | "suggested" | "nomatch"; similarity: number } => {
    // 1. Strip extension and clean name
    const cleanFilename = filename.split('.').slice(0, -1).join('.').trim().toLowerCase();
    
    // 2. Extract name-only by stripping leading/trailing numbers & separators (underscores, hyphens, dots, spaces)
    const nameOnly = cleanFilename.replace(/^[\d_\-.\s]+/, "").replace(/[\d_\-.\s]+$/, "").trim();
    
    // 3. Check for numeric sequence of 5 or more digits (like NIS)
    const digitsMatch = cleanFilename.match(/\d{5,}/);
    if (digitsMatch) {
      const targetNis = digitsMatch[0];
      const matched = siswaList.find(s => s.nis === targetNis);
      if (matched) {
        return { matchedSiswaId: matched.id, status: "matched", similarity: 1.0 };
      }
    }
    
    // 4. Exact matching on name (ignoring casing & non-alphanumeric chars) — use nameOnly
    if (nameOnly) {
      const cleanNameOnly = nameOnly.replace(/[^a-z0-9]/g, "");
      const exactMatch = siswaList.find(s => s.nama.toLowerCase().replace(/[^a-z0-9]/g, "") === cleanNameOnly);
      if (exactMatch) {
        return { matchedSiswaId: exactMatch.id, status: "matched", similarity: 1.0 };
      }
    }
    
    // 5. Fuzzy string similarity matching — prioritize nameOnly, fallback to full filename
    let bestMatchSiswaId: string | null = null;
    let maxSim = 0;
    const fuzzySource = nameOnly || cleanFilename;
    
    siswaList.forEach(s => {
      const sim = calculateSimilarity(fuzzySource, s.nama);
      if (sim > maxSim) {
        maxSim = sim;
        bestMatchSiswaId = s.id;
      }
    });
    
    // 6. Determine matching status based on threshold
    if (maxSim >= 0.75) {
      return { matchedSiswaId: bestMatchSiswaId, status: "matched", similarity: maxSim };
    } else if (maxSim >= 0.45) {
      return { matchedSiswaId: bestMatchSiswaId, status: "suggested", similarity: maxSim };
    } else {
      return { matchedSiswaId: null, status: "nomatch", similarity: 0 };
    }
  };

  // Handler for multiple file select
  const handleMultipleFilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    const newItems: PhotoMatchItem[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const matchResult = matchFileToStudent(file.name);
      
      newItems.push({
        id: Math.random().toString(36).substring(7),
        file,
        previewUrl: URL.createObjectURL(file),
        status: matchResult.status,
        matchedSiswaId: matchResult.matchedSiswaId,
        similarity: matchResult.similarity
      });
    }
    
    setPhotoMatchItems(prev => [...prev, ...newItems]);
    e.target.value = ""; // Clear input
  };

  // Handler for ZIP file upload & client extraction
  const handleZipFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingPhotos(true);
    setUploadProgress(0);
    setUploadStatusMsg("Membaca file ZIP...");
    
    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      const zipData = await zip.loadAsync(file);
      
      // Collect image entries first to know total count
      const imageEntries: { path: string; entry: any }[] = [];
      zipData.forEach((relativePath, entry) => {
        if (!entry.dir && relativePath.match(/\.(jpe?g|png|webp)$/i)) {
          imageEntries.push({ path: relativePath, entry });
        }
      });

      const totalFiles = imageEntries.length;
      if (totalFiles === 0) {
        alert("Tidak ditemukan file gambar dalam ZIP. Format yang didukung: JPG, PNG, WebP.");
        setIsUploadingPhotos(false);
        setUploadStatusMsg("");
        e.target.value = "";
        return;
      }

      setUploadStatusMsg(`Mengekstrak 0 dari ${totalFiles} foto...`);
      setUploadProgress(5);

      const newItems: PhotoMatchItem[] = [];
      
      // Extract sequentially so we can track progress
      for (let idx = 0; idx < imageEntries.length; idx++) {
        const { path, entry } = imageEntries[idx];
        const filename = path.split("/").pop() || path;
        
        const blob = await entry.async("blob");
        const imageFile = new File([blob], filename, { 
          type: `image/${filename.toLowerCase().endsWith('.png') ? 'png' : 'jpeg'}` 
        });
        
        const matchResult = matchFileToStudent(filename);
        
        newItems.push({
          id: Math.random().toString(36).substring(7),
          file: imageFile,
          previewUrl: URL.createObjectURL(imageFile),
          status: matchResult.status,
          matchedSiswaId: matchResult.matchedSiswaId,
          similarity: matchResult.similarity
        });

        // Update progress every file
        const pct = Math.round(((idx + 1) / totalFiles) * 90) + 5; // 5%–95% range
        setUploadProgress(pct);
        setUploadStatusMsg(`Mengekstrak ${idx + 1} dari ${totalFiles} foto...`);
      }

      setUploadProgress(100);
      setPhotoMatchItems(prev => [...prev, ...newItems]);
      showToast(`Sukses memuat ${newItems.length} foto dari file ZIP!`);
    } catch (err: any) {
      console.error(err);
      alert("Gagal mengekstrak file ZIP: " + err.message);
    } finally {
      setIsUploadingPhotos(false);
      setUploadStatusMsg("");
      setUploadProgress(0);
      e.target.value = ""; // Clear input
    }
  };

  // Batch upload all matched photos (compressing them client-side first!)
  const handleUploadAllPhotos = async () => {
    const itemsToUpload = photoMatchItems.filter(item => item.matchedSiswaId !== null);
    if (itemsToUpload.length === 0) {
      alert("Tidak ada foto tercocokkan yang dapat diunggah.");
      return;
    }
    
    setIsUploadingPhotos(true);
    setUploadProgress(1);
    setUploadStatusMsg("Mempersiapkan server penyimpanan Supabase...");
    
    try {
      // Ensure bucket exists (don't crash if it already exists)
      const { error: bucketError } = await supabase.storage.getBucket('profile-photos');
      if (bucketError) {
        const { error: createErr } = await supabase.storage.createBucket('profile-photos', {
          public: true,
          allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
          fileSizeLimit: 10485760
        });
        if (createErr && !createErr.message?.includes("already exists")) {
          console.error("Bucket creation error:", createErr);
        }
      }
      
      let successCount = 0;
      let failCount = 0;
      
      for (let i = 0; i < itemsToUpload.length; i++) {
        const item = itemsToUpload[i];
        const student = siswaList.find(s => s.id === item.matchedSiswaId);
        if (!student) continue;
        
        setUploadStatusMsg(`Mengompresi & mengunggah foto ${student.nama} (${i + 1}/${itemsToUpload.length})...`);
        setUploadProgress(Math.round(((i + 1) / itemsToUpload.length) * 100));
        
        try {
          // 1. COMPRESS VIA CANVAS (300x400 JPG, quality 0.75)
          const compressedBlob = await compressImage(item.file, 300, 400, 0.75);
          const compressedFile = new File([compressedBlob], `${student.nis}.jpg`, { type: "image/jpeg" });
          
          // 2. UPLOAD TO SUPABASE STORAGE
          const fileExt = "jpg";
          const fileName = `${student.id}_${Date.now()}.${fileExt}`;
          const filePath = `${fileName}`;
          
          const { error: uploadErr } = await supabase.storage
            .from('profile-photos')
            .upload(filePath, compressedFile, {
              cacheControl: '3600',
              upsert: true
            });
            
          if (uploadErr) throw uploadErr;
          
          // 3. GET ACCESS URL
          const { data: urlData } = supabase.storage
            .from('profile-photos')
            .getPublicUrl(filePath);
            
          const publicUrl = urlData.publicUrl;
          
          // 4. UPDATE DATABASE COLUMN
          const { error: dbErr } = await supabase
            .from('siswa')
            .update({ foto_url: publicUrl })
            .eq('id', student.id);
            
          if (dbErr) {
            if (dbErr.message?.includes('foto_url') || dbErr.message?.includes('column')) {
              throw new Error("Kolom 'foto_url' belum ada di database.");
            }
            throw dbErr;
          }

          // 5. SYNC PHOTO TO PROFILES TABLE (best-effort)
          await supabase
            .from('profiles')
            .update({ foto_url: publicUrl })
            .eq('nis', student.nis);
          
          successCount++;
        } catch (uploadFail) {
          console.error(`Gagal memproses foto untuk ${student.nama}:`, uploadFail);
          failCount++;
        }
      }
      
      setUploadProgress(100);
      setUploadStatusMsg(`Selesai! Berhasil mengunggah ${successCount} foto profil.${failCount > 0 ? ` Gagal ${failCount} foto.` : ""}`);
      showToast(`Sukses mengunggah ${successCount} foto profil.`);

      // Reload data silently (don't flash skeleton)
      try {
        const list = await getSiswaList();
        setSiswaList(list);
      } catch (err) {
        console.error("Gagal sync data setelah upload:", err);
      }
      
      setTimeout(() => {
        setIsImportPhotoOpen(false);
        setPhotoMatchItems([]);
        setUploadProgress(0);
        setIsUploadingPhotos(false);
        setUploadStatusMsg("");
      }, 1800);
    } catch (err: any) {
      console.error(err);
      alert("Gagal memproses unggah massal: " + err.message);
      setIsUploadingPhotos(false);
      setUploadStatusMsg("");
    }
  };

  // Upload photo for a single student inline
  const handleSinglePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !photoUploadSiswaId) return;

    const student = siswaList.find(s => s.id === photoUploadSiswaId);
    if (!student) {
      alert("Data siswa tidak ditemukan.");
      setPhotoUploadSiswaId(null);
      e.target.value = "";
      return;
    }

    showToast("Mengompresi & mengunggah foto profil...");
    
    try {
      // 1. COMPRESS VIA CANVAS (300x400 JPG, quality 0.75)
      let compressedBlob: Blob;
      try {
        compressedBlob = await compressImage(file, 300, 400, 0.75);
      } catch (compressErr: any) {
        throw new Error("Gagal mengompresi gambar: " + compressErr.message);
      }
      const compressedFile = new File([compressedBlob], `${student.nis}.jpg`, { type: "image/jpeg" });
      
      // 2. Ensure bucket exists (don't crash if it already exists)
      const { error: bucketError } = await supabase.storage.getBucket('profile-photos');
      if (bucketError) {
        // Bucket might not exist, try creating it
        const { error: createErr } = await supabase.storage.createBucket('profile-photos', {
          public: true,
          allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
          fileSizeLimit: 10485760
        });
        // If create also fails because bucket already exists, that's fine
        if (createErr && !createErr.message?.includes("already exists")) {
          console.error("Bucket creation error:", createErr);
        }
      }
      
      // 3. UPLOAD TO SUPABASE STORAGE
      const fileName = `${student.id}_${Date.now()}.jpg`;
      
      const { error: uploadErr } = await supabase.storage
        .from('profile-photos')
        .upload(fileName, compressedFile, {
          cacheControl: '3600',
          upsert: true
        });
        
      if (uploadErr) throw new Error("Upload ke storage gagal: " + uploadErr.message);
      
      // 4. GET ACCESS URL
      const { data: urlData } = supabase.storage
        .from('profile-photos')
        .getPublicUrl(fileName);
        
      const publicUrl = urlData.publicUrl;
      
      // 5. UPDATE DATABASE COLUMN
      const { error: dbErr } = await supabase
        .from('siswa')
        .update({ foto_url: publicUrl })
        .eq('id', student.id);
        
      if (dbErr) {
        // If foto_url column doesn't exist, give a clear message
        if (dbErr.message?.includes('foto_url') || dbErr.message?.includes('column')) {
          throw new Error("Kolom 'foto_url' belum ada di database. Jalankan: ALTER TABLE public.siswa ADD COLUMN IF NOT EXISTS foto_url TEXT;");
        }
        throw new Error("Gagal update data siswa: " + dbErr.message);
      }

      // 6. SYNC PHOTO TO PROFILES TABLE (best-effort, don't crash if fails)
      const { error: profileErr } = await supabase
        .from('profiles')
        .update({ foto_url: publicUrl })
        .eq('nis', student.nis);
      
      if (profileErr && profileErr.message?.includes('foto_url')) {
        console.warn("Kolom foto_url belum ada di tabel profiles. Jalankan: ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS foto_url TEXT;");
      }
      
      showToast("Foto profil berhasil diperbarui!");
      await reloadData();
    } catch (err: any) {
      console.error("Upload foto gagal:", err);
      alert("Gagal mengunggah foto profil: " + err.message);
    } finally {
      setPhotoUploadSiswaId(null);
      e.target.value = ""; // Clear input
    }
  };

  return (
    <div className="space-y-6">
      {/* Hidden input for single student profile photo upload */}
      <input
        type="file"
        id="single-photo-upload-input"
        accept="image/*"
        className="hidden"
        onChange={handleSinglePhotoChange}
      />
      {/* Toast */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 bg-slate-900 text-white px-5 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-bounce border border-slate-700">
          <Sparkles className="w-5 h-5 text-accent-400" />
          <span className="text-sm font-medium">{toastMessage}</span>
        </div>
      )}


      <h2 className="text-xl font-extrabold text-brand-950 tracking-tight">Data Siswa</h2>

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
              onClick={() => setIsImportPhotoOpen(true)}
              className="flex items-center gap-2 px-5 py-3 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-100 rounded-2xl text-sm font-black transition-all cursor-pointer shadow-xs"
            >
              <Camera className="w-4.5 h-4.5 text-purple-600" />
              Foto Massal
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              disabled={isExporting}
              onClick={exportToZIP}
              className="flex items-center gap-2 px-5 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-sm font-black transition-all shadow-md cursor-pointer disabled:opacity-55"
            >
              <Printer className="w-4.5 h-4.5" />
              {isExporting ? "Memproses ZIP..." : `Kartu Siswa (${selectedSiswaIds.length > 0 ? selectedSiswaIds.length : "Semua"})`}
            </motion.button>
          </div>
        )}
      </div>

      {/* BULK ACTIONS BANNER */}
      <AnimatePresence>
        {userSession.role !== "guru" && selectedSiswaIds.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0, y: -10 }}
            animate={{ height: "auto", opacity: 1, y: 0 }}
            exit={{ height: 0, opacity: 0, y: -10 }}
            className="overflow-hidden"
          >
            <div className="bg-rose-50 border border-rose-100 rounded-3xl p-4 flex items-center justify-between shadow-lg shadow-rose-900/5 mb-2">
              <div className="flex items-center gap-2.5">
                <Trash2 className="w-5 h-5 text-rose-600 animate-pulse" />
                <span className="text-xs font-black text-rose-950 uppercase tracking-wider">{selectedSiswaIds.length} Siswa Terpilih</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSelectedSiswaIds([])}
                  className="px-3.5 py-2 hover:bg-rose-100 text-rose-800 rounded-2xl text-[10px] font-black uppercase transition-all cursor-pointer border border-transparent"
                >
                  Batal
                </button>
                <button
                  onClick={handleDeleteSelected}
                  className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl text-[10px] font-black uppercase transition-all shadow-md cursor-pointer flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Hapus Terpilih
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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
            <table className="w-full text-left border-collapse table-fixed">
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
                  <th className="py-4 px-4 w-16 min-w-[64px]"></th>
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
                      <td className="py-4 px-4"><div className="h-10 w-10 bg-slate-200 rounded-lg" /></td>
                      <td className="py-4 px-6"><div className="h-4 w-44 bg-slate-200 rounded" /></td>
                      <td className="py-4 px-6"><div className="h-4 w-16 bg-slate-200 rounded" /></td>
                      <td className="py-4 px-6 text-center"><div className="h-4 w-12 bg-slate-200 rounded mx-auto" /></td>
                      <td className="py-4 px-6 text-center"><div className="h-4.5 w-18 bg-slate-200 rounded-full mx-auto" /></td>
                      <td className="py-4 px-6 text-right"><div className="h-4.5 w-24 bg-slate-200 rounded-xl ml-auto" /></td>
                    </tr>
                  ))
                ) : paginatedSiswa.length === 0 ? (
                  <tr>
                    <td colSpan={userSession.role === "guru" ? 7 : 8} className="text-center py-12 text-slate-400 text-xs font-bold">
                      Tidak ada siswa yang ditemukan.
                    </td>
                  </tr>
                ) : (
                  paginatedSiswa.map((siswa) => {
                    const isSelected = selectedSiswaIds.includes(siswa.id);
                    const isSafe = siswa.total_poin >= 100;
                    const isWarning = siswa.total_poin > 0 && siswa.total_poin < 100;
                    const isZero = siswa.total_poin === 0;
                    const isSanksi = siswa.total_poin < 0;

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
                        <td className="py-3 px-4 min-w-[64px]">
                          {siswa.foto_url ? (
                            <img src={siswa.foto_url} alt={siswa.nama} className="w-10 h-[53px] rounded-lg object-cover border border-brand-100 shrink-0" />
                          ) : (
                            <div className="w-10 h-[53px] rounded-lg bg-brand-100 flex items-center justify-center text-brand-400 text-[10px] font-black uppercase shrink-0">
                              {siswa.nama.slice(0, 2)}
                            </div>
                          )}
                        </td>
                        <td className="py-4 px-4 font-mono font-bold text-sm text-brand-900">{siswa.nis}</td>
                        <td className="py-4 px-6 whitespace-nowrap">
                          <div className="font-extrabold text-sm text-brand-950 uppercase">{siswa.nama}</div>
                        </td>
                        <td className="py-4 px-6 text-sm font-semibold text-brand-800">{siswa.kelas}</td>
                        <td className="py-4 px-6 text-center font-mono font-black text-sm">
                          <span className={siswa.total_poin >= 100 ? "text-emerald-600" : siswa.total_poin > 0 ? "text-amber-500" : siswa.total_poin === 0 ? "text-slate-400 font-bold" : "text-rose-500"}>
                            {siswa.total_poin} pts
                          </span>
                        </td>
                        <td className="py-4 px-6 text-center">
                          {isSafe && (
                            <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider border border-emerald-200 shadow-xs">
                              <Check className="w-3 h-3" /> AMAN
                            </span>
                          )}
                          {isWarning && (
                            <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider border border-amber-200 shadow-xs">
                              <ShieldAlert className="w-3 h-3" /> WASPADA
                            </span>
                          )}
                          {isZero && (
                            <span className="text-slate-400 font-bold text-xs px-2.5">-</span>
                          )}
                          {isSanksi && (
                            <span className="inline-flex items-center gap-1 bg-rose-50 text-rose-700 px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider border border-rose-200 shadow-xs">
                              <ShieldAlert className="w-3 h-3" /> SANKSI
                            </span>
                          )}
                        </td>
                        <td className="py-4 px-6 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handleDownloadSingleCard(siswa)}
                              className="p-2 hover:bg-brand-50 text-brand-600 hover:text-brand-800 rounded-xl transition-all cursor-pointer border border-transparent hover:border-brand-100"
                              title="Cetak Kartu Ujian (PNG)"
                            >
                              <Printer className="w-4.5 h-4.5 text-brand-600" />
                            </button>
                            {userSession.role !== "guru" && (
                              <button
                                onClick={() => {
                                  setPhotoUploadSiswaId(siswa.id);
                                  document.getElementById("single-photo-upload-input")?.click();
                                }}
                                className="p-2 hover:bg-purple-50 text-purple-600 hover:text-purple-800 rounded-xl transition-all cursor-pointer border border-transparent hover:border-purple-100"
                                title="Ubah Foto Profil"
                              >
                                <Camera className="w-4.5 h-4.5" />
                              </button>
                            )}
                            {userSession.role !== "guru" && (
                              <button
                                onClick={() => handleDeleteSiswa(siswa.id, siswa.nama)}
                                className="p-2 hover:bg-rose-50 text-rose-500 hover:text-rose-700 rounded-xl transition-all cursor-pointer border border-transparent hover:border-rose-100"
                                title="Hapus Siswa"
                              >
                                <Trash2 className="w-4.5 h-4.5" />
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
          
          {/* Table Pagination & Actions Footer */}
          <div className="bg-brand-50/30 p-4 border-t border-brand-100 text-sm text-brand-500 font-bold flex flex-col sm:flex-row items-center justify-between gap-3">
            <span>
              Menampilkan {filteredSiswa.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0} - {Math.min(currentPage * itemsPerPage, filteredSiswa.length)} dari {filteredSiswa.length} siswa
            </span>
            
            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <button
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  className="px-4 py-2 bg-white hover:bg-brand-50 border border-brand-200 rounded-xl text-sm font-bold text-brand-850 disabled:opacity-50 disabled:hover:bg-white cursor-pointer transition-all"
                >
                  &larr; Prev
                </button>
                {renderPageNumbers().map((pageNum) => (
                  <button
                    key={pageNum}
                    onClick={() => setCurrentPage(pageNum)}
                    className={`px-4 py-2 rounded-xl border text-sm font-black transition-all cursor-pointer ${
                      currentPage === pageNum
                        ? "bg-brand-600 border-brand-600 text-white"
                        : "bg-white hover:bg-brand-50 border-brand-200 text-brand-800"
                    }`}
                  >
                    {pageNum}
                  </button>
                ))}
                <button
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  className="px-4 py-2 bg-white hover:bg-brand-50 border border-brand-200 rounded-xl text-sm font-bold text-brand-850 disabled:opacity-50 disabled:hover:bg-white cursor-pointer transition-all"
                >
                  Next &rarr;
                </button>
              </div>
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

      {/* CONFIRM BULK DELETE MODAL */}
      <ConfirmationModal
        isOpen={isBulkDeleteConfirm}
        onClose={() => setIsBulkDeleteConfirm(false)}
        onConfirm={() => {
          executeDeleteSelected();
          setIsBulkDeleteConfirm(false);
        }}
        title="Hapus Massal Data Siswa?"
        message={`Apakah Anda yakin ingin menghapus ${selectedSiswaIds.length} data siswa terpilih secara permanen? Semua akun login, riwayat absensi & sanksi milik mereka akan ikut terhapus.`}
        confirmText="Ya, Hapus Semua"
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

              {isImportingExcel ? (
                <div className="py-12 flex flex-col items-center justify-center space-y-4">
                  <div className="relative w-16 h-16">
                    <div className="absolute inset-0 rounded-full border-4 border-brand-100 border-t-brand-600 animate-spin"></div>
                  </div>
                  <div className="text-center space-y-1">
                    <p className="text-xs font-black text-brand-950 uppercase tracking-wider">{importStatusMsg}</p>
                    <p className="text-[10px] text-brand-400 font-bold">{importProgress}% Selesai</p>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2 max-w-xs overflow-hidden border border-slate-200">
                    <div 
                      className="bg-brand-600 h-full rounded-full transition-all duration-300"
                      style={{ width: `${importProgress}%` }}
                    ></div>
                  </div>
                </div>
              ) : (
                <>
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
                      <p className="text-[10px] text-brand-400 font-medium mt-1">Sistem akan otomatis mendeteksi kolom NIS, Nama, dan Kelas.</p>
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
                          NIS,NamaSiswa,Kelas<br />
                          19013,Cahya Lestari,XII IPS 1
                        </code>
                      </div>
                      
                      <form onSubmit={handleImportCSV} className="space-y-3">
                        <textarea
                          rows={4}
                          placeholder="Contoh: 19025,Amir Hamzah,XII IPA 2"
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
                </>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* EXCEL IMPORT PHOTO MODAL */}
      <AnimatePresence>
        {isImportPhotoOpen && (
          <div className="fixed inset-0 bg-brand-950/65 backdrop-blur-xs flex items-center justify-center z-50 p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl p-6 w-full max-w-4xl max-h-[85vh] border border-brand-100 shadow-2xl flex flex-col"
            >
              {/* Header */}
              <div className="flex justify-between items-center border-b pb-4 border-brand-50 flex-shrink-0">
                <div>
                  <h3 className="text-base font-extrabold text-brand-950 flex items-center gap-2">
                    <Camera className="w-5 h-5 text-purple-600" />
                    Unggah & Petakan Foto Profil Massal
                  </h3>
                  <p className="text-[11px] text-brand-400 font-bold mt-0.5 uppercase tracking-wide">Pencocokan Cerdas berbasis Nama / NIS</p>
                </div>
                <button
                  onClick={() => {
                    setIsImportPhotoOpen(false);
                    setPhotoMatchItems([]);
                  }}
                  disabled={isUploadingPhotos}
                  className="p-1 text-brand-400 hover:text-brand-600 hover:bg-brand-50 rounded-xl cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto py-5 space-y-5">
                
                {/* How it works info */}
                <div className="bg-brand-50/50 border border-brand-100/60 rounded-2xl p-4 text-xs text-brand-700 leading-relaxed font-semibold">
                  💡 **Petunjuk Penggunaan Cepat:**
                  <ul className="list-disc list-inside mt-2 space-y-1 text-brand-500 font-medium">
                    <li>Namai file foto dengan **NIS** (misal: `19013.jpg`) untuk pencocokan otomatis 100% tepat.</li>
                    <li>Sistem juga dapat mendeteksi nama secara cerdas jika ada salah ketik kecil (misal: `amiir hamza.jpg` akan cocok ke `Amir Hamzah`).</li>
                    <li>Anda bisa memilih banyak file gambar sekaligus atau mengunggah satu file **.zip** berisi semua foto.</li>
                  </ul>
                </div>

                {/* Upload selectors */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  
                  {/* Option A: Select Multiple Images */}
                  <div className="border border-dashed border-brand-200 rounded-2xl p-5 flex flex-col items-center justify-center text-center space-y-3 bg-brand-50/10 hover:bg-brand-50/30 transition-all cursor-pointer relative group">
                    <div className="w-10 h-10 rounded-full bg-purple-50 flex items-center justify-center text-purple-600 group-hover:scale-110 transition-transform">
                      <Image className="w-5 h-5" />
                    </div>
                    <div>
                      <h5 className="text-xs font-bold text-brand-950">Pilih Berkas Foto Langsung</h5>
                      <p className="text-[10px] text-brand-400 font-medium mt-0.5">Mendukung format JPG, PNG, WEBP sekaligus banyak</p>
                    </div>
                    <input 
                      type="file"
                      multiple
                      accept="image/*"
                      onChange={handleMultipleFilesChange}
                      disabled={isUploadingPhotos}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                  </div>

                  {/* Option B: Upload ZIP */}
                  <div className="border border-dashed border-brand-200 rounded-2xl p-5 flex flex-col items-center justify-center text-center space-y-3 bg-brand-50/10 hover:bg-brand-50/30 transition-all cursor-pointer relative group">
                    <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600 group-hover:scale-110 transition-transform">
                      <FileSpreadsheet className="w-5 h-5" />
                    </div>
                    <div>
                      <h5 className="text-xs font-bold text-brand-950">Unggah Berkas File ZIP</h5>
                      <p className="text-[10px] text-brand-400 font-medium mt-0.5">Kompresi semua file foto dalam satu berkas .zip</p>
                    </div>
                    <input 
                      type="file"
                      accept=".zip"
                      onChange={handleZipFileChange}
                      disabled={isUploadingPhotos}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                  </div>
                </div>

                {/* Progress bar info */}
                {isUploadingPhotos && (
                  <div className="bg-purple-50/75 border border-purple-200 rounded-2xl p-5 space-y-3">
                    <div className="flex justify-between items-center text-sm font-bold text-purple-950">
                      <div className="flex items-center gap-2">
                        <svg className="animate-spin h-4 w-4 text-purple-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                        </svg>
                        <span>{uploadStatusMsg}</span>
                      </div>
                      <span className="text-purple-700 tabular-nums">{uploadProgress}%</span>
                    </div>
                    <div className="w-full bg-purple-200 h-3 rounded-full overflow-hidden">
                      <div 
                        className="bg-purple-600 h-full rounded-full transition-all duration-300 ease-out"
                        style={{ width: `${uploadProgress}%` }}
                      ></div>
                    </div>
                  </div>
                )}

                {/* Preview Match List Table */}
                {photoMatchItems.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <h4 className="text-xs font-black text-brand-900 uppercase tracking-wider">
                        Pratinjau Hasil Pemetaan ({photoMatchItems.length} Berkas)
                      </h4>
                      <button
                        onClick={() => setPhotoMatchItems([])}
                        disabled={isUploadingPhotos}
                        className="text-[10px] text-rose-600 hover:text-rose-800 font-bold underline cursor-pointer"
                      >
                        Reset Daftar
                      </button>
                    </div>

                    <div className="border border-brand-100 rounded-2xl overflow-hidden shadow-xs">
                      <div className="max-h-[300px] overflow-y-auto">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="bg-brand-50/60 text-brand-800 font-extrabold uppercase text-[10px] border-b border-brand-100">
                              <th className="py-2.5 px-4">Nama File</th>
                              <th className="py-2.5 px-4 text-center">Foto</th>
                              <th className="py-2.5 px-4">Hasil Auto-Match</th>
                              <th className="py-2.5 px-4 text-center">Status</th>
                              <th className="py-2.5 px-4">Koreksi Manual</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-brand-50 text-brand-950 font-semibold bg-white">
                            {photoMatchItems.map((item) => {
                              const sMatch = siswaList.find(s => s.id === item.matchedSiswaId);
                              return (
                                <tr key={item.id} className="hover:bg-slate-50/50">
                                  <td className="py-3 px-4 font-mono text-[10px] text-brand-600 max-w-[150px] truncate" title={item.file.name}>
                                    {item.file.name}
                                  </td>
                                  <td className="py-3 px-4 text-center">
                                    <img 
                                      src={item.previewUrl} 
                                      className="w-9 h-11 object-cover border border-brand-100 rounded-lg mx-auto shadow-xs" 
                                      alt="preview" 
                                    />
                                  </td>
                                  <td className="py-3 px-4">
                                    {sMatch ? (
                                      <div>
                                        <p className="font-extrabold text-brand-950">{sMatch.nama}</p>
                                        <p className="text-[10px] text-brand-400 mt-0.5">Kelas {sMatch.kelas} &bull; NIS {sMatch.nis}</p>
                                      </div>
                                    ) : (
                                      <span className="text-slate-400 italic">Belum terpetakan</span>
                                    )}
                                  </td>
                                  <td className="py-3 px-4 text-center">
                                    {item.status === "matched" && (
                                      <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-full text-[9px] font-black uppercase">
                                        Cocok
                                      </span>
                                    )}
                                    {item.status === "suggested" && (
                                      <span className="px-2.5 py-1 bg-amber-50 text-amber-700 rounded-full text-[9px] font-black uppercase">
                                        Rekomendasi
                                      </span>
                                    )}
                                    {item.status === "nomatch" && (
                                      <span className="px-2.5 py-1 bg-rose-50 text-rose-700 rounded-full text-[9px] font-black uppercase">
                                        Gagal
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-3 px-4">
                                    <select
                                      value={item.matchedSiswaId || ""}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        setPhotoMatchItems(prev => prev.map(p => 
                                          p.id === item.id 
                                            ? { ...p, matchedSiswaId: val === "" ? null : val, status: val === "" ? "nomatch" : "matched" } 
                                            : p
                                        ));
                                      }}
                                      disabled={isUploadingPhotos}
                                      className="w-full text-[11px] bg-slate-50 border border-slate-200 rounded-xl p-2 font-bold outline-none text-brand-900 focus:bg-white cursor-pointer"
                                    >
                                      <option value="">-- Pilih Siswa Manual --</option>
                                      {[...siswaList]
                                        .sort((a, b) => a.nama.localeCompare(b.nama))
                                        .map(s => (
                                          <option key={s.id} value={s.id}>
                                            {s.nama} ({s.kelas}) - {s.nis}
                                          </option>
                                        ))}
                                    </select>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="flex justify-end gap-2 border-t pt-4 border-brand-50 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setIsImportPhotoOpen(false);
                    setPhotoMatchItems([]);
                  }}
                  disabled={isUploadingPhotos}
                  className="px-5 py-2.5 border border-brand-100 rounded-xl text-sm font-bold text-brand-600 hover:bg-brand-50 cursor-pointer disabled:opacity-50"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleUploadAllPhotos}
                  disabled={isUploadingPhotos || photoMatchItems.filter(item => item.matchedSiswaId !== null).length === 0}
                  className="px-6 py-2.5 brand-gradient hover:opacity-95 text-white font-bold rounded-xl text-sm shadow-md shadow-brand-500/20 disabled:opacity-50 cursor-pointer"
                >
                  {isUploadingPhotos ? "Mengunggah..." : `Konfirmasi & Unggah (${photoMatchItems.filter(item => item.matchedSiswaId !== null).length} Foto)`}
                </button>
              </div>
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
                  {siswa.foto_url ? (
                    <img src={siswa.foto_url} className="w-full h-full rounded-xl object-cover" alt={siswa.nama} />
                  ) : (
                    <div className="w-full h-full rounded-xl border border-pink-100 bg-rose-50/50 flex items-center justify-center text-pink-600 font-black text-3xl uppercase tracking-wider">
                      {siswa.nama.slice(0, 2)}
                    </div>
                  )}
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
                {printingSiswa.foto_url ? (
                  <img src={printingSiswa.foto_url} className="w-full h-full rounded-xl object-cover" alt={printingSiswa.nama} />
                ) : (
                  <div className="w-full h-full rounded-xl border border-pink-100 bg-rose-50/50 flex items-center justify-center text-pink-600 font-black text-3xl uppercase tracking-wider">
                    {printingSiswa.nama.slice(0, 2)}
                  </div>
                )}
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
