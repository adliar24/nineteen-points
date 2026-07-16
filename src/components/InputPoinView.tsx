import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Html5Qrcode } from "html5-qrcode";
import { 
  Camera, 
  Search, 
  AlertCircle, 
  Check, 
  Award, 
  Users, 
  Zap, 
  X, 
  ShieldCheck, 
  UserCheck, 
  FileText,
  MousePointer,
  RotateCcw,
  Sparkles
} from "lucide-react";
import { Siswa, MasterPoin, UserSession } from "../types";
import { getSiswaList, getMasterPoinList, addRiwayat } from "../dbStore";

interface InputPoinViewProps {
  userSession: UserSession;
  onRefreshHistory: () => void;
}

export default function InputPoinView({ userSession, onRefreshHistory }: InputPoinViewProps) {
  const [siswaList, setSiswaList] = useState<Siswa[]>([]);
  const [masterPoin, setMasterPoin] = useState<MasterPoin[]>([]);
  
  // Tab selector: "qr" for camera/simulator, "manual" for lookup search
  const [inputMethod, setInputMethod] = useState<"qr" | "manual">("qr");

  // Selected student state (unified for both methods)
  const [selectedSiswa, setSelectedSiswa] = useState<Siswa | null>(null);

  // QR / Scanner states
  const [scanResult, setScanResult] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);

  // Manual Search states
  const [manualSearchQuery, setManualSearchQuery] = useState("");
  const [manualSelectedClass, setManualSelectedClass] = useState("Semua");

  // Point form states
  const [selectedPoinId, setSelectedPoinId] = useState("");
  const [ruleSearchQuery, setRuleSearchQuery] = useState("");
  const [ruleFilterType, setRuleFilterType] = useState<"Semua" | "Positif" | "Negatif">("Semua");
  const [customPointName, setCustomPointName] = useState("");
  const [customPointValue, setCustomPointValue] = useState(10);
  const [isCustomPoint, setIsCustomPoint] = useState(false);
  const [customPointType, setCustomPointType] = useState<"positif" | "negatif">("positif");
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Load data
  useEffect(() => {
    async function loadData() {
      setSiswaList(await getSiswaList());
      setMasterPoin(await getMasterPoinList());
    }
    loadData();
  }, []);

  // Sync real-time data shifts
  const syncSiswaList = async () => {
    setSiswaList(await getSiswaList());
  };

  // QR Scanner initialization (Html5Qrcode core API)
  useEffect(() => {
    if (cameraActive && inputMethod === "qr") {
      setScannerError(null);
      const timer = setTimeout(() => {
        try {
          const scanner = new Html5Qrcode("reader-input");
          scannerRef.current = scanner;

          scanner.start(
            { facingMode: "environment" },
            {
              fps: 10,
              qrbox: { width: 250, height: 250 }
            },
            onScanSuccess,
            onScanFailure
          ).catch((err) => {
            console.error("Camera start failed", err);
            setScannerError("Gagal mengaktifkan kamera. Mohon berikan izin kamera pada browser Anda.");
            setCameraActive(false);
          });
        } catch (err: any) {
          console.error("Camera init failed", err);
          setScannerError("Gagal mengakses kamera. Mohon aktifkan izin kamera.");
          setCameraActive(false);
        }
      }, 400); // 400ms delay to guarantee reader-input DOM node is painted by React

      return () => {
        clearTimeout(timer);
        if (scannerRef.current) {
          try {
            if (scannerRef.current.isScanning) {
              scannerRef.current.stop()
                .then(() => {
                  scannerRef.current = null;
                })
                .catch(err => console.warn("Failed to stop scanning on cleanup", err));
            } else {
              scannerRef.current = null;
            }
          } catch (e) {
            scannerRef.current = null;
          }
        }
      };
    }
  }, [cameraActive, inputMethod]);

  function onScanSuccess(decodedText: string) {
    const trimmed = decodedText.trim();
    setScanResult(trimmed);

    const student = siswaList.find(s => s.nis === trimmed || s.id === trimmed);
    if (student) {
      setSelectedSiswa(student);
      setSuccessMessage(null);
      
      // Stop scanning and turn off camera
      if (scannerRef.current) {
        try {
          if (scannerRef.current.isScanning) {
            scannerRef.current.stop()
              .then(() => {
                scannerRef.current = null;
                setCameraActive(false);
              })
              .catch(err => {
                console.warn(err);
                scannerRef.current = null;
                setCameraActive(false);
              });
          } else {
            scannerRef.current = null;
            setCameraActive(false);
          }
        } catch (e) {
          scannerRef.current = null;
          setCameraActive(false);
        }
      } else {
        setCameraActive(false);
      }
    } else {
      setScannerError(`QR Terbaca: "${trimmed}", namun siswa tidak ditemukan.`);
      setTimeout(() => setScannerError(null), 4000);
    }
  }

  function onScanFailure(err: any) {
    // Ignore normal scan failure logs
  }

  // Handle tap simulation from right side cards
  const handleSimulateScan = (siswa: Siswa) => {
    setScanResult(siswa.nis);
    setSelectedSiswa(siswa);
    setSuccessMessage(null);
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
          scannerRef.current.stop()
            .then(() => {
              scannerRef.current = null;
              setCameraActive(false);
            })
            .catch(err => {
              console.warn(err);
              scannerRef.current = null;
              setCameraActive(false);
            });
        } else {
          scannerRef.current = null;
          setCameraActive(false);
        }
      } catch (e) {
        scannerRef.current = null;
        setCameraActive(false);
      }
    } else {
      setCameraActive(false);
    }
  };

  // Manual filter search list of students
  const filteredStudentsForManual = siswaList.filter(s => {
    const matchesSearch = s.nama.toLowerCase().includes(manualSearchQuery.toLowerCase()) || 
                          s.nis.includes(manualSearchQuery);
    const matchesClass = manualSelectedClass === "Semua" || s.kelas === manualSelectedClass;
    return matchesSearch && matchesClass;
  });

  const handleSelectManualSiswa = (siswa: Siswa) => {
    setSelectedSiswa(siswa);
    setSuccessMessage(null);
  };

  // Filter master poin rules
  const filteredMasterRules = masterPoin.filter((p) => {
    // Role piket check: only allow attendance & lateness rules
    if (userSession?.role === "piket") {
      const lower = p.nama_poin.toLowerCase();
      const isPiketAllowed = 
        lower.includes("lambat") || 
        lower.includes("telat") || 
        lower.includes("hadir") || 
        lower.includes("absen") || 
        lower.includes("upacara") || 
        lower.includes("apel");
      if (!isPiketAllowed) return false;
    }

    const matchesFilter =
      ruleFilterType === "Semua" ||
      (ruleFilterType === "Positif" && p.nilai_poin > 0) ||
      (ruleFilterType === "Negatif" && p.nilai_poin < 0);
    const matchesSearch = p.nama_poin.toLowerCase().includes(ruleSearchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  // Submission
  const handleApplyPoint = async () => {
    if (!selectedSiswa) return;

    let name = "";
    let value = 0;

    if (isCustomPoint && userSession?.role !== "piket") {
      if (!customPointName) {
        alert("Mohon isi deskripsi poin kustom.");
        return;
      }
      name = customPointName;
      const absValue = Math.abs(customPointValue) || 0;
      value = customPointType === "positif" ? absValue : -absValue;
    } else {
      const rule = masterPoin.find(mp => mp.id === selectedPoinId);
      if (!rule) {
        alert("Silakan pilih jenis pelanggaran / prestasi dari daftar.");
        return;
      }
      name = rule.nama_poin;
      value = rule.nilai_poin;
    }

    try {
      // Write to DB
      await addRiwayat(selectedSiswa.id, name, value, userSession.email);
      onRefreshHistory();

      // Success state
      setSuccessMessage(
        `Sukses mencatat poin! ${selectedSiswa.nama} (${selectedSiswa.kelas}) menerima ${
          value > 0 ? `+${value}` : value
        } poin untuk "${name}".`
      );

      // Update state to show updated student stats instantly
      const updatedSiswa = { ...selectedSiswa, total_poin: selectedSiswa.total_poin + value };
      setSelectedSiswa(updatedSiswa);

      // Re-sync local student list
      await syncSiswaList();

      // Reset input fields
      setSelectedPoinId("");
      setCustomPointName("");
      setIsCustomPoint(false);
    } catch (err: any) {
      alert("Gagal mencatat poin: " + err.message);
    }
  };

  const handleResetTarget = () => {
    setSelectedSiswa(null);
    setScanResult(null);
    setSuccessMessage(null);
    setScannerError(null);
  };

  // Unique classes for manual filter dropdown
  const classes = ["Semua", ...Array.from(new Set(siswaList.map(s => s.kelas)))];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 pb-8">
      
      {/* INPUT WORKSPACE (Full Width) */}
      <div className="lg:col-span-12 space-y-4">
        
        <h2 className="text-xl font-extrabold text-brand-950 tracking-tight">Pencatatan Poin Murid</h2>
        
        {/* Active Teacher Inline Info */}
        <div className="flex items-center justify-between text-xs text-brand-500 bg-white px-4 py-2.5 rounded-xl border border-brand-100/60 shadow-xs">
          <span>Petugas: <strong className="font-bold text-brand-900">{userSession.fullName}</strong> <span className="opacity-70">({userSession.email.split("@")[0]})</span></span>
          <span className="text-[10px] font-black text-brand-600 bg-brand-50 px-2.5 py-0.5 rounded-md border border-brand-100 uppercase tracking-wider">Aktif</span>
        </div>

        {/* METHOD TAB SELECTOR */}
        {!selectedSiswa && (
          <div className="bg-white rounded-2xl p-1.5 border border-brand-100/60 flex gap-2">
            <button
              onClick={() => {
                setInputMethod("qr");
                setScannerError(null);
              }}
              className={`flex-1 py-3 text-sm font-bold rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer ${
                inputMethod === "qr"
                  ? "bg-brand-600 text-white shadow-md"
                  : "text-brand-600 hover:bg-brand-50"
              }`}
            >
              <Camera className="w-4 h-4" />
              Pindai QR
            </button>
            <button
              onClick={() => {
                setInputMethod("manual");
                setCameraActive(false);
                setScannerError(null);
              }}
              className={`flex-1 py-3 text-sm font-bold rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer ${
                inputMethod === "manual"
                  ? "bg-brand-600 text-white shadow-md"
                  : "text-brand-600 hover:bg-brand-50"
              }`}
            >
              <Search className="w-4 h-4" />
              Cari Murid
            </button>
          </div>
        )}

        {/* WORKSPACE AREA */}
        <div className="bg-white rounded-3xl border border-brand-100 shadow-xl shadow-brand-900/5 p-6 min-h-[400px] flex flex-col justify-start">
          
          <AnimatePresence mode="wait">
            {!selectedSiswa ? (
              <motion.div
                key={inputMethod}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-4 flex-1 flex flex-col justify-center"
              >
                {/* METHOD 1: QR SCANNER CONTAINER */}
                {inputMethod === "qr" && (
                  <div className="space-y-4">
                    {cameraActive ? (
                      <div className="relative overflow-hidden rounded-3xl border-2 border-brand-600 bg-brand-950 max-w-sm mx-auto aspect-square flex flex-col justify-between shadow-2xl">
                        <div id="reader-input" className="w-full h-full"></div>
                        <div className="absolute top-4 left-4 z-10 bg-brand-900/90 text-white text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full animate-pulse flex items-center gap-1.5 border border-brand-500/55 shadow-md">
                          <span className="w-2 h-2 bg-accent-500 rounded-full animate-ping"></span>
                          Kamera Siap
                        </div>
                        <button
                          onClick={() => setCameraActive(false)}
                          className="absolute bottom-4 right-4 z-10 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shadow-lg cursor-pointer"
                        >
                          Tutup
                        </button>
                      </div>
                    ) : (
                      <div className="border-2 border-dashed border-brand-200 rounded-3xl p-8 text-center flex flex-col items-center justify-center bg-brand-50/10 hover:bg-brand-50/30 transition-all max-w-sm mx-auto aspect-square group">
                        <div className="w-14 h-14 bg-brand-100 text-brand-600 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-105 transition-transform shadow-sm">
                          <Camera className="w-7 h-7" />
                        </div>
                        <h4 className="text-sm font-bold text-brand-900">Scan QR Kartu Pelajar</h4>
                        <p className="text-xs text-brand-500 max-w-xs mt-1 mb-5 leading-relaxed">
                          Nyalakan kamera untuk mendeteksi QR Code secara langsung dari kartu cetak atau ponsel siswa.
                        </p>
                        <motion.button
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => setCameraActive(true)}
                          className="px-5 py-3 brand-gradient text-white font-bold rounded-xl text-xs transition-all shadow-md shadow-brand-500/25 flex items-center gap-2 cursor-pointer"
                        >
                          <Camera className="w-4 h-4" />
                          Buka Kamera
                        </motion.button>
                      </div>
                    )}

                    {scannerError && (
                      <div className="p-3.5 bg-amber-50 rounded-2xl border border-amber-200 text-xs text-amber-800 flex items-start gap-2 max-w-sm mx-auto">
                        <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                        <span className="font-medium">{scannerError}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* METHOD 2: SEARCH MANUAL AUTOCOMPLETE */}
                {inputMethod === "manual" && (
                  <div className="space-y-4 flex-1 flex flex-col justify-start">
                    <div className="space-y-2">
                      <label className="text-xs font-black text-brand-900 uppercase tracking-wider block">Cari Murid Terdaftar</label>
                      <div className="flex flex-col sm:flex-row gap-3">
                        <div className="relative flex-1">
                          <Search className="w-4.5 h-4.5 text-brand-400 absolute left-4 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            placeholder="Ketik Nama atau NIS siswa..."
                            value={manualSearchQuery}
                            onChange={(e) => setManualSearchQuery(e.target.value)}
                            className="w-full border border-brand-100 rounded-2xl py-3 pl-11 pr-4 text-xs font-semibold text-brand-900 focus:ring-2 focus:ring-brand-500 outline-none bg-brand-50/20"
                          />
                        </div>
                        <select
                          value={manualSelectedClass}
                          onChange={(e) => setManualSelectedClass(e.target.value)}
                          className="border border-brand-100 rounded-2xl py-3 px-4 text-xs font-bold text-brand-700 outline-none focus:ring-2 focus:ring-brand-500 bg-white"
                        >
                          {classes.map(c => (
                            <option key={c} value={c}>Kelas: {c}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* SEARCH RESULTS LIST */}
                    <div className="flex-1 overflow-y-auto max-h-[300px] border border-brand-50 rounded-2xl divide-y divide-brand-50">
                      {filteredStudentsForManual.length > 0 ? (
                        filteredStudentsForManual.map(siswa => (
                          <button
                            key={siswa.id}
                            onClick={() => handleSelectManualSiswa(siswa)}
                            className="w-full px-4 py-3.5 text-left hover:bg-brand-50/50 flex items-center justify-between group transition-colors cursor-pointer"
                          >
                            <div>
                              <p className="text-sm font-black text-brand-900 group-hover:text-brand-600 transition-colors uppercase">{siswa.nama}</p>
                              <p className="text-[10px] text-brand-400 font-semibold uppercase mt-0.5">{siswa.kelas} &bull; NIS {siswa.nis}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-bold text-brand-500 group-hover:translate-x-1 transition-transform">
                                Pilih &rarr;
                              </span>
                            </div>
                          </button>
                        ))
                      ) : (
                        <div className="py-12 text-center text-xs text-brand-400 font-bold">
                          Murid tidak ditemukan. Silakan periksa kembali ketikan Anda.
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </motion.div>
            ) : (
              /* TARGET STUDENT LOADED: DISPLAY DETAILS & ASSIGN POINT FORM */
              <motion.div
                key="point-form"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="space-y-6 flex-1"
              >
                {/* Result header */}
                <div className="bg-brand-50/30 p-5 rounded-2xl border border-brand-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-accent-500 to-amber-400 border border-white/20 flex items-center justify-center font-black text-sm uppercase text-white shadow-md">
                      {selectedSiswa.nama.slice(0, 2)}
                    </div>
                    <div>
                      <h4 className="text-base font-black text-brand-950 leading-tight uppercase">{selectedSiswa.nama}</h4>
                      <p className="text-[10px] text-brand-500 font-bold uppercase mt-0.5">
                        {selectedSiswa.kelas} &bull; NIS {selectedSiswa.nis}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3 self-start sm:self-auto">
                    <div className="text-right">
                      <p className="text-[9px] font-black text-brand-400 uppercase tracking-wider">Poin Saat Ini</p>
                      <p className="text-sm font-mono font-black text-brand-900">{selectedSiswa.total_poin} pts</p>
                    </div>
                    <button
                      onClick={handleResetTarget}
                      className="p-2 hover:bg-brand-100/60 text-brand-400 hover:text-brand-700 rounded-xl transition-all cursor-pointer"
                      title="Batalkan Pilihan"
                    >
                      <RotateCcw className="w-4.5 h-4.5" />
                    </button>
                  </div>
                </div>

                {/* FORMULIR INPUT POIN */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h5 className="text-xs font-black text-brand-900 uppercase tracking-widest flex items-center gap-2">
                      <FileText className="w-4.5 h-4.5 text-brand-600" />
                      Konfigurasi Poin Karakter
                    </h5>
                    
                    {/* Mode Toggle: Master vs Custom */}
                    {userSession?.role !== "piket" && (
                       <button
                         onClick={() => setIsCustomPoint(!isCustomPoint)}
                         className="text-[10px] font-black text-brand-600 hover:text-brand-900 underline tracking-wider cursor-pointer"
                       >
                         {isCustomPoint ? "Pilih Aturan Baku" : "Gunakan Poin Kustom"}
                       </button>
                     )}
                  </div>

                  {/* SUCCESS OR FAIL BANNER */}
                  {successMessage && (
                    <motion.div 
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-4 bg-emerald-50 rounded-2xl border border-emerald-200 text-xs text-emerald-800 flex items-start gap-2.5 shadow-xs"
                    >
                      <Check className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <strong className="font-bold block">Pencatatan Berhasil</strong>
                        <span className="font-medium mt-0.5 block leading-relaxed">{successMessage}</span>
                      </div>
                    </motion.div>
                  )}

                  {!isCustomPoint ? (
                    /* SELECT STANDARD RULE - MODIFIED PER USER REQUEST TO BE HIGHLY COMPACT, SEARCHABLE & CATEGORIZED */
                    <div className="space-y-2.5">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <label className="text-[10px] font-black text-brand-400 uppercase tracking-wider block">Pilih Jenis Poin</label>
                        
                        {/* Inline Filter Pills for standard rules */}
                        <div className="flex gap-1.5">
                          {(["Semua", "Positif", "Negatif"] as const).map((tab) => (
                            <button
                              key={tab}
                              type="button"
                              onClick={() => setRuleFilterType(tab)}
                              className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold border transition-all cursor-pointer ${
                                ruleFilterType === tab
                                  ? "brand-gradient text-white border-transparent shadow-xs"
                                  : "bg-brand-50/50 text-brand-700 border-brand-100 hover:bg-brand-100/30"
                              }`}
                            >
                              {tab === "Semua" ? "Semua" : tab === "Positif" ? "Prestasi (+)" : "Sanksi (-)"}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Rule search bar inside point selection */}
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-brand-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          placeholder="Cari deskripsi aturan poin di sini..."
                          value={ruleSearchQuery}
                          onChange={(e) => setRuleSearchQuery(e.target.value)}
                          className="w-full pl-8.5 pr-8 py-2 text-xs font-bold text-brand-900 placeholder-brand-400 border border-brand-100 rounded-xl outline-none bg-brand-50/20 focus:bg-white focus:ring-2 focus:ring-brand-500/15 transition-all"
                        />
                        {ruleSearchQuery && (
                          <button
                            type="button"
                            onClick={() => setRuleSearchQuery("")}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-brand-400 hover:text-brand-600 p-0.5 rounded-full"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>

                      {/* Custom selection list */}
                      <div className="border border-brand-100 rounded-2xl divide-y divide-brand-100/40 max-h-[180px] overflow-y-auto bg-brand-50/10">
                        <div key={ruleFilterType} className="divide-y divide-brand-100/40">
                          {filteredMasterRules.length > 0 ? (
                            filteredMasterRules.map((p) => {
                              const isPositive = p.nilai_poin > 0;
                              const isSelected = selectedPoinId === p.id;
                              return (
                                <button
                                  key={p.id}
                                  type="button"
                                  onClick={() => setSelectedPoinId(p.id)}
                                  className={`w-full text-left py-2 px-3 flex items-center justify-between gap-3 transition-all cursor-pointer animate-fade-in ${
                                    isSelected 
                                      ? "bg-brand-500/10 border-l-4 border-l-brand-600 pl-2" 
                                      : "hover:bg-white"
                                  }`}
                                >
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1.5">
                                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                                        isPositive ? "bg-emerald-500" : "bg-rose-500"
                                      }`} />
                                      <p className={`text-xs font-bold truncate leading-tight ${
                                        isSelected ? "text-brand-900" : "text-brand-950"
                                      }`}>
                                        {p.nama_poin}
                                      </p>
                                    </div>
                                    <span className={`inline-block text-[8px] font-black uppercase tracking-wider mt-0.5 ${
                                      isPositive ? "text-emerald-600" : "text-rose-600"
                                    }`}>
                                      {isPositive ? "Penghargaan Prestasi" : "Pelanggaran Disiplin"}
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-1.5 flex-shrink-0">
                                    <span className={`font-mono text-[10px] font-black px-2 py-0.5 rounded-full border ${
                                      isPositive 
                                        ? "bg-emerald-50 text-emerald-700 border-emerald-100" 
                                        : "bg-rose-50 text-rose-700 border-rose-100"
                                    }`}>
                                      {isPositive ? `+${p.nilai_poin}` : p.nilai_poin}
                                    </span>
                                    {isSelected && (
                                      <Check className="w-3.5 h-3.5 text-brand-600" />
                                    )}
                                  </div>
                                </button>
                              );
                            })
                          ) : (
                            <div className="py-8 text-center text-[11px] font-bold text-brand-400">
                              Tidak ada aturan poin yang cocok.
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* CUSTOM POIN ASSIGNMENT */
                    <div className="space-y-4">
                      {/* Tipe Poin Selector for Custom Point */}
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-brand-400 uppercase tracking-wider block">Tipe Poin</label>
                        <div className="flex gap-3">
                          <button
                            type="button"
                            onClick={() => setCustomPointType("positif")}
                            className={`flex-1 py-3 px-4 rounded-2xl text-xs font-extrabold border flex items-center justify-center gap-2 transition-all cursor-pointer ${
                              customPointType === "positif"
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200 ring-2 ring-emerald-500/10"
                                : "bg-brand-50/20 text-brand-400 border-brand-100 hover:bg-brand-50/50"
                            }`}
                          >
                            <Award className="w-4.5 h-4.5" />
                            Prestasi (Poin Tambah)
                          </button>
                          <button
                            type="button"
                            onClick={() => setCustomPointType("negatif")}
                            className={`flex-1 py-3 px-4 rounded-2xl text-xs font-extrabold border flex items-center justify-center gap-2 transition-all cursor-pointer ${
                              customPointType === "negatif"
                                ? "bg-rose-50 text-rose-700 border-rose-200 ring-2 ring-rose-500/10"
                                : "bg-brand-50/20 text-brand-400 border-brand-100 hover:bg-brand-50/50"
                            }`}
                          >
                            <AlertCircle className="w-4.5 h-4.5" />
                            Sanksi (Poin Minus)
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="md:col-span-3 space-y-2">
                          <label className="text-[10px] font-black text-brand-400 uppercase tracking-wider block">Deskripsi Kasus Kustom</label>
                          <input
                            type="text"
                            placeholder="Contoh: Mengikuti upacara dengan khidmat / Telat apel pagi"
                            value={customPointName}
                            onChange={(e) => setCustomPointName(e.target.value)}
                            className="w-full border border-brand-100 rounded-2xl p-3.5 text-xs font-semibold text-brand-900 focus:ring-2 focus:ring-brand-500 outline-none bg-white shadow-xs"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-brand-400 uppercase tracking-wider block">Nilai Poin</label>
                          <input
                            type="number"
                            min="1"
                            value={Math.abs(customPointValue) || ""}
                            onChange={(e) => setCustomPointValue(Math.abs(parseInt(e.target.value, 10)) || 0)}
                            className="w-full border border-brand-100 rounded-2xl p-3.5 text-xs font-bold text-brand-900 focus:ring-2 focus:ring-brand-500 outline-none bg-white shadow-xs font-mono"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Submission Action bar */}
                  <div className="flex gap-2.5 justify-end pt-3 border-t border-brand-50 mt-4">
                    <button
                      onClick={handleResetTarget}
                      className="px-5 py-3 bg-brand-50 hover:bg-brand-100/80 border border-brand-100 text-brand-700 text-sm font-bold rounded-xl transition-all cursor-pointer"
                    >
                      Batal
                    </button>
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={handleApplyPoint}
                      className="px-6 py-3 brand-gradient text-white text-sm font-bold rounded-xl transition-all shadow-md shadow-brand-500/20 flex items-center gap-1.5 cursor-pointer"
                    >
                      <Award className="w-4 h-4" />
                      Simpan Poin
                    </motion.button>
                  </div>

                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>



    </div>
  );
}
