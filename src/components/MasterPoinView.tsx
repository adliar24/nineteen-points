import React, { useState, useEffect } from "react";
import { motion } from "motion/react";
import { Plus, Trash2, ListFilter, Sparkles, X, Search } from "lucide-react";
import { MasterPoin } from "../types";
import { getMasterPoinList } from "../dbStore";
import ConfirmationModal from "./ConfirmationModal";
import { supabase } from "../supabaseClient";

interface MasterPoinViewProps {
  onRefreshTrigger: () => void;
}

export default function MasterPoinView({ onRefreshTrigger }: MasterPoinViewProps) {
  const [poinList, setPoinList] = useState<MasterPoin[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      setPoinList(await getMasterPoinList());
      setIsLoading(false);
    }
    load();
  }, []);
  
  const [filterType, setFilterType] = useState<"Semua" | "Positif" | "Negatif">("Semua");
  const [searchQuery, setSearchQuery] = useState("");
  
  // New rule form
  const [newName, setNewName] = useState("");
  const [newValue, setNewValue] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [toastMsg, setToastMsg] = useState("");
  const [ruleToDelete, setRuleToDelete] = useState<{ id: string; name: string } | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(""), 3500);
  };

  const handleAddRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newValue.trim()) {
      alert("Mohon lengkapi seluruh kolom input.");
      return;
    }

    const valueNum = parseInt(newValue, 10);
    if (isNaN(valueNum)) {
      alert("Nilai poin harus berupa angka.");
      return;
    }

    try {
      const newRule = {
        nama_poin: newName.trim(),
        nilai_poin: valueNum
      };

      const { error } = await supabase
        .from("master_poin")
        .insert(newRule);

      if (error) throw error;

      const updated = await getMasterPoinList();
      setPoinList(updated);
      onRefreshTrigger();

      // Reset Form
      setNewName("");
      setNewValue("");
      setIsAdding(false);
      showToast(`Aturan "${newRule.nama_poin}" disimpan!`);
    } catch (err: any) {
      alert("Gagal menambahkan aturan: " + err.message);
    }
  };

  const handleDeleteRule = (id: string, name: string) => {
    setRuleToDelete({ id, name });
  };

  const executeDeleteRule = async (id: string, name: string) => {
    try {
      const { error } = await supabase
        .from("master_poin")
        .delete()
        .eq("id", id);

      if (error) throw error;

      const updated = await getMasterPoinList();
      setPoinList(updated);
      onRefreshTrigger();
      showToast(`Aturan "${name}" dihapus.`);
    } catch (err: any) {
      alert("Gagal menghapus aturan: " + err.message);
    }
  };

  const filteredRules = poinList.filter((r) => {
    const matchesFilter = 
      filterType === "Semua" ||
      (filterType === "Positif" && r.nilai_poin > 0) ||
      (filterType === "Negatif" && r.nilai_poin < 0);
    
    const matchesSearch = r.nama_poin.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  // Calculate statistics
  const totalRules = poinList.length;
  const rewardRules = poinList.filter(r => r.nilai_poin > 0).length;
  const violationRules = poinList.filter(r => r.nilai_poin < 0).length;

  return (
    <div className="bg-white rounded-3xl border border-brand-100 shadow-xl shadow-brand-900/5 p-5 sm:p-6 space-y-5">
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-50 bg-brand-950 text-white px-5 py-3.5 rounded-2xl shadow-2xl flex items-center gap-2.5 border border-brand-800">
          <Sparkles className="w-5 h-5 text-accent-500" />
          <span className="text-sm font-bold tracking-wide">{toastMsg}</span>
        </div>
      )}

      <h2 className="text-xl font-extrabold text-brand-950 tracking-tight">Aturan Baku Poin</h2>

      {/* Search & Filter Controls Panel */}
      <div className="flex flex-col md:flex-row gap-3 justify-between items-center mt-2">
        {/* Modern Compact Search Bar */}
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

        {/* Filter Pills */}
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

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setIsAdding(true)}
            className="flex items-center gap-1.5 px-4 py-2 brand-gradient text-white text-xs font-black rounded-lg transition-all shadow-md cursor-pointer ml-auto md:ml-0"
          >
            <Plus className="w-4 h-4" />
            Tambah Aturan
          </motion.button>
        </div>
      </div>

      {/* Space-Saving Minimalist List Area Header */}
      <div className="border border-brand-100 rounded-t-2xl bg-brand-50/80 border-b-0 overflow-hidden">
        {/* Header Row */}
        <div className="bg-brand-50/80 py-3.5 px-4 flex items-center justify-between gap-3 text-brand-500 text-xs font-black uppercase tracking-wider">
          <div className="flex-1 pl-6">Deskripsi Aturan Poin</div>
          <div className="flex items-center gap-4 flex-shrink-0">
            <div className="w-16 text-center">Nilai Poin</div>
            <div className="w-10 text-right pr-1">Aksi</div>
          </div>
        </div>
      </div>

      {/* Space-Saving Minimalist List Area Body */}
      <div className="border border-brand-100 border-t-0 rounded-b-2xl overflow-y-auto max-h-[250px] bg-brand-50/10">
        <div key={isLoading ? "loading" : filterType} className="divide-y divide-brand-100/50">
          {isLoading ? (
            [...Array(4)].map((_, i) => (
              <div key={i} className="py-3 px-4 flex items-center justify-between gap-3 animate-pulse bg-white/40 animate-fade-in">
                <div className="flex items-center gap-3.5 min-w-0 flex-1">
                  <div className="w-2.5 h-2.5 rounded-full bg-brand-100/60 flex-shrink-0"></div>
                  <div className="min-w-0 space-y-2">
                    <div className="h-4 bg-brand-100/60 rounded-md w-48 sm:w-64"></div>
                    <div className="h-3 bg-brand-50 rounded-md w-28"></div>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <div className="h-6 w-12 bg-brand-100/50 rounded-full"></div>
                  <div className="h-8 w-8 bg-brand-50 rounded-lg"></div>
                </div>
              </div>
            ))
          ) : filteredRules.length > 0 ? (
            filteredRules.map((rule) => {
              const isPositive = rule.nilai_poin > 0;
              return (
                <div
                  key={rule.id}
                  className="py-3 px-4 flex items-center justify-between gap-3 hover:bg-white transition-all animate-fade-in"
                >
                  {/* Left Side: Indicator + Text */}
                  <div className="flex items-center gap-3.5 min-w-0 flex-1">
                    {/* Micro Indicator Dot */}
                    <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                      isPositive ? "bg-emerald-500 shadow-sm shadow-emerald-500/30" : "bg-rose-500 shadow-sm shadow-rose-500/30"
                    }`} />
                    
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-brand-950 truncate leading-tight">
                        {rule.nama_poin}
                      </p>
                      <span className={`inline-block text-xs font-bold uppercase tracking-wide mt-1 ${
                        isPositive ? "text-emerald-600" : "text-rose-600"
                      }`}>
                        {isPositive ? "Penghargaan Prestasi" : "Pelanggaran Disiplin"}
                      </span>
                    </div>
                  </div>

                  {/* Right Side: Compact Badge + Action */}
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className={`font-mono text-sm font-black px-3 py-1 rounded-full border ${
                      isPositive 
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200" 
                        : "bg-rose-50 text-rose-700 border-rose-200"
                    }`}>
                      {isPositive ? `+${rule.nilai_poin}` : rule.nilai_poin}
                    </span>

                    <button
                      onClick={() => handleDeleteRule(rule.id, rule.nama_poin)}
                      className="text-brand-300 hover:text-rose-600 p-1.5 rounded-lg hover:bg-rose-50 transition-all cursor-pointer"
                      title="Hapus"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="py-12 text-center text-sm font-bold text-brand-400">
              Tidak ada aturan poin yang cocok.
            </div>
          )}
        </div>
      </div>

      {/* Modal to add new rules */}
      {isAdding && (
        <div className="fixed inset-0 bg-brand-950/65 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <motion.div 
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-3xl shadow-2xl border border-brand-100 w-full max-w-md p-6 flex flex-col"
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
                <p className="text-xs text-brand-400/90 font-medium leading-relaxed">
                  Angka positif untuk penghargaan (prestasi), negatif untuk sanksi pelanggaran disiplin.
                </p>
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

      {/* Confirmation Modal for Rule Deletion */}
      <ConfirmationModal
        isOpen={ruleToDelete !== null}
        onClose={() => setRuleToDelete(null)}
        onConfirm={() => {
          if (ruleToDelete) {
            executeDeleteRule(ruleToDelete.id, ruleToDelete.name);
          }
        }}
        title="Hapus Aturan Bobot Poin?"
        message={`Apakah Anda yakin ingin menghapus aturan baku "${ruleToDelete?.name}"? Tindakan ini tidak mengubah poin yang sudah tercatat di database log siswa.`}
        confirmText="Ya, Hapus"
        cancelText="Batal"
        type="danger"
      />
    </div>
  );
}
