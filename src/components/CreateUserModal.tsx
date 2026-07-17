import React, { useState } from "react";
import { UserPlus, User, Key, Mail } from "lucide-react";
import { supabaseAdminAuth } from "../supabaseClient";
import { Siswa } from "../types";
import { toSentenceCase } from "../formatName";
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
  const [role, setRole] = useState<"guru" | "kepala_sekolah" | "siswa" | "piket">("guru");
  const [selectedNis, setSelectedNis] = useState("");
  const [nip, setNip] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const resetForm = () => {
    setEmail("");
    setPassword("");
    setFullName("");
    setSelectedNis("");
    setNip("");
    setRole("guru");
    setErrorMsg("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    let finalEmail = "";
    let finalPassword = "";

    if (role === "siswa") {
      if (!selectedNis) {
        setErrorMsg("NIS wajib dipilih untuk pengguna dengan peran Murid.");
        return;
      }
      if (!fullName) {
        setErrorMsg("Nama Lengkap wajib diisi.");
        return;
      }
      finalEmail = `${selectedNis}@sman19.sch.id`;
      finalPassword = `Siswa${selectedNis}`;
    } else if (role === "guru" || role === "kepala_sekolah") {
      if (!nip) {
        setErrorMsg(
          `Username (NIP) wajib diisi untuk ${role === "kepala_sekolah" ? "Kepala Sekolah" : "Guru"}.`
        );
        return;
      }
      if (!fullName) {
        setErrorMsg("Nama Lengkap wajib diisi.");
        return;
      }
      finalEmail = `${nip}@sman19.sch.id`;
      finalPassword = password.trim() || "guru19*";
    } else {
      if (!email || !password || !fullName) {
        setErrorMsg("Mohon isi semua kolom wajib untuk Piket.");
        return;
      }
      finalEmail = email.trim();
      finalPassword = password;
    }

    setIsSubmitting(true);
    try {
      const { error: signUpError } = await supabaseAdminAuth.auth.admin.createUser({
        email: finalEmail,
        password: finalPassword,
        email_confirm: true,
        user_metadata: {
          fullName: fullName,
          role: role,
          nis: role === "siswa" ? selectedNis : null,
        },
      });
      if (signUpError) throw signUpError;

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
              setRole(e.target.value as "guru" | "kepala_sekolah" | "siswa" | "piket");
              setErrorMsg("");
              setFullName("");
              setEmail("");
              setPassword("");
              setSelectedNis("");
              setNip("");
            }}
            className="w-full border border-brand-100 rounded-xl py-2.5 px-3 text-sm font-bold text-brand-800 outline-none focus:ring-1 focus:ring-brand-500 bg-white cursor-pointer"
          >
            <option value="guru">Guru</option>
            <option value="kepala_sekolah">Kepala Sekolah</option>
            <option value="siswa">Murid</option>
            <option value="piket">Piket</option>
          </select>
        </div>

        {errorMsg && (
          <div className="p-3 bg-rose-50 text-rose-800 text-xs font-semibold rounded-xl border border-rose-200">
            {errorMsg}
          </div>
        )}

        {role === "piket" && (
          <div className="space-y-1 animate-slide-up">
            <label className="text-xs font-black text-brand-900 uppercase block">Nama Lengkap</label>
            <div className="relative">
              <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-brand-400" />
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Nama Lengkap Petugas Piket"
                className="w-full border border-brand-100 rounded-xl py-2.5 pl-10 pr-4 text-sm font-semibold focus:ring-1 focus:ring-brand-500 outline-none text-brand-900 bg-brand-50/20"
              />
            </div>
          </div>
        )}

        {(role === "guru" || role === "kepala_sekolah" || role === "siswa") && (
          <div className="space-y-1 animate-slide-up">
            <label className="text-xs font-black text-brand-900 uppercase block">Nama Lengkap</label>
            <div className="relative">
              <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-brand-400" />
              <input
                type="text"
                required
                disabled={role === "siswa"}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder={
                  role === "siswa"
                    ? "Pilih Murid terlebih dahulu"
                    : role === "kepala_sekolah"
                    ? "Nama Lengkap Kepala Sekolah & Gelar"
                    : "Nama Lengkap Guru & Gelar"
                }
                className="w-full border border-brand-100 rounded-xl py-2.5 pl-10 pr-4 text-sm font-semibold focus:ring-1 focus:ring-brand-500 outline-none text-brand-900 bg-brand-50/20 disabled:opacity-75"
              />
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
                  placeholder="Kosongkan untuk default: guru19*"
                  className="w-full border border-brand-100 rounded-xl py-2.5 pl-10 pr-4 text-sm font-semibold focus:ring-1 focus:ring-brand-500 outline-none text-brand-900 bg-brand-50/20"
                />
              </div>
              <p className="text-[10px] text-brand-400 font-medium">
                Kosongkan untuk menggunakan password default{" "}
                <strong className="text-brand-600">guru19*</strong>
              </p>
            </div>
          </>
        )}

        {role === "siswa" && (
          <div className="space-y-1 animate-slide-up">
            <label className="text-xs font-black text-brand-900 uppercase block">
              Hubungkan NIS Murid
            </label>
            <select
              required
              value={selectedNis}
              onChange={(e) => {
                setSelectedNis(e.target.value);
                const std = studentsList.find((s) => s.nis === e.target.value);
                if (std) setFullName(std.nama);
              }}
              className="w-full border border-brand-100 rounded-xl py-2.5 px-3 text-sm font-bold text-brand-800 outline-none focus:ring-1 focus:ring-brand-500 bg-white"
            >
              <option value="">-- Pilih NIS & Nama Murid --</option>
              {studentsList.map((s) => (
                <option key={s.id} value={s.nis}>
                  [{s.nis}] {s.nama} ({s.kelas})
                </option>
              ))}
            </select>
          </div>
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
                Password Baru
              </label>
              <div className="relative">
                <Key className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-brand-400" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimal 6 karakter"
                  className="w-full border border-brand-100 rounded-xl py-2.5 pl-10 pr-4 text-sm font-semibold focus:ring-1 focus:ring-brand-500 outline-none text-brand-900 bg-brand-50/20"
                />
              </div>
            </div>
          </>
        )}

        {(role === "guru" || role === "kepala_sekolah") && (
          <div className="text-[10px] font-bold text-brand-500 bg-brand-50/60 border border-brand-100/50 p-3 rounded-2xl space-y-1 animate-slide-up leading-relaxed">
            <div>
              <strong className="text-brand-900 font-extrabold">Username (Login):</strong>{" "}
              {(nip || "[NIS/NIP]") + "@sman19.sch.id"}
            </div>
            <div>
              <strong className="text-brand-900 font-extrabold">Password:</strong>{" "}
              {password.trim() || "guru19*"}
            </div>
          </div>
        )}

        {role === "siswa" && (
          <div className="text-[10px] font-bold text-brand-500 bg-brand-50/60 border border-brand-100/50 p-3 rounded-2xl space-y-1 animate-slide-up leading-relaxed">
            <div>
              <strong className="text-brand-900 font-extrabold">Username (Login):</strong>{" "}
              {(selectedNis || "[NIS Murid]") + "@sman19.sch.id"}
            </div>
            <div>
              <strong className="text-brand-900 font-extrabold">Password:</strong> Siswa{`{NIS}`}
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
