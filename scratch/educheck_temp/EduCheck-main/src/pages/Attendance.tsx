import React, { useState, useEffect, useRef, Suspense, lazy, useMemo } from 'react';
import { AppState, AttendanceSession, AttendanceRecord, AttendanceStatus, Student, ScheduleItem } from '../types';
import { Button, Input, Card } from '../components/UI';
import { upsertSession, upsertRecord, setActiveClassId } from '../services/db';
import { ScanLine, List, CheckCircle, Clock, BookOpen, ChevronRight, ArrowRightLeft, X, Zap, ZapOff, AlertTriangle, XCircle, LogOut, UserX, CalendarClock, ScanFace, Loader2, Play, QrCode } from 'lucide-react';
import jsQR from 'jsqr';
import { motion, AnimatePresence } from 'framer-motion';
import { v4 as uuidv4 } from 'uuid';

const FaceScan = lazy(() => import('../components/face/FaceScan').then(m => ({ default: m.default })));
const FaceScanner = lazy(() => import('../components/face/FaceScanner').then(m => ({ default: m.default })));

interface Props {
  state: AppState;
  refresh: () => void;
  notify: (msg: string, type?: 'success' | 'error') => void;
}


// Simple notifier fallback (web build friendly)
const notifier = {
  confirm: async ({ title, message }: { title: string; message: string }) => {
    return window.confirm(`${title}\n\n${message}`);
  }
};

// --- ENHANCED AUDIO ENGINE (ELEGANT & LOUD) ---
const playTone = (freq: number, type: OscillatorType, duration: number, vol: number = 1.0, delay: number = 0) => {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    
    const masterGain = ctx.createGain();
    masterGain.gain.value = vol;
    masterGain.connect(ctx.destination);

    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime + delay);
    
    const envGain = ctx.createGain();
    osc.connect(envGain);
    envGain.connect(masterGain);

    const startTime = ctx.currentTime + delay;
    envGain.gain.setValueAtTime(0, startTime);
    envGain.gain.linearRampToValueAtTime(1.0, startTime + 0.01);
    envGain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    osc.start(startTime);
    osc.stop(startTime + duration + 0.1);
    
    setTimeout(() => {
        ctx.close();
    }, (duration + delay + 0.2) * 1000);
  } catch (e) {
    console.error("Audio error", e);
  }
};

const playSuccessSound = () => {
    playTone(1046.50, 'sine', 0.6, 0.8, 0); 
    playTone(1318.51, 'triangle', 0.6, 0.6, 0.05);
    playTone(1567.98, 'sine', 0.8, 0.4, 0.1);
};

const playLateSound = () => {
    playTone(880, 'square', 0.3, 0.3, 0);
    playTone(622.25, 'sawtooth', 0.4, 0.3, 0.15);
};

const playWarningSound = () => {
  playTone(600, 'triangle', 0.1, 0.4, 0);
  playTone(600, 'triangle', 0.1, 0.4, 0.15);
};

const playErrorSound = () => {
    playTone(150, 'sawtooth', 0.3, 0.6, 0); 
    playTone(100, 'square', 0.3, 0.4, 0.1);
};

const getMinutesFromTime = (timeStr: string) => {
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
};

const isTimeMatch = (now: Date, start: string, end: string) => {
    const nowMins = now.getHours() * 60 + now.getMinutes();
    const startMins = getMinutesFromTime(start);
    const endMins = getMinutesFromTime(end);
    return nowMins >= (startMins - 15) && nowMins <= (endMins + 30);
};

export const Attendance: React.FC<Props> = ({ state, refresh, notify }) => {
  const currentSchoolIndex = state.teacher?.currentSchoolIndex ?? 0;
  const schoolClasses = state.classes.filter(c => (c.schoolIndex ?? 0) === currentSchoolIndex);
  const activeClass = schoolClasses.find(c => c.id === state.activeClassId);
  const students = state.students.filter(s => s.classId === state.activeClassId);
  const sortedStudents = useMemo(() => 
    [...students].sort((a, b) => a.name.localeCompare(b.name)), 
    [students]
  );
  const today = new Date().toISOString().split('T')[0];
  const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const todayName = days[new Date().getDay()];
  
  const [mode, setMode] = useState<'scan' | 'manual'>('scan');
  const [scanType, setScanType] = useState<'qr' | 'face' | null>(null);
  const [topic, setTopic] = useState('');
  const [currentSession, setCurrentSession] = useState<AttendanceSession | null>(null);
  const [activeSchedule, setActiveSchedule] = useState<ScheduleItem | null>(null);
  const [showFilter, setShowFilter] = useState<'all' | 'absent' | 'present'>('all');
  
  const [sessionRecords, setSessionRecords] = useState<AttendanceRecord[]>([]);
  const sessionRecordsRef = useRef<AttendanceRecord[]>([]);
  
  const presentCount = useMemo(() => 
    students.filter(s => sessionRecords.some(r => r.studentId === s.id)).length,
    [students, sessionRecords]
  );
  const absentCount = useMemo(() => 
    students.length - presentCount,
    [students.length, presentCount]
  );
  
  const [isScanning, setIsScanning] = useState(false);
  const [isFaceScanning, setIsFaceScanning] = useState(false);
  const [hasFlash, setHasFlash] = useState(false);
  const [flashOn, setFlashOn] = useState(false);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);

  const [scanFeedback, setScanFeedback] = useState<{
    type: 'success' | 'warning' | 'error' | 'late'; 
    title: string;
    message: string;
    timestamp: number;
  } | null>(null);
  
  const [lastDetectedText, setLastDetectedText] = useState<string>('');

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  
  const isScanningRef = useRef(false);
  const isPausedRef = useRef(false); 
  const scanIntervalRef = useRef<any>(null);
  const sessionIdRef = useRef<string | null>(null); 
  
  const lastScannedCodeRef = useRef<string | null>(null);
  const detectorRef = useRef<any>(null);
  const lastScannedTimeRef = useRef<number>(0);

  useEffect(() => {
    sessionRecordsRef.current = sessionRecords;
  }, [sessionRecords]);

  useEffect(() => {
    if (activeClass && state.teacher) {
        const now = new Date();
        const scheduleForNow = state.schedules.find(s => 
            s.classId === activeClass.id && 
            s.dayName === todayName && 
            isTimeMatch(now, s.startTime, s.endTime)
        );
        setActiveSchedule(scheduleForNow || null);

        const todaysSessions = state.sessions.filter(s => s.classId === activeClass.id && s.dateISO === today);
        
        let matchingSession: AttendanceSession | undefined;

        if (scheduleForNow) {
            matchingSession = todaysSessions.find(s => s.scheduleId === scheduleForNow.id);
        } else {
            matchingSession = todaysSessions.find(s => !s.scheduleId) || todaysSessions[todaysSessions.length - 1];
        }

        if (matchingSession) {
            setCurrentSession(matchingSession);
            setTopic(matchingSession.topic);
            sessionIdRef.current = matchingSession.id;
            const recs = state.records.filter(r => r.sessionId === matchingSession!.id);
            setSessionRecords(recs);
            sessionRecordsRef.current = recs;
        } else {
            setCurrentSession(null);
            sessionIdRef.current = null;
            setTopic('');
            setSessionRecords([]);
            sessionRecordsRef.current = [];
        }
    }
  }, [activeClass, state.sessions, state.records, state.schedules, today, todayName]);

  useEffect(() => {
    if (isScanning) {
      startScan();
    }
  }, [isScanning]);

  const ensureSession = async (): Promise<string> => {
    if (currentSession) {
      if (topic && currentSession.topic !== topic) {
        const updated = { ...currentSession, topic };
        await upsertSession(updated);
        setCurrentSession(updated);
      }
      sessionIdRef.current = currentSession.id; 
      return currentSession.id;
    }

    if (!activeClass || !state.teacher) throw new Error("No class active");

    const classSessions = state.sessions.filter(s => 
        s.classId === activeClass.id && 
        s.schoolYear === state.teacher!.schoolYear
    );
    const meetingNumber = classSessions.length + 1;
    
    const now = new Date();
    const newSessionId = uuidv4();
    const autoTopic = topic.trim() || `Pertemuan ${meetingNumber}`;

    const newSession: AttendanceSession = {
      id: newSessionId,
      classId: activeClass.id,
      schoolYear: state.teacher.schoolYear,
      dateISO: today,
      dayName: todayName,
      dateLabel: now.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }),
      meetingNumber,
      topic: autoTopic,
      scheduleId: activeSchedule?.id,
      createdAt: now.toISOString()
    };

    await upsertSession(newSession);
    setCurrentSession(newSession);
    sessionIdRef.current = newSessionId;
    refresh();
    return newSessionId;
  };

  const handleSelectClass = (id: string) => {
    setActiveClassId(id);
    refresh();
  };

  const handleChangeClass = () => {
    setActiveClassId(null);
    refresh();
  };

  const handleCloseSession = async () => {
      if (!currentSession) {
          notify("Belum ada sesi absensi yang aktif hari ini.", "error");
          return;
      }
      
      const unscannedStudents = students.filter(s => !sessionRecords.find(r => r.studentId === s.id));
      
      if (unscannedStudents.length === 0) {
          notify("Semua siswa sudah diabsen (tidak ada yang Alpha).", "success");
          return;
      }

      const ok = await notifier.confirm({ title: "Tandai Alpha", message: `Tandai ${unscannedStudents.length} siswa yang belum absen sebagai ALPHA?` });
      if (ok) {
          const now = new Date();
          const sessionId = currentSession.id;
          
          for (const s of unscannedStudents) {
              const record: AttendanceRecord = {
                  id: uuidv4(),
                  sessionId,
                  studentId: s.id,
                  status: 'Alpha',
                  timeISO: now.toISOString(),
                  timeHHMMSS: now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).replace(/\./g, ':'),
                  note: 'Otomatis oleh sistem (Tutup Absen)'
              };
              await upsertRecord(record);
          }
          
          await refresh(); 
          notify("Sesi ditutup: Siswa yang tidak hadir ditandai Alpha.", "success");
      }
  };


const loadVideoDevices = async () => {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cams = devices.filter(d => d.kind === 'videoinput');
    
    const uniqueCams: MediaDeviceInfo[] = [];
    const seenIds = new Set<string>();
    const seenLabels = new Set<string>();
    
    for (const d of cams) {
       if (/(virtual|obs|snap|epoc|droidcam|xsplit|iriun|vdo)/i.test(d.label)) continue;
       
       if (d.deviceId) {
           if (seenIds.has(d.deviceId)) continue;
           if (d.label) {
               if (seenLabels.has(d.label)) continue;
               seenLabels.add(d.label);
           }
           seenIds.add(d.deviceId);
           uniqueCams.push(d);
       } else {
           if (uniqueCams.length === 0) {
               uniqueCams.push(d);
           }
       }
    }
    
    setVideoDevices(uniqueCams);
    if (!selectedDeviceId && uniqueCams.length > 0) {
      const preferred = uniqueCams.find(d => /back|rear|environment/i.test(d.label)) || uniqueCams[0];
      setSelectedDeviceId(preferred.deviceId);
    }
  } catch (e) {}
};

const switchCamera = async () => {
  if (videoDevices.length < 2) return;
  const current = selectedDeviceId;
  const idx = videoDevices.findIndex(d => d.deviceId === current);
  const next = videoDevices[(idx + 1 + videoDevices.length) % videoDevices.length];
  setSelectedDeviceId(next.deviceId);
  if (isScanningRef.current) {
    if (scanIntervalRef.current) { clearInterval(scanIntervalRef.current); scanIntervalRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    setHasFlash(false);
    setFlashOn(false);
    startScan(next.deviceId);
  }
};


  const startScan = async (forceDeviceId?: string) => {
    await ensureSession();
    
    isScanningRef.current = true;
    isPausedRef.current = false; 
    setScanFeedback(null);
    lastScannedCodeRef.current = null;

    try {
      const deviceIdToUse = forceDeviceId || selectedDeviceId || undefined;
const videoConstraints: MediaTrackConstraints = {
  width: { ideal: 640 },
  height: { ideal: 480 },
  frameRate: { ideal: 15, max: 20 },
  ...(deviceIdToUse
    ? { deviceId: { exact: deviceIdToUse } }
    : { facingMode: { ideal: 'environment' as any } }),
};

// Some devices/WebViews are strict and may throw OverconstrainedError when constraints can't be satisfied.
// We try a few progressively relaxed attempts to ensure the camera can still open.
const getStreamWithFallback = async () => {
  const attempts: Array<MediaStreamConstraints> = [
    { video: videoConstraints, audio: false },
    // Relax resolution/fps first but keep the selected device if any
    { video: deviceIdToUse ? ({ deviceId: { exact: deviceIdToUse } } as MediaTrackConstraints) : true, audio: false },
    // Final fallback: whatever camera the platform gives us
    { video: true, audio: false },
  ];

  let lastErr: any = null;
  for (const c of attempts) {
    try {
      return await navigator.mediaDevices.getUserMedia(c);
    } catch (e: any) {
      lastErr = e;
      // If the exact deviceId is invalid or constraints can't be met, continue to next attempt
      continue;
    }
  }
  throw lastErr;
};

const stream = await getStreamWithFallback();
      streamRef.current = stream;

      const track = stream.getVideoTracks()[0];
      const settings = (track.getSettings && track.getSettings()) || {};
      // @ts-ignore
      if (settings.deviceId) setSelectedDeviceId(settings.deviceId as string);
      loadVideoDevices();

      const capabilities = (track.getCapabilities && track.getCapabilities()) || {};
      // @ts-ignore
      if (capabilities.torch || 'torch' in capabilities) {
        setHasFlash(true);
      }

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute("playsinline", "true");
        
        const initVideo = () => {
            videoRef.current?.play().catch(e => console.error("Play error:", e));
            if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
            scanIntervalRef.current = setInterval(() => {
                if (scanLoopRef.current) scanLoopRef.current();
            }, 350);
        };
        
        videoRef.current.onloadedmetadata = initVideo;
        
        if (videoRef.current.videoWidth) {
            initVideo();
        }
      }
    } catch (err) {
      console.error("Gagal akses kamera:", err);
      notify("Gagal akses kamera. Pastikan izin diberikan.", "error");
      stopScan();
    }
  };

  const stopScan = () => {
    setIsScanning(false);
    setScanType(null);
    isScanningRef.current = false;
    isPausedRef.current = false;
    setFlashOn(false);
    
    if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current);
        scanIntervalRef.current = null;
    }
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    refresh();
  };

  const toggleFlash = async () => {
    if (!streamRef.current || !hasFlash) return;
    const track = streamRef.current.getVideoTracks()[0];
    try {
      await track.applyConstraints({
        // @ts-ignore
        advanced: [{ torch: !flashOn }]
      });
      setFlashOn(!flashOn);
    } catch (e) {
      console.error("Flash toggle failed", e);
    }
  };

  const scanLoop = async () => {
    if (!isScanningRef.current || !videoRef.current) return;
    if (isPausedRef.current) return;
    
    const video = videoRef.current;
    if (video.readyState !== video.HAVE_ENOUGH_DATA) return;

    let detectedValue: string | null = null;

    // @ts-ignore
    if ('BarcodeDetector' in window) {
      try {
        // @ts-ignore
        if (!detectorRef.current) detectorRef.current = new window.BarcodeDetector({ formats: ['qr_code'] });
        const features = await detectorRef.current.detect(video);
        if (features.length > 0) {
           detectedValue = features[0].rawValue;
        }
      } catch (e) {}
    }

    if (!detectedValue && canvasRef.current) {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        
        if (ctx) {
           if (canvas.width !== video.videoWidth) canvas.width = video.videoWidth;
           if (canvas.height !== video.videoHeight) canvas.height = video.videoHeight;
           
           ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
           const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
           
           // @ts-ignore
           const jsQRFunc = jsQR.default || jsQR;
           const code = jsQRFunc(imageData.data, imageData.width, imageData.height, { inversionAttempts: "dontInvert" });
           
           if (code) detectedValue = code.data;
        }
    }

    if (detectedValue) {
        handleDetectedQR(detectedValue);
    }
  };

  const scanLoopRef = useRef(scanLoop);
  useEffect(() => {
     scanLoopRef.current = scanLoop;
  }); 

  const handleDetectedQR = (qrData: string) => {
    if (isPausedRef.current) return;
    const now = Date.now();
    if (lastScannedCodeRef.current === qrData && (now - lastScannedTimeRef.current < 2000)) {
        return;
    }
    lastScannedCodeRef.current = qrData;
    lastScannedTimeRef.current = now;
    setLastDetectedText(qrData);
    processScan(qrData);
  };

  const triggerFeedbackPause = () => {
    isPausedRef.current = true;
    setTimeout(() => {
        setScanFeedback(null);
        isPausedRef.current = false;
        lastScannedCodeRef.current = null;
    }, 2000);
  }

  const processScan = async (qrData: string) => {
    const now = Date.now();
    const sessionId = sessionIdRef.current;

    if (!sessionId) {
        setScanFeedback({ type: 'error', title: 'Error Sesi', message: 'Sesi absensi tidak valid.', timestamp: now });
        triggerFeedbackPause();
        return; 
    }

    if (!qrData.startsWith('ABSEN:')) {
      setScanFeedback({ type: 'error', title: 'QR Tidak Dikenali', message: 'Gunakan QR Code dari aplikasi EduCheck.', timestamp: now });
      playErrorSound();
      triggerFeedbackPause();
      return;
    }

    const studentId = qrData.split(':')[1];
    const student = students.find(s => s.id === studentId);
    if (!student) {
      setScanFeedback({ type: 'error', title: 'Siswa Salah Kelas', message: 'Data siswa tidak ada di kelas ini.', timestamp: now });
      playErrorSound();
      triggerFeedbackPause();
      return;
    }

    const existing = sessionRecordsRef.current.find(r => r.studentId === student.id && r.sessionId === sessionId);
    if (existing) {
      setScanFeedback({
        type: 'warning',
        title: 'SUDAH ABSEN',
        message: `${student.name} sudah tercatat di sesi ini.`,
        timestamp: now
      });
      playWarningSound();
      triggerFeedbackPause();
      return;
    }

    let status: AttendanceStatus = 'Hadir';
    let feedbackTitle = 'BERHASIL - HADIR';
    let feedbackType: 'success' | 'late' = 'success';
    
    const lateConfig = state.teacher?.lateSetting ?? { isEnabled: false, bufferMinutes: 0 };

    if (lateConfig.isEnabled) {
        const nowTime = new Date();

        // A) If scan happens during a scheduled class, compare against schedule start time
        if (activeSchedule) {
            const currentMinutes = nowTime.getHours() * 60 + nowTime.getMinutes();
            const startMinutes = getMinutesFromTime(activeSchedule.startTime);

            if (currentMinutes > (startMinutes + lateConfig.bufferMinutes)) {
                status = 'Terlambat';
                feedbackTitle = 'BERHASIL - TERLAMBAT';
                feedbackType = 'late';
            }
        } 
        // B) If there is no matching schedule (random scan), use the session start time as the reference
        else if (currentSession?.createdAt) {
            const sessionStart = new Date(currentSession.createdAt).getTime();
            const lateAfterMs = (lateConfig.bufferMinutes ?? 0) * 60 * 1000;

            if (nowTime.getTime() > (sessionStart + lateAfterMs)) {
                status = 'Terlambat';
                feedbackTitle = 'BERHASIL - TERLAMBAT';
                feedbackType = 'late';
            }
        }
    }


    const recordTime = new Date();
    const newRecord: AttendanceRecord = {
      id: uuidv4(),
      sessionId,
      studentId: student.id,
      status: status, 
      timeISO: recordTime.toISOString(),
      timeHHMMSS: recordTime.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).replace(/\./g, ':')
    };

    sessionRecordsRef.current = [...sessionRecordsRef.current, newRecord];
    await upsertRecord(newRecord);
    setSessionRecords(prev => [...prev, newRecord]);
    refresh();

    setScanFeedback({
      type: feedbackType,
      title: feedbackTitle,
      message: student.name,
      timestamp: now
    });

    if (feedbackType === 'late') {
        playLateSound();
    } else {
        playSuccessSound();
    }
    triggerFeedbackPause();
  };

  const handleFaceAttendanceSuccess = async (studentId: string, studentName: string, status: AttendanceStatus) => {
    const sessionId = await ensureSession();
    const now = new Date();

    const existing = sessionRecordsRef.current.find(r => r.studentId === studentId);
    if (existing) {
      setScanFeedback({
        type: 'warning',
        title: 'SUDAH ABSEN',
        message: `${studentName} sudah tercatat di sesi ini.`,
        timestamp: Date.now()
      });
      playWarningSound();
      setTimeout(() => setScanFeedback(null), 2000);
      return;
    }

    let finalStatus = status;
    const lateConfig = state.teacher?.lateSetting ?? { isEnabled: false, bufferMinutes: 0 };

    if (lateConfig.isEnabled && activeSchedule) {
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      const startMinutes = getMinutesFromTime(activeSchedule.startTime);
      if (currentMinutes > (startMinutes + lateConfig.bufferMinutes)) {
        finalStatus = 'Terlambat';
      }
    }

    const record: AttendanceRecord = {
      id: uuidv4(),
      sessionId,
      studentId,
      status: finalStatus,
      timeISO: now.toISOString(),
      timeHHMMSS: now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).replace(/\./g, ':')
    };

    await upsertRecord(record);
    setSessionRecords(prev => [...prev, record]);
    refresh();

    setScanFeedback({
      type: finalStatus === 'Terlambat' ? 'late' : 'success',
      title: finalStatus === 'Terlambat' ? 'BERHASIL - TERLAMBAT' : 'BERHASIL - HADIR',
      message: studentName,
      timestamp: Date.now()
    });

    if (finalStatus === 'Terlambat') {
      playLateSound();
    } else {
      playSuccessSound();
    }
    setTimeout(() => setScanFeedback(null), 2000);
  };

  const handleManualStatus = async (studentId: string, status: AttendanceStatus) => {
    const sessionId = await ensureSession();
    const now = new Date();
    
    // MODIFIKASI: Cari apakah record sudah ada untuk siswa ini di sesi ini
    const existing = sessionRecordsRef.current.find(r => r.studentId === studentId);

    const record: AttendanceRecord = {
      id: existing ? existing.id : uuidv4(), // Jika ada, gunakan ID lama agar database melakukan UPDATE bukan INSERT
      sessionId,
      studentId,
      status,
      timeISO: now.toISOString(),
      timeHHMMSS: now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).replace(/\./g, ':')
    };
    await upsertRecord(record);
    
    setSessionRecords(prev => {
       const others = prev.filter(r => r.studentId !== studentId);
       const updated = [...others, record];
       sessionRecordsRef.current = updated;
       return updated;
    });
    refresh();
  };

  // Set semua siswa menjadi Hadir (khusus mode manual)
  const handleMarkAllPresent = async () => {
    const sessionId = await ensureSession();
    const now = new Date();
    const timeISO = now.toISOString();
    const timeHHMMSS = now
      .toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      })
      .replace(/\./g, ':');

    const records: AttendanceRecord[] = students.map((s) => {
      const existing = sessionRecordsRef.current.find((r) => r.studentId === s.id);
      return {
        id: existing ? existing.id : uuidv4(),
        sessionId,
        studentId: s.id,
        status: 'Hadir',
        timeISO,
        timeHHMMSS,
      };
    });

    await Promise.all(records.map((r) => upsertRecord(r)));
    sessionRecordsRef.current = records;
    setSessionRecords(records);
    refresh();
  };

  if (!activeClass) {
    return (
      <div className="p-6">
        <div className="mb-6">
           <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
             <Clock className="w-6 h-6 text-emerald-500" />
             Absensi Digital
           </h1>
           <p className="text-gray-500 text-sm mt-1">Pilih kelas untuk memulai absensi hari ini</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {schoolClasses.map(c => {
             const studentCount = state.students.filter(s => s.classId === c.id).length;
             return (
               <Card key={c.id} onClick={() => handleSelectClass(c.id)} className="group cursor-pointer hover:shadow-md hover:border-emerald-200 transition-all">
                  <div className="p-5 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                       <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center group-hover:bg-emerald-500 group-hover:text-white transition-colors">
                          <BookOpen className="w-6 h-6" />
                       </div>
                       <div>
                          <h3 className="font-bold text-gray-900 text-lg">{c.name}</h3>
                          <p className="text-sm text-gray-500">{studentCount} Siswa</p>
                       </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-emerald-500 transition-colors" />
                  </div>
              </Card>
            );
         })}
        </div>
      </div>
    );
  }

  // Face Scanner - Full screen overlay
  if (isFaceScanning) {
    return (
      <FaceScanner
        classId={activeClass?.id || ''}
        className={activeClass?.name}
        sessionTopic={currentSession?.topic || topic || 'Sesi Baru'}
        onMatchSuccess={(studentId, studentName) => {
          const student = students.find(s => s.id === studentId);
          if (student) {
            handleFaceAttendanceSuccess(studentId, studentName, 'Hadir');
          }
        }}
        onCancel={() => { setIsFaceScanning(false); setScanType(null); }}
      />
    );
  }

  if (isScanning) {
    return (
      <div className="fixed inset-0 z-[100] bg-gradient-to-b from-gray-900 via-gray-800 to-black flex flex-col">
        <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" />
        <canvas ref={canvasRef} className="hidden" />

        <div className="absolute top-0 inset-x-0 z-30 bg-gradient-to-b from-black/90 via-black/60 to-transparent pt-6 pb-4 px-6 md:pt-8 md:px-12">
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-4 md:gap-6">
              <div className="w-14 h-14 md:w-16 md:h-16 rounded-2xl md:rounded-3xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/30">
                <QrCode className="w-7 h-7 md:w-8 md:h-8 text-white" />
              </div>
              <div className="text-white">
                <h2 className="font-bold text-xl md:text-2xl tracking-tight">{activeClass.name}</h2>
                <p className="text-white/50 text-sm md:text-base">{currentSession?.topic || (topic || 'Absensi QR')}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 md:gap-4">
              {hasFlash && (
                <motion.button 
                  whileTap={{ scale: 0.95 }}
                  onClick={toggleFlash}
                  className="w-12 h-12 md:w-16 md:h-16 rounded-xl md:rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center text-white hover:bg-white/20 transition-all border border-white/10"
                >
                   {flashOn ? <ZapOff className="w-5 h-5 md:w-7 md:h-7" /> : <Zap className="w-5 h-5 md:w-7 md:h-7" />}
                </motion.button>
              )}
              {videoDevices.length > 1 && (
                <motion.button 
                  whileTap={{ scale: 0.95 }}
                  onClick={switchCamera}
                  className="w-12 h-12 md:w-16 md:h-16 rounded-xl md:rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center text-white hover:bg-white/20 transition-all border border-white/10"
                >
                  <ArrowRightLeft className="w-5 h-5 md:w-7 md:h-7" />
                </motion.button>
              )}
              <motion.button 
                whileTap={{ scale: 0.95 }}
                onClick={stopScan}
                className="w-12 h-12 md:w-16 md:h-16 rounded-xl md:rounded-2xl bg-red-500/80 backdrop-blur-md flex items-center justify-center text-white hover:bg-red-600 transition-all shadow-lg shadow-red-900/40 border border-red-400/30"
              >
                <X className="w-5 h-5 md:w-7 md:h-7" />
              </motion.button>
            </div>
          </div>
          
          {activeSchedule && (
            <div className="w-full mt-3">
              <span className="inline-block bg-emerald-500/80 text-white text-[10px] md:text-xs px-2 py-0.5 rounded font-bold">
                JADWAL: {activeSchedule.startTime} - {activeSchedule.endTime}
              </span>
            </div>
          )}
        </div>

        <div className="flex-1 flex items-center justify-center relative">
          <div className="relative w-72 h-72 md:w-96 md:h-96">
            <div className="absolute inset-0 rounded-3xl border-2 border-white/20" />
            <div className="absolute top-0 left-0 w-12 h-12 md:w-16 md:h-16">
              <div className="w-full h-full border-l-4 border-t-4 border-emerald-400 rounded-tl-xl" />
            </div>
            <div className="absolute top-0 right-0 w-12 h-12 md:w-16 md:h-16">
              <div className="w-full h-full border-r-4 border-t-4 border-emerald-400 rounded-tr-xl" />
            </div>
            <div className="absolute bottom-0 left-0 w-12 h-12 md:w-16 md:h-16">
              <div className="w-full h-full border-l-4 border-b-4 border-emerald-400 rounded-bl-xl" />
            </div>
            <div className="absolute bottom-0 right-0 w-12 h-12 md:w-16 md:h-16">
              <div className="w-full h-full border-r-4 border-b-4 border-emerald-400 rounded-br-xl" />
            </div>
            
            <div className="absolute inset-0 flex items-center justify-center">
              <QrCode className="w-20 h-20 text-white/30" />
            </div>
          </div>
          
          {lastDetectedText && (
            <div className="absolute bottom-4 inset-x-0 text-center">
              <p className="text-emerald-400 text-xs bg-black/60 inline-block px-3 py-1.5 rounded-lg font-mono">
                Terbaca: {lastDetectedText}
              </p>
            </div>
          )}
        </div>

        <div className="absolute bottom-0 inset-x-0 z-40 pb-8 pt-4 bg-gradient-to-t from-black/80 via-black/50 to-transparent">
          <AnimatePresence mode="wait">
            {scanFeedback ? (
              <motion.div 
                key={scanFeedback.timestamp}
                initial={{ y: 100, opacity: 0, scale: 0.9 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                exit={{ y: 20, opacity: 0, scale: 0.9 }}
                transition={{ type: 'spring', damping: 20, stiffness: 300 }}
                className={`max-w-lg mx-auto rounded-2xl p-5 shadow-2xl border-t-4 backdrop-blur-xl ${
                  scanFeedback.type === 'success' ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-white border-emerald-400 shadow-emerald-500/40' :
                  scanFeedback.type === 'late' ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-white border-amber-300 shadow-amber-500/40' :
                  scanFeedback.type === 'warning' ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white border-blue-300 shadow-blue-500/40' :
                  'bg-gradient-to-r from-red-500 to-red-600 text-white border-red-400 shadow-red-500/40'
                }`}
              >
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
                    scanFeedback.type === 'success' || scanFeedback.type === 'late' ? 'bg-white/20' : 'bg-black/20'
                  }`}>
                    {(scanFeedback.type === 'success' || scanFeedback.type === 'late') && <CheckCircle className="w-7 h-7" />}
                    {scanFeedback.type === 'warning' && <AlertTriangle className="w-6 h-6" />}
                    {scanFeedback.type === 'error' && <XCircle className="w-7 h-7" />}
                  </div>
                  <div>
                    <h3 className="font-bold text-lg leading-tight uppercase tracking-wide">{scanFeedback.title}</h3>
                    <p className="font-medium text-white/90 text-base mt-0.5">{scanFeedback.message}</p>
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center">
                <p className="text-white/40 text-xs">Arahkan QR Code ke area scan</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
           <div className="flex items-center gap-2 text-gray-500 text-xs font-bold uppercase tracking-wider mb-1">
              <span>{activeClass.name}</span>
              <span>•</span>
              <span>{new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short' })}</span>
           </div>
           <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
             Absensi Kelas
           </h1>
           {activeSchedule ? (
               <div className="flex items-center gap-2 mt-2 text-emerald-600 bg-emerald-50 px-3 py-1 rounded-lg text-xs font-bold self-start w-fit">
                  <CalendarClock className="w-4 h-4" />
                  Sesi Jadwal: {activeSchedule.startTime} - {activeSchedule.endTime}
               </div>
           ) : (
               <div className="flex items-center gap-2 mt-2 text-gray-400 bg-gray-100 px-3 py-1 rounded-lg text-xs font-bold self-start w-fit">
                  <Clock className="w-4 h-4" />
                  Sesi Manual (Di luar jadwal)
               </div>
           )}
        </div>
        
        <div className="flex gap-2">
	            {mode === 'manual' && students.length > 0 && (
	                <Button onClick={handleMarkAllPresent} className="!px-4 !py-2 !text-xs !rounded-xl">
	                    <CheckCircle className="w-4 h-4 mr-2" /> Hadir Semua
	                </Button>
	            )}
            {sessionRecords.length > 0 && sessionRecords.length < students.length && (
                <Button variant="danger" onClick={handleCloseSession} className="!px-3 !py-2 !text-xs !rounded-xl">
                    <UserX className="w-4 h-4 mr-2" /> Tutup Absen (Auto Alpha)
                </Button>
            )}

            <Button variant="secondary" onClick={handleChangeClass} className="!px-4 !py-2 !text-xs !rounded-xl !bg-white border border-gray-200 text-gray-600 hover:!bg-gray-50 hover:text-emerald-600">
               <ArrowRightLeft className="w-4 h-4 mr-2" /> Ganti Kelas
            </Button>
        </div>
      </div>

      <div className="flex flex-col xl:flex-row gap-8 items-start">
        <div className="flex flex-col gap-6 w-full xl:w-[350px] shrink-0 xl:sticky xl:top-8">
          <Card className="p-5 shadow-lg shadow-gray-200/50">
            <h3 className="font-bold text-gray-900 mb-3">Materi / Kegiatan (Opsional)</h3>
            <Input 
              placeholder="Kosongkan untuk 'Pertemuan X'..."
              value={topic}
              onChange={e => setTopic(e.target.value)}
              className="bg-gray-50 border-gray-100 focus:bg-white"
            />
            <p className="text-[10px] text-gray-400 mt-2 leading-tight">
                * Jika dikosongkan, nama sesi akan otomatis terekap sebagai Pertemuan 1, 2, dst.
            </p>
          </Card>

          <div className="bg-white p-1.5 rounded-2xl border border-gray-200 shadow-sm flex">
            <button 
              onClick={() => { setMode('scan'); setScanType(null); }}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all ${mode === 'scan' ? 'bg-emerald-500 text-white shadow-md' : 'text-gray-500 hover:bg-gray-50'}`}
            >
              <ScanLine className="w-4 h-4" /> Scan
            </button>
            <button 
              onClick={() => { setMode('manual'); setScanType(null); }}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all ${mode === 'manual' ? 'bg-emerald-500 text-white shadow-md' : 'text-gray-500 hover:bg-gray-50'}`}
            >
              <List className="w-4 h-4" /> Manual
            </button>
          </div>
          
           {(sessionRecords.length > 0 || students.length > 0) && (
               <div className="hidden xl:block flex-1 bg-white rounded-3xl border border-gray-100 shadow-sm p-4 max-h-[400px] overflow-y-auto">
                 <h3 className="text-xs font-bold text-gray-400 uppercase mb-3 tracking-wider flex justify-between">
                   <span>Daftar Absen</span>
                   <span>{sessionRecords.length}/{students.length}</span>
                 </h3>
                  <div className="flex flex-col gap-2">
                    {sortedStudents.map(s => {
                     const record = sessionRecords.find(r => r.studentId === s.id);
                     const hasAttended = !!record;
                     
                     return (
                       <div key={s.id} className={`flex justify-between items-center text-sm p-2 rounded-xl border transition-colors ${
                         hasAttended ? 'bg-white border-gray-100 hover:border-emerald-200' : 'bg-red-50 border-red-100 hover:border-red-200'
                       }`}>
                         <span className={`font-semibold truncate mr-2 ${hasAttended ? 'text-gray-700' : 'text-red-700'}`}>{s.name}</span>
                         <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                           hasAttended 
                             ? record.status === 'Hadir' ? 'bg-emerald-100 text-emerald-700' 
                             : record.status === 'Terlambat' ? 'bg-amber-100 text-amber-700'
                             : record.status === 'Alpha' ? 'bg-red-100 text-red-700'
                             : 'bg-blue-100 text-blue-700'
                             : 'bg-red-200 text-red-800'
                         }`}>
                           {hasAttended ? (record.status === 'Hadir' ? record.timeHHMMSS : record.status) : 'Belum'}
                         </span>
                       </div>
                     )
                   })}
                 </div>
               </div>
             )}
        </div>

        <div className="flex-1 w-full">
          <AnimatePresence mode="wait">
            {mode === 'scan' && scanType === null ? (
              <motion.div 
                key="scan-type"
                initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
                className="flex flex-col gap-4"
              >
                <Card 
                  className="p-6 bg-white rounded-2xl border border-gray-200 shadow-sm hover:shadow-md hover:border-emerald-200 transition-all cursor-pointer"
                  onClick={() => { setScanType('qr'); setIsScanning(true); }}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center">
                      <QrCode className="w-7 h-7 text-emerald-500" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-bold text-gray-900 mb-1">Scan QR Code</h3>
                      <p className="text-sm text-gray-500">Absen dengan memindai QR Code siswa</p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-400" />
                  </div>
                </Card>
                
                <Card 
                  className="p-6 bg-white rounded-2xl border border-gray-200 shadow-sm hover:shadow-md hover:border-emerald-200 transition-all cursor-pointer"
                  onClick={() => { setScanType('face'); setIsFaceScanning(true); }}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center">
                      <ScanFace className="w-7 h-7 text-emerald-500" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-bold text-gray-900 mb-1">Scan Wajah</h3>
                      <p className="text-sm text-gray-500">Absen dengan mengenali wajah siswa</p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-400" />
                  </div>
                </Card>

                {(sessionRecords.length > 0 || students.length > 0) && (
                  <div className="xl:hidden mt-2">
                    <h3 className="text-sm font-bold text-gray-500 mb-3 px-2">Daftar Absen ({sessionRecords.length}/{students.length})</h3>
                    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden max-h-[300px] overflow-y-auto">
                      {sortedStudents.map(s => {
                        const record = sessionRecords.find(r => r.studentId === s.id);
                        const hasAttended = !!record;
                        
                        return (
                          <div key={s.id} className={`p-4 border-b border-gray-50 last:border-0 flex justify-between items-center ${hasAttended ? '' : 'bg-red-50'}`}>
                            <span className={`font-medium ${hasAttended ? 'text-gray-800' : 'text-red-700'}`}>{s.name}</span>
                            <div className="flex flex-col items-end">
                              <span className={`font-bold text-sm px-2 rounded ${
                                hasAttended 
                                  ? record.status === 'Hadir' ? 'bg-emerald-100 text-emerald-700' 
                                  : record.status === 'Terlambat' ? 'bg-amber-100 text-amber-700'
                                  : record.status === 'Alpha' ? 'bg-red-100 text-red-700'
                                  : 'bg-blue-100 text-blue-700'
                                  : 'bg-red-200 text-red-800'
                              }`}>
                                {hasAttended ? record.status : 'Belum'}
                              </span>
                              {hasAttended && record.status === 'Hadir' && (
                                <span className="text-gray-400 text-xs mt-0.5">{record.timeHHMMSS}</span>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </motion.div>
            ) : mode === 'scan' && scanType === 'qr' ? (
              <motion.div 
                key="scan-qr"
                initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
                className="flex flex-col gap-4"
              >
                <button 
                  onClick={() => { stopScan(); }}
                  className="flex items-center gap-2 text-gray-500 hover:text-gray-700 text-sm mb-2"
                >
                  <ChevronRight className="w-4 h-4 rotate-180" />
                  Kembali
                </button>
                

              </motion.div>
            ) : (
              <motion.div 
                key="manual"
                initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
                className="flex flex-col gap-4 pb-20 max-h-[70vh] overflow-y-auto pr-1"
              >
                {/* Filter Tabs */}
                <div className="flex bg-gray-100 rounded-xl p-1">
                  <button
                    onClick={() => setShowFilter('all')}
                    className={`flex-1 py-2 rounded-lg text-sm font-bold transition ${
                      showFilter === 'all' ? 'bg-white text-emerald-600 shadow-sm' : 'text-gray-500'
                    }`}
                  >
                    Semua ({students.length})
                  </button>
                  <button
                    onClick={() => setShowFilter('present')}
                    className={`flex-1 py-2 rounded-lg text-sm font-bold transition ${
                      showFilter === 'present' ? 'bg-white text-emerald-600 shadow-sm' : 'text-gray-500'
                    }`}
                  >
                    Sudah Absen ({presentCount})
                  </button>
                  <button
                    onClick={() => setShowFilter('absent')}
                    className={`flex-1 py-2 rounded-lg text-sm font-bold transition ${
                      showFilter === 'absent' ? 'bg-white text-red-600 shadow-sm' : 'text-gray-500'
                    }`}
                  >
                    Belum Absen ({absentCount})
                  </button>
                </div>

                 {students.filter(s => {
                   const hasRecord = sessionRecords.some(r => r.studentId === s.id);
                   if (showFilter === 'present') return hasRecord;
                   if (showFilter === 'absent') return !hasRecord;
                   return true;
                 }).map(s => {
                  const record = sessionRecords.find(r => r.studentId === s.id);
                  const status = record?.status;

                  const STATUS_STYLE: Record<string, { active: string; inactive: string }> = {
                    Hadir: {
                      active: 'bg-emerald-500 text-white shadow-md shadow-emerald-200',
                      inactive: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
                    },
                    Sakit: {
                      active: 'bg-yellow-500 text-white shadow-md shadow-yellow-200',
                      inactive: 'bg-yellow-50 text-yellow-800 hover:bg-yellow-100',
                    },
                    Izin: {
                      active: 'bg-blue-500 text-white shadow-md shadow-blue-200',
                      inactive: 'bg-blue-50 text-blue-700 hover:bg-blue-100',
                    },
                    Alpha: {
                      active: 'bg-red-500 text-white shadow-md shadow-red-200',
                      inactive: 'bg-red-50 text-red-700 hover:bg-red-100',
                    },
                    Terlambat: {
                      active: 'bg-orange-500 text-white shadow-md shadow-orange-200',
                      inactive: 'bg-orange-50 text-orange-700 hover:bg-orange-100',
                    },
                  };

                  const order: AttendanceStatus[] = ['Hadir', 'Sakit', 'Izin', 'Terlambat', 'Alpha'];

                  return (
                    <div
                      key={s.id}
                      className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-extrabold text-gray-900 text-base md:text-lg truncate">
                            {s.name}
                          </div>
                          <div className="text-xs text-gray-400 mt-1">
                            {record ? `Absen: ${record.timeHHMMSS}` : 'Belum absen'}
                          </div>
                        </div>

                        <div
                          className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold ${
                            status === 'Hadir'
                              ? 'bg-emerald-100 text-emerald-700'
                              : status === 'Sakit'
                                ? 'bg-yellow-100 text-yellow-800'
                                : status === 'Izin'
                                  ? 'bg-blue-100 text-blue-700'
                                  : status === 'Terlambat'
                                    ? 'bg-orange-100 text-orange-700'
                                    : status === 'Alpha'
                                      ? 'bg-red-100 text-red-700'
                                      : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {status ?? '-'}
                        </div>
                      </div>

                      {/* tombol status */}
                      <div className="mt-4 grid grid-cols-2 sm:grid-cols-5 gap-2">
                        {order.map((opt) => {
                          const isActive = status === opt;
                          const cls = isActive ? STATUS_STYLE[opt].active : STATUS_STYLE[opt].inactive;
                          return (
                            <button
                              key={opt}
                              onClick={() => handleManualStatus(s.id, opt)}
                              className={`w-full py-3 rounded-2xl font-extrabold text-sm border border-transparent transition ${cls}`}
                            >
                              {opt}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};