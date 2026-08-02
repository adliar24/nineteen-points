import React from 'react';
import { Scan, Keyboard, QrCode, ScanFace } from 'lucide-react';

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
  return (
    <div className="space-y-2">
      <div className="bg-white rounded-2xl p-1.5 border border-brand-100/60 flex gap-2">
        <button
          onClick={() => onModeChange('scan')}
          className={`flex-1 py-3 px-4 text-xs sm:text-sm font-bold rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
            mode === 'scan'
              ? 'bg-brand-600 text-white shadow-md'
              : 'text-brand-600 hover:bg-brand-50'
          }`}
        >
          <Scan className="w-4 h-4" />
          Scan
        </button>
        <button
          onClick={() => onModeChange('manual')}
          className={`flex-1 py-3 px-4 text-xs sm:text-sm font-bold rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
            mode === 'manual'
              ? 'bg-brand-600 text-white shadow-md'
              : 'text-brand-600 hover:bg-brand-50'
          }`}
        >
          <Keyboard className="w-4 h-4" />
          Input Manual
        </button>
      </div>

      {mode === 'scan' && (
        <div className="flex gap-2">
          <button
            onClick={() => onScanTypeChange('qr')}
            className={`flex-1 py-2.5 px-4 text-xs font-black rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer whitespace-nowrap border ${
              scanType === 'qr'
                ? 'bg-brand-600 text-white border-transparent shadow-sm'
                : 'bg-white text-brand-600 border-brand-100 hover:bg-brand-50'
            }`}
          >
            <QrCode className="w-4 h-4" />
            Scan QR
          </button>
          <button
            onClick={() => onScanTypeChange('face')}
            className={`flex-1 py-2.5 px-4 text-xs font-black rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer whitespace-nowrap border ${
              scanType === 'face'
                ? 'bg-brand-600 text-white border-transparent shadow-sm'
                : 'bg-white text-brand-600 border-brand-100 hover:bg-brand-50'
            }`}
          >
            <ScanFace className="w-4 h-4" />
            Scan Wajah
          </button>
        </div>
      )}
    </div>
  );
}
