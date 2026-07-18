import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import html2canvas from "html2canvas-pro";
import {
  Search,
  Plus,
  Trash2,
  FileSpreadsheet,
  Filter,
  UserPlus,
  RefreshCw,
  Sparkles,
  ChevronDown,
  Printer,
  Users,
  Check,
  ShieldAlert,
} from "lucide-react";
import { Siswa, UserSession } from "../types";
import { getSiswaList } from "../dbStore";
import ConfirmationModal from "./ConfirmationModal";
import { toSentenceCase } from "../formatName";
import { supabase, supabaseAdminAuth } from "../supabaseClient";
import PaginationFooter from "./PaginationFooter";
import BulkActionsBanner from "./BulkActionsBanner";
import StudentQRCard from "./StudentQRCard";
import AddStudentModal from "./AddStudentModal";
import ImportStudentModal from "./ImportStudentModal";
import StudentDetailPopup from "./StudentDetailPopup";

interface KelolaSiswaViewProps {
  userSession: UserSession;
  onRefreshHistory: () => void;
}

export default function KelolaSiswaView({
  userSession,
  onRefreshHistory,
}: KelolaSiswaViewProps) {
  const [siswaList, setSiswaList] = useState<Siswa[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedKelas, setSelectedKelas] = useState("Semua");
  const [selectedSiswaIds, setSelectedSiswaIds] = useState<string[]>([]);
  const [printingSiswa, setPrintingSiswa] = useState<Siswa | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const [isBulkDeleteConfirm, setIsBulkDeleteConfirm] = useState(false);
  const [detailStudent, setDetailStudent] = useState<Siswa | null>(null);
  const [siswaToDelete, setSiswaToDelete] = useState<{ id: string; nama: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [toastMessage, setToastMessage] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [isSyncingAccounts, setIsSyncingAccounts] = useState(false);

  // Modals
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isAddSiswaModalOpen, setIsAddSiswaModalOpen] = useState(false);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedKelas]);

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
      setSiswaList(await getSiswaList());
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

  const handleSyncMissingAccounts = async () => {
    setIsSyncingAccounts(true);
    try {
      const { data: existingProfiles } = await supabase
        .from("profiles")
        .select("nis")
        .eq("role", "siswa");
      const existingNisSet = new Set(
        (existingProfiles || []).map((p: any) => p.nis).filter(Boolean)
      );
      const missingStudents = siswaList.filter((s) => !existingNisSet.has(s.nis));

      if (missingStudents.length === 0) {
        showToast("Semua murid sudah memiliki akun login.");
        setIsSyncingAccounts(false);
        return;
      }

      const { data: authUsersData, error: authUsersError } =
        await supabaseAdminAuth.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (authUsersError) throw authUsersError;
      const authUsers = authUsersData?.users || [];

      let createdCount = 0;
      let failCount = 0;
      for (const s of missingStudents) {
        const email = `${s.nis}@sman19.sch.id`;
        try {
          const existingAuthUser = authUsers.find((u) => u.email === email);
          if (existingAuthUser) {
            const { error: profileError } = await supabase.from("profiles").insert({
              id: existingAuthUser.id,
              email: existingAuthUser.email,
              nama: s.nama,
              role: "siswa",
              nis: s.nis,
            });
            if (profileError) throw profileError;
            createdCount++;
          } else {
            const { error: createError } = await supabaseAdminAuth.auth.admin.createUser({
              email,
              password: `Siswa${s.nis}`,
              email_confirm: true,
              user_metadata: { fullName: s.nama, role: "siswa", nis: s.nis },
            });
            if (createError) throw createError;
            createdCount++;
          }
        } catch (error) {
          console.error(`Gagal menyinkronkan siswa ${s.nama}:`, error);
          failCount++;
        }
      }
      showToast(
        `Sinkron akun selesai: ${createdCount} akun disinkronkan, ${failCount} gagal.`
      );
    } catch (err: any) {
      alert("Gagal sinkronisasi akun: " + err.message);
    } finally {
      setIsSyncingAccounts(false);
    }
  };

  const classes = [
    "Semua",
    ...Array.from(new Set(siswaList.map((s) => s.kelas))).sort((a: string, b: string) =>
      a.localeCompare(b, "id")
    ),
  ];

  const filteredSiswa = siswaList.filter((s) => {
    const matchesSearch =
      s.nama.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.nis.includes(searchQuery);
    const matchesClass = selectedKelas === "Semua" || s.kelas === selectedKelas;
    return matchesSearch && matchesClass;
  });

  const totalPages = Math.ceil(filteredSiswa.length / itemsPerPage);
  const paginatedSiswa = filteredSiswa.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedSiswaIds(e.target.checked ? filteredSiswa.map((s) => s.id) : []);
  };

  const handleSelectSiswa = (siswaId: string) => {
    setSelectedSiswaIds((prev) =>
      prev.includes(siswaId) ? prev.filter((id) => id !== siswaId) : [...prev, siswaId]
    );
  };

  const handleDeleteSiswa = (id: string, nama: string) => {
    setSiswaToDelete({ id, nama });
  };

  const executeDeleteSiswa = async (id: string, nama: string) => {
    try {
      const { error } = await supabase.from("siswa").delete().eq("id", id);
      if (error) throw error;
      await syncSiswa();
      setSelectedSiswaIds((prev) => prev.filter((item) => item !== id));
      showToast(`Murid "${nama}" telah dihapus.`);
    } catch (err: any) {
      alert("Gagal menghapus murid: " + err.message);
    }
  };

  const executeDeleteSelected = async () => {
    try {
      const { error } = await supabase.from("siswa").delete().in("id", selectedSiswaIds);
      if (error) throw error;
      await syncSiswa();
      const count = selectedSiswaIds.length;
      setSelectedSiswaIds([]);
      showToast(`Sukses menghapus ${count} data murid terpilih.`);
    } catch (err: any) {
      alert("Gagal menghapus data murid: " + err.message);
    }
  };

  const handleDownloadSingleCard = async (siswa: Siswa) => {
    showToast(`Menyiapkan Kartu QR untuk ${toSentenceCase(siswa.nama)}...`);
    setPrintingSiswa(siswa);

    setTimeout(async () => {
      const cardElement = document.getElementById(`card-render-hidden-${siswa.id}`);
      if (cardElement) {
        try {
          const canvas = await html2canvas(cardElement, {
            scale: 3,
            useCORS: true,
            backgroundColor: null,
          });
          const imgData = canvas.toDataURL("image/png");
          const link = document.createElement("a");
          link.download = `KARTU_PELAJAR_SMAN19_${siswa.nama
            .toUpperCase()
            .replace(/\s+/g, "_")}.png`;
          link.href = imgData;
          link.click();
          showToast(`Kartu ${toSentenceCase(siswa.nama)} sukses diunduh!`);
        } catch (error) {
          console.error("Gagal merender kartu:", error);
          alert("Gagal mengunduh kartu. Silakan coba lagi.");
        } finally {
          setPrintingSiswa(null);
        }
      }
    }, 150);
  };

  const exportToZIP = async () => {
    const targets =
      selectedSiswaIds.length > 0 ? selectedSiswaIds : filteredSiswa.map((s) => s.id);
    if (targets.length === 0) {
      alert("Pilih murid terlebih dahulu untuk dicetak kartunya.");
      return;
    }

    setIsExporting(true);
    showToast(`Mengekspor ${targets.length} Kartu Ujian ke ZIP...`);

    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();

      for (let i = 0; i < targets.length; i++) {
        const studentId = targets[i];
        const studentObj = siswaList.find((s) => s.id === studentId);
        if (!studentObj) continue;

        const cardElement = document.getElementById(`card-render-bulk-${studentId}`);
        if (cardElement) {
          const canvas = await html2canvas(cardElement, {
            scale: 3,
            useCORS: true,
            backgroundColor: "#ffffff",
          });

          const imgDataUrl = canvas.toDataURL("image/jpeg", 0.92);
          const base64Data = imgDataUrl.split(",")[1];
          const filename = `KARTU_UJIAN_SMAN19_${studentObj.nis}_${studentObj.nama
            .toUpperCase()
            .replace(/\s+/g, "_")}.jpg`;

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

  const isAdmin = !["guru", "kepala_sekolah"].includes(userSession.role);

  return (
    <div className="space-y-6 pb-8">
      {/* Toast */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            className="fixed bottom-5 right-5 z-50 bg-slate-900 text-white px-5 py-3 rounded-xl shadow-2xl flex items-center gap-3 border border-slate-700"
          >
            <Sparkles className="w-5 h-5 text-accent-400" />
            <span className="text-sm font-medium">{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <h2 className="text-xl font-extrabold text-brand-950 tracking-tight">Data Murid</h2>

      {/* SEARCH & CONTROLS BAR */}
      <div className="bg-white p-5 rounded-3xl border border-brand-100 shadow-xl shadow-brand-900/5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
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

        {isAdmin && (
          <div className="flex flex-wrap items-center gap-2.5">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setIsAddSiswaModalOpen(true)}
              className="flex items-center justify-center gap-2 p-3 md:px-5 md:py-3 brand-gradient text-white rounded-2xl text-sm font-black transition-all shadow-md cursor-pointer"
            >
              <UserPlus className="w-4.5 h-4.5" />
              <span className="hidden md:inline">Murid Baru</span>
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setIsImportModalOpen(true)}
              className="flex items-center justify-center gap-2 p-3 md:px-5 md:py-3 bg-brand-50 hover:bg-brand-100 text-brand-700 border border-brand-100 rounded-2xl text-sm font-black transition-all cursor-pointer shadow-xs"
            >
              <FileSpreadsheet className="w-4.5 h-4.5 text-brand-600" />
              <span className="hidden md:inline">Impor Excel</span>
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleSyncMissingAccounts}
              disabled={isSyncingAccounts}
              className="flex items-center justify-center gap-2 p-3 md:px-5 md:py-3 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-100 rounded-2xl text-sm font-black transition-all cursor-pointer shadow-xs disabled:opacity-50"
            >
              <Users
                className={`w-4.5 h-4.5 ${isSyncingAccounts ? "animate-spin" : "text-amber-600"}`}
              />
              <span className="hidden md:inline">
                {isSyncingAccounts ? "Menyinkronkan..." : "Sinkron Akun"}
              </span>
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              disabled={isExporting}
              onClick={exportToZIP}
              className="flex items-center justify-center gap-2 p-3 md:px-5 md:py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-sm font-black transition-all shadow-md cursor-pointer disabled:opacity-55"
            >
              <Printer className="w-4.5 h-4.5" />
              {selectedSiswaIds.length > 0 && (
                <span className="md:hidden text-[10px] font-black bg-white text-emerald-700 px-1.5 py-0.5 rounded-full">
                  {selectedSiswaIds.length}
                </span>
              )}
              <span className="hidden md:inline">
                {isExporting
                  ? "Memproses ZIP..."
                  : selectedSiswaIds.length > 0
                  ? `Kartu Murid (${selectedSiswaIds.length})`
                  : "Kartu Murid"}
              </span>
            </motion.button>
          </div>
        )}
      </div>

      {/* BULK ACTIONS BANNER */}
      {isAdmin && (
        <BulkActionsBanner
          count={selectedSiswaIds.length}
          label="Murid"
          onCancel={() => setSelectedSiswaIds([])}
          onConfirm={() => setIsBulkDeleteConfirm(true)}
        />
      )}

      {/* TABLE */}
      <AnimatePresence mode="wait">
        <motion.div
          key="table-view"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="bg-white rounded-3xl border border-brand-100 shadow-xl shadow-brand-900/5 overflow-hidden"
        >
          <div className="overflow-x-auto min-h-[520px]">
            <table className="w-full text-left border-collapse table-fixed">
              <thead>
                <tr className="bg-brand-50/50 border-b border-brand-100/70 text-brand-500 text-xs font-black uppercase tracking-wider">
                  {isAdmin && (
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
                  <th className="py-4 px-4 w-[64px]"></th>
                  <th className="py-4 px-4 w-[100px] font-mono">NIS</th>
                  <th className="py-4 px-6 w-[280px]">Nama Lengkap</th>
                  <th className="py-4 px-6 w-[120px]">Kelas</th>
                  <th className="py-4 px-6 w-[100px] text-center">Skor Poin</th>
                  <th className="py-4 px-6 w-[110px] text-center">Status</th>
                  <th className="py-4 px-6 w-[120px] text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-100/40">
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, idx) => (
                    <tr key={idx} className="animate-pulse">
                      {isAdmin && (
                        <td className="py-4 px-6 text-center">
                          <div className="h-4 w-4 bg-slate-200 rounded mx-auto" />
                        </td>
                      )}
                      <td className="py-4 px-4">
                        <div className="h-4 w-20 bg-slate-200 rounded" />
                      </td>
                      <td className="py-4 px-4">
                        <div className="h-10 w-10 bg-slate-200 rounded-lg" />
                      </td>
                      <td className="py-4 px-6">
                        <div className="h-4 w-44 bg-slate-200 rounded" />
                      </td>
                      <td className="py-4 px-6">
                        <div className="h-4 w-16 bg-slate-200 rounded" />
                      </td>
                      <td className="py-4 px-6 text-center">
                        <div className="h-4 w-12 bg-slate-200 rounded mx-auto" />
                      </td>
                      <td className="py-4 px-6 text-center">
                        <div className="h-4.5 w-18 bg-slate-200 rounded-full mx-auto" />
                      </td>
                      <td className="py-4 px-6 text-right">
                        <div className="h-4.5 w-24 bg-slate-200 rounded-xl ml-auto" />
                      </td>
                    </tr>
                  ))
                ) : paginatedSiswa.length === 0 ? (
                  <tr>
                    <td
                      colSpan={isAdmin ? 8 : 7}
                      className="text-center py-12 text-slate-400 text-xs font-bold"
                    >
                      Tidak ada murid yang ditemukan.
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
                        onClick={() => setDetailStudent(siswa)}
                        className={`hover:bg-brand-50/20 transition-colors cursor-pointer ${
                          isSelected ? "bg-brand-50/40" : ""
                        }`}
                      >
                        {isAdmin && (
                          <td
                            className="py-4 px-6 text-center"
                            onClick={(e) => e.stopPropagation()}
                          >
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
                            <img
                              src={siswa.foto_url}
                              alt={siswa.nama}
                              className="w-10 h-[53px] rounded-lg object-cover border border-brand-100 shrink-0"
                            />
                          ) : (
                            <div className="w-10 h-[53px] rounded-lg bg-brand-100 flex items-center justify-center text-brand-400 text-[10px] font-black uppercase shrink-0">
                              {siswa.nama.slice(0, 2)}
                            </div>
                          )}
                        </td>
                        <td className="py-4 px-4 font-mono font-bold text-sm text-brand-900">
                          {siswa.nis}
                        </td>
                        <td className="py-4 px-6 overflow-hidden whitespace-nowrap">
                          <div className="font-extrabold text-sm text-brand-950 truncate">
                            {toSentenceCase(siswa.nama)}
                          </div>
                        </td>
                        <td className="py-4 px-6 text-sm font-semibold text-brand-800">
                          {siswa.kelas}
                        </td>
                        <td className="py-4 px-6 text-center font-mono font-black text-sm">
                          <span
                            className={
                              siswa.total_poin >= 100
                                ? "text-emerald-600"
                                : siswa.total_poin > 0
                                ? "text-amber-500"
                                : siswa.total_poin === 0
                                ? "text-slate-400 font-bold"
                                : "text-rose-500"
                            }
                          >
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
                        <td
                          className="py-4 px-6 text-right whitespace-nowrap"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center justify-end gap-1.5">
                            {isAdmin && (
                              <button
                                onClick={() => handleDeleteSiswa(siswa.id, siswa.nama)}
                                className="p-2 hover:bg-rose-50 text-rose-500 hover:text-rose-700 rounded-xl transition-all cursor-pointer border border-transparent hover:border-rose-100"
                                title="Hapus Murid"
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

          <PaginationFooter
            totalItems={filteredSiswa.length}
            itemsPerPage={itemsPerPage}
            currentPage={currentPage}
            setCurrentPage={setCurrentPage}
            itemLabel="murid"
          />
        </motion.div>
      </AnimatePresence>

      {/* Modals */}
      <ConfirmationModal
        isOpen={!!siswaToDelete}
        onClose={() => setSiswaToDelete(null)}
        onConfirm={() => {
          if (siswaToDelete) {
            executeDeleteSiswa(siswaToDelete.id, siswaToDelete.nama);
            setSiswaToDelete(null);
          }
        }}
        title="Hapus Data Murid?"
        message={`Apakah Anda yakin ingin menghapus data "${
          siswaToDelete?.nama ? toSentenceCase(siswaToDelete.nama) : ""
        }" secara permanen? Semua riwayat absensi & sanksi miliknya akan ikut terhapus.`}
        confirmText="Ya, Hapus"
        cancelText="Batal"
        type="danger"
      />

      <ConfirmationModal
        isOpen={isBulkDeleteConfirm}
        onClose={() => setIsBulkDeleteConfirm(false)}
        onConfirm={() => {
          executeDeleteSelected();
          setIsBulkDeleteConfirm(false);
        }}
        title="Hapus Massal Data Murid?"
        message={`Apakah Anda yakin ingin menghapus ${selectedSiswaIds.length} data murid terpilih secara permanen? Semua akun login, riwayat absensi & sanksi milik mereka akan ikut terhapus.`}
        confirmText="Ya, Hapus Semua"
        cancelText="Batal"
        type="danger"
      />

      <StudentDetailPopup
        isOpen={!!detailStudent}
        onClose={() => setDetailStudent(null)}
        student={detailStudent}
        onDownloadCard={handleDownloadSingleCard}
      />

      <AddStudentModal
        isOpen={isAddSiswaModalOpen}
        onClose={() => setIsAddSiswaModalOpen(false)}
        onSuccess={syncSiswa}
        showToast={showToast}
      />

      <ImportStudentModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onSuccess={syncSiswa}
        showToast={showToast}
      />

      {/* OFF-SCREEN CARD RENDERERS */}
      <div className="absolute top-[-9999px] left-[-9999px] pointer-events-none overflow-hidden">
        {isExporting &&
          (selectedSiswaIds.length > 0 ? selectedSiswaIds : filteredSiswa.map((s) => s.id)).map(
            (studentId) => {
              const siswa = siswaList.find((s) => s.id === studentId);
              if (!siswa) return null;
              return (
                <StudentQRCard
                  key={`bulk-render-${siswa.id}`}
                  siswa={siswa}
                  idPrefix="card-render-bulk"
                />
              );
            }
          )}

        {printingSiswa && (
          <StudentQRCard
            siswa={printingSiswa}
            idPrefix="card-render-hidden"
          />
        )}
      </div>
    </div>
  );
}
