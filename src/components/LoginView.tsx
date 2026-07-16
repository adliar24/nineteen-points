import React, { useState } from "react";
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

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError("Silakan masukkan username dan password.");
      return;
    }

    setIsLoading(true);
    setError("");

    let loginEmail = email.trim();
    if (!loginEmail.includes("@")) {
      loginEmail = `${loginEmail}@auth.local`;
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
          .single();

        if (profileError) {
          console.error("Profile fetch error:", profileError);
          // Fallback if profile row is not yet created but Auth is successful
          const session: UserSession = {
            email: data.user.email || loginEmail,
            fullName: data.user.user_metadata?.fullName || loginEmail.split("@")[0].toUpperCase(),
            role: data.user.user_metadata?.role || "guru",
            nis: data.user.user_metadata?.nis,
            foto_url: data.user.user_metadata?.foto_url || undefined,
          };
          onLoginSuccess(session);
        } else {
          let fotoUrl = profile.foto_url || undefined;

          // For students, also try fetching foto_url from the siswa table (more reliable)
          if (profile.role === "siswa" && profile.nis) {
            const { data: siswaData } = await supabase
              .from("siswa")
              .select("foto_url")
              .eq("nis", profile.nis)
              .single();
            if (siswaData?.foto_url) {
              fotoUrl = siswaData.foto_url;
            }
          }

          const session: UserSession = {
            email: profile.email,
            fullName: profile.nama,
            role: profile.role,
            nis: profile.nis || undefined,
            foto_url: fotoUrl,
          };
          onLoginSuccess(session);
        }
      }
    } catch (err: any) {
      setError("Terjadi kesalahan koneksi ke Supabase.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#faf9ff] px-4 py-12 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Dynamic wavy gradient background patterns */}
      <div className="absolute top-0 right-0 w-[45rem] h-[45rem] bg-gradient-to-br from-brand-500/20 to-accent-500/10 rounded-full filter blur-3xl translate-x-1/3 -translate-y-1/3 pointer-events-none"></div>
      <div className="absolute bottom-0 left-0 w-[45rem] h-[45rem] bg-gradient-to-tr from-accent-500/10 to-brand-600/15 rounded-full filter blur-3xl -translate-x-1/3 translate-y-1/3 pointer-events-none"></div>

      <div className="absolute top-0 inset-x-0 h-48 bg-gradient-to-b from-brand-600/10 to-transparent pointer-events-none"></div>

      <motion.div 
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.75, ease: [0.16, 1, 0.3, 1] }}
        className="max-w-md w-full space-y-8 z-10"
      >
        <div className="text-center">
          <motion.div 
            initial={{ scale: 0.7, opacity: 0, rotate: -10 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            transition={{ delay: 0.15, duration: 0.6, type: "spring", stiffness: 200 }}
            className="mx-auto h-20 w-20 flex items-center justify-center relative"
          >
            <img src="/logo.png" className="w-full h-full object-contain z-10" alt="Logo" />
          </motion.div>
          <h2 className="mt-6 text-3xl font-extrabold tracking-tight text-brand-900 font-sans bg-gradient-to-r from-brand-700 to-accent-600 bg-clip-text text-transparent">
            NineTeen Points
          </h2>
          <p className="mt-2 text-sm font-medium text-brand-600">
            Manajemen Poin & Karakter Siswa SMAN 19 Bandung
          </p>
        </div>

        <motion.div 
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.25, duration: 0.6 }}
          className="bg-white/95 backdrop-blur-md p-8 rounded-3xl shadow-2xl shadow-brand-900/5 border border-brand-100"
        >
          <form className="space-y-5" onSubmit={handleLogin}>
            {error && (
              <motion.div 
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="p-4 bg-rose-50 rounded-2xl border border-rose-100 text-sm text-rose-700 flex items-start gap-3 glow-purple"
              >
                <ShieldAlert className="w-5 h-5 flex-shrink-0 text-rose-500 mt-0.5" />
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
                  placeholder="NIS, NIP, atau Email"
                  className="block w-full pl-12 pr-4 py-3.5 border border-brand-100 rounded-2xl bg-brand-50/30 text-brand-900 placeholder-brand-500/30 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all text-sm font-medium"
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
                  className="block w-full pl-12 pr-12 py-3.5 border border-brand-100 rounded-2xl bg-brand-50/30 text-brand-900 placeholder-brand-500/30 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all text-sm font-medium"
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
              className="w-full flex justify-center py-3.5 px-4 rounded-2xl text-sm font-bold text-white brand-gradient hover:opacity-95 shadow-lg shadow-brand-500/25 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer mt-2"
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


        </motion.div>

        <p className="text-center text-[11px] font-semibold text-brand-500/60 tracking-wider">
          &copy; {new Date().getFullYear()} SMAN 19 Bandung. Hak Cipta Dilindungi.
        </p>
      </motion.div>
    </div>
  );
}
