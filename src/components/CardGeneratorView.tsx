import React, { useState, useRef } from "react";
import { motion } from "motion/react";
import { QRCodeSVG } from "qrcode.react";
import { Download, Users, Printer, FileText, Check, Sparkles, School, ShieldAlert } from "lucide-react";
import { Siswa } from "../types";
import { getSiswaList } from "../dbStore";
import html2canvas from "html2canvas-pro";
import jsPDF from "jspdf";

export default function CardGeneratorView() {
  const [siswaList, setSiswaList] = useState<Siswa[]>(getSiswaList());
  const [selectedClass, setSelectedClass] = useState("Semua");
  const [selectedSiswaIds, setSelectedSiswaIds] = useState<string[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");

  const containerRef = useRef<HTMLDivElement>(null);

  const classes = ["Semua", ...Array.from(new Set(siswaList.map((s) => s.kelas)))];

  const filteredSiswa = siswaList.filter(
    (s) => selectedClass === "Semua" || s.kelas === selectedClass
  );

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedSiswaIds(filteredSiswa.map((s) => s.id));
    } else {
      setSelectedSiswaIds([]);
    }
  };

  const handleSelectSiswa = (id: string) => {
    if (selectedSiswaIds.includes(id)) {
      setSelectedSiswaIds(selectedSiswaIds.filter((item) => item !== id));
    } else {
      setSelectedSiswaIds([...selectedSiswaIds, id]);
    }
  };

  const showToast = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(""), 4000);
  };

  // Render cards to PDF using html2canvas & jspdf
  const exportToPDF = async () => {
    const targets = selectedSiswaIds.length > 0 ? selectedSiswaIds : filteredSiswa.map(s => s.id);
    if (targets.length === 0) {
      alert("Tidak ada siswa untuk diexport.");
      return;
    }

    setIsExporting(true);
    showToast("Memulai render kartu ke PDF...");

    try {
      const pdf = new jsPDF("p", "mm", "a4");
      let currentY = 15;
      const cardHeight = 58; // Standard business card ratio in mm
      const cardWidth = 90;
      const marginX = 15;
      
      // We will render cards that are visible in the temporary DOM list
      for (let i = 0; i < targets.length; i++) {
        const studentId = targets[i];
        const cardElement = document.getElementById(`card-render-${studentId}`);
        
        if (cardElement) {
          const canvas = await html2canvas(cardElement, {
            scale: 2, // higher resolution
            useCORS: true,
            backgroundColor: "#ffffff"
          });
          
          const imgData = canvas.toDataURL("image/png");
          
          // Determine placement on A4 page (2 cards per row)
          const col = i % 2;
          const row = Math.floor((i % 4) / 2); // 4 cards per page
          
          if (i > 0 && i % 4 === 0) {
            pdf.addPage();
            currentY = 15;
          }
          
          const posX = marginX + col * (cardWidth + 10);
          const posY = currentY + row * (cardHeight + 10);
          
          pdf.addImage(imgData, "PNG", posX, posY, cardWidth, cardHeight);
        }
      }

      pdf.save(`KARTU_QR_SISWA_${selectedClass.replace(/\s+/g, "_")}.pdf`);
      showToast("Unduh PDF Berhasil! Semua kartu siap dicetak.");
    } catch (error) {
      console.error("PDF generation failed", error);
      alert("Gagal mengekspor kartu ke PDF. Silakan coba kembali.");
    } finally {
      setIsExporting(false);
    }
  };

  // Export a single card directly
  const downloadSingleCard = async (studentId: string, studentName: string) => {
    const cardElement = document.getElementById(`card-render-${studentId}`);
    if (!cardElement) return;

    try {
      const canvas = await html2canvas(cardElement, { scale: 3, useCORS: true });
      const imgData = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.download = `KARTU_PELAJAR_${studentName.toUpperCase().replace(/\s+/g, "_")}.png`;
      link.href = imgData;
      link.click();
      showToast(`Kartu ${studentName} berhasil diunduh sebagai gambar.`);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-8">
      {/* Toast Feedback */}
      {successMsg && (
        <div className="fixed bottom-6 right-6 z-50 bg-brand-950 text-white px-5 py-3.5 rounded-2xl shadow-2xl flex items-center gap-3 animate-bounce border border-brand-800">
          <Sparkles className="w-5 h-5 text-accent-500" />
          <span className="text-xs font-extrabold tracking-wide uppercase">{successMsg}</span>
        </div>
      )}

      {/* Control Panel - redesigned to match gorgeous card layout */}
      <div className="bg-white p-6 rounded-3xl border border-brand-100 shadow-xl shadow-brand-900/5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h3 className="text-xl font-extrabold text-brand-900 flex items-center gap-2.5">
              <Printer className="w-6 h-6 text-brand-600" />
              Cetak Kartu Siswa & QR Code
            </h3>
            <p className="text-xs font-medium text-brand-500 mt-1 leading-relaxed">
              Pilih kelas dan siswa untuk dicetak kartunya. Kartu dilengkapi kode QR unik yang berisi NIS siswa untuk kemudahan scan di kelas/gerbang.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <select
              value={selectedClass}
              onChange={(e) => {
                setSelectedClass(e.target.value);
                setSelectedSiswaIds([]);
              }}
              className="py-3 px-4.5 bg-brand-50/20 border border-brand-100 rounded-2xl text-sm font-bold text-brand-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              {classes.map((cls) => (
                <option key={cls} value={cls}>
                  {cls === "Semua" ? "Semua Kelas" : `Kelas ${cls}`}
                </option>
              ))}
            </select>

            <motion.button
              whileHover={{ scale: 1.02, y: -1 }}
              whileTap={{ scale: 0.98 }}
              onClick={exportToPDF}
              disabled={isExporting}
              className="px-6 py-3 brand-gradient text-white rounded-2xl text-sm font-bold transition-all shadow-lg shadow-brand-500/20 flex items-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              {isExporting ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <Download className="w-4 h-4" />
              )}
              {selectedSiswaIds.length > 0
                ? `Cetak Terpilih (${selectedSiswaIds.length}) ke PDF`
                : "Cetak Semua ke PDF"}
            </motion.button>
          </div>
        </div>

        {/* Multi selection stats */}
        <div className="bg-brand-50/50 p-4.5 rounded-2xl flex flex-wrap items-center justify-between gap-3 text-xs text-brand-700 border border-brand-100/40">
          <div className="flex items-center gap-2">
            <Users className="w-4.5 h-4.5 text-brand-600" />
            <span className="font-medium">Siswa yang difilter: <strong className="font-bold text-brand-900">{filteredSiswa.length} siswa</strong></span>
            {selectedSiswaIds.length > 0 && (
              <span className="ml-2 font-black bg-brand-500 text-white px-2.5 py-1 rounded-xl text-[9px] uppercase tracking-wider">
                Dipilih: {selectedSiswaIds.length} siswa
              </span>
            )}
          </div>
          <label className="flex items-center gap-2 cursor-pointer font-bold text-brand-900">
            <input
              type="checkbox"
              checked={filteredSiswa.length > 0 && filteredSiswa.every(s => selectedSiswaIds.includes(s.id))}
              onChange={handleSelectAll}
              className="w-4.5 h-4.5 rounded-lg border-brand-200 text-brand-600 focus:ring-brand-500 cursor-pointer"
            />
            Pilih Semua Siswa Di Sini
          </label>
        </div>
      </div>

      {/* Grid of Student Cards (Render Preview and target for canvas export) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8" ref={containerRef}>
        {filteredSiswa.map((siswa) => {
          const isSelected = selectedSiswaIds.includes(siswa.id);
          return (
            <div
              key={siswa.id}
              className={`bg-white rounded-3xl p-5 border transition-all ${
                isSelected 
                  ? "border-brand-500 ring-4 ring-brand-500/10 bg-brand-50/10" 
                  : "border-brand-100 hover:border-brand-200 shadow-xl shadow-brand-900/5"
              } space-y-5`}
            >
              {/* Card visual template for print rendering - styled premium matching bank audit style */}
              <div
                id={`card-render-${siswa.id}`}
                className="w-full bg-gradient-to-tr from-brand-950 via-brand-900 to-purple-950 text-white rounded-2xl p-5 border border-brand-800 relative overflow-hidden aspect-[1.58] select-none shadow-xl flex flex-col justify-between wave-bg"
                style={{ width: "100%", maxWidth: "340px", margin: "0 auto" }}
              >
                {/* Header background brand strip in fuchsia */}
                <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-accent-500 via-brand-500 to-fuchsia-500"></div>
                <div className="absolute top-0 right-0 w-36 h-36 bg-accent-500/20 rounded-full filter blur-2xl pointer-events-none"></div>

                {/* School title card header */}
                <div className="flex items-center gap-2 border-b border-white/10 pb-2.5 relative z-10">
                  <div className="w-7 h-7 bg-white rounded-lg flex items-center justify-center border border-white/15 p-0.5">
                    <img src="/logo.png" className="w-full h-full object-contain" alt="Logo" />
                  </div>
                  <div>
                    <h4 className="text-[10px] font-black tracking-widest text-white uppercase font-sans">SMAN 19 BANDUNG</h4>
                    <p className="text-[7px] text-brand-200/80 font-medium">Jl. Gatot Subroto No. 64, Bandung</p>
                  </div>
                </div>

                {/* Card Main Body */}
                <div className="flex items-center justify-between gap-3 my-2.5 flex-1 relative z-10">
                  {/* Left profile text */}
                  <div className="space-y-2 flex-1 min-w-0">
                    <div className="space-y-0.5">
                      <p className="text-[6.5px] text-accent-400 font-extrabold uppercase tracking-widest">NAMA PELAJAR</p>
                      <h5 className="text-[13px] font-black tracking-tight truncate text-white">{siswa.nama}</h5>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <p className="text-[6px] text-brand-200 font-extrabold uppercase tracking-wider">NIS</p>
                        <p className="text-[10px] font-mono font-black text-white">{siswa.nis}</p>
                      </div>
                      <div>
                        <p className="text-[6px] text-brand-200 font-extrabold uppercase tracking-wider">KELAS</p>
                        <p className="text-[10px] font-black text-accent-300 uppercase">{siswa.kelas}</p>
                      </div>
                    </div>
                  </div>

                  {/* Right QR Code area */}
                  <div className="bg-white p-1.5 rounded-xl flex-shrink-0 flex items-center justify-center shadow-lg border border-white/20 relative">
                    <div className="absolute -inset-1 bg-gradient-to-tr from-accent-500 to-fuchsia-500 rounded-xl filter blur-sm opacity-30 pointer-events-none" />
                    <QRCodeSVG
                      value={siswa.nis}
                      size={54}
                      level="H"
                      bgColor="#ffffff"
                      fgColor="#3b0764"
                    />
                  </div>
                </div>

                {/* Card footer */}
                <div className="flex justify-between items-center border-t border-white/5 pt-2 text-[6.5px] text-brand-200/70 font-semibold relative z-10">
                  <span className="uppercase tracking-wider">KARTU INDUK AKADEMIK SISWA</span>
                  <span className="font-extrabold text-accent-400 font-sans tracking-widest uppercase">SMAN 19</span>
                </div>
              </div>

              {/* Row Selector and controls */}
              <div className="flex items-center justify-between border-t border-brand-100 pt-3 text-xs">
                <label className="flex items-center gap-2 cursor-pointer font-bold text-brand-700">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => handleSelectSiswa(siswa.id)}
                    className="w-4.5 h-4.5 rounded-lg border-brand-200 text-brand-600 focus:ring-brand-500 cursor-pointer"
                  />
                  Pilih Kartu
                </label>

                <button
                  onClick={() => downloadSingleCard(siswa.id, siswa.nama)}
                  className="flex items-center gap-1.5 text-brand-700 hover:text-brand-950 font-bold hover:bg-brand-50 px-3.5 py-2 rounded-xl transition-all border border-brand-100/50 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-brand-600" />
                  Unduh PNG
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
