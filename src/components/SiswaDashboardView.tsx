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
  Sparkles
} from "lucide-react";
import { UserSession, RiwayatPoin, Siswa } from "../types";
import { supabase } from "../supabaseClient";
import html2canvas from "html2canvas-pro";

interface SiswaDashboardViewProps {
  userSession: UserSession;
}

export default function SiswaDashboardView({ userSession }: SiswaDashboardViewProps) {
  const [siswaDetail, setSiswaDetail] = useState<Siswa | null>(null);
  const [riwayat, setRiwayat] = useState<RiwayatPoin[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDownloading, setIsDownloading] = useState(false);

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
    const cardElement = document.getElementById("student-digital-card");
    if (cardElement) {
      try {
        const canvas = await html2canvas(cardElement, {
          scale: 3, // High-quality rendering
          useCORS: true,
          backgroundColor: "#080710"
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
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
        <div className="w-10 h-10 border-4 border-brand-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-xs font-bold text-brand-600">Memuat data dashboard portal siswa...</p>
      </div>
    );
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
    <div className="space-y-8 animate-fade-in">
      
      {/* Welcome Banner */}
      <div className="bg-white rounded-3xl p-6 border border-brand-100 shadow-xl shadow-brand-900/5 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <h2 className="text-2xl font-black text-brand-900 flex items-center gap-2">
            Halo, {siswaDetail.nama}! <Sparkles className="w-5 h-5 text-amber-500 animate-pulse" />
          </h2>
          <p className="text-xs text-brand-500 font-medium">
            Selamat datang di Portal Nilai & Karakter Siswa. Pantau terus prestasimu!
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

      {/* Grid: Card Generator + Stats */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
        
        {/* Left Side: Student Card (5 cols) */}
        <div className="md:col-span-5 space-y-4">
          <div className="flex justify-between items-center px-1">
            <h3 className="text-sm font-black text-brand-950 uppercase tracking-widest">Kartu Pelajar Digital</h3>
            <button
              onClick={handleDownloadCard}
              disabled={isDownloading}
              className="text-xs font-bold text-brand-600 hover:text-brand-800 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Download className="w-4 h-4" />
              {isDownloading ? "Mengunduh..." : "Download PNG"}
            </button>
          </div>

          {/* Render Digital Card container */}
          <div 
            id="student-digital-card"
            className="w-full aspect-[1.58/1] rounded-3xl bg-[#080710] text-white p-5 border border-slate-800 relative overflow-hidden flex flex-col justify-between shadow-2xl"
          >
            {/* Holographic background gradients */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-brand-600/30 to-accent-600/20 rounded-full filter blur-2xl -translate-y-1/3 translate-x-1/3 pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-gradient-to-tr from-emerald-500/10 to-amber-500/10 rounded-full filter blur-xl -translate-x-1/4 translate-y-1/4 pointer-events-none" />

            {/* Top Row: School Logo & Title */}
            <div className="flex items-center justify-between border-b border-white/10 pb-3 relative z-10">
              <div className="flex items-center gap-2">
                <img src="/logo.png" className="w-7.5 h-7.5 object-contain" alt="Logo" />
                <div>
                  <h4 className="text-[10px] font-black tracking-widest uppercase text-accent-400">SMAN 19 Bandung</h4>
                  <p className="text-[8px] text-white/50 font-bold uppercase tracking-wider">NineTeen Points Card</p>
                </div>
              </div>
              <span className="text-[7px] font-black px-2 py-0.5 bg-brand-500/20 border border-brand-500/40 text-brand-300 rounded-md uppercase tracking-widest">
                Pelajar
              </span>
            </div>

            {/* Middle Row: Student detail and QR */}
            <div className="flex items-center justify-between gap-4 py-2 relative z-10 flex-1">
              <div className="space-y-2">
                <div>
                  <span className="text-[7px] font-bold text-white/40 uppercase tracking-widest block">Nama Lengkap</span>
                  <span className="text-sm font-black tracking-wide text-white line-clamp-1">{siswaDetail.nama}</span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-[7px] font-bold text-white/40 uppercase tracking-widest block">NIS</span>
                    <span className="text-xs font-mono font-bold tracking-wider text-slate-200">{siswaDetail.nis}</span>
                  </div>
                  <div>
                    <span className="text-[7px] font-bold text-white/40 uppercase tracking-widest block">Kelas</span>
                    <span className="text-xs font-extrabold text-slate-200">{siswaDetail.kelas}</span>
                  </div>
                </div>
              </div>

              {/* QR Code section */}
              <div className="bg-white p-2 rounded-2xl flex items-center justify-center shadow-lg border border-white/15">
                <QRCodeSVG
                  value={siswaDetail.nis}
                  size={75}
                  level="M"
                  includeMargin={false}
                />
              </div>
            </div>

            {/* Bottom Row: Verification Info */}
            <div className="flex items-center justify-between border-t border-white/5 pt-2 relative z-10 text-[7px] text-white/40 font-bold">
              <div className="flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-emerald-400" />
                <span>Kartu Terverifikasi Sistem</span>
              </div>
              <span>TAHUN AJARAN {new Date().getFullYear()}/{new Date().getFullYear() + 1}</span>
            </div>
          </div>
        </div>

        {/* Right Side: Score Summary & Breakdown (7 cols) */}
        <div className="md:col-span-7 space-y-4">
          <h3 className="text-sm font-black text-brand-950 uppercase tracking-widest px-1">Rincian Prestasi & Sanksi</h3>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            
            {/* Positive Points Summary */}
            <div className="bg-white rounded-3xl p-5 border border-brand-100 shadow-xl shadow-brand-900/5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                <Award className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Akumulasi Prestasi</span>
                <span className="text-lg font-black text-emerald-600">+{totalPrestasi} Poin</span>
              </div>
            </div>

            {/* Negative Points Summary */}
            <div className="bg-white rounded-3xl p-5 border border-brand-100 shadow-xl shadow-brand-900/5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold">
                <TrendingUp className="w-6 h-6 rotate-180" />
              </div>
              <div>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Akumulasi Pelanggaran</span>
                <span className="text-lg font-black text-rose-600">{totalPelanggaran} Poin</span>
              </div>
            </div>
          </div>

          <div className="bg-brand-50/40 rounded-3xl p-5 border border-brand-100 flex items-center gap-3">
            <User className="w-5 h-5 text-brand-600 flex-shrink-0" />
            <p className="text-xs text-brand-800 font-medium leading-relaxed">
              Tunjukkan **QR Code** pada kartu pelajarmu di samping kiri kepada guru pembina atau wali kelas untuk merekam poin pelanggaran atau penghargaan prestasimu secara otomatis.
            </p>
          </div>
        </div>
      </div>

      {/* Audit Log / History Section */}
      <div className="bg-white rounded-3xl border border-brand-100 shadow-xl shadow-brand-900/5 overflow-hidden">
        <div className="p-6 border-b border-brand-100 flex justify-between items-center">
          <div>
            <h3 className="text-base font-extrabold text-brand-900 flex items-center gap-2">
              <Clock className="w-5 h-5 text-brand-600" />
              Catatan Riwayat Poin Anda
            </h3>
            <p className="text-[10px] text-brand-500 font-medium mt-0.5">
              Daftar kronologis sanksi disiplin dan penghargaan prestasi yang dicatat oleh guru.
            </p>
          </div>
          <span className="px-3 py-1.5 bg-brand-50 text-brand-700 font-bold rounded-xl text-[10px]">
            {riwayat.length} Transaksi
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-brand-50/40 border-b border-brand-100 text-brand-500 text-[10px] font-black uppercase tracking-wider">
                <th className="py-4 px-6">Tanggal & Waktu</th>
                <th className="py-4 px-6">Aturan / Keterangan</th>
                <th className="py-4 px-6 text-center">Nilai Poin</th>
                <th className="py-4 px-6 text-right">Guru Pencatat</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-50 text-brand-900 text-xs font-semibold">
              {riwayat.length > 0 ? (
                riwayat.map((record) => {
                  const isPositive = record.nilai_diberikan > 0;
                  return (
                    <tr key={record.id} className="hover:bg-brand-50/20 transition-colors">
                      <td className="py-4 px-6 font-mono text-[10px] text-brand-500">
                        {new Date(record.created_at).toLocaleString("id-ID", {
                          dateStyle: "medium",
                          timeStyle: "short"
                        })}
                      </td>
                      <td className="py-4 px-6 max-w-sm">
                        <span className="font-bold block text-brand-950 leading-relaxed">
                          {record.nama_poin}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-center">
                        <span 
                          className={`font-black font-mono px-3 py-1 rounded-full text-[10px] ${
                            isPositive 
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-100" 
                              : "bg-rose-50 text-rose-700 border border-rose-100"
                          }`}
                        >
                          {isPositive ? `+${record.nilai_diberikan}` : record.nilai_diberikan}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-right font-mono text-brand-500 text-[10px]">
                        {record.guru_email}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={4} className="py-12 text-center text-brand-400 font-bold text-xs">
                    Belum ada riwayat pencatatan poin untuk Anda. Tetap patuhi aturan sekolah!
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
