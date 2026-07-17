import React from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import { X, type LucideIcon } from "lucide-react";

interface ModalPortalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  icon?: LucideIcon;
  maxWidth?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export default function ModalPortal({
  isOpen,
  onClose,
  title,
  icon: Icon,
  maxWidth = "max-w-md",
  children,
  footer,
}: ModalPortalProps) {
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
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ 
              opacity: 0, 
              scale: 0.96, 
              y: 8,
              transition: { duration: 0.12, ease: "easeInOut" }
            }}
            transition={{ type: "spring", stiffness: 450, damping: 38 }}
            className={`relative bg-white rounded-3xl p-6 w-full ${maxWidth} shadow-2xl border border-brand-100 max-h-[90vh] overflow-y-auto z-10`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex justify-between items-center border-b pb-3 border-brand-50 mb-4">
              <h3 className="text-base font-black text-brand-950 flex items-center gap-2">
                {Icon && <Icon className="w-4 h-4 text-brand-500" />}
                {title}
              </h3>
              <button
                onClick={onClose}
                className="text-2xl text-brand-300 hover:text-brand-600 transition-colors cursor-pointer leading-none"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div>{children}</div>

            {/* Footer */}
            {footer && (
              <div className="flex gap-2 justify-end pt-4 border-t border-brand-50 mt-4">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
