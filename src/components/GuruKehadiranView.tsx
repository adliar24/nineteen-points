import React, { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion, AnimatePresence } from "motion/react";
import { Clock, LogIn, LogOut, Check, Calendar, AlertCircle, RefreshCw, FileText } from "lucide-react";
import { UserSession } from "../types";
import { getTodayKehadiranGuru, checkInGuru, checkOutGuru, getKehadiranGuruHistory } from "../dbStore";
import { queryClient } from "../queryClient";

interface GuruKehadiranViewProps {
  userSession: UserSession;
}

export default function GuruKehadiranView({ userSession }: GuruKehadiranViewProps) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const [status, setStatus] = useState<'hadir' | 'sakit' | 'izin'>('hadir');
  const [keterangan, setKeterangan] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // 1. Query today's attendance status
  const { data: todayAttendance, isLoading: loadingToday, refetch: refetchToday } = useQuery({
    queryKey: ["todayKehadiranGuru", userSession.id, todayStr],
    queryFn: () => getTodayKehadiranGuru(userSession.id, todayStr),
  });

  // 2. Query attendance history
  const { data: history = [], isLoading: loadingHistory, refetch: refetchHistory } = useQuery({
    queryKey: ["kehadiranGuruHistory", userSession.id],
    queryFn: () => getKehadiranGuruHistory(userSession.id),
  });

  // 3. Mutation check-in
  const checkInMutation = useMutation({
    mutationFn: async () => {
      const now = new Date();
      const timeStr = now.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
      return checkInGuru(userSession.id, todayStr, timeStr, status, keterangan);
    },
    onSuccess: (data) => {
      setSuccessMsg(`Berhasil melakukan Absen Masuk pada pukul ${data.jam_masuk}.`);
      refetchToday();
      refetchHistory();
      setKeterangan("");
      setTimeout(() => setSuccessMsg(null), 5000);
    },
    onError: (err: any) => {
      setErrorMsg("Gagal absen masuk: " + err.message);
      setTimeout(() => setErrorMsg(null), 5000);
    }
  });

  // 4. Mutation check-out
  const checkOutMutation = useMutation({
    mutationFn: async () => {
      const now = new Date();
      const timeStr = now.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
      return checkOutGuru(userSession.id, todayStr, timeStr);
    },
    onSuccess: (data) => {
      setSuccessMsg(`Berhasil melakukan Absen Pulang pada pukul ${data.jam_keluar}. Terima kasih atas dedikasi Anda hari ini.`);
      refetchToday();
      refetchHistory();
      setTimeout(() => setSuccessMsg(null), 5000);
    },
    onError: (err: any) => {
      setErrorMsg("Gagal absen pulang: " + err.message);
      setTimeout(() => setErrorMsg(null), 5000);
    }
  });

  const isLoading = loadingToday || loadingHistory;

  return (
    <div className="space-y-6 pb-12 animate-fade-in font-sans">
      {/* Header */}
      <div>
        <h2 className="text-xl font-extrabold text-brand-950 tracking-tight flex items-center gap-2">
          <Clock className="w-6 h-6 text-brand-600" />
          Kehadiran Saya (Guru)
        </h2>
        <p className="text-xs text-brand-500 font-semibold mt-1">
          Catat absensi masuk & pulang harian Anda secara mandiri di sini.
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
        {/* LEFT COLUMN: ATTENDANCE ACTION CARD */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white p-6 rounded-3xl border border-brand-100 shadow-xl shadow-brand-900/5 space-y-6">
            <div className="flex justify-between items-center border-b pb-4 border-slate-50">
              <span className="text-[10px] font-black text-brand-400 uppercase tracking-widest block">Hari Ini</span>
              <span className="text-xs font-black text-brand-900 bg-brand-50 border border-brand-100 px-3 py-1 rounded-xl">
                {new Date().toLocaleDateString("id-ID", { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </span>
            </div>

            {isLoading ? (
              <div className="py-12 text-center">
                <RefreshCw className="w-8 h-8 animate-spin mx-auto text-brand-500" />
                <p className="text-xs font-bold text-brand-400 mt-2">Memuat status kehadiran...</p>
              </div>
            ) : !todayAttendance ? (
              /* CHECK IN FORM */
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  checkInMutation.mutate();
                }}
                className="space-y-5"
              >
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-brand-400 uppercase tracking-widest block">
                    Pilih Status
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['hadir', 'sakit', 'izin'] as const).map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setStatus(s)}
                        className={`py-3 rounded-2xl border text-xs font-black text-center cursor-pointer transition-all ${
                          status === s
                            ? "bg-brand-600 text-white border-transparent shadow-md"
                            : "bg-white border-brand-100 text-brand-700 hover:bg-slate-50"
                        }`}
                      >
                        {s === "hadir" ? "Hadir" : s === "sakit" ? "Sakit" : "Izin"}
                      </button>
                    ))}
                  </div>
                </div>

                {status !== "hadir" && (
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-brand-400 uppercase tracking-widest block">
                      Keterangan
                    </label>
                    <textarea
                      required
                      rows={3}
                      placeholder="Tulis alasan sakit/izin..."
                      value={keterangan}
                      onChange={(e) => setKeterangan(e.target.value)}
                      className="w-full border border-brand-100 rounded-2xl p-3 text-xs font-semibold text-brand-900 focus:ring-2 focus:ring-brand-500 outline-none bg-brand-50/10"
                    />
                  </div>
                )}

                <motion.button
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  type="submit"
                  disabled={checkInMutation.isPending}
                  className="w-full py-4 brand-gradient disabled:opacity-50 text-white text-xs font-black uppercase tracking-wider rounded-2xl cursor-pointer shadow-lg shadow-brand-500/25 flex items-center justify-center gap-2"
                >
                  {checkInMutation.isPending ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <LogIn className="w-4.5 h-4.5" />
                      Absen Masuk
                    </>
                  )}
                </motion.button>
              </form>
            ) : (
              /* CHECK OUT OR COMPLETED STATUS */
              <div className="space-y-6">
                <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-brand-100 rounded-2xl bg-brand-50/10 text-center space-y-4">
                  <div className="w-16 h-16 rounded-3xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
                    <Check className="w-8 h-8" />
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-brand-950">
                      {todayAttendance.status === "hadir"
                        ? "Anda Sudah Absen Masuk"
                        : `Anda Tercatat: ${todayAttendance.status.toUpperCase()}`}
                    </h4>
                    <p className="text-[10.5px] text-brand-500 font-semibold mt-1">
                      Jam Masuk: <strong className="text-brand-900 font-bold">{todayAttendance.jam_masuk || "-"}</strong>
                    </p>
                    {todayAttendance.jam_keluar && (
                      <p className="text-[10.5px] text-brand-500 font-semibold mt-0.5">
                        Jam Pulang: <strong className="text-brand-900 font-bold">{todayAttendance.jam_keluar}</strong>
                      </p>
                    )}
                    {todayAttendance.keterangan && (
                      <p className="text-[10px] text-slate-400 italic mt-2">
                        "{todayAttendance.keterangan}"
                      </p>
                    )}
                  </div>
                </div>

                {todayAttendance.status === "hadir" && !todayAttendance.jam_keluar && (
                  <motion.button
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={() => checkOutMutation.mutate()}
                    disabled={checkOutMutation.isPending}
                    className="w-full py-4 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs font-black uppercase tracking-wider rounded-2xl cursor-pointer shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2"
                  >
                    {checkOutMutation.isPending ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <LogOut className="w-4.5 h-4.5" />
                        Absen Pulang (Keluar)
                      </>
                    )}
                  </motion.button>
                )}

                {todayAttendance.jam_keluar && (
                  <div className="p-4 bg-emerald-50/50 border border-emerald-100 rounded-2xl text-center text-[10.5px] font-bold text-emerald-800">
                    Aktivitas mengajar hari ini telah selesai dicatat. Sampai jumpa besok!
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: HISTORY LIST */}
        <div className="lg:col-span-7">
          <div className="bg-white p-6 rounded-3xl border border-brand-100 shadow-xl shadow-brand-900/5 flex flex-col min-h-[400px]">
            <h3 className="text-sm font-black text-brand-950 uppercase tracking-widest flex items-center gap-2 border-b pb-4 border-slate-50 flex-shrink-0">
              <Calendar className="w-4.5 h-4.5 text-brand-600" />
              Riwayat Absensi Saya
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
                        <div>
                          <span className="font-extrabold text-xs text-brand-950 block">
                            Tanggal: {new Date(record.tanggal).toLocaleDateString("id-ID", { day: 'numeric', month: 'short', year: 'numeric' })}
                          </span>
                          <span className="text-[10px] text-slate-400 font-semibold block mt-0.5">
                            Status: <strong className={isPresent ? "text-emerald-600" : "text-purple-600"}>{record.status.toUpperCase()}</strong>
                          </span>
                        </div>
                      </div>

                      <div className="text-right font-mono text-[10px] text-brand-800 font-bold space-y-0.5">
                        <p>Masuk: {record.jam_masuk || "-"}</p>
                        <p>Pulang: {record.jam_keluar || "-"}</p>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="py-24 text-center text-brand-400 font-bold text-xs">
                  Belum ada catatan riwayat absensi guru.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
