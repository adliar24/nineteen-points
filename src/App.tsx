/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  School,
  LogOut,
  Users,
  Camera,
  Calendar,
  Settings,
  Menu,
  X,
  ShieldCheck,
  Award,
  TrendingUp,
  CreditCard
} from "lucide-react";
import { UserSession } from "./types";
import { getLocalStorage, setLocalStorage } from "./dbStore";
import { supabase, supabaseEnvError } from "./supabaseClient";

// View Imports
import LoginView from "./components/LoginView";
import StatsView from "./components/StatsView";
import InputPoinView from "./components/InputPoinView";
import KelolaSiswaView from "./components/KelolaSiswaView";
import HistoryView from "./components/HistoryView";
import MasterPoinView from "./components/MasterPoinView";
import SiswaDashboardView from "./components/SiswaDashboardView";
import KelolaPenggunaView from "./components/KelolaPenggunaView";
import ConfirmationModal from "./components/ConfirmationModal";

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
  
  const [activeTab, setActiveTab] = useState<string>(() => {
    return getLocalStorage<string>("19points_active_tab", "stats");
  });

  const [historyRefreshCount, setHistoryRefreshCount] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);

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

  useEffect(() => {
    setLocalStorage("19points_active_tab", activeTab);
  }, [activeTab]);

  useEffect(() => {
    if (userSession) {
      if (userSession.role === "siswa") {
        if (!["siswa_stats", "siswa_barcode", "siswa_history"].includes(activeTab)) {
          setActiveTab("siswa_stats");
        }
      } else if (userSession.role === "piket") {
        if (!["input", "history"].includes(activeTab)) {
          setActiveTab("input");
        }
      } else {
        if (!["stats", "input", "students", "history", "rules", "users"].includes(activeTab)) {
          setActiveTab("stats");
        }
      }
    }
  }, [userSession, activeTab]);

  const handleLogout = () => {
    setIsLogoutConfirmOpen(true);
  };

  if (!userSession) {
    return <LoginView onLoginSuccess={(session) => setUserSession(session)} />;
  }

  // Construct Dynamic Nav Items based on user role
  let navItems = [
    { id: "stats", label: "Statistik Poin", icon: TrendingUp, description: "Ikhtisar & analisis grafik" },
    { id: "input", label: "Input Poin", icon: Camera, description: "Catat via QR atau pencarian" },
    { id: "students", label: "Kelola Siswa", icon: Users, description: "Database & kartu pelajar" },
    { id: "history", label: "Riwayat Poin", icon: Calendar, description: "Audit trail pencatatan" },
    { id: "rules", label: "Pengaturan Poin", icon: Settings, description: "Atur sanksi & prestasi" },
  ];

  if (userSession.role === "piket") {
    navItems = [
      { id: "input", label: "Input Poin", icon: Camera, description: "Catat via QR atau pencarian" },
      { id: "history", label: "Riwayat Poin", icon: Calendar, description: "Audit trail pencatatan" },
    ];
  } else if (userSession.role === "super_admin") {
    navItems.push({
      id: "users",
      label: "Kelola Akun",
      icon: ShieldCheck,
      description: "Atur akun guru & siswa"
    });
  } else if (userSession.role === "siswa") {
    navItems = [
      { id: "siswa_stats", label: "Statistik", icon: TrendingUp, description: "Statistik poin Anda" },
      { id: "siswa_barcode", label: "Kartu Pelajar", icon: CreditCard, description: "QR Kartu Pelajar Digital" },
      { id: "siswa_history", label: "Riwayat Poin", icon: Calendar, description: "Riwayat perolehan poin" },
    ];
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className="min-h-screen bg-[#faf9ff] text-[#1e1b4b] flex flex-row font-sans overflow-hidden w-full"
    >
      
      {/* Navigation Sidebar (Desktop - Very Left Edge) */}
      <nav className="hidden md:flex flex-col w-68 flex-shrink-0 bg-gradient-to-b from-brand-800 via-brand-700 to-brand-800 text-white h-screen sticky top-0 border-r border-brand-600 shadow-2xl wave-bg p-6 justify-between rounded-r-[32px] z-30">
        <div className="space-y-6">
          {/* Branding inside Sidebar */}
          <div className="flex items-center gap-2.5 pb-4 border-b border-brand-800/60">
            <img src="/logo.png" className="w-9 h-9 object-contain" alt="Logo" />
            <div>
              <h4 className="text-sm font-black tracking-tight text-white uppercase">SMAN 19 Bandung</h4>
              <p className="text-[11px] text-accent-400 font-black uppercase tracking-wider">NineTeen Points</p>
            </div>
          </div>

          <div className="text-xs font-black text-accent-300 uppercase tracking-widest px-2">
            MENU UTAMA
          </div>
          
          <div className="space-y-1 relative">
            {navItems.map((item) => {
              const IconComponent = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full text-left px-4 py-3.5 rounded-2xl flex items-center gap-3 transition-all relative overflow-hidden group cursor-pointer ${
                    isActive ? "text-brand-800 font-bold bg-white shadow-md shadow-brand-950/10 border border-white" : "text-brand-200/85 hover:text-white hover:bg-white/5"
                  }`}
                >
                  <IconComponent className={`w-4.5 h-4.5 flex-shrink-0 ${isActive ? "text-brand-600" : "text-brand-300 group-hover:text-white transition-colors"}`} />
                  <span className="text-sm font-bold tracking-wide">{item.label}</span>
                </button>
              );
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
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto h-screen">
        
        {/* Top Banner/Header */}
        <header className="brand-gradient md:!bg-none md:!bg-transparent text-white md:text-[#1e1b4b] sticky top-0 z-40 shadow-xl shadow-brand-900/15 md:shadow-none wave-bg md:wave-bg-none md:relative md:border-b md:border-brand-100/50">
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

              {/* Branding (Mobile Only) */}
              <div className="flex md:hidden items-center gap-2 sm:gap-2.5">
                <img src="/logo.png" className="w-6.5 h-6.5 object-contain" alt="Logo" />
                <div>
                  <h4 className="text-sm sm:text-base font-black tracking-tight text-white font-sans">SMAN 19 Bandung</h4>
                  <p className="text-[11px] text-accent-300 font-black uppercase tracking-wider">NineTeen Points</p>
                </div>
              </div>
            </div>

            {/* Right profile header info */}
            <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
              <div className="flex items-center gap-2 sm:gap-3 bg-brand-950/40 md:bg-brand-50/70 pl-2 sm:pl-4 pr-1.5 py-1.5 rounded-2xl border border-white/10 md:border-brand-100 shadow-xs">
                <div className="text-right">
                  <p className="text-[11px] md:text-xs font-bold text-white md:!text-[#1e1b4b] tracking-wide whitespace-nowrap">{userSession.fullName}</p>
                  <div className="flex items-center justify-end gap-1 text-[9px] md:text-[10px] text-brand-200 md:!text-slate-500 font-extrabold uppercase tracking-widest mt-0.5">
                    <ShieldCheck className="w-2.5 h-2.5 text-accent-500" />
                    <span>{userSession.role.replace("_", " ")}</span>
                  </div>
                </div>
                <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-tr from-accent-500 to-amber-400 border border-white/30 md:border-brand-200/50 flex items-center justify-center font-bold text-xs uppercase text-white shadow-md relative">
                  {userSession.fullName.slice(0, 2)}
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Mobile Navigation Drawer Overlay (Only active on mobile when menu toggled) */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <div className="fixed inset-0 z-50 md:hidden flex">
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
                transition={{ type: "spring", damping: 25, stiffness: 220 }}
                className="relative w-80 max-w-[85vw] bg-gradient-to-b from-brand-800 via-brand-700 to-brand-800 text-white h-full shadow-2xl flex flex-col justify-between border-r border-brand-600 z-10 overflow-y-auto wave-bg rounded-r-[32px]"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Header Information */}
                <div className="p-6 border-b border-brand-800/60 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <img src="/logo.png" className="w-8 h-8 object-contain" alt="Logo" />
                    <div>
                      <h4 className="text-sm font-black tracking-tight text-white">SMAN 19 Bandung</h4>
                      <p className="text-[11px] text-accent-400 font-black uppercase tracking-wider">NineTeen Points</p>
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
                <div className="flex-1 py-6 px-4 space-y-1">
                  {navItems.map((item) => {
                    const IconComp = item.icon;
                    const isActive = activeTab === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => {
                          setActiveTab(item.id);
                          setMobileMenuOpen(false);
                        }}
                        className={`w-full text-left px-4 py-3 rounded-xl flex items-center gap-3 transition-all cursor-pointer relative overflow-hidden group ${
                          isActive
                            ? "bg-white text-brand-800 shadow-md shadow-brand-950/10 border border-white"
                            : "text-brand-200 hover:text-white hover:bg-white/5"
                        }`}
                      >
                        <IconComp className={`w-4.5 h-4.5 flex-shrink-0 ${isActive ? "text-brand-600" : "text-brand-400 group-hover:text-white"}`} />
                        <span className="text-sm font-bold tracking-wide">{item.label}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Drawer Footer Information */}
                <div className="p-6 border-t border-brand-800 bg-brand-950/40 flex flex-col gap-2">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => {
                      setMobileMenuOpen(false);
                      handleLogout();
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
        <main className="flex-1 p-6 md:p-8 max-w-7xl w-full mx-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.25, ease: "easeInOut" }}
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

              {["siswa_stats", "siswa_barcode", "siswa_history"].includes(activeTab) && (
                <SiswaDashboardView userSession={userSession} activeTab={activeTab} />
              )}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* Confirmation Modal for Log Out */}
      <ConfirmationModal
        isOpen={isLogoutConfirmOpen}
        onClose={() => setIsLogoutConfirmOpen(false)}
        onConfirm={async () => {
          await supabase.auth.signOut();
          setUserSession(null);
          setActiveTab("stats");
          setIsLogoutConfirmOpen(false);
        }}
        title="Keluar dari Aplikasi?"
        message="Apakah Anda yakin ingin keluar dari sistem NineTeen Points?"
        confirmText="Ya, Keluar"
        cancelText="Batal"
        type="warning"
      />
    </motion.div>
  );
}
