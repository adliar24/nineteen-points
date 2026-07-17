import React, { useState, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { createPortal } from "react-dom";
import { X, Upload, Check, AlertCircle } from "lucide-react";
import * as XLSX from "xlsx";
import { importSummaryData, SummaryRow } from "../dbStore";

interface ImportSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
}

export default function ImportSummaryModal({ isOpen, onClose, onComplete }: ImportSummaryModalProps) {
  const [isImporting, setIsImporting] = useState(false);
  const [result, setResult] = useState<{ updated: number; skipped: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setError(null);
    setResult(null);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json<Record<string, any>>(sheet);

      if (jsonData.length === 0) {
        setError("File kosong atau format tidak sesuai.");
        setIsImporting(false);
        return;
      }

      const rows: SummaryRow[] = jsonData
        .filter((row) => row["NIS"] && row["Total Poin"] !== undefined)
        .map((row) => ({
          nis: String(row["NIS"]).trim(),
          nama: String(row["Nama"] || "-").trim(),
          kelas: String(row["Kelas"] || "-").trim(),
          total_poin: Number(row["Total Poin"]) || 0,
        }));

      if (rows.length === 0) {
        setError("Tidak ada data siswa ditemukan. Pastikan kolom NIS dan Total Poin tersedia.");
        setIsImporting(false);
        return;
      }

      const importResult = await importSummaryData(rows);
      setResult(importResult);
      onComplete();
    } catch (err: any) {
      setError("Gagal mengimport file: " + err.message);
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
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
                <Upload className="w-5 h-5 text-brand-600" />
                Import Summary Poin
              </h3>
              <button
                onClick={onClose}
                disabled={isImporting}
                className="p-1 text-brand-400 hover:text-brand-600 hover:bg-brand-50 rounded-xl cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {result ? (
              <div className="text-center py-6 space-y-3">
                <div className="w-14 h-14 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto">
                  <Check className="w-7 h-7 text-emerald-600" />
                </div>
                <h4 className="text-sm font-black text-brand-950">Import Berhasil!</h4>
                <p className="text-[11px] text-brand-500 font-medium">
                  <strong className="text-emerald-700">{result.updated}</strong> siswa berhasil diperbarui.
                  {result.skipped > 0 && (
                    <> <strong className="text-amber-600">{result.skipped}</strong> dilewati (NIS tidak ditemukan).</>
                  )}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-[11px] text-brand-500 font-medium leading-relaxed">
                  Upload file Excel (<strong className="text-brand-700">Summary Poin</strong>) yang sebelumnya diexport. Sistem akan memperbarui total poin berdasarkan kolom <strong className="text-brand-700">NIS</strong> dan <strong className="text-brand-700">Total Poin</strong>.
                </p>

                {error && (
                  <div className="bg-rose-50 border border-rose-200 rounded-2xl p-3 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-500 flex-shrink-0 mt-0.5" />
                    <p className="text-[11px] text-rose-700 font-medium">{error}</p>
                  </div>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleImport}
                  className="hidden"
                />

                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isImporting}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-brand-50 hover:bg-brand-100 text-brand-700 border border-brand-200 rounded-2xl text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
                >
                  {isImporting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-brand-300 border-t-brand-700 rounded-full animate-spin" />
                      Mengimport...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      Pilih File Excel
                    </>
                  )}
                </button>

                <div className="flex justify-end pt-2">
                  <button
                    onClick={onClose}
                    disabled={isImporting}
                    className="px-4 py-2.5 border border-brand-100 rounded-xl text-sm font-bold text-brand-600 hover:bg-brand-50 cursor-pointer disabled:opacity-50"
                  >
                    Tutup
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
