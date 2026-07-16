import React, { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { createPortal } from "react-dom";
import {
  UserPlus,
  Mail,
  Key,
  User,
  Check,
  AlertCircle,
  Trash2,
  RefreshCw,
  FileSpreadsheet,
  Download,
  X,
  Pencil,
  Search,
  ChevronLeft,
  ChevronRight,
  Camera,
  Shield
} from "lucide-react";
import { getVisiblePages } from "../pagination";
import { supabase, supabaseAdminAuth } from "../supabaseClient";
import { compressImage } from "./KelolaSiswaView";
import * as XLSX from "xlsx";
import ConfirmationModal from "./ConfirmationModal";

interface Profile {
  id: string;
  email: string;
  nama: string;
  role: string;
  nis: string | null;
  foto_url: string | null;
  created_at: string;
}

interface KelolaPiketViewProps {
  userSession: any;
  onRefreshHistory: () => void;
}

export default function KelolaPiketView({ userSession, onRefreshHistory }: KelolaPiketViewProps) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [toastMsg, setToastMsg] = useState("");

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [isImportUserOpen, setIsImportUserOpen] = useState(false);
  const [importUserError, setImportUserError] = useState("");

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  const [deleteTarget, setDeleteTarget] = useState<{ id: string; email: string } | null>(null);
  const [isBulkDeleteConfirm, setIsBulkDeleteConfirm] = useState(false);

  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);
  const [editEmail, setEditEmail] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editNama, setEditNama] = useState("");
  const [isEditing, setIsEditing] = useState(false);

  const [photoUploadProfileId, setPhotoUploadProfileId] = useState<string | null>(null);

  useEffect(() => { loadUsersData(); }, []);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(""), 4000);
  };

  async function loadUsersData() {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("profiles").select("*").eq("role", "piket").order("created_at", { ascending: false });
      if (error) throw error;
      setProfiles(data || []);
    } catch (err: any) {
      console.error("Gagal memuat data piket:", err);
      setErrorMsg("Gagal memuat daftar petugas piket.");
    } finally { setIsLoading(false); }
  }

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(""); setSuccessMsg("");
    if (!fullName || !email || !password) { setErrorMsg("Semua kolom wajib diisi."); return; }

    setIsSubmitting(true);
    try {
      const finalEmail = email.trim();
      const { error: signUpError } = await supabaseAdminAuth.auth.admin.createUser({
        email: finalEmail, password, email_confirm: true,
        user_metadata: { fullName, role: "piket", nis: null }
      });
      if (signUpError) throw signUpError;
      setSuccessMsg(`Akun piket "${fullName}" berhasil dibuat!`);
      setFullName(""); setEmail(""); setPassword(""); setIsAddUserOpen(false);
      loadUsersData();
    } catch (err: any) { setErrorMsg(err.message || "Gagal membuat akun piket."); }
    finally { setIsSubmitting(false); }
  };

  const handleForceDeleteUser = (id: string, emailAddr: string) => {
    setDeleteTarget({ id, email: emailAddr });
  };

  const executeDeleteUser = async () => {
    if (!deleteTarget) return;
    try {
      const { error } = await supabase.from("profiles").delete().eq("id", deleteTarget.id);
      if (error) throw error;
      showToast(`Profil ${deleteTarget.email} berhasil dihapus.`);
      setSelectedIds(prev => prev.filter(x => x !== deleteTarget.id));
      loadUsersData();
    } catch (err: any) { alert("Gagal menghapus: " + err.message); }
    finally { setDeleteTarget(null); }
  };

  const handleBulkDelete = () => {
    const ids = selectedIds.filter(id => profiles.find(p => p.id === id));
    if (ids.length === 0) { alert("Tidak ada akun piket yang dipilih."); return; }
    setIsBulkDeleteConfirm(true);
  };

  const executeBulkDelete = async () => {
    const ids = selectedIds.filter(id => profiles.find(p => p.id === id));
    setIsSubmitting(true);
    try {
      const { error } = await supabase.from("profiles").delete().in("id", ids);
      if (error) throw error;
      showToast(`${ids.length} akun piket berhasil dihapus.`);
      setSelectedIds([]); loadUsersData();
    } catch (err: any) { alert("Gagal menghapus: " + err.message); }
    finally { setIsSubmitting(false); setIsBulkDeleteConfirm(false); }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };
  const toggleSelectAll = () => {
    const selectable = profiles.map(p => p.id);
    const allSel = selectable.length > 0 && selectable.every(id => selectedIds.includes(id));
    setSelectedIds(allSel ? [] : selectable);
  };

  const openEditModal = (p: Profile) => {
    setEditingProfile(p);
    setEditEmail(p.email);
    setEditNama(p.nama);
    setEditPassword("");
  };

  const handleEditAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProfile) return;
    setIsEditing(true);
    try {
      const updates: any = {};
      if (editEmail !== editingProfile.email) updates.email = editEmail;
      if (editPassword) updates.password = editPassword;

      if (Object.keys(updates).length > 0) {
        const { error: authErr } = await supabaseAdminAuth.auth.admin.updateUserById(editingProfile.id, updates);
        if (authErr) throw new Error("Gagal update auth: " + authErr.message);
      }
      if (editNama !== editingProfile.nama || editEmail !== editingProfile.email) {
        const { error: profileErr } = await supabase
          .from("profiles").update({ nama: editNama, email: editEmail }).eq("id", editingProfile.id);
        if (profileErr) throw new Error("Gagal update profil: " + profileErr.message);
      }
      showToast(`Akun ${editNama} berhasil diperbarui!`);
      setEditingProfile(null); loadUsersData();
    } catch (err: any) { alert("Gagal mengedit: " + err.message); }
    finally { setIsEditing(false); }
  };

  const handleProfilePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !photoUploadProfileId) return;
    const profile = profiles.find(p => p.id === photoUploadProfileId);
    if (!profile) { alert("Data tidak ditemukan."); setPhotoUploadProfileId(null); e.target.value = ""; return; }

    showToast("Mengunggah foto profil...");
    try {
      const compressedBlob = await compressImage(file, 300, 400, 0.75);
      const compressedFile = new File([compressedBlob], `${profile.id}.jpg`, { type: "image/jpeg" });

      const { error: bucketError } = await supabase.storage.getBucket('profile-photos');
      if (bucketError) {
        const { error: createErr } = await supabase.storage.createBucket('profile-photos', {
          public: true, allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'], fileSizeLimit: 10485760
        });
        if (createErr && !createErr.message?.includes("already exists")) console.error("Bucket error:", createErr);
      }

      const fileName = `${profile.id}_${Date.now()}.jpg`;
      const { error: uploadErr } = await supabase.storage
        .from('profile-photos').upload(fileName, compressedFile, { cacheControl: '3600', upsert: true });
      if (uploadErr) throw new Error("Upload gagal: " + uploadErr.message);

      const { data: urlData } = supabase.storage.from('profile-photos').getPublicUrl(fileName);
      const publicUrl = urlData.publicUrl;

      const { error: dbErr } = await supabase.from('profiles').update({ foto_url: publicUrl }).eq('id', profile.id);
      if (dbErr) {
        if (dbErr.message?.includes('foto_url')) throw new Error("Kolom 'foto_url' belum ada. Jalankan: ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS foto_url TEXT;");
        throw new Error("Gagal update: " + dbErr.message);
      }

      showToast("Foto profil berhasil diperbarui!");
      loadUsersData();
    } catch (err: any) { alert("Gagal unggah foto: " + err.message); }
    finally { setPhotoUploadProfileId(null); e.target.value = ""; }
  };

  const downloadUserTemplate = () => {
    try {
      const data = [["Nama Lengkap", "Email Login", "Password"], ["Petugas Piket 1", "piket1@contoh.com", "password123"]];
      const worksheet = XLSX.utils.aoa_to_sheet(data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Template Piket");
      worksheet["!cols"] = [{ wch: 25 }, { wch: 25 }, { wch: 15 }];
      XLSX.writeFile(workbook, "TEMPLATE_PIKET.xlsx");
      showToast("Template berhasil diunduh!");
    } catch (err: any) { alert("Gagal: " + err.message); }
  };

  const handleExcelImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    setImportUserError("");
    const file = e.target.files?.[0];
    if (!file) return;
    setIsSubmitting(true);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const workbook = XLSX.read(bstr, { type: "binary" });
        const rows = XLSX.utils.sheet_to_json<any[]>(workbook.Sheets[workbook.SheetNames[0]], { header: 1 });
        if (rows.length < 2) { setImportUserError("File kosong."); setIsSubmitting(false); return; }
        let added = 0, fail = 0;
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          if (!row || row.length < 3) continue;
          const name = String(row[0] || "").trim();
          const emailVal = String(row[1] || "").trim();
          const passVal = String(row[2] || "").trim();
          if (!name || !emailVal || !passVal) continue;
          try {
            const { error } = await supabaseAdminAuth.auth.admin.createUser({
              email: emailVal, password: passVal, email_confirm: true,
              user_metadata: { fullName: name, role: "piket", nis: null }
            });
            if (error) throw error; added++; await new Promise(r => setTimeout(r, 200));
          } catch { fail++; }
        }
        if (added > 0) { setSuccessMsg(`${added} akun piket berhasil diimpor!${fail > 0 ? ` (${fail} gagal)` : ""}`); setIsImportUserOpen(false); loadUsersData(); }
        else setImportUserError("Tidak ada data valid.");
      } catch (err: any) { setImportUserError("Gagal baca Excel: " + err.message); }
      finally { setIsSubmitting(false); e.target.value = ""; }
    };
    reader.readAsBinaryString(file);
  };

  const filteredProfiles = useMemo(() => {
    return profiles.filter(p =>
      searchQuery === "" || p.nama.toLowerCase().includes(searchQuery.toLowerCase()) || p.email.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [profiles, searchQuery]);

  const totalPages = Math.ceil(filteredProfiles.length / itemsPerPage);
  const paginatedProfiles = filteredProfiles.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  const allSelectableSelected = filteredProfiles.length > 0 && filteredProfiles.every(p => selectedIds.includes(p.id));

  return (
    <div className="space-y-6 pb-8">
      <input type="file" id="piket-photo-upload-input" accept="image/*" className="hidden" onChange={handleProfilePhotoChange} />

      <AnimatePresence>
        {toastMsg && (
          <motion.div initial={{ opacity: 0, y: 20, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            className="fixed bottom-6 right-6 z-50 bg-brand-950 text-white px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-2 border border-brand-800">
            <Check className="w-4 h-4 text-emerald-400 bg-emerald-500/10 p-0.5 rounded-full" />
            <span className="text-xs font-bold tracking-wide">{toastMsg}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 flex-1">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 text-brand-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input type="text" placeholder="Cari nama atau email piket..." value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              className="w-full pl-10 pr-4 py-3 bg-white border border-brand-100 rounded-2xl text-xs font-bold text-brand-900 placeholder:text-brand-300 focus:ring-2 focus:ring-brand-500 outline-none transition-all" />
          </div>
          <button onClick={loadUsersData} title="Refresh"
            className="p-3 bg-brand-50 text-brand-600 rounded-2xl hover:bg-brand-100 border border-brand-100/50 transition-colors cursor-pointer">
            <RefreshCw className="w-4.5 h-4.5" />
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => setIsImportUserOpen(true)}
            className="flex items-center justify-center gap-2 p-3 md:px-5 md:py-3 bg-brand-50 hover:bg-brand-100 text-brand-700 border border-brand-100 rounded-2xl text-sm font-black transition-all cursor-pointer shadow-xs">
            <FileSpreadsheet className="w-4.5 h-4.5 text-brand-600" />
            <span className="hidden md:inline">Impor Excel</span>
          </motion.button>
          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => setIsAddUserOpen(true)}
            className="flex items-center justify-center gap-2 p-3 md:px-5 md:py-3 brand-gradient text-white rounded-2xl text-sm font-black transition-all shadow-md cursor-pointer">
            <UserPlus className="w-4.5 h-4.5" />
            <span className="hidden md:inline">Tambah Piket</span>
          </motion.button>
        </div>
      </div>

      <AnimatePresence>
        {successMsg && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100 text-xs text-emerald-800 flex items-center gap-2 font-semibold">
              <Check className="w-4.5 h-4.5 text-emerald-600 bg-emerald-100 rounded-full p-0.5" />{successMsg}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {errorMsg && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="p-4 bg-rose-50 rounded-2xl border border-rose-100 text-xs text-rose-800 flex items-center gap-2 font-semibold">
              <AlertCircle className="w-4.5 h-4.5 text-rose-600" />{errorMsg}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedIds.length > 0 && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="bg-rose-50 border border-rose-100 rounded-3xl p-4 flex items-center justify-between shadow-lg shadow-rose-900/5">
              <div className="flex items-center gap-2.5">
                <Trash2 className="w-5 h-5 text-rose-600 animate-pulse" />
                <span className="text-xs font-black text-rose-950 uppercase tracking-wider">{selectedIds.length} Piket Terpilih</span>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setSelectedIds([])} className="px-3.5 py-2 hover:bg-rose-100 text-rose-800 rounded-2xl text-[10px] font-black uppercase transition-all cursor-pointer border border-transparent">Batal</button>
                <button onClick={handleBulkDelete} disabled={isSubmitting}
                  className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl text-[10px] font-black uppercase transition-all shadow-md cursor-pointer flex items-center gap-1.5 disabled:opacity-50">
                  <Trash2 className="w-3.5 h-3.5" />{isSubmitting ? "Menghapus..." : "Hapus Terpilih"}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Table */}
      <AnimatePresence mode="wait">
        <motion.div key="table" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
          className="bg-white rounded-3xl border border-brand-100 shadow-xl shadow-brand-900/5 overflow-hidden">
          <div className="overflow-x-auto min-h-[620px]">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-brand-50/50 border-b border-brand-100/70 text-brand-500 text-xs font-black uppercase tracking-wider">
                  <th className="py-4 px-4 w-12 text-center">
                    <input type="checkbox" checked={allSelectableSelected} onChange={toggleSelectAll}
                      className="w-4 h-4 rounded-lg border-brand-200 text-brand-600 focus:ring-brand-500 cursor-pointer" />
                  </th>
                  <th className="py-4 px-4">Foto</th>
                  <th className="py-4 px-6">Nama Lengkap</th>
                  <th className="py-4 px-6">Email</th>
                  <th className="py-4 px-6">Terdaftar</th>
                  <th className="py-4 px-6 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-100/40">
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, idx) => (
                    <tr key={idx} className="animate-pulse">
                      <td className="py-4 px-4 text-center"><div className="h-4 w-4 bg-slate-200 rounded mx-auto" /></td>
                      <td className="py-4 px-4"><div className="h-10 w-10 bg-slate-200 rounded-full" /></td>
                      <td className="py-4 px-6"><div className="h-4 w-36 bg-slate-200 rounded" /></td>
                      <td className="py-4 px-6"><div className="h-4 w-48 bg-slate-200 rounded" /></td>
                      <td className="py-4 px-6"><div className="h-4 w-20 bg-slate-200 rounded" /></td>
                      <td className="py-4 px-6 text-right"><div className="h-7 w-16 bg-slate-200 rounded-xl ml-auto" /></td>
                    </tr>
                  ))
                ) : paginatedProfiles.length === 0 ? (
                  <tr><td colSpan={6} className="py-12 text-center text-slate-400 text-xs font-bold">Tidak ada data petugas piket.</td></tr>
                ) : (
                  paginatedProfiles.map((p) => {
                    const isSelected = selectedIds.includes(p.id);
                    return (
                      <tr key={p.id} className={`hover:bg-brand-50/20 transition-colors ${isSelected ? "bg-brand-50/40" : ""}`}>
                        <td className="py-4 px-4 text-center">
                          <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(p.id)}
                            className="w-4 h-4 rounded-lg border-brand-200 text-brand-600 focus:ring-brand-500 cursor-pointer" />
                        </td>
                        <td className="py-4 px-4">
                          <div className="relative group">
                            {p.foto_url ? (
                              <img src={p.foto_url} alt={p.nama} className="w-10 h-10 rounded-full object-cover border-2 border-brand-100" />
                            ) : (
                              <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center border-2 border-blue-200">
                                <span className="text-xs font-black text-blue-600">
                                  {p.nama.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}
                                </span>
                              </div>
                            )}
                            <label htmlFor="piket-photo-upload-input"
                              className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center cursor-pointer transition-opacity"
                              onClick={() => setPhotoUploadProfileId(p.id)}>
                              <Camera className="w-4 h-4 text-white" />
                            </label>
                          </div>
                        </td>
                        <td className="py-4 px-6 font-extrabold text-sm text-brand-950 uppercase">{p.nama}</td>
                        <td className="py-4 px-6 font-mono font-bold text-sm text-brand-900">{p.email}</td>
                        <td className="py-4 px-6 text-brand-500 text-xs font-semibold">
                          {new Date(p.created_at).toLocaleDateString("id-ID", { dateStyle: "medium" })}
                        </td>
                        <td className="py-4 px-6 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            <button onClick={() => openEditModal(p)}
                              className="p-2 hover:bg-brand-50 text-brand-600 hover:text-brand-800 rounded-xl transition-all cursor-pointer border border-transparent hover:border-brand-100" title="Edit">
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button onClick={() => handleForceDeleteUser(p.id, p.email)}
                              className="p-2 hover:bg-rose-50 text-rose-500 hover:text-rose-700 rounded-xl transition-all cursor-pointer border border-transparent hover:border-rose-100" title="Hapus">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="bg-brand-50/30 p-4 border-t border-brand-100 text-sm text-brand-500 font-bold flex flex-col sm:flex-row items-center justify-between gap-3">
            <span className="whitespace-nowrap tabular-nums">
              Menampilkan {filteredProfiles.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0}–{Math.min(currentPage * itemsPerPage, filteredProfiles.length)} dari {filteredProfiles.length} piket
            </span>
            {totalPages > 1 && (
              <div className="flex items-center gap-1 sm:gap-1.5 select-none shrink-0">
                <button disabled={currentPage === 1} onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center bg-white hover:bg-brand-50 border border-brand-200 rounded-xl text-brand-850 disabled:opacity-40 cursor-pointer transition-all shrink-0">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                {getVisiblePages(totalPages, currentPage, 5).map((pageNum, i) => (
                  typeof pageNum === "string" ? (
                    <span key={`e-${i}`} className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center text-brand-400 font-bold shrink-0">...</span>
                  ) : (
                    <button key={pageNum} onClick={() => setCurrentPage(pageNum)}
                      className={`w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-xl border text-sm font-black transition-all cursor-pointer shrink-0 ${currentPage === pageNum ? "bg-brand-600 border-brand-600 text-white" : "bg-white hover:bg-brand-50 border-brand-200 text-brand-800"}`}>
                      {pageNum}
                    </button>
                  )
                ))}
                <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center bg-white hover:bg-brand-50 border border-brand-200 rounded-xl text-brand-850 disabled:opacity-40 cursor-pointer transition-all shrink-0">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </motion.div>
      </AnimatePresence>

      {/* ADD PIKET MODAL */}
      {createPortal(
        <AnimatePresence>
          {isAddUserOpen && (
            <div className="fixed inset-0 bg-brand-950/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="fixed inset-0" />
              <motion.div initial={{ opacity: 0, scale: 0.95, y: 15 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 10 }}
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
                className="bg-white rounded-3xl p-6 w-full max-w-md border border-brand-100 shadow-2xl space-y-4 relative z-10">
                <div className="flex justify-between items-center border-b pb-3 border-brand-50">
                  <h3 className="text-base font-extrabold text-brand-950 flex items-center gap-2">
                    <Shield className="w-5 h-5 text-blue-600" />Tambah Petugas Piket
                  </h3>
                  <button onClick={() => setIsAddUserOpen(false)} className="p-1 text-brand-400 hover:text-brand-600 hover:bg-brand-50 rounded-xl cursor-pointer">&times;</button>
                </div>
                <form onSubmit={handleCreateUser} className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-xs font-black text-brand-900 uppercase block">Nama Lengkap</label>
                    <div className="relative">
                      <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-brand-400" />
                      <input type="text" required value={fullName} onChange={(e) => setFullName(e.target.value)}
                        placeholder="Nama Petugas Piket"
                        className="w-full border border-brand-100 rounded-xl py-2.5 pl-10 pr-4 text-sm font-semibold focus:ring-1 focus:ring-brand-500 outline-none text-brand-900 bg-brand-50/20" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-black text-brand-900 uppercase block">Email Login</label>
                    <div className="relative">
                      <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-brand-400" />
                      <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                        placeholder="nama@email.com"
                        className="w-full border border-brand-100 rounded-xl py-2.5 pl-10 pr-4 text-sm font-semibold focus:ring-1 focus:ring-brand-500 outline-none text-brand-900 bg-brand-50/20" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-black text-brand-900 uppercase block">Password</label>
                    <div className="relative">
                      <Key className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-brand-400" />
                      <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
                        placeholder="Minimal 6 karakter"
                        className="w-full border border-brand-100 rounded-xl py-2.5 pl-10 pr-4 text-sm font-semibold focus:ring-1 focus:ring-brand-500 outline-none text-brand-900 bg-brand-50/20" />
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end pt-4 border-t border-brand-50">
                    <button type="button" onClick={() => setIsAddUserOpen(false)}
                      className="px-4 py-2.5 border border-brand-100 rounded-xl text-sm font-bold text-brand-600 hover:bg-brand-50 cursor-pointer">Batal</button>
                    <button type="submit" disabled={isSubmitting}
                      className="px-5 py-2.5 brand-gradient hover:opacity-95 text-white font-bold rounded-xl text-sm shadow-md shadow-brand-500/20 disabled:opacity-50 cursor-pointer">
                      {isSubmitting ? "Mendaftarkan..." : "Daftarkan Piket"}
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>, document.body
      )}

      {/* EDIT MODAL */}
      {createPortal(
        <AnimatePresence>
          {editingProfile && (
            <div className="fixed inset-0 bg-brand-950/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="fixed inset-0" />
              <motion.div initial={{ opacity: 0, scale: 0.95, y: 15 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 10 }}
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
                className="bg-white rounded-3xl p-6 w-full max-w-md border border-brand-100 shadow-2xl space-y-4 relative z-10">
                <div className="flex justify-between items-center border-b pb-3 border-brand-50">
                  <h3 className="text-base font-extrabold text-brand-950 flex items-center gap-2"><Pencil className="w-5 h-5 text-brand-600" />Edit Piket</h3>
                  <button onClick={() => setEditingProfile(null)} className="p-1 text-brand-400 hover:text-brand-600 hover:bg-brand-50 rounded-xl cursor-pointer">&times;</button>
                </div>
                <form onSubmit={handleEditAccount} className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-xs font-black text-brand-900 uppercase block">Nama Lengkap</label>
                    <div className="relative">
                      <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-brand-400" />
                      <input type="text" required value={editNama} onChange={(e) => setEditNama(e.target.value)}
                        className="w-full border border-brand-100 rounded-xl py-2.5 pl-10 pr-4 text-sm font-semibold focus:ring-1 focus:ring-brand-500 outline-none text-brand-900 bg-brand-50/20" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-black text-brand-900 uppercase block">Email / Username Login</label>
                    <div className="relative">
                      <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-brand-400" />
                      <input type="text" required value={editEmail} onChange={(e) => setEditEmail(e.target.value)}
                        className="w-full border border-brand-100 rounded-xl py-2.5 pl-10 pr-4 text-sm font-semibold focus:ring-1 focus:ring-brand-500 outline-none text-brand-900 bg-brand-50/20" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-black text-brand-900 uppercase block">Password Baru</label>
                    <div className="relative">
                      <Key className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-brand-400" />
                      <input type="password" value={editPassword} onChange={(e) => setEditPassword(e.target.value)}
                        placeholder="Kosongkan jika tidak ingin mengubah" minLength={6}
                        className="w-full border border-brand-100 rounded-xl py-2.5 pl-10 pr-4 text-sm font-semibold focus:ring-1 focus:ring-brand-500 outline-none text-brand-900 bg-brand-50/20" />
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end pt-4 border-t border-brand-50">
                    <button type="button" onClick={() => setEditingProfile(null)}
                      className="px-4 py-2.5 border border-brand-100 rounded-xl text-sm font-bold text-brand-600 hover:bg-brand-50 cursor-pointer">Batal</button>
                    <button type="submit" disabled={isEditing}
                      className="px-5 py-2.5 brand-gradient hover:opacity-95 text-white font-bold rounded-xl text-sm shadow-md shadow-brand-500/20 disabled:opacity-50 cursor-pointer">
                      {isEditing ? "Menyimpan..." : "Simpan"}
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>, document.body
      )}

      {/* IMPORT MODAL */}
      {createPortal(
        <AnimatePresence>
          {isImportUserOpen && (
            <div className="fixed inset-0 bg-brand-950/65 backdrop-blur-xs flex items-center justify-center z-50 p-4">
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="fixed inset-0" />
              <motion.div initial={{ opacity: 0, scale: 0.95, y: 15 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 10 }}
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
                className="bg-white rounded-3xl p-6 w-full max-w-md border border-brand-100 shadow-2xl space-y-4 relative z-10">
                <div className="flex justify-between items-center border-b pb-3 border-brand-50">
                  <h3 className="text-base font-extrabold text-brand-950 flex items-center gap-2">
                    <FileSpreadsheet className="w-5 h-5 text-emerald-600" />Impor Piket dari Excel
                  </h3>
                  <button onClick={() => setIsImportUserOpen(false)} className="p-1 text-brand-400 hover:text-brand-600 hover:bg-brand-50 rounded-xl cursor-pointer">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="space-y-4">
                  <p className="text-xs text-brand-500 leading-relaxed font-medium">
                    Format: Kolom A = Nama, Kolom B = Email, Kolom C = Password.
                  </p>
                  <div className="bg-brand-50/70 border border-brand-100 rounded-2xl p-4 flex items-center justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-bold text-brand-950">Unduh Template</h4>
                      <p className="text-xs text-brand-400 font-medium mt-0.5">Format kolom untuk import</p>
                    </div>
                    <button onClick={downloadUserTemplate}
                      className="px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold border border-emerald-200 rounded-xl text-sm flex items-center gap-1.5 cursor-pointer transition-colors">
                      <Download className="w-3.5 h-3.5" />Template
                    </button>
                  </div>
                  {importUserError && (
                    <div className="p-3.5 bg-rose-50 rounded-2xl border border-rose-100 text-sm text-rose-800 flex items-center gap-2">
                      <AlertCircle className="w-4.5 h-4.5 text-rose-600 flex-shrink-0" />{importUserError}
                    </div>
                  )}
                  <div className="space-y-2">
                    <label className="text-xs font-black text-brand-900 uppercase block">Pilih Berkas Excel</label>
                    <input type="file" accept=".xlsx, .xls" onChange={handleExcelImport} disabled={isSubmitting}
                      className="w-full text-sm text-brand-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-bold file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100 file:cursor-pointer disabled:opacity-50" />
                  </div>
                </div>
                {isSubmitting && (
                  <div className="py-4 text-center">
                    <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                    <p className="text-xs font-bold text-brand-600">Sedang memproses...</p>
                  </div>
                )}
                <div className="flex justify-end pt-3 border-t border-brand-50">
                  <button onClick={() => setIsImportUserOpen(false)}
                    className="px-4 py-2 border border-brand-100 rounded-xl text-xs font-bold text-brand-600 hover:bg-brand-50 cursor-pointer">Tutup</button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>, document.body
      )}

      <ConfirmationModal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={executeDeleteUser}
        title="Hapus Akun Piket?" message={`Yakin ingin menghapus "${deleteTarget?.email}"?`}
        confirmText="Ya, Hapus" cancelText="Batal" type="danger" />
      <ConfirmationModal isOpen={isBulkDeleteConfirm} onClose={() => setIsBulkDeleteConfirm(false)} onConfirm={executeBulkDelete}
        title="Hapus Massal Piket?" message={`Yakin ingin menghapus ${selectedIds.length} akun piket?`}
        confirmText="Ya, Hapus Semua" cancelText="Batal" type="danger" />
    </div>
  );
}
