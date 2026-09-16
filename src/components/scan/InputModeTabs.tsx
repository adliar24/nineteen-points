import React from 'react';
import { Keyboard, QrCode, ScanFace } from 'lucide-react';

export type InputMode = 'scan' | 'manual';
export type ScanType = 'qr' | 'face';

interface InputModeTabsProps {
  mode: InputMode;
  scanType: ScanType;
  onModeChange: (mode: InputMode) => void;
  onScanTypeChange: (scanType: ScanType) => void;
}

export default function InputModeTabs({
  mode,
  scanType,
  onModeChange,
  onScanTypeChange,
}: InputModeTabsProps) {
  const isQr = mode === 'scan' && scanType === 'qr';
  const isFace = mode === 'scan' && scanType === 'face';
  const isManual = mode === 'manual';

  return (
    <div className="bg-white/95 backdrop-blur-xl p-1.5 rounded-2xl border border-brand-150/90 shadow-md shadow-brand-950/5 flex items-center gap-1.5">
      {/* 1. Scan QR */}
      <button
        type="button"
        onClick={() => {
          onModeChange('scan');
          onScanTypeChange('qr');
        }}
        className={`flex-1 py-3 px-3.5 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all duration-200 cursor-pointer whitespace-nowrap ${
          isQr
            ? 'bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-500 text-white shadow-md shadow-emerald-600/30 scale-[1.01]'
            : 'text-slate-600 hover:text-brand-950 hover:bg-brand-50/70'
        }`}
      >
        <QrCode className={`w-4 h-4 flex-shrink-0 ${isQr ? 'text-white' : 'text-emerald-600'}`} />
        <span className="tracking-wide">Scan QR</span>
      </button>

      {/* 2. Scan Wajah */}
      <button
        type="button"
        onClick={() => {
          onModeChange('scan');
          onScanTypeChange('face');
        }}
        className={`flex-1 py-3 px-3.5 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all duration-200 cursor-pointer whitespace-nowrap ${
          isFace
            ? 'brand-gradient text-white shadow-md shadow-brand-500/30 scale-[1.01]'
            : 'text-slate-600 hover:text-brand-950 hover:bg-brand-50/70'
        }`}
      >
        <ScanFace className={`w-4 h-4 flex-shrink-0 ${isFace ? 'text-white' : 'text-brand-600'}`} />
        <span className="tracking-wide">Scan Wajah</span>
      </button>

      {/* 3. Input Manual */}
      <button
        type="button"
        onClick={() => onModeChange('manual')}
        className={`flex-1 py-3 px-3.5 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all duration-200 cursor-pointer whitespace-nowrap ${
          isManual
            ? 'bg-gradient-to-r from-indigo-600 via-purple-600 to-brand-600 text-white shadow-md shadow-indigo-600/30 scale-[1.01]'
            : 'text-slate-600 hover:text-brand-950 hover:bg-brand-50/70'
        }`}
      >
        <Keyboard className={`w-4 h-4 flex-shrink-0 ${isManual ? 'text-white' : 'text-indigo-600'}`} />
        <span className="tracking-wide">Input Manual</span>
      </button>
    </div>
  );
}
