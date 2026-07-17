import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { createPortal } from "react-dom";
import { X, Download, AlertTriangle, Check, RotateCcw } from "lucide-react";
import * as XLSX from "xlsx";
import { supabaseAdminAuth } from "../supabaseClient";
import {
  getRiwayatCount,
  suggestNextSemester,
  resetSemester,
} from "../dbStore";

interface SemesterResetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onResetComplete: (newSemester: string) => void;
  currentSemester: string;
}

export default function SemesterResetModal({
  isOpen,
  onClose,
  onResetComplete,
  currentSemester,
}: SemesterResetModalProps) {
  const [riwayatCount, setRiwayatCount] = useState(0);
  const [newSemester, setNewSemester] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [isResetting, setIsResetting] = useState(false);
  const [isExported, setIsExported] = useState(false);
  const [step, setStep] = useState<"info" | "export" | "confirm" | "done">("info");

  const suggestedSemester = suggestNextSemester(currentSemester);

  useEffect(() => {
    if (isOpen) {
      setNewSemester(suggestedSemester);
      setConfirmText("");
      setIsExported(false);
      setIsResetting(false);
      setStep("info");
      loadRiwayatCount();
    }
  }, [isOpen, currentSemester]);

  const loadRiwayatCount = async () => {
    const count = await getRiwayatCount(currentSemester);
    setRiwayatCount(count);
  };

  const handleExportExcel = async () => {
    try {
      const { data: riwayat, error } = await supabaseAdminAuth
        .from("riwayat_poin")
        .select(`
          id,
          nilai_diberikan,
          nama_poin,
          guru_email,
          created_at,
          semester,
          siswa (
            nis,
            nama,
            kelas
          )
        `)
        .eq("semester", currentSemester)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const rows = (riwayat || []).map((r: any) => ({
        NIS: r.siswa?.nis || "-",
        Nama: r.siswa?.nama || "-",
        Kelas: r.siswa?.kelas || "-",
        "Total Poin Akhir": "",
        "Tanggal Input": new Date(r.created_at).toLocaleDateString("id-ID", {
          day: "2-digit",
          month: "long",
          year: "numeric",
        }),
        Poin: r.nilai_diberikan,
        Keterangan: r.nama_poin,
        "Oleh": r.guru_email,
      }));

      // Add summary rows
      rows.push({});
      rows.push({ NIS: `Total Riwayat: ${rows.length - 1} catatan` });
      rows.push({ NIS: `Semester: ${currentSemester}` });
      rows.push({ NIS: `Diekspor: ${new Date().toLocaleDateString("id-ID")}` });

      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Riwayat Poin");

      worksheet["!cols"] = [
        { wch: 12 }, // NIS
        { wch: 25 }, // Nama
        { wch: 15 }, // Kelas
        { wch: 15 }, // Total Poin
        { wch: 20 }, // Tanggal
        { wch: 8 },  // Poin
        { wch: 30 }, // Keterangan
        { wch: 20 }, // Oleh
      ];

      XLSX.writeFile(
        workbook,
        `RIWAYAT_POIN_${currentSemester.replace(/\//g, "-").replace(/\s/g, "_")}.xlsx`
      );

      setIsExported(true);
      setStep("export");
    } catch (err: any) {
      alert("Gagal mengekspor Excel: " + err.message);
    }
  };

  const handleReset = async () => {
    if (confirmText.trim() !== newSemester.trim()) {
      alert("Nama semester tidak cocok. Ketik persis seperti yang ditampilkan.");
      return;
    }

    setIsResetting(true);
    try {
      await resetSemester(currentSemester, newSemester);
      setStep("done");
      setTimeout(() => {
        onResetComplete(newSemester);
        onClose();
      }, 2000);
    } catch (err: any) {
      alert("Gagal mereset semester: " + err.message);
    } finally {
      setIsResetting(false);
    }
  };

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 bg-brand-950/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="bg-white rounded-3xl p-6 w-full max-w-md border border-brand-100 shadow-2xl relative z-10"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex justify-between items-center border-b pb-3 border-brand-50 mb-5">
              <h3 className="text-base font-extrabold text-brand-950 flex items-center gap-2">
                <RotateCcw className="w-5 h-5 text-brand-600" />
                Akhiri Aktivitas Poin
              </h3>
              <button
                onClick={onClose}
                disabled={isResetting}
                className="p-1 text-brand-400 hover:text-brand-600 hover:bg-brand-50 rounded-xl cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {step === "done" ? (
              <div className="text-center py-8 space-y-3">
                <div className="w-14 h-14 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto">
                  <Check className="w-7 h-7 text-emerald-600" />
                </div>
                <h4 className="text-sm font-black text-brand-950">Semester Berhasil Direset!</h4>
                <p className="text-xs text-brand-500 font-medium">
                  Semester baru <strong className="text-brand-700">{newSemester}</strong> telah dimulai.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Current Semester Info */}
                <div className="bg-brand-50/70 border border-brand-100 rounded-2xl p-4 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-black text-brand-400 uppercase tracking-wider">Semester Aktif</span>
                    <span className="text-xs font-black text-brand-900">{currentSemester}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-black text-brand-400 uppercase tracking-wider">Total Riwayat</span>
                    <span className="text-xs font-black text-brand-900">{riwayatCount.toLocaleString("id-ID")} catatan</span>
                  </div>
                </div>

                {/* Warning */}
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div className="text-[11px] text-amber-800 font-medium leading-relaxed">
                    <strong>Penting:</strong> Semua riwayat poin semester ini akan dihapus permanen. Poin total siswa <strong>TIDAK berubah</strong> (carry over ke semester baru).
                  </div>
                </div>

                {/* Step 1: Export */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black ${isExported ? "bg-emerald-100 text-emerald-700" : "bg-brand-100 text-brand-600"}`}>
                      {isExported ? <Check className="w-3 h-3" /> : "1"}
                    </span>
                    <span className="text-xs font-bold text-brand-900">Export Data ke Excel</span>
                  </div>
                  <button
                    onClick={handleExportExcel}
                    className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-2xl text-xs font-bold transition-all cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    {isExported ? "✓ File sudah diunduh" : "Download Excel Export"}
                  </button>
                </div>

                {/* Step 2: New Semester Name */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-brand-100 text-brand-600 flex items-center justify-center text-[10px] font-black">2</span>
                    <span className="text-xs font-bold text-brand-900">Nama Semester Baru</span>
                  </div>
                  <input
                    type="text"
                    value={newSemester}
                    onChange={(e) => setNewSemester(e.target.value)}
                    className="w-full border border-brand-100 rounded-xl py-2.5 px-3 text-sm font-bold text-brand-800 outline-none focus:ring-1 focus:ring-brand-500 bg-white"
                  />
                </div>

                {/* Step 3: Confirmation */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-brand-100 text-brand-600 flex items-center justify-center text-[10px] font-black">3</span>
                    <span className="text-xs font-bold text-brand-900">Konfirmasi</span>
                  </div>
                  <p className="text-[10px] text-brand-400 font-medium">
                    Ketik <strong className="text-brand-700">{newSemester}</strong> untuk konfirmasi:
                  </p>
                  <input
                    type="text"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder={newSemester}
                    className="w-full border border-brand-100 rounded-xl py-2.5 px-3 text-sm font-bold text-brand-800 outline-none focus:ring-1 focus:ring-brand-500 bg-white"
                  />
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2 justify-end pt-3 border-t border-brand-50">
                  <button
                    onClick={onClose}
                    disabled={isResetting}
                    className="px-4 py-2.5 border border-brand-100 rounded-xl text-sm font-bold text-brand-600 hover:bg-brand-50 cursor-pointer disabled:opacity-50"
                  >
                    Batal
                  </button>
                  <button
                    onClick={handleReset}
                    disabled={isResetting || !isExported || confirmText.trim() !== newSemester.trim()}
                    className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-sm shadow-md disabled:opacity-50 cursor-pointer flex items-center gap-2"
                  >
                    {isResetting ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Memproses...
                      </>
                    ) : (
                      <>
                        <RotateCcw className="w-4 h-4" />
                        Reset Sekarang
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
