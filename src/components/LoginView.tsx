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
    let loginEmail = rawInput.toLowerCase();
    if (!loginEmail.includes("@")) {
      loginEmail = `${loginEmail}@sman19.sch.id`;
    }

    try {
      // 1. Authenticate with Supabase Auth
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password,
      });

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
            const username = profile.email.split("@")[0];
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
              const username = profileByEmail.email.split("@")[0];
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
    <div className="min-h-screen w-full relative overflow-hidden bg-gradient-to-br from-blue-900 via-blue-800 to-indigo-950 text-white flex flex-col justify-between p-6 sm:p-10 lg:p-12 notranslate select-none">
      {/* ===== Dynamic Harmonized Animated SVG Waves ===== */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
        {/* Layer 1: Top Back Wave (Deepest layer, slowest flow) */}
        <div className="absolute inset-x-0 bottom-0 w-[200%] h-full animate-wave-slow opacity-30">
          <svg viewBox="0 0 2880 1000" className="w-full h-full" preserveAspectRatio="none">
            <path
              d="M 0,320 C 200,240 520,240 720,320 C 920,400 1240,400 1440,320 C 1640,240 1960,240 2160,320 C 2360,400 2680,400 2880,320 L 2880,1000 L 0,1000 Z"
              fill="url(#waveGrad1)"
            />
            <defs>
              <linearGradient id="waveGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#3b82f6" />
                <stop offset="100%" stopColor="#1d4ed8" />
              </linearGradient>
            </defs>
          </svg>
        </div>

        {/* Layer 2: Upper Middle Wave */}
        <div className="absolute inset-x-0 bottom-0 w-[200%] h-full animate-wave-mid opacity-45">
          <svg viewBox="0 0 2880 1000" className="w-full h-full" preserveAspectRatio="none">
            <path
              d="M 0,440 C 200,365 520,365 720,440 C 920,515 1240,515 1440,440 C 1640,365 1960,365 2160,440 C 2360,515 2680,515 2880,440 L 2880,1000 L 0,1000 Z"
              fill="url(#waveGrad2)"
            />
            <defs>
              <linearGradient id="waveGrad2" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#60a5fa" />
                <stop offset="100%" stopColor="#2563eb" />
              </linearGradient>
            </defs>
          </svg>
        </div>

        {/* Layer 3: Lower Middle Wave */}
        <div className="absolute inset-x-0 bottom-0 w-[200%] h-full animate-wave-fast opacity-60">
          <svg viewBox="0 0 2880 1000" className="w-full h-full" preserveAspectRatio="none">
            <path
              d="M 0,560 C 200,490 520,490 720,560 C 920,630 1240,630 1440,560 C 1640,490 1960,490 2160,560 C 2360,630 2680,630 2880,560 L 2880,1000 L 0,1000 Z"
              fill="url(#waveGrad3)"
            />
            <defs>
              <linearGradient id="waveGrad3" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#2563eb" />
                <stop offset="100%" stopColor="#1d4ed8" />
              </linearGradient>
            </defs>
          </svg>
        </div>

        {/* Layer 4: Bottom Wave (Harmonized & Perfectly Synchronized with Upper Waves) */}
        <div className="absolute inset-x-0 bottom-0 w-[200%] h-full animate-wave-bottom opacity-85">
          <svg viewBox="0 0 2880 1000" className="w-full h-full" preserveAspectRatio="none">
            <path
              d="M 0,680 C 200,615 520,615 720,680 C 920,745 1240,745 1440,680 C 1640,615 1960,615 2160,680 C 2360,745 2680,745 2880,680 L 2880,1000 L 0,1000 Z"
              fill="url(#waveGrad4)"
            />
            <defs>
              <linearGradient id="waveGrad4" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#1d4ed8" />
                <stop offset="100%" stopColor="#1e3a8a" />
              </linearGradient>
            </defs>
          </svg>
        </div>
      </div>

      {/* ===== Header Navigation ===== */}
      <header className="relative z-10 flex items-center justify-between max-w-7xl mx-auto w-full">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 bg-white/15 backdrop-blur-md border border-white/30 rounded-2xl flex items-center justify-center shadow-lg">
            <School className="w-6 h-6 text-white" />
          </div>
          <span className="text-2xl font-bold tracking-tight font-sans text-white">
            EduVerse
          </span>
        </div>
      </header>

      {/* ===== Main Body (Split Layout: Text Left, Card Right) ===== */}
      <main className="relative z-10 grid grid-cols-1 lg:grid-cols-12 items-center gap-12 lg:gap-16 max-w-7xl mx-auto w-full my-auto py-8">
        {/* Left Side: Brand Text & Info */}
        <motion.div
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="lg:col-span-7 space-y-6 text-left"
        >
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.15] font-sans">
            Aplikasi Manajemen<br />
            Kelas & <span className="text-cyan-300 drop-shadow-md">Presensi Digital</span><br />
            Terpadu
          </h1>

          <p className="text-base sm:text-lg text-blue-100/90 font-medium max-w-2xl leading-relaxed">
            Kelola absensi murid (QR & Wajah), buku nilai, rekapitulasi, dan perangkat mengajar Anda secara terpadu.
          </p>
        </motion.div>

        {/* Right Side: Login Card */}
        <motion.div
          initial={{ opacity: 0, y: 30, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: 0.15, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="lg:col-span-5 w-full max-w-md mx-auto lg:ml-auto"
        >
          <div className="bg-white text-slate-800 p-8 sm:p-10 rounded-[32px] shadow-2xl shadow-blue-950/40 border border-white/60 relative overflow-hidden">
            {/* Top Back Link */}
            <div className="mb-6 flex items-center gap-1 text-xs font-semibold text-slate-400 hover:text-slate-600 transition-colors cursor-pointer">
              <span>‹ Kembali ke Pilihan</span>
            </div>

            {/* Card Header */}
            <div className="space-y-1.5 mb-7">
              <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight font-sans">
                Selamat Datang, Guru
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 font-medium leading-relaxed">
                Masuk untuk mengelola ujian, absensi, dan pengolahan nilai murid.
              </p>
            </div>

            {/* Login Form */}
            <form className="space-y-5" onSubmit={handleLogin} autoComplete="off">
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-3.5 bg-rose-50 rounded-2xl border border-rose-200 text-xs font-semibold text-rose-700 flex items-start gap-2.5"
                >
                  <ShieldAlert className="w-4.5 h-4.5 text-rose-500 flex-shrink-0 mt-0.5" />
                  <span className="leading-relaxed">{error}</span>
                </motion.div>
              )}

              {/* Username Input */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 block">
                  Email Akun
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Mail className="h-4.5 w-4.5 text-slate-400" />
                  </div>
                  <input
                    type="text"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="adlizers24@gmail.com"
                    autoComplete="off"
                    data-form-type="other"
                    className="block w-full pl-11 pr-4 py-3.5 border border-slate-200 rounded-2xl bg-slate-50/70 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white transition-all text-sm font-medium"
                  />
                </div>
              </div>

              {/* Password Input */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 block">
                  Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Key className="h-4.5 w-4.5 text-slate-400" />
                  </div>
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    autoComplete="off"
                    data-form-type="other"
                    className="block w-full pl-11 pr-11 py-3.5 border border-slate-200 rounded-2xl bg-slate-50/70 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white transition-all text-sm font-medium"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
                  </button>
                </div>
              </div>

              {/* Submit Button */}
              <motion.button
                whileHover={{ scale: 1.015 }}
                whileTap={{ scale: 0.985 }}
                type="submit"
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-2 py-3.5 px-6 rounded-2xl text-sm font-bold text-white bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 shadow-xl shadow-blue-600/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer mt-4"
              >
                {isLoading ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <>
                    <span>Masuk Sekarang</span>
                    <span className="text-base leading-none">→</span>
                  </>
                )}
              </motion.button>
            </form>
          </div>
        </motion.div>
      </main>

      {/* ===== Footer ===== */}
      <footer className="relative z-10 max-w-7xl mx-auto w-full text-left">
        <p className="text-xs font-medium text-blue-200/70 tracking-wide">
          © {new Date().getFullYear()} EduVerse. Dikelola Secara Mandiri.
        </p>
      </footer>
    </div>
  );
}
