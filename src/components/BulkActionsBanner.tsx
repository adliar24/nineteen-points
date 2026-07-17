import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { Trash2 } from "lucide-react";

interface BulkActionsBannerProps {
  count: number;
  label: string;
  onCancel: () => void;
  onConfirm: () => void;
  isConfirming?: boolean;
}

export default React.memo(function BulkActionsBanner({
  count,
  label,
  onCancel,
  onConfirm,
  isConfirming = false,
}: BulkActionsBannerProps) {
  return (
    <AnimatePresence>
      {count > 0 && (
        <motion.div
          initial={{ height: 0, opacity: 0, y: -10 }}
          animate={{ height: "auto", opacity: 1, y: 0 }}
          exit={{ height: 0, opacity: 0, y: -10 }}
          className="overflow-hidden"
        >
          <div className="bg-rose-50 border border-rose-100 rounded-3xl p-4 flex items-center justify-between shadow-lg shadow-rose-900/5">
            <div className="flex items-center gap-2.5">
              <Trash2 className="w-5 h-5 text-rose-600 animate-pulse" />
              <span className="text-xs font-black text-rose-950 uppercase tracking-wider">
                {count} {label} Terpilih
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={onCancel}
                className="px-3.5 py-2 hover:bg-rose-100 text-rose-800 rounded-2xl text-[10px] font-black uppercase transition-all cursor-pointer border border-transparent"
              >
                Batal
              </button>
              <button
                onClick={onConfirm}
                disabled={isConfirming}
                className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl text-[10px] font-black uppercase transition-all shadow-md cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {isConfirming ? "Menghapus..." : "Hapus Terpilih"}
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});
