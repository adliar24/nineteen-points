import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "../queryClient";
import {
  Search,
  AlertCircle,
  Check,
  Zap,
  X,
  User,
  ScanFace,
  QrCode,
  Clock,
  RefreshCw,
  Trash2,
  Filter,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Users,
  SlidersHorizontal,
  Lock,
  ShieldCheck,
  ToggleLeft,
  ToggleRight,
  Info,
} from "lucide-react";
import { Siswa, UserSession } from "../types";
import {
  getSiswaListLight,
  getAturanKehadiranList,
  getKehadiranListByDate,
  getPiketConfig,
  savePiketConfig,
  saveKehadiran,
  deleteKehadiran,
  updateCachedSiswaPoin,
  AturanKehadiran,
  KehadiranRow,
} from "../dbStore";
import { toSentenceCase, compareClasses } from "../formatName";
import { formatLocalDate } from "../parseDateSafe";
import FaceScanner from "./face/FaceScanner";
import QrScanner, { QrScanFeedback } from "./scan/QrScanner";
import InputModeTabs, { InputMode, ScanType } from "./scan/InputModeTabs";

interface InputKehadiranViewProps {
  userSession: UserSession;
}

export type PresetKehadiranStatus = "tepat_waktu" | "telat_15" | "izin" | "sakit" | "alfa";

export default function InputKehadiranView({ userSession }: InputKehadiranViewProps) {
  const isAdmin = userSession.role === "super_admin" || userSession.role === "kepala_sekolah";
  const todayStr = useMemo(() => formatLocalDate(new Date()), []);

  // ── 1. GLOBAL PIKET CONFIG (SUPER ADMIN CONTROL) ──
  const { data: remotePiketConfig, refetch: refetchPiketConfig } = useQuery({
    queryKey: ["piketConfig"],
    queryFn: getPiketConfig,
    staleTime: 1000 * 30, // 30s cache
  });

  // Local state for configuration (synced with Supabase remotePiketConfig)
  const [useCutoff, setUseCutoff] = useState<boolean>(() => {
    return localStorage.getItem("19points_piket_use_cutoff") !== "false";
  });

  const [cutoffTime, setCutoffTime] = useState<string>(() => {
    return localStorage.getItem("19points_piket_cutoff_time") || "06:30";
  });

  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [configSaveSuccess, setConfigSaveSuccess] = useState(false);

  // Sync state when remote config updates
  useEffect(() => {
    if (remotePiketConfig) {
      setUseCutoff(remotePiketConfig.useCutoff);
      setCutoffTime(remotePiketConfig.cutoffTime || "06:30");
    }
  }, [remotePiketConfig]);

  // Handle Admin Saving Configuration
  const handleSaveAdminConfig = async (newUseCutoff: boolean, newCutoffTime: string) => {
    if (!isAdmin) return;
    setIsSavingConfig(true);
    try {
      await savePiketConfig(newUseCutoff, newCutoffTime);
      setUseCutoff(newUseCutoff);
      setCutoffTime(newCutoffTime);
      queryClient.invalidateQueries({ queryKey: ["piketConfig"] });
      setConfigSaveSuccess(true);
      setTimeout(() => setConfigSaveSuccess(false), 3000);
    } catch (err: any) {
      setErrorMsg("Gagal menyimpan konfigurasi batas waktu: " + err.message);
      setTimeout(() => setErrorMsg(null), 4000);
    } finally {
      setIsSavingConfig(false);
    }
  };

  // ── 2. PRESET STATUS SELECTION (WHEN CUTOFF IS OFF OR MANUAL OVERRIDE) ──
  const [selectedPreset, setSelectedPreset] = useState<PresetKehadiranStatus>(() => {
    return (localStorage.getItem("19points_piket_selected_preset") as PresetKehadiranStatus) || "tepat_waktu";
  });

  const handleSelectPreset = (status: PresetKehadiranStatus) => {
    setSelectedPreset(status);
    localStorage.setItem("19points_piket_selected_preset", status);
  };

  // ── 3. REALTIME CLOCK ──
  const [currentTimeStr, setCurrentTimeStr] = useState<string>(() => {
    const d = new Date();
    return d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  });

  useEffect(() => {
    const timer = setInterval(() => {
      const d = new Date();
      setCurrentTimeStr(d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Time check helper relative to cutoffTime
  const checkIsLate = useCallback(
    (dateObj: Date = new Date(), cutoff: string = cutoffTime) => {
      const [cutoffH, cutoffM] = cutoff.split(":").map(Number);
      const cutoffMinutes = (isNaN(cutoffH) ? 6 : cutoffH) * 60 + (isNaN(cutoffM) ? 30 : cutoffM);
      const currentMinutes = dateObj.getHours() * 60 + dateObj.getMinutes();
      return currentMinutes > cutoffMinutes;
    },
    [cutoffTime]
  );

  const isCurrentTimeLate = useMemo(() => checkIsLate(), [checkIsLate, currentTimeStr]);

  // ── 4. NOTIFICATIONS & MODAL STATES ──
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Big tabs: "Scan" (QR / Wajah) and "Input Manual"
  const [mode, setMode] = useState<InputMode>("scan");
  const [scanType, setScanType] = useState<ScanType>("qr");

  // Fullscreen scanner states
  const [showQrScanner, setShowQrScanner] = useState(false);
  const [showFaceScanner, setShowFaceScanner] = useState(false);

  // ── 5. CORE QUERIES ──
  const { data: siswaList = [] } = useQuery({
    queryKey: ["siswa"],
    queryFn: getSiswaListLight,
  });

  const { data: aturanList = [] } = useQuery({
    queryKey: ["aturanKehadiran"],
    queryFn: getAturanKehadiranList,
  });

  // Today's attendance recap query
  const {
    data: todayAttendance = [],
    refetch: refetchToday,
    isLoading: loadingToday,
  } = useQuery({
    queryKey: ["kehadiranToday", todayStr],
    queryFn: () => getKehadiranListByDate(todayStr),
  });

  // Aturan points map with explicit required defaults (+10 Hadir, -15 Terlambat, -50 Alfa, 0 Izin/Sakit)
  const aturanMap = useMemo(() => {
    const map: Record<string, AturanKehadiran> = {};
    aturanList.forEach((rule) => {
      map[rule.status] = rule;
    });
    return map;
  }, [aturanList]);

  // Explicit user-specified point rules
  const POINT_VALUES: Record<PresetKehadiranStatus, number> = useMemo(() => {
    return {
      tepat_waktu: aturanMap["tepat_waktu"]?.nilai_poin ?? 10,
      telat_15: aturanMap["telat_15"]?.nilai_poin ?? -15,
      alfa: aturanMap["alfa"]?.nilai_poin ?? -50,
      izin: aturanMap["izin"]?.nilai_poin ?? 0,
      sakit: aturanMap["sakit"]?.nilai_poin ?? 0,
    };
  }, [aturanMap]);

  // In-memory lookup map of siswa_id -> KehadiranRow for instant O(1) duplicate detection
  const recordedTodayMap = useRef<Map<string, KehadiranRow>>(new Map());
  useEffect(() => {
    const map = new Map<string, KehadiranRow>();
    todayAttendance.forEach((row) => {
      map.set(row.siswa_id, row);
    });
    recordedTodayMap.current = map;
  }, [todayAttendance]);

  // Last scanned student feedback banner
  const [lastScanned, setLastScanned] = useState<{
    nama: string;
    kelas: string;
    status: string;
    points: number;
    type: "success" | "duplicate" | "not_found";
    time: string;
  } | null>(null);

  // Active check-in target for manual modal
  const [activeSiswa, setActiveSiswa] = useState<Siswa | null>(null);
  const [siswaCategory, setSiswaCategory] = useState<"tepat_waktu" | "terlambat" | "izin_sakit" | "alfa">("tepat_waktu");
  const [siswaStatus, setSiswaStatus] = useState<string>("tepat_waktu");
  const [siswaPoints, setSiswaPoints] = useState(10);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Search filter query inputs for manual mode
  const [searchSiswaQuery, setSearchSiswaQuery] = useState("");
  const [manualSelectedClass, setManualSelectedClass] = useState("Semua");

  // Filter and search inside today's live recap table
  const [recapQuery, setRecapQuery] = useState("");
  const [recapFilterClass, setRecapFilterClass] = useState("Semua");
  const [recapFilterStatus, setRecapFilterStatus] = useState<"semua" | "tepat_waktu" | "terlambat" | "khusus">("semua");

  // Audio beep feedback (optimized for instant audio context on mobile)
  const playAudio = useCallback((type: "success" | "late" | "duplicate" | "neutral" | "error") => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === "success") {
        // High pleasant double-tone
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1174, ctx.currentTime + 0.12); // A5 -> D6
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.18);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.18);
      } else if (type === "late") {
        // Descending warning tone
        osc.frequency.setValueAtTime(659, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.15); // E5 -> A4
        gain.gain.setValueAtTime(0.18, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.22);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.22);
      } else if (type === "neutral") {
        // Soft click/chime for izin/sakit
        osc.frequency.setValueAtTime(523, ctx.currentTime);
        gain.gain.setValueAtTime(0.12, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.15);
      } else {
        // Low buzz for duplicate/error/alfa
        osc.frequency.setValueAtTime(320, ctx.currentTime);
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.18);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.18);
      }
    } catch {
      // Audio context restricted or unsupported, fail silently
    }
  }, []);

  // Helper label for status
  const getStatusLabel = (status: string) => {
    if (status === "tepat_waktu") return "Hadir (Tepat Waktu)";
    if (status.startsWith("telat")) return "Terlambat";
    if (status === "alfa") return "Alfa";
    if (status === "izin") return "Izin";
    if (status === "sakit") return "Sakit";
    return status;
  };

  // ── 6. PROCESS ATTENDANCE (CORE FUNCTION) ──
  const processAttendance = async (
    student: Siswa,
    forcedStatus?: string,
    forcedPoints?: number
  ): Promise<QrScanFeedback> => {
    // 1. Instant in-memory duplicate check (< 1ms)
    const existing = recordedTodayMap.current.get(student.id);
    if (existing && !forcedStatus) {
      playAudio("duplicate");
      const statusLabel = getStatusLabel(existing.status);

      setLastScanned({
        nama: student.nama,
        kelas: student.kelas,
        status: existing.status,
        points: existing.nilai_poin_diberikan,
        type: "duplicate",
        time: new Date(existing.created_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }),
      });

      return {
        type: "duplicate",
        title: "SUDAH TERCATAT",
        message: `${toSentenceCase(student.nama)} (${student.kelas}) sudah absen: ${statusLabel}`,
        kelas: student.kelas,
        fotoUrl: student.foto_url || undefined,
      };
    }

    // 2. Determine status and points:
    // If forcedStatus provided -> use it
    // If useCutoff is true -> auto calculate based on scan time vs cutoffTime
    // If useCutoff is false -> use selectedPreset
    const now = new Date();
    let status: string;
    let points: number;
    let feedbackTitle: string;

    if (forcedStatus) {
      status = forcedStatus;
      points = forcedPoints !== undefined ? forcedPoints : POINT_VALUES[forcedStatus as PresetKehadiranStatus] ?? 0;
      feedbackTitle = getStatusLabel(status).toUpperCase();
    } else if (useCutoff) {
      const isLate = checkIsLate(now);
      status = isLate ? "telat_15" : "tepat_waktu";
      points = isLate ? POINT_VALUES.telat_15 : POINT_VALUES.tepat_waktu;
      feedbackTitle = isLate ? "TERLAMBAT" : "HADIR TEPAT WAKTU";
    } else {
      status = selectedPreset;
      points = POINT_VALUES[selectedPreset];
      feedbackTitle = getStatusLabel(selectedPreset).toUpperCase();
    }

    try {
      // 3. Save to Supabase (upsert on siswa_id, tanggal)
      await saveKehadiran(student.id, status, points, userSession.email, todayStr);

      // 4. Play audio feedback
      if (status === "tepat_waktu") playAudio("success");
      else if (status.startsWith("telat")) playAudio("late");
      else if (status === "izin" || status === "sakit") playAudio("neutral");
      else playAudio("error");

      // 5. Construct local record
      const newRow: KehadiranRow = {
        id: existing?.id || `local-${student.id}-${Date.now()}`,
        siswa_id: student.id,
        siswa_nis: student.nis,
        siswa_nama: student.nama,
        siswa_kelas: student.kelas,
        siswa_foto_url: student.foto_url || null,
        tanggal: todayStr,
        status: status,
        nilai_poin_diberikan: points,
        pencatat_email: userSession.email,
        created_at: now.toISOString(),
      };

      // 6. Optimistic in-memory map & query cache update (< 5ms)
      recordedTodayMap.current.set(student.id, newRow);
      queryClient.setQueryData<KehadiranRow[]>(["kehadiranToday", todayStr], (old = []) => {
        const filtered = old.filter((item) => item.siswa_id !== student.id);
        return [newRow, ...filtered];
      });

      // 7. Update student total point cache & invalidate background queries
      updateCachedSiswaPoin(student.id, points);
      queryClient.invalidateQueries({ queryKey: ["kehadiran"] });

      // 8. Trigger visual banner
      setLastScanned({
        nama: student.nama,
        kelas: student.kelas,
        status: status,
        points: points,
        type: "success",
        time: now.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }),
      });

      return {
        type: "success",
        title: feedbackTitle,
        message: `${toSentenceCase(student.nama)} (${student.kelas}) • ${points >= 0 ? "+" : ""}${points} Poin`,
        kelas: student.kelas,
        fotoUrl: student.foto_url || undefined,
      };
    } catch (err: any) {
      playAudio("error");
      setErrorMsg("Gagal menyimpan absensi: " + err.message);
      setTimeout(() => setErrorMsg(null), 4000);
      throw err;
    }
  };

  // Continuous QR Scan Handler
  const handleQrScan = async (decodedText: string): Promise<QrScanFeedback> => {
    const trimmed = decodedText.trim();
    const student = siswaList.find((s) => s.nis === trimmed || s.id === trimmed);
    if (!student) {
      playAudio("error");
      return {
        type: "not_found",
        title: "TIDAK DIKENALI",
        message: `QR: "${trimmed}"`,
      };
    }
    return await processAttendance(student);
  };

  // Continuous Face Match Handler
  const handleFaceMatch = async (student: Siswa) => {
    try {
      await processAttendance(student);
    } catch {
      // Handled inside processAttendance
    }
  };

  // Delete attendance record today (Undo scan)
  const handleDeleteTodayAttendance = async (row: KehadiranRow) => {
    const confirmDelete = window.confirm(
      `Apakah Anda yakin ingin menghapus absensi ${toSentenceCase(row.siswa_nama)} (${row.siswa_kelas})? Poin ${
        row.nilai_poin_diberikan > 0 ? "+" : ""
      }${row.nilai_poin_diberikan} akan dikembalikan.`
    );
    if (!confirmDelete) return;

    try {
      await deleteKehadiran(row.id);
      updateCachedSiswaPoin(row.siswa_id, -row.nilai_poin_diberikan);
      recordedTodayMap.current.delete(row.siswa_id);
      queryClient.setQueryData<KehadiranRow[]>(["kehadiranToday", todayStr], (old = []) =>
        old.filter((item) => item.id !== row.id)
      );
      queryClient.invalidateQueries({ queryKey: ["kehadiran"] });
      setSuccessMsg(`Absensi ${toSentenceCase(row.siswa_nama)} berhasil dihapus.`);
      setTimeout(() => setSuccessMsg(null), 3500);
    } catch (err: any) {
      setErrorMsg("Gagal menghapus absensi: " + err.message);
      setTimeout(() => setErrorMsg(null), 4000);
    }
  };

  // Manual modal activation for custom status
  const activateManualCustom = (student: Siswa) => {
    setActiveSiswa(student);
    if (useCutoff) {
      const isLate = checkIsLate();
      if (isLate) {
        setSiswaCategory("terlambat");
        setSiswaStatus("telat_15");
        setSiswaPoints(POINT_VALUES.telat_15);
      } else {
        setSiswaCategory("tepat_waktu");
        setSiswaStatus("tepat_waktu");
        setSiswaPoints(POINT_VALUES.tepat_waktu);
      }
    } else {
      if (selectedPreset === "tepat_waktu") {
        setSiswaCategory("tepat_waktu");
        setSiswaStatus("tepat_waktu");
        setSiswaPoints(POINT_VALUES.tepat_waktu);
      } else if (selectedPreset === "telat_15") {
        setSiswaCategory("terlambat");
        setSiswaStatus("telat_15");
        setSiswaPoints(POINT_VALUES.telat_15);
      } else if (selectedPreset === "alfa") {
        setSiswaCategory("alfa");
        setSiswaStatus("alfa");
        setSiswaPoints(POINT_VALUES.alfa);
      } else {
        setSiswaCategory("izin_sakit");
        setSiswaStatus(selectedPreset);
        setSiswaPoints(0);
      }
    }
  };

  // Save from Manual Form Modal
  const handleSaveManualAttendance = async () => {
    if (!activeSiswa) return;
    setIsSubmitting(true);
    try {
      await processAttendance(activeSiswa, siswaStatus, siswaPoints);
      setActiveSiswa(null);
      setSuccessMsg(`Berhasil mencatat kehadiran ${toSentenceCase(activeSiswa.nama)}.`);
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setErrorMsg("Gagal menyimpan kehadiran: " + err.message);
      setTimeout(() => setErrorMsg(null), 4000);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Unique classes for manual filter dropdown
  const classes = useMemo(() => {
    const rawClasses = Array.from(new Set(siswaList.map((s) => s.kelas).filter(Boolean)));
    return ["Semua", ...rawClasses.sort(compareClasses)];
  }, [siswaList]);

  // Filters manual dropdown lookup
  const filteredSiswaLookup = useMemo(() => {
    const list = siswaList.filter((s) => {
      const matchesSearch =
        !searchSiswaQuery.trim() ||
        s.nama.toLowerCase().includes(searchSiswaQuery.toLowerCase()) ||
        s.nis.includes(searchSiswaQuery);
      const matchesClass = manualSelectedClass === "Semua" || s.kelas === manualSelectedClass;
      return matchesSearch && matchesClass;
    });
    return list.slice(0, 100);
  }, [siswaList, searchSiswaQuery, manualSelectedClass]);

  // Statistics counters
  const stats = useMemo(() => {
    const total = todayAttendance.length;
    const tepatWaktu = todayAttendance.filter((r) => r.status === "tepat_waktu").length;
    const terlambat = todayAttendance.filter(
      (r) => r.status.startsWith("telat") || (r.status !== "tepat_waktu" && r.status !== "sakit" && r.status !== "izin" && r.status !== "alfa")
    ).length;
    const alfa = todayAttendance.filter((r) => r.status === "alfa").length;
    const izinSakit = todayAttendance.filter((r) => r.status === "izin" || r.status === "sakit").length;
    return { total, tepatWaktu, terlambat, alfa, izinSakit };
  }, [todayAttendance]);

  // Filtered list for today's live recap table
  const filteredTodayRecap = useMemo(() => {
    return todayAttendance.filter((row) => {
      const matchesQuery =
        !recapQuery.trim() ||
        row.siswa_nama.toLowerCase().includes(recapQuery.toLowerCase()) ||
        row.siswa_nis.includes(recapQuery);
      const matchesClass = recapFilterClass === "Semua" || row.siswa_kelas === recapFilterClass;
      let matchesStatus = true;
      if (recapFilterStatus === "tepat_waktu") {
        matchesStatus = row.status === "tepat_waktu";
      } else if (recapFilterStatus === "terlambat") {
        matchesStatus = row.status.startsWith("telat");
      } else if (recapFilterStatus === "khusus") {
        matchesStatus = ["sakit", "izin", "alfa"].includes(row.status);
      }
      return matchesQuery && matchesClass && matchesStatus;
    });
  }, [todayAttendance, recapQuery, recapFilterClass, recapFilterStatus]);

  // List of IDs scanned today for face recognition hint
  const scannedSiswaIds = useMemo(() => {
    return todayAttendance.map((r) => r.siswa_id);
  }, [todayAttendance]);

  // ── 7. IN-CAMERA HEADER CONTROLS (QUICK STATUS SWITCHER) ──
  const inCameraHeaderControls = useMemo(() => {
    if (useCutoff) {
      return (
        <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-black/60 backdrop-blur-md border border-white/20 text-xs">
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${!isCurrentTimeLate ? "bg-emerald-400" : "bg-amber-400"} animate-pulse`} />
            <span className="text-white/90 font-bold text-[11px]">
              Mode Auto Jam: &le; {cutoffTime} Hadir (+10) | &gt; {cutoffTime} Terlambat (-15)
            </span>
          </div>
          <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase ${!isCurrentTimeLate ? "bg-emerald-500 text-white" : "bg-amber-500 text-black"}`}>
            {!isCurrentTimeLate ? "Tepat Waktu" : "Terlambat"}
          </span>
        </div>
      );
    }

    // When useCutoff is false: Render quick touch preset pills in camera header!
    return (
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-extrabold text-white/75 uppercase tracking-wider">
            Target Status Scan (Sentuh untuk ganti):
          </span>
          <span className="text-[10px] font-mono text-emerald-300 font-bold">
            Poin: {POINT_VALUES[selectedPreset] >= 0 ? "+" : ""}{POINT_VALUES[selectedPreset]}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => handleSelectPreset("tepat_waktu")}
            className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer border ${
              selectedPreset === "tepat_waktu"
                ? "bg-emerald-600 text-white border-emerald-300 shadow-md shadow-emerald-950/60 scale-105"
                : "bg-black/60 text-white/70 border-white/20 hover:bg-black/80"
            }`}
          >
            🟢 Hadir (+10)
          </button>
          <button
            type="button"
            onClick={() => handleSelectPreset("telat_15")}
            className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer border ${
              selectedPreset === "telat_15"
                ? "bg-amber-500 text-black border-amber-200 shadow-md shadow-amber-950/60 scale-105"
                : "bg-black/60 text-white/70 border-white/20 hover:bg-black/80"
            }`}
          >
            🟡 Terlambat (-15)
          </button>
          <button
            type="button"
            onClick={() => handleSelectPreset("izin")}
            className={`px-2.5 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer border ${
              selectedPreset === "izin"
                ? "bg-blue-600 text-white border-blue-300 shadow-md shadow-blue-950/60 scale-105"
                : "bg-black/60 text-white/70 border-white/20 hover:bg-black/80"
            }`}
          >
            🔵 Izin (0)
          </button>
          <button
            type="button"
            onClick={() => handleSelectPreset("sakit")}
            className={`px-2.5 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer border ${
              selectedPreset === "sakit"
                ? "bg-purple-600 text-white border-purple-300 shadow-md shadow-purple-950/60 scale-105"
                : "bg-black/60 text-white/70 border-white/20 hover:bg-black/80"
            }`}
          >
            🟣 Sakit (0)
          </button>
          <button
            type="button"
            onClick={() => handleSelectPreset("alfa")}
            className={`px-2.5 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer border ${
              selectedPreset === "alfa"
                ? "bg-rose-600 text-white border-rose-300 shadow-md shadow-rose-950/60 scale-105"
                : "bg-black/60 text-white/70 border-white/20 hover:bg-black/80"
            }`}
          >
            🔴 Alfa (-50)
          </button>
        </div>
      </div>
    );
  }, [useCutoff, isCurrentTimeLate, cutoffTime, selectedPreset, POINT_VALUES]);

  return (
    <div className="space-y-6 pb-16 animate-fade-in font-sans">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-brand-950 tracking-tight flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-brand-50 border border-brand-200 flex items-center justify-center text-brand-600">
              <QrCode className="w-5 h-5" />
            </div>
            Scan Kehadiran Murid (Piket)
          </h2>
          <p className="text-xs text-brand-500 font-semibold mt-1">
            Pindai kartu pelajar atau wajah murid secara berkelanjutan dan cepat di semua perangkat.
          </p>
        </div>

        {/* Realtime clock badge */}
        <div className="flex items-center gap-2.5 px-4 py-2 bg-white rounded-2xl border border-brand-100 shadow-sm w-fit shrink-0">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          <div>
            <p className="text-[9px] font-black text-brand-400 uppercase tracking-wider">Jam Saat Ini</p>
            <p className="text-sm font-mono font-black text-brand-950">{currentTimeStr} WIB</p>
          </div>
        </div>
      </div>

      {/* ── CONTROL PANEL: ADMIN POLICY & PIKET STATUS PRESET ── */}
      <div className="bg-gradient-to-r from-brand-50/80 via-white to-brand-50/50 rounded-3xl border border-brand-150 p-5 shadow-sm space-y-4">
        {/* Row 1: Admin Toggle & Piket Information */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-brand-600 text-white flex items-center justify-center shadow-md flex-shrink-0">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-xs font-black text-brand-950 uppercase tracking-wider">
                  Pengaturan Batas Waktu Masuk
                </h4>
                {isAdmin ? (
                  <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 text-[9.5px] font-black uppercase">
                    Admin Kendali
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[9.5px] font-bold flex items-center gap-1">
                    <Lock className="w-3 h-3" />
                    Kebijakan Admin
                  </span>
                )}
              </div>
              <p className="text-[10.5px] text-brand-500 font-semibold mt-0.5">
                {useCutoff
                  ? `Batas waktu aktif: Hadir (+10) jika \u2264 ${cutoffTime} WIB, Terlambat (-15) jika > ${cutoffTime} WIB.`
                  : "Batas waktu dinonaktifkan: Murid yang discan otomatis tercatat sesuai preset status terpilih."}
              </p>
            </div>
          </div>

          {/* Admin Controls (Only Super Admin can change ON/OFF & cutoff time) */}
          {isAdmin ? (
            <div className="flex flex-wrap items-center gap-2.5 p-2 bg-white rounded-2xl border border-brand-150 shadow-inner">
              <button
                type="button"
                onClick={() => handleSaveAdminConfig(!useCutoff, cutoffTime)}
                disabled={isSavingConfig}
                className={`px-3.5 py-2 rounded-xl text-xs font-black flex items-center gap-2 transition-all cursor-pointer border ${
                  useCutoff
                    ? "bg-emerald-600 text-white border-transparent shadow-sm"
                    : "bg-slate-100 text-slate-700 border-slate-200"
                }`}
              >
                {useCutoff ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                <span>Batas Waktu: {useCutoff ? "AKTIF" : "NON-AKTIF"}</span>
              </button>

              {useCutoff && (
                <div className="flex items-center gap-1.5">
                  <input
                    type="time"
                    value={cutoffTime}
                    onChange={(e) => {
                      const newTime = e.target.value || "06:30";
                      setCutoffTime(newTime);
                      handleSaveAdminConfig(useCutoff, newTime);
                    }}
                    className="px-3 py-1.5 bg-[#faf9ff] border border-brand-200 focus:border-brand-600 rounded-xl text-xs font-black font-mono text-brand-950 outline-none cursor-pointer"
                  />
                  {cutoffTime !== "06:30" && (
                    <button
                      onClick={() => handleSaveAdminConfig(useCutoff, "06:30")}
                      title="Kembalikan ke default 06:30"
                      className="p-1.5 bg-brand-100 hover:bg-brand-200 text-brand-700 rounded-xl transition-all cursor-pointer border-0"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )}

              {configSaveSuccess && (
                <span className="text-[10px] font-black text-emerald-700 flex items-center gap-1 animate-fade-in">
                  <Check className="w-3 h-3" /> Tersimpan
                </span>
              )}
            </div>
          ) : (
            /* Read-only badge for Piket */
            <div className="flex items-center gap-2">
              <div
                className={`px-3.5 py-2 rounded-2xl border text-xs font-bold flex items-center gap-2 shadow-sm ${
                  useCutoff
                    ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                    : "bg-blue-50 border-blue-200 text-blue-800"
                }`}
              >
                <div
                  className={`w-2.5 h-2.5 rounded-full ${
                    useCutoff ? "bg-emerald-500 animate-pulse" : "bg-blue-500"
                  }`}
                />
                <span>
                  {useCutoff
                    ? `Batas Waktu: Aktif (${cutoffTime} WIB)`
                    : "Batas Waktu: Non-Aktif (Mode Preset Status)"}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Row 2: Preset Status Selector (Active when useCutoff is FALSE) */}
        {!useCutoff ? (
          <div className="p-4 bg-white rounded-2xl border border-brand-100 space-y-2.5 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <div>
                <p className="text-xs font-black text-brand-950 flex items-center gap-1.5">
                  <SlidersHorizontal className="w-4 h-4 text-brand-600" />
                  Pilih Preset Status Kehadiran untuk Scan:
                </p>
                <p className="text-[10.5px] text-brand-500 font-semibold">
                  Semua murid yang discan saat ini akan otomatis tercatat sesuai status yang Anda pilih di bawah.
                </p>
              </div>
              <span className="text-[11px] font-mono font-black text-brand-700 bg-brand-50 px-2.5 py-1 rounded-lg border border-brand-100 w-fit">
                Poin: {POINT_VALUES[selectedPreset] >= 0 ? "+" : ""}{POINT_VALUES[selectedPreset]} Poin
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-1">
              <button
                type="button"
                onClick={() => handleSelectPreset("tepat_waktu")}
                className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                  selectedPreset === "tepat_waktu"
                    ? "bg-emerald-600 text-white border-transparent shadow-md shadow-emerald-600/20 scale-[1.02]"
                    : "bg-[#faf9ff] border-brand-100 hover:bg-slate-50 text-slate-700"
                }`}
              >
                <p className="text-xs font-black flex items-center gap-1.5">
                  <span>🟢</span> Hadir
                </p>
                <p className={`text-[10.5px] font-extrabold mt-0.5 ${selectedPreset === "tepat_waktu" ? "text-emerald-100" : "text-emerald-700"}`}>
                  +{POINT_VALUES.tepat_waktu} Poin
                </p>
              </button>

              <button
                type="button"
                onClick={() => handleSelectPreset("telat_15")}
                className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                  selectedPreset === "telat_15"
                    ? "bg-amber-500 text-slate-950 border-transparent shadow-md shadow-amber-500/20 scale-[1.02]"
                    : "bg-[#faf9ff] border-brand-100 hover:bg-slate-50 text-slate-700"
                }`}
              >
                <p className="text-xs font-black flex items-center gap-1.5">
                  <span>🟡</span> Terlambat
                </p>
                <p className={`text-[10.5px] font-extrabold mt-0.5 ${selectedPreset === "telat_15" ? "text-slate-900" : "text-amber-700"}`}>
                  {POINT_VALUES.telat_15} Poin
                </p>
              </button>

              <button
                type="button"
                onClick={() => handleSelectPreset("izin")}
                className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                  selectedPreset === "izin"
                    ? "bg-blue-600 text-white border-transparent shadow-md shadow-blue-600/20 scale-[1.02]"
                    : "bg-[#faf9ff] border-brand-100 hover:bg-slate-50 text-slate-700"
                }`}
              >
                <p className="text-xs font-black flex items-center gap-1.5">
                  <span>🔵</span> Izin
                </p>
                <p className={`text-[10.5px] font-extrabold mt-0.5 ${selectedPreset === "izin" ? "text-blue-100" : "text-blue-700"}`}>
                  0 Poin
                </p>
              </button>

              <button
                type="button"
                onClick={() => handleSelectPreset("sakit")}
                className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                  selectedPreset === "sakit"
                    ? "bg-purple-600 text-white border-transparent shadow-md shadow-purple-600/20 scale-[1.02]"
                    : "bg-[#faf9ff] border-brand-100 hover:bg-slate-50 text-slate-700"
                }`}
              >
                <p className="text-xs font-black flex items-center gap-1.5">
                  <span>🟣</span> Sakit
                </p>
                <p className={`text-[10.5px] font-extrabold mt-0.5 ${selectedPreset === "sakit" ? "text-purple-100" : "text-purple-700"}`}>
                  0 Poin
                </p>
              </button>

              <button
                type="button"
                onClick={() => handleSelectPreset("alfa")}
                className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                  selectedPreset === "alfa"
                    ? "bg-rose-600 text-white border-transparent shadow-md shadow-rose-600/20 scale-[1.02]"
                    : "bg-[#faf9ff] border-brand-100 hover:bg-slate-50 text-slate-700"
                }`}
              >
                <p className="text-xs font-black flex items-center gap-1.5">
                  <span>🔴</span> Alfa
                </p>
                <p className={`text-[10.5px] font-extrabold mt-0.5 ${selectedPreset === "alfa" ? "text-rose-100" : "text-rose-700"}`}>
                  {POINT_VALUES.alfa} Poin
                </p>
              </button>
            </div>
          </div>
        ) : (
          /* Realtime Status Indicator when useCutoff is TRUE */
          <div className="flex flex-wrap items-center justify-between text-[11px] font-semibold text-brand-600 pt-2 border-t border-brand-100/80 gap-2">
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${!isCurrentTimeLate ? "bg-emerald-500" : "bg-amber-500"} animate-ping`} />
              <span>
                Status Scan Sekarang:{" "}
                <strong className={!isCurrentTimeLate ? "text-emerald-700 font-black" : "text-amber-700 font-black"}>
                  {!isCurrentTimeLate ? `HADIR TEPAT WAKTU (+${POINT_VALUES.tepat_waktu} Poin)` : `TERLAMBAT (${POINT_VALUES.telat_15} Poin)`}
                </strong>
              </span>
            </div>
            <div className="flex items-center gap-2 text-slate-500">
              <span>Batas Masuk: &le; {cutoffTime} WIB</span>
              <span>&bull;</span>
              <span className="text-brand-500 font-bold">Anti-duplikat Aktif</span>
            </div>
          </div>
        )}
      </div>

      {/* SUCCESS / ERROR ALERTS */}
      <AnimatePresence>
        {successMsg && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-xs font-bold flex items-center gap-3 shadow-md"
          >
            <div className="w-6 h-6 rounded-lg bg-emerald-500 text-white flex items-center justify-center flex-shrink-0">
              <Check className="w-3.5 h-3.5" />
            </div>
            <span>{successMsg}</span>
          </motion.div>
        )}

        {errorMsg && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl text-xs font-bold flex items-center gap-3 shadow-md"
          >
            <div className="w-6 h-6 rounded-lg bg-rose-500 text-white flex items-center justify-center flex-shrink-0">
              <AlertCircle className="w-3.5 h-3.5" />
            </div>
            <span>{errorMsg}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Live Statistics Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="p-3.5 bg-white rounded-2xl border border-brand-100 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[9.5px] font-black text-brand-400 uppercase tracking-wider">Total Hadir</p>
            <p className="text-lg font-mono font-black text-brand-950 mt-0.5">{stats.total}</p>
          </div>
          <div className="w-9 h-9 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center text-brand-600">
            <Users className="w-4.5 h-4.5" />
          </div>
        </div>

        <div className="p-3.5 bg-white rounded-2xl border border-emerald-100 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[9.5px] font-black text-emerald-600 uppercase tracking-wider">Tepat Waktu</p>
            <p className="text-lg font-mono font-black text-emerald-700 mt-0.5">{stats.tepatWaktu}</p>
          </div>
          <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
            <CheckCircle2 className="w-4.5 h-4.5" />
          </div>
        </div>

        <div className="p-3.5 bg-white rounded-2xl border border-amber-100 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[9.5px] font-black text-amber-600 uppercase tracking-wider">Terlambat</p>
            <p className="text-lg font-mono font-black text-amber-700 mt-0.5">{stats.terlambat}</p>
          </div>
          <div className="w-9 h-9 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600">
            <AlertTriangle className="w-4.5 h-4.5" />
          </div>
        </div>

        <div className="p-3.5 bg-white rounded-2xl border border-rose-100 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[9.5px] font-black text-rose-600 uppercase tracking-wider">Alfa</p>
            <p className="text-lg font-mono font-black text-rose-700 mt-0.5">{stats.alfa}</p>
          </div>
          <div className="w-9 h-9 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600">
            <X className="w-4.5 h-4.5" />
          </div>
        </div>

        <div className="p-3.5 bg-white rounded-2xl border border-blue-100 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[9.5px] font-black text-blue-600 uppercase tracking-wider">Izin / Sakit</p>
            <p className="text-lg font-mono font-black text-blue-700 mt-0.5">{stats.izinSakit}</p>
          </div>
          <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
            <SlidersHorizontal className="w-4.5 h-4.5" />
          </div>
        </div>
      </div>

      {/* Method Tabs */}
      {!activeSiswa && (
        <InputModeTabs
          mode={mode}
          scanType={scanType}
          onModeChange={setMode}
          onScanTypeChange={setScanType}
        />
      )}

      {/* 1. TAB SCAN QR */}
      {!activeSiswa && mode === "scan" && scanType === "qr" && (
        <div className="max-w-xl mx-auto bg-white p-6 md:p-8 rounded-3xl border border-brand-100 shadow-xl shadow-brand-900/5 space-y-6 text-center">
          <div className="space-y-1">
            <h4 className="font-extrabold text-base text-brand-950">Scanner QR Berkelanjutan</h4>
            <p className="text-xs text-brand-500 font-semibold">
              Kamera akan terus menyala untuk memindai kartu pelajar secara instan tanpa jeda konfirmasi.
            </p>
          </div>

          <div className="p-7 bg-[#faf9ff] rounded-3xl border border-brand-100 text-center space-y-4">
            <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto border border-emerald-200 shadow-inner">
              <QrCode className="w-8 h-8 animate-pulse" />
            </div>
            <div className="space-y-1 max-w-xs mx-auto">
              <p className="text-xs font-bold text-brand-800">
                Mode Aktif:{" "}
                <span className="text-emerald-700 font-black">
                  {useCutoff
                    ? `Auto Jam Masuk (${cutoffTime} WIB)`
                    : `Preset: ${getStatusLabel(selectedPreset)} (${POINT_VALUES[selectedPreset] >= 0 ? "+" : ""}${POINT_VALUES[selectedPreset]} Poin)`}
                </span>
              </p>
              <p className="text-[11px] text-brand-400 font-medium">
                Setiap scan langsung mencatat kehadiran dan memberi audio beep serta pop-up visual.
              </p>
            </div>
            <button
              onClick={() => setShowQrScanner(true)}
              className="px-7 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-2xl shadow-lg shadow-emerald-600/20 cursor-pointer border-0 transition-all flex items-center justify-center gap-2.5 mx-auto"
            >
              <QrCode className="w-4.5 h-4.5" />
              Buka Scanner QR (Full Screen)
            </button>
          </div>
        </div>
      )}

      {/* 2. TAB SCAN WAJAH */}
      {!activeSiswa && mode === "scan" && scanType === "face" && (
        <div className="max-w-xl mx-auto bg-white p-6 md:p-8 rounded-3xl border border-brand-100 shadow-xl shadow-brand-900/5 space-y-6 text-center">
          <div className="space-y-1">
            <h4 className="font-extrabold text-base text-brand-950">Scan Wajah AI Berkelanjutan</h4>
            <p className="text-xs text-brand-500 font-semibold">
              Posisikan wajah murid di depan kamera. Sistem AI akan mencocokkan wajah dan mencatat kehadiran secara beruntun.
            </p>
          </div>

          <div className="p-7 bg-[#faf9ff] rounded-3xl border border-brand-100 text-center space-y-4">
            <div className="w-16 h-16 bg-brand-50 text-brand-600 rounded-2xl flex items-center justify-center mx-auto border border-brand-200 shadow-inner">
              <ScanFace className="w-8 h-8 animate-pulse" />
            </div>
            <div className="space-y-1 max-w-xs mx-auto">
              <p className="text-xs font-bold text-brand-800">
                Mode Aktif:{" "}
                <span className="text-brand-700 font-black">
                  {useCutoff
                    ? `Auto Jam Masuk (${cutoffTime} WIB)`
                    : `Preset: ${getStatusLabel(selectedPreset)} (${POINT_VALUES[selectedPreset] >= 0 ? "+" : ""}${POINT_VALUES[selectedPreset]} Poin)`}
                </span>
              </p>
              <p className="text-[11px] text-brand-400 font-medium">
                Deteksi wajah otomatis dengan notifikasi instan dan pencegahan duplikat hari ini.
              </p>
            </div>
            <button
              onClick={() => setShowFaceScanner(true)}
              className="px-7 py-3 bg-brand-600 hover:bg-brand-700 text-white font-extrabold text-xs rounded-2xl shadow-lg shadow-brand-600/20 cursor-pointer border-0 transition-all flex items-center justify-center gap-2.5 mx-auto"
            >
              <ScanFace className="w-4.5 h-4.5" />
              Buka Scanner Wajah (Full Screen)
            </button>
          </div>
        </div>
      )}

      {/* 3. TAB MANUAL */}
      {!activeSiswa && mode === "manual" && (
        <div className="max-w-2xl mx-auto bg-white p-6 rounded-3xl border border-brand-100 shadow-xl shadow-brand-900/5 space-y-4">
          <div className="space-y-1">
            <h4 className="font-extrabold text-sm text-brand-950">Input Manual Murid</h4>
            <p className="text-xs text-brand-500 font-semibold">
              Cari nama atau NIS murid untuk mencatat kehadiran satu klik atau mengatur status khusus.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-3.5 text-brand-500/50 w-4.5 h-4.5" />
              <input
                type="text"
                placeholder="Cari nama atau NIS murid..."
                value={searchSiswaQuery}
                onChange={(e) => setSearchSiswaQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-[#faf9ff] rounded-2xl border border-brand-100 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-brand-500 text-brand-950 placeholder-brand-500/30"
              />
            </div>
            <select
              value={manualSelectedClass}
              onChange={(e) => setManualSelectedClass(e.target.value)}
              className="border border-brand-100 rounded-2xl py-3 px-4 text-xs font-bold text-brand-700 outline-none focus:ring-2 focus:ring-brand-500 bg-white cursor-pointer"
            >
              {classes.map((c) => (
                <option key={c} value={c}>
                  Kelas: {c}
                </option>
              ))}
            </select>
          </div>

          {filteredSiswaLookup.length > 0 && (
            <div className="divide-y border border-brand-100 rounded-2xl overflow-hidden bg-white max-h-72 overflow-y-auto">
              {filteredSiswaLookup.map((student) => {
                const isAlready = recordedTodayMap.current.has(student.id);
                const existingRow = recordedTodayMap.current.get(student.id);

                return (
                  <div
                    key={student.id}
                    className="p-3.5 hover:bg-brand-50/40 transition-colors flex items-center justify-between gap-3 text-left"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {student.foto_url ? (
                        <img
                          src={student.foto_url}
                          alt={student.nama}
                          className="w-9 h-9 rounded-xl object-cover border border-brand-100 flex-shrink-0"
                        />
                      ) : (
                        <div className="w-9 h-9 rounded-xl bg-brand-50 border border-brand-100 text-brand-600 flex items-center justify-center text-xs font-black flex-shrink-0">
                          {student.nama.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <span className="font-extrabold text-xs text-brand-950 block truncate">
                          {toSentenceCase(student.nama)}
                        </span>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-slate-400 font-bold">NIS {student.nis}</span>
                          <span className="text-[10px] font-black text-brand-600 bg-brand-50 border border-brand-100 px-2 py-0.2 rounded-md">
                            {student.kelas}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      {isAlready ? (
                        <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-xl">
                          Sudah Absen ({getStatusLabel(existingRow?.status || "")})
                        </span>
                      ) : (
                        <>
                          <button
                            onClick={() => processAttendance(student)}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[10.5px] rounded-xl shadow-sm transition-all cursor-pointer border-0 flex items-center gap-1"
                          >
                            <Check className="w-3 h-3" />
                            Catat Otomatis
                          </button>
                          <button
                            onClick={() => activateManualCustom(student)}
                            className="px-2.5 py-1.5 bg-brand-50 hover:bg-brand-100 text-brand-700 font-bold text-[10.5px] rounded-xl border border-brand-100 transition-all cursor-pointer"
                          >
                            Opsi Khusus
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
              {filteredSiswaLookup.length === 100 && (
                <div className="p-3 bg-amber-50/60 text-[10px] text-amber-800 font-bold border-t border-brand-100 text-center">
                  Menampilkan 100 murid pertama. Gunakan kolom pencarian atau filter kelas untuk hasil spesifik.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* LAST SCANNED FEEDBACK BANNER */}
      <AnimatePresence>
        {lastScanned && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className={`max-w-2xl mx-auto p-4 rounded-2xl border text-xs font-bold flex items-center justify-between gap-3 shadow-md ${
              lastScanned.type === "success"
                ? lastScanned.status === "tepat_waktu"
                  ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                  : lastScanned.status.startsWith("telat")
                  ? "bg-amber-50 border-amber-200 text-amber-900"
                  : "bg-blue-50 border-blue-200 text-blue-900"
                : lastScanned.type === "duplicate"
                ? "bg-amber-50 border-amber-200 text-amber-900"
                : "bg-rose-50 border-rose-200 text-rose-900"
            }`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0 text-white ${
                  lastScanned.type === "success"
                    ? lastScanned.status === "tepat_waktu"
                      ? "bg-emerald-500"
                      : lastScanned.status.startsWith("telat")
                      ? "bg-amber-500"
                      : "bg-blue-500"
                    : lastScanned.type === "duplicate"
                    ? "bg-amber-500"
                    : "bg-rose-500"
                }`}
              >
                {lastScanned.type === "success" ? (
                  <Check className="w-4 h-4" />
                ) : (
                  <AlertCircle className="w-4 h-4" />
                )}
              </div>
              <div>
                <p className="font-extrabold text-xs">
                  {toSentenceCase(lastScanned.nama)} ({lastScanned.kelas})
                </p>
                <p className="text-[10.5px] font-semibold opacity-85">
                  {lastScanned.type === "success" && (
                    <span>
                      Tercatat: <strong className="font-black">{getStatusLabel(lastScanned.status)}</strong> (
                      {lastScanned.points >= 0 ? "+" : ""}
                      {lastScanned.points} Poin) &bull; {lastScanned.time} WIB
                    </span>
                  )}
                  {lastScanned.type === "duplicate" && (
                    <span>Sudah tercatat absensi hari ini ({lastScanned.time} WIB)</span>
                  )}
                  {lastScanned.type === "not_found" && <span>Data murid tidak ditemukan</span>}
                </p>
              </div>
            </div>

            <button
              onClick={() => setLastScanned(null)}
              className="p-1 text-slate-400 hover:text-slate-700 bg-transparent border-0 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* LIVE REKAP TABLE: Kehadiran Hari Ini */}
      <div className="max-w-3xl mx-auto bg-white p-6 rounded-3xl border border-brand-100 shadow-xl shadow-brand-900/5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-brand-50 border border-brand-100 text-brand-600 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <h4 className="font-extrabold text-sm text-brand-950 flex items-center gap-2">
                Rekap Kehadiran Hari Ini ({todayAttendance.length} Murid)
              </h4>
              <p className="text-[10.5px] font-semibold text-brand-400">
                Daftar murid yang telah berhasil melakukan scan absensi hari ini.
              </p>
            </div>
          </div>

          <button
            onClick={() => refetchToday()}
            className="p-2 hover:bg-brand-50 text-brand-400 hover:text-brand-700 rounded-xl transition-all cursor-pointer border border-brand-100 flex items-center gap-1.5 text-xs font-bold w-fit"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Segarkan</span>
          </button>
        </div>

        {/* Filters for today's table */}
        <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 text-brand-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Filter nama/NIS rekap..."
              value={recapQuery}
              onChange={(e) => setRecapQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-[#faf9ff] rounded-xl border border-brand-100 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-brand-500 text-brand-950"
            />
          </div>

          <select
            value={recapFilterClass}
            onChange={(e) => setRecapFilterClass(e.target.value)}
            className="border border-brand-100 rounded-xl py-2 px-3 text-xs font-bold text-brand-700 bg-white outline-none cursor-pointer"
          >
            {classes.map((c) => (
              <option key={c} value={c}>
                Kelas: {c}
              </option>
            ))}
          </select>

          <select
            value={recapFilterStatus}
            onChange={(e) => setRecapFilterStatus(e.target.value as any)}
            className="border border-brand-100 rounded-xl py-2 px-3 text-xs font-bold text-brand-700 bg-white outline-none cursor-pointer"
          >
            <option value="semua">Semua Status</option>
            <option value="tepat_waktu">Tepat Waktu (+10)</option>
            <option value="terlambat">Terlambat (-15)</option>
            <option value="khusus">Sakit/Izin/Alfa</option>
          </select>
        </div>

        {loadingToday ? (
          <div className="py-12 text-center text-xs font-bold text-brand-400 animate-pulse">
            Memuat rekap absensi hari ini...
          </div>
        ) : todayAttendance.length === 0 ? (
          <div className="py-12 text-center space-y-3">
            <div className="w-12 h-12 bg-brand-50 text-brand-300 rounded-full flex items-center justify-center mx-auto">
              <Sparkles className="w-6 h-6" />
            </div>
            <p className="text-xs font-bold text-brand-400">Belum ada murid yang melakukan scan absensi hari ini.</p>
          </div>
        ) : filteredTodayRecap.length === 0 ? (
          <div className="py-8 text-center text-xs font-bold text-brand-400">
            Tidak ada murid yang sesuai filter pencarian.
          </div>
        ) : (
          <div className="divide-y border border-brand-100 rounded-2xl overflow-hidden max-h-[380px] overflow-y-auto">
            {filteredTodayRecap.map((row) => {
              const isTepat = row.status === "tepat_waktu";
              const isTelat = row.status.startsWith("telat");
              const isAlfa = row.status === "alfa";

              return (
                <div
                  key={row.id}
                  className="px-4 py-3 flex items-center justify-between hover:bg-brand-50/30 transition-colors gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {row.siswa_foto_url ? (
                      <img
                        src={row.siswa_foto_url}
                        alt={row.siswa_nama}
                        className="w-9 h-9 rounded-xl object-cover border border-brand-100 flex-shrink-0"
                      />
                    ) : (
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center text-white text-xs font-black flex-shrink-0 ${
                          isTepat
                            ? "bg-gradient-to-tr from-emerald-500 to-teal-400"
                            : isTelat
                            ? "bg-gradient-to-tr from-amber-500 to-orange-400"
                            : isAlfa
                            ? "bg-gradient-to-tr from-rose-500 to-red-600"
                            : "bg-gradient-to-tr from-blue-500 to-indigo-500"
                        }`}
                      >
                        {row.siswa_nama.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-brand-950 truncate">
                        {toSentenceCase(row.siswa_nama)}
                      </p>
                      <p className="text-[10px] text-brand-400 font-semibold">
                        {row.siswa_kelas} &bull; NIS {row.siswa_nis}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 flex-shrink-0">
                    {/* Status badge */}
                    <span
                      className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
                        isTepat
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : isTelat
                          ? "bg-amber-50 text-amber-800 border-amber-200"
                          : isAlfa
                          ? "bg-rose-50 text-rose-800 border-rose-200"
                          : "bg-blue-50 text-blue-700 border-blue-200"
                      }`}
                    >
                      {getStatusLabel(row.status)}
                    </span>

                    {/* Point badge */}
                    <span
                      className={`text-[10px] font-black px-2 py-0.5 rounded-lg font-mono ${
                        row.nilai_poin_diberikan > 0
                          ? "bg-emerald-100 text-emerald-800"
                          : row.nilai_poin_diberikan < 0
                          ? "bg-rose-100 text-rose-800"
                          : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {row.nilai_poin_diberikan > 0 ? `+${row.nilai_poin_diberikan}` : row.nilai_poin_diberikan}
                    </span>

                    {/* Scan Time */}
                    <span className="text-[10px] text-brand-400 font-mono hidden sm:inline-block">
                      {new Date(row.created_at).toLocaleTimeString("id-ID", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>

                    {/* Delete button (Undo scan) */}
                    <button
                      onClick={() => handleDeleteTodayAttendance(row)}
                      title="Batalkan / Hapus absensi ini"
                      className="p-1.5 hover:bg-rose-50 text-slate-300 hover:text-rose-600 rounded-lg transition-colors cursor-pointer border-0 bg-transparent"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 4. ACTIVE FORM SISWA POPUP MODAL (MANUAL CUSTOM) */}
      {activeSiswa && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/75">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden border border-brand-150"
          >
            <div className="px-6 py-5 bg-brand-50 border-b border-brand-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-brand-100 rounded-xl flex items-center justify-center text-brand-600">
                  <User className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-brand-950 text-sm">Absensi Siswa (Manual)</h3>
                  <p className="text-[10.5px] font-semibold text-brand-500 mt-0.5">
                    {toSentenceCase(activeSiswa.nama)} ({activeSiswa.kelas})
                  </p>
                </div>
              </div>
              <button
                onClick={() => setActiveSiswa(null)}
                className="p-1.5 rounded-xl hover:bg-brand-200/50 text-brand-400 hover:text-brand-800 transition-all cursor-pointer bg-transparent border-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Category Tab selectors */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-brand-700 uppercase tracking-widest block">
                  Kategori Absen
                </label>
                <div className="grid grid-cols-4 gap-1.5">
                  {(["tepat_waktu", "terlambat", "izin_sakit", "alfa"] as const).map((cat) => {
                    const active = siswaCategory === cat;
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => {
                          setSiswaCategory(cat);
                          if (cat === "tepat_waktu") {
                            setSiswaStatus("tepat_waktu");
                            setSiswaPoints(POINT_VALUES.tepat_waktu);
                          } else if (cat === "alfa") {
                            setSiswaStatus("alfa");
                            setSiswaPoints(POINT_VALUES.alfa);
                          } else if (cat === "terlambat") {
                            setSiswaStatus("telat_15");
                            setSiswaPoints(POINT_VALUES.telat_15);
                          } else {
                            setSiswaStatus("sakit");
                            setSiswaPoints(0);
                          }
                        }}
                        className={`py-2 px-1 rounded-xl border text-[10px] font-black text-center cursor-pointer transition-all uppercase tracking-wider ${
                          active
                            ? "bg-brand-600 text-white border-transparent"
                            : "bg-[#faf9ff] border-brand-100 text-brand-700 hover:bg-slate-50"
                        }`}
                      >
                        {cat.replace("_", " ")}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Status Selectors */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-brand-700 uppercase tracking-widest block">
                  Status Detail
                </label>
                {siswaCategory === "terlambat" && (
                  <select
                    value={siswaStatus}
                    onChange={(e) => {
                      setSiswaStatus(e.target.value);
                      setSiswaPoints(POINT_VALUES.telat_15);
                    }}
                    className="w-full border border-brand-100 rounded-xl p-3 text-xs font-bold text-brand-800 bg-[#faf9ff] outline-none cursor-pointer"
                  >
                    <option value="telat_15">
                      Terlambat ({POINT_VALUES.telat_15} Poin)
                    </option>
                  </select>
                )}

                {siswaCategory === "izin_sakit" && (
                  <select
                    value={siswaStatus}
                    onChange={(e) => {
                      setSiswaStatus(e.target.value);
                      setSiswaPoints(0);
                    }}
                    className="w-full border border-brand-100 rounded-xl p-3 text-xs font-bold text-brand-800 bg-[#faf9ff] outline-none cursor-pointer"
                  >
                    <option value="sakit">Sakit (0 Poin)</option>
                    <option value="izin">Izin (0 Poin)</option>
                  </select>
                )}

                {siswaCategory === "tepat_waktu" && (
                  <input
                    type="text"
                    value="Hadir Tepat Waktu (+10 Poin)"
                    disabled
                    className="w-full border border-brand-100 rounded-xl p-3 text-xs font-bold text-slate-400 bg-brand-50/50 outline-none"
                  />
                )}

                {siswaCategory === "alfa" && (
                  <input
                    type="text"
                    value={`Alfa (${POINT_VALUES.alfa} Poin)`}
                    disabled
                    className="w-full border border-brand-100 rounded-xl p-3 text-xs font-bold text-slate-400 bg-brand-50/50 outline-none"
                  />
                )}
              </div>

              {/* Point Feedback Value Display */}
              <div className="bg-brand-50/50 border border-brand-100 rounded-2xl p-4 flex items-center justify-between">
                <span className="text-[10px] font-black text-brand-700 uppercase tracking-widest flex items-center gap-1.5">
                  <Zap className="w-4 h-4 text-brand-500" />
                  Konsekuensi Poin:
                </span>
                <span
                  className={`font-mono text-base font-black ${
                    siswaPoints > 0
                      ? "text-emerald-700"
                      : siswaPoints < 0
                      ? "text-rose-700"
                      : "text-slate-700"
                  }`}
                >
                  {siswaPoints > 0 ? `+${siswaPoints}` : siswaPoints} Poin
                </span>
              </div>
            </div>

            <div className="px-6 py-4 bg-brand-50/50 border-t border-brand-100 flex items-center justify-end gap-3">
              <button
                onClick={() => setActiveSiswa(null)}
                className="px-4 py-2.5 rounded-2xl hover:bg-brand-200/40 text-brand-600 hover:text-brand-900 font-bold text-sm transition-all cursor-pointer bg-transparent border-0"
              >
                Batal
              </button>
              <button
                onClick={handleSaveManualAttendance}
                disabled={isSubmitting}
                className="px-5 py-2.5 rounded-2xl bg-gradient-to-r from-brand-600 to-brand-700 hover:from-brand-700 hover:to-brand-800 text-white font-bold text-sm shadow-md transition-all cursor-pointer border-0"
              >
                {isSubmitting ? "Menyimpan..." : "Simpan Absen"}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* CONTINUOUS QR SCANNER MODAL WITH IN-CAMERA HEADER CONTROLS */}
      {showQrScanner && (
        <QrScanner
          title="Scan QR Kehadiran (Piket)"
          subtitle={
            useCutoff
              ? `Batas tepat waktu: ${cutoffTime} WIB (+10 / -15)`
              : `Status: ${getStatusLabel(selectedPreset)} (${POINT_VALUES[selectedPreset] >= 0 ? "+" : ""}${POINT_VALUES[selectedPreset]} Poin)`
          }
          headerBottom={inCameraHeaderControls}
          onScanSuccess={handleQrScan}
          onClose={() => setShowQrScanner(false)}
        />
      )}

      {/* CONTINUOUS FACE SCANNER MODAL */}
      {showFaceScanner && (
        <FaceScanner
          siswaList={siswaList}
          scannedIds={scannedSiswaIds}
          title="Scan Wajah Kehadiran (Piket)"
          subtitle={
            useCutoff
              ? `Batas tepat waktu: ${cutoffTime} WIB (+10 / -15)`
              : `Status: ${getStatusLabel(selectedPreset)} (${POINT_VALUES[selectedPreset] >= 0 ? "+" : ""}${POINT_VALUES[selectedPreset]} Poin)`
          }
          headerBottom={inCameraHeaderControls}
          onMatchSuccess={handleFaceMatch}
          onClose={() => setShowFaceScanner(false)}
        />
      )}
    </div>
  );
}
