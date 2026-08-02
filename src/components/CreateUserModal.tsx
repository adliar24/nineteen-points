import React, { useState, useMemo } from "react";
import { UserPlus, User, Key, Mail, School } from "lucide-react";
import { supabaseAdminAuth } from "../supabaseClient";
import { Siswa } from "../types";
import ModalPortal from "./ModalPortal";

interface CreateUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  studentsList: Siswa[];
}

export default function CreateUserModal({
  isOpen,
  onClose,
  onSuccess,
  studentsList,
}: CreateUserModalProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<"guru" | "kepala_sekolah" | "siswa" | "piket" | "tata_usaha">("guru");
  const [studentUsername, setStudentUsername] = useState("");
  const [selectedKelas, setSelectedKelas] = useState("X-A");
  const [customKelas, setCustomKelas] = useState("");
  const [isCustomKelas, setIsCustomKelas] = useState(false);
  const [nip, setNip] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const existingClasses = useMemo(() => {
    const list = Array.from(new Set(studentsList.map((s) => s.kelas).filter(Boolean))).sort();
    if (!list.includes("X-A")) list.unshift("X-A");
    return list;
  }, [studentsList]);

  const resetForm = () => {
    setEmail("");
    setPassword("");
    setFullName("");
    setStudentUsername("");
    setSelectedKelas("X-A");
    setCustomKelas("");
    setIsCustomKelas(false);
    setNip("");
    setRole("guru");
    setErrorMsg("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    let finalEmail = "";
    let finalPassword = "";
    let finalNis: string | null = null;
    const finalKelas = isCustomKelas ? customKelas.trim() : selectedKelas;

    if (role === "siswa") {
      if (!fullName.trim()) {
        setErrorMsg("Nama Lengkap wajib diisi.");
        return;
      }
      if (!studentUsername.trim()) {
        setErrorMsg("Username (NIS) wajib diisi.");
        return;
      }
      if (isCustomKelas && !customKelas.trim()) {
        setErrorMsg("Nama Kelas Baru wajib diisi.");
        return;
      }
      const username = studentUsername.trim();
      finalEmail = `${username}@sman19.sch.id`;
      finalPassword = password.trim() || "murid19*";
      finalNis = username;
    } else if (role === "kepala_sekolah") {
      if (!nip.trim()) {
        setErrorMsg("Username (NIP) wajib diisi untuk Kepala Sekolah.");
        return;
      }
      if (!fullName.trim()) {
        setErrorMsg("Nama Lengkap wajib diisi.");
        return;
      }
      finalEmail = `${nip.trim()}@sman19.sch.id`;
      finalPassword = password.trim() || "kepsek19*";
    } else if (role === "guru") {
      if (!nip.trim()) {
        setErrorMsg("Username (NIP) wajib diisi untuk Guru.");
        return;
      }
      if (!fullName.trim()) {
        setErrorMsg("Nama Lengkap wajib diisi.");
        return;
      }
      finalEmail = `${nip.trim()}@sman19.sch.id`;
      finalPassword = password.trim() || "guru19*";
    } else {
      if (!email.trim() || !fullName.trim()) {
        setErrorMsg(`Mohon isi semua kolom wajib untuk ${role === "tata_usaha" ? "Tata Usaha" : "Piket"}.`);
        return;
      }
      finalEmail = email.trim();
      finalPassword = password.trim() || (role === "tata_usaha" ? "tatausaha19*" : "piket19*");
    }

    setIsSubmitting(true);
    try {
      // 1. If role is siswa, upsert into `siswa` table first to satisfy foreign key constraint on profiles.nis
      if (role === "siswa" && finalNis) {
        const upperNama = fullName.trim().toUpperCase();
        const { error: siswaErr } = await supabaseAdminAuth.from("siswa").upsert(
          {
            nis: finalNis,
            nama: upperNama,
            kelas: finalKelas || "Umum",
            total_poin: 0,
          },
          { onConflict: "nis" }
        );
        if (siswaErr) {
          throw new Error("Gagal menyimpan data murid ke tabel siswa: " + siswaErr.message);
        }
      }

      // 2. Create User in Supabase Auth
      const { data: newAuth, error: signUpError } = await supabaseAdminAuth.auth.admin.createUser({
        email: finalEmail,
        password: finalPassword,
        email_confirm: true,
        user_metadata: {
          fullName: fullName.trim(),
          role: role,
          nis: finalNis,
        },
      });

      if (signUpError) throw signUpError;

      // 3. Profiles table is auto-created by the trigger, but we update or upsert here as a safety measure
      if (role === "siswa" && finalNis && newAuth?.user) {
        const { error: profErr } = await supabaseAdminAuth.from("profiles").upsert({
          id: newAuth.user.id,
          email: finalEmail,
          nama: fullName.trim(),
          role: "siswa",
          nis: finalNis,
        });
        if (profErr) console.warn("Peringatan simpan tabel profiles:", profErr.message);
      }

      resetForm();
      onClose();
      onSuccess();
    } catch (err: any) {
      setErrorMsg(err.message || "Gagal membuat akun.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  return (
    <ModalPortal isOpen={isOpen} onClose={handleClose} title="Registrasi Akun Baru" icon={UserPlus}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1">
          <label className="text-xs font-black text-brand-900 uppercase block">
            Pilih Peran Pengguna
          </label>
          <select
            value={role}
            onChange={(e) => {
              setRole(e.target.value as "guru" | "kepala_sekolah" | "siswa" | "piket" | "tata_usaha");
              setErrorMsg("");
              setFullName("");
              setEmail("");
              setPassword("");
              setStudentUsername("");
              setNip("");
            }}
            className="w-full border border-brand-100 rounded-xl py-2.5 px-3 text-sm font-bold text-brand-800 outline-none focus:ring-1 focus:ring-brand-500 bg-white cursor-pointer"
          >
            <option value="guru">Guru</option>
            <option value="kepala_sekolah">Kepala Sekolah</option>
            <option value="siswa">Murid</option>
            <option value="piket">Piket</option>
            <option value="tata_usaha">Tata Usaha</option>
          </select>
        </div>

        {errorMsg && (
          <div className="p-3 bg-rose-50 text-rose-800 text-xs font-semibold rounded-xl border border-rose-200">
            {errorMsg}
          </div>
        )}

        {/* Input Nama Lengkap (untuk semua role) */}
        <div className="space-y-1 animate-slide-up">
          <label className="text-xs font-black text-brand-900 uppercase block">Nama Lengkap</label>
          <div className="relative">
            <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-brand-400" />
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder={
                role === "siswa"
                  ? "Contoh: Budi Setiadi"
                  : role === "kepala_sekolah"
                  ? "Nama Lengkap Kepala Sekolah & Gelar"
                  : role === "guru"
                  ? "Nama Lengkap Guru & Gelar"
                  : "Nama Lengkap Petugas"
              }
              className="w-full border border-brand-100 rounded-xl py-2.5 pl-10 pr-4 text-sm font-semibold focus:ring-1 focus:ring-brand-500 outline-none text-brand-900 bg-brand-50/20"
            />
          </div>
        </div>

        {/* Khusus Role Siswa: Kelas, Username, Password */}
        {role === "siswa" && (
          <div className="space-y-3 animate-slide-up">
            <div className="space-y-1">
              <label className="text-xs font-black text-brand-900 uppercase block">Pilih Kelas</label>
              <div className="relative">
                <School className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-brand-400 z-10" />
                <select
                  value={isCustomKelas ? "NEW_CLASS" : selectedKelas}
                  onChange={(e) => {
                    if (e.target.value === "NEW_CLASS") {
                      setIsCustomKelas(true);
                    } else {
                      setIsCustomKelas(false);
                      setSelectedKelas(e.target.value);
                    }
                  }}
                  className="w-full border border-brand-100 rounded-xl py-2.5 pl-10 pr-4 text-sm font-bold text-brand-800 outline-none focus:ring-1 focus:ring-brand-500 bg-white"
                >
                  {existingClasses.map((cls) => (
                    <option key={cls} value={cls}>
                      {cls}
                    </option>
                  ))}
                  <option value="NEW_CLASS">+ Buat Kelas Baru...</option>
                </select>
              </div>
            </div>

            {isCustomKelas && (
              <div className="space-y-1 animate-slide-up">
                <label className="text-xs font-black text-brand-900 uppercase block">
                  Nama Kelas Baru
                </label>
                <input
                  type="text"
                  required
                  value={customKelas}
                  onChange={(e) => setCustomKelas(e.target.value)}
                  placeholder="Contoh: XII IPA 3"
                  className="w-full border border-brand-100 rounded-xl py-2.5 px-4 text-sm font-semibold focus:ring-1 focus:ring-brand-500 outline-none text-brand-900 bg-brand-50/20"
                />
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs font-black text-brand-900 uppercase block">
                Username / NIS Login
              </label>
              <div className="relative">
                <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-brand-400" />
                <input
                  type="text"
                  required
                  value={studentUsername}
                  onChange={(e) => setStudentUsername(e.target.value)}
                  placeholder="Contoh: 19024"
                  className="w-full border border-brand-100 rounded-xl py-2.5 pl-10 pr-4 text-sm font-semibold focus:ring-1 focus:ring-brand-500 outline-none text-brand-900 bg-brand-50/20"
                />
              </div>
              <p className="text-[10px] text-brand-400 font-medium">
                Username ini digunakan murid untuk login ke aplikasi.
              </p>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-black text-brand-900 uppercase block">
                Password (opsional)
              </label>
              <div className="relative">
                <Key className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-brand-400" />
                <input
                  type="text"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Kosongkan untuk default: murid19*"
                  className="w-full border border-brand-100 rounded-xl py-2.5 pl-10 pr-4 text-sm font-semibold focus:ring-1 focus:ring-brand-500 outline-none text-brand-900 bg-brand-50/20"
                />
              </div>
              <p className="text-[10px] text-brand-400 font-medium">
                Kosongkan untuk menggunakan password default{" "}
                <strong className="text-brand-600">murid19*</strong>
              </p>
            </div>
          </div>
        )}

        {(role === "guru" || role === "kepala_sekolah") && (
          <>
            <div className="space-y-1 animate-slide-up">
              <label className="text-xs font-black text-brand-900 uppercase block">
                Username (NIP)
              </label>
              <div className="relative">
                <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-brand-400" />
                <input
                  type="text"
                  required
                  value={nip}
                  onChange={(e) => setNip(e.target.value)}
                  placeholder="Contoh: 19761102"
                  className="w-full border border-brand-100 rounded-xl py-2.5 pl-10 pr-4 text-sm font-semibold focus:ring-1 focus:ring-brand-500 outline-none text-brand-900 bg-brand-50/20"
                />
              </div>
              <p className="text-[10px] text-brand-400 font-medium">
                Login sebagai:{" "}
                <strong className="text-brand-600">{nip || "[NIP]"}@sman19.sch.id</strong>
              </p>
            </div>

            <div className="space-y-1 animate-slide-up">
              <label className="text-xs font-black text-brand-900 uppercase block">Password</label>
              <div className="relative">
                <Key className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-brand-400" />
                <input
                  type="text"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={
                    role === "kepala_sekolah"
                      ? "Kosongkan untuk default: kepsek19*"
                      : "Kosongkan untuk default: guru19*"
                  }
                  className="w-full border border-brand-100 rounded-xl py-2.5 pl-10 pr-4 text-sm font-semibold focus:ring-1 focus:ring-brand-500 outline-none text-brand-900 bg-brand-50/20"
                />
              </div>
              <p className="text-[10px] text-brand-400 font-medium">
                Kosongkan untuk menggunakan password default{" "}
                <strong className="text-brand-600">
                  {role === "kepala_sekolah" ? "kepsek19*" : "guru19*"}
                </strong>
              </p>
            </div>
          </>
        )}

        {role === "piket" && (
          <>
            <div className="space-y-1 animate-slide-up">
              <label className="text-xs font-black text-brand-900 uppercase block">
                Email Login
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-brand-400" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nama@email.com"
                  className="w-full border border-brand-100 rounded-xl py-2.5 pl-10 pr-4 text-sm font-semibold focus:ring-1 focus:ring-brand-500 outline-none text-brand-900 bg-brand-50/20"
                />
              </div>
            </div>

            <div className="space-y-1 animate-slide-up">
              <label className="text-xs font-black text-brand-900 uppercase block">
                Password (opsional)
              </label>
              <div className="relative">
                <Key className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-brand-400" />
                <input
                  type="text"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Kosongkan untuk default: piket19*"
                  className="w-full border border-brand-100 rounded-xl py-2.5 pl-10 pr-4 text-sm font-semibold focus:ring-1 focus:ring-brand-500 outline-none text-brand-900 bg-brand-50/20"
                />
              </div>
              <p className="text-[10px] text-brand-400 font-medium">
                Kosongkan untuk menggunakan password default{" "}
                <strong className="text-brand-600">piket19*</strong>
              </p>
            </div>
          </>
        )}

        {role === "tata_usaha" && (
          <>
            <div className="space-y-1 animate-slide-up">
              <label className="text-xs font-black text-brand-900 uppercase block">
                Email Login
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-brand-400" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nama@email.com"
                  className="w-full border border-brand-100 rounded-xl py-2.5 pl-10 pr-4 text-sm font-semibold focus:ring-1 focus:ring-brand-500 outline-none text-brand-900 bg-brand-50/20"
                />
              </div>
            </div>

            <div className="space-y-1 animate-slide-up">
              <label className="text-xs font-black text-brand-900 uppercase block">
                Password (opsional)
              </label>
              <div className="relative">
                <Key className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-brand-400" />
                <input
                  type="text"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Kosongkan untuk default: tatausaha19*"
                  className="w-full border border-brand-100 rounded-xl py-2.5 pl-10 pr-4 text-sm font-semibold focus:ring-1 focus:ring-brand-500 outline-none text-brand-900 bg-brand-50/20"
                />
              </div>
              <p className="text-[10px] text-brand-400 font-medium">
                Kosongkan untuk menggunakan password default{" "}
                <strong className="text-brand-600">tatausaha19*</strong>
              </p>
            </div>
          </>
        )}

        {role === "siswa" && (
          <div className="text-[10px] font-bold text-brand-500 bg-brand-50/60 border border-brand-100/50 p-3 rounded-2xl space-y-1 animate-slide-up leading-relaxed">
            <div>
              <strong className="text-brand-900 font-extrabold">Username (Login):</strong>{" "}
              {(studentUsername.trim() || "[Username]") + "@sman19.sch.id"}
            </div>
            <div>
              <strong className="text-brand-900 font-extrabold">Kelas:</strong>{" "}
              {(isCustomKelas ? customKelas.trim() : selectedKelas) || "[Kelas]"}
            </div>
            <div>
              <strong className="text-brand-900 font-extrabold">Password:</strong>{" "}
              {password.trim() || "murid19*"}
            </div>
          </div>
        )}

        <div className="flex gap-2 justify-end pt-4 border-t border-brand-50">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2.5 border border-brand-100 rounded-xl text-sm font-bold text-brand-600 hover:bg-brand-50 cursor-pointer"
          >
            Batal
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-5 py-2.5 brand-gradient hover:opacity-95 text-white font-bold rounded-xl text-sm shadow-md shadow-brand-500/20 disabled:opacity-50 cursor-pointer"
          >
            {isSubmitting ? "Mendaftarkan..." : "Daftarkan User"}
          </button>
        </div>
      </form>
    </ModalPortal>
  );
}
