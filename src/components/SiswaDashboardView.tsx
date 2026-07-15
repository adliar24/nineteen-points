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
  Check
} from "lucide-react";
import { UserSession, RiwayatPoin, Siswa } from "../types";
import { supabase } from "../supabaseClient";
import html2canvas from "html2canvas-pro";

interface SiswaDashboardViewProps {
  userSession: UserSession;
  activeTab: string;
}

export default function SiswaDashboardView({ userSession, activeTab }: SiswaDashboardViewProps) {
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
    const cardElement = document.getElementById("student-digital-card-portrait");
    if (cardElement) {
      try {
        const canvas = await html2canvas(cardElement, {
          scale: 3, // High-quality rendering
          useCORS: true,
          backgroundColor: "#f5f3ff"
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
                Selamat datang di Portal Nilai & Karakter Siswa SMAN 19 Bandung. Pantau terus prestasimu!
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
                <p className="text-[10px] text-slate-400 mt-0.5">Poin penghargaan karakter terpuji</p>
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
                <p className="text-[10px] text-slate-400 mt-0.5">Pengurangan dari perilaku negatif</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-3xl p-6 border border-brand-100 shadow-xl shadow-brand-900/5 space-y-4">
            <h3 className="text-sm font-black text-brand-950 uppercase tracking-widest flex items-center gap-2">
              <Clock className="w-5 h-5 text-brand-600" />
              Sekilas Riwayat Terakhir
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
                        Belum ada riwayat pencatatan poin.
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
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start animate-fade-in">
          {/* Card Showcase Column (5 cols) */}
          <div className="lg:col-span-5 flex flex-col items-center space-y-5">
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

            {/* Portrait digital card: White & Purple Theme */}
            <div
              id="student-digital-card-portrait"
              className="w-full max-w-[290px] aspect-[1/1.58] rounded-[32px] bg-gradient-to-b from-[#f5f3ff] via-white to-[#f5f3ff] text-brand-950 p-6 border border-brand-200 relative overflow-hidden flex flex-col justify-between shadow-2xl shadow-brand-950/10 flex-shrink-0"
              style={{ width: "290px", height: "458px" }}
            >
              {/* Decorative mesh gradients in purple/fuchsia */}
              <div className="absolute top-0 inset-x-0 h-40 bg-gradient-to-b from-brand-100/40 to-transparent filter blur-xl pointer-events-none" />
              <div className="absolute bottom-0 right-0 w-44 h-44 bg-accent-500/5 rounded-full filter blur-2xl pointer-events-none" />
              
              {/* Header block: School name & logo */}
              <div className="flex items-center gap-2.5 border-b border-brand-200/50 pb-4 relative z-10">
                <img src="/logo.png" className="w-8 h-8 object-contain" alt="Logo" />
                <div>
                  <h4 className="text-[10px] font-black tracking-widest text-brand-900 uppercase font-sans leading-tight">SMAN 19 BANDUNG</h4>
                  <p className="text-[8px] text-brand-500/80 font-bold uppercase tracking-wider mt-0.5">NineTeen Points Card</p>
                </div>
              </div>

              {/* Middle block: Student avatar initial & detail */}
              <div className="flex flex-col items-center justify-center space-y-4 my-auto relative z-10">
                {/* Avatar with initial letter */}
                <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-brand-600 via-accent-500 to-brand-500 p-[3px] shadow-md shadow-brand-500/15">
                  <div className="w-full h-full rounded-full bg-brand-50 flex items-center justify-center font-black text-2xl uppercase tracking-wider text-brand-850">
                    {siswaDetail.nama.slice(0, 2)}
                  </div>
                </div>

                {/* Name & Class info */}
                <div className="text-center space-y-1">
                  <span className="text-[7px] bg-brand-600 text-white px-2.5 py-0.5 rounded-full uppercase font-black tracking-widest inline-block mb-1">
                    PELAJAR
                  </span>
                  <h3 className="text-base font-black tracking-tight text-brand-950 px-2 line-clamp-1">
                    {siswaDetail.nama}
                  </h3>
                  <div className="flex items-center justify-center gap-2.5 text-[10px] text-brand-700 font-bold font-mono">
                    <span>NIS: {siswaDetail.nis}</span>
                    <span className="w-1 h-1 bg-brand-200 rounded-full" />
                    <span>KELAS: {siswaDetail.kelas}</span>
                  </div>
                </div>
              </div>

              {/* Bottom block: High quality QR code */}
              <div className="flex flex-col items-center justify-center space-y-4 relative z-10 border-t border-brand-200/50 pt-4">
                <div className="bg-white p-2.5 rounded-2xl shadow-md border border-brand-100">
                  <QRCodeSVG
                    value={siswaDetail.nis}
                    size={100}
                    level="M"
                    includeMargin={false}
                  />
                </div>
                
                <div className="flex items-center gap-1.5 text-[8px] text-brand-500/70 font-bold uppercase tracking-widest">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span>KARTU INTEGRASI DIGITAL TERVERIFIKASI</span>
                </div>
              </div>
            </div>
          </div>

          {/* Guide / Instruction Column (7 cols) - Shortened and clean */}
          <div className="lg:col-span-7 space-y-4">
            <div className="bg-white p-6 rounded-3xl border border-brand-100 shadow-xl shadow-brand-900/5 space-y-4">
              <h3 className="text-sm font-black text-brand-950 uppercase tracking-widest">Informasi Kartu</h3>
              
              <div className="space-y-3.5">
                <div className="flex gap-3">
                  <div className="w-6 h-6 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center font-bold text-[10.5px] flex-shrink-0">
                    1
                  </div>
                  <p className="text-xs text-brand-600 leading-relaxed font-semibold">
                    Tunjukkan QR Code pada Guru Piket/Pembina untuk pencatatan poin secara instan.
                  </p>
                </div>

                <div className="flex gap-3">
                  <div className="w-6 h-6 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center font-bold text-[10.5px] flex-shrink-0">
                    2
                  </div>
                  <p className="text-xs text-brand-600 leading-relaxed font-semibold">
                    Gunakan **Download PNG** untuk menyimpan gambar kartu digital ini langsung di galeri handphone Anda.
                  </p>
                </div>
              </div>
            </div>
            
            <div className="bg-brand-50/40 rounded-3xl p-4.5 border border-brand-100 flex items-center gap-3">
              <ShieldCheck className="w-5 h-5 text-brand-600 flex-shrink-0" />
              <p className="text-[11px] text-brand-800 font-bold leading-normal">
                Format kartu digital ini terintegrasi secara aman dengan sistem poin SMAN 19 Bandung.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 3. RIWAYAT POIN TAB */}
      {activeTab === "siswa_history" && (
        <div className="bg-white rounded-3xl border border-brand-100 shadow-xl shadow-brand-900/5 overflow-hidden animate-fade-in">
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
      )}

    </div>
  );
}
