import React, { useState, useEffect } from "react";
import { motion } from "motion/react";
import { 
  Users, 
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
  Database,
  X,
  Pencil
} from "lucide-react";
import { supabase, supabaseAdminAuth } from "../supabaseClient";
import { Siswa } from "../types";
import * as XLSX from "xlsx";
import KelolaSiswaView from "./KelolaSiswaView";
import ConfirmationModal from "./ConfirmationModal";

interface Profile {
  id: string;
  email: string;
  nama: string;
  role: string;
  nis: string | null;
  created_at: string;
}

interface KelolaPenggunaViewProps {
  userSession: any;
  onRefreshHistory: () => void;
}

export default function KelolaPenggunaView({ userSession, onRefreshHistory }: KelolaPenggunaViewProps) {
  // Tab selector: "accounts" for User Accounts (profiles), "students" for Student Directory
  const [dbTab, setDbTab] = useState<"accounts" | "students">("accounts");

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

  // Delete confirmation modals
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; email: string } | null>(null);
  const [isBulkDeleteConfirm, setIsBulkDeleteConfirm] = useState(false);

  // Edit account state
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);
  const [editEmail, setEditEmail] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editNama, setEditNama] = useState("");
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    if (dbTab === "accounts") {
      loadUsersData();
    }
  }, [dbTab]);

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
        setErrorMsg("NIS wajib dipilih untuk pengguna dengan peran Siswa.");
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
    setEditEmail(p.email);
    setEditNama(p.nama);
    setEditPassword("");
  };

  // Handle edit account
  const handleEditAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProfile) return;
    setIsEditing(true);

    try {
      // Update auth user email and password via admin client
      const updates: any = {};
      if (editEmail !== editingProfile.email) {
        updates.email = editEmail;
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
          .update({ nama: editNama, email: editEmail })
          .eq("id", editingProfile.id);
        if (profileErr) throw new Error("Gagal update profil: " + profileErr.message);
      } else if (editEmail !== editingProfile.email) {
        const { error: profileErr } = await supabase
          .from("profiles")
          .update({ email: editEmail })
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
            if (!emailVal || !emailVal.includes("@")) {
              emailVal = `${nisVal}@sman19.sch.id`;
            }
            if (!passwordVal) {
              passwordVal = "siswa19";
            }
          } else if (roleVal === "guru") {
            if (!emailVal || !emailVal.includes("@")) {
              const parsedNip = emailVal || "guru";
              emailVal = `${parsedNip}@sman19.sch.id`;
            }
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

  return (
    <div className="space-y-6">
      
      {/* Toast */}
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-50 bg-brand-950 text-white px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-2 border border-brand-800 animate-bounce">
          <Check className="w-4 h-4 text-emerald-400 bg-emerald-500/10 p-0.5 rounded-full" />
          <span className="text-xs font-bold tracking-wide">{toastMsg}</span>
        </div>
      )}

      {/* Main Tab Controls */}
      <div className="bg-white rounded-2xl p-1.5 border border-brand-100/60 flex gap-2 max-w-md">
        <button
          onClick={() => setDbTab("accounts")}
          className={`flex-1 py-2.5 text-sm font-bold rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer ${
            dbTab === "accounts"
              ? "bg-brand-600 text-white shadow-md"
              : "text-brand-600 hover:bg-brand-50"
          }`}
        >
          <Database className="w-4 h-4" />
          Kelola Akun Login
        </button>
        <button
          onClick={() => setDbTab("students")}
          className={`flex-1 py-2.5 text-sm font-bold rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer ${
            dbTab === "students"
              ? "bg-brand-600 text-white shadow-md"
              : "text-brand-600 hover:bg-brand-50"
          }`}
        >
          <Users className="w-4 h-4" />
          Kelola Data Siswa
        </button>
      </div>

      {/* CONDITIONAL RENDER BY TAB */}
      {dbTab === "students" ? (
        <div className="animate-fade-in">
          <KelolaSiswaView userSession={userSession} onRefreshHistory={onRefreshHistory} />
        </div>
      ) : (
        <div className="space-y-6 animate-fade-in">
          
          {/* Compact Button Actions Row */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <h2 className="text-xl font-extrabold text-brand-950 tracking-tight">Registrasi & Akun Pengguna</h2>
            <div className="flex gap-2 justify-end">
            <button
              onClick={loadUsersData}
              className="p-3 bg-brand-50 text-brand-700 hover:bg-brand-100 rounded-2xl border border-brand-100 flex items-center justify-center transition-colors cursor-pointer"
              title="Refresh Data"
            >
              <RefreshCw className="w-4.5 h-4.5" />
            </button>
            
            <button
              onClick={() => setIsImportUserOpen(true)}
              className="px-4 py-3 bg-white hover:bg-brand-50 text-brand-700 font-bold rounded-2xl text-sm border border-brand-200 flex items-center gap-2 cursor-pointer transition-all"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              Impor Excel
            </button>

            <button
              onClick={() => setIsAddUserOpen(true)}
              className="px-5 py-3 brand-gradient hover:opacity-95 text-white font-bold rounded-2xl text-sm transition-all shadow-md shadow-brand-500/25 flex items-center gap-2 cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              Buat Akun Baru
            </button>
          </div>
        </div>

        {/* Success / Error Messages */}
        {successMsg && (
          <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100 text-xs text-emerald-800 flex items-center gap-2 font-semibold animate-fade-in">
            <Check className="w-4.5 h-4.5 text-emerald-600 bg-emerald-100 rounded-full p-0.5" />
            <span>{successMsg}</span>
          </div>
        )}

        {errorMsg && (
          <div className="p-4 bg-rose-50 rounded-2xl border border-rose-100 text-xs text-rose-800 flex items-center gap-2 font-semibold animate-fade-in">
            <AlertCircle className="w-4.5 h-4.5 text-rose-600" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Bulk Actions Banner */}
        {selectedIds.length > 0 && (
          <div className="bg-rose-50 border border-rose-100 rounded-2xl p-4 flex items-center justify-between shadow-lg shadow-rose-900/5">
            <div className="flex items-center gap-2.5">
              <Trash2 className="w-5 h-5 text-rose-600 animate-pulse" />
              <span className="text-xs font-black text-rose-950 uppercase tracking-wider">{selectedIds.length} Akun Terpilih</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSelectedIds([])}
                className="px-3 py-2 text-[10px] font-bold text-brand-600 bg-white border border-brand-200 rounded-xl hover:bg-brand-50 cursor-pointer"
              >
                Batal
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={isSubmitting}
                className="px-4 py-2 text-[10px] font-black text-white bg-rose-600 hover:bg-rose-700 rounded-xl cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                <Trash2 className="w-3 h-3" />
                {isSubmitting ? "Menghapus..." : "Hapus Terpilih"}
              </button>
            </div>
          </div>
        )}

        {/* User accounts list table */}
        <div className="bg-white rounded-3xl border border-brand-100 shadow-xl shadow-brand-900/5 overflow-hidden">
          {isLoading ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-brand-50/40 border-b border-brand-100 text-brand-500 text-xs font-black uppercase tracking-wider">
                    <th className="py-4 px-6 w-10"></th>
                    <th className="py-4 px-6">Nama Lengkap</th>
                    <th className="py-4 px-6">Email Login</th>
                    <th className="py-4 px-6">Peran (Role)</th>
                    <th className="py-4 px-6">Tautan NIS Siswa</th>
                    <th className="py-4 px-6">Terdaftar Pada</th>
                    <th className="py-4 px-6 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-50">
                  {[...Array(5)].map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td className="py-4 px-6"><div className="h-4 w-4 bg-brand-100/60 rounded" /></td>
                      <td className="py-4 px-6"><div className="h-5 bg-brand-100/60 rounded-md w-36"></div></td>
                      <td className="py-4 px-6"><div className="h-4.5 bg-brand-50 rounded-md w-48"></div></td>
                      <td className="py-4 px-6"><div className="h-6 bg-brand-100/55 rounded-lg w-16"></div></td>
                      <td className="py-4 px-6"><div className="h-5 bg-brand-50 rounded-md w-20"></div></td>
                      <td className="py-4 px-6"><div className="h-4 bg-brand-50 rounded-md w-24"></div></td>
                      <td className="py-4 px-6 text-right"><div className="h-7 w-16 bg-brand-100/50 rounded-xl ml-auto"></div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-brand-50/40 border-b border-brand-100 text-brand-500 text-xs font-black uppercase tracking-wider">
                    <th className="py-4 px-6 w-10">
                      <input
                        type="checkbox"
                        checked={allSelectableSelected}
                        onChange={toggleSelectAll}
                        className="w-4 h-4 rounded-lg border-brand-200 text-brand-600 focus:ring-brand-500 cursor-pointer"
                      />
                    </th>
                    <th className="py-4 px-6">Nama Lengkap</th>
                    <th className="py-4 px-6">Username / Email</th>
                    <th className="py-4 px-6">Peran (Role)</th>
                    <th className="py-4 px-6">Tautan NIS Siswa</th>
                    <th className="py-4 px-6">Terdaftar Pada</th>
                    <th className="py-4 px-6 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-50 text-brand-900 text-sm font-semibold">
                  {profiles.length > 0 ? (
                    profiles.map((p) => {
                      const isSuper = p.role === "super_admin";
                      const isGuru = p.role === "guru";
                      const isSelected = selectedIds.includes(p.id);
                      return (
                        <tr key={p.id} className={`transition-colors ${isSelected ? "bg-brand-50/40" : "hover:bg-brand-50/10"}`}>
                          <td className="py-4 px-6">
                            {!isSuper && (
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleSelect(p.id)}
                                className="w-4 h-4 rounded-lg border-brand-200 text-brand-600 focus:ring-brand-500 cursor-pointer"
                              />
                            )}
                          </td>
                          <td className="py-4 px-6 font-bold text-brand-950">{p.nama}</td>
                          <td className="py-4 px-6 font-mono text-xs text-brand-600">
                            {p.email.endsWith("@sman19.sch.id") ? p.email.split("@")[0] : p.email}
                          </td>
                          <td className="py-4 px-6">
                            <span 
                              className={`font-black text-[11px] uppercase tracking-wider px-2 py-0.5 rounded-md ${
                                isSuper 
                                  ? "bg-purple-100 text-purple-700" 
                                  : isGuru 
                                  ? "bg-amber-100 text-amber-700" 
                                  : p.role === "piket"
                                  ? "bg-blue-100 text-blue-700"
                                  : "bg-emerald-100 text-emerald-700"
                              }`}
                            >
                              {p.role.replace("_", " ")}
                            </span>
                          </td>
                          <td className="py-4 px-6 font-mono text-brand-700">
                            {p.nis ? (
                              <span className="bg-brand-50 px-2 py-0.5 rounded-md border border-brand-100">
                                {p.nis}
                              </span>
                            ) : (
                              <span className="text-brand-300">-</span>
                            )}
                          </td>
                          <td className="py-4 px-6 text-brand-500 text-xs">
                            {new Date(p.created_at).toLocaleDateString("id-ID", {
                              dateStyle: "medium"
                            })}
                          </td>
                          <td className="py-4 px-6 text-right">
                            {!isSuper && (
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={() => openEditModal(p)}
                                  className="text-brand-500 hover:text-brand-700 p-1.5 hover:bg-brand-50 rounded-xl transition-all cursor-pointer"
                                  title="Edit Akun"
                                >
                                  <Pencil className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleForceDeleteUser(p.id, p.email)}
                                  className="text-rose-500 hover:text-rose-700 p-1.5 hover:bg-rose-50 rounded-xl transition-all cursor-pointer"
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
                  ) : (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-brand-400 font-bold">
                        Belum ada pengguna terdaftar.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* CREATE MANUAL USER MODAL */}
        {isAddUserOpen && (
          <div className="fixed inset-0 bg-brand-950/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-3xl p-6 w-full max-w-md border border-brand-100 shadow-2xl space-y-4 animate-fade-in">
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
                  <label className="text-xs font-black text-brand-900 uppercase block">Peran Sistem (Role)</label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => { setRole("guru"); setSelectedNis(""); setEmail(""); setPassword(""); }}
                      className={`py-2 px-1 text-center text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                        role === "guru"
                          ? "bg-brand-50 text-brand-700 border-brand-300"
                          : "border-brand-100 text-brand-500 hover:bg-brand-50/50"
                      }`}
                    >
                      Guru
                    </button>
                    <button
                      type="button"
                      onClick={() => { setRole("siswa"); setEmail(""); setPassword(""); }}
                      className={`py-2 px-1 text-center text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                        role === "siswa"
                          ? "bg-brand-50 text-brand-700 border-brand-300"
                          : "border-brand-100 text-brand-500 hover:bg-brand-50/50"
                      }`}
                    >
                      Siswa
                    </button>
                    <button
                      type="button"
                      onClick={() => { setRole("piket"); setSelectedNis(""); setEmail(""); setPassword(""); }}
                      className={`py-2 px-1 text-center text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                        role === "piket"
                          ? "bg-brand-50 text-brand-700 border-brand-300"
                          : "border-brand-100 text-brand-500 hover:bg-brand-50/50"
                      }`}
                    >
                      Piket
                    </button>
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
                        placeholder={role === "siswa" ? "Pilih Siswa terlebih dahulu" : "Nama Lengkap Guru & Gelar"}
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
                    <label className="text-xs font-black text-brand-900 uppercase block">Hubungkan NIS Siswa</label>
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
                      <option value="">-- Pilih NIS & Nama Siswa --</option>
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
                    <div><strong className="text-brand-900 font-extrabold">Username (Login):</strong> {role === "siswa" ? (selectedNis || "[NIS Siswa]") : (nip || "[NIP Guru]")}</div>
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
            </div>
          </div>
        )}

        {/* EDIT ACCOUNT MODAL */}
        {editingProfile && (
          <div className="fixed inset-0 bg-brand-950/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-3xl p-6 w-full max-w-md border border-brand-100 shadow-2xl space-y-4 animate-fade-in">
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
                  <label className="text-xs font-black text-brand-900 uppercase block">Email / Username Login</label>
                  <div className="relative">
                    <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-brand-400" />
                    <input
                      type="email"
                      required
                      value={editEmail}
                      onChange={(e) => setEditEmail(e.target.value)}
                      className="w-full border border-brand-100 rounded-xl py-2.5 pl-10 pr-4 text-sm font-semibold focus:ring-1 focus:ring-brand-500 outline-none text-brand-900 bg-brand-50/20"
                    />
                  </div>
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
            </div>
          </div>
        )}

        {/* EXCEL IMPORT USER ACCOUNTS MODAL */}
        {isImportUserOpen && (
          <div className="fixed inset-0 bg-brand-950/65 backdrop-blur-xs flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-3xl p-6 w-full max-w-md border border-brand-100 shadow-2xl space-y-4 animate-fade-in">
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
                  Unggah file Excel Anda yang berisi data akun Guru dan Siswa. Gunakan format tabel yang sesuai agar registrasi berjalan lancar.
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
            </div>
          </div>
        )}

        </div>
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
