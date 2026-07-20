import React, { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Award, Download, Calendar, RefreshCw, FileText, Search, Eye, X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { getKegiatanGuruList } from "../dbStore";
import { UserSession, KegiatanGuru } from "../types";
import { getSertifikatConfigAsync, getSertifikatConfig, SertifikatLayoutConfig } from "../sertifikatConfig";
import { toSentenceCase } from "../formatName";

interface GuruSertifikatViewProps {
  userSession: UserSession;
}

export function drawCertificateOnCanvas(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  templateImg: HTMLImageElement,
  kegiatan: KegiatanGuru,
  nameText: string,
  config: SertifikatLayoutConfig,
  ttd1Img?: HTMLImageElement | null,
  ttd2Img?: HTMLImageElement | null
) {
  // 1. Clear & Draw background template
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);
  ctx.drawImage(templateImg, 0, 0, canvasWidth, canvasHeight);

  const pos = config.positions;

  // Helper for drawing styled text
  const drawStyledText = (text: string, elemPos: any) => {
    if (!text) return;
    const fontStyle = elemPos.fontStyle || "normal";
    const fontWeight = elemPos.fontWeight || "normal";
    const fontSize = elemPos.fontSize || 24;
    const fontFamily = "sans-serif";

    ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`;
    ctx.fillStyle = elemPos.color || "#000000";
    ctx.textAlign = elemPos.align || "center";
    ctx.textBaseline = "middle";

    const x = (elemPos.xPercent / 100) * canvasWidth;
    const y = (elemPos.yPercent / 100) * canvasHeight;

    ctx.fillText(text, x, y);
  };

  // 2. No Sertifikat
  const noCertText = kegiatan.no_sertifikat ? `No: ${kegiatan.no_sertifikat}` : "";
  drawStyledText(noCertText, pos.noSertifikat);

  // 3. Prefix Nama ("Diberikan kepada:" / "We proudly present to:")
  drawStyledText("Diberikan kepada:", pos.prefixNama);

  // 4. Nama Guru / Peserta (Always Sentence Case)
  const formattedName = toSentenceCase(nameText);
  drawStyledText(formattedName, pos.namaGuru);

  // 5. Deskripsi Kegiatan
  const deskripsiText = `Atas partisipasi aktifnya sebagai ${kegiatan.peran} dalam kegiatan "${kegiatan.nama_kegiatan}" yang diselenggarakan oleh ${kegiatan.penyelenggara || "SMAN 19 Bandung"}.`;
  
  // Wrap multi-line deskripsi if needed
  const descX = (pos.deskripsi.xPercent / 100) * canvasWidth;
  const descY = (pos.deskripsi.yPercent / 100) * canvasHeight;
  ctx.font = `${pos.deskripsi.fontWeight || "normal"} ${pos.deskripsi.fontSize || 24}px sans-serif`;
  ctx.fillStyle = pos.deskripsi.color || "#334155";
  ctx.textAlign = pos.deskripsi.align || "center";
  ctx.textBaseline = "middle";

  const maxWidth = canvasWidth * 0.75;
  const words = deskripsiText.split(" ");
  let line = "";
  const lines: string[] = [];

  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + " ";
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && n > 0) {
      lines.push(line);
      line = words[n] + " ";
    } else {
      line = testLine;
    }
  }
  lines.push(line);

  const lineHeight = (pos.deskripsi.fontSize || 24) * 1.4;
  const startY = descY - ((lines.length - 1) * lineHeight) / 2;

  lines.forEach((l, index) => {
    ctx.fillText(l.trim(), descX, startY + index * lineHeight);
  });

  // 6. TTD 1 (Penanda Tangan Kiri)
  if (ttd1Img) {
    const imgW = (pos.ttd1ImagePos.widthPercent / 100) * canvasWidth;
    const aspect = ttd1Img.naturalWidth ? ttd1Img.naturalHeight / ttd1Img.naturalWidth : 0.5;
    const imgH = imgW * aspect;
    const imgX = (pos.ttd1ImagePos.xPercent / 100) * canvasWidth - imgW / 2;
    const imgY = (pos.ttd1ImagePos.yPercent / 100) * canvasHeight - imgH / 2;
    ctx.drawImage(ttd1Img, imgX, imgY, imgW, imgH);
  }
  drawStyledText(toSentenceCase(config.ttd1Nama), pos.ttd1NamaPos);
  drawStyledText(config.ttd1Jabatan, pos.ttd1JabatanPos);

  // 7. TTD 2 (Penanda Tangan Kanan)
  if (ttd2Img) {
    const imgW = (pos.ttd2ImagePos.widthPercent / 100) * canvasWidth;
    const aspect = ttd2Img.naturalWidth ? ttd2Img.naturalHeight / ttd2Img.naturalWidth : 0.5;
    const imgH = imgW * aspect;
    const imgX = (pos.ttd2ImagePos.xPercent / 100) * canvasWidth - imgW / 2;
    const imgY = (pos.ttd2ImagePos.yPercent / 100) * canvasHeight - imgH / 2;
    ctx.drawImage(ttd2Img, imgX, imgY, imgW, imgH);
  }
  drawStyledText(toSentenceCase(config.ttd2Nama), pos.ttd2NamaPos);
  drawStyledText(config.ttd2Jabatan, pos.ttd2JabatanPos);
}

export default function GuruSertifikatView({ userSession }: GuruSertifikatViewProps) {
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [previewKegiatan, setPreviewKegiatan] = useState<KegiatanGuru | null>(null);
  const [currentConfig, setCurrentConfig] = useState<SertifikatLayoutConfig>(() => getSertifikatConfig());
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Load config asynchronously & listen for updates
  useEffect(() => {
    getSertifikatConfigAsync().then(cfg => setCurrentConfig(cfg));

    const handleUpdate = (e: any) => {
      if (e.detail) {
        setCurrentConfig(e.detail);
      } else {
        getSertifikatConfigAsync().then(cfg => setCurrentConfig(cfg));
      }
    };

    window.addEventListener("sertifikat_config_updated", handleUpdate);
    return () => window.removeEventListener("sertifikat_config_updated", handleUpdate);
  }, []);

  // 1. Query teacher activities/certificates
  const { data: list = [], isLoading, refetch } = useQuery({
    queryKey: ["kegiatanGuruList", userSession.id],
    queryFn: () => getKegiatanGuruList(userSession.id),
  });

  // 2. Generate and download certificate using PNG template & dynamic positions
  const handleDownloadCertificate = async (kegiatan: KegiatanGuru) => {
    setDownloadingId(kegiatan.id);
    const config = await getSertifikatConfigAsync();
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setDownloadingId(null);
      return;
    }

    const templateImg = new Image();
    templateImg.src = config.templateUrl || "/sertifikat_template.png";

    const loadImg = (src: string | null): Promise<HTMLImageElement | null> => {
      if (!src) return Promise.resolve(null);
      return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = src;
      });
    };

    try {
      await new Promise<void>((resolve, reject) => {
        templateImg.onload = () => resolve();
        templateImg.onerror = () => reject(new Error("Gagal memuat template sertifikat"));
      });

      const ttd1Img = await loadImg(config.ttd1Image);
      const ttd2Img = await loadImg(config.ttd2Image);

      canvas.width = templateImg.naturalWidth || 2000;
      canvas.height = templateImg.naturalHeight || 1414;

      const nameText = userSession.fullName || userSession.email;

      drawCertificateOnCanvas(
        ctx,
        canvas.width,
        canvas.height,
        templateImg,
        kegiatan,
        nameText,
        config,
        ttd1Img,
        ttd2Img
      );

      const dataUrl = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = `SERTIFIKAT_${kegiatan.nama_kegiatan.toUpperCase().replace(/\s+/g, "_")}_${toSentenceCase(nameText).replace(/\s+/g, "_")}.png`;
      link.click();
    } catch (err: any) {
      alert("Gagal mengunduh sertifikat: " + err.message);
    } finally {
      setDownloadingId(null);
    }
  };

  // Render preview canvas whenever modal opens
  useEffect(() => {
    if (previewKegiatan && previewCanvasRef.current) {
      const canvas = previewCanvasRef.current;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const templateImg = new Image();
      templateImg.src = currentConfig.templateUrl || "/sertifikat_template.png";

      const loadImg = (src: string | null): Promise<HTMLImageElement | null> => {
        if (!src) return Promise.resolve(null);
        return new Promise((resolve) => {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = () => resolve(img);
          img.onerror = () => resolve(null);
          img.src = src;
        });
      };

      Promise.all([
        new Promise<void>((resolve) => {
          templateImg.onload = () => resolve();
          templateImg.onerror = () => resolve();
        }),
        loadImg(currentConfig.ttd1Image),
        loadImg(currentConfig.ttd2Image),
      ]).then(([_, ttd1Img, ttd2Img]) => {
        canvas.width = templateImg.naturalWidth || 2000;
        canvas.height = templateImg.naturalHeight || 1414;

        const nameText = userSession.fullName || userSession.email;

        drawCertificateOnCanvas(
          ctx,
          canvas.width,
          canvas.height,
          templateImg,
          previewKegiatan,
          nameText,
          currentConfig,
          ttd1Img,
          ttd2Img
        );
      });
    }
  }, [previewKegiatan, userSession, currentConfig]);

  const filteredList = list.filter(k => 
    k.nama_kegiatan.toLowerCase().includes(searchQuery.toLowerCase()) ||
    k.peran.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6 pb-12 animate-fade-in font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-brand-950 tracking-tight">
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
                </div>
              </div>

              <div className="pt-5 mt-4 relative z-10 grid grid-cols-2 gap-2">
                <button
                  onClick={() => setPreviewKegiatan(kegiatan)}
                  className="py-3 bg-brand-50 hover:bg-brand-100 border border-brand-100 rounded-2xl text-brand-700 text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Eye className="w-4 h-4" />
                  Pratinjau
                </button>
                <button
                  onClick={() => handleDownloadCertificate(kegiatan)}
                  disabled={downloadingId !== null}
                  className="py-3 bg-brand-600 hover:bg-brand-750 text-white rounded-2xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-md"
                >
                  {downloadingId === kegiatan.id ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      Unduh PNG
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

      {/* PREVIEW SERTIFIKAT MODAL */}
      <AnimatePresence>
        {previewKegiatan && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-brand-950/70 backdrop-blur-xs">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl w-full max-w-4xl shadow-2xl overflow-hidden border border-brand-150 flex flex-col max-h-[90vh]"
            >
              <div className="px-6 py-4 bg-brand-50 border-b border-brand-100 flex items-center justify-between flex-shrink-0">
                <div>
                  <h3 className="font-black text-brand-950 text-sm">Pratinjau Sertifikat Resmi</h3>
                  <p className="text-[10.5px] font-bold text-brand-500 mt-0.5">
                    {previewKegiatan.nama_kegiatan}
                  </p>
                </div>
                <button
                  onClick={() => setPreviewKegiatan(null)}
                  className="p-1.5 rounded-xl hover:bg-brand-200/50 text-brand-400 hover:text-brand-800 transition-all cursor-pointer bg-transparent border-0"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 overflow-y-auto flex-1 flex items-center justify-center bg-slate-900">
                <canvas
                  ref={previewCanvasRef}
                  className="w-full h-auto max-h-[60vh] object-contain rounded-xl shadow-2xl border border-slate-700"
                />
              </div>

              <div className="px-6 py-4 bg-brand-50/50 border-t border-brand-100 flex items-center justify-end gap-3 flex-shrink-0">
                <button
                  onClick={() => setPreviewKegiatan(null)}
                  className="px-4 py-2.5 rounded-2xl hover:bg-brand-200/40 text-brand-600 font-bold text-sm transition-all cursor-pointer bg-transparent border-0"
                >
                  Tutup
                </button>
                <button
                  onClick={() => handleDownloadCertificate(previewKegiatan)}
                  disabled={downloadingId !== null}
                  className="px-5 py-2.5 rounded-2xl bg-brand-600 hover:bg-brand-750 text-white font-bold text-sm shadow-md transition-all cursor-pointer border-0 flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Unduh Sertifikat PNG
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
