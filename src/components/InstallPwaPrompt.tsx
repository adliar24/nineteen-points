import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Download, X, Smartphone, Monitor, Share, PlusSquare, CheckCircle2 } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function InstallPwaPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    const isStandaloneMedia = window.matchMedia("(display-mode: standalone)").matches;
    const isStandaloneNav = (navigator as any).standalone === true;
    const isSavedInstalled = localStorage.getItem("nineteen_pwa_installed") === "true";
    return isStandaloneMedia || isStandaloneNav || isSavedInstalled;
  });
  const [isDismissed, setIsDismissed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return (
      localStorage.getItem("nineteen_pwa_dismissed") === "true" ||
      localStorage.getItem("nineteen_pwa_installed") === "true"
    );
  });
  const [showIosGuide, setShowIosGuide] = useState<boolean>(false);
  const [isIos, setIsIos] = useState<boolean>(false);

  useEffect(() => {
    // Check if running as PWA (standalone)
    const checkStandalone = () => {
      const isStandaloneMedia = window.matchMedia("(display-mode: standalone)").matches;
      const isStandaloneNav = (navigator as any).standalone === true;
      const isSavedInstalled = localStorage.getItem("nineteen_pwa_installed") === "true";
      return isStandaloneMedia || isStandaloneNav || isSavedInstalled;
    };

    if (checkStandalone()) {
      setIsStandalone(true);
      try {
        localStorage.setItem("nineteen_pwa_installed", "true");
        localStorage.setItem("nineteen_pwa_dismissed", "true");
      } catch {}
      return;
    }

    // Detect iOS
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIos(isIosDevice);

    // Listen for beforeinstallprompt event
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    // Listen for appinstalled event
    const handleAppInstalled = () => {
      setIsStandalone(true);
      setDeferredPrompt(null);
      try {
        localStorage.setItem("nineteen_pwa_installed", "true");
        localStorage.setItem("nineteen_pwa_dismissed", "true");
      } catch {}
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const handleDismiss = () => {
    setIsDismissed(true);
    try {
      localStorage.setItem("nineteen_pwa_dismissed", "true");
    } catch {}
  };

  // If app is already installed in standalone mode or user dismissed prompt, hide banner
  if (isStandalone || isDismissed) {
    return null;
  }

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const choiceResult = await deferredPrompt.userChoice;
        if (choiceResult.outcome === "accepted") {
          setIsStandalone(true);
          try {
            localStorage.setItem("nineteen_pwa_installed", "true");
            localStorage.setItem("nineteen_pwa_dismissed", "true");
          } catch {}
        }
        setDeferredPrompt(null);
      } catch (err) {
        console.error("Error triggering install prompt:", err);
      }
    } else if (isIos) {
      setShowIosGuide(true);
    } else {
      // Fallback if browser doesn't support beforeinstallprompt directly but isn't iOS
      alert(
        "Untuk menginstall aplikasi ini:\n1. Buka menu opsi browser (tiga titik di kanan atas/bawah).\n2. Pilih 'Install Aplikasi' atau 'Tambahkan ke Layar Utama'."
      );
    }
  };

  return (
    <>
      <AnimatePresence>
        {!isDismissed && (
          <motion.div
            initial={{ opacity: 0, y: 60, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 350, damping: 25 }}
            className="fixed bottom-4 left-4 right-4 md:left-auto md:right-6 md:max-w-md z-[9999] pointer-events-auto"
          >
            <div className="relative overflow-hidden rounded-2xl bg-white/95 backdrop-blur-md p-4 sm:p-5 shadow-2xl border border-brand-200/80 shadow-brand-900/15">
              {/* Top Accent Gradient Bar */}
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-brand-600 via-accent-500 to-brand-500" />

              <button
                onClick={handleDismiss}
                className="absolute top-3 right-3 p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                title="Tutup notifikasi"
                aria-label="Close install prompt"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex items-start gap-3.5 sm:gap-4 pr-6">
                {/* Application Logo Icon matching Login Page Logo */}
                <div className="relative flex-none w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-white border border-brand-100 shadow-md p-1.5 flex items-center justify-center overflow-hidden">
                  <img
                    src="/logo-192.png"
                    alt="Logo Nineteen Space"
                    className="w-full h-full object-contain rounded-lg"
                  />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <h4 className="text-sm sm:text-base font-extrabold text-brand-950 truncate">
                      Nineteen Space
                    </h4>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-brand-100 text-brand-800 border border-brand-200">
                      <Download className="w-3 h-3" /> App
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Install aplikasi di HP, Tablet, atau Laptop Anda untuk akses instan &amp; cepat tanpa membuka browser.
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="mt-3.5 pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  onClick={handleDismiss}
                  className="px-3.5 py-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                >
                  Nanti Saja
                </button>
                <button
                  onClick={handleInstallClick}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-gradient-to-r from-brand-600 to-accent-600 hover:from-brand-700 hover:to-accent-700 active:scale-95 rounded-xl shadow-md shadow-brand-600/25 transition-all cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  Install Sekarang
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* iOS Installation Guide Modal */}
      <AnimatePresence>
        {showIosGuide && (
          <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-brand-100 relative"
            >
              <button
                onClick={() => setShowIosGuide(false)}
                className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-2xl bg-brand-50 border border-brand-100 p-2 flex items-center justify-center">
                  <img src="/logo-192.png" alt="Logo" className="w-full h-full object-contain rounded-lg" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900">Install di iOS / Safari</h3>
                  <p className="text-xs text-slate-500">Nineteen Space SMAN 19</p>
                </div>
              </div>

              <div className="space-y-3 text-xs text-slate-600 mb-6 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                <div className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-brand-600 text-white flex items-center justify-center font-bold text-[10px] flex-none mt-0.5">
                    1
                  </span>
                  <p>
                    Tekan tombol <span className="font-bold text-slate-800">Bagikan (Share)</span> <Share className="w-3.5 h-3.5 inline text-brand-600 mx-0.5" /> di menu bagian bawah browser Safari.
                  </p>
                </div>
                <div className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-brand-600 text-white flex items-center justify-center font-bold text-[10px] flex-none mt-0.5">
                    2
                  </span>
                  <p>
                    Gulir ke bawah pada daftar opsi dan pilih <span className="font-bold text-slate-800">"Tambah ke Layar Utama" (Add to Home Screen)</span> <PlusSquare className="w-3.5 h-3.5 inline text-brand-600 mx-0.5" />.
                  </p>
                </div>
                <div className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-brand-600 text-white flex items-center justify-center font-bold text-[10px] flex-none mt-0.5">
                    3
                  </span>
                  <p>
                    Tekan tombol <span className="font-bold text-slate-800">"Tambah"</span> di sudut kanan atas layar HP Anda.
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowIosGuide(false)}
                className="w-full py-2.5 bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold rounded-xl shadow-md transition-colors cursor-pointer"
              >
                Saya Mengerti
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
