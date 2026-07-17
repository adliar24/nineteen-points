import React from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import { X, Printer } from "lucide-react";
import { Siswa } from "../types";
import { toSentenceCase } from "../formatName";

interface StudentDetailPopupProps {
  isOpen: boolean;
  onClose: () => void;
  student: Siswa | null;
  onDownloadCard: (siswa: Siswa) => void;
}

export default function StudentDetailPopup({
  isOpen,
  onClose,
  student,
  onDownloadCard,
}: StudentDetailPopupProps) {
  return createPortal(
    <AnimatePresence>
      {isOpen && student && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-brand-950/60 backdrop-blur-xs p-4"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="bg-white rounded-3xl shadow-2xl border border-brand-100 p-6 max-w-sm w-full space-y-5 relative z-10"
          >
            <div className="flex justify-between items-start">
              <h4 className="text-lg font-black text-brand-950">Detail Murid</h4>
              <button
                onClick={onClose}
                className="p-2 hover:bg-brand-50 text-brand-400 hover:text-brand-700 rounded-xl transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex flex-col items-center text-center">
              {student.foto_url ? (
                <img
                  src={student.foto_url}
                  alt={student.nama}
                  className="w-[180px] h-[240px] rounded-2xl object-cover border-2 border-brand-100 shadow-lg mb-4"
                />
              ) : (
                <div className="w-[180px] h-[240px] rounded-2xl bg-brand-50 flex items-center justify-center text-brand-300 font-black text-5xl uppercase border-2 border-brand-100 mb-4">
                  {student.nama.slice(0, 2)}
                </div>
              )}

              <h3 className="text-base font-extrabold text-brand-950">
                {toSentenceCase(student.nama)}
              </h3>
              <div className="mt-2 space-y-1 text-xs font-semibold text-brand-600">
                <p>
                  <span className="font-black text-brand-400 uppercase">NIS:</span> {student.nis}
                </p>
                <p>
                  <span className="font-black text-brand-400 uppercase">Kelas:</span>{" "}
                  {student.kelas}
                </p>
                <p>
                  <span className="font-black text-brand-400 uppercase">Skor:</span>{" "}
                  <span
                    className={
                      student.total_poin >= 100
                        ? "text-emerald-600"
                        : student.total_poin > 0
                        ? "text-amber-500"
                        : student.total_poin === 0
                        ? "text-slate-400"
                        : "text-rose-500"
                    }
                  >
                    {student.total_poin} pts
                  </span>
                </p>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => onDownloadCard(student)}
                className="flex-1 flex items-center justify-center gap-2 py-3 bg-brand-50 hover:bg-brand-100 text-brand-700 border border-brand-200 rounded-2xl text-sm font-black transition-all cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                Unduh Kartu
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
