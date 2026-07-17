import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { createPortal } from "react-dom";
import { X, AlertTriangle, Check, RotateCcw } from "lucide-react";
import { getRiwayatCount, akhiriAktivitas } from "../dbStore";

interface AkhiriAktivitasModalProps {
  isOpen: boolean;
  onClose: () => void;
  onResetComplete: () => void;
}

const CONFIRM_TEXT = "AKHIRI";

export default function AkhiriAktivitasModal({
  isOpen,
  onClose,
  onResetComplete,
}: AkhiriAktivitasModalProps) {
  const [riwayatCount, setRiwayatCount] = useState(0);
  const [confirmText, setConfirmText] = useState("");
  const [isResetting, setIsResetting] = useState(false);
  const [step, setStep] = useState<"info" | "done">("info");

  useEffect(() => {
    if (isOpen) {
      setConfirmText("");
      setIsResetting(false);
      setStep("info");
      loadRiwayatCount();
    }
  }, [isOpen]);

  const loadRiwayatCount = async () => {
    const count = await getRiwayatCount();
    setRiwayatCount(count);
  };

  const handleReset = async () => {
    if (confirmText.trim().toUpperCase() !== CONFIRM_TEXT) return;

    setIsResetting(true);
    try {
      await akhiriAktivitas();
      setStep("done");
      setTimeout(() => {
        onResetComplete();
        onClose();
      }, 2000);
    } catch (err: any) {
      alert("Gagal mengakhiri aktivitas: " + err.message);
    } finally {
      setIsResetting(false);
    }
  };

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12, ease: "easeOut" }}
            className="fixed inset-0 bg-brand-950/60 backdrop-blur-xs"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ 
              opacity: 0, 
              scale: 0.96, 
              y: 8,
              transition: { duration: 0.12, ease: "easeInOut" }
            }}
            transition={{ type: "spring", stiffness: 450, damping: 38 }}
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
                <h4 className="text-sm font-black text-brand-950">Aktivitas Poin Berhasil Diakhiri!</h4>
                <p className="text-xs text-brand-500 font-medium">
                  Semua riwayat poin telah dihapus. Poin siswa telah direset ke 0.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Info */}
                <div className="bg-brand-50/70 border border-brand-100 rounded-2xl p-4 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-black text-brand-400 uppercase tracking-wider">Total Riwayat</span>
                    <span className="text-xs font-black text-brand-900">{riwayatCount.toLocaleString("id-ID")} catatan</span>
                  </div>
                </div>

                {/* Warning */}
                <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
                  <div className="text-[11px] text-rose-800 font-medium leading-relaxed">
                    <strong>Penting:</strong> Semua riwayat poin akan dihapus permanen dan poin siswa akan direset ke <strong>0</strong>. Gunakan <strong>Export Summary</strong> sebelum mengakhiri aktivitas untuk membackup data poin siswa.
                  </div>
                </div>

                {/* Confirmation */}
                <div className="space-y-2">
                  <p className="text-[11px] text-brand-500 font-medium">
                    Ketik <strong className="text-brand-700 font-black">AKHIRI</strong> untuk konfirmasi:
                  </p>
                  <input
                    type="text"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder="AKHIRI"
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
                    disabled={isResetting || confirmText.trim().toUpperCase() !== CONFIRM_TEXT}
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
                        Akhiri Sekarang
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
