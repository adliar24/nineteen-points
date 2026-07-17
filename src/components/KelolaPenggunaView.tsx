import React, { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Search,
  ChevronDown,
  Check,
  AlertCircle,
  Trash2,
  RefreshCw,
  FileSpreadsheet,
  UserPlus,
  Pencil,
  Camera,
  X,
} from "lucide-react";
import { compressImage } from "../compressImage";
import { getVisiblePages } from "../pagination";
import { supabase, supabaseAdminAuth } from "../supabaseClient";
import { Siswa, UserSession, Profile } from "../types";
import ConfirmationModal from "./ConfirmationModal";
import RoleBadge from "./RoleBadge";
import { toSentenceCase } from "../formatName";
import PaginationFooter from "./PaginationFooter";
import BulkActionsBanner from "./BulkActionsBanner";
import CreateUserModal from "./CreateUserModal";
import EditAccountModal from "./EditAccountModal";
import ExcelImportUserModal from "./ExcelImportUserModal";
import BulkPhotoUploadModal from "./BulkPhotoUploadModal";

interface KelolaPenggunaViewProps {
  userSession: UserSession;
  onRefreshHistory: () => void;
}

export default function KelolaPenggunaView({
  userSession,
  onRefreshHistory,
}: KelolaPenggunaViewProps) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [studentsList, setStudentsList] = useState<Siswa[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [toastMsg, setToastMsg] = useState("");
  const [toastType, setToastType] = useState<"success" | "error" | "loading">("success");
  const [uploadProgress, setUploadProgress] = useState(0);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("Semua");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  const [deleteTarget, setDeleteTarget] = useState<{ id: string; email: string } | null>(null);
  const [isBulkDeleteConfirm, setIsBulkDeleteConfirm] = useState(false);
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);
  const [photoUploadProfileId, setPhotoUploadProfileId] = useState<string | null>(null);

  // Modals
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [isImportUserOpen, setIsImportUserOpen] = useState(false);
  const [isImportPhotoOpen, setIsImportPhotoOpen] = useState(false);

  // Photo delete
  const [photoDeleteTarget, setPhotoDeleteTarget] = useState<{
    id: string;
    nama: string;
    foto_url: string;
  } | null>(null);

  useEffect(() => {
    loadUsersData();
  }, []);

  const showToast = (msg: string, type: "success" | "error" | "loading" = "success") => {
    setToastMsg(msg);
    setToastType(type);
    if (type !== "loading") {
      setTimeout(() => setToastMsg(""), 4000);
    }
  };

  async function loadUsersData() {
    setIsLoading(true);
    try {
      const { data: profilesData, error: profilesError } = await supabaseAdminAuth
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });

      if (profilesError) throw profilesError;
      setProfiles(profilesData || []);

      const { data: siswaData, error: siswaError } = await supabaseAdminAuth
        .from("siswa")
        .select("*")
        .order("nama", { ascending: true });

      if (siswaError) throw siswaError;
      setStudentsList(siswaData || []);
    } catch (err: any) {
      console.error("Gagal memuat pengguna:", err);
      setErrorMsg("Gagal memuat daftar pengguna.");
    } finally {
      setIsLoading(false);
    }
  }

  const handleForceDeleteUser = (id: string, emailAddr: string) => {
    setDeleteTarget({ id, email: emailAddr });
  };

  const executeDeleteUser = async () => {
    if (!deleteTarget) return;
    const { id, email: emailAddr } = deleteTarget;

    try {
      const { error } = await supabase.from("profiles").delete().eq("id", id);
      if (error) throw error;

      const { error: authError } = await supabaseAdminAuth.auth.admin.deleteUser(id);
      if (authError) console.warn("Auth user delete failed (non-critical):", authError.message);

      showToast(`Profil akun ${emailAddr} berhasil dihapus.`);
      setSelectedIds((prev) => prev.filter((x) => x !== id));
      loadUsersData();
    } catch (err: any) {
      alert(`Gagal menghapus profil: ${err.message}`);
    } finally {
      setDeleteTarget(null);
    }
  };

  const handleBulkDelete = () => {
    const nonSuperIds = selectedIds.filter((id) => {
      const p = profiles.find((pr) => pr.id === id);
      return p && p.role !== "super_admin";
    });
    if (nonSuperIds.length === 0) {
      alert("Tidak ada akun yang bisa dihapus (akun super_admin tidak bisa dihapus).");
      return;
    }
    setIsBulkDeleteConfirm(true);
  };

  const executeBulkDelete = async () => {
    const nonSuperIds = selectedIds.filter((id) => {
      const p = profiles.find((pr) => pr.id === id);
      return p && p.role !== "super_admin";
    });

    setIsSubmitting(true);
    try {
      const { error } = await supabase.from("profiles").delete().in("id", nonSuperIds);
      if (error) throw error;

      for (const uid of nonSuperIds) {
        const { error: authError } = await supabaseAdminAuth.auth.admin.deleteUser(uid);
        if (authError) console.warn(`Auth user delete failed for ${uid}:`, authError.message);
      }

      showToast(`${nonSuperIds.length} akun berhasil dihapus.`);
      setSelectedIds([]);
      loadUsersData();
    } catch (err: any) {
      alert(`Gagal menghapus akun: ${err.message}`);
    } finally {
      setIsSubmitting(false);
      setIsBulkDeleteConfirm(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleSelectAll = () => {
    const selectable = profiles.filter((p) => p.role !== "super_admin").map((p) => p.id);
    const allSelected = selectable.length > 0 && selectable.every((id) => selectedIds.includes(id));
    setSelectedIds(allSelected ? [] : selectable);
  };

  const handleProfilePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !photoUploadProfileId) return;

    const profile = profiles.find((p) => p.id === photoUploadProfileId);
    if (!profile) {
      alert("Data profil tidak ditemukan.");
      setPhotoUploadProfileId(null);
      e.target.value = "";
      return;
    }

    showToast("Mengunggah foto...", "loading");
    setUploadProgress(0);

    try {
      setUploadProgress(15);
      let compressedBlob: Blob;
      try {
        compressedBlob = await compressImage(file, 300, 400, 0.75);
      } catch (compressErr: any) {
        throw new Error("Gagal mengompresi gambar: " + compressErr.message);
      }
      const compressedFile = new File([compressedBlob], `${profile.id}.jpg`, {
        type: "image/jpeg",
      });

      setUploadProgress(50);
      const fileName = `${profile.id}_${Date.now()}.jpg`;
      const { error: uploadErr } = await supabase.storage
        .from("profile-photos")
        .upload(fileName, compressedFile, { cacheControl: "3600", upsert: true });
      if (uploadErr) throw new Error("Upload ke storage gagal: " + uploadErr.message);

      setUploadProgress(75);
      const { data: urlData } = supabase.storage.from("profile-photos").getPublicUrl(fileName);
      const publicUrl = urlData.publicUrl;

      setUploadProgress(90);
      const { error: dbErr } = await supabase
        .from("profiles")
        .update({ foto_url: publicUrl })
        .eq("id", profile.id);
      if (dbErr) {
        if (dbErr.message?.includes("foto_url") || dbErr.message?.includes("column")) {
          throw new Error(
            "Kolom 'foto_url' belum ada di database. Jalankan: ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS foto_url TEXT;"
          );
        }
        throw new Error("Gagal update data profil: " + dbErr.message);
      }

      setUploadProgress(100);
      showToast("Foto profil berhasil diperbarui!", "success");
      loadUsersData();
    } catch (err: any) {
      console.error("Upload foto gagal:", err);
      showToast("Gagal unggah foto: " + err.message, "error");
    } finally {
      setPhotoUploadProfileId(null);
      setUploadProgress(0);
      e.target.value = "";
    }
  };

  const handleDeletePhoto = async () => {
    if (!photoDeleteTarget) return;
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ foto_url: null })
        .eq("id", photoDeleteTarget.id);
      if (error) throw error;
      const profile = profiles.find((p) => p.id === photoDeleteTarget.id);
      if (profile?.nis) {
        await supabase.from("siswa").update({ foto_url: null }).eq("nis", profile.nis);
      }
      showToast("Foto berhasil dihapus.", "success");
      loadUsersData();
    } catch (err: any) {
      alert("Gagal menghapus foto: " + err.message);
    } finally {
      setPhotoDeleteTarget(null);
    }
  };

  const filteredProfiles = useMemo(() => {
    return profiles.filter((p) => {
      const matchesSearch =
        searchQuery === "" ||
        p.nama.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.nis && p.nis.includes(searchQuery));
      const matchesRole = roleFilter === "Semua" || p.role === roleFilter;
      return matchesSearch && matchesRole;
    });
  }, [profiles, searchQuery, roleFilter]);

  const totalPages = Math.ceil(filteredProfiles.length / itemsPerPage);
  const paginatedProfiles = filteredProfiles.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const roleList = ["Semua", "super_admin", "kepala_sekolah", "guru", "siswa", "piket"];

  return (
    <div className="space-y-6 pb-8">
      {/* Hidden file input for profile photo upload */}
      <input
        type="file"
        id="profile-photo-upload-input"
        accept="image/*"
        className="hidden"
        onChange={handleProfilePhotoChange}
      />

      {/* Toast */}
      <AnimatePresence>
        {toastMsg && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-2 border ${
              toastType === "success"
                ? "bg-emerald-600 text-white border-emerald-500"
                : toastType === "error"
                ? "bg-rose-600 text-white border-rose-500"
                : "bg-slate-800 text-white border-slate-700"
            }`}
          >
            {toastType === "success" && <Check className="w-4 h-4 text-emerald-200" />}
            {toastType === "error" && <AlertCircle className="w-4 h-4 text-rose-200" />}
            {toastType === "loading" && (
              <div className="w-4 h-4 border-2 border-slate-400 border-t-white rounded-full animate-spin" />
            )}
            <span className="text-xs font-bold tracking-wide">{toastMsg}</span>
            {toastType === "loading" && uploadProgress > 0 && (
              <div className="w-20 h-1.5 bg-slate-600 rounded-full overflow-hidden ml-1">
                <motion.div
                  className="h-full bg-emerald-400 rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${uploadProgress}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header Actions Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 flex-1">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 text-brand-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Cari nama, email, atau NIS..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-10 pr-4 py-3 bg-white border border-brand-100 rounded-2xl text-xs font-bold text-brand-900 placeholder:text-brand-300 focus:ring-2 focus:ring-brand-500 outline-none transition-all"
            />
          </div>

          <div className="relative w-full sm:w-auto">
            <select
              value={roleFilter}
              onChange={(e) => {
                setRoleFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full appearance-none pl-4 pr-10 py-3 bg-white border border-brand-100 rounded-2xl text-xs font-bold text-brand-800 focus:ring-2 focus:ring-brand-500 outline-none cursor-pointer transition-all"
            >
              {roleList.map((r) => (
                <option key={r} value={r}>
                  {r === "Semua"
                    ? "Semua Role"
                    : r === "super_admin"
                    ? "Super Admin"
                    : r === "kepala_sekolah"
                    ? "Kepala Sekolah"
                    : r.charAt(0).toUpperCase() + r.slice(1)}
                </option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-brand-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          <button
            onClick={loadUsersData}
            title="Refresh"
            className="p-3 bg-brand-50 text-brand-600 rounded-2xl hover:bg-brand-100 border border-brand-100/50 transition-colors cursor-pointer"
          >
            <RefreshCw className="w-4.5 h-4.5" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setIsImportUserOpen(true)}
            className="flex items-center justify-center gap-2 p-3 md:px-5 md:py-3 bg-brand-50 hover:bg-brand-100 text-brand-700 border border-brand-100 rounded-2xl text-sm font-black transition-all cursor-pointer shadow-xs"
          >
            <FileSpreadsheet className="w-4.5 h-4.5 text-brand-600" />
            <span className="hidden md:inline">Impor Excel</span>
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setIsImportPhotoOpen(true)}
            className="flex items-center justify-center gap-2 p-3 md:px-5 md:py-3 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-100 rounded-2xl text-sm font-black transition-all cursor-pointer shadow-xs"
          >
            <Camera className="w-4.5 h-4.5 text-purple-600" />
            <span className="hidden md:inline">Foto Massal</span>
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setIsAddUserOpen(true)}
            className="flex items-center justify-center gap-2 p-3 md:px-5 md:py-3 brand-gradient text-white rounded-2xl text-sm font-black transition-all shadow-md cursor-pointer"
          >
            <UserPlus className="w-4.5 h-4.5" />
            <span className="hidden md:inline">Buat Akun Baru</span>
          </motion.button>
        </div>
      </div>

      {/* Success / Error Messages */}
      <AnimatePresence>
        {successMsg && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100 text-xs text-emerald-800 flex items-center gap-2 font-semibold">
              <Check className="w-4.5 h-4.5 text-emerald-600 bg-emerald-100 rounded-full p-0.5" />
              <span>{successMsg}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {errorMsg && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="p-4 bg-rose-50 rounded-2xl border border-rose-100 text-xs text-rose-800 flex items-center gap-2 font-semibold">
              <AlertCircle className="w-4.5 h-4.5 text-rose-600" />
              <span>{errorMsg}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bulk Actions Banner */}
      <BulkActionsBanner
        count={selectedIds.length}
        label="Akun"
        onCancel={() => setSelectedIds([])}
        onConfirm={handleBulkDelete}
        isConfirming={isSubmitting}
      />

      {/* User accounts list table */}
      <AnimatePresence mode="wait">
        <motion.div
          key="table-view"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="bg-white rounded-3xl border border-brand-100 shadow-xl shadow-brand-900/5 overflow-hidden"
        >
          <div className="overflow-x-auto min-h-[620px]">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-brand-50/50 border-b border-brand-100/70 text-brand-500 text-xs font-black uppercase tracking-wider">
                  <th className="py-4 px-4 w-12 text-center">
                    <input
                      type="checkbox"
                      checked={
                        profiles.filter((p) => p.role !== "super_admin").length > 0 &&
                        profiles
                          .filter((p) => p.role !== "super_admin")
                          .every((p) => selectedIds.includes(p.id))
                      }
                      onChange={toggleSelectAll}
                      className="w-4 h-4 rounded-lg border-brand-200 text-brand-600 focus:ring-brand-500 cursor-pointer"
                    />
                  </th>
                  <th className="py-4 px-4 min-w-[64px]">Foto</th>
                  <th className="py-4 px-6">Nama Lengkap</th>
                  <th className="py-4 px-6">Username / Email</th>
                  <th className="py-4 px-6">Peran (Role)</th>
                  <th className="py-4 px-6 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-100/40">
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, idx) => (
                    <tr key={idx} className="animate-pulse">
                      <td className="py-4 px-4 text-center">
                        <div className="h-4 w-4 bg-slate-200 rounded mx-auto" />
                      </td>
                      <td className="py-4 px-4">
                        <div className="h-10 w-10 bg-slate-200 rounded-full" />
                      </td>
                      <td className="py-4 px-6">
                        <div className="h-4 w-36 bg-slate-200 rounded" />
                      </td>
                      <td className="py-4 px-6">
                        <div className="h-4 w-48 bg-slate-200 rounded" />
                      </td>
                      <td className="py-4 px-6">
                        <div className="h-5 w-16 bg-slate-200 rounded-lg" />
                      </td>
                      <td className="py-4 px-6 text-right">
                        <div className="h-7 w-16 bg-slate-200 rounded-xl ml-auto" />
                      </td>
                    </tr>
                  ))
                ) : paginatedProfiles.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="py-12 text-center text-slate-400 text-xs font-bold"
                    >
                      Tidak ada akun yang ditemukan.
                    </td>
                  </tr>
                ) : (
                  paginatedProfiles.map((p) => {
                    const isSuper = p.role === "super_admin";
                    const isSelected = selectedIds.includes(p.id);
                    return (
                      <tr
                        key={p.id}
                        className={`hover:bg-brand-50/20 transition-colors ${
                          isSelected ? "bg-brand-50/40" : ""
                        }`}
                      >
                        <td className="py-4 px-4 text-center">
                          {!isSuper && (
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelect(p.id)}
                              className="w-4 h-4 rounded-lg border-brand-200 text-brand-600 focus:ring-brand-500 cursor-pointer"
                            />
                          )}
                        </td>
                        <td className="py-3 px-4 min-w-[64px]">
                          <div className="relative group">
                            {p.foto_url ? (
                              <img
                                src={p.foto_url}
                                alt={p.nama}
                                className="w-10 h-[53px] rounded-lg object-cover border border-brand-100 shrink-0"
                              />
                            ) : (
                              <div className="w-10 h-[53px] rounded-lg bg-brand-100 flex items-center justify-center text-brand-400 text-[10px] font-black uppercase shrink-0">
                                {p.nama.slice(0, 2)}
                              </div>
                            )}
                            <div className="absolute inset-0 rounded-lg bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-1 transition-opacity">
                              <label
                                htmlFor="profile-photo-upload-input"
                                className="w-6 h-6 rounded-full bg-white/90 flex items-center justify-center cursor-pointer hover:bg-white transition-colors"
                                onClick={() => setPhotoUploadProfileId(p.id)}
                                title="Ganti Foto"
                              >
                                <Camera className="w-3 h-3 text-brand-700" />
                              </label>
                              {p.foto_url && (
                                <button
                                  onClick={() =>
                                    setPhotoDeleteTarget({
                                      id: p.id,
                                      nama: p.nama,
                                      foto_url: p.foto_url!,
                                    })
                                  }
                                  className="w-6 h-6 rounded-full bg-white/90 flex items-center justify-center cursor-pointer hover:bg-rose-50 transition-colors"
                                  title="Hapus Foto"
                                >
                                  <Trash2 className="w-3 h-3 text-rose-500" />
                                </button>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="py-4 px-6 font-extrabold text-sm text-brand-950">
                          {toSentenceCase(p.nama)}
                        </td>
                        <td className="py-4 px-6 font-mono font-bold text-sm text-brand-900">
                          {p.email.split("@")[0]}
                        </td>
                        <td className="py-4 px-6">
                          <RoleBadge role={p.role} />
                        </td>
                        <td className="py-4 px-6 text-right whitespace-nowrap">
                          {!isSuper && (
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => setEditingProfile(p)}
                                className="p-2 hover:bg-brand-50 text-brand-600 hover:text-brand-800 rounded-xl transition-all cursor-pointer border border-transparent hover:border-brand-100"
                                title="Edit Akun"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleForceDeleteUser(p.id, p.email)}
                                className="p-2 hover:bg-rose-50 text-rose-500 hover:text-rose-700 rounded-xl transition-all cursor-pointer border border-transparent hover:border-rose-100"
                                title="Hapus Profil"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <PaginationFooter
            totalItems={filteredProfiles.length}
            itemsPerPage={itemsPerPage}
            currentPage={currentPage}
            setCurrentPage={setCurrentPage}
            itemLabel="akun"
          />
        </motion.div>
      </AnimatePresence>

      {/* Modals */}
      <CreateUserModal
        isOpen={isAddUserOpen}
        onClose={() => setIsAddUserOpen(false)}
        onSuccess={loadUsersData}
        studentsList={studentsList}
      />

      <EditAccountModal
        isOpen={!!editingProfile}
        onClose={() => setEditingProfile(null)}
        onSuccess={loadUsersData}
        profile={editingProfile}
      />

      <ExcelImportUserModal
        isOpen={isImportUserOpen}
        onClose={() => setIsImportUserOpen(false)}
        onSuccess={() => {
          setSuccessMsg("Akun berhasil diimpor!");
          loadUsersData();
        }}
      />

      <BulkPhotoUploadModal
        isOpen={isImportPhotoOpen}
        onClose={() => setIsImportPhotoOpen(false)}
        onSuccess={loadUsersData}
        profiles={profiles}
        showToast={showToast}
      />

      {/* Confirm Delete Modals */}
      <ConfirmationModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={executeDeleteUser}
        title="Hapus Akun User?"
        message={`Apakah Anda yakin ingin menghapus akun "${deleteTarget?.email}"? Profil akun akan dihapus dari database.`}
        confirmText="Ya, Hapus"
        cancelText="Batal"
        type="danger"
      />

      <ConfirmationModal
        isOpen={isBulkDeleteConfirm}
        onClose={() => setIsBulkDeleteConfirm(false)}
        onConfirm={executeBulkDelete}
        title="Hapus Massal Akun User?"
        message={`Apakah Anda yakin ingin menghapus ${
          selectedIds.filter((id) => profiles.find((p) => p.id === id && p.role !== "super_admin"))
            .length
        } akun sekaligus? Profil akun akan dihapus dari database.`}
        confirmText="Ya, Hapus Semua"
        cancelText="Batal"
        type="danger"
      />

      <ConfirmationModal
        isOpen={!!photoDeleteTarget}
        onClose={() => setPhotoDeleteTarget(null)}
        onConfirm={handleDeletePhoto}
        title="Hapus Foto Profil?"
        message={`Yakin ingin menghapus foto profil "${
          photoDeleteTarget?.nama ? toSentenceCase(photoDeleteTarget.nama) : ""
        }"?`}
        confirmText="Ya, Hapus"
        cancelText="Batal"
        type="danger"
      />
    </div>
  );
}
