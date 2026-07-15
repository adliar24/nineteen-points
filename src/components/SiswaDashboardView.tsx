import React, { useState, useEffect } from "react";
import { motion } from "motion/react";
import { QRCodeSVG } from "qrcode.react";
import { 
  Award, 
  Calendar, 
  User, 
  Download, 
  TrendingUp, 
  ShieldCheck, 
  Clock, 
  AlertCircle,
  School,
  Sparkles,
  Check,
  X
} from "lucide-react";
import { UserSession, RiwayatPoin, Siswa } from "../types";
import { supabase } from "../supabaseClient";
import html2canvas from "html2canvas-pro";
import SkeletonLoader from "./SkeletonLoader";

interface SiswaDashboardViewProps {
  userSession: UserSession;
  activeTab: string;
}

export default function SiswaDashboardView({ userSession, activeTab }: SiswaDashboardViewProps) {
  const [siswaDetail, setSiswaDetail] = useState<Siswa | null>(null);
  const [riwayat, setRiwayat] = useState<RiwayatPoin[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isZoomed, setIsZoomed] = useState(false);

  useEffect(() => {
    async function loadStudentData() {
      if (!userSession.nis) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        // 1. Fetch Student points detail from 'siswa' table using NIS
        const { data: siswaData, error: siswaError } = await supabase
          .from("siswa")
          .select("*")
          .eq("nis", userSession.nis)
          .single();

        if (siswaError) throw siswaError;
        setSiswaDetail(siswaData);

        if (siswaData) {
          // 2. Fetch Point History for this specific student
          const { data: riwayatData, error: riwayatError } = await supabase
            .from("riwayat_poin")
            .select(`
              id,
              siswa_id,
              nilai_diberikan,
              nama_poin,
              guru_email,
              created_at
            `)
            .eq("siswa_id", siswaData.id)
            .order("created_at", { ascending: false });

          if (riwayatError) throw riwayatError;
          setRiwayat(riwayatData || []);
        }
      } catch (error) {
        console.error("Failed to load student dashboard details:", error);
      } finally {
        setIsLoading(false);
      }
    }

    loadStudentData();
  }, [userSession.nis]);

  const handleDownloadCard = async () => {
    if (!siswaDetail) return;
    setIsDownloading(true);
    const cardElement = document.getElementById("student-digital-card-portrait");
    if (cardElement) {
      try {
        const canvas = await html2canvas(cardElement, {
          scale: 3, // High-quality rendering
          useCORS: true,
          backgroundColor: "#ffffff"
        });
        const imgData = canvas.toDataURL("image/png");
        const link = document.createElement("a");
        link.download = `KARTU_PELAJAR_SMAN19_${siswaDetail.nama.toUpperCase().replace(/\s+/g, "_")}.png`;
        link.href = imgData;
        link.click();
      } catch (err) {
        console.error("Gagal mendownload kartu:", err);
      }
    }
    setIsDownloading(false);
  };

  if (isLoading) {
    if (activeTab === "siswa_stats") {
      return (
        <div className="space-y-6">
          {/* Welcome Banner Skeleton */}
          <div className="bg-white rounded-3xl p-6 border border-brand-100 shadow-xl shadow-brand-900/5 flex flex-col md:flex-row md:items-center justify-between gap-6 animate-pulse">
            <div className="space-y-2 flex-1">
              <div className="h-6 w-1/3 bg-slate-200 rounded-md" />
              <div className="h-3.5 w-1/4 bg-slate-200 rounded-md" />
            </div>
            <div className="flex gap-4">
              <div className="bg-slate-100 rounded-2xl w-24 h-14" />
              <div className="bg-slate-100 rounded-2xl w-24 h-14" />
            </div>
          </div>

          {/* Stats Summary row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="bg-white rounded-3xl p-6 border border-brand-100 shadow-xl h-24 animate-pulse flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-slate-200" />
              <div className="space-y-2 flex-1">
                <div className="h-3 w-20 bg-slate-200 rounded-md" />
                <div className="h-5 w-32 bg-slate-200 rounded-md" />
              </div>
            </div>
            <div className="bg-white rounded-3xl p-6 border border-brand-100 shadow-xl h-24 animate-pulse flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-slate-200" />
              <div className="space-y-2 flex-1">
                <div className="h-3 w-20 bg-slate-200 rounded-md" />
                <div className="h-5 w-32 bg-slate-200 rounded-md" />
              </div>
            </div>
          </div>

          {/* Recent points table skeleton */}
          <div className="bg-white rounded-3xl p-6 border border-brand-100 shadow-xl space-y-4">
            <div className="h-4 w-1/4 bg-slate-200 rounded-md animate-pulse" />
            <SkeletonLoader type="table" count={3} />
          </div>
        </div>
      );
    }

    if (activeTab === "siswa_barcode") {
      return (
        <div className="flex flex-col items-center justify-center space-y-5 py-4">
          <div className="flex justify-between items-center w-full max-w-[290px] px-1">
            <div className="h-4 w-28 bg-slate-200 rounded animate-pulse" />
            <div className="h-4 w-16 bg-slate-200 rounded animate-pulse" />
          </div>
          <SkeletonLoader type="card" />
        </div>
      );
    }

    if (activeTab === "siswa_history") {
      return (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-3xl border border-brand-100 shadow-xl space-y-2 animate-pulse">
            <div className="h-5 w-1/4 bg-slate-200 rounded-md" />
            <div className="h-3 w-1/3 bg-slate-200 rounded-md" />
          </div>
          <SkeletonLoader type="list" count={4} />
        </div>
      );
    }
  }

  if (!siswaDetail) {
    return (
      <div className="bg-white rounded-3xl p-8 border border-brand-100 shadow-xl text-center space-y-4 max-w-md mx-auto mt-12">
        <AlertCircle className="w-12 h-12 text-rose-500 mx-auto animate-bounce" />
        <h3 className="text-base font-extrabold text-brand-900">NIS Tidak Terhubung</h3>
        <p className="text-xs text-brand-500 leading-relaxed">
          Akun siswa Anda belum terhubung dengan nomor induk siswa (NIS) yang terdaftar di database. Silakan hubungi Super Admin untuk menyinkronkan NIS Anda.
        </p>
      </div>
    );
  }

  // Calculate stats
  const totalPrestasi = riwayat.filter(r => r.nilai_diberikan > 0).reduce((acc, r) => acc + r.nilai_diberikan, 0);
  const totalPelanggaran = riwayat.filter(r => r.nilai_diberikan < 0).reduce((acc, r) => acc + r.nilai_diberikan, 0);

  return (
    <div className="space-y-6">
      
      {/* 1. STATISTIK TAB */}
      {activeTab === "siswa_stats" && (
        <div className="space-y-6 animate-fade-in">
          {/* Welcome Banner */}
          <div className="bg-white rounded-3xl p-6 border border-brand-100 shadow-xl shadow-brand-900/5 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-1">
              <h2 className="text-2xl font-black text-brand-900 flex items-center gap-2">
                Halo, {siswaDetail.nama}! <Sparkles className="w-5 h-5 text-amber-500 animate-pulse" />
              </h2>
              <p className="text-xs text-brand-500 font-medium">
                Pantau poin prestasi dan pelanggaranmu di sini.
              </p>
            </div>
            <div className="flex gap-4">
              <div className="bg-brand-50/70 border border-brand-100 rounded-2xl px-5 py-3 text-center min-w-[100px]">
                <span className="text-[10px] font-black text-brand-500 block uppercase tracking-wider">Total Skor</span>
                <span className="text-xl font-black text-brand-900">{siswaDetail.total_poin} pts</span>
              </div>
              <div className="bg-emerald-50/70 border border-emerald-100 rounded-2xl px-5 py-3 text-center min-w-[100px]">
                <span className="text-[10px] font-black text-emerald-600 block uppercase tracking-wider">Kelas</span>
                <span className="text-base font-extrabold text-emerald-800">{siswaDetail.kelas}</span>
              </div>
            </div>
          </div>

          {/* Stats Summary row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* Positive Points Card */}
            <div className="bg-white rounded-3xl p-6 border border-brand-100 shadow-xl shadow-brand-900/5 flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold flex-shrink-0">
                <Award className="w-7 h-7" />
              </div>
              <div>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Akumulasi Prestasi</span>
                <span className="text-xl font-black text-emerald-600">+{totalPrestasi} Poin</span>
                <p className="text-[10px] text-slate-400 mt-0.5">Poin dari kelakuan baikmu.</p>
              </div>
            </div>

            {/* Negative Points Card */}
            <div className="bg-white rounded-3xl p-6 border border-brand-100 shadow-xl shadow-brand-900/5 flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold flex-shrink-0">
                <TrendingUp className="w-7 h-7 rotate-180" />
              </div>
              <div>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Akumulasi Pelanggaran</span>
                <span className="text-xl font-black text-rose-600">{totalPelanggaran} Poin</span>
                <p className="text-[10px] text-slate-400 mt-0.5">Poin minus dari melanggar aturan.</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-3xl p-6 border border-brand-100 shadow-xl shadow-brand-900/5 space-y-4">
            <h3 className="text-sm font-black text-brand-950 uppercase tracking-widest flex items-center gap-2">
              <Clock className="w-5 h-5 text-brand-600" />
              Poin Terbaru
            </h3>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-brand-50/40 border-b border-brand-100 text-brand-500 text-[10px] font-black uppercase tracking-wider">
                    <th className="py-3 px-4">Tanggal & Waktu</th>
                    <th className="py-3 px-4">Keterangan</th>
                    <th className="py-3 px-4 text-center">Nilai Poin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-50 text-brand-900 text-xs font-semibold">
                  {riwayat.slice(0, 3).length > 0 ? (
                    riwayat.slice(0, 3).map((record) => {
                      const isPositive = record.nilai_diberikan > 0;
                      return (
                        <tr key={record.id} className="hover:bg-brand-50/20 transition-colors">
                          <td className="py-3.5 px-4 font-mono text-[10px] text-brand-500">
                            {new Date(record.created_at).toLocaleString("id-ID", {
                              dateStyle: "medium",
                              timeStyle: "short"
                            })}
                          </td>
                          <td className="py-3.5 px-4 max-w-sm">
                            <span className="font-bold block text-brand-950 truncate">{record.nama_poin}</span>
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <span 
                              className={`font-black font-mono px-2 py-0.5 rounded-full text-[9px] ${
                                isPositive 
                                  ? "bg-emerald-50 text-emerald-700 border border-emerald-100" 
                                  : "bg-rose-50 text-rose-700 border border-rose-100"
                              }`}
                            >
                              {isPositive ? `+${record.nilai_diberikan}` : record.nilai_diberikan}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={3} className="py-8 text-center text-brand-400 font-bold text-xs">
                        Belum ada catatan poin.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 2. BARCODE / KARTU TAB */}
      {activeTab === "siswa_barcode" && (
        <div className="flex flex-col items-center justify-center space-y-5 py-4 animate-fade-in">
          {/* Card Showcase Column */}
          <div className="flex justify-between items-center w-full max-w-[290px] px-1">
            <h3 className="text-xs font-black text-brand-950 uppercase tracking-widest">Kartu Pelajar Digital</h3>
            <button
              onClick={handleDownloadCard}
              disabled={isDownloading}
              className="text-xs font-bold text-brand-600 hover:text-brand-800 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Download className="w-4 h-4" />
              {isDownloading ? "Mengunduh..." : "Download PNG"}
            </button>
          </div>

          {/* Portrait digital card: Reference-inspired design */}
          <div
            id="student-digital-card-portrait"
            onClick={() => setIsZoomed(true)}
            className="w-full max-w-[290px] aspect-[1/1.58] rounded-none bg-white text-brand-950 border border-brand-200 relative overflow-hidden flex flex-col items-center justify-between py-8 px-5 shadow-2xl shadow-brand-950/10 flex-shrink-0 cursor-zoom-in hover:scale-[1.02] transition-transform duration-300"
            style={{ width: "290px", height: "458px" }}
          >
            {/* TOP WAVE DECORATION (SVG) */}
            <svg className="absolute top-0 inset-x-0 w-full h-32 pointer-events-none" viewBox="0 0 290 128" fill="none" preserveAspectRatio="none">
              {/* Back Translucent Wave */}
              <path d="M0 0H290V92C210 128 160 85 110 112C60 138 30 115 0 120Z" fill="#7c3aed" opacity="0.2" />
              {/* Front Main Wave (Sidebar Purple color #4c1d95) */}
              <path d="M0 0H290V80C210 112 165 72 115 100C65 128 35 102 0 108Z" fill="#4c1d95" />
            </svg>

            {/* Top Left School Branding */}
            <div className="absolute top-4.5 left-5 flex items-center gap-2 z-10 text-white pointer-events-none">
              <img src="/logo.png" className="w-6.5 h-6.5 object-contain" alt="Logo" />
              <div>
                <h4 className="text-[8px] font-black tracking-widest text-white uppercase leading-tight">SMAN 19 BANDUNG</h4>
                <p className="text-[6px] text-brand-200 font-bold uppercase tracking-wider font-mono">Student Card</p>
              </div>
            </div>

            {/* CARD CONTENT LAYER */}
            <div className="relative z-10 w-full flex-1 flex flex-col justify-between items-center pt-11 pb-1">
              
              {/* 1. 3x4 Portrait Avatar (Pas Foto Style) */}
              <div className="w-21 h-28 rounded-2xl border-[3px] border-pink-500 bg-white flex items-center justify-center p-[2.5px] shadow-md shadow-pink-500/10 flex-shrink-0">
                <div className="w-full h-full rounded-xl border border-pink-100 bg-rose-50/50 flex items-center justify-center text-pink-600 font-black text-3xl uppercase tracking-wider">
                  {siswaDetail.nama.slice(0, 2)}
                </div>
              </div>

              {/* 2. Student Info */}
              <div className="text-center space-y-1 mt-3">
                <h3 className="text-sm font-black tracking-tight text-[#1e1b4b] px-2 line-clamp-1 leading-snug">
                  {siswaDetail.nama}
                </h3>
                <p className="text-[9px] text-[#7c3aed] font-extrabold uppercase tracking-widest">
                  NIS: {siswaDetail.nis} &bull; KELAS: {siswaDetail.kelas}
                </p>
              </div>

              {/* 3. High quality QR code */}
              <div className="mt-4 flex flex-col items-center">
                <div className="bg-white p-2.5 rounded-2xl border-[3.5px] border-brand-600">
                  <QRCodeSVG
                    value={siswaDetail.nis}
                    size={95}
                    level="M"
                    includeMargin={false}
                    fgColor="#4c1d95"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. RIWAYAT POIN TAB */}
      {activeTab === "siswa_history" && (
        <div className="space-y-4 animate-fade-in">
          {/* Header block */}
          <div className="bg-white rounded-3xl p-6 border border-brand-100 shadow-xl shadow-brand-900/5 flex justify-between items-center">
            <div>
              <h3 className="text-base font-extrabold text-brand-900 flex items-center gap-2">
                <Clock className="w-5 h-5 text-brand-600" />
                Riwayat Perolehan Poin
              </h3>
              <p className="text-[10px] text-brand-500 font-medium mt-0.5">
                Daftar lengkap poin prestasi dan pelanggaranmu.
              </p>
            </div>
            <span className="px-3.5 py-1.5 bg-brand-50 text-brand-700 font-black rounded-xl text-[10px] tracking-wide border border-brand-100 flex-shrink-0">
              {riwayat.length} Catatan
            </span>
          </div>

          {/* Cards List container */}
          <div className="space-y-3">
            {riwayat.length > 0 ? (
              riwayat.map((record) => {
                const isPositive = record.nilai_diberikan > 0;
                return (
                  <div 
                    key={record.id} 
                    className="bg-white rounded-2xl p-4.5 border border-brand-100 shadow-xs flex items-center justify-between gap-4 card-hover-effect"
                  >
                    {/* Left: Icon Badge & Details */}
                    <div className="flex items-center gap-4 min-w-0">
                      {/* Icon Badge */}
                      <div 
                        className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                          isPositive 
                            ? "bg-emerald-50 text-emerald-600 border border-emerald-100" 
                            : "bg-rose-50 text-rose-600 border border-rose-100"
                        }`}
                      >
                        {isPositive ? (
                          <Award className="w-5 h-5" />
                        ) : (
                          <TrendingUp className="w-5 h-5 rotate-180" />
                        )}
                      </div>
                      
                      {/* Name, Date, and Recorder */}
                      <div className="min-w-0">
                        <span className="font-extrabold text-xs text-brand-950 block leading-snug truncate">
                          {record.nama_poin}
                        </span>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-slate-400 font-semibold mt-1">
                          <span className="font-mono text-slate-500">
                            {new Date(record.created_at).toLocaleString("id-ID", {
                              dateStyle: "medium",
                              timeStyle: "short"
                            })}
                          </span>
                          <span className="hidden sm:inline w-1 h-1 bg-slate-300 rounded-full" />
                          <span className="truncate">
                            Dicatat: {record.guru_email.endsWith("@sman19.sch.id") ? record.guru_email.split("@")[0] : record.guru_email}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Right: Point Value */}
                    <div className="flex-shrink-0">
                      <span 
                        className={`font-black font-mono px-3.5 py-1.5 rounded-xl text-xs ${
                          isPositive 
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-100/50" 
                            : "bg-rose-50 text-rose-700 border border-rose-100/50"
                        }`}
                      >
                        {isPositive ? `+${record.nilai_diberikan}` : record.nilai_diberikan}
                      </span>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="bg-white rounded-3xl p-12 text-center border border-brand-100 shadow-xl shadow-brand-900/5">
                <p className="text-xs text-slate-400 font-bold">
                  Belum ada catatan poin. Pertahankan kelakuan baikmu!
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Lightbox / Zoom Modal */}
      {isZoomed && (
        <div 
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-brand-950/80 backdrop-blur-md p-4 animate-fade-in cursor-zoom-out"
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
            className="w-full max-w-[340px] sm:max-w-[360px] aspect-[1/1.58] rounded-none bg-white text-brand-950 border border-brand-200 shadow-2xl relative flex flex-col items-center justify-between py-10 px-6 cursor-default animate-fade-in overflow-hidden"
            style={{ width: "340px", height: "537px" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* TOP WAVE DECORATION (SVG) */}
            <svg className="absolute top-0 inset-x-0 w-full h-36 pointer-events-none" viewBox="0 0 340 150" fill="none" preserveAspectRatio="none">
              {/* Back Translucent Wave */}
              <path d="M0 0H340V108C245 150 187 100 128 131C70 162 35 135 0 141Z" fill="#7c3aed" opacity="0.2" />
              {/* Front Main Wave (Sidebar Purple color #4c1d95) */}
              <path d="M0 0H340V94C245 131 193 84 134 117C76 150 41 120 0 127Z" fill="#4c1d95" />
            </svg>

            {/* Top Left School Branding */}
            <div className="absolute top-5 left-6 flex items-center gap-2.5 z-10 text-white pointer-events-none">
              <img src="/logo.png" className="w-8 h-8 object-contain" alt="Logo" />
              <div>
                <h4 className="text-[9px] font-black tracking-widest text-white uppercase leading-tight">SMAN 19 BANDUNG</h4>
                <p className="text-[7px] text-brand-200 font-bold uppercase tracking-wider font-mono">Student Card</p>
              </div>
            </div>

            {/* CARD CONTENT LAYER */}
            <div className="relative z-10 w-full flex-1 flex flex-col justify-between items-center pt-14 pb-1">
              
              {/* 1. 3x4 Portrait Avatar (Pas Foto Style) */}
              <div className="w-27 h-36 rounded-[24px] border-[4px] border-pink-500 bg-white flex items-center justify-center p-[3px] shadow-md shadow-pink-500/10 flex-shrink-0">
                <div className="w-full h-full rounded-[18px] border border-pink-100 bg-rose-50/50 flex items-center justify-center text-pink-600 font-black text-4xl uppercase tracking-wider">
                  {siswaDetail.nama.slice(0, 2)}
                </div>
              </div>

              {/* 2. Student Info */}
              <div className="text-center space-y-1 mt-3">
                <h3 className="text-base font-black tracking-tight text-[#1e1b4b] px-2 line-clamp-1 leading-snug">
                  {siswaDetail.nama}
                </h3>
                <p className="text-xs text-[#7c3aed] font-extrabold uppercase tracking-widest">
                  NIS: {siswaDetail.nis} &bull; KELAS: {siswaDetail.kelas}
                </p>
              </div>

              {/* 3. High quality QR code */}
              <div className="mt-4 flex flex-col items-center">
                <div className="bg-white p-3.5 rounded-2xl border-[3.5px] border-brand-600">
                  <QRCodeSVG
                    value={siswaDetail.nis}
                    size={110}
                    level="M"
                    includeMargin={false}
                    fgColor="#4c1d95"
                  />
                </div>
              </div>
            </div>
          </div>
          
          {/* Close hint */}
          <p className="text-xs text-white/50 font-medium mt-4 select-none">
            Klik di mana saja untuk menutup
          </p>
        </div>
      )}

    </div>
  );
}
