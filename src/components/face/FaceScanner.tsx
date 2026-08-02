import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  ScanFace,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Loader2,
  ShieldAlert,
  ArrowRightLeft,
} from 'lucide-react';
import { Siswa } from '../../types';
import { loadModels, detectFaceFromVideo, findBestMatch, MatchResult } from '../../services/face';

interface FaceScannerProps {
  siswaList: Siswa[];
  onMatchSuccess: (siswa: Siswa) => void;
  onClose: () => void;
  title?: string;
  subtitle?: string;
}

type FeedbackType = 'success' | 'unmatched' | 'error';

interface Feedback {
  type: FeedbackType;
  title: string;
  message: string;
  ts: number;
}

const DETECTION_THROTTLE_MS = 200;

export default function FaceScanner({
  siswaList,
  onMatchSuccess,
  onClose,
  title = 'Scan Wajah',
  subtitle = 'Absensi Otomatis',
}: FaceScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animRef = useRef<number | null>(null);
  const isDetectingRef = useRef(false);
  const cooldownUntilRef = useRef<number>(0);
  const lastDetectionTimeRef = useRef<number>(0);
  const consecutiveMatchRef = useRef<{ siswaId: string; count: number } | null>(null);

  const [isLoadingModels, setIsLoadingModels] = useState(true);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isSwitchingCamera, setIsSwitchingCamera] = useState(false);

  const [detectionStatus, setDetectionStatus] = useState<'no_face' | 'detecting' | 'ideal'>('no_face');
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [matchProgress, setMatchProgress] = useState(0);
  const [isBackCamera, setIsBackCamera] = useState(true);

  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [currentCameraIndex, setCurrentCameraIndex] = useState(0);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');

  // Sound feedback
  const playSound = useCallback((type: 'success' | 'fail') => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      if (type === 'success') {
        osc.frequency.setValueAtTime(587.33, ctx.currentTime);
        osc.frequency.setValueAtTime(880, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.35);
      } else {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(220, ctx.currentTime);
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.25);
      }
    } catch { /* Audio blocked */ }
  }, []);

  const stopCamera = useCallback(() => {
    if (animRef.current) {
      cancelAnimationFrame(animRef.current);
      animRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const startCamera = useCallback(async (deviceId?: string, mode?: 'user' | 'environment') => {
    stopCamera();
    setIsCameraReady(false);
    setCameraError(null);

    const activeFacing = mode ?? facingMode;

    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: deviceId
            ? { deviceId: { exact: deviceId } }
            : { facingMode: { ideal: activeFacing }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
      }

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setIsCameraReady(true);
      }

      // Enumerate cameras
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(d => d.kind === 'videoinput')
        .filter(d => !/(virtual|obs|snap|epoc|droidcam|xsplit|iriun|vdo)/i.test(d.label));
      setCameras(videoDevices);

      const track = stream.getVideoTracks()[0];
      const settings = track?.getSettings?.();
      const activeId = settings?.deviceId;
      const idx = videoDevices.findIndex(d => d.deviceId === activeId);
      setCurrentCameraIndex(idx >= 0 ? idx : 0);
      setIsBackCamera(
        videoDevices[idx >= 0 ? idx : 0]?.label?.toLowerCase().includes('back') ||
        activeFacing === 'environment'
      );
    } catch (err: any) {
      setCameraError('Gagal mengakses kamera. Berikan izin kamera pada browser.');
      console.error('[FaceScanner] Camera error:', err);
    }
  }, [facingMode, stopCamera]);

  // Init on mount: load models + camera in parallel
  useEffect(() => {
    let mounted = true;
    startCamera();
    (async () => {
      setIsLoadingModels(true);
      await loadModels();
      if (mounted) setIsLoadingModels(false);
    })();
    return () => {
      mounted = false;
      stopCamera();
    };
  }, []);

  // Detection loop
  useEffect(() => {
    if (!isCameraReady || isLoadingModels) return;
    let animId: number;

    const runLoop = async () => {
      if (!videoRef.current || !canvasRef.current) {
        animId = requestAnimationFrame(runLoop);
        return;
      }

      const now = Date.now();
      if (now < cooldownUntilRef.current || isDetectingRef.current || now - lastDetectionTimeRef.current < DETECTION_THROTTLE_MS) {
        animId = requestAnimationFrame(runLoop);
        return;
      }

      isDetectingRef.current = true;
      lastDetectionTimeRef.current = now;

      try {
        const detection = await detectFaceFromVideo(videoRef.current);

        if (detection) {
          setDetectionStatus('ideal');

          // Draw bounding box onto canvas
          const canvas = canvasRef.current;
          if (canvas && videoRef.current) {
            const ctx = canvas.getContext('2d');
            if (ctx) {
              canvas.width = videoRef.current.videoWidth;
              canvas.height = videoRef.current.videoHeight;
              ctx.clearRect(0, 0, canvas.width, canvas.height);
              const { x, y, width, height } = detection.boundingBox;
              ctx.strokeStyle = 'rgba(52,211,153,0.85)';
              ctx.lineWidth = 3;
              ctx.shadowColor = 'rgba(52,211,153,0.6)';
              ctx.shadowBlur = 16;
              ctx.strokeRect(x, y, width, height);
            }
          }

          // Match with 3-frame verification
          const result = await findBestMatch(detection.descriptor, siswaList);
          if (result.success && result.siswa) {
            if (consecutiveMatchRef.current?.siswaId === result.siswa.id) {
              consecutiveMatchRef.current.count += 1;
            } else {
              consecutiveMatchRef.current = { siswaId: result.siswa.id, count: 1 };
            }
            setMatchProgress(consecutiveMatchRef.current.count);

            if (consecutiveMatchRef.current.count >= 3) {
              playSound('success');
              setFeedback({
                type: 'success',
                title: 'BERHASIL TERDETEKSI',
                message: result.siswa.nama,
                ts: Date.now(),
              });
              setDetectionStatus('no_face');
              setMatchProgress(0);
              cooldownUntilRef.current = Date.now() + 2500;
              onMatchSuccess(result.siswa);
              consecutiveMatchRef.current = null;
              setTimeout(() => setFeedback(null), 3000);
            }
          } else {
            consecutiveMatchRef.current = null;
            setMatchProgress(0);
          }
        } else {
          consecutiveMatchRef.current = null;
          setMatchProgress(0);
          setDetectionStatus('no_face');
          // Clear canvas
          const ctx = canvasRef.current?.getContext('2d');
          if (ctx && canvasRef.current) {
            ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
          }
        }
      } catch (err) {
        console.error('[FaceScanner] loop error:', err);
      } finally {
        isDetectingRef.current = false;
        animId = requestAnimationFrame(runLoop);
      }
    };

    animId = requestAnimationFrame(runLoop);
    animRef.current = animId;
    return () => cancelAnimationFrame(animId);
  }, [isCameraReady, isLoadingModels, siswaList, onMatchSuccess, playSound]);

  const handleSwitchCamera = async () => {
    if (cameras.length < 2 || isSwitchingCamera) return;
    setIsSwitchingCamera(true);
    try {
      const nextIndex = (currentCameraIndex + 1) % cameras.length;
      const nextCam = cameras[nextIndex];
      const newFacing: 'user' | 'environment' = isBackCamera ? 'user' : 'environment';
      setFacingMode(newFacing);
      await startCamera(nextCam?.deviceId, newFacing);
      setCurrentCameraIndex(nextIndex);
      setIsBackCamera(!isBackCamera);
    } catch (err) {
      console.error('[FaceScanner] Switch error:', err);
    } finally {
      setIsSwitchingCamera(false);
    }
  };

  const getFeedbackStyle = (type: FeedbackType) => {
    if (type === 'success') return 'bg-gradient-to-r from-emerald-500 to-emerald-600 border-emerald-400 shadow-emerald-500/40';
    if (type === 'unmatched') return 'bg-gradient-to-r from-rose-500 to-rose-600 border-rose-400 shadow-rose-500/40';
    return 'bg-gradient-to-r from-amber-500 to-amber-600 border-amber-400 shadow-amber-500/40';
  };

  const getFeedbackIcon = (type: FeedbackType) => {
    if (type === 'success') return <CheckCircle className="w-9 h-9" />;
    if (type === 'unmatched') return <XCircle className="w-9 h-9" />;
    return <AlertTriangle className="w-8 h-8" />;
  };

  return (
    <div className="fixed inset-0 z-[200] bg-black flex flex-col overflow-hidden">
      {/* Fullscreen video */}
      <video
        ref={videoRef}
        playsInline
        muted
        className="absolute inset-0 w-full h-full object-cover"
      />

      {/* Overlay canvas (bounding box) */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none z-10"
      />

      {/* ── TOP GRADIENT HEADER ── */}
      <div className="absolute top-0 inset-x-0 z-30 bg-gradient-to-b from-black/90 via-black/60 to-transparent pt-safe pt-8 pb-6 px-5 md:px-10">
        <div className="flex items-center justify-between">
          {/* Left: icon + title */}
          <div className="flex items-center gap-3 md:gap-5">
            <div className="w-12 h-12 md:w-14 md:h-14 rounded-2xl bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center shadow-lg shadow-purple-900/50 flex-shrink-0">
              <ScanFace className="w-6 h-6 md:w-7 md:h-7 text-white" />
            </div>
            <div>
              <h2 className="font-extrabold text-white text-lg md:text-xl leading-tight">{title}</h2>
              <p className="text-white/50 text-xs md:text-sm">{subtitle}</p>
            </div>
          </div>

          {/* Right: camera switch + close */}
          <div className="flex items-center gap-2 md:gap-3">
            {cameras.length > 1 && (
              <motion.button
                whileTap={{ scale: 0.92 }}
                onClick={handleSwitchCamera}
                disabled={isSwitchingCamera}
                title="Ganti Kamera"
                className="w-11 h-11 md:w-14 md:h-14 rounded-xl md:rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center text-white border border-white/15 hover:bg-white/20 transition-all disabled:opacity-50"
              >
                {isSwitchingCamera
                  ? <Loader2 className="w-5 h-5 md:w-6 md:h-6 animate-spin" />
                  : <ArrowRightLeft className="w-5 h-5 md:w-6 md:h-6" />
                }
              </motion.button>
            )}
            <motion.button
              whileTap={{ scale: 0.92 }}
              onClick={onClose}
              title="Tutup Scanner"
              className="w-11 h-11 md:w-14 md:h-14 rounded-xl md:rounded-2xl bg-red-500/80 backdrop-blur-md flex items-center justify-center text-white border border-red-400/30 hover:bg-red-600 transition-all shadow-lg shadow-red-900/40"
            >
              <X className="w-5 h-5 md:w-6 md:h-6" />
            </motion.button>
          </div>
        </div>

        {/* Status dot + label */}
        <div className="flex items-center gap-2 mt-4">
          <div className={`w-2.5 h-2.5 rounded-full transition-all ${
            detectionStatus === 'ideal'
              ? 'bg-emerald-400 shadow-lg shadow-emerald-400 animate-pulse'
              : isLoadingModels || !isCameraReady
              ? 'bg-amber-400 animate-pulse'
              : 'bg-white/25'
          }`} />
          <span className="text-white/60 text-sm font-medium">
            {isLoadingModels
              ? 'Memuat model AI...'
              : !isCameraReady
              ? 'Menghubungkan kamera...'
              : matchProgress > 0
              ? <span className="text-emerald-400 font-bold">Mendeteksi {matchProgress}/3...</span>
              : detectionStatus === 'ideal'
              ? 'Wajah terdeteksi'
              : 'Posisikan wajah di area scan'
            }
          </span>
        </div>

        {/* Progress bars */}
        {matchProgress > 0 && (
          <div className="flex items-center gap-1.5 mt-3">
            {[0, 1, 2].map(i => (
              <motion.div
                key={i}
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                className={`h-1.5 flex-1 rounded-full origin-left transition-colors ${
                  i < matchProgress
                    ? 'bg-gradient-to-r from-emerald-400 to-emerald-500 shadow-lg shadow-emerald-400/60'
                    : 'bg-white/15'
                }`}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── CENTRE AREA ── */}
      <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
        <AnimatePresence mode="wait">
          {/* Loading spinner */}
          {(isLoadingModels || !isCameraReady) && !cameraError && (
            <motion.div
              key="loading"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="flex flex-col items-center gap-4"
            >
              <div className="relative">
                <div className="w-20 h-20 rounded-3xl bg-purple-500/20 flex items-center justify-center">
                  <Loader2 className="w-10 h-10 text-purple-300 animate-spin" />
                </div>
                <div className="absolute inset-0 rounded-3xl bg-purple-400/20 animate-ping" />
              </div>
              <p className="text-white/50 text-sm">Memuat scanner wajah...</p>
            </motion.div>
          )}

          {/* Camera error */}
          {cameraError && (
            <motion.div
              key="error"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center gap-4 px-8 text-center"
            >
              <div className="w-20 h-20 rounded-full bg-rose-500/20 flex items-center justify-center">
                <ShieldAlert className="w-10 h-10 text-rose-400" />
              </div>
              <p className="text-white/70 text-sm">{cameraError}</p>
              <button
                onClick={() => startCamera()}
                className="px-6 py-2.5 bg-white/10 text-white rounded-xl hover:bg-white/20 text-sm font-semibold transition-all pointer-events-auto"
              >
                Coba Lagi
              </button>
            </motion.div>
          )}

          {/* Idle guide — no face */}
          {!isLoadingModels && isCameraReady && !cameraError && detectionStatus === 'no_face' && matchProgress === 0 && (
            <motion.div
              key="guide"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-3"
            >
              {/* Oval face guide frame */}
              <div className="w-52 h-72 md:w-64 md:h-80 border-2 border-dashed border-white/30 rounded-[50%] flex items-center justify-center">
                <ScanFace className="w-14 h-14 text-white/20" />
              </div>
              <p className="text-white/40 text-sm mt-2">Posisikan wajah di dalam area</p>
            </motion.div>
          )}

          {/* Active scan frame — face detected */}
          {!isLoadingModels && isCameraReady && detectionStatus === 'ideal' && (
            <motion.div
              key="scanning"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="relative w-56 h-72 md:w-72 md:h-96"
            >
              {/* Scan box */}
              <div className="absolute inset-0 rounded-3xl border-2 border-emerald-400/70 shadow-[0_0_40px_rgba(52,211,153,0.35)]" />
              {/* Animated scan line */}
              <motion.div
                className="absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_15px_rgba(52,211,153,0.8)]"
                animate={{ top: ['8%', '92%', '8%'] }}
                transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
              />
              {/* Pulsing border */}
              <motion.div
                className="absolute inset-0 rounded-3xl border-2 border-emerald-400/30"
                animate={{
                  borderColor: ['rgba(52,211,153,0.2)', 'rgba(52,211,153,0.7)', 'rgba(52,211,153,0.2)'],
                  boxShadow: ['0 0 20px rgba(52,211,153,0.1)', '0 0 50px rgba(52,211,153,0.4)', '0 0 20px rgba(52,211,153,0.1)'],
                }}
                transition={{ duration: 1.8, repeat: Infinity }}
              />
              {/* Corner markers */}
              {['top-0 left-0 border-t-4 border-l-4 rounded-tl-2xl',
                'top-0 right-0 border-t-4 border-r-4 rounded-tr-2xl',
                'bottom-0 left-0 border-b-4 border-l-4 rounded-bl-2xl',
                'bottom-0 right-0 border-b-4 border-r-4 rounded-br-2xl'
              ].map((cls, i) => (
                <div key={i} className={`absolute w-6 h-6 border-emerald-400 ${cls}`} />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── BOTTOM GRADIENT + FEEDBACK CARD ── */}
      <div className="absolute bottom-0 inset-x-0 z-40 pb-10 pt-6 px-5 md:px-10 bg-gradient-to-t from-black/85 via-black/50 to-transparent">
        <AnimatePresence mode="wait">
          {feedback ? (
            <motion.div
              key={feedback.ts}
              initial={{ y: 100, opacity: 0, scale: 0.9 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 30, opacity: 0, scale: 0.95 }}
              transition={{ type: 'spring', damping: 22, stiffness: 280 }}
              className={`w-full max-w-md mx-auto rounded-2xl md:rounded-3xl p-5 md:p-6 border shadow-2xl backdrop-blur-xl text-white ${getFeedbackStyle(feedback.type)}`}
            >
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center flex-shrink-0">
                  {getFeedbackIcon(feedback.type)}
                </div>
                <div className="min-w-0">
                  <p className="font-black text-xs uppercase tracking-widest opacity-80">{feedback.title}</p>
                  <p className="font-extrabold text-lg md:text-xl truncate mt-0.5">{feedback.message}</p>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center text-white/35 text-xs md:text-sm"
            >
              {isLoadingModels ? 'Memuat sistem...' : 'Sistem siap memindai wajah'}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
