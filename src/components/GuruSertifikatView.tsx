import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Award, Download, Calendar, RefreshCw, FileText, Search } from "lucide-react";
import { getKegiatanGuruList } from "../dbStore";
import { UserSession, KegiatanGuru } from "../types";
import { toSentenceCase } from "../formatName";

interface GuruSertifikatViewProps {
  userSession: UserSession;
}

export default function GuruSertifikatView({ userSession }: GuruSertifikatViewProps) {
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // 1. Query teacher activities/certificates
  const { data: list = [], isLoading, refetch } = useQuery({
    queryKey: ["kegiatanGuruList", userSession.id],
    queryFn: () => getKegiatanGuruList(userSession.id),
  });

  // 2. Generate and download certificate dynamic canvas
  const handleDownloadCertificate = (kegiatan: KegiatanGuru) => {
    setDownloadingId(kegiatan.id);
    const canvas = document.createElement("canvas");
    canvas.width = 1123; // A4 landscape resolution at 96 DPI (approx)
    canvas.height = 794;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setDownloadingId(null);
      return;
    }

    // Load logo first
    const logoImg = new Image();
    logoImg.src = "/logo.png";
    logoImg.onload = () => {
      // Background base
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Border Design (Premium deep purple and gold borders)
      ctx.lineWidth = 16;
      ctx.strokeStyle = "#4c1d95"; // Deep Purple
      ctx.strokeRect(20, 20, canvas.width - 40, canvas.height - 40);

      ctx.lineWidth = 4;
      ctx.strokeStyle = "#d97706"; // Gold
      ctx.strokeRect(36, 36, canvas.width - 72, canvas.height - 72);

      // Corner gold ornaments
      ctx.fillStyle = "#d97706";
      // Top Left
      ctx.fillRect(36, 36, 40, 6);
      ctx.fillRect(36, 36, 6, 40);
      // Top Right
      ctx.fillRect(canvas.width - 76, 36, 40, 6);
      ctx.fillRect(canvas.width - 42, 36, 6, 40);
      // Bottom Left
      ctx.fillRect(36, canvas.height - 42, 40, 6);
      ctx.fillRect(36, canvas.height - 76, 6, 40);
      // Bottom Right
      ctx.fillRect(canvas.width - 76, canvas.height - 42, 40, 6);
      ctx.fillRect(canvas.width - 42, canvas.height - 76, 6, 40);

      // Draw School Logo
      ctx.drawImage(logoImg, canvas.width / 2 - 45, 60, 90, 90);

      // Certificate Title
      ctx.fillStyle = "#1e1b4b";
      ctx.font = "black 32px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("SERTIFIKAT PENGHARGAAN", canvas.width / 2, 200);

      // Subtitle
      ctx.fillStyle = "#d97706";
      ctx.font = "bold 14px sans-serif";
      ctx.fillText(kegiatan.no_sertifikat ? `NOMOR: ${kegiatan.no_sertifikat}` : "NOMOR: -", canvas.width / 2, 230);

      // Diberikan Kepada
      ctx.fillStyle = "#64748b";
      ctx.font = "italic 16px sans-serif";
      ctx.fillText("Sertifikat ini dengan bangga diberikan kepada:", canvas.width / 2, 280);

      // Teacher Name (Big, Bold, Purple)
      ctx.fillStyle = "#4c1d95";
      ctx.font = "extrabold 36px sans-serif";
      ctx.fillText(userSession.fullName.toUpperCase(), canvas.width / 2, 335);

      // Role Text
      ctx.fillStyle = "#64748b";
      ctx.font = "italic 16px sans-serif";
      ctx.fillText(`Atas partisipasi aktifnya sebagai:`, canvas.width / 2, 385);

      // Role Name
      ctx.fillStyle = "#d97706";
      ctx.font = "bold 22px sans-serif";
      ctx.fillText(kegiatan.peran.toUpperCase(), canvas.width / 2, 420);

      // Activity Text
      ctx.fillStyle = "#64748b";
      ctx.font = "italic 16px sans-serif";
      ctx.fillText(`Dalam kegiatan:`, canvas.width / 2, 465);

      // Activity Name
      ctx.fillStyle = "#1e1b4b";
      ctx.font = "bold 20px sans-serif";
      // Wrap activity title if too long
      const words = kegiatan.nama_kegiatan.split(" ");
      let line = "";
      let y = 500;
      for (let n = 0; n < words.length; n++) {
        const testLine = line + words[n] + " ";
        const metrics = ctx.measureText(testLine);
        if (metrics.width > 700 && n > 0) {
          ctx.fillText(line, canvas.width / 2, y);
          line = words[n] + " ";
          y += 26;
        } else {
          line = testLine;
        }
      }
      ctx.fillText(line, canvas.width / 2, y);

      // Info Footer
      ctx.fillStyle = "#64748b";
      ctx.font = "semibold 13px sans-serif";
      const dateFormatted = new Date(kegiatan.tanggal_kegiatan).toLocaleDateString("id-ID", { day: 'numeric', month: 'long', year: 'numeric' });
      ctx.fillText(
        `Diselenggarakan oleh ${kegiatan.penyelenggara} pada tanggal ${dateFormatted} ${
          kegiatan.durasi_jam ? `dengan beban belajar sebanyak ${kegiatan.durasi_jam} JP.` : "."
        }`,
        canvas.width / 2,
        y + 40
      );

      // Signatures
      // Left Sign
      ctx.fillStyle = "#1e1b4b";
      ctx.font = "bold 13px sans-serif";
      ctx.fillText("Kepala SMAN 19 Bandung,", 250, 630);
      ctx.lineWidth = 1;
      ctx.strokeStyle = "#94a3b8";
      ctx.beginPath();
      ctx.moveTo(150, 700);
      ctx.lineTo(350, 700);
      ctx.stroke();
      ctx.fillStyle = "#64748b";
      ctx.fillText("NIP. 197401121999031002", 250, 720);

      // Right Sign
      ctx.fillStyle = "#1e1b4b";
      ctx.font = "bold 13px sans-serif";
      ctx.fillText("Ketua Penyelenggara,", canvas.width - 250, 630);
      ctx.beginPath();
      ctx.moveTo(canvas.width - 350, 700);
      ctx.lineTo(canvas.width - 150, 700);
      ctx.stroke();
      ctx.fillStyle = "#64748b";
      ctx.fillText("Panitia Pelaksana", canvas.width - 250, 720);

      // Trigger Download
      const dataUrl = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = `SERTIFIKAT_${kegiatan.nama_kegiatan.toUpperCase().replace(/\s+/g, "_")}_${userSession.fullName.toUpperCase().replace(/\s+/g, "_")}.png`;
      link.click();
      setDownloadingId(null);
    };

    logoImg.onerror = () => {
      // Fallback without logo
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.lineWidth = 16;
      ctx.strokeStyle = "#4c1d95";
      ctx.strokeRect(20, 20, canvas.width - 40, canvas.height - 40);

      ctx.fillStyle = "#1e1b4b";
      ctx.font = "black 32px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("SERTIFIKAT PENGHARGAAN", canvas.width / 2, 200);

      ctx.font = "bold 20px sans-serif";
      ctx.fillText(kegiatan.nama_kegiatan, canvas.width / 2, 360);

      const dataUrl = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = `sertifikat_${kegiatan.id}.png`;
      link.click();
      setDownloadingId(null);
    };
  };

  const filteredList = list.filter(k => 
    k.nama_kegiatan.toLowerCase().includes(searchQuery.toLowerCase()) ||
    k.peran.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6 pb-12 animate-fade-in font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-brand-950 tracking-tight flex items-center gap-2">
            <Award className="w-6 h-6 text-brand-600" />
            Sertifikat Kegiatan
          </h2>
          <p className="text-xs text-brand-500 font-semibold mt-1">
            Lihat riwayat keikutsertaan kegiatan sekolah dan unduh sertifikat resmi Anda.
          </p>
        </div>
      </div>

      {/* SEARCH AND CONTROLS BAR */}
      <div className="bg-white p-5 rounded-3xl border border-brand-100 shadow-xl shadow-brand-900/5 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-brand-500/50 w-5 h-5" />
          <input
            type="text"
            placeholder="Cari berdasarkan nama kegiatan atau peran..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-11 pr-4 py-3 bg-brand-50/20 rounded-2xl border border-brand-100 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white transition-all text-brand-950 placeholder-brand-500/30"
          />
        </div>
        <button
          onClick={() => refetch()}
          className="p-3 bg-brand-50 text-brand-600 rounded-2xl hover:bg-brand-100 border border-brand-100/50 transition-colors cursor-pointer w-full sm:w-auto flex justify-center items-center"
        >
          <RefreshCw className="w-4.5 h-4.5" />
        </button>
      </div>

      {/* CERTIFICATES GRID LIST */}
      {isLoading ? (
        <div className="bg-white rounded-3xl p-12 border border-brand-100 shadow-xl text-center">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto text-brand-500" />
          <p className="text-xs font-bold text-brand-400 mt-2">Memuat sertifikat Anda...</p>
        </div>
      ) : filteredList.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filteredList.map((kegiatan) => (
            <div
              key={kegiatan.id}
              className="bg-white rounded-3xl p-6 border border-brand-100 shadow-xl shadow-brand-900/5 flex flex-col justify-between hover:scale-[1.01] transition-all relative overflow-hidden group"
            >
              {/* Corner decorative wave */}
              <div className="absolute top-0 right-0 w-24 h-24 bg-brand-600/5 rounded-full filter blur-xl translate-x-6 -translate-y-6 group-hover:scale-125 transition-transform" />

              <div className="space-y-4 relative z-10">
                <div className="flex justify-between items-start">
                  <div className="w-10 h-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center font-bold">
                    <Award className="w-5.5 h-5.5" />
                  </div>
                  <span className="text-[10px] font-black uppercase bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-1 rounded-xl">
                    {kegiatan.peran}
                  </span>
                </div>

                <div className="space-y-1">
                  <h4 className="font-extrabold text-sm text-brand-950 group-hover:text-brand-700 transition-colors line-clamp-2 leading-snug">
                    {kegiatan.nama_kegiatan}
                  </h4>
                  {kegiatan.no_sertifikat && (
                    <p className="text-[10px] text-slate-400 font-mono">No: {kegiatan.no_sertifikat}</p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-400 font-semibold pt-1 border-t border-slate-50">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-brand-500" />
                    {new Date(kegiatan.tanggal_kegiatan).toLocaleDateString("id-ID", { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                  {kegiatan.durasi_jam && (
                    <>
                      <span className="w-1 h-1 bg-slate-300 rounded-full" />
                      <span>{kegiatan.durasi_jam} Jam Pelajaran (JP)</span>
                    </>
                  )}
                </div>
              </div>

              <div className="pt-5 mt-4 relative z-10">
                <button
                  onClick={() => handleDownloadCertificate(kegiatan)}
                  disabled={downloadingId !== null}
                  className="w-full py-3 bg-brand-50 hover:bg-brand-600 border border-brand-100 hover:border-transparent rounded-2xl text-brand-700 hover:text-white text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {downloadingId === kegiatan.id ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Menggambar Sertifikat...
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      Unduh Sertifikat PNG
                    </>
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-3xl p-16 text-center border border-brand-100 shadow-xl shadow-brand-900/5 max-w-md mx-auto space-y-3">
          <FileText className="w-10 h-10 text-brand-300 mx-auto" />
          <h4 className="text-xs font-black text-brand-500 uppercase tracking-widest">Sertifikat Kosong</h4>
          <p className="text-[10px] text-brand-400 font-semibold leading-relaxed">
            Belum ada data kegiatan yang didaftarkan oleh Admin untuk Anda. Silakan hubungi Admin Sekolah jika ini keliru.
          </p>
        </div>
      )}
    </div>
  );
}
