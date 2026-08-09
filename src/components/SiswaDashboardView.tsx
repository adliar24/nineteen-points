import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
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
  X,
  ChevronLeft,
  ChevronRight,
  Camera,
  MapPin,
  Loader2,
  CheckCircle2
} from "lucide-react";
import { UserSession, RiwayatPoin, Siswa } from "../types";
import { supabase } from "../supabaseClient";
import html2canvas from "html2canvas-pro";
import SkeletonLoader from "./SkeletonLoader";
import { toSentenceCase } from "../formatName";
import { getVisiblePages } from "../pagination";
import QrScanner from "./scan/QrScanner";

interface SiswaDashboardViewProps {
  userSession: UserSession;
  activeTab: string;
}

export default function SiswaDashboardView({ userSession, activeTab }: SiswaDashboardViewProps) {
  const [siswaDetail, setSiswaDetail] = useState<Siswa | null>(null);
  const [riwayat, setRiwayat] = useState<RiwayatPoin[]>([]);
  const [absensi, setAbsensi] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isZoomed, setIsZoomed] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTab, setHistoryTab] = useState<"poin" | "kehadiran">("poin");
  const historyPerPage = 10;

  // Dynamic Scan Time Window States
  const [scanStart, setScanStart] = useState(() => localStorage.getItem("19points_scan_start") || "06:30");
  const [scanEnd, setScanEnd] = useState(() => localStorage.getItem("19points_scan_end") || "06:45");

  // Student QR Class Scan Modal State
  const [showStudentScanModal, setShowStudentScanModal] = useState(false);
  const [scanStatusMsg, setScanStatusMsg] = useState("");
  const [scanErrorMsg, setScanErrorMsg] = useState("");
  const [scanSuccessMsg, setScanSuccessMsg] = useState("");
  const [isProcessingScan, setIsProcessingScan] = useState(false);

  useEffect(() => {
    const syncTimeConfig = async () => {
      // 1. Try local storage
      let startVal = localStorage.getItem("19points_scan_start") || "06:30";
      let endVal = localStorage.getItem("19points_scan_end") || "06:45";

      // 2. Fetch from Supabase for cross-device accuracy
      try {
        const { data: remoteConfig } = await supabase.from("pengaturan_sistem").select("*");
        if (remoteConfig && remoteConfig.length > 0) {
          const sItem = remoteConfig.find((r: any) => r.kunci === "scan_start");
          const eItem = remoteConfig.find((r: any) => r.kunci === "scan_end");
          if (sItem?.nilai) {
            startVal = sItem.nilai;
            localStorage.setItem("19points_scan_start", sItem.nilai);
          }
          if (eItem?.nilai) {
            endVal = eItem.nilai;
            localStorage.setItem("19points_scan_end", eItem.nilai);
          }
        }
      } catch (e) {}

      setScanStart(startVal);
      setScanEnd(endVal);
    };

    syncTimeConfig();

    window.addEventListener("storage", syncTimeConfig);
    window.addEventListener("19points_config_updated", syncTimeConfig);

    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel("19points_channel");
      bc.onmessage = (event) => {
        if (event.data && event.data.type === "CONFIG_UPDATED") {
          syncTimeConfig();
        }
      };
    } catch (e) {}

    return () => {
      window.removeEventListener("storage", syncTimeConfig);
      window.removeEventListener("19points_config_updated", syncTimeConfig);
      if (bc) bc.close();
    };
  }, []);

  const handleStudentClassQrScan = async (scannedData: string) => {
    if (!scannedData.startsWith("CLASS_QR:")) {
      setScanErrorMsg("Format QR Code tidak valid. Harus berupa QR Code Kelas.");
      return;
    }

    setIsProcessingScan(true);
    setScanErrorMsg("");
    setScanStatusMsg("Memeriksa jam presensi, lokasi GPS, dan perangkat HP...");

    try {
      // 1. Dynamic Time Window Check (from Admin Config)
      const now = new Date();
      const hours = now.getHours();
      const minutes = now.getMinutes();
      const timeInMinutes = hours * 60 + minutes;

      const scanStartStr = localStorage.getItem("19points_scan_start") || "06:30";
      const scanEndStr = localStorage.getItem("19points_scan_end") || "06:45";

      const [startHRaw, startMRaw] = scanStartStr.split(":").map(Number);
      const [endHRaw, endMRaw] = scanEndStr.split(":").map(Number);

      const startH = isNaN(startHRaw) ? 6 : startHRaw;
      const startM = isNaN(startMRaw) ? 30 : startMRaw;
      const endH = isNaN(endHRaw) ? 6 : endHRaw;
      const endM = isNaN(endMRaw) ? 45 : endMRaw;

      const startTime = startH * 60 + startM;
      const endTime = endH * 60 + endM;

      if (timeInMinutes < startTime || timeInMinutes > endTime) {
        throw new Error(`⛔ DI LUAR WAKTU PRESENSI: Scan presensi kelas mandiri hanya aktif pada pukul ${scanStartStr} - ${scanEndStr} WIB. Jika Anda terlambat, silakan melapor ke Guru Piket.`);
      }

      // 2. Device Binding Check (Anti-Titip Absen)
      const todayStr = new Date().toISOString().slice(0, 10);
      const deviceFp = localStorage.getItem("19points_device_fp") || `fp_${Math.random().toString(36).substring(2, 10)}`;
      localStorage.setItem("19points_device_fp", deviceFp);

      const deviceBindingKey = `19points_binding_${todayStr}`;
      const existingBinding = localStorage.getItem(deviceBindingKey);

      if (existingBinding && existingBinding !== siswaDetail?.id) {
        throw new Error(`⛔ PERANGKAT TERKUNCI: Perangkat HP ini sudah digunakan untuk presensi murid lain hari ini. Titip absen tidak diperbolehkan!`);
      }

      // 3. Geolocation GPS Check
      setScanStatusMsg("Mengambil lokasi GPS Anda...");
      const position: GeolocationPosition = await new Promise((resolve, reject) => {
        if (!navigator.geolocation) return reject(new Error("Browser tidak mendukung lokasi GPS."));
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        });
      });

      const studentLat = position.coords.latitude;
      const studentLng = position.coords.longitude;

      // Fetch remote GPS config from Supabase for cross-device accuracy
      let targetLat = parseFloat(localStorage.getItem("19points_gps_lat") || "-6.914744");
      let targetLng = parseFloat(localStorage.getItem("19points_gps_lng") || "107.609810");
      let allowedRadius = parseFloat(localStorage.getItem("19points_gps_radius") || "150");

      try {
        const { data: remoteConfig } = await supabase.from("pengaturan_sistem").select("*");
        if (remoteConfig && remoteConfig.length > 0) {
          const latItem = remoteConfig.find((r: any) => r.kunci === "gps_lat");
          const lngItem = remoteConfig.find((r: any) => r.kunci === "gps_lng");
          const radItem = remoteConfig.find((r: any) => r.kunci === "gps_radius");
          if (latItem?.nilai) targetLat = parseFloat(latItem.nilai);
          if (lngItem?.nilai) targetLng = parseFloat(lngItem.nilai);
          if (radItem?.nilai) allowedRadius = parseFloat(radItem.nilai);
        }
      } catch (e) {}

      // Haversine formula
      const R = 6371000;
      const dLat = (targetLat - studentLat) * (Math.PI / 180);
      const dLon = (targetLng - studentLng) * (Math.PI / 180);
      const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(studentLat * (Math.PI / 180)) * Math.cos(targetLat * (Math.PI / 180)) *
                Math.sin(dLon / 2) * Math.sin(dLon / 2);
      const distance = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

      if (distance > allowedRadius) {
        throw new Error(`⛔ DI LUAR AREA SEKOLAH: Lokasi Anda berada ${Math.round(distance)}m dari titik GPS presensi (${targetLat.toFixed(5)}, ${targetLng.toFixed(5)}) dengan radius max: ${allowedRadius}m.`);
      }

      // 4. Record Attendance to Supabase 'kehadiran'
      setScanStatusMsg("Menyimpan status presensi Tepat Waktu...");
      localStorage.setItem(deviceBindingKey, siswaDetail?.id || "");

      const { error: insErr } = await supabase.from("kehadiran").insert([{
        siswa_id: siswaDetail?.id,
        tanggal: todayStr,
        status: "tepat_waktu",
        nilai_poin_diberikan: 15,
        pencatat_email: userSession.email || "Self-QR",
        created_at: new Date().toISOString()
      }]);

      if (insErr) {
        // If unique constraint triggers (already scanned today)
        if (insErr.code === "23505" || insErr.message.includes("unique")) {
          throw new Error("⚠️ SUDAH PRESENSI: Anda sudah melakukan presensi kelas hari ini.");
        }
        throw insErr;
      }

      setScanSuccessMsg(`🎉 Presensi Berhasil! Anda tercatat HADIR (Tepat Waktu) pada pukul ${now.toLocaleTimeString("id-ID")}.`);
    } catch (err: any) {
      setScanErrorMsg(err.message || "Gagal memproses presensi.");
      throw err;
    } finally {
      setIsProcessingScan(false);
      setScanStatusMsg("");
    }
  };

  useEffect(() => {
    setHistoryPage(1);
  }, [historyTab]);

  useEffect(() => {
    async function loadStudentData() {
      setIsLoading(true);
      try {
        const username = userSession.email ? userSession.email.split("@")[0] : "";
        let siswaData: Siswa | null = null;

        // 1. Priority 1: Match by username (NIS) since student login email is username@sman19.sch.id
        if (username) {
          const { data: dataByUsername } = await supabase
            .from("siswa")
            .select("*")
            .eq("nis", username)
            .limit(1);
          if (dataByUsername && dataByUsername.length > 0) siswaData = dataByUsername[0];
        }

        // 2. Priority 2: Match by userSession.nis if different from username
        if (!siswaData && userSession.nis) {
          const { data: dataByNis } = await supabase
            .from("siswa")
            .select("*")
            .eq("nis", userSession.nis)
            .limit(1);
          if (dataByNis && dataByNis.length > 0) siswaData = dataByNis[0];
        }

        // 3. Priority 3: Fallback match by exact fullName
        if (!siswaData && userSession.fullName) {
          const { data: dataByName } = await supabase
            .from("siswa")
            .select("*")
            .ilike("nama", userSession.fullName.trim())
            .limit(1);
          if (dataByName && dataByName.length > 0) siswaData = dataByName[0];
        }

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

          // 2b. Fetch Attendance History
          const { data: absensiData, error: absensiError } = await supabase
            .from("kehadiran")
            .select(`
              id,
              tanggal,
              status,
              nilai_poin_diberikan,
              pencatat_email,
              created_at
            `)
            .eq("siswa_id", siswaData.id)
            .order("tanggal", { ascending: false });

          if (absensiError) throw absensiError;
          setAbsensi(absensiData || []);
        }
      } catch (error) {
        console.error("Failed to load student dashboard details:", error);
      } finally {
        setIsLoading(false);
      }
    }

    loadStudentData();
  }, [userSession.nis, userSession.email, userSession.fullName]);

  const historyTotalPages = Math.ceil((historyTab === "poin" ? riwayat.length : absensi.length) / historyPerPage);
  const paginatedData = historyTab === "poin"
    ? riwayat.slice((historyPage - 1) * historyPerPage, historyPage * historyPerPage)
    : absensi.slice((historyPage - 1) * historyPerPage, historyPage * historyPerPage);

  const handleDownloadCard = async () => {
    if (!siswaDetail) return;
    setIsDownloading(true);
    const cardElement = document.getElementById("student-digital-card-portrait");
    if (cardElement) {
      try {
        const canvas = await html2canvas(cardElement, {
          scale: 3,
          useCORS: true,
          allowTaint: true,
          backgroundColor: "#ffffff",
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
          Akun murid Anda belum terhubung dengan nomor induk murid (NIS) yang terdaftar di database. Silakan hubungi Super Admin untuk menyinkronkan NIS Anda.
        </p>
      </div>
    );
  }

  // Calculate stats
  const totalPrestasi = riwayat.filter(r => r.nilai_diberikan > 0).reduce((acc, r) => acc + r.nilai_diberikan, 0);
  const totalPelanggaran = riwayat.filter(r => r.nilai_diberikan < 0).reduce((acc, r) => acc + r.nilai_diberikan, 0);

  const countTepatWaktu = absensi.filter(a => a.status === "tepat_waktu").length;
  const countTerlambat = absensi.filter(a => a.status.startsWith("telat_")).length;
  const countAlfa = absensi.filter(a => a.status === "alfa").length;

  return (
    <div className="space-y-6 pb-8">
      
      {/* 1. STATISTIK TAB */}
      {activeTab === "siswa_stats" && (
        <div className="space-y-6 animate-fade-in">
          {/* Welcome Banner */}
          <div className="bg-gradient-to-br from-brand-800 via-brand-700 to-brand-800 rounded-3xl p-6 border border-brand-600 shadow-xl shadow-brand-900/20">
            {/* MOBILE LAYOUT */}
            <div className="flex md:hidden gap-5">
              <div className="flex-shrink-0">
                {siswaDetail.foto_url ? (
                  <img src={siswaDetail.foto_url} className="w-[130px] h-[173px] rounded-2xl object-cover border-2 border-white/30 shadow-md" alt={siswaDetail.nama} />
                ) : (
                  <div className="w-[130px] h-[173px] rounded-2xl border-2 border-white/20 bg-white/10 flex items-center justify-center text-white/70 font-black text-4xl uppercase">
                    {siswaDetail.nama.slice(0, 2)}
                  </div>
                )}
              </div>
              <div className="flex flex-col justify-center flex-1 min-w-0 space-y-3">
                <div className="space-y-0.5 min-w-0">
                  <h2 className="text-lg font-black text-white leading-tight break-words">Halo, {toSentenceCase(siswaDetail.nama)}!</h2>
                  <p className="text-[11px] text-purple-100 font-medium">Pantau poin prestasi dan pelanggaranmu.</p>
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => setShowStudentScanModal(true)}
                    className="bg-amber-400 hover:bg-amber-300 text-amber-950 px-3 py-2 rounded-2xl font-black text-xs inline-flex flex-col items-center justify-center transition-all shadow-md cursor-pointer border border-amber-300 flex-1 h-14"
                  >
                    <Camera className="w-4 h-4 text-amber-950" />
                    <span className="text-[9px] font-black tracking-tight text-amber-950 leading-none mt-0.5">Kehadiran</span>
                  </button>
                  <div className="bg-emerald-50/70 border border-emerald-100 rounded-2xl px-3 py-2 text-center flex-1 flex flex-col justify-center h-14">
                    <span className="text-[8.5px] font-black text-emerald-600 block uppercase tracking-wider">Kelas</span>
                    <span className="text-xs font-extrabold text-emerald-800 truncate">{siswaDetail.kelas}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* DESKTOP LAYOUT */}
            <div className="hidden md:flex md:items-center justify-between gap-6">
              <div className="flex items-center gap-4">
                {siswaDetail.foto_url ? (
                  <img src={siswaDetail.foto_url} className="w-20 h-[107px] rounded-2xl object-cover border-2 border-white/30 shadow-md flex-shrink-0" alt={siswaDetail.nama} />
                ) : (
                  <div className="w-20 h-[107px] rounded-2xl border-2 border-white/20 bg-white/10 flex items-center justify-center text-white/70 font-black text-3xl uppercase flex-shrink-0">
                    {siswaDetail.nama.slice(0, 2)}
                  </div>
                )}
                <div className="space-y-1">
                  <h2 className="text-2xl font-black text-white flex items-center gap-2">
                    Halo, {toSentenceCase(siswaDetail.nama)}! <Sparkles className="w-5 h-5 text-amber-300 animate-pulse" />
                  </h2>
                  <p className="text-xs text-purple-100 font-medium">
                    Pantau poin prestasi, kedisiplinan, dan presensi harian secara real-time.
                  </p>
                </div>
              </div>
              <div className="flex gap-4">
                <button
                  onClick={() => setShowStudentScanModal(true)}
                  className="bg-amber-400 hover:bg-amber-300 text-amber-950 px-4 py-2.5 rounded-2xl font-black text-xs inline-flex flex-col items-center justify-center transition-all shadow-md cursor-pointer border border-amber-300 min-w-[90px] h-14 hover:scale-[1.02] active:scale-[0.98]"
                >
                  <Camera className="w-4.5 h-4.5 text-amber-950" />
                  <span className="text-[9.5px] font-black text-amber-950 leading-none mt-0.5">Kehadiran</span>
                </button>
                <div className="bg-emerald-50/70 border border-emerald-100 rounded-2xl px-5 py-3 text-center min-w-[90px] h-14 flex flex-col justify-center">
                  <span className="text-[10px] font-black text-emerald-600 block uppercase tracking-wider">Kelas</span>
                  <span className="text-base font-extrabold text-emerald-800">{siswaDetail.kelas}</span>
                </div>
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

          {/* Attendance Summary row */}
          <div className="bg-white rounded-3xl p-6 border border-brand-100 shadow-xl shadow-brand-900/5 space-y-4">
            <h3 className="text-sm font-black text-brand-950 uppercase tracking-widest flex items-center gap-2">
              <Calendar className="w-5 h-5 text-brand-600" />
              Ikhtisar Kehadiran Harian
            </h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-emerald-50/50 border border-emerald-100 rounded-2xl p-4 text-center">
                <span className="text-[10px] font-black text-emerald-600 uppercase tracking-wider block">Tepat Waktu</span>
                <span className="text-lg font-black text-emerald-700 block mt-1">{countTepatWaktu}x</span>
              </div>
              <div className="bg-amber-50/50 border border-amber-100 rounded-2xl p-4 text-center">
                <span className="text-[10px] font-black text-amber-600 uppercase tracking-wider block">Terlambat</span>
                <span className="text-lg font-black text-amber-700 block mt-1">{countTerlambat}x</span>
              </div>
              <div className="bg-rose-50/50 border border-rose-100 rounded-2xl p-4 text-center">
                <span className="text-[10px] font-black text-rose-600 uppercase tracking-wider block">Alfa</span>
                <span className="text-lg font-black text-rose-700 block mt-1">{countAlfa}x</span>
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
              <path d="M0 0H290V92C210 128 160 85 110 112C60 138 30 115 0 120Z" fill="var(--color-brand-600)" opacity="0.2" />
              {/* Front Main Wave */}
              <path d="M0 0H290V80C210 112 165 72 115 100C65 128 35 102 0 108Z" fill="var(--color-brand-700)" />
            </svg>

            {/* Top Left School Branding */}
            <div className="absolute top-4.5 left-5 flex items-center gap-2 z-10 text-white pointer-events-none">
              <div className="w-7 h-7 rounded-lg bg-white p-1 flex items-center justify-center shadow-sm">
                <img src="/logo.png" crossOrigin="anonymous" className="w-full h-full object-contain" alt="Logo" />
              </div>
              <div>
                <h4 className="text-[8px] font-black tracking-widest text-white uppercase leading-tight">SMAN 19 BANDUNG</h4>
                <p className="text-[6px] text-brand-100 font-bold uppercase tracking-wider font-mono">Student Card</p>
              </div>
            </div>

            {/* CARD CONTENT LAYER */}
            <div className="relative z-10 w-full flex-1 flex flex-col justify-between items-center pt-11 pb-1">
              
              {/* 1. 3x4 Portrait Avatar (Pas Foto Style) */}
              <div className="w-21 h-28 rounded-2xl border-[3px] border-brand-500 bg-white flex items-center justify-center p-[2.5px] shadow-md shadow-brand-500/10 flex-shrink-0">
                {siswaDetail.foto_url ? (
                  <img src={siswaDetail.foto_url} className="w-full h-full rounded-xl object-cover" alt={siswaDetail.nama} />
                ) : (
                  <div className="w-full h-full rounded-xl border border-brand-100 bg-brand-50/50 flex items-center justify-center text-brand-650 font-black text-3xl uppercase tracking-wider">
                    {siswaDetail.nama.slice(0, 2)}
                  </div>
                )}
              </div>

              {/* 2. Student Info */}
              <div className="text-center space-y-1 mt-3">
                <h3 className="text-sm font-black tracking-tight text-[#1e1b4b] px-2 line-clamp-1 leading-snug">
                  {toSentenceCase(siswaDetail.nama)}
                </h3>
                <p className="text-[9px] text-brand-600 font-extrabold uppercase tracking-widest">
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
                    fgColor="var(--color-brand-700)"
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
          <div className="bg-white rounded-3xl p-6 border border-brand-100 shadow-xl shadow-brand-900/5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h3 className="text-base font-extrabold text-brand-900 flex items-center gap-2">
                <Clock className="w-5 h-5 text-brand-600" />
                Catatan Aktivitas Murid
              </h3>
              <p className="text-[10px] text-brand-500 font-medium mt-0.5">
                Daftar lengkap perolehan poin dan riwayat kehadiran harian Anda.
              </p>
            </div>
            
            {/* Sub-tab Selector */}
            <div className="flex bg-brand-50/70 border border-brand-100 p-1 rounded-xl w-full sm:w-auto">
              <button
                onClick={() => setHistoryTab("poin")}
                className={`flex-1 sm:flex-initial px-4 py-2 text-[10.5px] font-black uppercase tracking-wider rounded-lg cursor-pointer transition-all ${
                  historyTab === "poin"
                    ? "bg-white text-brand-900 shadow-xs border border-brand-100/50"
                    : "text-slate-400 hover:text-slate-600"
                }`}
              >
                Poin
              </button>
              <button
                onClick={() => setHistoryTab("kehadiran")}
                className={`flex-1 sm:flex-initial px-4 py-2 text-[10.5px] font-black uppercase tracking-wider rounded-lg cursor-pointer transition-all ${
                  historyTab === "kehadiran"
                    ? "bg-white text-brand-900 shadow-xs border border-brand-100/50"
                    : "text-slate-400 hover:text-slate-600"
                }`}
              >
                Kehadiran
              </button>
            </div>
          </div>

          {/* Cards List container */}
          <div className="space-y-3">
            {historyTab === "poin" ? (
              paginatedData.length > 0 ? (
                (paginatedData as RiwayatPoin[]).map((record) => {
                  const isPositive = record.nilai_diberikan > 0;
                  return (
                    <div 
                      key={record.id} 
                      className="bg-white rounded-2xl p-4.5 border border-brand-100 shadow-xs flex items-center justify-between gap-4 card-hover-effect"
                    >
                      {/* Left: Icon Badge & Details */}
                      <div className="flex items-center gap-4 min-w-0">
                        <div 
                          className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                            isPositive 
                              ? "bg-emerald-50 text-emerald-600 border border-emerald-100" 
                              : "bg-rose-50 text-rose-600 border border-rose-100"
                          }`}
                        >
                          {isPositive ? <Award className="w-5 h-5" /> : <TrendingUp className="w-5 h-5 rotate-180" />}
                        </div>
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
                              Dicatat: {toSentenceCase(record.guru_email.split("@")[0])}
                            </span>
                          </div>
                        </div>
                      </div>
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
              )
            ) : (
              paginatedData.length > 0 ? (
                (paginatedData as any[]).map((record) => {
                  const isPositive = record.nilai_poin_diberikan >= 0;
                  const statusLabel = record.status === "tepat_waktu" ? "Hadir Tepat Waktu"
                    : record.status === "telat_5" ? "Terlambat 5 Menit"
                    : record.status === "telat_10" ? "Terlambat 10 Menit"
                    : record.status === "telat_15" ? "Terlambat 15 Menit"
                    : record.status === "alfa" ? "Alfa / Tanpa Keterangan"
                    : record.status;
                  return (
                    <div 
                      key={record.id} 
                      className="bg-white rounded-2xl p-4.5 border border-brand-100 shadow-xs flex items-center justify-between gap-4 card-hover-effect"
                    >
                      {/* Left: Icon Badge & Details */}
                      <div className="flex items-center gap-4 min-w-0">
                        <div 
                          className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                            isPositive 
                              ? "bg-emerald-50 text-emerald-600 border border-emerald-100" 
                              : "bg-rose-50 text-rose-600 border border-rose-100"
                          }`}
                        >
                          <Calendar className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <span className="font-extrabold text-xs text-brand-950 block leading-snug truncate">
                            Absensi: {statusLabel}
                          </span>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-slate-400 font-semibold mt-1">
                            <span className="font-mono text-slate-500">
                              Tanggal: {record.tanggal}
                            </span>
                            <span className="hidden sm:inline w-1 h-1 bg-slate-300 rounded-full" />
                            <span className="truncate">
                              Petugas: {toSentenceCase(record.pencatat_email.split("@")[0])}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex-shrink-0">
                        <span 
                          className={`font-black font-mono px-3.5 py-1.5 rounded-xl text-xs ${
                            isPositive 
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-100/50" 
                              : "bg-rose-50 text-rose-700 border border-rose-100/50"
                          }`}
                        >
                          {isPositive ? `+${record.nilai_poin_diberikan}` : record.nilai_poin_diberikan}
                        </span>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="bg-white rounded-3xl p-12 text-center border border-brand-100 shadow-xl shadow-brand-900/5">
                  <p className="text-xs text-slate-400 font-bold">
                    Belum ada riwayat absensi harian.
                  </p>
                </div>
              )
            )}
          </div>

          {/* Pagination */}
          {historyTotalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <p className="text-[11px] font-bold text-brand-500">
                Halaman <strong className="text-brand-800">{historyPage}</strong> dari <strong className="text-brand-800">{historyTotalPages}</strong>
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                  disabled={historyPage === 1}
                  className="p-2 rounded-xl border border-brand-100 text-brand-600 hover:bg-brand-50 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-all"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                {getVisiblePages(historyTotalPages, historyPage).map((page, i) =>
                  page === "..." ? (
                    <span key={`dots-${i}`} className="text-brand-400 text-xs px-1">...</span>
                  ) : (
                    <button
                      key={page}
                      onClick={() => setHistoryPage(page as number)}
                      className={`w-8 h-8 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        historyPage === page
                          ? "bg-brand-600 text-white shadow-md"
                          : "border border-brand-100 text-brand-600 hover:bg-brand-50"
                      }`}
                    >
                      {page}
                    </button>
                  )
                )}
                <button
                  onClick={() => setHistoryPage((p) => Math.min(historyTotalPages, p + 1))}
                  disabled={historyPage === historyTotalPages}
                  className="p-2 rounded-xl border border-brand-100 text-brand-600 hover:bg-brand-50 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-all"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Lightbox / Zoom Modal */}
      {isZoomed && createPortal(
        <div 
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/95 backdrop-blur-xs p-4 animate-fade-in cursor-zoom-out"
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
            className="w-full max-w-[390px] aspect-[1/1.58] rounded-none bg-white text-brand-950 border border-brand-200 shadow-2xl relative flex flex-col items-center justify-between py-12 px-7 cursor-default animate-fade-in overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* TOP WAVE DECORATION (SVG) */}
            <svg className="absolute top-0 inset-x-0 w-full h-38 pointer-events-none" viewBox="0 0 340 150" fill="none" preserveAspectRatio="none">
              <path d="M0 0H340V108C245 150 187 100 128 131C70 162 35 135 0 141Z" fill="var(--color-brand-600)" opacity="0.2" />
              <path d="M0 0H340V94C245 131 193 84 134 117C76 150 41 120 0 127Z" fill="var(--color-brand-700)" />
            </svg>

            {/* Top Left School Branding */}
            <div className="absolute top-6 left-7 flex items-center gap-3 z-10 text-white pointer-events-none">
              <div className="w-10 h-10 rounded-xl bg-white p-1 flex items-center justify-center shadow-sm">
                <img src="/logo.png" className="w-full h-full object-contain" alt="Logo" />
              </div>
              <div>
                <h4 className="text-[10px] font-black tracking-widest text-white uppercase leading-tight">SMAN 19 BANDUNG</h4>
                <p className="text-[8px] text-brand-100 font-bold uppercase tracking-wider font-mono">Student Card</p>
              </div>
            </div>

            {/* CARD CONTENT LAYER */}
            <div className="relative z-10 w-full flex-1 flex flex-col justify-between items-center pt-14 pb-1">
              
              {/* 1. 3x4 Portrait Avatar (Pas Foto Style) */}
              <div className="w-32 h-44 rounded-[28px] border-[4px] border-brand-500 bg-white flex items-center justify-center p-[3px] shadow-md shadow-brand-500/10 flex-shrink-0">
                {siswaDetail.foto_url ? (
                  <img src={siswaDetail.foto_url} className="w-full h-full rounded-[22px] object-cover" alt={siswaDetail.nama} />
                ) : (
                  <div className="w-full h-full rounded-[22px] border border-brand-100 bg-brand-50/50 flex items-center justify-center text-brand-650 font-black text-4xl uppercase tracking-wider">
                    {siswaDetail.nama.slice(0, 2)}
                  </div>
                )}
              </div>

              {/* 2. Student Info */}
              <div className="text-center space-y-1 mt-3">
                <h3 className="text-lg font-black tracking-tight text-[#1e1b4b] px-2 line-clamp-1 leading-snug">
                  {toSentenceCase(siswaDetail.nama)}
                </h3>
                <p className="text-xs text-brand-650 font-extrabold uppercase tracking-widest mt-1">
                  NIS: {siswaDetail.nis} &bull; KELAS: {siswaDetail.kelas}
                </p>
              </div>

              {/* 3. High quality QR code */}
              <div className="mt-4 flex flex-col items-center">
                <div className="bg-white p-4 rounded-3xl border-[4px] border-brand-600">
                  <QRCodeSVG
                    value={siswaDetail.nis}
                    size={135}
                    level="M"
                    includeMargin={false}
                    fgColor="var(--color-brand-700)"
                  />
                </div>
              </div>
            </div>
          </div>
          
          {/* Close hint */}
          <p className="text-xs text-white/50 font-medium mt-4 select-none">
            Klik di mana saja untuk menutup
          </p>
        </div>,
        document.body
      )}

      {/* STUDENT QR CLASS SCANNER FULL SCREEN CAMERA VIEW WITH RED CLOSE BUTTON */}
      {showStudentScanModal && (
        <QrScanner
          title="Scan Presensi Kelas"
          subtitle={`Presensi Mandiri (${scanStart} - ${scanEnd} WIB)`}
          onClose={() => {
            setShowStudentScanModal(false);
            setScanErrorMsg("");
            setScanSuccessMsg("");
          }}
          onScanSuccess={async (data) => {
            try {
              await handleStudentClassQrScan(data);
              setTimeout(() => {
                setShowStudentScanModal(false);
              }, 2500);
              return {
                type: "success",
                title: "PRESENSI BERHASIL",
                message: `Berhasil! ${siswaDetail?.nama} tercatat HADIR.`
              };
            } catch (err: any) {
              const errorMsg = err.message || "Gagal memproses presensi.";
              setScanErrorMsg(errorMsg);
              setTimeout(() => {
                setShowStudentScanModal(false);
              }, 3000);
              return {
                type: "not_found",
                title: "GAGAL PRESENSI",
                message: errorMsg
              };
            }
          }}
        />
      )}

    </div>
  );
}
