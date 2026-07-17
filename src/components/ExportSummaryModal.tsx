import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { createPortal } from "react-dom";
import { X, Download, Check } from "lucide-react";
import * as XLSX from "xlsx";
import { exportSummaryData } from "../dbStore";

interface ExportSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ExportSummaryModal({ isOpen, onClose }: ExportSummaryModalProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [isDone, setIsDone] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const rows = await exportSummaryData();

      const excelRows: Record<string, any>[] = rows.map((r) => ({
        NIS: r.nis,
        Nama: r.nama,
        Kelas: r.kelas,
        "Total Poin": r.total_poin,
      }));

      excelRows.push({});
      excelRows.push({ NIS: `Total Siswa: ${rows.length}` });
      excelRows.push({ NIS: `Diekspor: ${new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" })}` });

      const worksheet = XLSX.utils.json_to_sheet(excelRows);
      worksheet["!cols"] = [
        { wch: 12 },
        { wch: 25 },
        { wch: 15 },
        { wch: 12 },
      ];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Summary Poin");

      const dateStr = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(workbook, `SUMMARY_POIN_${dateStr}.xlsx`);

      setIsDone(true);
    } catch (err: any) {
      alert("Gagal mengekspor summary: " + err.message);
    } finally {
      setIsExporting(false);
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
            className="bg-white rounded-3xl p-6 w-full max-w-sm border border-brand-100 shadow-2xl relative z-10"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex justify-between items-center border-b pb-3 border-brand-50 mb-5">
              <h3 className="text-base font-extrabold text-brand-950 flex items-center gap-2">
                <Download className="w-5 h-5 text-brand-600" />
                Export Summary Poin
              </h3>
              <button
                onClick={onClose}
                disabled={isExporting}
                className="p-1 text-brand-400 hover:text-brand-600 hover:bg-brand-50 rounded-xl cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {isDone ? (
              <div className="text-center py-6 space-y-3">
                <div className="w-14 h-14 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto">
                  <Check className="w-7 h-7 text-emerald-600" />
                </div>
                <h4 className="text-sm font-black text-brand-950">File Berhasil Diunduh!</h4>
                <p className="text-[11px] text-brand-500 font-medium">
                  Summary poin siswa telah tersimpan. Gunakan file ini untuk import setelah mengakhiri aktivitas.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-[11px] text-brand-500 font-medium leading-relaxed">
                  Export berisi <strong className="text-brand-700">NIS, Nama, Kelas, dan Total Poin</strong> saja (tanpa riwayat/deskripsi). File ini dapat diimport kembali untuk mengembalikan poin siswa.
                </p>

                <div className="flex gap-2 justify-end pt-2">
                  <button
                    onClick={onClose}
                    disabled={isExporting}
                    className="px-4 py-2.5 border border-brand-100 rounded-xl text-sm font-bold text-brand-600 hover:bg-brand-50 cursor-pointer disabled:opacity-50"
                  >
                    Batal
                  </button>
                  <button
                    onClick={handleExport}
                    disabled={isExporting}
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-sm shadow-md disabled:opacity-50 cursor-pointer flex items-center gap-2"
                  >
                    {isExporting ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Mengekspor...
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4" />
                        Download Excel
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
