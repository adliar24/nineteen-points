'use client';

import React, { useState } from 'react';
import { createClient } from '../../utils/supabase/client';
import {
  Search,
  Plus,
  Trash2,
  FileSpreadsheet,
  Award,
  Filter,
  UserPlus,
  RefreshCw,
  TrendingUp,
  X,
  Sparkles,
  ChevronDown,
  LogOut
} from 'lucide-react';
import { useRouter } from 'next/navigation';

interface Siswa {
  id: string;
  nis: string;
  nama: string;
  kelas: string;
  total_poin: number;
}

interface MasterPoin {
  id: string;
  nama_poin: string;
  nilai_poin: number;
}

interface DashboardClientProps {
  userEmail: string;
  initialSiswa: Siswa[];
  initialMasterPoin: MasterPoin[];
}

export default function DashboardClient({
  userEmail,
  initialSiswa,
  initialMasterPoin,
}: DashboardClientProps) {
  const router = useRouter();
  const supabase = createClient();

  const [siswaList, setSiswaList] = useState<Siswa[]>(initialSiswa);
  const [masterPoin, setMasterPoin] = useState<MasterPoin[]>(initialMasterPoin);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedKelas, setSelectedKelas] = useState('Semua');
  const [selectedSiswaIds, setSelectedSiswaIds] = useState<string[]>([]);

  // Modals
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isAddSiswaModalOpen, setIsAddSiswaModalOpen] = useState(false);
  const [isSinglePointModalOpen, setIsSinglePointModalOpen] = useState(false);
  const [selectedSingleSiswa, setSelectedSingleSiswa] = useState<Siswa | null>(null);

  // Point Fields
  const [selectedPoinId, setSelectedPoinId] = useState('');
  const [customPointName, setCustomPointName] = useState('');
  const [customPointValue, setCustomPointValue] = useState(10);
  const [isCustomPoint, setIsCustomPoint] = useState(false);

  // New Student Fields
  const [newNis, setNewNis] = useState('');
  const [newNama, setNewNama] = useState('');
  const [newKelas, setNewKelas] = useState('XII IPA 1');
  const [newPoin, setNewPoin] = useState('100');

  const [toast, setToast] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 4000);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  const reloadData = async () => {
    setIsLoading(true);
    const { data: siswa } = await supabase.from('siswa').select('*').order('nama');
    const { data: poin } = await supabase.from('master_poin').select('*').order('nilai_poin');
    if (siswa) setSiswaList(siswa);
    if (poin) setMasterPoin(poin);
    setIsLoading(false);
    showToast('Data berhasil disinkronkan langsung dari Supabase.');
  };

  const classes = ['Semua', ...Array.from(new Set(siswaList.map((s) => s.kelas)))];

  const filteredSiswa = siswaList.filter((s) => {
    const matchesSearch =
      s.nama.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.nis.includes(searchQuery);
    const matchesClass = selectedKelas === 'Semua' || s.kelas === selectedKelas;
    return matchesSearch && matchesClass;
  });

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedSiswaIds(filteredSiswa.map((s) => s.id));
    } else {
      setSelectedSiswaIds([]);
    }
  };

  const handleSelectSiswa = (id: string) => {
    if (selectedSiswaIds.includes(id)) {
      setSelectedSiswaIds(selectedSiswaIds.filter((item) => item !== id));
    } else {
      setSelectedSiswaIds([...selectedSiswaIds, id]);
    }
  };

  // 1. Submit Single Point Assignment
  const applySinglePoint = async () => {
    if (!selectedSingleSiswa) return;

    let name = '';
    let value = 0;

    if (isCustomPoint) {
      if (!customPointName) return alert('Poin kustom wajib diisi');
      name = customPointName;
      value = customPointValue;
    } else {
      const p = masterPoin.find((item) => item.id === selectedPoinId);
      if (!p) return alert('Silakan pilih jenis pelanggaran / prestasi');
      name = p.nama_poin;
      value = p.nilai_poin;
    }

    setIsLoading(true);

    try {
      const newScore = selectedSingleSiswa.total_poin + value;

      // Update student points in Supabase
      const { error: studentError } = await supabase
        .from('siswa')
        .update({ total_poin: newScore })
        .eq('id', selectedSingleSiswa.id);

      if (studentError) throw studentError;

      // Create log in 'riwayat_poin'
      const { error: historyError } = await supabase.from('riwayat_poin').insert({
        siswa_id: selectedSingleSiswa.id,
        nilai_diberikan: value,
        nama_poin: name,
        guru_email: userEmail,
      });

      if (historyError) throw historyError;

      showToast(`Poin berhasil dicatat untuk siswa ${selectedSingleSiswa.nama}`);
      setIsSinglePointModalOpen(false);
      setSelectedSingleSiswa(null);
      setSelectedPoinId('');
      setCustomPointName('');
      setIsCustomPoint(false);
      
      // Refresh list
      reloadData();
    } catch (err: any) {
      alert(`Gagal: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // 2. Submit Bulk Point Assignment
  const applyBulkPoints = async () => {
    if (selectedSiswaIds.length === 0) return;

    let name = '';
    let value = 0;

    if (isCustomPoint) {
      if (!customPointName) return alert('Poin kustom wajib diisi');
      name = customPointName;
      value = customPointValue;
    } else {
      const p = masterPoin.find((item) => item.id === selectedPoinId);
      if (!p) return alert('Silakan pilih jenis pelanggaran / prestasi');
      name = p.nama_poin;
      value = p.nilai_poin;
    }

    setIsLoading(true);

    try {
      // Loop update each selected student
      for (const studentId of selectedSiswaIds) {
        const student = siswaList.find((s) => s.id === studentId);
        if (student) {
          const newScore = student.total_poin + value;

          await supabase
            .from('siswa')
            .update({ total_poin: newScore })
            .eq('id', studentId);

          await supabase.from('riwayat_poin').insert({
            siswa_id: studentId,
            nilai_diberikan: value,
            nama_poin: name,
            guru_email: userEmail,
          });
        }
      }

      showToast(`Berhasil memberikan poin massal ke ${selectedSiswaIds.length} siswa.`);
      setSelectedSiswaIds([]);
      setIsBulkModalOpen(false);
      setSelectedPoinId('');
      setCustomPointName('');
      setIsCustomPoint(false);

      reloadData();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // 3. Add Individual Student Manual
  const handleAddSiswa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNis || !newNama) return alert('Mohon lengkapi semua kolom');

    setIsLoading(true);

    const { error } = await supabase.from('siswa').insert({
      nis: newNis,
      nama: newNama,
      kelas: newKelas,
      total_poin: parseInt(newPoin, 10) || 100,
    });

    setIsLoading(false);

    if (error) {
      alert(`Gagal menyimpan siswa: ${error.message}`);
    } else {
      showToast(`Siswa "${newNama}" berhasil terdaftar di database Supabase.`);
      setNewNis('');
      setNewNama('');
      setIsAddSiswaModalOpen(false);
      reloadData();
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 lg:p-8">
      {/* Toast */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 bg-slate-900 text-white px-5 py-3 rounded-xl shadow-2xl flex items-center gap-3 border border-slate-700 animate-bounce">
          <Sparkles className="w-5 h-5 text-emerald-400" />
          <span className="text-sm font-medium">{toast}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex justify-between items-center bg-white p-5 rounded-2xl border border-slate-100 shadow-xs mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Roster NineTeen Points</h1>
          <p className="text-xs text-slate-500">Guru Login: <strong>{userEmail}</strong></p>
        </div>
        <button
          onClick={handleLogout}
          className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-700 font-bold rounded-xl text-xs transition-all flex items-center gap-2"
        >
          <LogOut className="w-4 h-4" />
          Log Out
        </button>
      </div>

      {/* Filter and actions */}
      <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm mb-6 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex flex-wrap gap-3 flex-1">
            <input
              type="text"
              placeholder="Cari Siswa Berdasarkan Nama atau NIS..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="px-4 py-2.5 bg-slate-50 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 flex-1 text-slate-950"
            />

            <select
              value={selectedKelas}
              onChange={(e) => {
                setSelectedKelas(e.target.value);
                setSelectedSiswaIds([]);
              }}
              className="py-2.5 px-4 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700"
            >
              {classes.map((cls) => (
                <option key={cls} value={cls}>
                  {cls === 'Semua' ? 'Semua Kelas' : `Kelas ${cls}`}
                </option>
              ))}
            </select>

            <button
              onClick={reloadData}
              className="p-3 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          <div className="flex gap-2">
            {selectedSiswaIds.length > 0 && (
              <button
                onClick={() => setIsBulkModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold transition-all shadow-md"
              >
                Beri Poin Massal ({selectedSiswaIds.length})
              </button>
            )}

            <button
              onClick={() => setIsAddSiswaModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-md"
            >
              <UserPlus className="w-4 h-4" />
              Siswa Baru
            </button>
          </div>
        </div>
      </div>

      {/* Student Table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 text-xs font-semibold uppercase">
                <th className="py-4 px-6 w-12 text-center">
                  <input
                    type="checkbox"
                    checked={
                      filteredSiswa.length > 0 &&
                      filteredSiswa.every((s) => selectedSiswaIds.includes(s.id))
                    }
                    onChange={handleSelectAll}
                    className="w-4 h-4 rounded text-emerald-600"
                  />
                </th>
                <th className="py-4 px-4">NIS</th>
                <th className="py-4 px-6">Nama Lengkap</th>
                <th className="py-4 px-6">Kelas</th>
                <th className="py-4 px-6 text-center">Total Poin</th>
                <th className="py-4 px-6 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-800 text-sm">
              {filteredSiswa.map((siswa) => {
                const isSelected = selectedSiswaIds.includes(siswa.id);
                return (
                  <tr key={siswa.id} className={isSelected ? 'bg-emerald-50/25' : ''}>
                    <td className="py-4 px-6 text-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleSelectSiswa(siswa.id)}
                        className="w-4 h-4 rounded text-emerald-600"
                      />
                    </td>
                    <td className="py-4 px-4 font-mono text-xs">{siswa.nis}</td>
                    <td className="py-4 px-6 font-semibold">{siswa.nama}</td>
                    <td className="py-4 px-6">{siswa.kelas}</td>
                    <td className="py-4 px-6 text-center">
                      <span className="font-bold font-mono px-3 py-1 rounded-full bg-slate-100">
                        {siswa.total_poin}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-right">
                      <button
                        onClick={() => {
                          setSelectedSingleSiswa(siswa);
                          setIsSinglePointModalOpen(true);
                        }}
                        className="text-emerald-600 hover:text-emerald-800 text-xs font-bold"
                      >
                        Beri Poin
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* SINGLE POINT MODAL */}
      {isSinglePointModalOpen && selectedSingleSiswa && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md space-y-4 shadow-xl">
            <h3 className="text-lg font-bold">Beri Poin: {selectedSingleSiswa.nama}</h3>
            
            <div className="space-y-4">
              <select
                value={selectedPoinId}
                onChange={(e) => setSelectedPoinId(e.target.value)}
                className="w-full border p-3 rounded-xl bg-slate-50 text-sm"
              >
                <option value="">-- Pilih Penghargaan / Pelanggaran --</option>
                {masterPoin.map((p) => (
                  <option key={p.id} value={p.id}>
                    [{p.nilai_poin}] {p.nama_poin}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-2 justify-end pt-4 border-t">
              <button
                onClick={() => setIsSinglePointModalOpen(false)}
                className="px-4 py-2 border rounded-xl text-sm"
              >
                Batal
              </button>
              <button
                onClick={applySinglePoint}
                className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-bold"
              >
                Simpan Poin
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
