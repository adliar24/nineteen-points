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
      name: item.name.length > 25 ? item.name.slice(0, 25) + "..." : item.name,
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
    <div className="flex flex-col gap-3 lg:h-[calc(100vh-170px)] lg:overflow-hidden font-sans">
      
      {/* 1. TOP ROW: Header & Compact Metrics (Optimized height to prevent clipping) */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-brand-100/60 shadow-sm flex-shrink-0">
        <div>
          <h2 className="text-base lg:text-lg font-black text-brand-950 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-brand-600" />
            Statistik Karakter Siswa
          </h2>
          <p className="text-[11px] text-brand-500 font-bold mt-0.5">
            Ringkasan poin prestasi & kedisiplinan SMAN 19 Bandung.
          </p>
        </div>

        {/* Compact Metrics Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 lg:w-auto">
          {/* Total Siswa */}
          <div className="bg-brand-50/40 px-2.5 py-1 rounded-xl border border-brand-100/50 flex items-center gap-2">
            <Users className="w-3.5 h-3.5 text-brand-600 flex-shrink-0" />
            <div>
              <p className="text-[9px] font-black text-brand-400 uppercase tracking-wide">Total Siswa</p>
              <h4 className="text-xs lg:text-sm font-black text-brand-950 leading-none mt-0.5">{totalSiswa}</h4>
            </div>
          </div>
          {/* Apresiasi */}
          <div className="bg-emerald-50/40 px-2.5 py-1 rounded-xl border border-emerald-100/50 flex items-center gap-2">
            <Award className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
            <div>
              <p className="text-[9px] font-black text-brand-400 uppercase tracking-wide">Apresiasi (+)</p>
              <h4 className="text-xs lg:text-sm font-black text-emerald-600 leading-none mt-0.5">+{totalPoinPositif}</h4>
            </div>
          </div>
          {/* Sanksi */}
          <div className="bg-rose-50/40 px-2.5 py-1 rounded-xl border border-rose-100/50 flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-600 flex-shrink-0" />
            <div>
              <p className="text-[9px] font-black text-brand-400 uppercase tracking-wide">Sanksi (-)</p>
              <h4 className="text-xs lg:text-sm font-black text-rose-600 leading-none mt-0.5">-{totalPoinNegatif}</h4>
            </div>
          </div>
          {/* Log Entri */}
          <div className="bg-amber-50/40 px-2.5 py-1 rounded-xl border border-amber-100/50 flex items-center gap-2">
            <Calendar className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
            <div>
              <p className="text-[9px] font-black text-brand-400 uppercase tracking-wide">Riwayat Log</p>
              <h4 className="text-xs lg:text-sm font-black text-brand-950 leading-none mt-0.5">{totalLogs}</h4>
            </div>
          </div>
        </div>
      </div>

      {/* 2. MIDDLE ROW: Charts & Popular Rules (Responsive Height & Width) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 flex-1 min-h-0">
        
        {/* Left: Bar Chart (Rata-rata Poin Kelas) */}
        <div className="lg:col-span-6 bg-white p-3.5 rounded-2xl border border-brand-100/60 shadow-sm flex flex-col justify-between h-[250px] lg:h-full min-h-0">
          <div className="flex items-center justify-between">
            <h3 className="text-xs lg:text-sm font-extrabold text-brand-950 flex items-center gap-1.5">
              <BarChart2 className="w-4 h-4 text-brand-600" />
              Rata-rata Poin Kelas
            </h3>
            <span className="text-[8px] font-bold text-brand-50 bg-brand-50 px-1.5 py-0.5 rounded-md">Grafik Kelas</span>
          </div>
          <div className="flex-1 min-h-0 w-full mt-1.5">
            {classChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={classChartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f5f5f5" />
                  <XAxis dataKey="name" tick={{ fill: '#4b5563', fontSize: 9, fontWeight: 'bold' }} stroke="#e5e7eb" />
                  <YAxis tick={{ fill: '#4b5563', fontSize: 9 }} stroke="#e5e7eb" />
                  <Tooltip 
                    contentStyle={{ borderRadius: "0.75rem", border: "1px solid #eee", boxShadow: "0 2px 4px rgba(0,0,0,0.03)" }}
                    labelClassName="font-extrabold text-brand-950 text-[10px]"
                  />
                  <Legend wrapperStyle={{ fontSize: 9, fontWeight: 'semibold' }} />
                  <Bar dataKey="Rata-rata Poin" fill="#6b21a8" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Jumlah Siswa" fill="#c084fc" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-brand-400 font-medium">
                Belum ada data distribusi kelas.
              </div>
            )}
          </div>
        </div>

        {/* Middle: Pie Chart (Rasio Poin) */}
        <div className="lg:col-span-3 bg-white p-3.5 rounded-2xl border border-brand-100/60 shadow-sm flex flex-col justify-between h-[250px] lg:h-full min-h-0">
          <h3 className="text-xs lg:text-sm font-extrabold text-brand-950 flex items-center gap-1.5">
            <PieIcon className="w-4 h-4 text-brand-600" />
            Rasio Poin
          </h3>
          <div className="flex-1 min-h-0 w-full relative flex items-center justify-center py-1">
            {logTypeDistribution.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={logTypeDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={30}
                    outerRadius={50}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {logTypeDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: "0.75rem" }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-xs text-brand-400 font-medium">
                Belum ada data pencatatan.
              </div>
            )}
          </div>
          <div className="space-y-1 pt-1.5 border-t border-brand-50">
            {logTypeDistribution.map((item, index) => (
              <div key={index} className="flex items-center justify-between text-[10px]">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }}></span>
                  <span className="font-bold text-brand-800">{item.name}</span>
                </div>
                <span className="font-mono font-black text-brand-950">{item.value} log</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Popular Rules (Kasus Terpopuler) */}
        <div className="lg:col-span-3 bg-white p-3.5 rounded-2xl border border-brand-100/60 shadow-sm flex flex-col justify-between h-[250px] lg:h-full min-h-0">
          <h3 className="text-xs lg:text-sm font-extrabold text-brand-950 flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-brand-600" />
            Kasus Terpopuler
          </h3>
          <div className="flex-1 overflow-y-auto mt-2 space-y-1.5 pr-0.5 custom-scrollbar text-[11px]">
            {popularRulesData.length > 0 ? (
              popularRulesData.map((item, index) => (
                <div key={index} className="p-2 rounded-xl border border-brand-50 bg-brand-50/10 flex items-center justify-between gap-2 shadow-2xs">
                  <div className="min-w-0 flex-1">
                    <p className="font-extrabold text-brand-950 truncate" title={item.fullName}>
                      {item.fullName}
                    </p>
                    <p className={`text-[8px] font-black uppercase mt-0.5 ${item.Tipe === "Penghargaan" ? "text-emerald-600" : "text-rose-600"}`}>
                      {item.Tipe}
                    </p>
                  </div>
                  <span className="font-mono font-black text-brand-900 bg-brand-50 px-1.5 py-0.5 rounded-md border border-brand-100/50 flex-shrink-0 text-[10px]">
                    {item.Frekuensi}x
                  </span>
                </div>
              ))
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-brand-400 font-bold">
                Belum ada data.
              </div>
            )}
          </div>
        </div>

      </div>

      {/* 3. BOTTOM ROW: Rankings (Siswa Berprestasi vs Sanksi Terbanyak) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 flex-1 min-h-0">
        
        {/* Top Achievements */}
        <div className="bg-white p-3.5 rounded-2xl border border-brand-100/60 shadow-sm flex flex-col justify-between h-[250px] lg:h-full min-h-0">
          <div className="flex items-center justify-between">
            <h3 className="text-xs lg:text-sm font-black text-brand-950 flex items-center gap-1.5">
              <Award className="w-4 h-4 text-emerald-600" />
              Siswa Berprestasi (Top 5)
            </h3>
            <span className="text-[8px] font-black bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded-md border border-emerald-200">
              PRESTASI
            </span>
          </div>

          <div className="flex-1 overflow-y-auto mt-2 space-y-1.5 pr-0.5 custom-scrollbar text-[11px]">
            {topAchievers.map((siswa, idx) => (
              <div key={siswa.id} className="flex items-center justify-between p-2 bg-brand-50/20 hover:bg-brand-50/40 rounded-xl border border-brand-100/30 transition-all">
                <div className="flex items-center gap-2">
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center font-black text-[10px] ${
                    idx === 0 ? "bg-amber-100 text-amber-700 border border-amber-300" :
                    idx === 1 ? "bg-slate-100 text-slate-700 border border-slate-300" :
                    idx === 2 ? "bg-orange-100 text-orange-700 border border-orange-300" :
                    "bg-brand-50 text-brand-600"
                  }`}>
                    {idx + 1}
                  </span>
                  <div>
                    <h4 className="font-extrabold text-brand-950 leading-tight">{siswa.nama}</h4>
                    <p className="text-[8px] text-brand-400 font-semibold uppercase">{siswa.kelas} &bull; NIS {siswa.nis}</p>
                  </div>
                </div>
                <span className="font-mono font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-100 shadow-2xs text-[10px]">
                  {siswa.total_poin} pts
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Top Violations */}
        <div className="bg-white p-3.5 rounded-2xl border border-brand-100/60 shadow-sm flex flex-col justify-between h-[250px] lg:h-full min-h-0">
          <div className="flex items-center justify-between">
            <h3 className="text-xs lg:text-sm font-black text-brand-950 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-rose-600" />
              Sanksi Terbanyak (Top 5)
            </h3>
            <span className="text-[8px] font-black bg-rose-50 text-rose-700 px-1.5 py-0.5 rounded-md border border-rose-200">
              PELANGGARAN
            </span>
          </div>

          <div className="flex-1 overflow-y-auto mt-2 space-y-1.5 pr-0.5 custom-scrollbar text-[11px]">
            {topViolators.length > 0 ? (
              topViolators.map((item, idx) => (
                <div key={item.siswa.id} className="flex items-center justify-between p-2 bg-brand-50/20 hover:bg-brand-50/40 rounded-xl border border-brand-100/30 transition-all">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full flex items-center justify-center font-black text-[10px] bg-rose-50 text-rose-700 border border-rose-100">
                      {idx + 1}
                    </span>
                    <div>
                      <h4 className="font-extrabold text-brand-950 leading-tight">{item.siswa.nama}</h4>
                      <p className="text-[8px] text-brand-400 font-semibold uppercase">{item.siswa.kelas} &bull; NIS {item.siswa.nis}</p>
                    </div>
                  </div>
                  <span className="font-mono font-black text-rose-600 bg-rose-50 px-2 py-0.5 rounded-lg border border-rose-100 shadow-2xs text-[10px]">
                    {item.sum} pts
                  </span>
                </div>
              ))
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-brand-400 font-bold">
                Bersih! Belum ada catatan sanksi aktif.
              </div>
            )}
          </div>
        </div>

      </div>

    </div>
  );
}
