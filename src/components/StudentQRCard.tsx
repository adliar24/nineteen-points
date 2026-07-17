import React from "react";
import { QRCodeSVG } from "qrcode.react";
import { toSentenceCase } from "../formatName";
import { Siswa } from "../types";

interface StudentQRCardProps {
  siswa: Siswa;
  idPrefix: string;
  className?: string;
}

export default React.memo(function StudentQRCard({
  siswa,
  idPrefix,
  className = "",
}: StudentQRCardProps) {
  return (
    <div
      id={`${idPrefix}-${siswa.id}`}
      className={`w-[290px] h-[458px] rounded-none bg-white text-brand-950 border border-brand-200 relative overflow-hidden flex flex-col items-center justify-between py-8 px-5 shadow-2xl shadow-brand-950/10 flex-shrink-0 ${className}`}
      style={{
        width: "290px",
        height: "458px",
        fontFamily: "'Poppins', 'Space Grotesk', 'Inter', sans-serif",
      }}
    >
      {/* TOP WAVE DECORATION */}
      <svg
        className="absolute top-0 inset-x-0 w-full h-32 pointer-events-none"
        viewBox="0 0 290 128"
        fill="none"
        preserveAspectRatio="none"
      >
        <path
          d="M0 0H290V92C210 128 160 85 110 112C60 138 30 115 0 120Z"
          fill="#7c3aed"
          opacity="0.2"
        />
        <path
          d="M0 0H290V80C210 112 165 72 115 100C65 128 35 102 0 108Z"
          fill="#4c1d95"
        />
      </svg>

      {/* Top Left School Branding */}
      <div className="absolute top-4.5 left-5 flex items-center gap-2 z-10 text-white pointer-events-none">
        <img src="/logo.png" className="w-6.5 h-6.5 object-contain" alt="Logo" />
        <div>
          <h4 className="text-[8px] font-black tracking-widest text-white uppercase leading-tight">
            SMAN 19 BANDUNG
          </h4>
          <p className="text-[6px] text-brand-200 font-bold uppercase tracking-wider font-mono">
            Student Card
          </p>
        </div>
      </div>

      {/* CARD CONTENT LAYER */}
      <div className="relative z-10 w-full flex-1 flex flex-col justify-between items-center pt-11 pb-1">
        {/* 3x4 Portrait Avatar */}
        <div className="w-21 h-28 rounded-2xl border-[3px] border-pink-500 bg-white flex items-center justify-center p-[2.5px] shadow-md shadow-pink-500/10 flex-shrink-0">
          {siswa.foto_url ? (
            <img
              src={siswa.foto_url}
              className="w-full h-full rounded-xl object-cover"
              alt={siswa.nama}
            />
          ) : (
            <div className="w-full h-full rounded-xl border border-pink-100 bg-rose-50/50 flex items-center justify-center text-pink-600 font-black text-3xl uppercase tracking-wider">
              {siswa.nama.slice(0, 2)}
            </div>
          )}
        </div>

        {/* Student Info */}
        <div className="text-center space-y-1 mt-3">
          <h3 className="text-sm font-black tracking-tight text-[#1e1b4b] px-2 line-clamp-1 leading-snug">
            {toSentenceCase(siswa.nama)}
          </h3>
          <p className="text-[9px] text-[#7c3aed] font-extrabold uppercase tracking-widest">
            NIS: {siswa.nis} &bull; KELAS: {siswa.kelas}
          </p>
        </div>

        {/* QR Code */}
        <div className="mt-4 flex flex-col items-center">
          <div className="bg-white p-2.5 rounded-2xl border-[3.5px] border-brand-600">
            <QRCodeSVG
              value={siswa.nis}
              size={95}
              level="M"
              includeMargin={false}
              fgColor="#4c1d95"
            />
          </div>
        </div>
      </div>
    </div>
  );
});
