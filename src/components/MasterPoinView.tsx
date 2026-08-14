import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, X, Search, Pencil, CheckSquare, ShieldCheck, Users } from "lucide-react";
import { MasterPoin } from "../types";
import { getMasterPoinList } from "../dbStore";
import ConfirmationModal from "./ConfirmationModal";
import { supabase } from "../supabaseClient";

interface MasterPoinViewProps {
  onRefreshTrigger: () => void;
}

export default function MasterPoinView({ onRefreshTrigger }: MasterPoinViewProps) {
  const queryClient = useQueryClient();
  const [poinList, setPoinList] = useState<MasterPoin[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [teachersList, setTeachersList] = useState<{ id: string; email: string; nama: string }[]>([]);

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      const data = await getMasterPoinList();
      setPoinList(data);

      // Fetch teacher profiles for teacher assignment
      const { data: tData } = await supabase
        .from("profiles")
        .select("id, email, nama, role")
        .in("role", ["guru", "kepala_sekolah", "piket", "tata_usaha"])
        .order("nama", { ascending: true });

      if (tData) setTeachersList(tData);
      setIsLoading(false);
    }
    load();

    // Supabase Realtime Auto-Sync for master_poin changes across clients
    const channel = supabase
      .channel("master_poin_realtime_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "master_poin" },
        async () => {
          const fresh = await getMasterPoinList();
          setPoinList(fresh);
          queryClient.invalidateQueries({ queryKey: ["masterPoin"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const [filterType, setFilterType] = useState<"Semua" | "Positif" | "Negatif">("Semua");
  const [searchQuery, setSearchQuery] = useState("");

  // New rule form state
  const [newName, setNewName] = useState("");
  const [newValue, setNewValue] = useState("");
  const [addAllowedEmails, setAddAllowedEmails] = useState<string[]>([]);
  const [addAccessType, setAddAccessType] = useState<"semua" | "khusus">("semua");
  const [addTeacherQuery, setAddTeacherQuery] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  // Toast state
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // Delete & Bulk selection state
  const [ruleToDelete, setRuleToDelete] = useState<{ id: string; name: string } | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isBulkDeleteConfirm, setIsBulkDeleteConfirm] = useState(false);

  // Bulk access state
  const [isBulkAccessModalOpen, setIsBulkAccessModalOpen] = useState(false);
  const [bulkAccessType, setBulkAccessType] = useState<"semua" | "khusus">("semua");
  const [bulkAllowedEmails, setBulkAllowedEmails] = useState<string[]>([]);
  const [bulkTeacherQuery, setBulkTeacherQuery] = useState("");
  const [isSavingBulkAccess, setIsSavingBulkAccess] = useState(false);

  // Edit state
  const [editingRule, setEditingRule] = useState<MasterPoin | null>(null);
  const [editName, setEditName] = useState("");
  const [editValue, setEditValue] = useState("");
  const [editAllowedEmails, setEditAllowedEmails] = useState<string[]>([]);
  const [editAccessType, setEditAccessType] = useState<"semua" | "khusus">("semua");
  const [editTeacherQuery, setEditTeacherQuery] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const handleColumnError = (err: any, actionName: string) => {
    const msg = err?.message || String(err);
    if (msg.includes("allowed_guru_emails")) {
      showToast(
        `Gagal ${actionName}: Kolom 'allowed_guru_emails' belum ditambahkan di Supabase. Jalankan: ALTER TABLE public.master_poin ADD COLUMN IF NOT EXISTS allowed_guru_emails TEXT[];`,
        "error"
      );
    } else {
      showToast(`Gagal ${actionName}: ` + msg, "error");
    }
  };

  const handleAddRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newValue.trim()) {
      showToast("Mohon lengkapi seluruh kolom input.", "error");
      return;
    }

    const valueNum = parseInt(newValue, 10);
    if (isNaN(valueNum)) {
      showToast("Nilai poin harus berupa angka.", "error");
      return;
    }

    const finalAllowed = addAccessType === "khusus" ? addAllowedEmails : null;

    try {
      const newRule: any = {
        nama_poin: newName.trim(),
        nilai_poin: valueNum,
      };

      if (finalAllowed && finalAllowed.length > 0) {
        newRule.allowed_guru_emails = finalAllowed;
      }

      const { error } = await supabase.from("master_poin").insert(newRule);
      if (error) throw error;

      const updated = await getMasterPoinList();
      setPoinList(updated);
      await queryClient.invalidateQueries({ queryKey: ["masterPoin"] });
      onRefreshTrigger();

      setNewName("");
      setNewValue("");
      setAddAllowedEmails([]);
      setAddAccessType("semua");
      setAddTeacherQuery("");
      setIsAdding(false);
      showToast(`Aturan "${newRule.nama_poin}" berhasil disimpan!`, "success");
    } catch (err: any) {
      handleColumnError(err, "menambahkan aturan");
    }
  };

  // ─── Single Delete ─────────────────────────────────
  const handleDeleteRule = (id: string, name: string) => {
    setRuleToDelete({ id, name });
  };

  const executeDeleteRule = async (id: string, name: string) => {
    try {
      const { error } = await supabase.from("master_poin").delete().eq("id", id);
      if (error) throw error;

      const updated = await getMasterPoinList();
      setPoinList(updated);
      setSelectedIds((prev) => prev.filter((sid) => sid !== id));
      await queryClient.invalidateQueries({ queryKey: ["masterPoin"] });
      onRefreshTrigger();
      showToast(`Aturan "${name}" berhasil dihapus.`, "success");
    } catch (err: any) {
      showToast("Gagal menghapus aturan: " + err.message, "error");
    }
  };

  // ─── Bulk Delete ────────────────────────────────────
  const executeBulkDelete = async () => {
    try {
      const { error } = await supabase
        .from("master_poin")
        .delete()
        .in("id", selectedIds);
      if (error) throw error;

      const updated = await getMasterPoinList();
      setPoinList(updated);
      const count = selectedIds.length;
      setSelectedIds([]);
      await queryClient.invalidateQueries({ queryKey: ["masterPoin"] });
      onRefreshTrigger();
      showToast(`${count} aturan berhasil dihapus.`, "success");
    } catch (err: any) {
      showToast("Gagal menghapus aturan: " + err.message, "error");
    }
  };

  // ─── Bulk Access ─────────────────────────────────────
  const handleExecuteBulkAccess = async () => {
    if (selectedIds.length === 0) return;
    setIsSavingBulkAccess(true);
    try {
      const finalAllowed = bulkAccessType === "khusus" ? bulkAllowedEmails : null;

      const { error } = await supabase
        .from("master_poin")
        .update({ allowed_guru_emails: finalAllowed })
        .in("id", selectedIds);

      if (error) throw error;

      const updated = await getMasterPoinList();
      setPoinList(updated);
      await queryClient.invalidateQueries({ queryKey: ["masterPoin"] });
      onRefreshTrigger();
      const count = selectedIds.length;
      setSelectedIds([]);
      setIsBulkAccessModalOpen(false);
      showToast(`Hak akses ${count} poin berhasil diperbarui!`, "success");
    } catch (err: any) {
      handleColumnError(err, "mengupdate hak akses");
    } finally {
      setIsSavingBulkAccess(false);
    }
  };

  // ─── Checkbox helpers ───────────────────────────────
  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedIds(e.target.checked ? filteredRules.map((r) => r.id) : []);
  };

  const handleSelectOne = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((sid) => sid !== id) : [...prev, id]
    );
  };

  // ─── Edit ───────────────────────────────────────────
  const openEdit = (rule: MasterPoin) => {
    setEditingRule(rule);
    setEditName(rule.nama_poin);
    setEditValue(String(rule.nilai_poin));
    const allowed = rule.allowed_guru_emails || [];
    setEditAllowedEmails(allowed);
    setEditAccessType(allowed.length > 0 ? "khusus" : "semua");
    setEditTeacherQuery("");
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRule) return;
    if (!editName.trim() || !editValue.trim()) {
      showToast("Mohon lengkapi seluruh kolom.", "error");
      return;
    }
    const valueNum = parseInt(editValue, 10);
    if (isNaN(valueNum)) {
      showToast("Nilai poin harus berupa angka.", "error");
      return;
    }

    const finalAllowed = editAccessType === "khusus" ? editAllowedEmails : null;

    setIsSavingEdit(true);
    try {
      const { error } = await supabase
        .from("master_poin")
        .update({
          nama_poin: editName.trim(),
          nilai_poin: valueNum,
          allowed_guru_emails: finalAllowed,
        })
        .eq("id", editingRule.id);
      if (error) throw error;

      const updated = await getMasterPoinList();
      setPoinList(updated);
      await queryClient.invalidateQueries({ queryKey: ["masterPoin"] });
      onRefreshTrigger();
      setEditingRule(null);
      showToast(`Aturan "${editName.trim()}" berhasil diperbarui!`, "success");
    } catch (err: any) {
      handleColumnError(err, "memperbarui aturan");
    } finally {
      setIsSavingEdit(false);
    }
  };

  // ─── Filter ─────────────────────────────────────────
  const filteredRules = poinList.filter((r) => {
    const matchesFilter =
      filterType === "Semua" ||
      (filterType === "Positif" && r.nilai_poin > 0) ||
      (filterType === "Negatif" && r.nilai_poin < 0);
    const matchesSearch = r.nama_poin.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const allFilteredSelected =
    filteredRules.length > 0 && filteredRules.every((r) => selectedIds.includes(r.id));
  const someSelected = selectedIds.length > 0;

  return (
    <div className="bg-white rounded-3xl border border-brand-100 shadow-xl shadow-brand-900/5 p-5 sm:p-6 space-y-5">
      {/* Toast Notification (Solid Background, No Icons) */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            className={`fixed bottom-6 right-6 z-50 px-5 py-3.5 rounded-2xl shadow-2xl flex items-center font-extrabold text-sm text-white opacity-100 border ${
              toast.type === "error"
                ? "bg-rose-600 border-rose-700 shadow-rose-900/30"
                : "bg-emerald-600 border-emerald-700 shadow-emerald-900/30"
            }`}
          >
            <span>{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <h2 className="text-xl font-extrabold text-brand-950 tracking-tight">Aturan Baku Poin</h2>

      {/* Search & Filter Controls */}
      <div className="flex flex-col md:flex-row gap-3 justify-between items-center mt-2">
        {/* Search Bar */}
        <div className="relative flex-1 max-w-md w-full">
          <Search className="w-4.5 h-4.5 text-brand-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Cari deskripsi aturan..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9.5 pr-3 py-2 text-sm font-bold text-brand-900 placeholder-brand-400 border border-brand-100 rounded-xl outline-none bg-brand-50/30 focus:bg-white focus:ring-2 focus:ring-brand-500/20 transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-brand-400 hover:text-brand-600 p-0.5 rounded-full"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filter Pills & Action Buttons */}
        <div className="flex flex-wrap gap-1.5 items-center w-full md:w-auto">
          {(["Semua", "Positif", "Negatif"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setFilterType(tab)}
              className={`px-4 py-2 rounded-lg text-xs font-extrabold border transition-all cursor-pointer ${
                filterType === tab
                  ? "brand-gradient text-white border-transparent shadow-xs"
                  : "bg-brand-50/50 text-brand-700 border-brand-100 hover:bg-brand-100/30"
              }`}
            >
              {tab === "Semua" ? "Semua" : tab === "Positif" ? "Prestasi (+)" : "Sanksi (-)"}
            </button>
          ))}

          {/* Bulk Action Buttons */}
          <AnimatePresence>
            {someSelected && (
              <div className="flex items-center gap-1.5 animate-slide-up">
                <motion.button
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    setBulkAccessType("semua");
                    setBulkAllowedEmails([]);
                    setBulkTeacherQuery("");
                    setIsBulkAccessModalOpen(true);
                  }}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-black rounded-lg transition-all shadow-md cursor-pointer"
                >
                  <Users className="w-3.5 h-3.5" />
                  Atur Hak Guru ({selectedIds.length})
                </motion.button>
                <motion.button
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setIsBulkDeleteConfirm(true)}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-rose-500 hover:bg-rose-600 text-white text-xs font-black rounded-lg transition-all shadow-md cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Hapus ({selectedIds.length})
                </motion.button>
              </div>
            )}
          </AnimatePresence>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => {
              setAddTeacherQuery("");
              setIsAdding(true);
            }}
            className="flex items-center gap-1.5 px-4 py-2 brand-gradient text-white text-xs font-black rounded-lg transition-all shadow-md cursor-pointer ml-auto md:ml-0"
          >
            <Plus className="w-4 h-4" />
            Tambah Aturan
          </motion.button>
        </div>
      </div>

      {/* Table Header */}
      <div className="border border-brand-100 rounded-t-2xl bg-brand-50/80 border-b-0 overflow-hidden">
        <div className="bg-brand-50/80 py-3.5 px-4 flex items-center justify-between gap-3 text-brand-500 text-xs font-black uppercase tracking-wider">
          <div className="flex items-center gap-3 flex-1">
            <div className="flex items-center">
              <input
                type="checkbox"
                checked={allFilteredSelected}
                onChange={handleSelectAll}
                disabled={filteredRules.length === 0}
                className="w-4 h-4 rounded border-brand-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
              />
            </div>
            <span className="pl-1">Deskripsi Aturan Poin & Hak Akses Guru</span>
          </div>
          <div className="flex items-center gap-4 flex-shrink-0">
            <div className="w-16 text-center">Nilai Poin</div>
            <div className="w-16 text-right pr-1">Aksi</div>
          </div>
        </div>
      </div>

      {/* Rules List */}
      <div className="border border-brand-100 rounded-b-2xl divide-y divide-brand-50 overflow-hidden bg-brand-50/10">
        {isLoading ? (
          <div className="py-12 text-center text-brand-400 text-sm font-bold animate-pulse">
            Memuat aturan poin...
          </div>
        ) : filteredRules.length > 0 ? (
          filteredRules.map((rule) => {
            const isPositive = rule.nilai_poin > 0;
            const isSelected = selectedIds.includes(rule.id);
            const hasSpecialAccess = rule.allowed_guru_emails && rule.allowed_guru_emails.length > 0;

            return (
              <div
                key={rule.id}
                className={`py-3 px-3 sm:px-4 flex items-start sm:items-center justify-between gap-2.5 sm:gap-4 transition-all animate-fade-in ${
                  isSelected ? "bg-brand-50/60" : "hover:bg-white"
                }`}
              >
                {/* Left: Checkbox + Indicator + Text */}
                <div className="flex items-start sm:items-center gap-2.5 sm:gap-3.5 min-w-0 flex-1">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => handleSelectOne(rule.id)}
                    className="w-4 h-4 rounded border-brand-300 text-brand-600 focus:ring-brand-500 cursor-pointer flex-shrink-0 mt-0.5 sm:mt-0"
                  />
                  <div
                    className={`w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1 sm:mt-0 ${
                      isPositive
                        ? "bg-emerald-500 shadow-sm shadow-emerald-500/30"
                        : "bg-rose-500 shadow-sm shadow-rose-500/30"
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs sm:text-sm font-bold text-brand-950 break-words leading-snug">
                      {rule.nama_poin}
                    </p>
                    <div className="flex flex-wrap items-center gap-1 sm:gap-2 mt-1">
                      <span
                        className={`text-[10px] sm:text-xs font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-md ${
                          isPositive 
                            ? "text-emerald-700 bg-emerald-50 border border-emerald-200/60" 
                            : "text-rose-700 bg-rose-50 border border-rose-200/60"
                        }`}
                      >
                        {isPositive ? "Prestasi" : "Pelanggaran"}
                      </span>
                      {hasSpecialAccess ? (
                        <span className="text-[9.5px] sm:text-[10px] font-extrabold text-amber-800 bg-amber-100/90 border border-amber-200/80 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <Users className="w-3 h-3 shrink-0" />
                          <span>Khusus ({rule.allowed_guru_emails!.length} Guru)</span>
                        </span>
                      ) : (
                        <span className="text-[9.5px] sm:text-[10px] font-extrabold text-slate-600 bg-slate-100 border border-slate-200/80 px-2 py-0.5 rounded-full">
                          Semua Guru
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right: Badge + Actions */}
                <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0 self-start sm:self-center mt-0.5 sm:mt-0">
                  <span
                    className={`font-mono text-xs sm:text-sm font-black px-2.5 sm:px-3 py-0.5 sm:py-1 rounded-full border ${
                      isPositive
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : "bg-rose-50 text-rose-700 border-rose-200"
                    }`}
                  >
                    {isPositive ? `+${rule.nilai_poin}` : rule.nilai_poin}
                  </span>

                  <div className="flex items-center">
                    <button
                      onClick={() => openEdit(rule)}
                      className="text-brand-400 hover:text-brand-700 p-1 sm:p-1.5 rounded-lg hover:bg-brand-50 transition-all cursor-pointer"
                      title="Edit Aturan"
                    >
                      <Pencil className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteRule(rule.id, rule.nama_poin)}
                      className="text-rose-400 hover:text-rose-600 p-1 sm:p-1.5 rounded-lg hover:bg-rose-50 transition-all cursor-pointer"
                      title="Hapus Aturan"
                    >
                      <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="py-12 text-center text-brand-400 text-xs font-semibold">
            Tidak ada aturan poin yang sesuai dengan pencarian.
          </div>
        )}
      </div>

      {/* ─── Modal: Tambah Aturan ─── */}
      {isAdding && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-3xl shadow-2xl border border-brand-100 w-full max-w-md p-6 flex flex-col my-auto"
          >
            <div className="flex items-center justify-between border-b border-brand-100 pb-3 mb-4">
              <h3 className="text-base font-extrabold text-brand-900 flex items-center gap-1.5">
                <Plus className="w-5 h-5 text-brand-600" />
                Tambah Bobot Aturan
              </h3>
              <button
                onClick={() => setIsAdding(false)}
                className="text-brand-400 hover:text-brand-600 cursor-pointer p-1 hover:bg-brand-50 rounded-lg"
              >
                <X className="w-4.5 h-4.5" />
              </button>
            </div>

            <form onSubmit={handleAddRule} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-extrabold text-brand-500 uppercase tracking-wide block">
                  Deskripsi Aturan *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Terlambat masuk sekolah"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full border border-brand-100 rounded-xl px-4 py-2.5 text-sm font-bold text-brand-900 focus:ring-2 focus:ring-brand-500/20 outline-none bg-brand-50/25"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-extrabold text-brand-500 uppercase tracking-wide block">
                  Bobot Nilai Poin *
                </label>
                <input
                  type="number"
                  required
                  placeholder="Contoh: -15 atau +20"
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  className="w-full border border-brand-100 rounded-xl px-4 py-2.5 text-sm font-bold text-brand-900 focus:ring-2 focus:ring-brand-500/20 outline-none bg-brand-50/25"
                />
              </div>

              {/* Hak Akses Guru */}
              <div className="space-y-2 pt-2 border-t border-brand-100">
                <label className="text-xs font-extrabold text-brand-500 uppercase tracking-wide block">
                  Hak Akses Poin Ini oleh Guru
                </label>
                <div className="flex items-center gap-4 text-xs font-bold text-brand-800">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="addAccessType"
                      checked={addAccessType === "semua"}
                      onChange={() => {
                        setAddAccessType("semua");
                        setAddAllowedEmails([]);
                      }}
                      className="text-brand-600 focus:ring-brand-500"
                    />
                    Semua Guru
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="addAccessType"
                      checked={addAccessType === "khusus"}
                      onChange={() => setAddAccessType("khusus")}
                      className="text-brand-600 focus:ring-brand-500"
                    />
                    Guru Tertentu (Akses Khusus)
                  </label>
                </div>

                {addAccessType === "khusus" && (
                  <div className="space-y-2 mt-2">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-brand-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        placeholder="Cari nama atau email guru..."
                        value={addTeacherQuery}
                        onChange={(e) => setAddTeacherQuery(e.target.value)}
                        className="w-full pl-8.5 pr-7 py-1.5 text-xs font-bold text-brand-900 border border-brand-200 rounded-xl outline-none bg-brand-50/40 focus:bg-white focus:ring-2 focus:ring-amber-500/20"
                      />
                      {addTeacherQuery && (
                        <button
                          type="button"
                          onClick={() => setAddTeacherQuery("")}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-brand-400 hover:text-brand-600"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    <div className="max-h-40 overflow-y-auto bg-brand-50/50 p-2.5 rounded-xl border border-brand-100 space-y-1.5">
                      <p className="text-[10px] text-brand-400 font-extrabold uppercase">Pilih Guru yang Diizinkan:</p>
                      {teachersList.filter(t => t.nama.toLowerCase().includes(addTeacherQuery.toLowerCase()) || t.email.toLowerCase().includes(addTeacherQuery.toLowerCase())).length > 0 ? (
                        teachersList
                          .filter(t => t.nama.toLowerCase().includes(addTeacherQuery.toLowerCase()) || t.email.toLowerCase().includes(addTeacherQuery.toLowerCase()))
                          .map((t) => {
                            const isChecked = addAllowedEmails.includes(t.email);
                            return (
                              <label key={t.id} className="flex items-center gap-2 text-xs font-semibold text-brand-900 cursor-pointer hover:bg-white p-1 rounded-lg transition-colors">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => {
                                    setAddAllowedEmails((prev) =>
                                      isChecked ? prev.filter((e) => e !== t.email) : [...prev, t.email]
                                    );
                                  }}
                                  className="w-3.5 h-3.5 rounded border-brand-300 text-brand-600 focus:ring-brand-500"
                                />
                                <span>{t.nama} <span className="text-[10px] text-brand-400">({t.email})</span></span>
                              </label>
                            );
                          })
                      ) : (
                        <p className="text-xs text-brand-400 font-semibold py-2 text-center">
                          {addTeacherQuery ? "Guru tidak ditemukan." : "Tidak ada akun guru terdaftar."}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-2 justify-end border-t border-brand-100 pt-4 mt-4">
                <button
                  type="button"
                  onClick={() => setIsAdding(false)}
                  className="px-4.5 py-2.5 border border-brand-100 rounded-xl text-sm font-bold text-brand-700 hover:bg-brand-50 cursor-pointer"
                >
                  Batal
                </button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  type="submit"
                  className="px-5 py-2.5 brand-gradient text-white rounded-xl text-sm font-black shadow-md shadow-brand-500/10 cursor-pointer"
                >
                  Simpan
                </motion.button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* ─── Modal: Bulk Edit Hak Akses Guru ─── */}
      <AnimatePresence>
        {isBulkAccessModalOpen && (
          <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4 overflow-y-auto">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl shadow-2xl border border-brand-100 w-full max-w-md p-6 flex flex-col my-auto space-y-4"
            >
              <div className="flex items-center justify-between border-b border-brand-100 pb-3">
                <h3 className="text-base font-extrabold text-brand-900 flex items-center gap-2">
                  <Users className="w-5 h-5 text-amber-600" />
                  Atur Hak Akses Guru ({selectedIds.length} Poin)
                </h3>
                <button
                  onClick={() => setIsBulkAccessModalOpen(false)}
                  className="text-brand-400 hover:text-brand-600 p-1 hover:bg-brand-50 rounded-lg cursor-pointer"
                >
                  <X className="w-4.5 h-4.5" />
                </button>
              </div>

              <p className="text-xs text-brand-500 font-semibold leading-relaxed">
                Tentukan guru mana saja yang berhak menginput <strong className="text-brand-950">{selectedIds.length} poin</strong> yang Anda pilih sekaligus.
              </p>

              <div className="space-y-3">
                <div className="flex items-center gap-4 text-xs font-bold text-brand-800">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="bulkAccessType"
                      checked={bulkAccessType === "semua"}
                      onChange={() => {
                        setBulkAccessType("semua");
                        setBulkAllowedEmails([]);
                      }}
                      className="text-brand-600 focus:ring-brand-500"
                    />
                    Semua Guru
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="bulkAccessType"
                      checked={bulkAccessType === "khusus"}
                      onChange={() => setBulkAccessType("khusus")}
                      className="text-brand-600 focus:ring-brand-500"
                    />
                    Guru Tertentu (Akses Khusus)
                  </label>
                </div>

                {bulkAccessType === "khusus" && (
                  <div className="space-y-2">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-brand-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        placeholder="Cari nama atau email guru..."
                        value={bulkTeacherQuery}
                        onChange={(e) => setBulkTeacherQuery(e.target.value)}
                        className="w-full pl-8.5 pr-7 py-1.5 text-xs font-bold text-brand-900 border border-brand-200 rounded-xl outline-none bg-brand-50/40 focus:bg-white focus:ring-2 focus:ring-amber-500/20"
                      />
                      {bulkTeacherQuery && (
                        <button
                          type="button"
                          onClick={() => setBulkTeacherQuery("")}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-brand-400 hover:text-brand-600"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    <div className="max-h-48 overflow-y-auto bg-brand-50/50 p-3 rounded-xl border border-brand-100 space-y-2">
                      <p className="text-[10px] text-brand-400 font-extrabold uppercase">Pilih Guru yang Diizinkan:</p>
                      {teachersList.filter(t => t.nama.toLowerCase().includes(bulkTeacherQuery.toLowerCase()) || t.email.toLowerCase().includes(bulkTeacherQuery.toLowerCase())).length > 0 ? (
                        teachersList
                          .filter(t => t.nama.toLowerCase().includes(bulkTeacherQuery.toLowerCase()) || t.email.toLowerCase().includes(bulkTeacherQuery.toLowerCase()))
                          .map((t) => {
                            const isChecked = bulkAllowedEmails.includes(t.email);
                            return (
                              <label key={t.id} className="flex items-center gap-2 text-xs font-semibold text-brand-900 cursor-pointer hover:bg-white p-1.5 rounded-lg transition-colors">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => {
                                    setBulkAllowedEmails((prev) =>
                                      isChecked ? prev.filter((e) => e !== t.email) : [...prev, t.email]
                                    );
                                  }}
                                  className="w-3.5 h-3.5 rounded border-brand-300 text-brand-600 focus:ring-brand-500"
                                />
                                <span>{t.nama} <span className="text-[10px] text-brand-400">({t.email})</span></span>
                              </label>
                            );
                          })
                      ) : (
                        <p className="text-xs text-brand-400 font-semibold py-2 text-center">
                          {bulkTeacherQuery ? "Guru tidak ditemukan." : "Tidak ada akun guru terdaftar."}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-2 justify-end border-t border-brand-100 pt-4">
                <button
                  type="button"
                  onClick={() => setIsBulkAccessModalOpen(false)}
                  className="px-4 py-2.5 border border-brand-100 rounded-xl text-xs font-bold text-brand-700 hover:bg-brand-50 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={isSavingBulkAccess}
                  onClick={handleExecuteBulkAccess}
                  className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-black shadow-md cursor-pointer disabled:opacity-50"
                >
                  {isSavingBulkAccess ? "Menyimpan..." : "Simpan Hak Akses"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ─── Modal: Edit Aturan ─── */}
      <AnimatePresence>
        {editingRule && (
          <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4 overflow-y-auto">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl shadow-2xl border border-brand-100 w-full max-w-md p-6 flex flex-col my-auto"
            >
              <div className="flex items-center justify-between border-b border-brand-100 pb-3 mb-4">
                <h3 className="text-base font-extrabold text-brand-900 flex items-center gap-1.5">
                  <Pencil className="w-5 h-5 text-brand-600" />
                  Edit Aturan Poin
                </h3>
                <button
                  onClick={() => setEditingRule(null)}
                  className="text-brand-400 hover:text-brand-600 cursor-pointer p-1 hover:bg-brand-50 rounded-lg"
                >
                  <X className="w-4.5 h-4.5" />
                </button>
              </div>

              <form onSubmit={handleSaveEdit} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-extrabold text-brand-500 uppercase tracking-wide block">
                    Deskripsi Aturan *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: Terlambat masuk sekolah"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full border border-brand-100 rounded-xl px-4 py-2.5 text-sm font-bold text-brand-900 focus:ring-2 focus:ring-brand-500/20 outline-none bg-brand-50/25"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-extrabold text-brand-500 uppercase tracking-wide block">
                    Bobot Nilai Poin *
                  </label>
                  <input
                    type="number"
                    required
                    placeholder="Contoh: -15 atau +20"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    className="w-full border border-brand-100 rounded-xl px-4 py-2.5 text-sm font-bold text-brand-900 focus:ring-2 focus:ring-brand-500/20 outline-none bg-brand-50/25"
                  />
                </div>

                {/* Hak Akses Guru */}
                <div className="space-y-2 pt-2 border-t border-brand-100">
                  <label className="text-xs font-extrabold text-brand-500 uppercase tracking-wide block">
                    Hak Akses Poin Ini oleh Guru
                  </label>
                  <div className="flex items-center gap-4 text-xs font-bold text-brand-800">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="editAccessType"
                        checked={editAccessType === "semua"}
                        onChange={() => {
                          setEditAccessType("semua");
                          setEditAllowedEmails([]);
                        }}
                        className="text-brand-600 focus:ring-brand-500"
                      />
                      Semua Guru
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="editAccessType"
                        checked={editAccessType === "khusus"}
                        onChange={() => setEditAccessType("khusus")}
                        className="text-brand-600 focus:ring-brand-500"
                      />
                      Guru Tertentu (Akses Khusus)
                    </label>
                  </div>

                  {editAccessType === "khusus" && (
                    <div className="space-y-2 mt-2">
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-brand-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          placeholder="Cari nama atau email guru..."
                          value={editTeacherQuery}
                          onChange={(e) => setEditTeacherQuery(e.target.value)}
                          className="w-full pl-8.5 pr-7 py-1.5 text-xs font-bold text-brand-900 border border-brand-200 rounded-xl outline-none bg-brand-50/40 focus:bg-white focus:ring-2 focus:ring-amber-500/20"
                        />
                        {editTeacherQuery && (
                          <button
                            type="button"
                            onClick={() => setEditTeacherQuery("")}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-brand-400 hover:text-brand-600"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      <div className="max-h-40 overflow-y-auto bg-brand-50/50 p-2.5 rounded-xl border border-brand-100 space-y-1.5">
                        <p className="text-[10px] text-brand-400 font-extrabold uppercase">Pilih Guru yang Diizinkan:</p>
                        {teachersList.filter(t => t.nama.toLowerCase().includes(editTeacherQuery.toLowerCase()) || t.email.toLowerCase().includes(editTeacherQuery.toLowerCase())).length > 0 ? (
                          teachersList
                            .filter(t => t.nama.toLowerCase().includes(editTeacherQuery.toLowerCase()) || t.email.toLowerCase().includes(editTeacherQuery.toLowerCase()))
                            .map((t) => {
                              const isChecked = editAllowedEmails.includes(t.email);
                              return (
                                <label key={t.id} className="flex items-center gap-2 text-xs font-semibold text-brand-900 cursor-pointer hover:bg-white p-1 rounded-lg transition-colors">
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => {
                                      setEditAllowedEmails((prev) =>
                                        isChecked ? prev.filter((e) => e !== t.email) : [...prev, t.email]
                                      );
                                    }}
                                    className="w-3.5 h-3.5 rounded border-brand-300 text-brand-600 focus:ring-brand-500"
                                  />
                                  <span>{t.nama} <span className="text-[10px] text-brand-400">({t.email})</span></span>
                                </label>
                              );
                            })
                        ) : (
                          <p className="text-xs text-brand-400 font-semibold py-2 text-center">
                            {editTeacherQuery ? "Guru tidak ditemukan." : "Tidak ada akun guru terdaftar."}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex gap-2 justify-end border-t border-brand-100 pt-4 mt-4">
                  <button
                    type="button"
                    onClick={() => setEditingRule(null)}
                    className="px-4.5 py-2.5 border border-brand-100 rounded-xl text-sm font-bold text-brand-700 hover:bg-brand-50 cursor-pointer"
                  >
                    Batal
                  </button>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    type="submit"
                    disabled={isSavingEdit}
                    className="px-5 py-2.5 brand-gradient text-white rounded-xl text-sm font-black shadow-md shadow-brand-500/10 cursor-pointer disabled:opacity-50"
                  >
                    {isSavingEdit ? "Menyimpan..." : "Simpan Perubahan"}
                  </motion.button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Confirmation Modals */}
      <ConfirmationModal
        isOpen={!!ruleToDelete}
        onClose={() => setRuleToDelete(null)}
        onConfirm={() => {
          if (ruleToDelete) {
            executeDeleteRule(ruleToDelete.id, ruleToDelete.name);
            setRuleToDelete(null);
          }
        }}
        title="Hapus Aturan Poin?"
        message={`Apakah Anda yakin ingin menghapus aturan "${ruleToDelete?.name}"? Action ini tidak dapat dibatalkan.`}
        confirmText="Hapus Aturan"
        confirmVariant="danger"
      />

      <ConfirmationModal
        isOpen={isBulkDeleteConfirm}
        onClose={() => setIsBulkDeleteConfirm(false)}
        onConfirm={() => {
          executeBulkDelete();
          setIsBulkDeleteConfirm(false);
        }}
        title={`Hapus ${selectedIds.length} Aturan Poin?`}
        message={`Apakah Anda yakin ingin menghapus ${selectedIds.length} aturan poin yang terpilih? Action ini tidak dapat dibatalkan.`}
        confirmText="Hapus Semua"
        confirmVariant="danger"
      />
    </div>
  );
}
