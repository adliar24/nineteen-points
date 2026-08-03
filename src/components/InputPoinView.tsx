import React, { useState, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useQuery } from "@tanstack/react-query";
import { 
  Search, 
  AlertCircle, 
  Check, 
  Award, 
  X, 
  FileText,
  RotateCcw,
  ScanFace,
  QrCode
} from "lucide-react";
import { Siswa, MasterPoin, UserSession } from "../types";
import { getSiswaListLight, getMasterPoinList, addRiwayat, updateCachedSiswaPoin, updateCachedSiswaPoinBatch } from "../dbStore";
import { toSentenceCase, compareClasses } from "../formatName";
import FaceScanner from "./face/FaceScanner";
import QrScanner, { QrScanFeedback } from "./scan/QrScanner";
import InputModeTabs, { InputMode, ScanType } from "./scan/InputModeTabs";

interface InputPoinViewProps {
  userSession: UserSession;
  onRefreshHistory: () => void;
}

export default function InputPoinView({ userSession, onRefreshHistory }: InputPoinViewProps) {
  const { data: siswaList = [] } = useQuery({
    queryKey: ["siswa"],
    queryFn: getSiswaListLight,
  });
  const { data: masterPoin = [] } = useQuery({
    queryKey: ["masterPoin"],
    queryFn: getMasterPoinList,
  });
  
  // Two big tabs: "Scan" (QR / Wajah) and "Input Manual"
  const [mode, setMode] = useState<InputMode>("scan");
  const [scanType, setScanType] = useState<ScanType>("qr");

  // Fullscreen scanner states
  const [showQrScanner, setShowQrScanner] = useState(false);
  const [showFaceScannerModal, setShowFaceScannerModal] = useState(false);

  // Selected student state (unified for both methods)
  const [selectedSiswa, setSelectedSiswa] = useState<Siswa | null>(null);
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [selectedSiswaBatch, setSelectedSiswaBatch] = useState<Siswa[]>([]);

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

  const handleQrScan = async (decodedText: string): Promise<QrScanFeedback> => {
    const trimmed = decodedText.trim();
    const student = siswaList.find(s => s.nis === trimmed || s.id === trimmed);
    if (!student) {
      return {
        type: "not_found",
        title: "TIDAK DIKENALI",
        message: `QR: "${trimmed}"`,
      };
    }

    if (isBatchMode) {
      if (selectedSiswaBatch.some(s => s.id === student.id)) {
        return {
          type: "duplicate",
          title: "SUDAH ADA DI DAFTAR BATCH",
          message: toSentenceCase(student.nama),
          kelas: student.kelas,
          fotoUrl: student.foto_url || undefined,
        };
      }
      setSelectedSiswaBatch(prev => [...prev, student]);
      setSuccessMessage(null);
      return {
        type: "success",
        title: "BERHASIL TERDETEKSI",
        message: toSentenceCase(student.nama),
        kelas: student.kelas,
        fotoUrl: student.foto_url || undefined,
      };
    } else {
      setSelectedSiswa(student);
      setSuccessMessage(null);
      setShowQrScanner(false);
      return {
        type: "success",
        title: "BERHASIL TERDETEKSI",
        message: toSentenceCase(student.nama),
        kelas: student.kelas,
        fotoUrl: student.foto_url || undefined,
      };
    }
  };

  // Manual filter search list of students
  const filteredStudentsForManual = useMemo(() => {
    const list = siswaList.filter(s => {
      const matchesSearch = s.nama.toLowerCase().includes(manualSearchQuery.toLowerCase()) || 
                            s.nis.includes(manualSearchQuery);
      const matchesClass = manualSelectedClass === "Semua" || s.kelas === manualSelectedClass;
      return matchesSearch && matchesClass;
    });
    return list.slice(0, 100);
  }, [siswaList, manualSearchQuery, manualSelectedClass]);

  const handleSelectManualSiswa = (siswa: Siswa) => {
    if (isBatchMode) {
      if (selectedSiswaBatch.some(s => s.id === siswa.id)) return;
      setSelectedSiswaBatch(prev => [...prev, siswa]);
    } else {
      setSelectedSiswa(siswa);
    }
    setSuccessMessage(null);
  };

  // Filter master poin rules
  const filteredMasterRules = useMemo(() => masterPoin.filter((p) => {
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

    // Teacher access assignment check (super_admin & kepala_sekolah can see all points)
    if (userSession?.role !== "super_admin" && userSession?.role !== "kepala_sekolah") {
      const allowed = p.allowed_guru_emails;
      if (allowed && Array.isArray(allowed) && allowed.length > 0) {
        const userEmail = (userSession?.email || "").toLowerCase().trim();
        const isAllowed = allowed.some((email) => email.toLowerCase().trim() === userEmail);
        if (!isAllowed) return false;
      }
    }

    const matchesFilter =
      ruleFilterType === "Semua" ||
      (ruleFilterType === "Positif" && p.nilai_poin > 0) ||
      (ruleFilterType === "Negatif" && p.nilai_poin < 0);
    const matchesSearch = p.nama_poin.toLowerCase().includes(ruleSearchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  }), [masterPoin, userSession?.role, userSession?.email, ruleFilterType, ruleSearchQuery]);

  // Submission
  const handleApplyPoint = async () => {
    if (!selectedSiswa && selectedSiswaBatch.length === 0) return;

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
      if (selectedSiswa) {
        // Write to DB
        await addRiwayat(selectedSiswa.id, name, value, userSession.fullName);
        setSuccessMessage(
          `Sukses mencatat poin! ${selectedSiswa.nama} (${selectedSiswa.kelas}) menerima ${
            value > 0 ? `+${value}` : value
          } poin untuk "${name}".`
        );
        const updatedSiswa = { ...selectedSiswa, total_poin: selectedSiswa.total_poin + value };
        setSelectedSiswa(updatedSiswa);
        updateCachedSiswaPoin(selectedSiswa.id, value);
      } else {
        // Write to DB (batch mode)
        const updates: { siswaId: string; delta: number }[] = [];
        for (const student of selectedSiswaBatch) {
          await addRiwayat(student.id, name, value, userSession.fullName);
          updates.push({ siswaId: student.id, delta: value });
        }
        updateCachedSiswaPoinBatch(updates);
        setSuccessMessage(
          `Sukses mencatat poin untuk ${selectedSiswaBatch.length} murid sekaligus untuk "${name}".`
        );
        setSelectedSiswaBatch([]);
      }

      onRefreshHistory();

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
    setSelectedSiswaBatch([]);
    setSuccessMessage(null);
  };

  // Unique classes for manual filter dropdown (sorted by grade and alphabetically)
  const classes = useMemo(() => {
    const rawClasses = Array.from(new Set(siswaList.map(s => s.kelas).filter(Boolean)));
    return ["Semua", ...rawClasses.sort(compareClasses)];
  }, [siswaList]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 pb-8">
      
      {/* INPUT WORKSPACE (Full Width) */}
      <div className="lg:col-span-12 space-y-4">
        
        <h2 className="text-xl font-extrabold text-brand-950 tracking-tight">Pencatatan Poin Murid</h2>
        
        {/* Active Teacher Inline Info */}
        <div className="flex items-center justify-between text-xs text-brand-500 bg-white px-4 py-2.5 rounded-xl border border-brand-100/60 shadow-xs">
          <span>Petugas: <strong className="font-bold text-brand-900">{toSentenceCase(userSession.fullName)}</strong> <span className="opacity-70">({userSession.email.split("@")[0]})</span></span>
          <span className="text-[10px] font-black text-brand-600 bg-brand-50 px-2.5 py-0.5 rounded-md border border-brand-100 uppercase tracking-wider">Aktif</span>
        </div>

        {/* METHOD TAB SELECTOR */}
        {!(selectedSiswa || selectedSiswaBatch.length > 0) && (
          <InputModeTabs
            mode={mode}
            scanType={scanType}
            onModeChange={setMode}
            onScanTypeChange={setScanType}
          />
        )}

        {/* WORKSPACE AREA */}
        <div className="bg-white rounded-3xl border border-brand-100 shadow-xl shadow-brand-900/5 p-6 min-h-[400px] flex flex-col justify-start">
          
          <AnimatePresence mode="wait">
            {!(selectedSiswa || selectedSiswaBatch.length > 0) ? (
              <motion.div
                key={`${mode}-${scanType}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-4 flex-1 flex flex-col justify-center"
              >
                {/* METHOD 1: FACE SCANNER AI */}
                {mode === "scan" && scanType === "face" && (
                  <div className="space-y-5 text-center py-6">
                    <div className="mx-auto w-20 h-20 bg-brand-50 border-2 border-brand-200 rounded-3xl flex items-center justify-center shadow-lg shadow-brand-900/5 text-brand-600 animate-pulse">
                      <ScanFace className="w-10 h-10" />
                    </div>
                    <div className="max-w-md mx-auto space-y-1.5">
                      <h3 className="font-extrabold text-lg text-brand-950">Pilih Murid via Scan Wajah (AI)</h3>
                      <p className="text-xs text-brand-600 font-medium leading-relaxed">
                        Arahkan kamera ke wajah siswa yang bersangkutan. Sistem AI akan secara otomatis mencocokkan wajah dan memilih profil murid untuk pencatatan poin.
                      </p>
                    </div>
                    <div className="flex items-center justify-center gap-3 py-2 bg-brand-50/50 rounded-2xl max-w-xs mx-auto border border-brand-100/50 mb-1">
                      <input
                        type="checkbox"
                        id="batch-mode-toggle-face"
                        checked={isBatchMode}
                        onChange={(e) => {
                          setIsBatchMode(e.target.checked);
                          setSelectedSiswaBatch([]);
                        }}
                        className="w-4 h-4 text-brand-600 border-brand-200 rounded focus:ring-brand-500 cursor-pointer"
                      />
                      <label htmlFor="batch-mode-toggle-face" className="text-xs font-black text-brand-900 cursor-pointer select-none">
                        Mode Batch (Scan Massal)
                      </label>
                    </div>
                    <button
                      onClick={() => setShowFaceScannerModal(true)}
                      className="px-6 py-3.5 brand-gradient text-white rounded-2xl text-sm font-bold shadow-lg shadow-brand-500/20 hover:opacity-95 transition-all flex items-center justify-center gap-2 mx-auto cursor-pointer"
                    >
                      <ScanFace className="w-5 h-5" />
                      Mulai Scan Wajah
                    </button>
                  </div>
                )}

                {/* METHOD 2: QR SCANNER */}
                {mode === "scan" && scanType === "qr" && (
                  <div className="space-y-5 text-center py-6">
                    <div className="mx-auto w-20 h-20 bg-emerald-50 border-2 border-emerald-200 rounded-3xl flex items-center justify-center shadow-lg shadow-emerald-900/5 text-emerald-600 animate-pulse">
                      <QrCode className="w-10 h-10" />
                    </div>
                    <div className="max-w-md mx-auto space-y-1.5">
                      <h3 className="font-extrabold text-lg text-brand-950">Pilih Murid via Scan QR</h3>
                      <p className="text-xs text-brand-600 font-medium leading-relaxed">
                        Pindai QR kartu pelajar murid. Sistem otomatis mengenali NIS dan memilih profil murid untuk pencatatan poin.
                      </p>
                    </div>
                    <div className="flex items-center justify-center gap-3 py-2 bg-brand-50/50 rounded-2xl max-w-xs mx-auto border border-brand-100/50 mb-1">
                      <input
                        type="checkbox"
                        id="batch-mode-toggle-qr"
                        checked={isBatchMode}
                        onChange={(e) => {
                          setIsBatchMode(e.target.checked);
                          setSelectedSiswaBatch([]);
                        }}
                        className="w-4 h-4 text-brand-600 border-brand-200 rounded focus:ring-brand-500 cursor-pointer"
                      />
                      <label htmlFor="batch-mode-toggle-qr" className="text-xs font-black text-brand-900 cursor-pointer select-none">
                        Mode Batch (Scan Massal)
                      </label>
                    </div>
                    <button
                      onClick={() => setShowQrScanner(true)}
                      className="px-6 py-3.5 brand-gradient text-white rounded-2xl text-sm font-bold shadow-lg shadow-brand-500/20 hover:opacity-95 transition-all flex items-center justify-center gap-2 mx-auto cursor-pointer"
                    >
                      <QrCode className="w-5 h-5" />
                      Mulai Scan QR
                    </button>
                  </div>
                )}

                {/* METHOD 3: SEARCH MANUAL AUTOCOMPLETE */}
                {mode === "manual" && (
                  <div className="space-y-4 flex-1 flex flex-col justify-start">
                    <div className="space-y-2">
                      <label className="text-xs font-black text-brand-900 uppercase tracking-wider block">Cari Murid Terdaftar</label>
                      <div className="flex flex-col sm:flex-row gap-3">
                        <div className="relative flex-1">
                          <Search className="w-4.5 h-4.5 text-brand-400 absolute left-4 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            placeholder="Ketik Nama atau NIS murid..."
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
                        <>
                          {filteredStudentsForManual.map(siswa => (
                            <button
                              key={siswa.id}
                              onClick={() => handleSelectManualSiswa(siswa)}
                              className="w-full px-4 py-3.5 text-left hover:bg-brand-50/50 flex items-center justify-between group transition-colors cursor-pointer bg-transparent border-0"
                            >
                              <div>
                                <p className="text-sm font-black text-brand-900 group-hover:text-brand-600 transition-colors">{toSentenceCase(siswa.nama)}</p>
                                <p className="text-[10px] text-brand-400 font-semibold uppercase mt-0.5">{siswa.kelas} &bull; NIS {siswa.nis}</p>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold text-brand-500 group-hover:translate-x-1 transition-transform">
                                  Pilih &rarr;
                                </span>
                              </div>
                            </button>
                          ))}
                          {filteredStudentsForManual.length === 100 && (
                            <div className="p-3.5 bg-amber-50/60 text-[10px] text-amber-800 font-bold border-t border-brand-100 text-center">
                              Menampilkan 100 murid pertama. Gunakan kolom pencarian atau filter kelas untuk hasil spesifik.
                            </div>
                          )}
                        </>
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
                {selectedSiswaBatch.length > 0 ? (
                  <div className="bg-brand-50/30 p-5 rounded-2xl border border-brand-100 flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-base font-black text-brand-950 leading-tight">Pencatatan Massal ({selectedSiswaBatch.length} Murid)</h4>
                        <p className="text-[10px] text-brand-500 font-bold uppercase mt-0.5">
                          Murid-murid berikut akan menerima poin yang sama secara bersamaan.
                        </p>
                      </div>
                      <button
                        onClick={handleResetTarget}
                        className="p-2 hover:bg-brand-100/60 text-brand-400 hover:text-brand-700 rounded-xl transition-all cursor-pointer"
                        title="Batalkan Semua"
                      >
                        <RotateCcw className="w-4.5 h-4.5" />
                      </button>
                    </div>

                    <div className="flex flex-wrap gap-2 max-h-[120px] overflow-y-auto p-3 bg-white rounded-2xl border border-brand-100">
                      {selectedSiswaBatch.map(s => (
                        <div key={s.id} className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-brand-50 border border-brand-100 text-brand-950 text-xs font-bold">
                          <span>{toSentenceCase(s.nama)} ({s.kelas})</span>
                          <button
                            onClick={() => setSelectedSiswaBatch(prev => prev.filter(x => x.id !== s.id))}
                            className="text-brand-400 hover:text-rose-500 p-0.5 rounded-full cursor-pointer transition-colors"
                            title="Hapus"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : selectedSiswa ? (
                  <div className="bg-brand-50/30 p-5 rounded-2xl border border-brand-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-accent-500 to-amber-400 border border-white/20 flex items-center justify-center font-black text-sm uppercase text-white shadow-md">
                        {selectedSiswa.nama.slice(0, 2)}
                      </div>
                      <div>
                        <h4 className="text-base font-black text-brand-950 leading-tight">{toSentenceCase(selectedSiswa.nama)}</h4>
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
                ) : null}

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

      {showQrScanner && (
        <QrScanner
          title={isBatchMode ? "Scan QR Massal - Pindai Murid" : "Scan QR - Pilih Murid"}
          subtitle={isBatchMode ? "Pindai kartu pelajar beberapa murid secara berurutan" : "Pindai kartu pelajar murid untuk pencatatan poin"}
          onScanSuccess={handleQrScan}
          onClose={() => setShowQrScanner(false)}
          batchCount={isBatchMode ? selectedSiswaBatch.length : undefined}
          onBatchConfirm={isBatchMode ? () => setShowQrScanner(false) : undefined}
        />
      )}

      {showFaceScannerModal && (
        <FaceScanner
          siswaList={siswaList}
          title={isBatchMode ? "Scan Wajah Massal - Pindai Siswa" : "Pilih Siswa via Scan Wajah (AI)"}
          subtitle={isBatchMode ? "Posisikan wajah siswa secara bergiliran" : "Posisikan wajah siswa di depan kamera untuk memilih profil murid secara otomatis"}
          onMatchSuccess={(siswa) => {
            if (isBatchMode) {
              if (selectedSiswaBatch.some(s => s.id === siswa.id)) return;
              setSelectedSiswaBatch(prev => [...prev, siswa]);
            } else {
              setSelectedSiswa(siswa);
              setShowFaceScannerModal(false);
            }
          }}
          onClose={() => setShowFaceScannerModal(false)}
          batchCount={isBatchMode ? selectedSiswaBatch.length : undefined}
          onBatchConfirm={isBatchMode ? () => setShowFaceScannerModal(false) : undefined}
          scannedIds={isBatchMode ? selectedSiswaBatch.map(s => s.id) : undefined}
        />
      )}

    </div>
  );
}
