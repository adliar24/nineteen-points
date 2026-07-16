import React, { useState, useEffect, useRef } from "react";
import { motion } from "motion/react";
import { Html5QrcodeScanner } from "html5-qrcode";
import { Camera, AlertCircle, Check, Award, Search, Users, Zap, X, ShieldCheck } from "lucide-react";
import { Siswa, MasterPoin, UserSession } from "../types";
import { getSiswaList, getMasterPoinList, addRiwayat } from "../dbStore";

interface QRScannerViewProps {
  userSession: UserSession;
  onRefreshHistory: () => void;
}

export default function QRScannerView({ userSession, onRefreshHistory }: QRScannerViewProps) {
  const [siswaList, setSiswaList] = useState<Siswa[]>(getSiswaList());
  const [masterPoin, setMasterPoin] = useState<MasterPoin[]>(getMasterPoinList());
  
  // Scanner state
  const [scanResult, setScanResult] = useState<string | null>(null);
  const [scannedSiswa, setScannedSiswa] = useState<Siswa | null>(null);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);

  // Point assignment state for scanned student
  const [selectedPoinId, setSelectedPoinId] = useState("");
  const [customPointName, setCustomPointName] = useState("");
  const [customPointValue, setCustomPointValue] = useState(10);
  const [isCustomPoint, setIsCustomPoint] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Load students and points on mount
  useEffect(() => {
    setSiswaList(getSiswaList());
    setMasterPoin(getMasterPoinList());
  }, []);

  // Initialize and clean up real camera scanner
  useEffect(() => {
    if (cameraActive) {
      setScannerError(null);
      // Give a small delay to let container render
      const timer = setTimeout(() => {
        try {
          const scanner = new Html5QrcodeScanner(
            "reader",
            { 
              fps: 10, 
              qrbox: { width: 250, height: 250 },
              aspectRatio: 1.0
            },
            /* verbose= */ false
          );

          scanner.render(onScanSuccess, onScanFailure);
          scannerRef.current = scanner;
        } catch (err: any) {
          console.error("Camera initialisation failed", err);
          setScannerError("Gagal mengakses kamera. Pastikan izin kamera diaktifkan atau gunakan Simulator Kartu di kanan.");
          setCameraActive(false);
        }
      }, 300);

      return () => {
        clearTimeout(timer);
        if (scannerRef.current) {
          scannerRef.current.clear().catch((err) => {
            console.warn("Error clearing scanner", err);
          });
          scannerRef.current = null;
        }
      };
    }
  }, [cameraActive]);

  // Handlers
  function onScanSuccess(decodedText: string) {
    // A QR code might represent the Student's NIS (e.g. "19001") or full ID
    const trimmedText = decodedText.trim();
    setScanResult(trimmedText);

    // Look up student by NIS or ID
    const student = siswaList.find(
      (s) => s.nis === trimmedText || s.id === trimmedText
    );

    if (student) {
      setScannedSiswa(student);
      // Stop scanner temporarily if it's running
      if (scannerRef.current) {
        scannerRef.current.clear().catch(err => console.log(err));
        scannerRef.current = null;
        setCameraActive(false);
      }
    } else {
      setScannerError(`QR Terbaca: "${trimmedText}", namun siswa tidak ditemukan dalam database.`);
      // Reset after 4 seconds
      setTimeout(() => setScannerError(null), 4000);
    }
  }

  function onScanFailure(error: any) {
    // Failures happen on every frame without a QR code, so we ignore general frames
  }

  // Simulator scan trigger
  const handleSimulateScan = (siswa: Siswa) => {
    setScanResult(siswa.nis);
    setScannedSiswa(siswa);
    setSuccessMessage(null);
    if (scannerRef.current) {
      scannerRef.current.clear().catch(err => console.log(err));
      scannerRef.current = null;
      setCameraActive(false);
    }
  };

  const handleApplyPoint = () => {
    if (!scannedSiswa) return;

    let name = "";
    let value = 0;

    if (isCustomPoint) {
      if (!customPointName) {
        alert("Mohon masukkan keterangan poin kustom.");
        return;
      }
      name = customPointName;
      value = customPointValue;
    } else {
      const selected = masterPoin.find((p) => p.id === selectedPoinId);
      if (!selected) {
        alert("Silakan pilih jenis prestasi atau pelanggaran.");
        return;
      }
      name = selected.nama_poin;
      value = selected.nilai_poin;
    }

    addRiwayat(scannedSiswa.id, name, value, userSession.fullName);
    onRefreshHistory();

    // Show success banner
    setSuccessMessage(
      `Poin berhasil dicatat! ${scannedSiswa.nama} (${scannedSiswa.kelas}) mendapatkan ${
        value > 0 ? `+${value}` : value
      } poin untuk "${name}".`
    );

    // Update locally displayed score
    const updatedSiswa = { ...scannedSiswa, total_poin: scannedSiswa.total_poin + value };
    setScannedSiswa(updatedSiswa);

    // Refresh database student list
    setSiswaList(getSiswaList());

    // Reset fields
    setSelectedPoinId("");
    setCustomPointName("");
    setIsCustomPoint(false);
  };

  const handleResetScanner = () => {
    setScanResult(null);
    setScannedSiswa(null);
    setSuccessMessage(null);
    setScannerError(null);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
      {/* SCANNING BOX (Left - 7 cols) */}
      <div className="lg:col-span-7 bg-white rounded-3xl border border-brand-100 shadow-xl shadow-brand-900/5 p-6 space-y-6">
        <div>
          <h3 className="text-xl font-extrabold text-brand-900 flex items-center gap-2.5">
            <Camera className="w-6 h-6 text-brand-600" />
            Scanner Kamera QR SMAN 19
          </h3>
          <p className="text-xs font-medium text-brand-500 mt-1 leading-relaxed">
            Pindai Kode QR Kartu Pelajar siswa secara instan menggunakan kamera pembina. Sistem akan otomatis menarik data profil siswa dan membuka formulir penyesuaian poin secara otomatis.
          </p>
        </div>

        {/* Security / session badge */}
        <div className="bg-brand-50/70 rounded-2xl p-3.5 border border-brand-100/60 flex items-center justify-between text-xs text-brand-900 shadow-xs">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-accent-500" />
            <span>Petugas Aktif: <strong className="font-bold text-brand-900">{userSession.fullName}</strong> <span className="text-brand-500">({userSession.email})</span></span>
          </div>
          <span className="font-black bg-brand-600 text-white px-2.5 py-1 rounded-xl text-[9px] uppercase tracking-wider shadow-sm">
            TERVERIFIKASI
          </span>
        </div>

        {/* Scan outcome or camera layout */}
        {!scannedSiswa ? (
          <div className="space-y-4">
            {/* Camera Viewport */}
            {cameraActive ? (
              <div className="relative overflow-hidden rounded-3xl border-2 border-brand-600 bg-brand-950 max-w-md mx-auto aspect-square flex flex-col justify-between shadow-2xl">
                <div id="reader" className="w-full h-full"></div>
                <div className="absolute top-4 left-4 z-10 bg-brand-900/90 text-white text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full animate-pulse flex items-center gap-1.5 border border-brand-500/55 shadow-md">
                  <span className="w-2 h-2 bg-accent-500 rounded-full animate-ping"></span>
                  Kamera Aktif
                </div>
                <button
                  onClick={() => setCameraActive(false)}
                  className="absolute bottom-4 right-4 z-10 px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shadow-lg transition-colors cursor-pointer"
                >
                  Matikan Kamera
                </button>
              </div>
            ) : (
              <div className="border-2 border-dashed border-brand-200/80 rounded-3xl p-12 text-center flex flex-col items-center justify-center bg-brand-50/20 hover:bg-brand-50/40 transition-all max-w-md mx-auto aspect-square group">
                <div className="w-16 h-16 bg-brand-100 text-brand-600 rounded-2xl flex items-center justify-center mb-5 group-hover:scale-105 transition-transform shadow-md">
                  <Camera className="w-8 h-8" />
                </div>
                <h4 className="text-sm font-bold text-brand-900">Pindai dengan Kamera Fisik</h4>
                <p className="text-xs text-brand-500 max-w-xs mt-1.5 mb-6 leading-relaxed">
                  Izinkan akses kamera di browser Anda untuk membaca kode QR Kartu Pelajar digital maupun cetak secara instan.
                </p>
                <motion.button
                  whileHover={{ scale: 1.02, y: -1 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setCameraActive(true)}
                  className="px-6 py-3.5 brand-gradient text-white font-bold rounded-2xl text-sm transition-all shadow-lg shadow-brand-500/25 flex items-center gap-2 cursor-pointer"
                >
                  <Camera className="w-4 h-4" />
                  Nyalakan Kamera Scanner
                </motion.button>
              </div>
            )}

            {scannerError && (
              <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200 text-xs text-amber-800 flex items-start gap-2.5 max-w-md mx-auto shadow-xs">
                <AlertCircle className="w-4.5 h-4.5 text-amber-600 flex-shrink-0 mt-0.5" />
                <span className="font-medium">{scannerError}</span>
              </div>
            )}
          </div>
        ) : (
          /* SCAN SUCCESS: DISP student details & assign point form */
          <div className="bg-brand-50/30 p-6 rounded-3xl border border-brand-100 space-y-6">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-[9px] font-black bg-brand-500 text-white px-2.5 py-1 rounded-xl uppercase tracking-widest border border-brand-600 shadow-sm">
                  Hasil Pindaian Cocok
                </span>
                <h4 className="text-xl font-extrabold text-brand-950 mt-3">{scannedSiswa.nama}</h4>
                <p className="text-xs text-brand-500 font-medium mt-1">
                  NIS: <strong className="text-brand-900 font-mono font-bold">{scannedSiswa.nis}</strong> | Kelas: <strong className="text-brand-900">{scannedSiswa.kelas}</strong>
                </p>
              </div>
              <button
                onClick={handleResetScanner}
                className="p-2 bg-white hover:bg-brand-50 rounded-xl text-brand-400 hover:text-brand-600 border border-brand-100/50 transition-colors cursor-pointer shadow-xs"
                title="Tutup Hasil Scan"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {successMessage ? (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="p-4.5 brand-gradient text-white rounded-2xl text-sm flex items-start gap-3 shadow-lg shadow-brand-500/20"
              >
                <Check className="w-5 h-5 flex-shrink-0 mt-0.5 bg-white text-brand-700 rounded-full p-0.5 shadow-md" />
                <div className="space-y-1">
                  <p className="font-extrabold">Catatan Sukses Direkam!</p>
                  <p className="text-xs text-brand-100/90 font-medium">{successMessage}</p>
                </div>
              </motion.div>
            ) : (
              <div className="bg-white p-5 rounded-2xl border border-brand-100 flex items-center justify-between shadow-xs">
                <div>
                  <span className="text-[10px] uppercase font-bold tracking-widest text-brand-400 block">Total Poin Saat Ini</span>
                  <div className="text-3xl font-black text-brand-950 mt-1">{scannedSiswa.total_poin}</div>
                </div>
                <div className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider border shadow-xs ${
                  scannedSiswa.total_poin >= 100 
                    ? "bg-emerald-50 text-emerald-700 border-emerald-100" 
                    : scannedSiswa.total_poin >= 50 
                    ? "bg-amber-50 text-amber-700 border-amber-100" 
                    : "bg-rose-50 text-rose-700 border-rose-100"
                }`}>
                  {scannedSiswa.total_poin >= 100 ? "LAYAK BEASISWA" : "BK ALERT - BUTUH PEMBINAAN"}
                </div>
              </div>
            )}

            {/* Form Poin */}
            <div className="border-t border-brand-100 pt-5 space-y-4">
              <h5 className="text-xs font-black text-brand-800 uppercase tracking-widest">
                Langkah 2: Tentukan Poin yang Diberikan
              </h5>

              <div className="flex gap-5 border-b border-brand-100/50 pb-3">
                <label className="flex items-center gap-2 text-xs font-bold text-brand-700 cursor-pointer">
                  <input
                    type="radio"
                    checked={!isCustomPoint}
                    onChange={() => setIsCustomPoint(false)}
                    className="text-brand-600 focus:ring-brand-500 w-4 h-4"
                  />
                  Gunakan Aturan Baku Sekolah
                </label>
                <label className="flex items-center gap-2 text-xs font-bold text-brand-700 cursor-pointer">
                  <input
                    type="radio"
                    checked={isCustomPoint}
                    onChange={() => setIsCustomPoint(true)}
                    className="text-brand-600 focus:ring-brand-500 w-4 h-4"
                  />
                  Tulis Poin Kustom
                </label>
              </div>

              {!isCustomPoint ? (
                <div className="space-y-1">
                  <select
                    value={selectedPoinId}
                    onChange={(e) => setSelectedPoinId(e.target.value)}
                    className="w-full border border-brand-100 rounded-2xl p-3.5 bg-white text-sm font-bold text-brand-900 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none shadow-sm cursor-pointer"
                  >
                    <option value="" className="text-brand-500">-- Pilih Aturan / Penghargaan SMAN 19 --</option>
                    {masterPoin.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nilai_poin > 0 ? `[+${p.nilai_poin}]` : `[${p.nilai_poin}]`} {p.nama_poin}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div className="md:col-span-3 space-y-1">
                    <input
                      type="text"
                      placeholder="Nama kegiatan/pelanggaran kustom..."
                      value={customPointName}
                      onChange={(e) => setCustomPointName(e.target.value)}
                      className="w-full border border-brand-100 rounded-2xl p-3.5 text-sm font-bold text-brand-900 focus:ring-2 focus:ring-brand-500 outline-none bg-white shadow-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <input
                      type="number"
                      placeholder="Nilai Poin"
                      value={customPointValue}
                      onChange={(e) => setCustomPointValue(parseInt(e.target.value, 10) || 0)}
                      className="w-full border border-brand-100 rounded-2xl p-3.5 text-sm font-bold text-brand-900 focus:ring-2 focus:ring-brand-500 outline-none bg-white shadow-xs"
                    />
                  </div>
                </div>
              )}

              <div className="flex gap-2.5 justify-end pt-3">
                <button
                  onClick={handleResetScanner}
                  className="px-5 py-3 bg-brand-50 hover:bg-brand-100 border border-brand-100 text-brand-700 text-sm font-bold rounded-2xl transition-all cursor-pointer"
                >
                  Scan Kartu Lain
                </button>
                <motion.button
                  whileHover={{ scale: 1.02, y: -1 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleApplyPoint}
                  className="px-6 py-3 brand-gradient text-white text-sm font-bold rounded-2xl transition-all shadow-lg shadow-brand-500/20 flex items-center gap-1.5 cursor-pointer"
                >
                  <Award className="w-4 h-4" />
                  Terapkan Poin Ke Siswa
                </motion.button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* TESTING SIMULATOR PANEL (Right - 5 cols) - Styled beautifully like a premium purple/violet mobile card mockup from the reference */}
      <div className="lg:col-span-5 brand-gradient rounded-3xl p-6 text-white shadow-2xl relative overflow-hidden flex flex-col wave-bg border border-brand-600/50 min-h-[550px]">
        <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-transparent pointer-events-none" />
        <div className="relative z-10 space-y-4">
          <div>
            <div className="inline-flex items-center gap-1 bg-accent-500/25 text-white text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full border border-accent-500/40 shadow-md">
              <Zap className="w-3.5 h-3.5 text-accent-500" />
              Simulator Kartu Pelajar SMAN 19
            </div>
            <h4 className="text-xl font-black mt-3 text-white tracking-tight">Tap-In Kartu Digital</h4>
            <p className="text-xs text-brand-100/90 mt-1 leading-relaxed font-medium">
              Tidak memiliki kamera fisik atau kartu cetak? Pilih salah satu siswa di bawah ini untuk menyimulasikan kartu pelajar RFID ditempelkan secara fisik ke scanner SMAN 19.
            </p>
          </div>

          {/* List of mock student cards for scanning - looking super high end */}
          <div className="space-y-3 overflow-y-auto max-h-[380px] flex-1 pr-1 custom-scrollbar">
            {siswaList.map((siswa) => (
              <motion.button
                whileHover={{ scale: 1.025, x: 2 }}
                whileTap={{ scale: 0.98 }}
                key={siswa.id}
                onClick={() => handleSimulateScan(siswa)}
                className="w-full bg-white/10 hover:bg-white/15 border border-white/10 hover:border-white/25 p-3.5 rounded-2xl flex items-center justify-between text-left group transition-all cursor-pointer shadow-sm"
              >
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-accent-400 font-mono tracking-wider group-hover:text-accent-300 transition-colors">
                    NIS: {siswa.nis}
                  </p>
                  <p className="text-sm font-black text-white group-hover:text-white transition-colors">
                    {siswa.nama}
                  </p>
                  <p className="text-[10px] text-brand-100/80 font-bold uppercase tracking-wider">Kelas: {siswa.kelas}</p>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[10px] bg-white text-brand-800 px-2.5 py-1.5 rounded-xl font-mono font-black shadow-md">
                    {siswa.total_poin} pts
                  </span>
                  <span className="text-xs font-bold text-white group-hover:translate-x-1.5 transition-transform inline-flex items-center gap-1">
                    &rarr;
                  </span>
                </div>
              </motion.button>
            ))}
          </div>

          <p className="text-[10px] text-brand-200/70 text-center leading-relaxed font-medium pt-2 border-t border-white/10">
            Aktivitas scan disinkronkan ke audit trail menggunakan email guru aktif untuk menjaga autentisitas data karakter SMAN 19 Bandung.
          </p>
        </div>
      </div>
    </div>
  );
}
