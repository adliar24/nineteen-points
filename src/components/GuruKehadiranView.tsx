import React, { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion, AnimatePresence } from "motion/react";
import { Clock, Check, Calendar, AlertCircle, RefreshCw, FileText, LogIn, X, Users, BookOpen } from "lucide-react";
import { UserSession } from "../types";
import { getTodayKehadiranGuru, checkInGuru, getKehadiranGuruHistory, getJadwalGuruList } from "../dbStore";
import { formatSubjectName } from "../formatName";

interface GuruKehadiranViewProps {
  userSession: UserSession;
}

export default function GuruKehadiranView({ userSession }: GuruKehadiranViewProps) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Form State for Active Check-In
  const [activeJadwal, setActiveJadwal] = useState<any | null>(null);
  const [status, setStatus] = useState<'hadir' | 'sakit' | 'izin'>('hadir');
  const [keterangan, setKeterangan] = useState("");

  // Determine Day Name
  const days = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
  const todayDayName = days[new Date().getDay()];

  // 1. Fetch Today's Attendance Records
  const { data: todayAttendance = [], isLoading: loadingToday, refetch: refetchToday } = useQuery({
    queryKey: ["todayKehadiranGuru", userSession.id, todayStr],
    queryFn: () => getTodayKehadiranGuru(userSession.id, todayStr),
  });

  // 2. Fetch All Teacher's Schedules
  const { data: schedules = [], isLoading: loadingSchedules } = useQuery({
    queryKey: ["jadwalGuruMe", userSession.id],
    queryFn: () => getJadwalGuruList(userSession.id),
  });

  // Helper to check if a schedule is currently active
  const isScheduleActive = (hari: string, jamMulai: string, jamSelesai: string) => {
    const days = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
    const today = days[new Date().getDay()];
    if (hari !== today) return false;

    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    const [startH, startM] = jamMulai.split(":").map(Number);
    const [endH, endM] = jamSelesai.split(":").map(Number);
    
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  };

  // Helper to merge consecutive slots (same day, class, mapel, gap <= 35m)
  const mergeSchedules = (list: any[]) => {
    if (list.length === 0) return [];
    
    const dayOrder = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"];
    const sorted = [...list].sort((a, b) => {
      const dayDiff = dayOrder.indexOf(a.hari) - dayOrder.indexOf(b.hari);
      if (dayDiff !== 0) return dayDiff;
      return a.jam_mulai.localeCompare(b.jam_mulai);
    });

    const merged: any[] = [];
    let current = {
      ...sorted[0],
      ids: [sorted[0].id]
    };

    for (let i = 1; i < sorted.length; i++) {
      const next = sorted[i];
      
      const [currH, currM] = current.jam_selesai.split(":").map(Number);
      const [nextH, nextM] = next.jam_mulai.split(":").map(Number);
      const gapMinutes = (nextH * 60 + nextM) - (currH * 60 + currM);

      const isSameGroup = 
        current.hari === next.hari &&
        current.kelas === next.kelas &&
        current.mata_pelajaran === next.mata_pelajaran;

      if (isSameGroup && gapMinutes >= 0 && gapMinutes <= 35) {
        current = {
          ...current,
          jam_selesai: next.jam_selesai,
          ids: [...current.ids, next.id]
        };
      } else {
        merged.push(current);
        current = {
          ...next,
          ids: [next.id]
        };
      }
    }
    merged.push(current);
    return merged;
  };

  // Filter schedules for today's day of week and merge them
  const todaySchedules = mergeSchedules(schedules.filter(s => s.hari === todayDayName));

  // 3. Fetch Attendance History
  const { data: history = [], isLoading: loadingHistory, refetch: refetchHistory } = useQuery({
    queryKey: ["kehadiranGuruHistory", userSession.id],
    queryFn: () => getKehadiranGuruHistory(userSession.id),
  });

  // 4. Mutation check-in
  const checkInMutation = useMutation({
    mutationFn: async () => {
      if (!activeJadwal) return;
      const now = new Date();
      const timeStr = now.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
      
      // Perform check-in for all slot IDs in the merged block!
      const promises = activeJadwal.ids.map((id: string) => 
        checkInGuru(userSession.id, todayStr, timeStr, status, keterangan, id)
      );
      return Promise.all(promises);
    },
    onSuccess: () => {
      setSuccessMsg(`Berhasil mencatat absensi mengajar.`);
      refetchToday();
      refetchHistory();
      setActiveJadwal(null);
      setStatus("hadir");
      setKeterangan("");
      setTimeout(() => setSuccessMsg(null), 5000);
    },
    onError: (err: any) => {
      setErrorMsg("Gagal mencatat absensi: " + err.message);
      setTimeout(() => setErrorMsg(null), 5000);
    }
  });

  const isLoading = loadingToday || loadingHistory || loadingSchedules;

  return (
    <div className="space-y-6 pb-12 animate-fade-in font-sans">
      {/* Header */}
      <div>
        <h2 className="text-xl font-extrabold text-brand-950 tracking-tight">
          Absensi Mengajar (KBM)
        </h2>
        <p className="text-xs text-brand-500 font-semibold mt-1">
          Lakukan pencatatan absensi kehadiran mengajar untuk setiap jadwal kelas Anda hari ini.
        </p>
      </div>

      {/* SUCCESS / ERROR ALERTS */}
      <AnimatePresence>
        {successMsg && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="p-4 bg-emerald-50 border border-emerald-100 text-emerald-800 rounded-2xl text-xs font-bold flex items-center gap-3 shadow-md"
          >
            <div className="w-6 h-6 rounded-lg bg-emerald-500 text-white flex items-center justify-center flex-shrink-0">
              <Check className="w-3.5 h-3.5" />
            </div>
            <span>{successMsg}</span>
          </motion.div>
        )}

        {errorMsg && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="p-4 bg-rose-50 border border-rose-100 text-rose-800 rounded-2xl text-xs font-bold flex items-center gap-3 shadow-md"
          >
            <div className="w-6 h-6 rounded-lg bg-rose-500 text-white flex items-center justify-center flex-shrink-0">
              <AlertCircle className="w-3.5 h-3.5" />
            </div>
            <span>{errorMsg}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT COLUMN: TODAY'S SCHEDULES & CHECK-IN SLOTS */}
        <div className="lg:col-span-6 space-y-6">
          <div className="bg-white p-6 rounded-3xl border border-brand-100 shadow-xl shadow-brand-900/5 space-y-6">
            <div className="flex justify-between items-center border-b pb-4 border-slate-50">
              <div className="flex flex-col">
                <span className="text-[10px] font-black text-brand-400 uppercase tracking-widest block">Hari Ini</span>
                <span className="text-xs font-black text-brand-900 bg-brand-50 border border-brand-100 px-3 py-1 rounded-xl mt-1">
                  {new Date().toLocaleDateString("id-ID", { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                </span>
              </div>
            </div>

            {isLoading ? (
              <div className="py-20 text-center">
                <RefreshCw className="w-8 h-8 animate-spin mx-auto text-brand-500" />
                <p className="text-xs font-bold text-brand-400 mt-2">Memuat jadwal mengajar hari ini...</p>
              </div>
            ) : todaySchedules.length === 0 ? (
              <div className="py-20 text-center space-y-3">
                <BookOpen className="w-12 h-12 text-brand-300 mx-auto" />
                <div>
                  <h4 className="text-sm font-black text-brand-950">Tidak Ada Jadwal Mengajar</h4>
                  <p className="text-xs text-brand-500 font-semibold mt-1">
                    Anda bebas tugas mengajar pada hari {todayDayName}.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-xs font-bold text-brand-500">Daftar jadwal kelas Anda hari ini:</p>
                {todaySchedules.map((sched) => {
                  const att = todayAttendance.find(a => sched.ids.includes(a.jadwal_id));
                  const isCheckedIn = !!att;
                  const active = isScheduleActive(sched.hari, sched.jam_mulai, sched.jam_selesai);

                  return (
                    <div
                      key={sched.id}
                      className={`p-5 rounded-2xl border transition-all flex items-center justify-between gap-4 relative overflow-hidden ${
                        isCheckedIn 
                          ? "bg-emerald-50/15 border-emerald-100/60 text-brand-900" 
                          : active
                          ? "bg-brand-800 text-white border-transparent shadow-xl shadow-brand-700/20 scale-[1.01]"
                          : "bg-brand-50 hover:bg-brand-100 border-brand-200 text-brand-900 shadow-md shadow-brand-900/3"
                      }`}
                    >
                      {/* Accent strip indicator */}
                      <div className={`absolute left-0 top-0 bottom-0 w-1 ${
                        isCheckedIn 
                          ? "bg-emerald-400" 
                          : active
                          ? "bg-amber-400"
                          : "bg-brand-400"
                      }`} />

                      <div className="space-y-1.5 pl-2">
                        <span className={`px-2 py-0.5 text-[10px] font-black rounded-lg uppercase tracking-wide inline-block ${
                          isCheckedIn
                            ? "bg-emerald-100 text-emerald-800"
                            : active
                            ? "bg-brand-700 text-white border border-brand-600"
                            : "bg-brand-100 text-brand-700"
                        }`}>
                          {sched.jam_mulai.slice(0, 5)} - {sched.jam_selesai.slice(0, 5)} {active && !isCheckedIn ? "• SEDANG BERLANGSUNG" : ""}
                        </span>
                        <h4 className={`font-extrabold text-sm ${active && !isCheckedIn ? "text-white" : "text-brand-950"}`}>
                          {formatSubjectName(sched.mata_pelajaran)}
                        </h4>
                        <div className={`flex items-center gap-1.5 text-xs font-bold ${
                          active && !isCheckedIn ? "text-brand-200" : "text-brand-500"
                        }`}>
                          <Users className="w-3.5 h-3.5" />
                          <span>Kelas {sched.kelas}</span>
                        </div>
                      </div>

                      {isCheckedIn ? (
                        <div className="text-right space-y-1 z-10">
                          <span className={`px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-wide inline-block ${
                            att.status === "hadir" 
                              ? "bg-emerald-150 text-emerald-800 border border-emerald-200" 
                              : att.status === "sakit" 
                              ? "bg-amber-100 text-amber-800" 
                              : "bg-purple-100 text-purple-800"
                          }`}>
                            {att.status === "hadir" ? "Hadir" : att.status === "sakit" ? "Sakit" : "Izin"}
                          </span>
                          <p className="text-[10px] text-brand-450 font-bold">{att.jam_masuk.slice(0, 5)} WIB</p>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            setActiveJadwal(sched);
                            setStatus("hadir");
                            setKeterangan("");
                          }}
                          className={`py-2 px-4 font-extrabold text-xs rounded-xl shadow-md cursor-pointer border-0 transition-all flex items-center gap-1.5 z-10 ${
                            active
                              ? "bg-amber-400 hover:bg-amber-500 text-brand-950 shadow-amber-550/10"
                              : "bg-brand-600 hover:bg-brand-750 text-white shadow-brand-500/10"
                          }`}
                        >
                          <LogIn className="w-3.5 h-3.5" />
                          Absen
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: ATTENDANCE HISTORY LIST */}
        <div className="lg:col-span-6">
          <div className="bg-white p-6 rounded-3xl border border-brand-100 shadow-xl shadow-brand-900/5 flex flex-col min-h-[400px]">
            <h3 className="text-sm font-black text-brand-950 uppercase tracking-widest flex items-center gap-2 border-b pb-4 border-slate-50 flex-shrink-0">
              <Calendar className="w-4.5 h-4.5 text-brand-600" />
              Riwayat Absensi Mengajar
            </h3>

            <div className="flex-1 overflow-y-auto mt-4 space-y-3 pr-1 scrollbar-thin">
              {loadingHistory ? (
                <div className="py-20 text-center">
                  <RefreshCw className="w-8 h-8 animate-spin mx-auto text-brand-500" />
                  <p className="text-xs font-bold text-brand-400 mt-2">Memuat riwayat...</p>
                </div>
              ) : history.length > 0 ? (
                history.map((record) => {
                  const isPresent = record.status === "hadir";
                  const scheduleInfo = record.jadwal_guru || {};
                  
                  return (
                    <div
                      key={record.id}
                      className="bg-brand-50/15 p-4 border border-brand-50 rounded-2xl flex items-center justify-between gap-4 shadow-xs"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 border ${
                            isPresent
                              ? "bg-emerald-50 text-emerald-600 border-emerald-100"
                              : "bg-purple-50 text-purple-600 border-purple-100"
                          }`}
                        >
                          <FileText className="w-4.5 h-4.5" />
                        </div>
                        <div className="space-y-0.5">
                          <span className="font-extrabold text-xs text-brand-950 block">
                            {new Date(record.tanggal).toLocaleDateString("id-ID", { day: 'numeric', month: 'short', year: 'numeric' })}
                          </span>
                          <span className="text-xs font-bold text-brand-800 block">
                            {formatSubjectName(scheduleInfo.mata_pelajaran || "Jadwal Dihapus")} ({scheduleInfo.kelas || "-"})
                          </span>
                          {record.keterangan && (
                            <span className="text-[10px] text-slate-400 italic block">
                              "{record.keterangan}"
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="text-right flex flex-col items-end gap-1 font-mono text-[10px] text-brand-800 font-bold">
                        <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wide inline-block ${
                          isPresent 
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-100" 
                            : record.status === "sakit" 
                            ? "bg-amber-50 text-amber-700 border border-amber-100" 
                            : "bg-purple-50 text-purple-700 border border-purple-100"
                        }`}>
                          {record.status.toUpperCase()}
                        </span>
                        <p>{record.jam_masuk.slice(0, 5)} WIB</p>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="py-24 text-center text-brand-400 font-bold text-xs">
                  Belum ada catatan riwayat absensi.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* CHECK-IN ACTIVE DIALOG MODAL */}
      <AnimatePresence>
        {activeJadwal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-brand-950/60 backdrop-blur-xs">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden border border-brand-150"
            >
              <div className="px-6 py-5 bg-brand-50 border-b border-brand-100 flex items-center justify-between">
                <div>
                  <h3 className="font-black text-brand-950 text-base">Absen Mengajar</h3>
                  <p className="text-[11px] font-bold text-brand-500 mt-0.5">
                    Kelas {activeJadwal.kelas} | {formatSubjectName(activeJadwal.mata_pelajaran)}
                  </p>
                </div>
                <button
                  onClick={() => setActiveJadwal(null)}
                  className="p-1.5 rounded-xl hover:bg-brand-200/50 text-brand-400 hover:text-brand-800 transition-all cursor-pointer bg-transparent border-0"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-5">
                {/* Select Status */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-brand-700 uppercase tracking-widest block">Status Kehadiran</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['hadir', 'sakit', 'izin'] as const).map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setStatus(s)}
                        className={`py-3 rounded-2xl border text-xs font-black text-center cursor-pointer transition-all ${
                          status === s
                            ? "bg-brand-600 text-white border-transparent shadow-md"
                            : "bg-[#faf9ff] border-brand-100 text-brand-700 hover:bg-slate-50"
                        }`}
                      >
                        {s === "hadir" ? "Hadir" : s === "sakit" ? "Sakit" : "Izin"}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Description Textarea */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-brand-700 uppercase tracking-widest block">
                    Keterangan {status === "hadir" ? "(Opsional)" : ""}
                  </label>
                  <textarea
                    rows={3}
                    placeholder={status === "hadir" ? "Catatan materi/lainnya (opsional)..." : "Tulis alasan sakit/izin..."}
                    value={keterangan}
                    onChange={(e) => setKeterangan(e.target.value)}
                    required={status !== "hadir"}
                    className="w-full border border-brand-100 rounded-2xl p-3 text-xs font-semibold text-brand-900 focus:ring-2 focus:ring-brand-500 outline-none bg-[#faf9ff]"
                  />
                </div>
              </div>

              <div className="px-6 py-4 bg-brand-50/50 border-t border-brand-100 flex items-center justify-end gap-3">
                <button
                  onClick={() => setActiveJadwal(null)}
                  className="px-4 py-2.5 rounded-2xl hover:bg-brand-200/40 text-brand-600 hover:text-brand-900 font-bold text-sm transition-all cursor-pointer bg-transparent border-0"
                >
                  Batal
                </button>
                <button
                  onClick={() => checkInMutation.mutate()}
                  disabled={checkInMutation.isPending}
                  className="px-5 py-2.5 rounded-2xl bg-gradient-to-r from-brand-600 to-brand-700 hover:from-brand-700 hover:to-brand-800 text-white font-bold text-sm shadow-md transition-all cursor-pointer border-0"
                >
                  {checkInMutation.isPending ? "Mencatat..." : "Simpan Absen"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
