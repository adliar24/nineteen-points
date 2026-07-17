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
      const fullEmail =
        profile.role === "siswa" || profile.role === "guru" || profile.role === "kepala_sekolah"
          ? `${editEmail.trim()}@sman19.sch.id`
          : editEmail.trim();

      const updates: any = {};
      if (fullEmail !== profile.email) updates.email = fullEmail;
      if (editPassword) updates.password = editPassword;

      if (Object.keys(updates).length > 0) {
        const { error: authErr } = await supabaseAdminAuth.auth.admin.updateUserById(
          profile.id,
          updates
        );
        if (authErr) throw new Error("Gagal update auth: " + authErr.message);
      }

      if (editNama !== profile.nama) {
        const { error: profileErr } = await supabase
          .from("profiles")
          .update({ nama: editNama, email: fullEmail })
          .eq("id", profile.id);
        if (profileErr) throw new Error("Gagal update profil: " + profileErr.message);
      } else if (fullEmail !== profile.email) {
        const { error: profileErr } = await supabase
          .from("profiles")
          .update({ email: fullEmail })
          .eq("id", profile.id);
        if (profileErr) throw new Error("Gagal update email profil: " + profileErr.message);
      }

      onClose();
      onSuccess();
    } catch (err: any) {
      alert("Gagal mengedit akun: " + err.message);
    } finally {
      setIsEditing(false);
    }
  };

  const isSiswaOrGuru =
    profile?.role === "siswa" || profile?.role === "guru" || profile?.role === "kepala_sekolah";

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
            {isSiswaOrGuru ? "Username (Login)" : "Email / Username Login"}
          </label>
          <div className="relative">
            <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-brand-400" />
            <input
              type="text"
              required
              value={editEmail}
              onChange={(e) => setEditEmail(e.target.value)}
              readOnly={isSiswaOrGuru}
              className={`w-full border border-brand-100 rounded-xl py-2.5 pl-10 pr-4 text-sm font-semibold focus:ring-1 focus:ring-brand-500 outline-none text-brand-900 bg-brand-50/20${
                isSiswaOrGuru ? " opacity-75 cursor-not-allowed" : ""
              }`}
            />
          </div>
          {isSiswaOrGuru && (
            <p className="text-[10px] text-brand-400 font-medium">Username tidak dapat diubah.</p>
          )}
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
