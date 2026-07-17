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
  Camera,
  Image
} from "lucide-react";
import { compressImage } from "./KelolaSiswaView";
import { getVisiblePages } from "../pagination";
import { supabase, supabaseAdminAuth } from "../supabaseClient";
import { Siswa } from "../types";
import * as XLSX from "xlsx";
import ConfirmationModal from "./ConfirmationModal";
import { toSentenceCase } from "../formatName";

interface Profile {
  id: string;
  email: string;
  nama: string;
  role: string;
  nis: string | null;
  foto_url: string | null;
  created_at: string;
}

interface PhotoMatchItem {
  id: string;
  file: File;
  previewUrl: string;
  status: "matched" | "suggested" | "nomatch";
  matchedProfileId: string | null;
  similarity: number;
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
  const [toastType, setToastType] = useState<"success" | "error" | "loading">("success");
  const [uploadProgress, setUploadProgress] = useState(0);

  // Form Fields for user creation
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<"guru" | "kepala_sekolah" | "siswa" | "piket">("guru");
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

  // Bulk photo upload state
  const [isImportPhotoOpen, setIsImportPhotoOpen] = useState(false);
  const [isUploadingPhotos, setIsUploadingPhotos] = useState(false);
  const [uploadStatusMsg, setUploadStatusMsg] = useState("");
  const [photoMatchItems, setPhotoMatchItems] = useState<PhotoMatchItem[]>([]);
  const [photoDeleteTarget, setPhotoDeleteTarget] = useState<{ id: string; nama: string; foto_url: string } | null>(null);

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
    } else if (role === "guru" || role === "kepala_sekolah") {
      if (!nip) {
        setErrorMsg(`Username (NIP) wajib diisi untuk ${role === "kepala_sekolah" ? "Kepala Sekolah" : "Guru"}.`);
        return;
      }
      if (!fullName) {
        setErrorMsg("Nama Lengkap wajib diisi.");
        return;
      }
      finalEmail = `${nip}@sman19.sch.id`;
      finalPassword = password.trim() || "guru19*";
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

      setSuccessMsg(`Akun "${toSentenceCase(fullName)}" berhasil dibuat sebagai ${role.toUpperCase()}!`);
      
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
      const fullEmail = (editingProfile.role === "siswa" || editingProfile.role === "guru" || editingProfile.role === "kepala_sekolah")
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

    showToast("Mengunggah foto...", "loading");
    setUploadProgress(0);

    try {
      // 1. COMPRESS
      setUploadProgress(15);
      let compressedBlob: Blob;
      try {
        compressedBlob = await compressImage(file, 300, 400, 0.75);
      } catch (compressErr: any) {
        throw new Error("Gagal mengompresi gambar: " + compressErr.message);
      }
      const compressedFile = new File([compressedBlob], `${profile.id}.jpg`, { type: "image/jpeg" });

      // 2. UPLOAD
      setUploadProgress(50);
      const fileName = `${profile.id}_${Date.now()}.jpg`;
      const { error: uploadErr } = await supabase.storage
        .from('profile-photos')
        .upload(fileName, compressedFile, {
          cacheControl: '3600',
          upsert: true
        });

      if (uploadErr) throw new Error("Upload ke storage gagal: " + uploadErr.message);

      // 4. GET PUBLIC URL
      setUploadProgress(75);
      const { data: urlData } = supabase.storage
        .from('profile-photos')
        .getPublicUrl(fileName);

      const publicUrl = urlData.publicUrl;

      // 5. UPDATE PROFILES TABLE
      setUploadProgress(90);
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

  const calculateSimilarity = (a: string, b: string): number => {
    const lenA = a.length;
    const lenB = b.length;
    if (lenA === 0 || lenB === 0) return 0;
    const matrix: number[][] = [];
    for (let i = 0; i <= lenA; i++) { matrix[i] = [i]; }
    for (let j = 0; j <= lenB; j++) { matrix[0][j] = j; }
    for (let i = 1; i <= lenA; i++) {
      for (let j = 1; j <= lenB; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + cost);
      }
    }
    const maxLen = Math.max(lenA, lenB);
    return 1 - matrix[lenA][lenB] / maxLen;
  };

  const matchFileToUsername = (filename: string): { matchedProfileId: string | null; status: "matched" | "suggested" | "nomatch"; similarity: number } => {
    const cleanFilename = filename.split('.').slice(0, -1).join('.').trim().toLowerCase();
    const nameOnly = cleanFilename.replace(/^[\d_\-.\s]+/, "").replace(/[\d_\-.\s]+$/, "").trim();
    
    // Try matching by digits (NIS/NIP) in filename
    const digitsMatch = cleanFilename.match(/\d{4,}/);
    if (digitsMatch) {
      const targetUsername = digitsMatch[0];
      const matched = profiles.find(p => p.email.split("@")[0] === targetUsername);
      if (matched) return { matchedProfileId: matched.id, status: "matched", similarity: 1.0 };
    }
    
    // Try exact name match
    if (nameOnly) {
      const cleanNameOnly = nameOnly.replace(/[^a-z0-9]/g, "");
      const exactMatch = profiles.find(p => p.nama.toLowerCase().replace(/[^a-z0-9]/g, "") === cleanNameOnly);
      if (exactMatch) return { matchedProfileId: exactMatch.id, status: "matched", similarity: 1.0 };
    }
    
    // Fuzzy match
    let bestId: string | null = null;
    let maxSim = 0;
    const fuzzySource = nameOnly || cleanFilename;
    profiles.forEach(p => {
      const sim = calculateSimilarity(fuzzySource, p.nama);
      if (sim > maxSim) { maxSim = sim; bestId = p.id; }
    });
    
    if (maxSim >= 0.75) return { matchedProfileId: bestId, status: "matched", similarity: maxSim };
    if (maxSim >= 0.45) return { matchedProfileId: bestId, status: "suggested", similarity: maxSim };
    return { matchedProfileId: null, status: "nomatch", similarity: 0 };
  };

  const handleMultipleFilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const newItems: PhotoMatchItem[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const matchResult = matchFileToUsername(file.name);
      newItems.push({
        id: Math.random().toString(36).substring(7),
        file,
        previewUrl: URL.createObjectURL(file),
        status: matchResult.status,
        matchedProfileId: matchResult.matchedProfileId,
        similarity: matchResult.similarity
      });
    }
    setPhotoMatchItems(prev => [...prev, ...newItems]);
    e.target.value = "";
  };

  const handleZipFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingPhotos(true);
    setUploadProgress(0);
    setUploadStatusMsg("Membaca file ZIP...");
    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      const zipData = await zip.loadAsync(file);
      const imageEntries: { path: string; entry: any }[] = [];
      zipData.forEach((relativePath, entry) => {
        if (!entry.dir && relativePath.match(/\.(jpe?g|png|webp)$/i)) {
          imageEntries.push({ path: relativePath, entry });
        }
      });
      if (imageEntries.length === 0) {
        alert("Tidak ditemukan file gambar dalam ZIP.");
        setIsUploadingPhotos(false);
        setUploadStatusMsg("");
        e.target.value = "";
        return;
      }
      const newItems: PhotoMatchItem[] = [];
      for (let idx = 0; idx < imageEntries.length; idx++) {
        const { path, entry } = imageEntries[idx];
        const filename = path.split("/").pop() || path;
        const blob = await entry.async("blob");
        const imageFile = new File([blob], filename, { type: `image/${filename.toLowerCase().endsWith('.png') ? 'png' : 'jpeg'}` });
        const matchResult = matchFileToUsername(filename);
        newItems.push({
          id: Math.random().toString(36).substring(7),
          file: imageFile,
          previewUrl: URL.createObjectURL(imageFile),
          status: matchResult.status,
          matchedProfileId: matchResult.matchedProfileId,
          similarity: matchResult.similarity
        });
        setUploadProgress(Math.round(((idx + 1) / imageEntries.length) * 90) + 5);
        setUploadStatusMsg(`Mengekstrak ${idx + 1} dari ${imageEntries.length} foto...`);
      }
      setUploadProgress(100);
      setPhotoMatchItems(prev => [...prev, ...newItems]);
      showToast(`Sukses memuat ${newItems.length} foto dari ZIP!`, "success");
    } catch (err: any) {
      alert("Gagal mengekstrak ZIP: " + err.message);
    } finally {
      setIsUploadingPhotos(false);
      setUploadStatusMsg("");
      setUploadProgress(0);
      e.target.value = "";
    }
  };

  const handleUploadAllPhotos = async () => {
    const itemsToUpload = photoMatchItems.filter(item => item.matchedProfileId !== null);
    if (itemsToUpload.length === 0) { alert("Tidak ada foto tercocokkan."); return; }
    setIsUploadingPhotos(true);
    setUploadProgress(1);
    setUploadStatusMsg("Mempersiapkan server...");
    try {
      let successCount = 0, failCount = 0;
      for (let i = 0; i < itemsToUpload.length; i++) {
        const item = itemsToUpload[i];
        const profile = profiles.find(p => p.id === item.matchedProfileId);
        if (!profile) continue;
        setUploadStatusMsg(`${toSentenceCase(profile.nama)} (${i + 1}/${itemsToUpload.length})...`);
        setUploadProgress(Math.round(((i + 1) / itemsToUpload.length) * 100));
        try {
          const compressedBlob = await compressImage(item.file, 300, 400, 0.75);
          const compressedFile = new File([compressedBlob], `${profile.id}.jpg`, { type: "image/jpeg" });
          const fileName = `${profile.id}_${Date.now()}.jpg`;
          const { error: uploadErr } = await supabase.storage.from('profile-photos').upload(fileName, compressedFile, { cacheControl: '3600', upsert: true });
          if (uploadErr) throw uploadErr;
          const { data: urlData } = supabase.storage.from('profile-photos').getPublicUrl(fileName);
          const publicUrl = urlData.publicUrl;
          const { error: dbErr } = await supabase.from('profiles').update({ foto_url: publicUrl }).eq('id', profile.id);
          if (dbErr) throw dbErr;
          if (profile.nis) {
            await supabase.from('siswa').update({ foto_url: publicUrl }).eq('nis', profile.nis);
          }
          successCount++;
        } catch { failCount++; }
      }
      setUploadProgress(100);
      showToast(`${successCount} foto berhasil diunggah.${failCount > 0 ? ` ${failCount} gagal.` : ""}`, "success");
      loadUsersData();
      setTimeout(() => {
        setIsImportPhotoOpen(false);
        setPhotoMatchItems([]);
        setUploadProgress(0);
        setIsUploadingPhotos(false);
        setUploadStatusMsg("");
      }, 1500);
    } catch (err: any) {
      alert("Gagal: " + err.message);
      setIsUploadingPhotos(false);
      setUploadStatusMsg("");
    }
  };

  const handleDeletePhoto = async () => {
    if (!photoDeleteTarget) return;
    try {
      const { error } = await supabase.from('profiles').update({ foto_url: null }).eq('id', photoDeleteTarget.id);
      if (error) throw error;
      const profile = profiles.find(p => p.id === photoDeleteTarget.id);
      if (profile?.nis) {
        await supabase.from('siswa').update({ foto_url: null }).eq('nis', profile.nis);
      }
      showToast("Foto berhasil dihapus.", "success");
      loadUsersData();
    } catch (err: any) {
      alert("Gagal menghapus foto: " + err.message);
    } finally {
      setPhotoDeleteTarget(null);
    }
  };

  // Download Excel Template for importing accounts
  const downloadUserTemplate = () => {
    try {
      const data = [
        ["Nama Lengkap", "Username (NIS/NIP)", "Role (guru/kepala_sekolah/siswa/piket)", "Password (opsional)"],
        ["Hendra Wijaya, M.Si.", "19761102", "guru", ""],
        ["Ahmad Fauzi", "19001", "siswa", ""],
        ["Petugas Piket 1", "piket1@contoh.com", "piket", "password123"],
        ["Dra. Siti Nurhaliza, M.Pd.", "19780101", "kepala_sekolah", ""]
      ];
      
      const worksheet = XLSX.utils.aoa_to_sheet(data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Template Akun SMAN 19");
      
      worksheet["!cols"] = [
        { wch: 25 },
        { wch: 22 },
        { wch: 20 },
        { wch: 18 }
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
          const username = String(row[1] || "").trim();
          const roleVal = String(row[2] || "").trim().toLowerCase();
          const passwordVal = String(row[3] || "").trim();

          if (!name || !username || !roleVal) continue;
          if (roleVal !== "guru" && roleVal !== "siswa" && roleVal !== "piket" && roleVal !== "kepala_sekolah") continue;

          let emailVal = "";
          let finalPassword = "";
          let nisVal = null;

          if (roleVal === "siswa") {
            emailVal = `${username}@sman19.sch.id`;
            nisVal = username;
            finalPassword = passwordVal || "siswa19";
          } else if (roleVal === "guru" || roleVal === "kepala_sekolah") {
            emailVal = `${username}@sman19.sch.id`;
            finalPassword = passwordVal || "guru19*";
          } else if (roleVal === "piket") {
            if (!username.includes("@")) continue;
            emailVal = username;
            if (!passwordVal) continue;
            finalPassword = passwordVal;
          }

          try {
            const { error: signUpError } = await supabaseAdminAuth.auth.admin.createUser({
              email: emailVal,
              password: finalPassword,
              email_confirm: true,
              user_metadata: {
                fullName: name,
                role: roleVal,
                nis: nisVal
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
            {toastType === "loading" && <div className="w-4 h-4 border-2 border-slate-400 border-t-white rounded-full animate-spin" />}
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

              <div className="relative w-full sm:w-auto">
                <select
                  value={roleFilter}
                  onChange={(e) => { setRoleFilter(e.target.value); setCurrentPage(1); }}
                  className="w-full appearance-none pl-4 pr-10 py-3 bg-white border border-brand-100 rounded-2xl text-xs font-bold text-brand-800 focus:ring-2 focus:ring-brand-500 outline-none cursor-pointer transition-all"
                >
                  {roleList.map((r) => (
                    <option key={r} value={r}>
                      {r === "Semua" ? "Semua Role" : r === "super_admin" ? "Super Admin" : r === "kepala_sekolah" ? "Kepala Sekolah" : r.charAt(0).toUpperCase() + r.slice(1)}
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
                        <td className="py-4 px-4 text-center"><div className="h-4 w-4 bg-slate-200 rounded mx-auto" /></td>
                        <td className="py-4 px-4"><div className="h-10 w-10 bg-slate-200 rounded-full" /></td>
                        <td className="py-4 px-6"><div className="h-4 w-36 bg-slate-200 rounded" /></td>
                        <td className="py-4 px-6"><div className="h-4 w-48 bg-slate-200 rounded" /></td>
                        <td className="py-4 px-6"><div className="h-5 w-16 bg-slate-200 rounded-lg" /></td>
                        <td className="py-4 px-6 text-right"><div className="h-7 w-16 bg-slate-200 rounded-xl ml-auto" /></td>
                      </tr>
                    ))
                  ) : paginatedProfiles.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-400 text-xs font-bold">
                        Tidak ada akun yang ditemukan.
                      </td>
                    </tr>
                  ) : (
                    paginatedProfiles.map((p) => {
                      const isSuper = p.role === "super_admin";
                      const isGuru = p.role === "guru" || p.role === "kepala_sekolah";
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
                          <td className="py-3 px-4 min-w-[64px]">
                            <div className="relative group">
                              {p.foto_url ? (
                                <img src={p.foto_url} alt={p.nama} className="w-10 h-[53px] rounded-lg object-cover border border-brand-100 shrink-0" />
                              ) : (
                                <div className="w-10 h-[53px] rounded-lg bg-brand-100 flex items-center justify-center text-brand-400 text-[10px] font-black uppercase shrink-0">
                                  {p.nama.slice(0, 2)}
                                </div>
                              )}
                              {/* Hover overlay with change + delete options */}
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
                                    onClick={() => setPhotoDeleteTarget({ id: p.id, nama: p.nama, foto_url: p.foto_url! })}
                                    className="w-6 h-6 rounded-full bg-white/90 flex items-center justify-center cursor-pointer hover:bg-rose-50 transition-colors"
                                    title="Hapus Foto"
                                  >
                                    <Trash2 className="w-3 h-3 text-rose-500" />
                                  </button>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="py-4 px-6 font-extrabold text-sm text-brand-950">{toSentenceCase(p.nama)}</td>
                          <td className="py-4 px-6 font-mono font-bold text-sm text-brand-900">
                            {p.email.split("@")[0]}
                          </td>
                          <td className="py-4 px-6">
                            <span
                              className={`font-black text-[10px] uppercase tracking-wider px-2.5 py-1 rounded-xl border shadow-xs whitespace-nowrap inline-block ${
                                isSuper
                                  ? "bg-purple-50 text-purple-700 border-purple-200"
                                  : p.role === "kepala_sekolah"
                                  ? "bg-slate-50 text-slate-700 border-slate-200"
                                  : p.role === "guru"
                                  ? "bg-amber-50 text-amber-700 border-amber-200"
                                  : p.role === "piket"
                                  ? "bg-blue-50 text-blue-700 border-blue-200"
                                  : "bg-emerald-50 text-emerald-700 border-emerald-200"
                              }`}
                            >
                              {p.role === "super_admin" ? "SUPER ADMIN" : p.role === "kepala_sekolah" ? "KEPALA SEKOLAH" : p.role.replace("_", " ")}
                            </span>
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
                        placeholder={role === "siswa" ? "Pilih Murid terlebih dahulu" : role === "kepala_sekolah" ? "Nama Lengkap Kepala Sekolah & Gelar" : "Nama Lengkap Guru & Gelar"}
                        className="w-full border border-brand-100 rounded-xl py-2.5 pl-10 pr-4 text-sm font-semibold focus:ring-1 focus:ring-brand-500 outline-none text-brand-900 bg-brand-50/20 disabled:opacity-75"
                      />
                    </div>
                  </div>
                )}

                {(role === "guru" || role === "kepala_sekolah") && (
                  <>
                    <div className="space-y-1 animate-slide-up">
                      <label className="text-xs font-black text-brand-900 uppercase block">Username (NIP)</label>
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
                      <p className="text-[10px] text-brand-400 font-medium">Login sebagai: <strong className="text-brand-600">{nip || "[NIP]"}@sman19.sch.id</strong></p>
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
                      <p className="text-[10px] text-brand-400 font-medium">Kosongkan untuk menggunakan password default <strong className="text-brand-600">guru19*</strong></p>
                    </div>
                  </>
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

                {(role === "guru" || role === "kepala_sekolah") && (
                  <div className="text-[10px] font-bold text-brand-500 bg-brand-50/60 border border-brand-100/50 p-3 rounded-2xl space-y-1 animate-slide-up leading-relaxed">
                    <div><strong className="text-brand-900 font-extrabold">Username (Login):</strong> {(nip || "[NIS/NIP]") + "@sman19.sch.id"}</div>
                    <div><strong className="text-brand-900 font-extrabold">Password:</strong> {password.trim() || "guru19*"}</div>
                  </div>
                )}

                {role === "siswa" && (
                  <div className="text-[10px] font-bold text-brand-500 bg-brand-50/60 border border-brand-100/50 p-3 rounded-2xl space-y-1 animate-slide-up leading-relaxed">
                    <div><strong className="text-brand-900 font-extrabold">Username (Login):</strong> {(selectedNis || "[NIS Murid]") + "@sman19.sch.id"}</div>
                    <div><strong className="text-brand-900 font-extrabold">Password:</strong> siswa19</div>
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
                    {(editingProfile?.role === "siswa" || editingProfile?.role === "guru" || editingProfile?.role === "kepala_sekolah") ? "Username (Login)" : "Email / Username Login"}
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-brand-400" />
                    <input
                      type="text"
                      required
                      value={editEmail}
                      onChange={(e) => setEditEmail(e.target.value)}
                      readOnly={editingProfile?.role === "siswa" || editingProfile?.role === "guru" || editingProfile?.role === "kepala_sekolah"}
                      className={`w-full border border-brand-100 rounded-xl py-2.5 pl-10 pr-4 text-sm font-semibold focus:ring-1 focus:ring-brand-500 outline-none text-brand-900 bg-brand-50/20${(editingProfile?.role === "siswa" || editingProfile?.role === "guru" || editingProfile?.role === "kepala_sekolah") ? " opacity-75 cursor-not-allowed" : ""}`}
                    />
                  </div>
                  {(editingProfile?.role === "siswa" || editingProfile?.role === "guru" || editingProfile?.role === "kepala_sekolah") && (
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
                  Unggah file Excel berisi data akun. Kolom Username diisi NIS (untuk siswa) atau NIP (untuk guru/kepala sekolah). Sistem akan otomatis membuat email login <strong className="text-brand-700">@sman19.sch.id</strong>.
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

        {/* BULK PHOTO UPLOAD MODAL */}
        {createPortal(
          <AnimatePresence>
            {isImportPhotoOpen && (
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
                  className="bg-white rounded-3xl p-6 w-full max-w-4xl max-h-[85vh] border border-brand-100 shadow-2xl flex flex-col relative z-10"
                >
              {/* Header */}
              <div className="flex justify-between items-center border-b pb-4 border-brand-50 flex-shrink-0">
                <div>
                  <h3 className="text-base font-extrabold text-brand-950 flex items-center gap-2">
                    <Camera className="w-5 h-5 text-purple-600" />
                    Unggah & Petakan Foto Profil Massal
                  </h3>
                  <p className="text-[11px] text-brand-400 font-bold mt-0.5 uppercase tracking-wide">Pencocokan Cerdas berbasis Nama / NIS</p>
                </div>
                <button
                  onClick={() => {
                    setIsImportPhotoOpen(false);
                    setPhotoMatchItems([]);
                  }}
                  disabled={isUploadingPhotos}
                  className="p-1 text-brand-400 hover:text-brand-600 hover:bg-brand-50 rounded-xl cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto py-5 space-y-5">
                
                {/* How it works info */}
                <div className="bg-brand-50/50 border border-brand-100/60 rounded-2xl p-4 text-xs text-brand-700 leading-relaxed font-semibold">
                  💡 **Petunjuk Penggunaan Cepat:**
                  <ul className="list-disc list-inside mt-2 space-y-1 text-brand-500 font-medium">
                    <li>Namai file foto dengan **NIS** (misal: `19013.jpg`) untuk pencocokan otomatis 100% tepat.</li>
                    <li>Sistem juga dapat mendeteksi nama secara cerdas jika ada salah ketik kecil (misal: `amiir hamza.jpg` akan cocok ke `Amir Hamzah`).</li>
                    <li>Anda bisa memilih banyak file gambar sekaligus atau mengunggah satu file **.zip** berisi semua foto.</li>
                  </ul>
                </div>

                {/* Upload selectors */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  
                  {/* Option A: Select Multiple Images */}
                  <div className="border border-dashed border-brand-200 rounded-2xl p-5 flex flex-col items-center justify-center text-center space-y-3 bg-brand-50/10 hover:bg-brand-50/30 transition-all cursor-pointer relative group">
                    <div className="w-10 h-10 rounded-full bg-purple-50 flex items-center justify-center text-purple-600 group-hover:scale-110 transition-transform">
                      <Image className="w-5 h-5" />
                    </div>
                    <div>
                      <h5 className="text-xs font-bold text-brand-950">Pilih Berkas Foto Langsung</h5>
                      <p className="text-[10px] text-brand-400 font-medium mt-0.5">Mendukung format JPG, PNG, WEBP sekaligus banyak</p>
                    </div>
                    <input 
                      type="file"
                      multiple
                      accept="image/*"
                      onChange={handleMultipleFilesChange}
                      disabled={isUploadingPhotos}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                  </div>

                  {/* Option B: Upload ZIP */}
                  <div className="border border-dashed border-brand-200 rounded-2xl p-5 flex flex-col items-center justify-center text-center space-y-3 bg-brand-50/10 hover:bg-brand-50/30 transition-all cursor-pointer relative group">
                    <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600 group-hover:scale-110 transition-transform">
                      <FileSpreadsheet className="w-5 h-5" />
                    </div>
                    <div>
                      <h5 className="text-xs font-bold text-brand-950">Unggah Berkas File ZIP</h5>
                      <p className="text-[10px] text-brand-400 font-medium mt-0.5">Kompresi semua file foto dalam satu berkas .zip</p>
                    </div>
                    <input 
                      type="file"
                      accept=".zip"
                      onChange={handleZipFileChange}
                      disabled={isUploadingPhotos}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                  </div>
                </div>

                {/* Progress bar info */}
                {isUploadingPhotos && (
                  <div className="bg-brand-50 border border-brand-100 p-4.5 rounded-2xl space-y-3">
                    <div className="flex justify-between items-center text-xs font-black text-brand-950 uppercase">
                      <span>{uploadStatusMsg}</span>
                      <span>{uploadProgress}%</span>
                    </div>
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden border border-slate-200">
                      <div 
                        className="bg-brand-600 h-full rounded-full transition-all duration-300"
                        style={{ width: `${uploadProgress}%` }}
                      ></div>
                    </div>
                  </div>
                )}

                {/* List of matched items */}
                {photoMatchItems.length > 0 && (
                  <div className="space-y-2 border-t pt-4 border-brand-50 flex-1 flex flex-col min-h-0">
                    <h5 className="text-xs font-black text-brand-950 uppercase">Hasil Pemetaan Foto ({photoMatchItems.length} File)</h5>
                    <div className="border border-brand-100 rounded-2xl overflow-hidden flex-1 min-h-0 flex flex-col">
                      <div className="overflow-x-auto overflow-y-auto max-h-[350px]">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="bg-brand-50/40 border-b border-brand-100 text-brand-500 font-black uppercase tracking-wider text-[10px]">
                              <th className="py-3 px-4">Nama File</th>
                              <th className="py-3 px-4">Tinjau Foto</th>
                              <th className="py-3 px-4">Pengguna Terpetakan</th>
                              <th className="py-3 px-4 text-center">Status</th>
                              <th className="py-3 px-4">Ubah Pemetaan</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-brand-50 text-brand-900 font-semibold">
                            {photoMatchItems.map((item) => {
                              const prof = profiles.find(p => p.id === item.matchedProfileId);
                              return (
                                <tr key={item.id} className="hover:bg-brand-50/10 transition-colors">
                                  <td className="py-3 px-4 font-mono text-[10px] text-slate-500 truncate max-w-[150px]" title={item.file.name}>
                                    {item.file.name}
                                  </td>
                                  <td className="py-3 px-4">
                                    <img 
                                      src={item.previewUrl} 
                                      alt="preview" 
                                      className="w-9 h-12 rounded-lg object-cover border border-brand-100"
                                    />
                                  </td>
                                  <td className="py-3 px-4">
                                    {prof ? (
                                      <div className="text-xs">
                                        <div className="font-extrabold text-brand-950">{toSentenceCase(prof.nama)}</div>
                                        <div className="text-[9px] text-brand-400 font-bold mt-0.5">{prof.email.split("@")[0]} &bull; {prof.role}</div>
                                      </div>
                                    ) : (
                                      <span className="text-slate-400 italic">Belum terpetakan</span>
                                    )}
                                  </td>
                                  <td className="py-3 px-4 text-center">
                                    {item.status === "matched" && <span className="px-2 py-1 bg-emerald-50 text-emerald-700 rounded-md text-[9px] font-black uppercase">Cocok</span>}
                                    {item.status === "suggested" && <span className="px-2 py-1 bg-amber-50 text-amber-700 rounded-md text-[9px] font-black uppercase">Saran</span>}
                                    {item.status === "nomatch" && <span className="px-2 py-1 bg-rose-50 text-rose-700 rounded-md text-[9px] font-black uppercase">Gagal</span>}
                                  </td>
                                  <td className="py-3 px-4">
                                    <select
                                      value={item.matchedProfileId || ""}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        setPhotoMatchItems(prev => prev.map(p => 
                                          p.id === item.id ? { ...p, matchedProfileId: val === "" ? null : val, status: val === "" ? "nomatch" : "matched" } : p
                                        ));
                                      }}
                                      disabled={isUploadingPhotos}
                                      className="w-36 text-[10px] bg-slate-50 border border-slate-200 rounded-lg p-1.5 font-bold outline-none text-brand-900 cursor-pointer"
                                    >
                                      <option value="">-- Pilih Manual --</option>
                                      {[...profiles].sort((a,b) => a.nama.localeCompare(b.nama)).map(p => (
                                        <option key={p.id} value={p.id}>{toSentenceCase(p.nama)} ({p.role})</option>
                                      ))}
                                    </select>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="flex justify-end gap-2 border-t pt-4 border-brand-50 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setIsImportPhotoOpen(false);
                    setPhotoMatchItems([]);
                  }}
                  disabled={isUploadingPhotos}
                  className="px-5 py-2.5 border border-brand-100 rounded-xl text-sm font-bold text-brand-600 hover:bg-brand-50 cursor-pointer disabled:opacity-50"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleUploadAllPhotos}
                  disabled={isUploadingPhotos || photoMatchItems.filter(item => item.matchedProfileId !== null).length === 0}
                  className="px-6 py-2.5 brand-gradient hover:opacity-95 text-white font-bold rounded-xl text-sm shadow-md shadow-brand-500/20 disabled:opacity-50 cursor-pointer"
                >
                  {isUploadingPhotos ? "Mengunggah..." : `Konfirmasi & Unggah (${photoMatchItems.filter(item => item.matchedProfileId !== null).length} Foto)`}
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

      {/* CONFIRM DELETE PHOTO */}
      <ConfirmationModal
        isOpen={!!photoDeleteTarget}
        onClose={() => setPhotoDeleteTarget(null)}
        onConfirm={handleDeletePhoto}
        title="Hapus Foto Profil?"
        message={`Yakin ingin menghapus foto profil "${photoDeleteTarget?.nama ? toSentenceCase(photoDeleteTarget.nama) : ""}"?`}
        confirmText="Ya, Hapus"
        cancelText="Batal"
        type="danger"
      />

    </div>
  );
}
