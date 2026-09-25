import React, { useState } from "react";
import { Download, FileText, Image as ImageIcon, Scissors, Sparkles, Check, RefreshCw } from "lucide-react";
import ModalPortal from "./ModalPortal";
import { KegiatanGuru } from "../types";
import { SertifikatLayoutConfig } from "../sertifikatConfig";
import {
  PaperSizeOption,
  FileFormatOption,
  SingleLayout2in1Option,
  PageSelectionOption,
  exportSingleCertificate,
  exportBatchCertificates
} from "../services/certificateExportService";
import { toSentenceCase } from "../formatName";

export interface CertificateExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  // If target is single
  kegiatanSingle?: KegiatanGuru | null;
  userNameOverride?: string;
  // If target is batch
  batchFolderName?: string | null;
  batchItems?: KegiatanGuru[] | null;
  config: SertifikatLayoutConfig;
}

export default function CertificateExportModal({
  isOpen,
  onClose,
  kegiatanSingle,
  userNameOverride,
  batchFolderName,
  batchItems,
  config
}: CertificateExportModalProps) {
  const isBatch = Boolean(batchFolderName && batchItems && batchItems.length > 0);

  // States
  const [paperSize, setPaperSize] = useState<PaperSizeOption>("a4_2in1");
  const [fileFormat, setFileFormat] = useState<FileFormatOption>("pdf");
  const [singleLayout2in1, setSingleLayout2in1] = useState<SingleLayout2in1Option>("duplicate");
  const [pageOption, setPageOption] = useState<PageSelectionOption>("front");
  const [withCuttingLine, setWithCuttingLine] = useState<boolean>(true);

  // Progress state
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [progressInfo, setProgressInfo] = useState<{ current: number; total: number; text: string } | null>(null);

  const hasJp =
    config.hasJpPage &&
    (config.materiJpRows?.length > 0 ||
      Boolean(kegiatanSingle?.materi_jp && kegiatanSingle.materi_jp.length > 0) ||
      Boolean(batchItems?.some((i) => i.materi_jp && i.materi_jp.length > 0)));

  const handleStartExport = async () => {
    setIsProcessing(true);
    setProgressInfo(null);

    try {
      if (isBatch && batchFolderName && batchItems) {
        await exportBatchCertificates({
          folderName: batchFolderName,
          items: batchItems,
          config,
          paperSize,
          fileFormat,
          pageOption: paperSize === "a4_2in1" ? pageOption : pageOption,
          withCuttingLine,
          onProgress: (current, total, text) => {
            setProgressInfo({ current, total, text });
          }
        });
      } else if (kegiatanSingle) {
        await exportSingleCertificate({
          kegiatan: kegiatanSingle,
          userNameOverride,
          config,
          paperSize,
          fileFormat,
          layout2in1: singleLayout2in1,
          pageOption,
          withCuttingLine
        });
      }
      onClose();
    } catch (err: any) {
      alert("Gagal mengekspor sertifikat: " + (err.message || String(err)));
    } finally {
      setIsProcessing(false);
      setProgressInfo(null);
    }
  };

  const recipientName =
    userNameOverride || kegiatanSingle?.user_nama || (isBatch ? `${batchItems?.length || 0} Penerima` : "Penerima SMAN 19");

  return (
    <ModalPortal
      isOpen={isOpen}
      onClose={() => {
        if (!isProcessing) onClose();
      }}
      title="Opsi Cetak & Ekspor Sertifikat"
      maxWidth="max-w-xl"
    >
      <div className="space-y-5 text-slate-800">
        {/* Info Target Banner */}
        <div className="p-3.5 bg-gradient-to-r from-brand-50 to-indigo-50 border border-brand-100 rounded-2xl flex items-center justify-between">
          <div>
            <div className="text-[11px] font-black uppercase text-brand-600 tracking-wider">
              {isBatch ? "Mode Cetak Massal (Folder)" : "Mode Cetak Tunggal"}
            </div>
            <div className="text-sm font-bold text-brand-950 truncate max-w-sm">
              {isBatch ? batchFolderName : toSentenceCase(recipientName)}
            </div>
            {isBatch && batchItems && (
              <div className="text-[11px] text-slate-500 font-medium">
                Total {batchItems.length} penerima sertifikat siap diproses
              </div>
            )}
          </div>
          <div className="w-10 h-10 rounded-2xl bg-white border border-brand-200/60 shadow-sm flex items-center justify-center text-brand-600 font-black text-sm">
            {isBatch ? batchItems?.length : "1x"}
          </div>
        </div>

        {/* 1. UKURAN KERTAS & LAYOUT */}
        <div className="space-y-2">
          <label className="text-xs font-black uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
            1. Pilihan Ukuran Kertas & Layout
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* OPSI A4 2-IN-1 (2x A5) */}
            <div
              onClick={() => setPaperSize("a4_2in1")}
              className={`p-3.5 rounded-2xl border-2 transition-all cursor-pointer relative ${
                paperSize === "a4_2in1"
                  ? "bg-brand-50/60 border-brand-600 shadow-md shadow-brand-900/5 ring-2 ring-brand-500/20"
                  : "bg-white border-slate-200 hover:border-brand-200"
              }`}
            >
              <div className="absolute top-2.5 right-2.5">
                <span className="px-2 py-0.5 bg-emerald-600 text-white rounded-full text-[9px] font-black uppercase tracking-wider flex items-center gap-1 shadow-sm">
                  <Sparkles className="w-2.5 h-2.5" />
                  Hemat Kertas
                </span>
              </div>
              <div className="flex items-center gap-3">
                {/* Visual Icon A4 2x A5 */}
                <div className="w-10 h-14 bg-white border-2 border-slate-300 rounded-lg p-1 flex flex-col justify-between shadow-sm">
                  <div className="h-5 bg-brand-200/80 rounded flex items-center justify-center text-[7px] font-bold text-brand-800">
                    A5
                  </div>
                  <div className="border-t border-dashed border-slate-400 w-full" />
                  <div className="h-5 bg-brand-200/80 rounded flex items-center justify-center text-[7px] font-bold text-brand-800">
                    A5
                  </div>
                </div>
                <div>
                  <div className="text-xs font-black text-brand-950 flex items-center gap-1">
                    A4 Isi 2x A5 (2-in-1)
                    {paperSize === "a4_2in1" && <Check className="w-3.5 h-3.5 text-brand-600 inline" />}
                  </div>
                  <div className="text-[10px] text-slate-500 leading-relaxed mt-0.5">
                    1 lembar A4 portrait memuat 2 sertifikat ukuran A5 landscape.
                  </div>
                </div>
              </div>
            </div>

            {/* OPSI STANDAR (1 PER LEMBAR) */}
            <div
              onClick={() => setPaperSize("standard")}
              className={`p-3.5 rounded-2xl border-2 transition-all cursor-pointer ${
                paperSize === "standard"
                  ? "bg-brand-50/60 border-brand-600 shadow-md shadow-brand-900/5 ring-2 ring-brand-500/20"
                  : "bg-white border-slate-200 hover:border-brand-200"
              }`}
            >
              <div className="flex items-center gap-3">
                {/* Visual Icon Standard Landscape */}
                <div className="w-12 h-9 bg-white border-2 border-slate-300 rounded-lg p-1 flex items-center justify-center shadow-sm">
                  <div className="w-full h-full bg-slate-200 rounded flex items-center justify-center text-[8px] font-bold text-slate-600">
                    A4
                  </div>
                </div>
                <div>
                  <div className="text-xs font-black text-brand-950 flex items-center gap-1">
                    Standar (1 Lembar)
                    {paperSize === "standard" && <Check className="w-3.5 h-3.5 text-brand-600 inline" />}
                  </div>
                  <div className="text-[10px] text-slate-500 leading-relaxed mt-0.5">
                    1 lembar memuat 1 sertifikat landscape penuh.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 2. SUSUNAN HALAMAN & KONTEN */}
        <div className="space-y-2">
          <label className="text-xs font-black uppercase tracking-wider text-slate-600">
            2. Susunan Halaman / Konten
          </label>

          {paperSize === "a4_2in1" ? (
            /* SUSUNAN 2-IN-1 */
            !isBatch ? (
              /* SINGLE: DUPLIKAT vs DEPAN-BELAKANG */
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setSingleLayout2in1("duplicate")}
                  className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                    singleLayout2in1 === "duplicate"
                      ? "bg-brand-100/70 border-brand-600 text-brand-950 font-bold"
                      : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  <div className="text-xs font-black flex items-center justify-between">
                    2 Rangkap Duplikat Identik
                    {singleLayout2in1 === "duplicate" && <Check className="w-3.5 h-3.5 text-brand-600" />}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5 font-normal">
                    Sertifikat dicetak 2x (atas & bawah). Cocok untuk arsip + serah terima.
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setSingleLayout2in1("front_back")}
                  disabled={!hasJp}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    !hasJp
                      ? "opacity-40 cursor-not-allowed bg-slate-50 border-slate-200"
                      : singleLayout2in1 === "front_back"
                      ? "bg-brand-100/70 border-brand-600 text-brand-950 font-bold cursor-pointer"
                      : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 cursor-pointer"
                  }`}
                >
                  <div className="text-xs font-black flex items-center justify-between">
                    Depan & Belakang (1 Lembar)
                    {singleLayout2in1 === "front_back" && <Check className="w-3.5 h-3.5 text-brand-600" />}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5 font-normal">
                    {hasJp
                      ? "Atas: Halaman Depan, Bawah: Tabel JP Belakang."
                      : "Tidak tersedia (sertifikat tidak memiliki halaman belakang)."}
                  </div>
                </button>
              </div>
            ) : (
              /* BATCH: PILIHAN HALAMAN DEPAN / BELAKANG / BOTH */
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setPageOption("front")}
                  className={`p-2.5 rounded-xl border text-left cursor-pointer transition-all ${
                    pageOption === "front"
                      ? "bg-brand-100/70 border-brand-600 text-brand-950 font-bold"
                      : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  <div className="text-xs font-black flex items-center justify-between">
                    Depan Saja
                    {pageOption === "front" && <Check className="w-3.5 h-3.5 text-brand-600" />}
                  </div>
                  <div className="text-[9px] text-slate-500 mt-0.5 font-normal">
                    2 orang berbeda per lembar A4
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setPageOption("both")}
                  disabled={!hasJp}
                  className={`p-2.5 rounded-xl border text-left transition-all ${
                    !hasJp
                      ? "opacity-40 cursor-not-allowed bg-slate-50 border-slate-200"
                      : pageOption === "both"
                      ? "bg-brand-100/70 border-brand-600 text-brand-950 font-bold cursor-pointer"
                      : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 cursor-pointer"
                  }`}
                >
                  <div className="text-xs font-black flex items-center justify-between">
                    Depan & Belakang
                    {pageOption === "both" && <Check className="w-3.5 h-3.5 text-brand-600" />}
                  </div>
                  <div className="text-[9px] text-slate-500 mt-0.5 font-normal">
                    {hasJp ? "Siap cetak bolak-balik (duplex)" : "Tidak ada hal. belakang"}
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setPageOption("back")}
                  disabled={!hasJp}
                  className={`p-2.5 rounded-xl border text-left transition-all ${
                    !hasJp
                      ? "opacity-40 cursor-not-allowed bg-slate-50 border-slate-200"
                      : pageOption === "back"
                      ? "bg-brand-100/70 border-brand-600 text-brand-950 font-bold cursor-pointer"
                      : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 cursor-pointer"
                  }`}
                >
                  <div className="text-xs font-black flex items-center justify-between">
                    Belakang Saja
                    {pageOption === "back" && <Check className="w-3.5 h-3.5 text-brand-600" />}
                  </div>
                  <div className="text-[9px] text-slate-500 mt-0.5 font-normal">
                    {hasJp ? "Hanya tabel JP 2 penerima" : "Tidak ada hal. belakang"}
                  </div>
                </button>
              </div>
            )
          ) : (
            /* STANDARD SUSUNAN */
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setPageOption("both")}
                disabled={!hasJp}
                className={`p-2.5 rounded-xl border text-center transition-all ${
                  !hasJp
                    ? "opacity-40 cursor-not-allowed bg-slate-50 border-slate-200 text-slate-400"
                    : pageOption === "both"
                    ? "bg-brand-100/70 border-brand-600 text-brand-950 font-bold cursor-pointer"
                    : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 cursor-pointer"
                }`}
              >
                <div className="text-xs font-bold">Lengkap (Depan+JP)</div>
              </button>
              <button
                type="button"
                onClick={() => setPageOption("front")}
                className={`p-2.5 rounded-xl border text-center cursor-pointer transition-all ${
                  pageOption === "front"
                    ? "bg-brand-100/70 border-brand-600 text-brand-950 font-bold"
                    : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                }`}
              >
                <div className="text-xs font-bold">Halaman Depan</div>
              </button>
              <button
                type="button"
                onClick={() => setPageOption("back")}
                disabled={!hasJp}
                className={`p-2.5 rounded-xl border text-center transition-all ${
                  !hasJp
                    ? "opacity-40 cursor-not-allowed bg-slate-50 border-slate-200 text-slate-400"
                    : pageOption === "back"
                    ? "bg-brand-100/70 border-brand-600 text-brand-950 font-bold cursor-pointer"
                    : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 cursor-pointer"
                }`}
              >
                <div className="text-xs font-bold">Halaman Belakang</div>
              </button>
            </div>
          )}
        </div>

        {/* 3. FORMAT BERKAS */}
        <div className="space-y-2">
          <label className="text-xs font-black uppercase tracking-wider text-slate-600">
            3. Format Berkas
          </label>
          <div className="grid grid-cols-2 gap-3">
            <div
              onClick={() => setFileFormat("pdf")}
              className={`p-3 rounded-2xl border-2 transition-all cursor-pointer flex items-center gap-3 ${
                fileFormat === "pdf"
                  ? "bg-emerald-50/70 border-emerald-600 text-emerald-950 ring-2 ring-emerald-500/20"
                  : "bg-white border-slate-200 hover:border-emerald-200 text-slate-700"
              }`}
            >
              <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-black flex items-center gap-1">
                  PDF Dokumen
                  {fileFormat === "pdf" && <Check className="w-3.5 h-3.5 text-emerald-600 inline" />}
                </div>
                <div className="text-[10px] text-slate-500">Direkomendasikan untuk cetak/print</div>
              </div>
            </div>

            <div
              onClick={() => setFileFormat("png")}
              className={`p-3 rounded-2xl border-2 transition-all cursor-pointer flex items-center gap-3 ${
                fileFormat === "png"
                  ? "bg-indigo-50/70 border-indigo-600 text-indigo-950 ring-2 ring-indigo-500/20"
                  : "bg-white border-slate-200 hover:border-indigo-200 text-slate-700"
              }`}
            >
              <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                <ImageIcon className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-black flex items-center gap-1">
                  Gambar PNG
                  {fileFormat === "png" && <Check className="w-3.5 h-3.5 text-indigo-600 inline" />}
                </div>
                <div className="text-[10px] text-slate-500">
                  {isBatch ? "Dikemas dalam berkas ZIP" : "Gambar siap dibagikan"}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 4. OPSI GARIS POTONG */}
        {paperSize === "a4_2in1" && (
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between">
            <label htmlFor="cutting_line_chk" className="flex items-center gap-2.5 cursor-pointer">
              <Scissors className="w-4 h-4 text-slate-500" />
              <div className="text-xs font-bold text-slate-800">
                Garis Panduan Potong Putus-Putus (✂)
              </div>
            </label>
            <input
              id="cutting_line_chk"
              type="checkbox"
              checked={withCuttingLine}
              onChange={(e) => setWithCuttingLine(e.target.checked)}
              className="w-4 h-4 accent-brand-600 rounded cursor-pointer"
            />
          </div>
        )}

        {/* PROGRESS INDICATOR */}
        {isProcessing && (
          <div className="p-4 bg-brand-50 border border-brand-200 rounded-2xl space-y-2 animate-fade-in">
            <div className="flex items-center justify-between text-xs font-bold text-brand-900">
              <span className="flex items-center gap-2">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-brand-600" />
                {progressInfo?.text || "Sedang memproses dokumen..."}
              </span>
              {progressInfo?.total ? (
                <span>
                  {progressInfo.current} / {progressInfo.total}
                </span>
              ) : null}
            </div>
            {progressInfo?.total ? (
              <div className="w-full bg-brand-100 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-brand-600 h-full transition-all duration-200 rounded-full"
                  style={{ width: `${Math.round((progressInfo.current / progressInfo.total) * 100)}%` }}
                />
              </div>
            ) : null}
          </div>
        )}
      </div>

      {/* FOOTER ACTIONS */}
      <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100 mt-6">
        <button
          type="button"
          onClick={onClose}
          disabled={isProcessing}
          className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
        >
          Batal
        </button>
        <button
          type="button"
          onClick={handleStartExport}
          disabled={isProcessing}
          className="px-5 py-2.5 bg-brand-600 hover:bg-brand-700 active:scale-95 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-brand-900/20 transition-all cursor-pointer disabled:opacity-50"
        >
          {isProcessing ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              Memproses...
            </>
          ) : (
            <>
              <Download className="w-4 h-4" />
              Unduh ({paperSize === "a4_2in1" ? "A4 2x A5" : "Standar"} • {fileFormat.toUpperCase()})
            </>
          )}
        </button>
      </div>
    </ModalPortal>
  );
}
