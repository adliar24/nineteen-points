import React, { useState, useEffect } from "react";
import { User, Mail, Key, Pencil } from "lucide-react";
import { supabase, supabaseAdminAuth } from "../supabaseClient";
import { Profile } from "../types";
import ModalPortal from "./ModalPortal";

interface EditAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  profile: Profile | null;
}

export default function EditAccountModal({
  isOpen,
  onClose,
  onSuccess,
  profile,
}: EditAccountModalProps) {
  const [editEmail, setEditEmail] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editNama, setEditNama] = useState("");
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    if (profile) {
      setEditEmail(profile.email.split("@")[0]);
      setEditNama(profile.nama);
      setEditPassword("");
    }
  }, [profile]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setIsEditing(true);

    try {
      const trimmedInput = editEmail.trim();
      const fullEmail = trimmedInput.includes("@") ? trimmedInput : `${trimmedInput}@sman19.sch.id`;

      // 1. Ambil data auth user saat ini agar user_metadata tidak terhapus
      const { data: userData } = await supabaseAdminAuth.auth.admin.getUserById(profile.id);
      const existingMeta = userData?.user?.user_metadata || {};

      const updates: any = {};
      if (fullEmail !== profile.email) {
        updates.email = fullEmail;
      }
      if (editPassword) {
        updates.password = editPassword;
      }

      const newMeta = { ...existingMeta };
      if (editNama && editNama !== profile.nama) {
        newMeta.fullName = editNama;
      }
      if (profile.role === "siswa") {
        newMeta.nis = trimmedInput;
      } else if (profile.role === "guru" || profile.role === "kepala_sekolah") {
        newMeta.nip = trimmedInput;
      }
      updates.user_metadata = newMeta;

      if (Object.keys(updates).length > 0) {
        const { error: authErr } = await supabaseAdminAuth.auth.admin.updateUserById(
          profile.id,
          updates
        );
        if (authErr) throw new Error("Gagal update Auth: " + authErr.message);
      }

      // 2. Jika role siswa, update atau buat data di tabel siswa
      if (profile.role === "siswa") {
        if (profile.nis && profile.nis !== trimmedInput) {
          const { error: siswaErr } = await supabaseAdminAuth
            .from("siswa")
            .update({ nis: trimmedInput, nama: editNama.toUpperCase() })
            .eq("nis", profile.nis);
          if (siswaErr) console.warn("Peringatan update NIS di tabel siswa:", siswaErr.message);
        } else {
          await supabaseAdminAuth.from("siswa").upsert(
            {
              nis: trimmedInput,
              nama: editNama.toUpperCase(),
              kelas: "Umum",
              total_poin: 0,
            },
            { onConflict: "nis" }
          );
        }
      }

      // 3. Update tabel profiles via supabaseAdminAuth (service_role)
      const profileUpdates: any = {};
      if (editNama !== profile.nama) profileUpdates.nama = editNama;
      if (fullEmail !== profile.email) profileUpdates.email = fullEmail;
      if (profile.role === "siswa") profileUpdates.nis = trimmedInput;

      if (Object.keys(profileUpdates).length > 0) {
        const { error: profileErr } = await supabaseAdminAuth
          .from("profiles")
          .update(profileUpdates)
          .eq("id", profile.id);
        if (profileErr) throw new Error("Gagal update profil database: " + profileErr.message);
      }

      onClose();
      onSuccess();
    } catch (err: any) {
      alert("Gagal mengedit akun: " + err.message);
    } finally {
      setIsEditing(false);
    }
  };

  return (
    <ModalPortal isOpen={isOpen} onClose={onClose} title="Edit Akun" icon={Pencil}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1">
          <label className="text-xs font-black text-brand-900 uppercase block">Nama Lengkap</label>
          <div className="relative">
            <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-brand-400" />
            <input
              type="text"
              required
              value={editNama}
              onChange={(e) => setEditNama(e.target.value)}
              className="w-full border border-brand-100 rounded-xl py-2.5 pl-10 pr-4 text-sm font-semibold focus:ring-1 focus:ring-brand-500 outline-none text-brand-900 bg-brand-50/20"
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-black text-brand-900 uppercase block">
            Username Login
          </label>
          <div className="relative">
            <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-brand-400" />
            <input
              type="text"
              required
              value={editEmail}
              onChange={(e) => setEditEmail(e.target.value)}
              placeholder="Username / NIS / NIP"
              className="w-full border border-brand-100 rounded-xl py-2.5 pl-10 pr-4 text-sm font-semibold focus:ring-1 focus:ring-brand-500 outline-none text-brand-900 bg-brand-50/20"
            />
          </div>
          <p className="text-[10px] text-brand-400 font-medium">
            Masukkan username tanpa @domain (contoh: NIS, NIP, atau nama pengguna).
          </p>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-black text-brand-900 uppercase block">Password Baru</label>
          <div className="relative">
            <Key className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-brand-400" />
            <input
              type="password"
              value={editPassword}
              onChange={(e) => setEditPassword(e.target.value)}
              placeholder="Kosongkan jika tidak ingin mengubah"
              minLength={6}
              className="w-full border border-brand-100 rounded-xl py-2.5 pl-10 pr-4 text-sm font-semibold focus:ring-1 focus:ring-brand-500 outline-none text-brand-900 bg-brand-50/20"
            />
          </div>
          <p className="text-[10px] text-brand-400 font-medium">
            Kosongkan jika tidak ingin mengubah password.
          </p>
        </div>

        <div className="flex gap-2 justify-end pt-4 border-t border-brand-50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 border border-brand-100 rounded-xl text-sm font-bold text-brand-600 hover:bg-brand-50 cursor-pointer"
          >
            Batal
          </button>
          <button
            type="submit"
            disabled={isEditing}
            className="px-5 py-2.5 brand-gradient hover:opacity-95 text-white font-bold rounded-xl text-sm shadow-md shadow-brand-500/20 disabled:opacity-50 cursor-pointer flex items-center gap-2"
          >
            {isEditing ? "Menyimpan..." : "Simpan Perubahan"}
          </button>
        </div>
      </form>
    </ModalPortal>
  );
}
