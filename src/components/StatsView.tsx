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

import SkeletonLoader from "./SkeletonLoader";

export default function StatsView() {
  const [siswaList, setSiswaList] = useState<Siswa[]>([]);
  const [riwayatList, setRiwayatList] = useState<RiwayatPoin[]>([]);
  const [masterPoin, setMasterPoin] = useState<MasterPoin[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeRankTab, setActiveRankTab] = useState<"prestasi" | "sanksi" | "kasus">("prestasi");

  useEffect(() => {
    async function loadData() {
      setIsLoading(true);
      try {
        const siswa = await getSiswaList();
        const riwayat = await getRiwayatList();
        const master = await getMasterPoinList();
        setSiswaList(siswa);
        setRiwayatList(riwayat);
        setMasterPoin(master);
      } catch (err) {
        console.error("Gagal memuat statistik:", err);
      }
      setIsLoading(false);
    }
    loadData();
  }, []);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h2 className="text-xl font-extrabold text-brand-950 tracking-tight">Statistik Karakter Siswa</h2>

        {/* Metric Cards Skeleton */}
        <SkeletonLoader type="metrics" />

        {/* Charts & Rankings Row Skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Charts (Left Column) */}
          <div className="lg:col-span-8 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white p-5 rounded-3xl border border-brand-100/60 h-[280px] animate-pulse flex flex-col justify-between">
              <div className="h-4 w-1/3 bg-slate-200 rounded-md" />
              <div className="h-44 w-full bg-slate-100 rounded-2xl" />
            </div>
            <div className="bg-white p-5 rounded-3xl border border-brand-100/60 h-[280px] animate-pulse flex flex-col justify-between">
              <div className="h-4 w-1/3 bg-slate-200 rounded-md" />
              <div className="h-44 w-full bg-slate-100 rounded-2xl" />
            </div>
          </div>

          {/* Tabbed Rankings Card (Right Column) */}
          <div className="lg:col-span-4 bg-white p-5 rounded-3xl border border-brand-100/60 h-[280px] animate-pulse flex flex-col justify-between">
            <div className="flex gap-2 border-b border-brand-50 pb-3">
              <div className="h-6 w-16 bg-slate-200 rounded-lg" />
              <div className="h-6 w-16 bg-slate-200 rounded-lg" />
              <div className="h-6 w-16 bg-slate-200 rounded-lg" />
            </div>
            <div className="flex-1 space-y-3 mt-3">
              <div className="h-8 w-full bg-slate-100 rounded-xl" />
              <div className="h-8 w-full bg-slate-100 rounded-xl" />
              <div className="h-8 w-full bg-slate-100 rounded-xl" />
            </div>
          </div>
        </div>
      </div>
    );
  }

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
    <div className="space-y-6 animate-fade-in font-sans">
      
      {/* Page Title (Simple text, no board, no border, no icon) */}
      <h2 className="text-xl font-extrabold text-brand-950 tracking-tight">Statistik Karakter Siswa</h2>

      {/* 2. LARGE METRIC CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Total Siswa */}
        <div className="bg-white p-5 rounded-3xl border border-brand-100/60 shadow-md shadow-brand-900/5 flex items-center justify-between">
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
        <div className="bg-white p-5 rounded-3xl border border-brand-100/60 shadow-md shadow-brand-900/5 flex items-center justify-between">
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
        <div className="bg-white p-5 rounded-3xl border border-brand-100/60 shadow-md shadow-brand-900/5 flex items-center justify-between">
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
        <div className="bg-white p-5 rounded-3xl border border-brand-100/60 shadow-md shadow-brand-900/5 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Total Log</span>
            <span className="text-3xl font-black text-brand-950 block mt-1">{totalLogs}</span>
            <span className="text-[10px] font-bold text-amber-600 mt-1 block">Pencatatan Poin</span>
          </div>
          <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
            <Calendar className="w-7 h-7" />
          </div>
        </div>
      </div>

      {/* 3. CHARTS & RANKINGS (Side-by-Side Row - Spacious Version) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* LEFT AREA: Charts */}
        <div className="lg:col-span-8 grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Chart 1: Rata-rata Poin Kelas */}
          <div className="bg-white p-5 rounded-3xl border border-brand-100/60 shadow-md shadow-brand-900/5 flex flex-col justify-between h-[280px]">
            <div className="flex items-center justify-between mb-2 flex-shrink-0">
              <h3 className="text-sm font-black text-brand-950 flex items-center gap-1.5">
                <BarChart2 className="w-4.5 h-4.5 text-brand-600" />
                Rata-rata Poin Kelas
              </h3>
            </div>
            <div className="flex-1 min-h-0 w-full">
              {classChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={classChartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="name" stroke="#64748b" fontSize={9} fontWeight="bold" tickLine={false} />
                    <YAxis stroke="#64748b" fontSize={9} fontWeight="bold" tickLine={false} />
                    <Tooltip contentStyle={{ fontSize: 10, borderRadius: 12, fontWeight: "bold" }} />
                    <Bar dataKey="Rata-rata Poin" fill="#6d28d9" radius={[5, 5, 0, 0]} barSize={24} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-brand-400 font-bold">
                  Belum ada data.
                </div>
              )}
            </div>
          </div>

          {/* Chart 2: Distribusi Jenis Poin */}
          <div className="bg-white p-5 rounded-3xl border border-brand-100/60 shadow-md shadow-brand-900/5 flex flex-col justify-between h-[280px]">
            <div className="flex items-center justify-between mb-2 flex-shrink-0">
              <h3 className="text-sm font-black text-brand-950 flex items-center gap-1.5">
                <PieIcon className="w-4.5 h-4.5 text-brand-600" />
                Proporsi Log Poin
              </h3>
            </div>
            
            <div className="flex-1 min-h-0 flex items-center justify-between gap-4">
              <div className="flex-shrink-0 w-32 h-32">
                {logTypeDistribution.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={logTypeDistribution}
                        cx="50%"
                        cy="50%"
                        innerRadius={24}
                        outerRadius={46}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {logTypeDistribution.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ fontSize: 10, borderRadius: 12, fontWeight: "bold" }} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-xs text-brand-400 font-bold">
                    Belum ada data.
                  </div>
                )}
              </div>
              
              <div className="flex-1 space-y-2.5">
                {logTypeDistribution.map((item, index) => (
                  <div key={index} className="flex items-center justify-between p-2 rounded-2xl border border-brand-50 bg-brand-50/15">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }}></span>
                      <span className="text-xs font-black text-brand-850 truncate">{item.name}</span>
                    </div>
                    <span className="font-mono text-xs font-black text-brand-950 flex-shrink-0">{item.value}x</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT AREA: Tabbed Rankings (Spacious Tabbed List) */}
        <div className="lg:col-span-4 bg-white p-5 rounded-3xl border border-brand-100/60 shadow-md shadow-brand-900/5 flex flex-col justify-between h-[280px] min-h-[280px]">
          {/* Header Tab Bar */}
          <div className="flex border-b border-brand-50 pb-2.5 flex-shrink-0 gap-1.5 overflow-x-auto scrollbar-none">
            <button
              onClick={() => setActiveRankTab("prestasi")}
              className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer border ${
                activeRankTab === "prestasi"
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : "bg-slate-50 text-slate-500 border-transparent hover:bg-slate-100"
              }`}
            >
              Prestasi
            </button>
            <button
              onClick={() => setActiveRankTab("sanksi")}
              className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer border ${
                activeRankTab === "sanksi"
                  ? "bg-rose-50 text-rose-700 border-rose-200"
                  : "bg-slate-50 text-slate-500 border-transparent hover:bg-slate-100"
              }`}
            >
              Sanksi
            </button>
            <button
              onClick={() => setActiveRankTab("kasus")}
              className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer border ${
                activeRankTab === "kasus"
                  ? "bg-brand-50 text-brand-700 border-brand-200"
                  : "bg-slate-50 text-slate-500 border-transparent hover:bg-slate-100"
              }`}
            >
              Kasus
            </button>
          </div>

          {/* Active Tab Content (Scroll list inside) */}
          <div className="flex-1 overflow-y-auto mt-3 space-y-2 scrollbar-thin pr-0.5 max-h-[190px]">
            {activeRankTab === "prestasi" && (
              topAchievers.map((siswa, idx) => (
                <div key={siswa.id} className="flex items-center justify-between p-2.5 bg-brand-50/15 hover:bg-brand-50/30 rounded-2xl border border-brand-100/20 transition-all">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`w-6 h-6 rounded-xl flex items-center justify-center font-black text-[10px] flex-shrink-0 ${
                      idx === 0 ? "bg-amber-100 text-amber-700 border border-amber-300" :
                      idx === 1 ? "bg-slate-100 text-slate-700 border border-slate-300" :
                      idx === 2 ? "bg-orange-100 text-orange-700 border border-orange-300" :
                      "bg-brand-50 text-brand-600"
                    }`}>
                      {idx + 1}
                    </span>
                    <div className="min-w-0">
                      <h4 className="font-extrabold text-xs text-brand-950 truncate leading-none">{siswa.nama}</h4>
                      <p className="text-[9px] text-brand-400 font-semibold mt-1.5">{siswa.kelas}</p>
                    </div>
                  </div>
                  <span className="font-mono font-black text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-xl border border-emerald-100 text-[10px] flex-shrink-0">
                    {siswa.total_poin} pts
                  </span>
                </div>
              ))
            )}

            {activeRankTab === "sanksi" && (
              topViolators.length > 0 ? (
                topViolators.map((item, idx) => (
                  <div key={item.siswa.id} className="flex items-center justify-between p-2.5 bg-brand-50/15 hover:bg-brand-50/30 rounded-2xl border border-brand-100/20 transition-all">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="w-6 h-6 rounded-xl flex items-center justify-center font-black text-[10px] flex-shrink-0 bg-rose-50 text-rose-700 border border-rose-100">
                        {idx + 1}
                      </span>
                      <div className="min-w-0">
                        <h4 className="font-extrabold text-xs text-brand-950 truncate leading-none">{item.siswa.nama}</h4>
                        <p className="text-[9px] text-brand-400 font-semibold mt-1.5">{item.siswa.kelas}</p>
                      </div>
                    </div>
                    <span className="font-mono font-black text-rose-600 bg-rose-50 px-2.5 py-1 rounded-xl border border-rose-100 text-[10px] flex-shrink-0">
                      {item.sum} pts
                    </span>
                  </div>
                ))
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-brand-400 font-bold py-12">
                  Belum ada data sanksi.
                </div>
              )
            )}

            {activeRankTab === "kasus" && (
              popularRulesData.length > 0 ? (
                popularRulesData.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2.5 bg-brand-50/15 hover:bg-brand-50/30 rounded-2xl border border-brand-100/20 transition-all">
                    <div className="min-w-0 flex-1">
                      <h4 className="font-extrabold text-xs text-brand-950 truncate leading-none" title={item.fullName}>
                        {item.fullName}
                      </h4>
                      <p className={`text-[8px] font-black uppercase mt-1.5 ${item.Tipe === "Penghargaan" ? "text-emerald-600" : "text-rose-600"}`}>
                        {item.Tipe}
                      </p>
                    </div>
                    <span className="font-mono font-black text-brand-900 bg-brand-50 px-2.5 py-1 rounded-xl border border-brand-100 flex-shrink-0 text-[10px] ml-2">
                      {item.Frekuensi}x
                    </span>
                  </div>
                ))
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-brand-400 font-bold py-12">
                  Belum ada data pencatatan.
                </div>
              )
            )}
          </div>
        </div>

      </div>

    </div>
  );
}
