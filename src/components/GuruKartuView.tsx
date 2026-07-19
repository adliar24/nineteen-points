import React, { useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import { QRCodeSVG } from "qrcode.react";
import { 
  Download, 
  X,
  CreditCard,
  School,
  Sparkles
} from "lucide-react";
import { UserSession } from "../types";
import html2canvas from "html2canvas-pro";
import { toSentenceCase } from "../formatName";

interface GuruKartuViewProps {
  userSession: UserSession;
}

export default function GuruKartuView({ userSession }: GuruKartuViewProps) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [isZoomed, setIsZoomed] = useState(false);

  const handleDownloadCard = async () => {
    setIsDownloading(true);
    const cardElement = document.getElementById("teacher-digital-card-portrait");
    if (cardElement) {
      try {
        const canvas = await html2canvas(cardElement, {
          scale: 3, // High-quality rendering
          useCORS: true,
          backgroundColor: "#ffffff"
        });
        const imgData = canvas.toDataURL("image/png");
        const link = document.createElement("a");
        link.download = `KARTU_GURU_SMAN19_${userSession.fullName.toUpperCase().replace(/\s+/g, "_")}.png`;
        link.href = imgData;
        link.click();
      } catch (err) {
        console.error("Gagal mendownload kartu guru:", err);
      }
    }
    setIsDownloading(false);
  };

  const emailPrefix = userSession.email.split("@")[0];

  return (
    <div className="flex flex-col items-center justify-center space-y-5 py-4 animate-fade-in">
      {/* Card Showcase Column */}
      <div className="flex justify-between items-center w-full max-w-[290px] px-1">
        <h3 className="text-xs font-black text-brand-950 uppercase tracking-widest flex items-center gap-2">
          <CreditCard className="w-4.5 h-4.5 text-brand-650" />
          Kartu Guru Digital
        </h3>
        <button
          onClick={handleDownloadCard}
          disabled={isDownloading}
          className="text-xs font-bold text-brand-650 hover:text-brand-850 flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <Download className="w-4 h-4" />
          {isDownloading ? "Mengunduh..." : "Download PNG"}
        </button>
      </div>

      {/* Portrait digital card: Reference-inspired design */}
      <div
        id="teacher-digital-card-portrait"
        onClick={() => setIsZoomed(true)}
        className="w-full max-w-[290px] aspect-[1/1.58] rounded-none bg-white text-brand-950 border border-brand-200 relative overflow-hidden flex flex-col items-center justify-between py-8 px-5 shadow-2xl shadow-brand-950/10 flex-shrink-0 cursor-zoom-in hover:scale-[1.02] transition-transform duration-300"
        style={{ width: "290px", height: "458px" }}
      >
        {/* TOP WAVE DECORATION (SVG) */}
        <svg className="absolute top-0 inset-x-0 w-full h-32 pointer-events-none" viewBox="0 0 290 128" fill="none" preserveAspectRatio="none">
          {/* Back Translucent Wave */}
          <path d="M0 0H290V92C210 128 160 85 110 112C60 138 30 115 0 120Z" fill="var(--color-brand-600)" opacity="0.2" />
          {/* Front Main Wave */}
          <path d="M0 0H290V80C210 112 165 72 115 100C65 128 35 102 0 108Z" fill="var(--color-brand-700)" />
        </svg>

        {/* Top Left School Branding */}
        <div className="absolute top-4.5 left-5 flex items-center gap-2.5 z-10 text-white pointer-events-none">
          <div className="w-7 h-7 rounded-lg bg-white p-1 flex items-center justify-center shadow-sm">
            <img src="/logo.png" className="w-full h-full object-contain" alt="Logo" />
          </div>
          <div>
            <h4 className="text-[8px] font-black tracking-widest text-white uppercase leading-tight">SMAN 19 BANDUNG</h4>
            <p className="text-[6px] text-brand-100 font-bold uppercase tracking-wider font-mono">Teacher Card</p>
          </div>
        </div>

        {/* CARD CONTENT LAYER */}
        <div className="relative z-10 w-full flex-1 flex flex-col justify-between items-center pt-11 pb-1">
          
          {/* 1. 3x4 Portrait Avatar (Pas Foto Style) */}
          <div className="w-21 h-28 rounded-2xl border-[3px] border-brand-500 bg-white flex items-center justify-center p-[2.5px] shadow-md shadow-brand-500/10 flex-shrink-0">
            {userSession.foto_url ? (
              <img src={userSession.foto_url} className="w-full h-full rounded-xl object-cover" alt={userSession.fullName} />
            ) : (
              <div className="w-full h-full rounded-xl border border-brand-100 bg-brand-50/50 flex items-center justify-center text-brand-650 font-black text-3xl uppercase tracking-wider">
                {userSession.fullName.slice(0, 2)}
              </div>
            )}
          </div>

          {/* 2. Teacher Info */}
          <div className="text-center space-y-1 mt-3">
            <h3 className="text-sm font-black tracking-tight text-[#1e1b4b] px-2 line-clamp-1 leading-snug">
              {toSentenceCase(userSession.fullName)}
            </h3>
            <p className="text-[9px] text-brand-600 font-extrabold uppercase tracking-widest">
              NIP: {emailPrefix} &bull; GURU
            </p>
          </div>

          {/* 3. High quality QR code */}
          <div className="mt-4 flex flex-col items-center">
            <div className="bg-white p-2.5 rounded-2xl border-[3.5px] border-brand-600">
              <QRCodeSVG
                value={userSession.email}
                size={95}
                level="M"
                includeMargin={false}
                fgColor="var(--color-brand-700)"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Lightbox / Zoom Modal */}
      {isZoomed && createPortal(
        <div 
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/95 backdrop-blur-xs p-4 animate-fade-in cursor-zoom-out"
          onClick={() => setIsZoomed(false)}
        >
          {/* Close button at top right */}
          <button 
            className="absolute top-6 right-6 p-3 bg-white/10 hover:bg-white/20 border border-white/10 hover:border-white/20 text-white rounded-full transition-all cursor-pointer z-10"
            onClick={(e) => {
              e.stopPropagation();
              setIsZoomed(false);
            }}
          >
            <X className="w-6 h-6" />
          </button>

          {/* Scaled-up Card: Reference-inspired design */}
          <div 
            className="w-full max-w-[390px] aspect-[1/1.58] rounded-none bg-white text-brand-950 border border-brand-200 shadow-2xl relative flex flex-col items-center justify-between py-12 px-7 cursor-default animate-fade-in overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* TOP WAVE DECORATION (SVG) */}
            <svg className="absolute top-0 inset-x-0 w-full h-38 pointer-events-none" viewBox="0 0 340 150" fill="none" preserveAspectRatio="none">
              <path d="M0 0H340V108C245 150 187 100 128 131C70 162 35 135 0 141Z" fill="var(--color-brand-600)" opacity="0.2" />
              <path d="M0 0H340V94C245 131 193 84 134 117C76 150 41 120 0 127Z" fill="var(--color-brand-700)" />
            </svg>

            {/* Top Left School Branding */}
            <div className="absolute top-6 left-7 flex items-center gap-3 z-10 text-white pointer-events-none">
              <div className="w-10 h-10 rounded-xl bg-white p-1 flex items-center justify-center shadow-sm">
                <img src="/logo.png" className="w-full h-full object-contain" alt="Logo" />
              </div>
              <div>
                <h4 className="text-[10px] font-black tracking-widest text-white uppercase leading-tight">SMAN 19 BANDUNG</h4>
                <p className="text-[8px] text-brand-100 font-bold uppercase tracking-wider font-mono">Teacher Card</p>
              </div>
            </div>

            {/* CARD CONTENT LAYER */}
            <div className="relative z-10 w-full flex-1 flex flex-col justify-between items-center pt-14 pb-1">
              
              {/* 1. 3x4 Portrait Avatar (Pas Foto Style) */}
              <div className="w-32 h-44 rounded-[28px] border-[4px] border-brand-500 bg-white flex items-center justify-center p-[3px] shadow-md shadow-brand-500/10 flex-shrink-0">
                {userSession.foto_url ? (
                  <img src={userSession.foto_url} className="w-full h-full rounded-[22px] object-cover" alt={userSession.fullName} />
                ) : (
                  <div className="w-full h-full rounded-[22px] border border-brand-100 bg-brand-50/50 flex items-center justify-center text-brand-650 font-black text-4xl uppercase tracking-wider">
                    {userSession.fullName.slice(0, 2)}
                  </div>
                )}
              </div>

              {/* 2. Teacher Info */}
              <div className="text-center space-y-1 mt-3">
                <h3 className="text-lg font-black tracking-tight text-[#1e1b4b] px-2 line-clamp-1 leading-snug">
                  {toSentenceCase(userSession.fullName)}
                </h3>
                <p className="text-xs text-brand-650 font-extrabold uppercase tracking-widest mt-1">
                  NIP: {emailPrefix} &bull; GURU
                </p>
              </div>

              {/* 3. High quality QR code */}
              <div className="mt-4 flex flex-col items-center">
                <div className="bg-white p-4 rounded-3xl border-[4px] border-brand-600">
                  <QRCodeSVG
                    value={userSession.email}
                    size={135}
                    level="M"
                    includeMargin={false}
                    fgColor="var(--color-brand-700)"
                  />
                </div>
              </div>
            </div>
          </div>
          
          {/* Close hint */}
          <p className="text-xs text-white/50 font-medium mt-4 select-none">
            Klik di mana saja untuk menutup
          </p>
        </div>,
        document.body
      )}
    </div>
  );
}
