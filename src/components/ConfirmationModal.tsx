import React from "react";
import { X, AlertTriangle, LogOut, Trash2, HelpCircle } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { createPortal } from "react-dom";

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: "danger" | "warning" | "info" | "success";
}

export default function ConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = "Ya, Lanjutkan",
  cancelText = "Batal",
  type = "info",
}: ConfirmationModalProps) {
  
  const getIcon = () => {
    switch (type) {
      case "danger":
        return <Trash2 className="w-6 h-6 text-red-600" />;
      case "warning":
        return <AlertTriangle className="w-6 h-6 text-amber-600" />;
      case "success":
        return <AlertTriangle className="w-6 h-6 text-emerald-600" />;
      default:
        return <LogOut className="w-6 h-6 text-zinc-900" />;
    }
  };

  const getThemeClasses = () => {
    switch (type) {
      case "danger":
        return {
          iconBg: "bg-red-50 border border-red-100",
          confirmBtn: "bg-red-600 hover:bg-red-700 text-white focus:ring-red-500 shadow-md shadow-red-100",
        };
      case "warning":
        return {
          iconBg: "bg-amber-50 border border-amber-100",
          confirmBtn: "bg-amber-500 hover:bg-amber-600 text-white focus:ring-amber-500 shadow-md shadow-amber-100",
        };
      case "success":
        return {
          iconBg: "bg-emerald-50 border border-emerald-100",
          confirmBtn: "bg-emerald-600 hover:bg-emerald-700 text-white focus:ring-emerald-500 shadow-md shadow-emerald-100",
        };
      default:
        return {
          iconBg: "bg-zinc-100 border border-zinc-200",
          confirmBtn: "bg-zinc-900 hover:bg-zinc-950 text-white focus:ring-zinc-800 shadow-md shadow-zinc-250",
        };
    }
  };

  const theme = getThemeClasses();

  return (
    <AnimatePresence>
      {isOpen && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          {/* Backdrop blur with motion */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm"
          />

          {/* Modal Box */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            transition={{ type: "spring", duration: 0.4 }}
            className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-md p-6 z-10 overflow-hidden relative"
          >
            {/* Top Close Button */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1.5 hover:bg-slate-100 rounded-xl transition-all"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Content Area */}
            <div className="flex flex-col items-center text-center mt-2">
              <div className={`p-3.5 rounded-2xl mb-4 ${theme.iconBg} flex items-center justify-center`}>
                {getIcon()}
              </div>

              <h3 className="text-lg font-bold text-slate-900 tracking-tight">
                {title}
              </h3>
              
              <p className="text-sm text-slate-500 mt-2.5 leading-relaxed">
                {message}
              </p>
            </div>

            {/* Buttons Row with motion */}
            <div className="flex gap-3 mt-6">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={onClose}
                className="flex-1 py-3 px-4 border border-slate-200 hover:bg-slate-50 rounded-xl text-sm font-semibold text-slate-700 transition-colors focus:outline-none cursor-pointer"
              >
                {cancelText}
              </motion.button>
              
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={async () => {
                  await onConfirm();
                  onClose();
                }}
                className={`flex-1 py-3 px-4 rounded-xl text-sm font-semibold transition-colors focus:outline-none cursor-pointer ${theme.confirmBtn}`}
              >
                {confirmText}
              </motion.button>
            </div>
          </motion.div>
        </div>,
        document.body
      )}
    </AnimatePresence>
  );
}
