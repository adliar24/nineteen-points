import React, { useState } from "react";
import { UserPlus, X } from "lucide-react";
import { supabase, supabaseAdminAuth } from "../supabaseClient";
import ModalPortal from "./ModalPortal";

interface AddStudentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  showToast: (msg: string) => void;
}

export default function AddStudentModal({
  isOpen,
  onClose,
  onSuccess,
  showToast,
}: AddStudentModalProps) {
  const [newNis, setNewNis] = useState("");
  const [newNama, setNewNama] = useState("");
  const [newKelas, setNewKelas] = useState("XII IPA 1");
  const [addError, setAddError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const resetForm = () => {
    setNewNis("");
    setNewNama("");
    setNewKelas("XII IPA 1");
    setAddError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError("");

    if (!newNis || !newNama || !newKelas) {
      setAddError("Semua bidang harus diisi.");
      return;
    }

    setIsSubmitting(true);
    try {
      const { data: existing } = await supabase
        .from("siswa")
        .select("nis")
        .eq("nis", newNis)
        .maybeSingle();

      if (existing) {
        setAddError("NIS sudah terdaftar.");
        setIsSubmitting(false);
        return;
      }

      const upperNama = newNama.trim().toUpperCase();

      const { error } = await supabase.from("siswa").insert({
        nis: newNis,
        nama: upperNama,
        kelas: newKelas,
        total_poin: 0,
      });

      if (error) throw error;

      let authCreated = true;
      try {
        const { error: signUpError } = await supabaseAdminAuth.auth.admin.createUser({
          email: `${newNis}@sman19.sch.id`,
          password: `Siswa${newNis}`,
          email_confirm: true,
          user_metadata: {
            fullName: upperNama,
            role: "siswa",
            nis: newNis,
          },
        });
        if (signUpError) throw signUpError;
      } catch (authErr: any) {
        console.error("Gagal mendaftarkan akun login siswa:", authErr);
        authCreated = false;
      }

      resetForm();
      onClose();
      onSuccess();

      if (authCreated) {
        showToast(`Murid "${upperNama}" & akun login berhasil dibuat.`);
      } else {
        showToast(`Murid "${upperNama}" disimpan (gagal membuat akun login).`);
      }
    } catch (err: any) {
      setAddError("Gagal menambahkan murid: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  return (
    <ModalPortal isOpen={isOpen} onClose={handleClose} title="Tambah Murid Baru SMAN 19" icon={UserPlus}>
      {addError && (
        <div className="p-3 bg-rose-50 text-rose-800 text-xs font-semibold rounded-xl border border-rose-200 mb-4">
          {addError}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1">
          <label className="text-[10px] font-black text-brand-400 uppercase tracking-wider block">
            Nomor Induk Murid (NIS)
          </label>
          <input
            type="text"
            required
            placeholder="Contoh: 19024"
            value={newNis}
            onChange={(e) => setNewNis(e.target.value)}
            className="w-full border border-brand-100 rounded-xl p-3 text-xs font-bold text-brand-900 focus:ring-2 focus:ring-brand-500 outline-none bg-brand-50/10"
          />
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-black text-brand-400 uppercase tracking-wider block">
            Nama Lengkap Murid
          </label>
          <input
            type="text"
            required
            placeholder="Contoh: Budi Setiadi"
            value={newNama}
            onChange={(e) => setNewNama(e.target.value)}
            className="w-full border border-brand-100 rounded-xl p-3 text-xs font-bold text-brand-900 focus:ring-2 focus:ring-brand-500 outline-none bg-brand-50/10"
          />
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-black text-brand-400 uppercase tracking-wider block">
            Kelas
          </label>
          <input
            type="text"
            required
            placeholder="XII IPA 1"
            value={newKelas}
            onChange={(e) => setNewKelas(e.target.value)}
            className="w-full border border-brand-100 rounded-xl p-3 text-xs font-bold text-brand-900 focus:ring-2 focus:ring-brand-500 outline-none bg-brand-50/10"
          />
        </div>

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
            className="px-5 py-2.5 brand-gradient text-white text-xs font-black rounded-xl shadow-lg shadow-brand-500/20 cursor-pointer disabled:opacity-50"
          >
            {isSubmitting ? "Menyimpan..." : "Simpan"}
          </button>
        </div>
      </form>
    </ModalPortal>
  );
}
