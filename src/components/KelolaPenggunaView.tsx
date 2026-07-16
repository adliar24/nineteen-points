import React, { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { createPortal } from "react-dom";
import { 
  UserPlus, 
  ShieldCheck, 
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
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Camera
} from "lucide-react";
import { compressImage } from "./KelolaSiswaView";
import { getVisiblePages } from "../pagination";
import { supabase, supabaseAdminAuth } from "../supabaseClient";
import { Siswa } from "../types";
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

interface KelolaPenggunaViewProps {
  userSession: any;
  onRefreshHistory: () => void;
}

export default function KelolaPenggunaView({ userSession, onRefreshHistory }: KelolaPenggunaViewProps) {


  // Accounts state
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [studentsList, setStudentsList] = useState<Siswa[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [toastMsg, setToastMsg] = useState("");

  // Form Fields for user creation
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<"guru" | "siswa" | "piket">("guru");
  const [selectedNis, setSelectedNis] = useState("");
  const [nip, setNip] = useState("");

  // Modals state
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [isImportUserOpen, setIsImportUserOpen] = useState(false);
  const [importUserError, setImportUserError] = useState("");

  // Bulk delete state
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Search and filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("Semua");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  // Delete confirmation modals
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; email: string } | null>(null);
  const [isBulkDeleteConfirm, setIsBulkDeleteConfirm] = useState(false);

  // Edit account state
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);
  const [editEmail, setEditEmail] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editNama, setEditNama] = useState("");
  const [isEditing, setIsEditing] = useState(false);

  // Photo upload state
  const [photoUploadProfileId, setPhotoUploadProfileId] = useState<string | null>(null);

  useEffect(() => {
    loadUsersData();
  }, []);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(""), 4000);
  };

  async function loadUsersData() {
    setIsLoading(true);
    try {
      const { data: profilesData, error: profilesError } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });

      if (profilesError) throw profilesError;
      setProfiles(profilesData || []);

      const { data: siswaData, error: siswaError } = await supabase
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

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

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
      finalPassword = "siswa19";
    } else if (role === "guru") {
      if (!nip) {
        setErrorMsg("NIP wajib diisi untuk Guru.");
        return;
      }
      if (!fullName) {
        setErrorMsg("Nama Lengkap wajib diisi.");
        return;
      }
      finalEmail = `${nip}@sman19.sch.id`;
      finalPassword = "guru19*";
    } else {
      // Piket
      if (!email || !password || !fullName) {
        setErrorMsg("Mohon isi semua kolom wajib untuk Piket.");
        return;
      }
      finalEmail = email.trim();
      finalPassword = password;
    }

    setIsSubmitting(true);

    try {
      // Create user using secondary admin-auth client to prevent logging out current session
      const { error: signUpError } = await supabaseAdminAuth.auth.admin.createUser({
        email: finalEmail,
        password: finalPassword,
        email_confirm: true,
        user_metadata: {
          fullName: fullName,
          role: role,
          nis: role === "siswa" ? selectedNis : null
        }
      });

      if (signUpError) throw signUpError;

      setSuccessMsg(`Akun "${fullName}" berhasil dibuat sebagai ${role.toUpperCase()}!`);
      
      // Reset form
      setEmail("");
      setPassword("");
      setFullName("");
      setSelectedNis("");
      setNip("");
      setRole("guru");
      setIsAddUserOpen(false);

      loadUsersData();
    } catch (err: any) {
      console.error("Gagal registrasi user:", err);
      setErrorMsg(err.message || "Gagal membuat akun.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete single user
  const handleForceDeleteUser = (id: string, emailAddr: string) => {
    setDeleteTarget({ id, email: emailAddr });
  };

  const executeDeleteUser = async () => {
    if (!deleteTarget) return;
    const { id, email: emailAddr } = deleteTarget;

    try {
      const { error } = await supabase
        .from("profiles")
        .delete()
        .eq("id", id);

      if (error) throw error;
      showToast(`Profil akun ${emailAddr} berhasil dihapus.`);
      setSelectedIds(prev => prev.filter(x => x !== id));
      loadUsersData();
    } catch (err: any) {
      alert(`Gagal menghapus profil: ${err.message}`);
    } finally {
      setDeleteTarget(null);
    }
  };

  // Bulk delete selected users
  const handleBulkDelete = () => {
    const nonSuperIds = selectedIds.filter(id => {
      const p = profiles.find(pr => pr.id === id);
      return p && p.role !== "super_admin";
    });

    if (nonSuperIds.length === 0) {
      alert("Tidak ada akun yang bisa dihapus (akun super_admin tidak bisa dihapus).");
      return;
    }

    setIsBulkDeleteConfirm(true);
  };

  const executeBulkDelete = async () => {
    const nonSuperIds = selectedIds.filter(id => {
      const p = profiles.find(pr => pr.id === id);
      return p && p.role !== "super_admin";
    });

    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .delete()
        .in("id", nonSuperIds);

      if (error) throw error;
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

  // Toggle select single
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  // Toggle select all (only non-super_admin)
  const toggleSelectAll = () => {
    const selectable = profiles.filter(p => p.role !== "super_admin").map(p => p.id);
    const allSelected = selectable.length > 0 && selectable.every(id => selectedIds.includes(id));
    setSelectedIds(allSelected ? [] : selectable);
  };

  // Open edit modal
  const openEditModal = (p: Profile) => {
    setEditingProfile(p);
    // Strip any email suffix for display — show only NIS/NIP/username
    setEditEmail(p.email.split("@")[0]);
    setEditNama(p.nama);
    setEditPassword("");
  };

  // Handle edit account
  const handleEditAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProfile) return;
    setIsEditing(true);

    try {
      // Re-add @sman19.sch.id suffix for siswa/guru auth email
      const fullEmail = (editingProfile.role === "siswa" || editingProfile.role === "guru")
        ? `${editEmail.trim()}@sman19.sch.id`
        : editEmail.trim();

      // Update auth user email and password via admin client
      const updates: any = {};
      if (fullEmail !== editingProfile.email) {
        updates.email = fullEmail;
      }
      if (editPassword) {
        updates.password = editPassword;
      }

      if (Object.keys(updates).length > 0) {
        const { error: authErr } = await supabaseAdminAuth.auth.admin.updateUserById(
          editingProfile.id,
          updates
        );
        if (authErr) throw new Error("Gagal update auth: " + authErr.message);
      }

      // Update nama in profiles
      if (editNama !== editingProfile.nama) {
        const { error: profileErr } = await supabase
          .from("profiles")
          .update({ nama: editNama, email: fullEmail })
          .eq("id", editingProfile.id);
        if (profileErr) throw new Error("Gagal update profil: " + profileErr.message);
      } else if (fullEmail !== editingProfile.email) {
        const { error: profileErr } = await supabase
          .from("profiles")
          .update({ email: fullEmail })
          .eq("id", editingProfile.id);
        if (profileErr) throw new Error("Gagal update email profil: " + profileErr.message);
      }

      showToast(`Akun ${editNama} berhasil diperbarui!`);
      setEditingProfile(null);
      loadUsersData();
    } catch (err: any) {
      alert("Gagal mengedit akun: " + err.message);
    } finally {
      setIsEditing(false);
    }
  };

  // Handle profile photo upload for guru/piket
  const handleProfilePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !photoUploadProfileId) return;

    const profile = profiles.find(p => p.id === photoUploadProfileId);
    if (!profile) {
      alert("Data profil tidak ditemukan.");
      setPhotoUploadProfileId(null);
      e.target.value = "";
      return;
    }

    showToast("Mengompresi & mengunggah foto...");

    try {
      // 1. COMPRESS
      let compressedBlob: Blob;
      try {
        compressedBlob = await compressImage(file, 300, 400, 0.75);
      } catch (compressErr: any) {
        throw new Error("Gagal mengompresi gambar: " + compressErr.message);
      }
      const compressedFile = new File([compressedBlob], `${profile.id}.jpg`, { type: "image/jpeg" });

      // 2. Ensure bucket exists
      const { error: bucketError } = await supabase.storage.getBucket('profile-photos');
      if (bucketError) {
        const { error: createErr } = await supabase.storage.createBucket('profile-photos', {
          public: true,
          allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
          fileSizeLimit: 10485760
        });
        if (createErr && !createErr.message?.includes("already exists")) {
          console.error("Bucket creation error:", createErr);
        }
      }

      // 3. UPLOAD
      const fileName = `${profile.id}_${Date.now()}.jpg`;
      const { error: uploadErr } = await supabase.storage
        .from('profile-photos')
        .upload(fileName, compressedFile, {
          cacheControl: '3600',
          upsert: true
        });

      if (uploadErr) throw new Error("Upload ke storage gagal: " + uploadErr.message);

      // 4. GET PUBLIC URL
      const { data: urlData } = supabase.storage
        .from('profile-photos')
        .getPublicUrl(fileName);

      const publicUrl = urlData.publicUrl;

      // 5. UPDATE PROFILES TABLE
      const { error: dbErr } = await supabase
        .from('profiles')
        .update({ foto_url: publicUrl })
        .eq('id', profile.id);

      if (dbErr) {
        if (dbErr.message?.includes('foto_url') || dbErr.message?.includes('column')) {
          throw new Error("Kolom 'foto_url' belum ada di database. Jalankan: ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS foto_url TEXT;");
        }
        throw new Error("Gagal update data profil: " + dbErr.message);
      }

      showToast("Foto profil berhasil diperbarui!");
      loadUsersData();
    } catch (err: any) {
      console.error("Upload foto gagal:", err);
      alert("Gagal mengunggah foto profil: " + err.message);
    } finally {
      setPhotoUploadProfileId(null);
      e.target.value = "";
    }
  };

  // Download Excel Template for importing accounts
  const downloadUserTemplate = () => {
    try {
      const data = [
        ["Nama Lengkap", "Email", "Password", "Role (guru/siswa)", "NIS (jika siswa)"],
        ["Hendra Wijaya, M.Si.", "hendra@sma19.sch.id", "password123", "guru", ""],
        ["Ahmad Fauzi", "fauzi@siswa.sma19.sch.id", "siswa123", "siswa", "19001"]
      ];
      
      const worksheet = XLSX.utils.aoa_to_sheet(data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Template Akun SMAN 19");
      
      worksheet["!cols"] = [
        { wch: 25 },
        { wch: 25 },
        { wch: 15 },
        { wch: 15 },
        { wch: 15 }
      ];

      XLSX.writeFile(workbook, "TEMPLATE_IMPORT_AKUN_SMAN19.xlsx");
      showToast("Template Excel Akun berhasil diunduh!");
    } catch (err: any) {
      alert("Gagal mengunduh template: " + err.message);
    }
  };

  // Import User Accounts from Excel File
  const handleUserExcelImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    setImportUserError("");
    const file = e.target.files?.[0];
    if (!file) return;

    setIsSubmitting(true);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const workbook = XLSX.read(bstr, { type: "binary" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1 });

        if (rows.length < 2) {
          setImportUserError("File Excel kosong atau tidak memiliki data.");
          setIsSubmitting(false);
          return;
        }

        let addedCount = 0;
        let failCount = 0;

        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          if (!row || row.length === 0) continue;

          const name = String(row[0] || "").trim();
          let emailVal = String(row[1] || "").trim();
          let passwordVal = String(row[2] || "").trim();
          const roleVal = String(row[3] || "").trim().toLowerCase();
          const nisVal = row[4] ? String(row[4]).trim() : null;

          if (!name || !roleVal) continue;
          if (roleVal !== "guru" && roleVal !== "siswa" && roleVal !== "piket") continue;

          // Auto-generate credentials based on role
          if (roleVal === "siswa") {
            if (!nisVal) continue;
            emailVal = `${nisVal}@sman19.sch.id`;
            if (!passwordVal) {
              passwordVal = "siswa19";
            }
          } else if (roleVal === "guru") {
            const nipFromExcel = emailVal || "guru";
            emailVal = `${nipFromExcel}@sman19.sch.id`;
            if (!passwordVal) {
              passwordVal = "guru19*";
            }
          } else if (roleVal === "piket") {
            if (!emailVal || !passwordVal) continue;
          }

          try {
            const { error: signUpError } = await supabaseAdminAuth.auth.admin.createUser({
              email: emailVal,
              password: passwordVal,
              email_confirm: true,
              user_metadata: {
                fullName: name,
                role: roleVal,
                nis: roleVal === "siswa" ? nisVal : null
              }
            });

            if (signUpError) throw signUpError;
            addedCount++;
            await new Promise((r) => setTimeout(r, 200));
          } catch (err) {
            console.error(`Gagal mendaftarkan akun ${emailVal}:`, err);
            failCount++;
          }
        }

        if (addedCount > 0) {
          setSuccessMsg(`Berhasil mengimpor ${addedCount} akun login baru!${failCount > 0 ? ` (${failCount} baris gagal).` : ""}`);
          setIsImportUserOpen(false);
          loadUsersData();
        } else {
          setImportUserError("Tidak ada baris data baru yang valid untuk diimpor.");
        }
      } catch (err: any) {
        setImportUserError("Gagal membaca Excel: " + err.message);
      } finally {
        setIsSubmitting(false);
        e.target.value = "";
      }
    };
    reader.readAsBinaryString(file);
  };

  const selectableCount = profiles.filter(p => p.role !== "super_admin").length;
  const allSelectableSelected = selectableCount > 0 && profiles.filter(p => p.role !== "super_admin").every(p => selectedIds.includes(p.id));

  const filteredProfiles = useMemo(() => {
    return profiles.filter(p => {
      const matchesSearch = searchQuery === "" || 
        p.nama.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.nis && p.nis.includes(searchQuery));
      const matchesRole = roleFilter === "Semua" || p.role === roleFilter;
      return matchesSearch && matchesRole;
    });
  }, [profiles, searchQuery, roleFilter]);

  const totalPages = Math.ceil(filteredProfiles.length / itemsPerPage);
  const paginatedProfiles = filteredProfiles.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const roleList = ["Semua", "super_admin", "guru", "siswa", "piket"];

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
            className="fixed bottom-6 right-6 z-50 bg-brand-950 text-white px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-2 border border-brand-800"
          >
            <Check className="w-4 h-4 text-emerald-400 bg-emerald-500/10 p-0.5 rounded-full" />
            <span className="text-xs font-bold tracking-wide">{toastMsg}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header Actions Bar — matching Data Siswa layout */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Left: Search + Filter */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 flex-1">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 text-brand-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Cari nama, email, atau NIS..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              className="w-full pl-10 pr-4 py-3 bg-white border border-brand-100 rounded-2xl text-xs font-bold text-brand-900 placeholder:text-brand-300 focus:ring-2 focus:ring-brand-500 outline-none transition-all"
            />
          </div>

              <div className="relative">
                <select
                  value={roleFilter}
                  onChange={(e) => { setRoleFilter(e.target.value); setCurrentPage(1); }}
                  className="appearance-none pl-4 pr-10 py-3 bg-white border border-brand-100 rounded-2xl text-xs font-bold text-brand-800 focus:ring-2 focus:ring-brand-500 outline-none cursor-pointer transition-all"
                >
                  {roleList.map((r) => (
                    <option key={r} value={r}>
                      {r === "Semua" ? "Semua Role" : r === "super_admin" ? "Super Admin" : r.charAt(0).toUpperCase() + r.slice(1)}
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

            {/* Right: Action Buttons */}
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
        <AnimatePresence>
          {selectedIds.length > 0 && (
            <motion.div
              initial={{ height: 0, opacity: 0, y: -10 }}
              animate={{ height: "auto", opacity: 1, y: 0 }}
              exit={{ height: 0, opacity: 0, y: -10 }}
              className="overflow-hidden"
            >
              <div className="bg-rose-50 border border-rose-100 rounded-3xl p-4 flex items-center justify-between shadow-lg shadow-rose-900/5">
                <div className="flex items-center gap-2.5">
                  <Trash2 className="w-5 h-5 text-rose-600 animate-pulse" />
                  <span className="text-xs font-black text-rose-950 uppercase tracking-wider">{selectedIds.length} Akun Terpilih</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setSelectedIds([])}
                    className="px-3.5 py-2 hover:bg-rose-100 text-rose-800 rounded-2xl text-[10px] font-black uppercase transition-all cursor-pointer border border-transparent"
                  >
                    Batal
                  </button>
                  <button
                    onClick={handleBulkDelete}
                    disabled={isSubmitting}
                    className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl text-[10px] font-black uppercase transition-all shadow-md cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    {isSubmitting ? "Menghapus..." : "Hapus Terpilih"}
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

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
                        checked={allSelectableSelected}
                        onChange={toggleSelectAll}
                        className="w-4 h-4 rounded-lg border-brand-200 text-brand-600 focus:ring-brand-500 cursor-pointer"
                      />
                    </th>
                    <th className="py-4 px-4">Foto</th>
                    <th className="py-4 px-6">Nama Lengkap</th>
                    <th className="py-4 px-6">Username / Email</th>
                    <th className="py-4 px-6">Peran (Role)</th>
                    <th className="py-4 px-6">Tautan NIS Murid</th>
                    <th className="py-4 px-6">Terdaftar Pada</th>
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
                        <td className="py-4 px-6"><div className="h-5 w-16 bg-slate-200 rounded-lg" /></td>
                        <td className="py-4 px-6"><div className="h-4 w-20 bg-slate-200 rounded" /></td>
                        <td className="py-4 px-6"><div className="h-4 w-24 bg-slate-200 rounded" /></td>
                        <td className="py-4 px-6 text-right"><div className="h-7 w-16 bg-slate-200 rounded-xl ml-auto" /></td>
                      </tr>
                    ))
                  ) : paginatedProfiles.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-400 text-xs font-bold">
                        Tidak ada akun yang ditemukan.
                      </td>
                    </tr>
                  ) : (
                    paginatedProfiles.map((p) => {
                      const isSuper = p.role === "super_admin";
                      const isGuru = p.role === "guru";
                      const isSelected = selectedIds.includes(p.id);
                      return (
                        <tr key={p.id} className={`hover:bg-brand-50/20 transition-colors ${isSelected ? "bg-brand-50/40" : ""}`}>
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
                          <td className="py-4 px-4">
                            {(isGuru || p.role === "piket") ? (
                              <div className="relative group">
                                {p.foto_url ? (
                                  <img
                                    src={p.foto_url}
                                    alt={p.nama}
                                    className="w-10 h-10 rounded-full object-cover border-2 border-brand-100"
                                  />
                                ) : (
                                  <div className="w-10 h-10 rounded-full bg-brand-100 flex items-center justify-center border-2 border-brand-200">
                                    <span className="text-xs font-black text-brand-500">
                                      {p.nama.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}
                                    </span>
                                  </div>
                                )}
                                <label
                                  htmlFor="profile-photo-upload-input"
                                  className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center cursor-pointer transition-opacity"
                                  onClick={() => setPhotoUploadProfileId(p.id)}
                                >
                                  <Camera className="w-4 h-4 text-white" />
                                </label>
                              </div>
                            ) : (
                              <div className="w-10 h-10 rounded-full bg-purple-50 flex items-center justify-center border-2 border-purple-200">
                                <ShieldCheck className="w-4 h-4 text-purple-500" />
                              </div>
                            )}
                          </td>
                          <td className="py-4 px-6 font-extrabold text-sm text-brand-950 uppercase">{p.nama}</td>
                          <td className="py-4 px-6 font-mono font-bold text-sm text-brand-900">
                            {p.email.split("@")[0]}
                          </td>
                          <td className="py-4 px-6">
                            <span 
                              className={`font-black text-[10px] uppercase tracking-wider px-2.5 py-1 rounded-xl border shadow-xs ${
                                isSuper 
                                  ? "bg-purple-50 text-purple-700 border-purple-200" 
                                  : isGuru 
                                  ? "bg-amber-50 text-amber-700 border-amber-200" 
                                  : p.role === "piket"
                                  ? "bg-blue-50 text-blue-700 border-blue-200"
                                  : "bg-emerald-50 text-emerald-700 border-emerald-200"
                              }`}
                            >
                              {p.role === "super_admin" ? "SUPER ADMIN" : p.role.replace("_", " ")}
                            </span>
                          </td>
                          <td className="py-4 px-6 font-mono text-brand-700 text-sm">
                            {p.nis ? (
                              <span className="bg-brand-50 px-2 py-0.5 rounded-lg border border-brand-100 text-xs font-bold">
                                {p.nis}
                              </span>
                            ) : (
                              <span className="text-brand-300 text-xs">-</span>
                            )}
                          </td>
                          <td className="py-4 px-6 text-brand-500 text-xs font-semibold">
                            {new Date(p.created_at).toLocaleDateString("id-ID", {
                              dateStyle: "medium"
                            })}
                          </td>
                          <td className="py-4 px-6 text-right whitespace-nowrap">
                            {!isSuper && (
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() => openEditModal(p)}
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

            {/* Pagination Footer */}
            <div className="bg-brand-50/30 p-4 border-t border-brand-100 text-sm text-brand-500 font-bold flex flex-col sm:flex-row items-center justify-between gap-3">
              <span className="whitespace-nowrap tabular-nums">
                Menampilkan {filteredProfiles.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0}–{Math.min(currentPage * itemsPerPage, filteredProfiles.length)} dari {filteredProfiles.length} akun
              </span>

              {totalPages > 1 && (
                <div className="flex items-center gap-1 sm:gap-1.5 select-none shrink-0">
                  <button
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                    className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center bg-white hover:bg-brand-50 border border-brand-200 rounded-xl text-brand-850 disabled:opacity-40 disabled:hover:bg-white cursor-pointer transition-all shrink-0"
                    title="Halaman Sebelumnya"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  {getVisiblePages(totalPages, currentPage, 5).map((pageNum, i) => (
                    typeof pageNum === "string" ? (
                      <span key={`ellipsis-${i}`} className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center text-brand-400 font-bold shrink-0">...</span>
                    ) : (
                      <button
                        key={pageNum}
                        onClick={() => setCurrentPage(pageNum)}
                        className={`w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-xl border text-sm font-black transition-all cursor-pointer shrink-0 ${
                          currentPage === pageNum
                            ? "bg-brand-600 border-brand-600 text-white"
                            : "bg-white hover:bg-brand-50 border-brand-200 text-brand-800"
                        }`}
                      >
                        {pageNum}
                      </button>
                    )
                  ))}
                  <button
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                    className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center bg-white hover:bg-brand-50 border border-brand-200 rounded-xl text-brand-850 disabled:opacity-40 disabled:hover:bg-white cursor-pointer transition-all shrink-0"
                    title="Halaman Berikutnya"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </AnimatePresence>

        {/* CREATE MANUAL USER MODAL */}
        {createPortal(
          <AnimatePresence>
            {isAddUserOpen && (
              <div className="fixed inset-0 bg-brand-950/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="fixed inset-0"
                />
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 15 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 10 }}
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  className="bg-white rounded-3xl p-6 w-full max-w-md border border-brand-100 shadow-2xl space-y-4 relative z-10"
                >
              <div className="flex justify-between items-center border-b pb-3 border-brand-50">
                <h3 className="text-base font-extrabold text-brand-950 flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-brand-600" />
                  Registrasi Akun Baru
                </h3>
                <button
                  onClick={() => setIsAddUserOpen(false)}
                  className="p-1 text-brand-400 hover:text-brand-600 hover:bg-brand-50 rounded-xl cursor-pointer"
                >
                  &times;
                </button>
              </div>

              <form onSubmit={handleCreateUser} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-black text-brand-900 uppercase block">Pilih Peran Pengguna</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(["guru", "siswa", "piket"] as const).map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => {
                          setRole(r);
                          setErrorMsg("");
                          setFullName("");
                          setEmail("");
                          setPassword("");
                          setSelectedNis("");
                          setNip("");
                        }}
                        className={`py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                          role === r
                            ? "bg-brand-600 border-brand-600 text-white shadow-md"
                            : "bg-white border-brand-100 text-brand-600 hover:bg-brand-50"
                        }`}
                      >
                        {r === "guru" ? "Guru" : r === "siswa" ? "Murid" : "Piket"}
                      </button>
                    ))}
                  </div>
                </div>

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

                {(role === "guru" || role === "siswa") && (
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
                        placeholder={role === "siswa" ? "Pilih Murid terlebih dahulu" : "Nama Lengkap Guru & Gelar"}
                        className="w-full border border-brand-100 rounded-xl py-2.5 pl-10 pr-4 text-sm font-semibold focus:ring-1 focus:ring-brand-500 outline-none text-brand-900 bg-brand-50/20 disabled:opacity-75"
                      />
                    </div>
                  </div>
                )}

                {role === "guru" && (
                  <div className="space-y-1 animate-slide-up">
                    <label className="text-xs font-black text-brand-900 uppercase block">Nomor NIP Guru</label>
                    <input
                      type="text"
                      required
                      value={nip}
                      onChange={(e) => setNip(e.target.value)}
                      placeholder="Contoh: 19761102"
                      className="w-full border border-brand-100 rounded-xl py-2.5 px-3 text-sm font-semibold focus:ring-1 focus:ring-brand-500 outline-none text-brand-900 bg-brand-50/20"
                    />
                  </div>
                )}

                {role === "siswa" && (
                  <div className="space-y-1 animate-slide-up">
                    <label className="text-xs font-black text-brand-900 uppercase block">Hubungkan NIS Murid</label>
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
                      <label className="text-xs font-black text-brand-900 uppercase block">Email Login</label>
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
                      <label className="text-xs font-black text-brand-900 uppercase block">Password Baru</label>
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

                {(role === "guru" || role === "siswa") && (
                  <div className="text-[10px] font-bold text-brand-500 bg-brand-50/60 border border-brand-100/50 p-3 rounded-2xl space-y-1 animate-slide-up leading-relaxed">
                    <div><strong className="text-brand-900 font-extrabold">Username (Login):</strong> {role === "siswa" ? (selectedNis || "[NIS Murid]") : (nip || "[NIP Guru]")}</div>
                    <div><strong className="text-brand-900 font-extrabold">Password:</strong> {role === "siswa" ? "siswa19" : "guru19*"}</div>
                  </div>
                )}

                <div className="flex gap-2 justify-end pt-4 border-t border-brand-50">
                  <button
                    type="button"
                    onClick={() => setIsAddUserOpen(false)}
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
                </motion.div>
              </div>
            )}
          </AnimatePresence>,
          document.body
        )}

        {/* EDIT ACCOUNT MODAL */}
        {createPortal(
          <AnimatePresence>
            {editingProfile && (
              <div className="fixed inset-0 bg-brand-950/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="fixed inset-0"
                />
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 15 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 10 }}
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  className="bg-white rounded-3xl p-6 w-full max-w-md border border-brand-100 shadow-2xl space-y-4 relative z-10"
                >
              <div className="flex justify-between items-center border-b pb-3 border-brand-50">
                <h3 className="text-base font-extrabold text-brand-950 flex items-center gap-2">
                  <Pencil className="w-5 h-5 text-brand-600" />
                  Edit Akun
                </h3>
                <button
                  onClick={() => setEditingProfile(null)}
                  className="p-1 text-brand-400 hover:text-brand-600 hover:bg-brand-50 rounded-xl cursor-pointer"
                >
                  &times;
                </button>
              </div>

              <form onSubmit={handleEditAccount} className="space-y-4">
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
                    {(editingProfile?.role === "siswa" || editingProfile?.role === "guru") ? "Username (Login)" : "Email / Username Login"}
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-brand-400" />
                    <input
                      type="text"
                      required
                      value={editEmail}
                      onChange={(e) => setEditEmail(e.target.value)}
                      readOnly={editingProfile?.role === "siswa" || editingProfile?.role === "guru"}
                      className={`w-full border border-brand-100 rounded-xl py-2.5 pl-10 pr-4 text-sm font-semibold focus:ring-1 focus:ring-brand-500 outline-none text-brand-900 bg-brand-50/20${(editingProfile?.role === "siswa" || editingProfile?.role === "guru") ? " opacity-75 cursor-not-allowed" : ""}`}
                    />
                  </div>
                  {(editingProfile?.role === "siswa" || editingProfile?.role === "guru") && (
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
                  <p className="text-[10px] text-brand-400 font-medium">Kosongkan jika tidak ingin mengubah password.</p>
                </div>

                <div className="flex gap-2 justify-end pt-4 border-t border-brand-50">
                  <button
                    type="button"
                    onClick={() => setEditingProfile(null)}
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
                </motion.div>
              </div>
            )}
          </AnimatePresence>,
          document.body
        )}

        {/* EXCEL IMPORT USER ACCOUNTS MODAL */}
        {createPortal(
          <AnimatePresence>
            {isImportUserOpen && (
              <div className="fixed inset-0 bg-brand-950/65 backdrop-blur-xs flex items-center justify-center z-50 p-4">
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="fixed inset-0"
                />
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 15 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 10 }}
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  className="bg-white rounded-3xl p-6 w-full max-w-md border border-brand-100 shadow-2xl space-y-4 relative z-10"
                >
              <div className="flex justify-between items-center border-b pb-3 border-brand-50">
                <h3 className="text-base font-extrabold text-brand-950 flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
                  Impor Akun Massal dari Excel
                </h3>
                <button
                  onClick={() => setIsImportUserOpen(false)}
                  className="p-1 text-brand-400 hover:text-brand-600 hover:bg-brand-50 rounded-xl cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-4">
                <p className="text-xs text-brand-500 leading-relaxed font-medium">
                  Unggah file Excel Anda yang berisi data akun Guru dan Murid. Gunakan format tabel yang sesuai agar registrasi berjalan lancar.
                </p>

                <div className="bg-brand-50/70 border border-brand-100 rounded-2xl p-4 flex items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-bold text-brand-950">Unduh Template Excel</h4>
                    <p className="text-xs text-brand-400 font-medium mt-0.5">Gunakan format ini untuk import</p>
                  </div>
                  <button
                    onClick={downloadUserTemplate}
                    className="px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold border border-emerald-200 rounded-xl text-sm flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Template
                  </button>
                </div>

                {importUserError && (
                  <div className="p-3.5 bg-rose-50 rounded-2xl border border-rose-100 text-sm text-rose-800 flex items-center gap-2">
                    <AlertCircle className="w-4.5 h-4.5 text-rose-600 flex-shrink-0" />
                    <span>{importUserError}</span>
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-xs font-black text-brand-900 uppercase block">Pilih Berkas Excel (.xlsx / .xls)</label>
                  <input
                    type="file"
                    accept=".xlsx, .xls"
                    onChange={handleUserExcelImport}
                    disabled={isSubmitting}
                    className="w-full text-sm text-brand-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-bold file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100 file:cursor-pointer disabled:opacity-50"
                  />
                </div>
              </div>

              {isSubmitting && (
                <div className="py-4 text-center">
                  <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                  <p className="text-xs font-bold text-brand-600">Sedang memproses & mendaftarkan akun di database Supabase...</p>
                </div>
              )}

              <div className="flex justify-end pt-3 border-t border-brand-50">
                <button
                  onClick={() => setIsImportUserOpen(false)}
                  className="px-4 py-2 border border-brand-100 rounded-xl text-xs font-bold text-brand-600 hover:bg-brand-50 cursor-pointer"
                >
                  Tutup
                </button>
              </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>,
          document.body
        )}

      {/* CONFIRM DELETE SINGLE USER */}
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

      {/* CONFIRM BULK DELETE USERS */}
      <ConfirmationModal
        isOpen={isBulkDeleteConfirm}
        onClose={() => setIsBulkDeleteConfirm(false)}
        onConfirm={executeBulkDelete}
        title="Hapus Massal Akun User?"
        message={`Apakah Anda yakin ingin menghapus ${selectedIds.filter(id => profiles.find(p => p.id === id && p.role !== "super_admin")).length} akun sekaligus? Profil akun akan dihapus dari database.`}
        confirmText="Ya, Hapus Semua"
        cancelText="Batal"
        type="danger"
      />

    </div>
  );
}
