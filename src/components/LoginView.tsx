import React, { useEffect, useState } from "react";
import { LogIn, Key, Mail, ShieldAlert, School, Eye, EyeOff } from "lucide-react";
import { motion } from "motion/react";
import { UserSession } from "../types";
import { supabase } from "../supabaseClient";

interface LoginViewProps {
  onLoginSuccess: (session: UserSession) => void;
}

export default function LoginView({ onLoginSuccess }: LoginViewProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    const html = document.documentElement;
    html.setAttribute("lang", "id");
    html.setAttribute("translate", "no");
    html.classList.add("notranslate");
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError("Silakan masukkan username dan password.");
      return;
    }

    setIsLoading(true);
    setError("");

    let rawInput = email.trim();
    const rawLower = rawInput.toLowerCase();

    // Resolusi username: mendukung NIS, username alternatif (dari nama), NIP, atau email penuh.
    const hasAt = rawLower.includes("@");
    const searchKey = hasAt ? rawLower.split("@")[0].trim() : rawLower.trim();

    let loginEmail = hasAt ? rawLower : `${searchKey}@sman19.sch.id`;

    if (searchKey) {
      try {
        const { data: resolvedNis, error: resolveError } = await supabase.rpc("resolve_login", {
          p_login: searchKey,
        });
        if (!resolveError && resolvedNis) {
          loginEmail = `${resolvedNis}@sman19.sch.id`;
        }
      } catch {
        // fungsi resolve_login belum tersedia di DB — pakai fallback standard
      }
    }

    try {
      // 1. Authenticate with Supabase Auth using multi-candidate fallback
      const candidateEmails = Array.from(
        new Set([
          loginEmail,
          `${searchKey}@sman19.sch.id`,
          hasAt ? rawLower : `${rawLower}@sman19.sch.id`,
        ])
      );

      let authRes: any = null;
      for (const candEmail of candidateEmails) {
        authRes = await supabase.auth.signInWithPassword({
          email: candEmail,
          password,
        });
        if (!authRes.error) break;
      }

      const data = authRes?.data;
      const authError = authRes?.error;

      if (authError) {
        setError(authError.message || "Email/Username atau password salah.");
        setIsLoading(false);
        return;
      }

      if (data?.user) {
        // 2. Fetch profile from public.profiles table
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", data.user.id)
          .maybeSingle();

        if (profile) {
          let fotoUrl = profile.foto_url || undefined;
          let fullName = profile.nama;
          let nis = profile.nis || undefined;

          // For students, ensure fullName, NIS, and foto_url match the student's row in 'siswa' table
          if (profile.role === "siswa") {
            const emailPrefix = profile.email ? profile.email.split("@")[0] : "";
            
            // Search in 'siswa' table by NIS, profile.nis, or username
            let { data: siswaData } = await supabase
              .from("siswa")
              .select("*")
              .eq("nis", emailPrefix)
              .maybeSingle();

            if (!siswaData && profile.nis) {
              const { data: sByProfileNis } = await supabase
                .from("siswa")
                .select("*")
                .eq("nis", profile.nis)
                .maybeSingle();
              siswaData = sByProfileNis;
            }

            if (!siswaData && emailPrefix) {
              const { data: sByUsername } = await supabase
                .from("siswa")
                .select("*")
                .eq("username", emailPrefix)
                .maybeSingle();
              siswaData = sByUsername;
            }

            if (siswaData) {
              fullName = siswaData.nama;
              nis = siswaData.nis;
              if (siswaData.foto_url) {
                fotoUrl = siswaData.foto_url;
              }
              // Auto-heal profiles table if profiles.nama or profiles.nis was outdated
              if (profile.nama !== siswaData.nama || profile.nis !== siswaData.nis) {
                supabase
                  .from("profiles")
                  .update({ nama: siswaData.nama, nis: siswaData.nis })
                  .eq("id", profile.id)
                  .then(() => {});
              }
            }
          }

          const session: UserSession = {
            id: profile.id,
            email: profile.email,
            fullName: fullName,
            role: profile.role,
            nis: nis,
            foto_url: fotoUrl,
          };
          onLoginSuccess(session);
        } else {
          // Fallback lookup by email in profiles if user ID didn't match directly
          const { data: profileByEmail } = await supabase
            .from("profiles")
            .select("*")
            .eq("email", loginEmail)
            .maybeSingle();

          if (profileByEmail) {
            let fotoUrl = profileByEmail.foto_url || undefined;
            let fullName = profileByEmail.nama;
            let nis = profileByEmail.nis || undefined;

            if (profileByEmail.role === "siswa") {
              const emailPrefix = profileByEmail.email ? profileByEmail.email.split("@")[0] : "";
              let { data: siswaData } = await supabase
                .from("siswa")
                .select("*")
                .eq("nis", emailPrefix)
                .maybeSingle();

              if (!siswaData && profileByEmail.nis) {
                const { data: sByNis } = await supabase
                  .from("siswa")
                  .select("*")
                  .eq("nis", profileByEmail.nis)
                  .maybeSingle();
                siswaData = sByNis;
              }

              if (siswaData) {
                fullName = siswaData.nama;
                nis = siswaData.nis;
                if (siswaData.foto_url) {
                  fotoUrl = siswaData.foto_url;
                }
              }
            }

            const session: UserSession = {
              id: profileByEmail.id,
              email: profileByEmail.email,
              fullName: fullName,
              role: profileByEmail.role,
              nis: nis,
              foto_url: fotoUrl,
            };
            onLoginSuccess(session);
          } else {
            // Default fallback if profile row doesn't exist yet
            const username = loginEmail.split("@")[0];
            let fullName = data.user.user_metadata?.fullName || rawInput.toUpperCase();
            let nis = data.user.user_metadata?.nis || username;
            let fotoUrl = data.user.user_metadata?.foto_url || undefined;

            const { data: siswaData } = await supabase
              .from("siswa")
              .select("*")
              .eq("nis", username)
              .maybeSingle();

            if (siswaData) {
              fullName = siswaData.nama;
              nis = siswaData.nis;
              if (siswaData.foto_url) {
                fotoUrl = siswaData.foto_url;
              }
            }

            const session: UserSession = {
              id: data.user.id,
              email: data.user.email || loginEmail,
              fullName: fullName,
              role: data.user.user_metadata?.role || "siswa",
              nis: nis,
              foto_url: fotoUrl,
            };
            onLoginSuccess(session);
          }
        }
      }
    } catch (err: any) {
      setError("Terjadi kesalahan koneksi ke Supabase.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col justify-start sm:justify-between items-center bg-[#faf9ff] px-4 py-4 sm:py-6 sm:px-6 lg:px-8 relative overflow-hidden notranslate select-none">
      {/* ===== Dynamic Harmonized Animated SVG Waves (Theme Variable Driven) ===== */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0 filter blur-[4px] sm:blur-[6px] scale-105">
        {/* Layer 1: Top Back Wave (Accent/Brand gradient) */}
        <div className="absolute left-0 bottom-0 w-[400%] sm:w-[250%] lg:w-[200%] min-w-[1400px] sm:min-w-[2400px] h-full animate-wave-slow opacity-35">
          <svg viewBox="0 0 5760 1000" className="w-full h-full" preserveAspectRatio="none">
            <path
              d="M 0,350 C 400,260 1040,260 1440,350 C 1840,440 2480,440 2880,350 C 3280,260 3920,260 4320,350 C 4720,440 5360,440 5760,350 L 5760,1000 L 0,1000 Z"
              fill="url(#brandWaveGrad1)"
            />
            <defs>
              <linearGradient id="brandWaveGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="var(--color-accent-500, #d946ef)" />
                <stop offset="100%" stopColor="var(--color-brand-500, #8b5cf6)" />
              </linearGradient>
            </defs>
          </svg>
        </div>

        {/* Layer 2: Upper Middle Wave */}
        <div className="absolute left-0 bottom-0 w-[400%] sm:w-[250%] lg:w-[200%] min-w-[1400px] sm:min-w-[2400px] h-full animate-wave-mid opacity-45">
          <svg viewBox="0 0 5760 1000" className="w-full h-full" preserveAspectRatio="none">
            <path
              d="M 0,470 C 400,555 1040,555 1440,470 C 1840,385 2480,385 2880,470 C 3280,555 3920,555 4320,470 C 4720,385 5360,385 5760,470 L 5760,1000 L 0,1000 Z"
              fill="url(#brandWaveGrad2)"
            />
            <defs>
              <linearGradient id="brandWaveGrad2" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="var(--color-brand-500, #a855f7)" />
                <stop offset="100%" stopColor="var(--color-brand-600, #6d28d9)" />
              </linearGradient>
            </defs>
          </svg>
        </div>

        {/* Layer 3: Lower Middle Wave */}
        <div className="absolute left-0 bottom-0 w-[400%] sm:w-[250%] lg:w-[200%] min-w-[1400px] sm:min-w-[2400px] h-full animate-wave-fast opacity-55">
          <svg viewBox="0 0 5760 1000" className="w-full h-full" preserveAspectRatio="none">
            <path
              d="M 0,590 C 400,510 1040,510 1440,590 C 1840,670 2480,670 2880,590 C 3280,510 3920,510 4320,590 C 4720,670 5360,670 5760,590 L 5760,1000 L 0,1000 Z"
              fill="url(#brandWaveGrad3)"
            />
            <defs>
              <linearGradient id="brandWaveGrad3" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="var(--color-brand-600, #7c3aed)" />
                <stop offset="100%" stopColor="var(--color-brand-700, #5b21b6)" />
              </linearGradient>
            </defs>
          </svg>
        </div>

        {/* Layer 4: Bottom Wave (Wide Sweeping Wave in Deep Theme Color) */}
        <div className="absolute left-0 bottom-0 w-[400%] sm:w-[250%] lg:w-[200%] min-w-[1400px] sm:min-w-[2400px] h-full animate-wave-bottom opacity-65">
          <svg viewBox="0 0 5760 1000" className="w-full h-full" preserveAspectRatio="none">
            <path
              d="M 0,710 C 400,785 1040,785 1440,710 C 1840,635 2480,635 2880,710 C 3280,785 3920,785 4320,710 C 4720,635 5360,635 5760,710 L 5760,1000 L 0,1000 Z"
              fill="url(#brandWaveGrad4)"
            />
            <defs>
              <linearGradient id="brandWaveGrad4" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="var(--color-brand-700, #5b21b6)" />
                <stop offset="100%" stopColor="var(--color-brand-800, #3b0764)" />
              </linearGradient>
            </defs>
          </svg>
        </div>
      </div>

      {/* Decorative Blur Orbs */}
      <div className="absolute top-0 right-0 w-[45rem] h-[45rem] bg-gradient-to-br from-brand-500/20 to-accent-500/15 rounded-full filter blur-3xl translate-x-1/3 -translate-y-1/3 pointer-events-none z-0"></div>
      <div className="absolute bottom-0 left-0 w-[45rem] h-[45rem] bg-gradient-to-tr from-accent-500/15 to-brand-600/20 rounded-full filter blur-3xl -translate-x-1/3 translate-y-1/3 pointer-events-none z-0"></div>

      {/* ===== LAYER 1: Header Logo & Title (Raised 100px) ===== */}
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-md mx-auto text-center pt-[40px] sm:pt-[30px] z-20 relative"
      >
        <motion.div 
          initial={{ scale: 0.7, opacity: 0, rotate: -10 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          transition={{ delay: 0.1, duration: 0.5, type: "spring", stiffness: 200 }}
          className="mx-auto h-20 w-20 sm:h-24 sm:w-24 flex items-center justify-center relative filter drop-shadow-md"
        >
          <img src="/logo-crest.png" className="w-full h-full object-contain" alt="Logo SMAN 19 Bandung" />
        </motion.div>
        <h1 className="mt-3 sm:mt-4 text-2xl sm:text-3xl font-extrabold tracking-tight text-brand-900 font-sans bg-gradient-to-r from-brand-700 to-accent-600 bg-clip-text text-transparent">
          Nineteen Space
        </h1>
        <p className="mt-1 text-xs sm:text-sm font-semibold text-brand-700 px-2 drop-shadow-sm">
          Manajemen Poin & Karakter Murid SMAN 19 Bandung
        </p>
      </motion.header>

      {/* ===== LAYER 2: Main Papan Login Card (Raised 100px) ===== */}
      <div className="w-full flex-none sm:flex-1 flex items-center justify-center mt-12 sm:-mt-24 py-2 z-10 relative">
        <motion.main
          initial={{ opacity: 0, scale: 0.96, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="max-w-md w-full"
        >
          <div className="bg-white/95 backdrop-blur-md p-6 sm:p-8 rounded-2xl sm:rounded-3xl shadow-2xl shadow-brand-900/10 border border-brand-100">
            <form className="space-y-4 sm:space-y-5" onSubmit={handleLogin} autoComplete="off">
              {error && (
                <motion.div 
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="p-3.5 sm:p-4 bg-rose-50 rounded-2xl border border-rose-100 text-xs sm:text-sm text-rose-700 flex items-start gap-3 glow-purple"
                >
                  <ShieldAlert className="w-4.5 h-4.5 sm:w-5 sm:h-5 flex-shrink-0 text-rose-500 mt-0.5" />
                  <span className="font-medium text-xs leading-relaxed">{error}</span>
                </motion.div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-brand-700 uppercase tracking-wider block">
                  Username / NIS / NIP
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Mail className="h-5 w-5 text-brand-500/70" />
                  </div>
                  <input
                    type="text"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="NIS, NIP, Nama, atau Email"
                    autoComplete="off"
                    data-form-type="other"
                    className="block w-full pl-12 pr-4 py-3 sm:py-3.5 border border-brand-100 rounded-2xl bg-brand-50/30 text-brand-900 placeholder-brand-500/30 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all text-sm font-medium"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold text-brand-700 uppercase tracking-wider block">
                    Password
                  </label>
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Key className="h-5 w-5 text-brand-500/70" />
                  </div>
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="off"
                    data-form-type="other"
                    className="block w-full pl-12 pr-12 py-3 sm:py-3.5 border border-brand-100 rounded-2xl bg-brand-50/30 text-brand-900 placeholder-brand-500/30 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all text-sm font-medium"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-4 flex items-center text-brand-500/70 hover:text-brand-600 transition-colors cursor-pointer"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              <motion.button
                whileHover={{ scale: 1.015, y: -1 }}
                whileTap={{ scale: 0.985 }}
                type="submit"
                disabled={isLoading}
                className="w-full flex justify-center py-3 sm:py-3.5 px-4 rounded-2xl text-sm font-bold text-white brand-gradient hover:opacity-95 shadow-lg shadow-brand-500/25 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer mt-2"
              >
                {isLoading ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <div className="flex items-center gap-2 tracking-wide font-sans">
                    <LogIn className="w-4.5 h-4.5" />
                    Masuk
                  </div>
                )}
              </motion.button>
            </form>
          </div>
        </motion.main>
      </div>

      {/* ===== LAYER 3: Footer Copyright (Elevated Higher Up for Mobile) ===== */}
      <footer className="w-full max-w-md mx-auto text-center pb-6 sm:pb-12 mt-8 sm:-mt-8 pt-1 shrink-0 z-20 relative">
        <p className="text-[10px] sm:text-xs font-bold text-white drop-shadow-[0_1.5px_3px_rgba(0,0,0,0.6)] tracking-wider">
          &copy; {new Date().getFullYear()} SMAN 19 Bandung. Hak Cipta Dilindungi.
        </p>
      </footer>
    </div>
  );
}
