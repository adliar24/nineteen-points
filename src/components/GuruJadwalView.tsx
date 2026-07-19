import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "motion/react";
import { Calendar, Clock, BookOpen, Users, RefreshCw } from "lucide-react";
import { getJadwalGuruList } from "../dbStore";
import { UserSession } from "../types";
import { formatSubjectName } from "../formatName";

interface GuruJadwalViewProps {
  userSession: UserSession;
}

export default function GuruJadwalView({ userSession }: GuruJadwalViewProps) {
  const [selectedDay, setSelectedDay] = useState("Senin");

  // Fetch teaching schedules for the logged in teacher
  const { data: schedules = [], isLoading, refetch } = useQuery({
    queryKey: ["jadwalGuruMe", userSession.id],
    queryFn: () => getJadwalGuruList(userSession.id),
  });

  const listHari = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

  // Helper to merge consecutive slots (same day, class, mapel, gap <= 35m)
  const mergeSchedules = (list: any[]) => {
    if (list.length === 0) return [];
    
    // Sort by day, class, subject, and start time
    const sorted = [...list].sort((a, b) => {
      if (a.hari !== b.hari) return a.hari.localeCompare(b.hari);
      if (a.kelas !== b.kelas) return a.kelas.localeCompare(b.kelas);
      if (a.mata_pelajaran !== b.mata_pelajaran) return a.mata_pelajaran.localeCompare(b.mata_pelajaran);
      return a.jam_mulai.localeCompare(b.jam_mulai);
    });

    const merged: any[] = [];
    let current = sorted[0];

    for (let i = 1; i < sorted.length; i++) {
      const next = sorted[i];
      
      const [currH, currM] = current.jam_selesai.split(":").map(Number);
      const [nextH, nextM] = next.jam_mulai.split(":").map(Number);
      const gapMinutes = (nextH * 60 + nextM) - (currH * 60 + currM);

      const isSameGroup = 
        current.hari === next.hari &&
        current.kelas === next.kelas &&
        current.mata_pelajaran === next.mata_pelajaran;

      // Allow gap <= 35 mins (to account for recess / ISTIRAHAT)
      if (isSameGroup && gapMinutes >= 0 && gapMinutes <= 35) {
        current = {
          ...current,
          jam_selesai: next.jam_selesai
        };
      } else {
        merged.push(current);
        current = next;
      }
    }
    merged.push(current);
    return merged;
  };

  const processedSchedules = mergeSchedules(schedules);

  // Filter schedules by selected day
  const filteredSchedules = processedSchedules.filter(row => row.hari === selectedDay);

  return (
    <div className="space-y-6">
      {/* Title Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-brand-950 tracking-tight">Jadwal Mengajar Anda</h2>
          <p className="text-xs text-brand-500 font-medium">Lihat dan pantau jadwal mengajar harian Anda di SMAN 19 Bandung.</p>
        </div>

        <button
          onClick={() => refetch()}
          className="p-3 text-brand-550 hover:text-brand-850 hover:bg-brand-50 rounded-2xl transition-all cursor-pointer border-0 bg-transparent flex items-center justify-center"
          title="Refresh"
        >
          <RefreshCw className="w-5 h-5 animate-hover-spin" />
        </button>
      </div>

      {/* Day Selector Navigation Tabs */}
      <div className="flex flex-wrap gap-2 p-1.5 bg-brand-50/70 border border-brand-100/50 rounded-2xl md:max-w-max">
        {listHari.map((day) => {
          const isActive = selectedDay === day;
          const count = processedSchedules.filter(row => row.hari === day).length;

          return (
            <button
              key={day}
              onClick={() => setSelectedDay(day)}
              className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer border-0 relative ${
                isActive
                  ? "bg-white text-brand-800 shadow-md shadow-brand-950/5 font-black border border-white"
                  : "text-brand-500 hover:text-brand-850 hover:bg-white/40"
              }`}
            >
              {day}
              {count > 0 && (
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black ${
                  isActive ? "bg-brand-600 text-white" : "bg-brand-200 text-brand-700"
                }`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Schedule Items List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {isLoading ? (
          <div className="col-span-full flex items-center justify-center py-20">
            <div className="w-8 h-8 border-3 border-brand-450 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filteredSchedules.length === 0 ? (
          <div className="col-span-full py-20 text-center space-y-4 bg-white rounded-3xl border border-brand-100/50 shadow-xl shadow-brand-900/5">
            <BookOpen className="w-12 h-12 text-brand-350 mx-auto" />
            <div className="space-y-1">
              <p className="text-sm font-black text-brand-900">Tidak Ada Jadwal Mengajar</p>
              <p className="text-xs text-brand-500 font-medium">Anda bebas tugas / tidak ada jadwal mengajar untuk hari {selectedDay}.</p>
            </div>
          </div>
        ) : (
          filteredSchedules.map((row, index) => (
            <motion.div
              key={`${row.id}-${index}`}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className="bg-white p-6 rounded-3xl border border-brand-100/60 shadow-xl shadow-brand-900/5 hover:shadow-brand-900/10 hover:border-brand-200/60 transition-all flex flex-col justify-between space-y-4 group relative overflow-hidden"
            >
              {/* Dynamic Accent Strip */}
              <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-brand-500 rounded-l-3xl" />
              
              <div className="space-y-3 pl-2">
                <div className="flex items-center gap-2 text-brand-450">
                  <Clock className="w-4 h-4 text-brand-400" />
                  <span className="text-[11px] font-black tracking-wider uppercase">JAM PELAJARAN</span>
                </div>
                <h3 className="text-lg font-black text-brand-950 leading-snug tracking-tight">
                  {formatSubjectName(row.mata_pelajaran)}
                </h3>
              </div>

              <div className="flex items-center gap-6 pl-2 border-t border-brand-50 pt-4">
                <div className="flex items-center gap-2 text-sm font-bold text-brand-700">
                  <Users className="w-4.5 h-4.5 text-brand-400" />
                  <div>
                    <p className="text-[10px] text-brand-400 font-black tracking-wide uppercase leading-none">KELAS</p>
                    <p className="mt-0.5">{row.kelas}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-sm font-bold text-brand-700">
                  <Clock className="w-4.5 h-4.5 text-brand-400" />
                  <div>
                    <p className="text-[10px] text-brand-400 font-black tracking-wide uppercase leading-none">WAKTU</p>
                    <p className="mt-0.5">{row.jam_mulai.slice(0, 5)} - {row.jam_selesai.slice(0, 5)} WIB</p>
                  </div>
                </div>
              </div>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}
