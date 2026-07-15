import React, { useState, useEffect } from "react";
import { motion } from "motion/react";
import { 
  TrendingUp, 
  Award, 
  AlertTriangle, 
  Users, 
  Calendar, 
  BarChart2,
  PieChart as PieIcon,
  Sparkles
} from "lucide-react";
import { 
  getSiswaList, 
  getRiwayatList, 
  getMasterPoinList 
} from "../dbStore";
import { Siswa, RiwayatPoin, MasterPoin } from "../types";
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  PieChart, 
  Pie, 
  Cell 
} from "recharts";

export default function StatsView() {
  const [siswaList, setSiswaList] = useState<Siswa[]>([]);
  const [riwayatList, setRiwayatList] = useState<RiwayatPoin[]>([]);
  const [masterPoin, setMasterPoin] = useState<MasterPoin[]>([]);

  useEffect(() => {
    async function loadData() {
      const siswa = await getSiswaList();
      const riwayat = await getRiwayatList();
      const master = await getMasterPoinList();
      setSiswaList(siswa);
      setRiwayatList(riwayat);
      setMasterPoin(master);
    }
    loadData();
  }, []);

  // 1. Metric Calculations
  const totalSiswa = siswaList.length;
  const totalLogs = riwayatList.length;
  
  const totalPoinPositif = riwayatList
    .filter(r => r.nilai_diberikan > 0)
    .reduce((sum, r) => sum + r.nilai_diberikan, 0);

  const totalPoinNegatif = riwayatList
    .filter(r => r.nilai_diberikan < 0)
    .reduce((sum, r) => sum + Math.abs(r.nilai_diberikan), 0);

  // 2. Class Distributions (Average points per class)
  const classGroups: { [key: string]: { total: number; count: number } } = {};
  siswaList.forEach(s => {
    if (!classGroups[s.kelas]) {
      classGroups[s.kelas] = { total: 0, count: 0 };
    }
    classGroups[s.kelas].total += s.total_poin;
    classGroups[s.kelas].count += 1;
  });

  const classChartData = Object.keys(classGroups).map(className => ({
    name: className,
    "Rata-rata Poin": Math.round(classGroups[className].total / classGroups[className].count),
    "Jumlah Siswa": classGroups[className].count
  }));

  // 3. Top 5 Students by Achievement (Highest total_poin)
  const topAchievers = [...siswaList]
    .sort((a, b) => b.total_poin - a.total_poin)
    .slice(0, 5);

  // 4. Top 5 Students by Violations (Calculated from history of negative points)
  const studentViolationSums: { [key: string]: { siswa: Siswa; sum: number } } = {};
  siswaList.forEach(s => {
    studentViolationSums[s.id] = { siswa: s, sum: 0 };
  });

  riwayatList.forEach(r => {
    if (r.nilai_diberikan < 0 && studentViolationSums[r.siswa_id]) {
      studentViolationSums[r.siswa_id].sum += Math.abs(r.nilai_diberikan);
    }
  });

  const topViolators = Object.values(studentViolationSums)
    .filter(item => item.sum > 0)
    .sort((a, b) => b.sum - a.sum)
    .slice(0, 5);

  // 5. Popular Rules (Most frequent in history)
  const ruleCounts: { [key: string]: { name: string; count: number; value: number } } = {};
  riwayatList.forEach(r => {
    if (!ruleCounts[r.nama_poin]) {
      ruleCounts[r.nama_poin] = { name: r.nama_poin, count: 0, value: r.nilai_diberikan };
    }
    ruleCounts[r.nama_poin].count += 1;
  });

  const popularRulesData = Object.values(ruleCounts)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map(item => ({
      name: item.name.length > 30 ? item.name.slice(0, 30) + "..." : item.name,
      fullName: item.name,
      Frekuensi: item.count,
      Tipe: item.value > 0 ? "Penghargaan" : "Pelanggaran"
    }));

  // 6. Pie Chart of Positive vs Negative logs count
  const logTypeDistribution = [
    { name: "Penghargaan (+)", value: riwayatList.filter(r => r.nilai_diberikan > 0).length, color: "#10b981" },
    { name: "Pelanggaran (-)", value: riwayatList.filter(r => r.nilai_diberikan < 0).length, color: "#f43f5e" }
  ].filter(d => d.value > 0);

  return (
    <div className="space-y-8 animate-fade-in font-sans">
      
      {/* 1. HEADER */}
      <div className="bg-white p-6 rounded-3xl border border-brand-100/60 shadow-xl shadow-brand-900/5">
        <h2 className="text-xl font-black text-brand-950 flex items-center gap-2">
          <TrendingUp className="w-6 h-6 text-brand-600" />
          Statistik Karakter Siswa
        </h2>
        <p className="text-xs text-brand-500 font-medium mt-1">
          Laporan ringkas poin prestasi dan sanksi pelanggaran kedisiplinan.
        </p>
      </div>

      {/* 2. LARGE METRIC CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Total Siswa */}
        <div className="bg-white p-6 rounded-3xl border border-brand-100/60 shadow-md shadow-brand-900/5 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Total Siswa</span>
            <span className="text-3xl font-black text-brand-950 block mt-1">{totalSiswa}</span>
            <span className="text-[10px] font-bold text-brand-500 mt-1 block">Aktif Terdaftar</span>
          </div>
          <div className="w-14 h-14 rounded-2xl bg-brand-50 text-brand-600 flex items-center justify-center font-bold">
            <Users className="w-7 h-7" />
          </div>
        </div>

        {/* Total Apresiasi */}
        <div className="bg-white p-6 rounded-3xl border border-brand-100/60 shadow-md shadow-brand-900/5 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Apresiasi (+)</span>
            <span className="text-3xl font-black text-emerald-600 block mt-1">+{totalPoinPositif}</span>
            <span className="text-[10px] font-bold text-emerald-600 mt-1 block">Poin Perilaku Baik</span>
          </div>
          <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
            <Award className="w-7 h-7" />
          </div>
        </div>

        {/* Total Sanksi */}
        <div className="bg-white p-6 rounded-3xl border border-brand-100/60 shadow-md shadow-brand-900/5 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Sanksi (-)</span>
            <span className="text-3xl font-black text-rose-600 block mt-1">-{totalPoinNegatif}</span>
            <span className="text-[10px] font-bold text-rose-600 mt-1 block">Poin Pelanggaran</span>
          </div>
          <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold">
            <AlertTriangle className="w-7 h-7" />
          </div>
        </div>

        {/* Total Logs */}
        <div className="bg-white p-6 rounded-3xl border border-brand-100/60 shadow-md shadow-brand-900/5 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Total Log</span>
            <span className="text-3xl font-black text-brand-950 block mt-1">{totalLogs}</span>
            <span className="text-[10px] font-bold text-amber-600 mt-1 block">Riwayat Transaksi</span>
          </div>
          <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
            <Calendar className="w-7 h-7" />
          </div>
        </div>
      </div>

      {/* 3. CHARTS SECTION (2 Columns with large dimensions) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Left Chart: Rata-rata Poin Kelas */}
        <div className="bg-white p-6 rounded-3xl border border-brand-100/60 shadow-xl shadow-brand-900/5 flex flex-col justify-between h-[360px]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-black text-brand-950 flex items-center gap-2">
              <BarChart2 className="w-5 h-5 text-brand-600" />
              Rata-rata Poin Kelas
            </h3>
            <span className="text-[9px] font-bold text-brand-700 bg-brand-50 border border-brand-100 px-2 py-0.5 rounded-lg">Rata-rata Poin</span>
          </div>
          <div className="flex-1 min-h-0 w-full">
            {classChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={classChartData} margin={{ bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f5f5f5" />
                  <XAxis dataKey="name" tick={{ fill: '#6b7280', fontSize: 10, fontWeight: 'bold' }} stroke="#e5e7eb" />
                  <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} stroke="#e5e7eb" />
                  <Tooltip 
                    contentStyle={{ borderRadius: "1rem", border: "1px solid #e2e8f0", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)" }}
                    labelClassName="font-extrabold text-brand-950 text-xs"
                  />
                  <Legend wrapperStyle={{ fontSize: 10, fontWeight: 'bold', paddingTop: 10 }} />
                  <Bar dataKey="Rata-rata Poin" fill="#6d28d9" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Jumlah Siswa" fill="#c084fc" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-brand-400 font-bold">
                Belum ada data distribusi kelas.
              </div>
            )}
          </div>
        </div>

        {/* Right Chart: Rasio Poin */}
        <div className="bg-white p-6 rounded-3xl border border-brand-100/60 shadow-xl shadow-brand-900/5 flex flex-col justify-between h-[360px]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-black text-brand-950 flex items-center gap-2">
              <PieIcon className="w-5 h-5 text-brand-600" />
              Perbandingan Jenis Poin
            </h3>
            <span className="text-[9px] font-bold text-brand-700 bg-brand-50 border border-brand-100 px-2 py-0.5 rounded-lg">Rasio Log</span>
          </div>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-6 flex-1 min-h-0">
            <div className="w-40 h-40 flex-shrink-0 relative">
              {logTypeDistribution.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={logTypeDistribution}
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={65}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {logTypeDistribution.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: "1rem" }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-brand-400 font-bold">
                  Belum ada data.
                </div>
              )}
            </div>
            
            <div className="flex-1 w-full space-y-2 max-w-[200px]">
              {logTypeDistribution.map((item, index) => (
                <div key={index} className="flex items-center justify-between p-2.5 rounded-2xl border border-brand-50 bg-brand-50/15">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }}></span>
                    <span className="text-xs font-black text-brand-850">{item.name}</span>
                  </div>
                  <span className="font-mono text-xs font-black text-brand-950">{item.value} log</span>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>

      {/* 4. THREE COLUMNS FOR LISTS & RANKINGS (Clear, neat layout) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        
        {/* Siswa Berprestasi */}
        <div className="bg-white p-6 rounded-3xl border border-brand-100/60 shadow-xl shadow-brand-900/5 space-y-4">
          <div className="flex items-center justify-between border-b border-brand-50 pb-3">
            <h3 className="text-sm font-black text-brand-950 flex items-center gap-1.5">
              <Award className="w-4 h-4 text-emerald-600" />
              Siswa Berprestasi (Top 5)
            </h3>
            <span className="text-[8px] font-black bg-emerald-50 text-emerald-700 px-2.5 py-0.5 rounded-md border border-emerald-100">
              TERTINGGI
            </span>
          </div>

          <div className="space-y-2">
            {topAchievers.map((siswa, idx) => (
              <div key={siswa.id} className="flex items-center justify-between p-2.5 bg-brand-50/15 hover:bg-brand-50/30 rounded-2xl border border-brand-100/20 transition-all">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className={`w-6 h-6 rounded-xl flex items-center justify-center font-black text-xs flex-shrink-0 ${
                    idx === 0 ? "bg-amber-100 text-amber-700 border border-amber-300" :
                    idx === 1 ? "bg-slate-100 text-slate-700 border border-slate-300" :
                    idx === 2 ? "bg-orange-100 text-orange-700 border border-orange-300" :
                    "bg-brand-50 text-brand-600"
                  }`}>
                    {idx + 1}
                  </span>
                  <div className="min-w-0">
                    <h4 className="font-extrabold text-xs text-brand-950 truncate leading-tight">{siswa.nama}</h4>
                    <p className="text-[9px] text-brand-400 font-semibold uppercase mt-0.5">{siswa.kelas} &bull; NIS {siswa.nis}</p>
                  </div>
                </div>
                <span className="font-mono font-black text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-100 shadow-2xs text-[10px] flex-shrink-0">
                  {siswa.total_poin} pts
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Siswa Pelanggaran Terbanyak */}
        <div className="bg-white p-6 rounded-3xl border border-brand-100/60 shadow-xl shadow-brand-900/5 space-y-4">
          <div className="flex items-center justify-between border-b border-brand-50 pb-3">
            <h3 className="text-sm font-black text-brand-950 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-rose-600" />
              Sanksi Terbanyak (Top 5)
            </h3>
            <span className="text-[8px] font-black bg-rose-50 text-rose-700 px-2 py-0.5 rounded-md border border-rose-100">
              TERBANYAK
            </span>
          </div>

          <div className="space-y-2">
            {topViolators.length > 0 ? (
              topViolators.map((item, idx) => (
                <div key={item.siswa.id} className="flex items-center justify-between p-2.5 bg-brand-50/15 hover:bg-brand-50/30 rounded-2xl border border-brand-100/20 transition-all">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-6 h-6 rounded-xl flex items-center justify-center font-black text-xs flex-shrink-0 bg-rose-50 text-rose-700 border border-rose-100">
                      {idx + 1}
                    </span>
                    <div className="min-w-0">
                      <h4 className="font-extrabold text-xs text-brand-950 truncate leading-tight">{item.siswa.nama}</h4>
                      <p className="text-[9px] text-brand-400 font-semibold uppercase mt-0.5">{item.siswa.kelas} &bull; NIS {item.siswa.nis}</p>
                    </div>
                  </div>
                  <span className="font-mono font-black text-rose-600 bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-100 shadow-2xs text-[10px] flex-shrink-0">
                    {item.sum} pts
                  </span>
                </div>
              ))
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-brand-400 font-bold py-12">
                Belum ada data sanksi.
              </div>
            )}
          </div>
        </div>

        {/* Kasus Terpopuler */}
        <div className="bg-white p-6 rounded-3xl border border-brand-100/60 shadow-xl shadow-brand-900/5 space-y-4 md:col-span-2 lg:col-span-1">
          <div className="flex items-center justify-between border-b border-brand-50 pb-3">
            <h3 className="text-sm font-black text-brand-950 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-brand-600" />
              Kasus Terpopuler (Top 5)
            </h3>
            <span className="text-[8px] font-black bg-brand-50 text-brand-700 px-2 py-0.5 rounded-md border border-brand-100">
              FREKUENSI
            </span>
          </div>

          <div className="space-y-2">
            {popularRulesData.length > 0 ? (
              popularRulesData.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between p-2.5 bg-brand-50/15 hover:bg-brand-50/30 rounded-2xl border border-brand-100/20 transition-all">
                  <div className="min-w-0 flex-1">
                    <h4 className="font-extrabold text-xs text-brand-950 truncate leading-tight" title={item.fullName}>
                      {item.fullName}
                    </h4>
                    <p className={`text-[8px] font-black uppercase mt-1 ${item.Tipe === "Penghargaan" ? "text-emerald-600" : "text-rose-600"}`}>
                      {item.Tipe}
                    </p>
                  </div>
                  <span className="font-mono font-black text-brand-900 bg-brand-50 px-2.5 py-1 rounded-lg border border-brand-100 flex-shrink-0 text-[10px] ml-2">
                    {item.Frekuensi}x
                  </span>
                </div>
              ))
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-brand-400 font-bold py-12">
                Belum ada data pencatatan.
              </div>
            )}
          </div>
        </div>

      </div>

    </div>
  );
}
