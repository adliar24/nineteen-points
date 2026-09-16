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
    <div className="bg-slate-100/90 p-1.5 rounded-2xl border border-slate-200/80 flex items-center gap-1.5 shadow-inner">
      {/* 1. Scan QR */}
      <button
        type="button"
        onClick={() => {
          onModeChange('scan');
          onScanTypeChange('qr');
        }}
        className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
          isQr
            ? 'bg-white text-emerald-700 shadow-sm border border-slate-200/60'
            : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
        }`}
      >
        <QrCode className="w-4 h-4 text-emerald-600 flex-shrink-0" />
        <span>Scan QR</span>
      </button>

      {/* 2. Scan Wajah */}
      <button
        type="button"
        onClick={() => {
          onModeChange('scan');
          onScanTypeChange('face');
        }}
        className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
          isFace
            ? 'bg-white text-brand-700 shadow-sm border border-slate-200/60'
            : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
        }`}
      >
        <ScanFace className="w-4 h-4 text-brand-600 flex-shrink-0" />
        <span>Scan Wajah</span>
      </button>

      {/* 3. Input Manual */}
      <button
        type="button"
        onClick={() => onModeChange('manual')}
        className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
          isManual
            ? 'bg-white text-indigo-700 shadow-sm border border-slate-200/60'
            : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
        }`}
      >
        <Keyboard className="w-4 h-4 text-indigo-600 flex-shrink-0" />
        <span>Input Manual</span>
      </button>
    </div>
  );
}
