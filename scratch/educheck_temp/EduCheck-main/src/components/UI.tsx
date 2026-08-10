import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, X, Check, Search, Plus, QrCode, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';

// --- BRAND LOGO ---
export const BrandLogo: React.FC<{ className?: string }> = ({ className = "w-6 h-6" }) => {
  return (
    <div className={`relative ${className}`}>
      <QrCode className="w-full h-full" />
      <div className="absolute -bottom-[5%] -right-[5%] w-[45%] h-[45%] bg-emerald-500 rounded-full border-2 border-white flex items-center justify-center">
         <Check className="w-[60%] h-[60%] text-white" strokeWidth={4} />
      </div>
    </div>
  )
}

// --- BUTTON ---
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'outline' | 'ghost';
  isLoading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({ 
  children, variant = 'primary', className = '', isLoading, disabled, ...props 
}) => {
  const baseStyle = "relative inline-flex items-center justify-center gap-2 px-6 py-3 rounded-2xl font-semibold text-sm transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed";
  
  const variants = {
    primary: "bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-200 focus:ring-emerald-500",
    secondary: "bg-emerald-100 hover:bg-emerald-200 text-emerald-800 focus:ring-emerald-300",
    danger: "bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-200 focus:ring-red-500",
    outline: "border-2 border-emerald-500 text-emerald-600 hover:bg-emerald-50 focus:ring-emerald-500",
    ghost: "bg-transparent text-gray-600 hover:bg-gray-100",
  };

  return (
    <motion.button
      whileTap={{ scale: 0.98 }}
      className={`${baseStyle} ${variants[variant]} ${className}`}
      disabled={isLoading || disabled}
      {...(props as any)}
    >
      {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : children}
    </motion.button>
  );
};

// --- INPUT ---
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export const Input: React.FC<InputProps> = ({ label, className = '', ...props }) => {
  return (
    <div className="flex flex-col gap-1.5 w-full">
      {label && <label className="text-sm font-medium text-gray-700 ml-1">{label}</label>}
      <input 
        className={`w-full bg-white text-gray-900 border border-gray-200 rounded-2xl px-4 py-3 text-base placeholder:text-gray-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 transition-all outline-none ${className}`}
        {...props}
      />
    </div>
  );
};

// --- CARD ---
export const Card: React.FC<{ children: React.ReactNode; className?: string, onClick?: () => void }> = ({ children, className = '', onClick }) => (
  <motion.div 
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    className={`bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden ${className}`}
    onClick={onClick}
  >
    {children}
  </motion.div>
);

// --- MODAL ---
interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | 'full';
}

export const Modal: React.FC<ModalProps> = ({ 
  isOpen, onClose, title, children, size = 'md' 
}) => {
  const sizeClasses = {
    sm: 'max-w-sm',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
    '2xl': 'max-w-6xl',
    '3xl': 'max-w-[85rem]',
    full: 'max-w-[95vw]'
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 z-50 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6"
            onClick={onClose}
          >
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }} 
              animate={{ opacity: 1, scale: 1, y: 0 }} 
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className={`w-full ${sizeClasses[size]} bg-white rounded-3xl shadow-2xl z-50 overflow-hidden flex flex-col max-h-[85vh] sm:max-h-[90vh]`}
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-5 border-b border-gray-100 shrink-0">
                <h3 className="text-lg font-bold text-gray-800">{title}</h3>
                <button type="button" onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
              <div className="p-5 overflow-y-auto">
                {children}
              </div>
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

// --- CONFIRM MODAL ---
interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'primary';
  isLoading?: boolean;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({ 
  isOpen, onClose, onConfirm, title, description, 
  confirmText = "Hapus", cancelText = "Batal", variant = "danger", isLoading 
}) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
       <div className="flex flex-col gap-6">
          <div className="flex items-start gap-4">
             <div className="p-3 bg-amber-50 text-amber-500 rounded-full shrink-0">
               <AlertTriangle className="w-6 h-6" />
             </div>
             <div>
               <p className="text-gray-600 text-sm leading-relaxed font-medium">{description}</p>
             </div>
          </div>
          <div className="flex justify-end gap-3 mt-2">
             <Button type="button" variant="ghost" onClick={onClose} disabled={isLoading} className="!text-gray-500 hover:!bg-gray-100">{cancelText}</Button>
             <Button type="button" variant={variant} onClick={onConfirm} isLoading={isLoading}>{confirmText}</Button>
          </div>
       </div>
    </Modal>
  )
}

// --- TOAST NOTIFICATION ---
interface ToastProps {
  message: string;
  type?: 'success' | 'error';
  onClose: () => void;
}

export const Toast: React.FC<ToastProps> = ({ message, type = 'success', onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000); // Auto close after 3s
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 50, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20, scale: 0.95 }}
      className={`fixed bottom-6 right-6 z-[100] flex items-center gap-4 px-6 py-4 rounded-2xl shadow-2xl border cursor-pointer ${type === 'success' ? 'bg-white border-emerald-100 text-gray-800' : 'bg-red-50 border-red-100 text-red-900'}`}
      onClick={onClose}
    >
      <div className={`p-1.5 rounded-full shrink-0 ${type === 'success' ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'}`}>
        {type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
      </div>
      <div>
         <h4 className="font-bold text-sm leading-none mb-1">{type === 'success' ? 'Berhasil' : 'Gagal'}</h4>
         <p className="text-xs opacity-90 font-medium">{message}</p>
      </div>
    </motion.div>
  )
}

// --- SEARCHABLE MULTI SELECT (Custom) ---
interface MultiSelectProps {
  label: string;
  options: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
  onAddCustom?: (val: string) => void;
  placeholder?: string;
  single?: boolean;
}

export const MultiSelect: React.FC<MultiSelectProps> = ({ 
  label, options, selected, onChange, onAddCustom, placeholder = "Pilih...", single = false 
}) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const [isCustomMode, setIsCustomMode] = React.useState(false);
  const [customVal, setCustomVal] = React.useState('');

  const filtered = options.filter(o => o.toLowerCase().includes(search.toLowerCase()));

  const toggleSelection = (val: string) => {
    if (single) {
      onChange([val]);
      setIsOpen(false);
    } else {
      if (selected.includes(val)) {
        onChange(selected.filter(s => s !== val));
      } else {
        onChange([...selected, val]);
      }
    }
  };

  const handleAddCustom = () => {
    if (customVal.trim() && onAddCustom) {
      onAddCustom(customVal.trim());
      setCustomVal('');
      setIsCustomMode(false);
    }
  };

  return (
    <div className="w-full flex flex-col gap-1.5">
      <label className="text-sm font-medium text-gray-700 ml-1">{label}</label>
      <div 
        onClick={() => setIsOpen(true)}
        className="bg-white border border-gray-200 rounded-2xl px-4 py-3 min-h-[50px] cursor-pointer flex flex-wrap gap-2 items-center hover:border-emerald-400 transition-colors"
      >
        {selected.length === 0 && <span className="text-gray-400">{placeholder}</span>}
        {selected.map(s => (
          <span key={s} className="bg-emerald-100 text-emerald-800 text-xs font-semibold px-2 py-1 rounded-lg border border-emerald-200">
            {s}
          </span>
        ))}
      </div>

      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title={`Pilih ${label}`}>
        {!isCustomMode ? (
          <div className="flex flex-col gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-3.5 w-5 h-5 text-gray-500" />
              <input 
                autoFocus
                placeholder="Cari..." 
                className="w-full pl-10 pr-4 py-3 bg-white text-gray-900 rounded-xl border border-gray-200 outline-none focus:ring-2 focus:ring-emerald-500 placeholder:text-gray-400 font-medium"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            
            {onAddCustom && (
              <button 
                type="button"
                onClick={() => setIsCustomMode(true)}
                className="flex items-center gap-2 text-emerald-600 font-medium px-2 py-2 hover:bg-emerald-50 rounded-xl transition-colors"
              >
                <Plus className="w-4 h-4" />
                Tambah "{search || 'Baru'}" (Kustom)
              </button>
            )}

            <div className="flex flex-col gap-1 max-h-[40vh] overflow-y-auto pr-1">
              {filtered.map(opt => {
                const isSelected = selected.includes(opt);
                return (
                  <button 
                    type="button"
                    key={opt}
                    onClick={() => toggleSelection(opt)}
                    className={`flex items-center justify-between px-4 py-3 rounded-xl text-left transition-all ${isSelected ? 'bg-emerald-500 text-white shadow-emerald-200 shadow-sm' : 'hover:bg-gray-50 text-gray-800'}`}
                  >
                    <span className="text-sm font-medium">{opt}</span>
                    {isSelected && <Check className="w-4 h-4" />}
                  </button>
                )
              })}
              {filtered.length === 0 && (
                <div className="text-center py-8 text-gray-400">Tidak ditemukan</div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
             <p className="text-sm text-gray-500">Masukkan nama mapel baru yang belum ada di daftar.</p>
             <Input 
                autoFocus
                placeholder="Nama Mapel Kustom"
                value={customVal}
                onChange={e => setCustomVal(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        e.stopPropagation();
                        handleAddCustom();
                    }
                }}
             />
             <div className="flex gap-2 mt-2">
               <Button type="button" variant="secondary" onClick={() => setIsCustomMode(false)} className="flex-1">Batal</Button>
               <Button type="button" onClick={handleAddCustom} className="flex-1">Simpan</Button>
             </div>
          </div>
        )}
      </Modal>
    </div>
  );
};