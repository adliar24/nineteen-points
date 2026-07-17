import React, { useState, useEffect, useMemo } from "react";
import { 
  Award, 
  AlertTriangle, 
  Users, 
  Calendar, 
  BarChart2
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
  Tooltip 
} from "recharts";

import SkeletonLoader from "./SkeletonLoader";
import { toSentenceCase } from "../formatName";

type ChartTab = "kelas" | "siswa" | "hari";

const DAY_NAMES = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

export default function StatsView() {
  const [siswaList, setSiswaList] = useState<Siswa[]>([]);
  const [riwayatList, setRiwayatList] = useState<RiwayatPoin[]>([]);
  const [masterPoin, setMasterPoin] = useState<MasterPoin[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeRankTab, setActiveRankTab] = useState<"prestasi" | "sanksi" | "kasus">("prestasi");
  const [activeChartTab, setActiveChartTab] = useState<ChartTab>("kelas");

  useEffect(() => {
    async function loadData() {
      setIsLoading(true);
      try {
        const [siswa, riwayat, master] = await Promise.all([
          getSiswaList(),
          getRiwayatList(),
          getMasterPoinList()
        ]);
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
        <h2 className="text-xl font-extrabold text-brand-950 tracking-tight">Statistik Karakter Murid</h2>
        <SkeletonLoader type="metrics" />
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 bg-white p-5 rounded-3xl border border-brand-100/60 h-[380px] animate-pulse flex flex-col justify-between">
            <div className="h-4 w-1/3 bg-slate-200 rounded-md" />
            <div className="h-44 w-full bg-slate-100 rounded-2xl" />
          </div>
          <div className="lg:col-span-4 bg-white p-5 rounded-3xl border border-brand-100/60 h-[380px] animate-pulse flex flex-col justify-between">
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
  
  const totalPoinPositif = useMemo(() => riwayatList
    .filter(r => r.nilai_diberikan > 0)
    .reduce((sum, r) => sum + r.nilai_diberikan, 0), [riwayatList]);

  const totalPoinNegatif = useMemo(() => riwayatList
    .filter(r => r.nilai_diberikan < 0)
    .reduce((sum, r) => sum + Math.abs(r.nilai_diberikan), 0), [riwayatList]);

  // 2. Top 5 Students by Achievement
  const topAchievers = useMemo(() => [...siswaList]
    .sort((a, b) => b.total_poin - a.total_poin)
    .slice(0, 5), [siswaList]);

  // 3. Class Chart Data (Top 5 by average points)
  const classChartData = useMemo(() => {
    const classGroups: { [key: string]: { total: number; count: number } } = {};
    siswaList.forEach(s => {
      if (!classGroups[s.kelas]) {
        classGroups[s.kelas] = { total: 0, count: 0 };
      }
      classGroups[s.kelas].total += s.total_poin;
      classGroups[s.kelas].count += 1;
    });
    return Object.keys(classGroups)
      .map(className => ({
        name: className,
        "Rata-rata Poin": Math.round(classGroups[className].total / classGroups[className].count),
        "Jumlah Murid": classGroups[className].count
      }))
      .sort((a, b) => b["Rata-rata Poin"] - a["Rata-rata Poin"])
      .slice(0, 5);
  }, [siswaList]);

  // 3. Student Chart Data (Top 5 by total points)
  const studentChartData = useMemo(() => [...siswaList]
    .sort((a, b) => b.total_poin - a.total_poin)
    .slice(0, 5)
    .map(s => ({
      name: s.nama.length > 15 ? s.nama.slice(0, 15) + "..." : s.nama,
      fullName: s.nama,
      "Total Poin": s.total_poin,
      Kelas: s.kelas
    })), [siswaList]);

  // 4. Day Chart Data (Average points per day of week)
  const dayChartData = useMemo(() => {
    const dayGroups: { [key: string]: { total: number; count: number } } = {};
    DAY_NAMES.forEach(d => { dayGroups[d] = { total: 0, count: 0 }; });
    riwayatList.forEach(r => {
      const date = new Date(r.created_at);
      const dayName = DAY_NAMES[date.getDay()];
      dayGroups[dayName].total += r.nilai_diberikan;
      dayGroups[dayName].count += 1;
    });
    return DAY_NAMES
      .filter(d => dayGroups[d].count > 0)
      .map(d => ({
        name: d,
        "Rata-rata Poin": dayGroups[d].count > 0 ? Math.round(dayGroups[d].total / dayGroups[d].count) : 0,
        "Jumlah Log": dayGroups[d].count
      }))
      .sort((a, b) => b["Rata-rata Poin"] - a["Rata-rata Poin"])
      .slice(0, 5);
  }, [riwayatList]);

  // 5. Top 5 Students by Violations
  const topViolators = useMemo(() => {
    const studentViolationSums: { [key: string]: { siswa: Siswa; sum: number } } = {};
    siswaList.forEach(s => {
      studentViolationSums[s.id] = { siswa: s, sum: 0 };
    });
    riwayatList.forEach(r => {
      if (r.nilai_diberikan < 0 && studentViolationSums[r.siswa_id]) {
        studentViolationSums[r.siswa_id].sum += Math.abs(r.nilai_diberikan);
      }
    });
    return Object.values(studentViolationSums)
      .filter(item => item.sum > 0)
      .sort((a, b) => b.sum - a.sum)
      .slice(0, 5);
  }, [siswaList, riwayatList]);

  // 6. Popular Rules (Top 5)
  const popularRulesData = useMemo(() => {
    const ruleCounts: { [key: string]: { name: string; count: number; value: number } } = {};
    riwayatList.forEach(r => {
      if (!ruleCounts[r.nama_poin]) {
        ruleCounts[r.nama_poin] = { name: r.nama_poin, count: 0, value: r.nilai_diberikan };
      }
      ruleCounts[r.nama_poin].count += 1;
    });
    return Object.values(ruleCounts)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
      .map(item => ({
        name: item.name.length > 30 ? item.name.slice(0, 30) + "..." : item.name,
        fullName: item.name,
        Frekuensi: item.count,
        Tipe: item.value > 0 ? "Penghargaan" : "Pelanggaran"
      }));
  }, [riwayatList]);

  // Chart tab config
  const chartTabs = useMemo(() => [
    { key: "kelas" as ChartTab, label: "Kelas", icon: <BarChart2 className="w-3.5 h-3.5" /> },
    { key: "siswa" as ChartTab, label: "Siswa", icon: <Users className="w-3.5 h-3.5" /> },
    { key: "hari" as ChartTab, label: "Hari", icon: <Calendar className="w-3.5 h-3.5" /> },
  ], []);

  const activeChart = useMemo(() => {
    switch (activeChartTab) {
      case "kelas": return { data: classChartData, dataKey: "Rata-rata Poin", color: "#6d28d9", label: "Rata-rata Poin per Kelas (Top 5)" };
      case "siswa": return { data: studentChartData, dataKey: "Total Poin", color: "#0891b2", label: "Total Poin per Siswa (Top 5)" };
      case "hari": return { data: dayChartData, dataKey: "Rata-rata Poin", color: "#d97706", label: "Rata-rata Poin per Hari (Top 5)" };
    }
  }, [activeChartTab, classChartData, studentChartData, dayChartData]);

  return (
    <div className="space-y-6 pb-8 animate-fade-in font-sans">
      
      {/* Page Title */}
      <h2 className="text-xl font-extrabold text-brand-950 tracking-tight">Statistik Karakter Murid</h2>

      {/* METRIC CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-5 rounded-3xl border border-brand-100/60 shadow-md shadow-brand-900/5 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Total Murid</span>
            <span className="text-3xl font-black text-brand-950 block mt-1">{totalSiswa}</span>
            <span className="text-[10px] font-bold text-brand-500 mt-1 block">Aktif Terdaftar</span>
          </div>
          <div className="w-14 h-14 rounded-2xl bg-brand-50 text-brand-600 flex items-center justify-center font-bold">
            <Users className="w-7 h-7" />
          </div>
        </div>

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

      {/* CHARTS & RANKINGS */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* LEFT: Big Chart with Selector */}
        <div className="lg:col-span-8 space-y-6">
          {/* Main Chart Card */}
          <div className="bg-white p-5 rounded-3xl border border-brand-100/60 shadow-md shadow-brand-900/5 flex flex-col h-[380px]">
            {/* Chart Selector Tabs */}
            <div className="flex items-center gap-2 mb-4 flex-shrink-0 border-b border-brand-50 pb-3">
              {chartTabs.map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveChartTab(tab.key)}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all cursor-pointer border ${
                    activeChartTab === tab.key
                      ? "bg-brand-600 border-brand-600 text-white shadow-md shadow-brand-500/20"
                      : "bg-slate-50 text-slate-500 border-transparent hover:bg-slate-100"
                  }`}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Chart Title */}
            <h3 className="text-sm font-black text-brand-950 flex items-center gap-1.5 mb-3 flex-shrink-0">
              <BarChart2 className="w-4.5 h-4.5 text-brand-600" />
              {activeChart.label}
            </h3>

            {/* Chart Area */}
            <div className="flex-1 min-h-0 w-full">
              {activeChart.data.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={activeChart.data as any[]} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis 
                      dataKey="name" 
                      stroke="#64748b" 
                      fontSize={10} 
                      fontWeight="bold" 
                      tickLine={false}
                      interval={0}
                      angle={-15}
                      textAnchor="end"
                      height={40}
                    />
                    <YAxis stroke="#64748b" fontSize={9} fontWeight="bold" tickLine={false} />
                    <Tooltip 
                      contentStyle={{ fontSize: 11, borderRadius: 12, fontWeight: "bold", border: "1px solid #e2e8f0" }}
                      cursor={{ fill: "rgba(109, 40, 217, 0.04)" }}
                    />
                    <Bar dataKey={activeChart.dataKey} fill={activeChart.color} radius={[6, 6, 0, 0]} barSize={32} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-brand-400 font-bold">
                  Belum ada data untuk kategori ini.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT: Tabbed Rankings */}
        <div className="lg:col-span-4 bg-white p-5 rounded-3xl border border-brand-100/60 shadow-md shadow-brand-900/5 flex flex-col h-[380px] min-h-[380px]">
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

          <div className="flex-1 overflow-y-auto mt-3 space-y-2 scrollbar-thin pr-0.5 max-h-[310px]">
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
                      <h4 className="font-extrabold text-xs text-brand-950 truncate leading-none">{toSentenceCase(siswa.nama)}</h4>
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
                        <h4 className="font-extrabold text-xs text-brand-950 truncate leading-none">{toSentenceCase(item.siswa.nama)}</h4>
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
