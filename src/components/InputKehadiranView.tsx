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
} from "lucide-react";
import { Siswa, UserSession } from "../types";
import {
  getSiswaListLight,
  getAturanKehadiranList,
  getKehadiranListByDate,
  getPiketConfig,
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

export type PresetKehadiranStatus = "tepat_waktu" | "terlambat" | "izin" | "sakit";
export type LateTier = "telat_5" | "telat_10" | "telat_15";

export default function InputKehadiranView({ userSession }: InputKehadiranViewProps) {
  const todayStr = useMemo(() => formatLocalDate(new Date()), []);

  // ── 1. GLOBAL PIKET CONFIG (SUPER ADMIN CONTROLLED) ──
  const { data: remotePiketConfig } = useQuery({
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

  // Sync state when remote config updates
  useEffect(() => {
    if (remotePiketConfig) {
      setUseCutoff(remotePiketConfig.useCutoff);
      setCutoffTime(remotePiketConfig.cutoffTime || "06:30");
    }
  }, [remotePiketConfig]);

  // ── 2. PRESET STATUS & LATE TIER (WHEN CUTOFF IS OFF OR IN CAMERA) ──
  const [selectedPreset, setSelectedPreset] = useState<PresetKehadiranStatus>(() => {
    const saved = localStorage.getItem("19points_piket_selected_preset");
    if (saved === "tepat_waktu" || saved === "terlambat" || saved === "izin" || saved === "sakit") {
      return saved;
    }
    return "tepat_waktu";
  });

  const [selectedLateTier, setSelectedLateTier] = useState<LateTier>(() => {
    const saved = localStorage.getItem("19points_piket_selected_late_tier");
    if (saved === "telat_5" || saved === "telat_10" || saved === "telat_15") {
      return saved as LateTier;
    }
    return "telat_15";
  });

  const handleSelectPreset = (status: PresetKehadiranStatus) => {
    setSelectedPreset(status);
    localStorage.setItem("19points_piket_selected_preset", status);
  };

  const handleSelectLateTier = (tier: LateTier) => {
    setSelectedLateTier(tier);
    localStorage.setItem("19points_piket_selected_late_tier", tier);
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

  // Aturan points map with explicit required defaults (+10 Hadir, -5 / -10 / -15 Terlambat, -50 Alfa, 0 Izin/Sakit)
  const aturanMap = useMemo(() => {
    const map: Record<string, AturanKehadiran> = {};
    aturanList.forEach((rule) => {
      map[rule.status] = rule;
    });
    return map;
  }, [aturanList]);

  // Points and status resolver for Auto Cutoff
  const getCutoffStatusAndPoints = useCallback(
    (now: Date = new Date()) => {
      const [cutoffH, cutoffM] = cutoffTime.split(":").map(Number);
      const cutoffMinutes = (isNaN(cutoffH) ? 6 : cutoffH) * 60 + (isNaN(cutoffM) ? 30 : cutoffM);
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      const diffMinutes = currentMinutes - cutoffMinutes;

      if (diffMinutes <= 0) {
        return {
          status: "tepat_waktu",
          points: aturanMap["tepat_waktu"]?.nilai_poin ?? 10,
          label: "HADIR TEPAT WAKTU",
        };
      }
      if (diffMinutes <= 5) {
        return {
          status: "telat_5",
          points: aturanMap["telat_5"]?.nilai_poin ?? -5,
          label: "TERLAMBAT ≤ 5 MENIT",
        };
      }
      if (diffMinutes <= 10) {
        return {
          status: "telat_10",
          points: aturanMap["telat_10"]?.nilai_poin ?? -10,
          label: "TERLAMBAT ≤ 10 MENIT",
        };
      }
      return {
        status: "telat_15",
        points: aturanMap["telat_15"]?.nilai_poin ?? -15,
        label: "TERLAMBAT > 15 MENIT",
      };
    },
    [cutoffTime, aturanMap]
  );

  // Points and status resolver for Preset Selection
  const getPresetStatusAndPoints = useCallback(
    (preset: PresetKehadiranStatus, lateTier: LateTier) => {
      if (preset === "tepat_waktu") {
        return {
          status: "tepat_waktu",
          points: aturanMap["tepat_waktu"]?.nilai_poin ?? 10,
          label: "HADIR TEPAT WAKTU",
        };
      }
      if (preset === "terlambat") {
        const pts = aturanMap[lateTier]?.nilai_poin ?? (lateTier === "telat_5" ? -5 : lateTier === "telat_10" ? -10 : -15);
        const tierLabel = lateTier === "telat_5" ? "≤ 5 Menit" : lateTier === "telat_10" ? "≤ 10 Menit" : "> 15 Menit";
        return {
          status: lateTier,
          points: pts,
          label: `TERLAMBAT (${tierLabel})`,
        };
      }
      if (preset === "izin") {
        return {
          status: "izin",
          points: aturanMap["izin"]?.nilai_poin ?? 0,
          label: "IZIN",
        };
      }
      if (preset === "sakit") {
        return {
          status: "sakit",
          points: aturanMap["sakit"]?.nilai_poin ?? 0,
          label: "SAKIT",
        };
      }
      return {
        status: "tepat_waktu",
        points: 10,
        label: "HADIR",
      };
    },
    [aturanMap]
  );

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
    if (status === "telat_5") return "Terlambat ≤ 5m";
    if (status === "telat_10") return "Terlambat ≤ 10m";
    if (status === "telat_15" || status === "terlambat") return "Terlambat > 15m";
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

    // 2. Determine status and points
    const now = new Date();
    let status: string;
    let points: number;
    let feedbackTitle: string;

    if (forcedStatus) {
      status = forcedStatus;
      points = forcedPoints !== undefined ? forcedPoints : (aturanMap[forcedStatus]?.nilai_poin ?? 0);
      feedbackTitle = getStatusLabel(status).toUpperCase();
    } else if (useCutoff) {
      const cutoffRes = getCutoffStatusAndPoints(now);
      status = cutoffRes.status;
      points = cutoffRes.points;
      feedbackTitle = cutoffRes.label;
    } else {
      const presetRes = getPresetStatusAndPoints(selectedPreset, selectedLateTier);
      status = presetRes.status;
      points = presetRes.points;
      feedbackTitle = presetRes.label;
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
      const cutoffRes = getCutoffStatusAndPoints();
      if (cutoffRes.status === "tepat_waktu") {
        setSiswaCategory("tepat_waktu");
        setSiswaStatus("tepat_waktu");
        setSiswaPoints(aturanMap["tepat_waktu"]?.nilai_poin ?? 10);
      } else {
        setSiswaCategory("terlambat");
        setSiswaStatus(cutoffRes.status);
        setSiswaPoints(cutoffRes.points);
      }
    } else {
      if (selectedPreset === "tepat_waktu") {
        setSiswaCategory("tepat_waktu");
        setSiswaStatus("tepat_waktu");
        setSiswaPoints(aturanMap["tepat_waktu"]?.nilai_poin ?? 10);
      } else if (selectedPreset === "terlambat") {
        setSiswaCategory("terlambat");
        setSiswaStatus(selectedLateTier);
        setSiswaPoints(aturanMap[selectedLateTier]?.nilai_poin ?? -15);
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
      const currentCutoff = getCutoffStatusAndPoints();
      return (
        <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-black/70 backdrop-blur-md border border-white/20 text-xs">
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${!isCurrentTimeLate ? "bg-emerald-400" : "bg-amber-400"} animate-pulse`} />
            <span className="text-white/90 font-bold text-[11px]">
              Auto Jam (&le; {cutoffTime}): {!isCurrentTimeLate ? "Tepat Waktu (+10)" : `Terlambat (${currentCutoff.points} Pts)`}
            </span>
          </div>
          <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase ${!isCurrentTimeLate ? "bg-emerald-500 text-white" : "bg-amber-500 text-black"}`}>
            {!isCurrentTimeLate ? "Tepat Waktu" : "Terlambat"}
          </span>
        </div>
      );
    }

    // When useCutoff is false: Render quick touch preset pills in camera header!
    const currentConfig = getPresetStatusAndPoints(selectedPreset, selectedLateTier);
    return (
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-extrabold text-white/80 uppercase tracking-wider">
            Status Scan:
          </span>
          <span className="text-[10px] font-mono text-emerald-300 font-bold">
            Poin: {currentConfig.points >= 0 ? "+" : ""}{currentConfig.points}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => handleSelectPreset("tepat_waktu")}
            className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer border ${
              selectedPreset === "tepat_waktu"
                ? "bg-emerald-600 text-white border-emerald-300 shadow-md scale-105"
                : "bg-black/60 text-white/75 border-white/20 hover:bg-black/80"
            }`}
          >
            🟢 Hadir (+{aturanMap["tepat_waktu"]?.nilai_poin ?? 10})
          </button>
          <button
            type="button"
            onClick={() => handleSelectPreset("terlambat")}
            className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer border ${
              selectedPreset === "terlambat"
                ? "bg-amber-500 text-black border-amber-200 shadow-md scale-105"
                : "bg-black/60 text-white/75 border-white/20 hover:bg-black/80"
            }`}
          >
            🟡 Terlambat
          </button>
          <button
            type="button"
            onClick={() => handleSelectPreset("izin")}
            className={`px-2.5 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer border ${
              selectedPreset === "izin"
                ? "bg-blue-600 text-white border-blue-300 shadow-md scale-105"
                : "bg-black/60 text-white/75 border-white/20 hover:bg-black/80"
            }`}
          >
            🔵 Izin (0)
          </button>
          <button
            type="button"
            onClick={() => handleSelectPreset("sakit")}
            className={`px-2.5 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer border ${
              selectedPreset === "sakit"
                ? "bg-purple-600 text-white border-purple-300 shadow-md scale-105"
                : "bg-black/60 text-white/75 border-white/20 hover:bg-black/80"
            }`}
          >
            🟣 Sakit (0)
          </button>
        </div>

        {/* Sub-tier selector when Terlambat is selected */}
        {selectedPreset === "terlambat" && (
          <div className="flex items-center gap-1.5 pt-1">
            <span className="text-[10px] font-bold text-amber-200 uppercase tracking-wider shrink-0">Waktu:</span>
            <div className="flex items-center gap-1.5 flex-1">
              {(
                [
                  { tier: "telat_5" as const, label: "≤ 5 Menit", pts: aturanMap["telat_5"]?.nilai_poin ?? -5 },
                  { tier: "telat_10" as const, label: "≤ 10 Menit", pts: aturanMap["telat_10"]?.nilai_poin ?? -10 },
                  { tier: "telat_15" as const, label: "> 15 Menit", pts: aturanMap["telat_15"]?.nilai_poin ?? -15 },
                ]
              ).map((item) => {
                const isActive = selectedLateTier === item.tier;
                return (
                  <button
                    key={item.tier}
                    type="button"
                    onClick={() => handleSelectLateTier(item.tier)}
                    className={`flex-1 py-1 px-1.5 rounded-lg text-[10.5px] font-black transition-all cursor-pointer border text-center ${
                      isActive
                        ? "bg-amber-400 text-black border-white shadow-sm scale-102 font-extrabold"
                        : "bg-black/50 text-amber-200/80 border-amber-400/30 hover:bg-black/80"
                    }`}
                  >
                    {item.label} ({item.pts})
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }, [useCutoff, isCurrentTimeLate, cutoffTime, selectedPreset, selectedLateTier, aturanMap, getCutoffStatusAndPoints, getPresetStatusAndPoints]);

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

      {/* ── STATUS BAR ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-white rounded-2xl border border-brand-100 shadow-sm text-xs">
        <div className="flex items-center gap-2.5">
          <div
            className={`w-2.5 h-2.5 rounded-full ${
              useCutoff
                ? !isCurrentTimeLate
                  ? "bg-emerald-500"
                  : "bg-amber-500"
                : "bg-brand-500"
            } animate-pulse`}
          />
          <span className="font-bold text-brand-950">
            {useCutoff ? (
              <>
                Batas Jam: &le; {cutoffTime} WIB (
                <strong className={!isCurrentTimeLate ? "text-emerald-700" : "text-amber-700"}>
                  {!isCurrentTimeLate ? "Tepat Waktu" : "Terlambat"}
                </strong>
                )
              </>
            ) : (
              <>
                Mode Bebas: Status scan dipilih langsung di kamera ({getStatusLabel(selectedPreset)})
              </>
            )}
          </span>
        </div>

        <div className="flex items-center gap-2 text-slate-400 text-[11px] font-semibold">
          <span className="px-2.5 py-0.5 rounded-lg bg-brand-50 text-brand-700 font-bold">
            {useCutoff ? "Batas Otomatis" : "Status Manual"}
          </span>
          <span>&bull;</span>
          <span>Anti-duplikat Aktif</span>
        </div>
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
        <div className="max-w-md mx-auto bg-white p-6 rounded-3xl border border-brand-100 shadow-md space-y-5 text-center">
          <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto border border-emerald-200">
            <QrCode className="w-7 h-7" />
          </div>

          <div className="space-y-1">
            <h4 className="font-extrabold text-sm text-brand-950">Scanner QR Siswa</h4>
            <p className="text-xs text-brand-400 font-semibold">
              Kamera aktif terus memindai kartu QR siswa tanpa henti.
            </p>
          </div>

          <button
            onClick={() => setShowQrScanner(true)}
            className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white font-black text-xs uppercase tracking-wider rounded-2xl shadow-lg shadow-emerald-600/20 cursor-pointer border-0 transition-all flex items-center justify-center gap-2"
          >
            <QrCode className="w-4 h-4" />
            <span>Mulai Scan QR</span>
          </button>
        </div>
      )}

      {/* 2. TAB SCAN WAJAH */}
      {!activeSiswa && mode === "scan" && scanType === "face" && (
        <div className="max-w-md mx-auto bg-white p-6 rounded-3xl border border-brand-100 shadow-md space-y-5 text-center">
          <div className="w-14 h-14 bg-brand-50 text-brand-600 rounded-2xl flex items-center justify-center mx-auto border border-brand-200">
            <ScanFace className="w-7 h-7" />
          </div>

          <div className="space-y-1">
            <h4 className="font-extrabold text-sm text-brand-950">Scan Wajah AI Siswa</h4>
            <p className="text-xs text-brand-400 font-semibold">
              Posisikan wajah siswa di depan kamera untuk verifikasi instan.
            </p>
          </div>

          <button
            onClick={() => setShowFaceScanner(true)}
            className="w-full py-3.5 brand-gradient hover:opacity-95 active:scale-98 text-white font-black text-xs uppercase tracking-wider rounded-2xl shadow-lg shadow-brand-500/20 cursor-pointer border-0 transition-all flex items-center justify-center gap-2"
          >
            <ScanFace className="w-4 h-4" />
            <span>Mulai Scan Wajah</span>
          </button>
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
                            setSiswaPoints(aturanMap["tepat_waktu"]?.nilai_poin ?? 10);
                          } else if (cat === "alfa") {
                            setSiswaStatus("alfa");
                            setSiswaPoints(aturanMap["alfa"]?.nilai_poin ?? -50);
                          } else if (cat === "terlambat") {
                            setSiswaStatus(selectedLateTier);
                            setSiswaPoints(aturanMap[selectedLateTier]?.nilai_poin ?? -15);
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
                      const st = e.target.value;
                      setSiswaStatus(st);
                      setSiswaPoints(aturanMap[st]?.nilai_poin ?? -15);
                    }}
                    className="w-full border border-brand-100 rounded-xl p-3 text-xs font-bold text-brand-800 bg-[#faf9ff] outline-none cursor-pointer"
                  >
                    <option value="telat_5">
                      Terlambat ≤ 5 Menit ({aturanMap["telat_5"]?.nilai_poin ?? -5} Poin)
                    </option>
                    <option value="telat_10">
                      Terlambat ≤ 10 Menit ({aturanMap["telat_10"]?.nilai_poin ?? -10} Poin)
                    </option>
                    <option value="telat_15">
                      Terlambat &gt; 15 Menit ({aturanMap["telat_15"]?.nilai_poin ?? -15} Poin)
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
                    value={`Hadir Tepat Waktu (+${aturanMap["tepat_waktu"]?.nilai_poin ?? 10} Poin)`}
                    disabled
                    className="w-full border border-brand-100 rounded-xl p-3 text-xs font-bold text-slate-400 bg-brand-50/50 outline-none"
                  />
                )}

                {siswaCategory === "alfa" && (
                  <input
                    type="text"
                    value={`Alfa (${aturanMap["alfa"]?.nilai_poin ?? -50} Poin)`}
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
              ? `Batas tepat waktu: ${cutoffTime} WIB`
              : `Status: ${getStatusLabel(selectedPreset)}`
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
              ? `Batas tepat waktu: ${cutoffTime} WIB`
              : `Status: ${getStatusLabel(selectedPreset)}`
          }
          headerBottom={inCameraHeaderControls}
          onMatchSuccess={handleFaceMatch}
          onClose={() => setShowFaceScanner(false)}
        />
      )}
    </div>
  );
}
