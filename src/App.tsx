/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback, lazy, Suspense } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  School,
  LogOut,
  Users,
  ClipboardCheck,
  Calendar,
  Settings,
  Menu,
  X,
  ShieldCheck,
  Award,
  TrendingUp,
  CreditCard,
  RotateCcw,
  Download,
  Upload,
  ChevronDown,
  FolderOpen,
  LogIn,
  Edit3,
  Check
} from "lucide-react";
import { UserSession } from "./types";
import { getLocalStorage, setLocalStorage } from "./dbStore";
import { supabase, supabaseEnvError } from "./supabaseClient";
import { toSentenceCase } from "./formatName";

const THEMES = [
  {
    id: "royal_purple",
    name: "Royal Purple",
    primary: "#5b21b6",
    colors: {
      "--color-brand-50": "#f5f3ff",
      "--color-brand-100": "#ede9fe",
      "--color-brand-200": "#ddd6fe",
      "--color-brand-500": "#6d28d9",
      "--color-brand-600": "#5b21b6",
      "--color-brand-700": "#4c1d95",
      "--color-brand-800": "#3b0764",
      "--color-accent-500": "#d946ef",
      "--color-accent-600": "#c026d3"
    }
  },
  {
    id: "ocean_blue",
    name: "Ocean Blue",
    primary: "#0369a1",
    colors: {
      "--color-brand-50": "#f0f9ff",
      "--color-brand-100": "#e0f2fe",
      "--color-brand-200": "#bae6fd",
      "--color-brand-500": "#0284c7",
      "--color-brand-600": "#0369a1",
      "--color-brand-700": "#075985",
      "--color-brand-800": "#0c4a6e",
      "--color-accent-500": "#06b6d4",
      "--color-accent-600": "#0891b2"
    }
  },
  {
    id: "emerald_green",
    name: "Emerald Green",
    primary: "#059669",
    colors: {
      "--color-brand-50": "#f0fdf4",
      "--color-brand-100": "#dcfce7",
      "--color-brand-200": "#bbf7d0",
      "--color-brand-500": "#10b981",
      "--color-brand-600": "#059669",
      "--color-brand-700": "#047857",
      "--color-brand-800": "#064e3b",
      "--color-accent-500": "#14b8a6",
      "--color-accent-600": "#0d9488"
    }
  },
  {
    id: "sunset_orange",
    name: "Sunset Orange",
    primary: "#ea580c",
    colors: {
      "--color-brand-50": "#fff7ed",
      "--color-brand-100": "#ffedd5",
      "--color-brand-200": "#fed7aa",
      "--color-brand-500": "#f97316",
      "--color-brand-600": "#ea580c",
      "--color-brand-700": "#c2410c",
      "--color-brand-800": "#7c2d12",
      "--color-accent-500": "#eab308",
      "--color-accent-600": "#ca8a04"
    }
  },
  {
    id: "ruby_rose",
    name: "Ruby Rose",
    primary: "#e11d48",
    colors: {
      "--color-brand-50": "#fff1f2",
      "--color-brand-100": "#ffe4e6",
      "--color-brand-200": "#fecdd3",
      "--color-brand-500": "#f43f5e",
      "--color-brand-600": "#e11d48",
      "--color-brand-700": "#be123c",
      "--color-brand-800": "#881337",
      "--color-accent-500": "#ec4899",
      "--color-accent-600": "#db2777"
    }
  }
];

// View Imports — Lazy Loaded for code splitting
const LoginView = lazy(() => import("./components/LoginView"));
const StatsView = lazy(() => import("./components/StatsView"));
const InputPoinView = lazy(() => import("./components/InputPoinView"));
const KehadiranView = lazy(() => import("./components/KehadiranView"));
const InputKehadiranView = lazy(() => import("./components/InputKehadiranView"));
const KelolaSiswaView = lazy(() => import("./components/KelolaSiswaView"));
const HistoryView = lazy(() => import("./components/HistoryView"));
const MasterPoinView = lazy(() => import("./components/MasterPoinView"));
const SiswaDashboardView = lazy(() => import("./components/SiswaDashboardView"));
const KelolaPenggunaView = lazy(() => import("./components/KelolaPenggunaView"));
const ChangePasswordView = lazy(() => import("./components/ChangePasswordView"));
const GuruKehadiranView = lazy(() => import("./components/GuruKehadiranView"));
const GuruSertifikatView = lazy(() => import("./components/GuruSertifikatView"));
const KelolaKehadiranGuruView = lazy(() => import("./components/KelolaKehadiranGuruView"));
const KelolaSertifikatGuruView = lazy(() => import("./components/KelolaSertifikatGuruView"));
const KelolaJadwalGuruView = lazy(() => import("./components/KelolaJadwalGuruView"));
const GuruJadwalView = lazy(() => import("./components/GuruJadwalView"));
import AkhiriAktivitasModal from "./components/AkhiriAktivitasModal";
import ExportSummaryModal from "./components/ExportSummaryModal";
import ImportSummaryModal from "./components/ImportSummaryModal";
import ConfirmationModal from "./components/ConfirmationModal";
import ErrorBoundary from "./components/ErrorBoundary";

export default function App() {
  if (supabaseEnvError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#faf9ff] px-4 font-sans">
        <div className="max-w-md w-full bg-white p-8 rounded-3xl border border-brand-100 shadow-2xl text-center space-y-5 animate-fade-in">
          <div className="w-16 h-16 bg-rose-50 rounded-2xl flex items-center justify-center mx-auto text-rose-500 border border-rose-100 animate-bounce">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-8 h-8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.3c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-black text-brand-950">Konfigurasi Supabase Diperlukan</h3>
            <p className="text-xs text-brand-500 font-medium leading-relaxed">
              {supabaseEnvError}
            </p>
          </div>
          <div className="p-4 bg-brand-50/70 border border-brand-100 rounded-2xl text-left text-[10.5px] font-mono text-brand-900 space-y-1.5 shadow-inner">
            <p className="font-extrabold text-brand-950 mb-1 font-sans">Tambahkan variabel berikut ke file `.env.local`:</p>
            <p className="text-emerald-700 font-bold select-all">VITE_SUPABASE_URL=https://nama-project.supabase.co</p>
            <p className="text-emerald-700 font-bold select-all">VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...</p>
          </div>
          <p className="text-[10px] text-brand-400 font-medium leading-relaxed">
            Buat file baru bernama <strong className="text-brand-950 font-bold">.env.local</strong> di folder utama (root) proyek ini, lalu simpan variabel di atas.
          </p>
        </div>
      </div>
    );
  }

  const [userSession, setUserSession] = useState<UserSession | null>(() => {
    return getLocalStorage<UserSession | null>("19points_session", null);
  });

  const [activeTheme, setActiveTheme] = useState(() => {
    return localStorage.getItem("nineteen-space-theme") || "royal_purple";
  });

  const applyTheme = (themeId: string) => {
    const t = THEMES.find(item => item.id === themeId) || THEMES[0];
    Object.entries(t.colors).forEach(([key, val]) => {
      document.documentElement.style.setProperty(key, val);
    });
    localStorage.setItem("nineteen-space-theme", themeId);
    setActiveTheme(themeId);
  };

  useEffect(() => {
    applyTheme(activeTheme);
  }, []);
  
  const [activeTab, setActiveTab] = useState<string>("stats");

  const [historyRefreshCount, setHistoryRefreshCount] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);
  const [headerImgFailed, setHeaderImgFailed] = useState(false);
  const [showProfilePopup, setShowProfilePopup] = useState(false);
  const [isAkhiriAktivitasOpen, setIsAkhiriAktivitasOpen] = useState(false);
  const [isExportSummaryOpen, setIsExportSummaryOpen] = useState(false);
  const [isImportSummaryOpen, setIsImportSummaryOpen] = useState(false);

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    manajemen: false,
    pengaturan: false,
  });

  // Sidebar sliding indicator
  const navRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const [indicatorStyle, setIndicatorStyle] = useState({ top: 0, height: 0, opacity: 0 });

  const updateIndicator = useCallback(() => {
    // 1. Check if activeTab belongs to a group and if that group is closed
    let isParentGroupClosed = false;
    if (["students", "kelola_jadwal_guru", "kelola_sertifikat_guru", "rules"].includes(activeTab)) {
      if (!openGroups.manajemen) {
        isParentGroupClosed = true;
      }
    }
    if (["users", "change_password"].includes(activeTab)) {
      if (!openGroups.pengaturan) {
        isParentGroupClosed = true;
      }
    }

    const activeBtn = navRefs.current.get(activeTab);
    
    // 2. Only show indicator if button exists and its parent group is open
    if (activeBtn && !isParentGroupClosed) {
      let top = activeBtn.offsetTop;
      let parent = activeBtn.offsetParent as HTMLElement;
      while (parent && !parent.classList.contains("nav-container")) {
        top += parent.offsetTop;
        parent = parent.offsetParent as HTMLElement;
      }
      setIndicatorStyle({
        top,
        height: activeBtn.offsetHeight,
        opacity: 1,
      });
    } else {
      setIndicatorStyle((prev) => ({
        ...prev,
        opacity: 0,
      }));
    }
  }, [activeTab, openGroups, userSession]);

  useEffect(() => {
    // Run immediately
    updateIndicator();
    
    // Run after a short delay to ensure font loading and flex layouts are computed
    const timer = setTimeout(updateIndicator, 50);
    
    window.addEventListener("resize", updateIndicator);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", updateIndicator);
    };
  }, [updateIndicator]);

  // Disable background scrolling when mobile menu is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileMenuOpen]);

  // Sync state changes with localStorage
  useEffect(() => {
    setLocalStorage("19points_session", userSession);
  }, [userSession]);

  // Reset image load error state when the photo URL changes
  useEffect(() => {
    setHeaderImgFailed(false);
  }, [userSession?.foto_url]);

  // Fetch latest photo URL from database to ensure header shows the correct photo
  useEffect(() => {
    async function loadLatestPhoto() {
      if (!userSession) return;
      try {
        let latestFotoUrl: string | null = null;
        if (userSession.role === "siswa" && userSession.nis) {
          const { data, error } = await supabase
            .from("siswa")
            .select("foto_url")
            .eq("nis", userSession.nis)
            .single();
          if (!error && data) {
            latestFotoUrl = data.foto_url;
          }
        } else {
          const { data, error } = await supabase
            .from("profiles")
            .select("foto_url")
            .eq("email", userSession.email)
            .single();
          if (!error && data) {
            latestFotoUrl = data.foto_url;
          }
        }

        if (latestFotoUrl !== undefined && latestFotoUrl !== userSession.foto_url) {
          setUserSession((prev) => (prev ? { ...prev, foto_url: latestFotoUrl } : null));
        }
      } catch (err) {
        console.error("Gagal memperbarui foto profil di header:", err);
      }
    }

    loadLatestPhoto();
  }, [userSession?.nis, userSession?.email]);



  useEffect(() => {
    if (userSession) {
      if (userSession.role === "siswa") {
        if (!["siswa_stats", "siswa_barcode", "siswa_history", "change_password"].includes(activeTab)) {
          setActiveTab("siswa_stats");
        }
      } else if (userSession.role === "piket") {
        if (!["kehadiran", "kelola_kehadiran_guru", "input_kehadiran"].includes(activeTab)) {
          setActiveTab("input_kehadiran");
        }
      } else if (userSession.role === "guru") {
        if (!["input", "students", "history", "change_password", "guru_kehadiran", "guru_sertifikat", "guru_jadwal"].includes(activeTab)) {
          setActiveTab("guru_kehadiran");
        }
      } else if (userSession.role === "kepala_sekolah") {
        if (!["input_kehadiran", "input", "kehadiran", "students", "history", "change_password", "kelola_kehadiran_guru", "kelola_jadwal_guru"].includes(activeTab)) {
          setActiveTab("input_kehadiran");
        }
      } else {
        if (!["stats", "input_kehadiran", "input", "kehadiran", "students", "history", "rules", "users", "change_password", "kelola_kehadiran_guru", "kelola_sertifikat_guru", "kelola_jadwal_guru"].includes(activeTab)) {
          setActiveTab("stats");
        }
      }
    }
  }, [userSession, activeTab]);

  const handleLogout = () => {
    setIsLogoutConfirmOpen(true);
  };

  if (!userSession) {
    return (
      <Suspense fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#faf9ff]">
          <div className="w-8 h-8 border-3 border-brand-400 border-t-transparent rounded-full animate-spin" />
        </div>
      }>
        <LoginView onLoginSuccess={(session) => setUserSession(session)} />
      </Suspense>
    );
  }

  // Construct Dynamic Sidebar Elements based on user role
  let sidebarElements: any[] = [];

  if (userSession.role === "piket") {
    sidebarElements = [
      { type: "item", id: "input_kehadiran", label: "Input Kehadiran", icon: ClipboardCheck, description: "Scan QR & input absen harian" },
      { type: "item", id: "kehadiran", label: "Kehadiran Murid", icon: Users, description: "Rekap absensi & poin murid" },
      { type: "item", id: "kelola_kehadiran_guru", label: "Kehadiran Guru", icon: Calendar, description: "Monitoring absensi guru" }
    ];
  } else if (userSession.role === "guru") {
    sidebarElements = [
      { type: "item", id: "guru_kehadiran", label: "Kehadiran Saya", icon: Calendar, description: "Absen masuk & pulang" },
      { type: "item", id: "guru_sertifikat", label: "Sertifikat Kegiatan", icon: Award, description: "Unduh sertifikat pelatihan" },
      { type: "item", id: "guru_jadwal", label: "Jadwal Mengajar", icon: Calendar, description: "Jadwal mengajar Anda" },
      { type: "item", id: "input", label: "Input Poin", icon: ClipboardCheck, description: "Catat via QR atau pencarian" },
      { type: "item", id: "history", label: "Riwayat Poin", icon: Calendar, description: "Audit trail pencatatan" },
      { type: "item", id: "students", label: "Data Murid", icon: Users, description: "Lihat database & kartu pelajar" },
      { type: "item", id: "change_password", label: "Ubah Password", icon: Settings, description: "Ganti password akun Anda" }
    ];
  } else if (userSession.role === "kepala_sekolah") {
    sidebarElements = [
      {
        type: "group",
        id: "input_data",
        label: "Input Data",
        icon: ClipboardCheck,
        items: [
          { id: "input_kehadiran", label: "Input Kehadiran", icon: LogIn, description: "Absensi guru & murid" },
          { id: "input", label: "Input Poin", icon: Edit3, description: "Pencatatan sanksi & prestasi" }
        ]
      },
      { type: "item", id: "kehadiran", label: "Kehadiran Murid", icon: Users, description: "Monitoring absensi murid" },
      { type: "item", id: "kelola_kehadiran_guru", label: "Kehadiran Guru", icon: Calendar, description: "Monitoring absensi guru" },
      { type: "item", id: "history", label: "Riwayat Poin", icon: Calendar, description: "Audit trail pencatatan" },
      { type: "item", id: "students", label: "Data Murid", icon: Users, description: "Lihat database & kartu pelajar" },
      { type: "item", id: "kelola_jadwal_guru", label: "Jadwal Guru", icon: Calendar, description: "Manajemen jadwal mengajar guru" },
      { type: "item", id: "change_password", label: "Ubah Password", icon: Settings, description: "Ganti password akun Anda" }
    ];
  } else if (userSession.role === "super_admin") {
    sidebarElements = [
      { type: "item", id: "stats", label: "Statistik Poin", icon: TrendingUp, description: "Ikhtisar & analisis grafik" },
      {
        type: "group",
        id: "input_data",
        label: "Input Data",
        icon: ClipboardCheck,
        items: [
          { id: "input_kehadiran", label: "Input Kehadiran", icon: LogIn, description: "Absensi guru & murid" },
          { id: "input", label: "Input Poin", icon: Edit3, description: "Pencatatan sanksi & prestasi" }
        ]
      },
      { type: "item", id: "kehadiran", label: "Kehadiran Murid", icon: Users, description: "Rekap absensi murid" },
      { type: "item", id: "kelola_kehadiran_guru", label: "Kehadiran Guru", icon: Calendar, description: "Monitoring absensi guru" },
      { type: "item", id: "history", label: "Riwayat Poin", icon: Calendar, description: "Audit trail pencatatan" },
      {
        type: "group",
        id: "manajemen",
        label: "Manajemen Kelola",
        icon: FolderOpen,
        items: [
          { id: "students", label: "Kelola Murid", icon: Users, description: "Database & kartu pelajar" },
          { id: "kelola_jadwal_guru", label: "Jadwal Guru", icon: Calendar, description: "Manajemen jadwal mengajar guru" },
          { id: "kelola_sertifikat_guru", label: "Sertifikat Guru", icon: Award, description: "Kelola kegiatan & sertifikat" },
          { id: "rules", label: "Pengaturan Poin", icon: Settings, description: "Atur sanksi & prestasi" }
        ]
      },
      {
        type: "group",
        id: "pengaturan",
        label: "Pengaturan",
        icon: Settings,
        items: [
          { id: "users", label: "Pengaturan Akun", icon: ShieldCheck, description: "Atur akun guru & murid" },
          { id: "change_password", label: "Ubah Password", icon: Settings, description: "Ganti password akun Anda" }
        ]
      }
    ];
  } else if (userSession.role === "siswa") {
    sidebarElements = [
      { type: "item", id: "siswa_stats", label: "Statistik", icon: TrendingUp, description: "Statistik poin Anda" },
      { type: "item", id: "siswa_barcode", label: "Kartu Pelajar", icon: CreditCard, description: "QR Kartu Pelajar Digital" },
      { type: "item", id: "siswa_history", label: "Riwayat Poin", icon: Calendar, description: "Riwayat perolehan poin" },
      { type: "item", id: "change_password", label: "Ubah Password", icon: Settings, description: "Ganti password akun Anda" }
    ];
  }

  return (
    <>
    <div
      className="h-screen bg-[#faf9ff] text-[#1e1b4b] flex flex-row font-sans w-full animate-[fadeIn_0.6s_ease-out]"
    >
      
      {/* Header — fixed layer, always pinned at top */}
      <header className={`fixed top-0 left-0 md:left-68 right-0 h-20 z-[60] bg-gradient-to-r from-brand-800 via-brand-700 to-brand-800 md:!bg-none md:bg-[#faf9ff] text-white md:text-[#1e1b4b] shadow-xl shadow-brand-900/15 md:shadow-none md:border-b md:border-brand-100/50 transition-all duration-300 ${mobileMenuOpen ? "backdrop-blur-xl bg-brand-800/80 md:bg-[#faf9ff]/80" : ""}`}>
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent pointer-events-none md:hidden" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between gap-3 relative z-10">
          
          {/* Left Side: Mobile Menu + Branding */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            {/* Mobile hamburger menu toggle */}
            <div className="flex md:hidden flex-shrink-0">
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="p-2 -ml-2 text-white hover:text-brand-200 transition-colors cursor-pointer"
                aria-label="Menu"
              >
                {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
            </div>

          </div>

          {/* Right profile header info */}
          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
            {/* Super Admin Actions */}
            {userSession.role === "super_admin" && (
              <>
                {/* Export Summary — Desktop */}
                <button
                  onClick={() => setIsExportSummaryOpen(true)}
                  className="hidden sm:flex items-center gap-2 bg-brand-950/40 md:bg-emerald-50/70 px-4 py-2.5 rounded-xl border border-white/10 md:border-emerald-200 shadow-xs hover:shadow-md transition-all cursor-pointer group"
                  title="Export Summary Poin"
                >
                  <Download className="w-4 h-4 text-emerald-300 md:text-emerald-600 group-hover:text-emerald-800 transition-colors" />
                  <span className="text-xs font-bold text-white md:text-emerald-700 tracking-wide whitespace-nowrap">Export</span>
                </button>
                {/* Import Summary — Desktop */}
                <button
                  onClick={() => setIsImportSummaryOpen(true)}
                  className="hidden sm:flex items-center gap-2 bg-brand-950/40 md:bg-blue-50/70 px-4 py-2.5 rounded-xl border border-white/10 md:border-blue-200 shadow-xs hover:shadow-md transition-all cursor-pointer group"
                  title="Import Summary Poin"
                >
                  <Upload className="w-4 h-4 text-blue-300 md:text-blue-600 group-hover:text-blue-800 transition-colors" />
                  <span className="text-xs font-bold text-white md:text-blue-700 tracking-wide whitespace-nowrap">Import</span>
                </button>
                {/* Akhiri Aktivitas — Desktop */}
                <button
                  onClick={() => setIsAkhiriAktivitasOpen(true)}
                  className="hidden sm:flex items-center gap-2 bg-brand-950/40 md:bg-rose-50/70 px-4 py-2.5 rounded-xl border border-white/10 md:border-rose-200 shadow-xs hover:shadow-md transition-all cursor-pointer group"
                  title="Akhiri Aktivitas Poin"
                >
                  <RotateCcw className="w-4 h-4 text-rose-300 md:text-rose-600 group-hover:text-rose-800 transition-colors" />
                  <span className="text-xs font-bold text-white md:text-rose-700 tracking-wide whitespace-nowrap">Akhiri</span>
                </button>
                {/* Mobile: Export */}
                <button
                  onClick={() => setIsExportSummaryOpen(true)}
                  className="sm:hidden p-2 bg-brand-950/40 rounded-xl border border-white/10"
                  title="Export Summary Poin"
                >
                  <Download className="w-4 h-4 text-white" />
                </button>
                {/* Mobile: Import */}
                <button
                  onClick={() => setIsImportSummaryOpen(true)}
                  className="sm:hidden p-2 bg-brand-950/40 rounded-xl border border-white/10"
                  title="Import Summary Poin"
                >
                  <Upload className="w-4 h-4 text-white" />
                </button>
                {/* Mobile: Akhiri */}
                <button
                  onClick={() => setIsAkhiriAktivitasOpen(true)}
                  className="sm:hidden p-2 bg-brand-950/40 rounded-xl border border-white/10"
                  title="Akhiri Aktivitas Poin"
                >
                  <RotateCcw className="w-4 h-4 text-white" />
                </button>
              </>
            )}
            <button
              onClick={() => setShowProfilePopup(true)}
              className="flex items-center gap-2 sm:gap-3 bg-brand-950/40 md:bg-brand-50/70 pl-2 sm:pl-4 pr-1.5 py-1.5 rounded-2xl border border-white/10 md:border-brand-100 shadow-xs hover:shadow-md transition-all cursor-pointer"
            >
              <div className="text-right">
                <p className="text-[11px] md:text-xs font-bold text-white md:!text-[#1e1b4b] tracking-wide whitespace-nowrap">{toSentenceCase(userSession.fullName)}</p>
                <div className="flex items-center justify-end gap-1 text-[9px] md:text-[10px] text-brand-200 md:!text-slate-500 font-extrabold uppercase tracking-widest mt-0.5">
                  <ShieldCheck className="w-2.5 h-2.5 text-accent-500" />
                  <span>{userSession.role === "siswa" ? "murid" : userSession.role.replace("_", " ")}</span>
                </div>
              </div>
              {(userSession.foto_url && !headerImgFailed) ? (
                <img src={userSession.foto_url} onError={() => setHeaderImgFailed(true)} className="w-9 h-12 sm:w-10 sm:h-[53px] rounded-xl object-cover border border-white/30 md:border-brand-200/50 shadow-md flex-shrink-0" alt="Avatar" />
              ) : (
                <div className="w-9 h-12 sm:w-10 sm:h-[53px] rounded-xl bg-gradient-to-tr from-accent-500 to-amber-400 border border-white/30 md:border-brand-200/50 flex items-center justify-center font-bold text-xs uppercase text-white shadow-md relative flex-shrink-0">
                  {userSession.fullName.slice(0, 2)}
                </div>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Navigation Sidebar (Desktop - Very Left Edge) */}
      <nav className="hidden md:flex flex-col w-68 flex-shrink-0 bg-gradient-to-b from-brand-800 via-brand-700 to-brand-800 text-white h-screen sticky top-0 border-r border-brand-600 shadow-2xl wave-bg p-6 justify-between rounded-r-[32px] z-30">
        <div className="space-y-6">
          {/* Branding inside Sidebar */}
          <div className="flex items-center gap-2.5 pb-4 border-b border-brand-800/60">
            <div className="w-10 h-10 rounded-2xl bg-white border border-brand-100 p-1.5 flex items-center justify-center shadow-md flex-shrink-0">
              <img src="/logo.png" className="w-full h-full object-contain" alt="Logo" />
            </div>
            <div>
              <h4 className="text-sm font-black tracking-tight text-white uppercase">SMAN 19 Bandung</h4>
              <p className="text-[11px] text-accent-400 font-black uppercase tracking-wider">Nineteen Space</p>
            </div>
          </div>

          <div className="text-xs font-black text-accent-300 uppercase tracking-widest px-2">
            MENU UTAMA
          </div>
          
          <div className="space-y-1 relative nav-container">
            {/* Sliding Indicator */}
            <motion.div
              className="absolute left-0 right-0 bg-white rounded-2xl shadow-md shadow-brand-950/10 border border-white z-0"
              animate={{
                top: indicatorStyle.top,
                height: indicatorStyle.height,
                opacity: indicatorStyle.opacity,
              }}
              transition={{ type: "spring", stiffness: 350, damping: 30 }}
            />

            {sidebarElements.map((element) => {
              if (element.type === "item") {
                const IconComponent = element.icon;
                const isActive = activeTab === element.id;
                return (
                  <button
                    key={element.id}
                    ref={(el) => {
                      if (el) navRefs.current.set(element.id, el);
                      else navRefs.current.delete(element.id);
                    }}
                    onClick={() => setActiveTab(element.id)}
                    className={`w-full text-left px-4 py-3.5 rounded-2xl flex items-center gap-3 transition-colors relative z-10 cursor-pointer ${
                      isActive ? "text-brand-800 font-bold" : "text-brand-200/85 hover:text-white"
                    }`}
                  >
                    <IconComponent className={`w-4.5 h-4.5 flex-shrink-0 transition-colors ${isActive ? "text-brand-600" : "text-brand-300 group-hover:text-white"}`} />
                    <span className="text-sm font-bold tracking-wide">{element.label}</span>
                  </button>
                );
              } else {
                const GroupIcon = element.icon;
                const isOpen = openGroups[element.id] ?? true;
                return (
                  <div key={element.id} className="space-y-1">
                    <button
                      onClick={() => setOpenGroups(prev => ({ ...prev, [element.id]: !isOpen }))}
                      className="w-full text-left px-4 py-3.5 rounded-2xl flex items-center justify-between text-brand-200/85 hover:text-white cursor-pointer transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <GroupIcon className="w-4.5 h-4.5 text-brand-300" />
                        <span className="text-sm font-bold tracking-wide">{element.label}</span>
                      </div>
                      <ChevronDown className={`w-4 h-4 transform transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
                    </button>
                    <AnimatePresence initial={false}>
                      {isOpen && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{
                            height: { duration: 0.28, ease: [0.4, 0, 0.2, 1] },
                            opacity: { duration: 0.2, ease: "easeInOut" }
                          }}
                          className="pl-3.5 space-y-1 overflow-hidden"
                        >
                          {element.items.map((subItem) => {
                            const SubIcon = subItem.icon;
                            const isActive = activeTab === subItem.id;
                            return (
                              <button
                                key={subItem.id}
                                ref={(el) => {
                                  if (el) navRefs.current.set(subItem.id, el);
                                  else navRefs.current.delete(subItem.id);
                                }}
                                onClick={() => setActiveTab(subItem.id)}
                                className={`w-full text-left px-4 py-3 rounded-2xl flex items-center gap-3 transition-colors relative z-10 cursor-pointer ${
                                  isActive ? "text-brand-800 font-bold" : "text-brand-200/85 hover:text-white"
                                }`}
                              >
                                <SubIcon className={`w-4.5 h-4.5 flex-shrink-0 transition-colors ${isActive ? "text-brand-600" : "text-brand-300"}`} />
                                <span className="text-sm font-bold tracking-wide">{subItem.label}</span>
                              </button>
                            );
                          })}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              }
            })}
          </div>
        </div>

        {/* Footer of Sidebar */}
        <div className="border-t border-brand-800/60 pt-4">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleLogout}
            className="w-full py-3 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/25 hover:border-rose-500/40 rounded-2xl text-rose-300 hover:text-rose-100 text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            Keluar
          </motion.button>
        </div>
      </nav>

      {/* Main Workspace Area (Right side) */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto h-screen pt-20">
        
        {/* Mobile Navigation Drawer Overlay (Only active on mobile when menu toggled) */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <div className="fixed inset-0 z-[70] md:hidden flex">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="fixed inset-0 bg-brand-950/60 backdrop-blur-xs"
                onClick={() => setMobileMenuOpen(false)}
              />

              <motion.div
                initial={{ x: "-100%" }}
                animate={{ x: 0 }}
                exit={{ x: "-100%" }}
                transition={{ duration: 0.22, ease: "easeOut" }}
                className="relative w-80 max-w-[85vw] bg-gradient-to-b from-brand-800 via-brand-700 to-brand-800 text-white h-full shadow-2xl flex flex-col justify-between border-r border-brand-600 z-10 overflow-y-auto wave-bg rounded-r-[32px] will-change-transform"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Header Information */}
                <div className="p-6 border-b border-brand-800/60 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-white border border-brand-100 p-1 flex items-center justify-center shadow-md flex-shrink-0">
                      <img src="/logo.png" className="w-full h-full object-contain" alt="Logo" />
                    </div>
                    <div>
                      <h4 className="text-sm font-black tracking-tight text-white">SMAN 19 Bandung</h4>
                      <p className="text-[11px] text-accent-400 font-black uppercase tracking-wider">Nineteen Space</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setMobileMenuOpen(false)}
                    className="p-2 text-brand-300 hover:text-white hover:bg-white/10 rounded-xl transition-all cursor-pointer"
                  >
                    <X className="w-4.5 h-4.5" />
                  </button>
                </div>

                {/* Drawer Body Menu */}
                <div className="flex-1 py-6 px-4 space-y-1 overflow-y-auto">
                  {sidebarElements.map((element) => {
                    if (element.type === "item") {
                      const IconComp = element.icon;
                      const isActive = activeTab === element.id;
                      return (
                        <button
                          key={element.id}
                          onClick={() => {
                            setActiveTab(element.id);
                            setMobileMenuOpen(false);
                          }}
                          className={`w-full text-left px-4 py-3.5 rounded-2xl flex items-center gap-3 transition-all cursor-pointer relative overflow-hidden group ${
                            isActive
                              ? "bg-white text-brand-800 shadow-md shadow-brand-950/10 border border-white"
                              : "text-brand-200 hover:text-white hover:bg-white/5"
                          }`}
                        >
                          <IconComp className={`w-4.5 h-4.5 flex-shrink-0 ${isActive ? "text-brand-600" : "text-brand-400 group-hover:text-white"}`} />
                          <span className="text-sm font-bold tracking-wide">{element.label}</span>
                        </button>
                      );
                    } else {
                      const GroupIcon = element.icon;
                      const isOpen = openGroups[element.id] ?? true;
                      return (
                        <div key={element.id} className="space-y-1">
                          <button
                            onClick={() => setOpenGroups(prev => ({ ...prev, [element.id]: !isOpen }))}
                            className="w-full text-left px-4 py-3.5 rounded-2xl flex items-center justify-between text-brand-200 hover:text-white cursor-pointer"
                          >
                            <div className="flex items-center gap-3">
                              <GroupIcon className="w-4.5 h-4.5 text-brand-300" />
                              <span className="text-sm font-bold tracking-wide">{element.label}</span>
                            </div>
                            <ChevronDown className={`w-4 h-4 transform transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
                          </button>
                          <AnimatePresence initial={false}>
                            {isOpen && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{
                                  height: { duration: 0.28, ease: [0.4, 0, 0.2, 1] },
                                  opacity: { duration: 0.2, ease: "easeInOut" }
                                }}
                                className="pl-3.5 space-y-1 overflow-hidden"
                              >
                                {element.items.map((subItem) => {
                                  const SubIcon = subItem.icon;
                                  const isActive = activeTab === subItem.id;
                                  return (
                                    <button
                                      key={subItem.id}
                                      onClick={() => {
                                        setActiveTab(subItem.id);
                                        setMobileMenuOpen(false);
                                      }}
                                      className={`w-full text-left px-4 py-3 rounded-2xl flex items-center gap-3 transition-colors relative z-10 cursor-pointer ${
                                        isActive
                                          ? "bg-white text-brand-800 shadow-md shadow-brand-950/10 border border-white"
                                          : "text-brand-200 hover:text-white hover:bg-white/5"
                                      }`}
                                    >
                                      <SubIcon className={`w-4.5 h-4.5 flex-shrink-0 transition-colors ${isActive ? "text-brand-600" : "text-brand-400"}`} />
                                      <span className="text-sm font-bold tracking-wide">{subItem.label}</span>
                                    </button>
                                  );
                                })}
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    }
                  })}
                </div>

                {/* Drawer Footer Information */}
                <div className="p-6 border-t border-brand-800 bg-brand-950/40 flex flex-col gap-2">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => {
                      setMobileMenuOpen(false);
                      setTimeout(() => handleLogout(), 300);
                    }}
                    className="w-full py-3.5 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/25 hover:border-rose-500/40 rounded-2xl text-rose-300 hover:text-rose-100 text-base font-bold flex items-center justify-center gap-2 transition-all cursor-pointer"
                  >
                    <LogOut className="w-4.5 h-4.5" />
                    Keluar
                  </motion.button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Dynamic View Panel */}
        <main className="flex-1 p-6 pb-24 md:p-8 md:pb-16 max-w-7xl w-full mx-auto">
          <ErrorBoundary>
          <Suspense fallback={
            <div className="flex items-center justify-center py-32">
              <div className="w-8 h-8 border-3 border-brand-400 border-t-transparent rounded-full animate-spin" />
            </div>
          }>
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
            >
              {activeTab === "stats" && (
                <StatsView />
              )}

              {activeTab === "input" && (
                <InputPoinView
                  userSession={userSession}
                  onRefreshHistory={() => setHistoryRefreshCount((c) => c + 1)}
                />
              )}

              {activeTab === "kehadiran" && (
                <KehadiranView
                  userSession={userSession}
                  onRefreshHistory={() => setHistoryRefreshCount((c) => c + 1)}
                />
              )}

              {activeTab === "input_kehadiran" && (
                <InputKehadiranView
                  userSession={userSession}
                />
              )}

              {activeTab === "students" && (
                <KelolaSiswaView
                  userSession={userSession}
                  onRefreshHistory={() => setHistoryRefreshCount((c) => c + 1)}
                />
              )}

              {activeTab === "history" && (
                <HistoryView
                  onRefreshTrigger={() => setHistoryRefreshCount((c) => c + 1)}
                  refreshCount={historyRefreshCount}
                  userSession={userSession}
                />
              )}

              {activeTab === "rules" && (
                <MasterPoinView onRefreshTrigger={() => setHistoryRefreshCount((c) => c + 1)} />
              )}

              {activeTab === "users" && userSession.role === "super_admin" && (
                <KelolaPenggunaView
                  userSession={userSession}
                  onRefreshHistory={() => setHistoryRefreshCount((c) => c + 1)}
                />
              )}

              {activeTab === "guru_kehadiran" && userSession.role === "guru" && (
                <GuruKehadiranView userSession={userSession} />
              )}

              {activeTab === "guru_sertifikat" && userSession.role === "guru" && (
                <GuruSertifikatView userSession={userSession} />
              )}

              {activeTab === "kelola_kehadiran_guru" && ["super_admin", "kepala_sekolah", "piket"].includes(userSession.role) && (
                <KelolaKehadiranGuruView />
              )}

              {activeTab === "kelola_sertifikat_guru" && userSession.role === "super_admin" && (
                <KelolaSertifikatGuruView />
              )}

              {activeTab === "kelola_jadwal_guru" && ["super_admin", "kepala_sekolah"].includes(userSession.role) && (
                <KelolaJadwalGuruView />
              )}

              {activeTab === "guru_jadwal" && userSession.role === "guru" && (
                <GuruJadwalView userSession={userSession} />
              )}

              {activeTab === "change_password" && (
                <ChangePasswordView />
              )}

              {["siswa_stats", "siswa_barcode", "siswa_history"].includes(activeTab) && (
                <SiswaDashboardView userSession={userSession} activeTab={activeTab} />
              )}
            </motion.div>
          </AnimatePresence>
          </Suspense>
          </ErrorBoundary>
        </main>
      </div>
    </div>

    {/* Confirmation Modal for Log Out */}
    <ConfirmationModal
      isOpen={isLogoutConfirmOpen}
      onClose={() => setIsLogoutConfirmOpen(false)}
      onConfirm={async () => {
        try {
          await supabase.auth.signOut();
        } catch (e) {
          console.error("signOut error:", e);
        }
        setUserSession(null);
        setActiveTab("stats");
        setOpenGroups({ manajemen: false, pengaturan: false });
        setIsLogoutConfirmOpen(false);
      }}
      title="Keluar dari Aplikasi?"
      message="Apakah Anda yakin ingin keluar dari sistem Nineteen Space?"
      confirmText="Ya, Keluar"
      cancelText="Batal"
      type="warning"
    />

    {/* Profile Detail Popup */}
    <AnimatePresence>
      {showProfilePopup && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" style={{ pointerEvents: 'auto' }}>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-brand-950/60 backdrop-blur-sm"
            onClick={() => setShowProfilePopup(false)}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 16 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="relative bg-white rounded-3xl shadow-2xl border border-brand-100 w-full max-w-sm p-8 text-center z-10"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            <button
              onClick={() => setShowProfilePopup(false)}
              className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Photo */}
            <div className="flex justify-center mb-5">
              {userSession.foto_url && !headerImgFailed ? (
                <img
                  src={userSession.foto_url}
                  onError={() => setHeaderImgFailed(true)}
                  className="w-[180px] h-[240px] rounded-2xl object-cover border-2 border-brand-100 shadow-lg"
                  alt={userSession.fullName}
                />
              ) : (
                <div className="w-[180px] h-[240px] rounded-2xl bg-gradient-to-tr from-accent-500 to-amber-400 border-2 border-brand-100 flex items-center justify-center shadow-lg">
                  <span className="text-white font-black text-4xl uppercase tracking-tight">
                    {userSession.fullName.slice(0, 2)}
                  </span>
                </div>
              )}
            </div>

            {/* Name */}
            <h2 className="text-lg font-black text-brand-950 mb-2">{toSentenceCase(userSession.fullName)}</h2>

            {/* Role Badge */}
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-50 border border-brand-100 text-brand-700 text-xs font-bold uppercase tracking-wide mb-5">
              <ShieldCheck className="w-3.5 h-3.5" />
              {userSession.role === "siswa" ? "Murid" : userSession.role.replace("_", " ")}
            </span>

            {/* Identifier */}
            <div className="bg-brand-50/70 border border-brand-100 rounded-2xl p-4">
              <p className="text-[10px] text-brand-400 font-bold uppercase tracking-widest mb-1">
                {userSession.role === "siswa" ? "NIS" : userSession.role === "piket" ? "Email" : "NIP"}
              </p>
              <p className="text-base font-black text-brand-900 tracking-wide">
                {userSession.role === "siswa"
                  ? userSession.nis || userSession.email.split("@")[0]
                  : userSession.email.split("@")[0]}
              </p>
            </div>

            {/* Theme Selector */}
            <div className="mt-6 pt-5 border-t border-slate-100 space-y-3">
              <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest text-left">Pilih Warna Tema</p>
              <div className="flex items-center justify-between gap-2">
                {THEMES.map((theme) => {
                  const isActive = activeTheme === theme.id;
                  return (
                    <button
                      key={theme.id}
                      onClick={() => applyTheme(theme.id)}
                      className={`w-7 h-7 rounded-full cursor-pointer transition-all border-2 relative flex items-center justify-center ${
                        isActive ? "border-slate-800 scale-110 shadow-sm" : "border-transparent hover:scale-105"
                      }`}
                      style={{ backgroundColor: theme.primary }}
                      title={theme.name}
                    >
                      {isActive && (
                        <Check className="w-3 h-3 text-white" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>

    {/* Akhiri Aktivitas Modal */}
    <AkhiriAktivitasModal
      isOpen={isAkhiriAktivitasOpen}
      onClose={() => setIsAkhiriAktivitasOpen(false)}
      onResetComplete={() => setHistoryRefreshCount((c) => c + 1)}
    />

    {/* Export Summary Modal */}
    <ExportSummaryModal
      isOpen={isExportSummaryOpen}
      onClose={() => setIsExportSummaryOpen(false)}
    />

    {/* Import Summary Modal */}
    <ImportSummaryModal
      isOpen={isImportSummaryOpen}
      onClose={() => setIsImportSummaryOpen(false)}
      onComplete={() => setHistoryRefreshCount((c) => c + 1)}
    />
    </>
  );
}
