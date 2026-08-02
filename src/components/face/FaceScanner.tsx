import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, 
  ScanFace, 
  CheckCircle2, 
  AlertTriangle, 
  Camera, 
  Loader2, 
  ShieldAlert, 
  RotateCw, 
  UserCheck, 
  UserX,
  Sparkles,
  Volume2
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

export default function FaceScanner({
  siswaList,
  onMatchSuccess,
  onClose,
  title = "Pindai Wajah Siswa (AI)",
  subtitle = "Arahkan wajah siswa ke depan kamera untuk mendeteksi secara otomatis"
}: FaceScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const isDetectingRef = useRef(false);
  const cooldownUntilRef = useRef<number>(0);

  const [isLoadingModels, setIsLoadingModels] = useState(true);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  
  const [detectionStatus, setDetectionStatus] = useState<'idle' | 'detecting' | 'matched' | 'unmatched'>('idle');
  const [lastMatchResult, setLastMatchResult] = useState<MatchResult | null>(null);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');

  // Play audio beep feedback
  const playSound = useCallback((type: 'success' | 'fail') => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);

      if (type === 'success') {
        osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
        osc.frequency.setValueAtTime(880, audioCtx.currentTime + 0.1); // A5
        gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
        osc.start(audioCtx.currentTime);
        osc.stop(audioCtx.currentTime + 0.3);
      } else {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(220, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.25, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.25);
        osc.start(audioCtx.currentTime);
        osc.stop(audioCtx.currentTime + 0.25);
      }
    } catch (e) {
      // Audio not supported or blocked
    }
  }, []);

  // Initialize face-api models
  useEffect(() => {
    let mounted = true;
    (async () => {
      setIsLoadingModels(true);
      const ok = await loadModels();
      if (mounted) {
        setIsLoadingModels(false);
        if (!ok) {
          setCameraError('Gagal memuat model AI Pengenalan Wajah. Periksa koneksi internet Anda.');
        }
      }
    })();
    return () => {
      mounted = false;
      stopCamera();
    };
  }, []);

  // Enumerate cameras & start camera stream
  const startCamera = useCallback(async (deviceId?: string) => {
    stopCamera();
    setIsCameraReady(false);
    setCameraError(null);

    try {
      const constraints: MediaStreamConstraints = {
        video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setIsCameraReady(true);
      }

      // Enumerate available video inputs
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = devices.filter(d => d.kind === 'videoinput');
      setCameras(videoInputs);
      if (videoInputs.length > 0 && !selectedCameraId) {
        const activeTrack = stream.getVideoTracks()[0];
        const settings = activeTrack.getSettings ? activeTrack.getSettings() : null;
        if (settings?.deviceId) {
          setSelectedCameraId(settings.deviceId);
        }
      }
    } catch (err: any) {
      console.error('[FaceScanner] Camera error:', err);
      setCameraError('Gagal mengakses kamera. Mohon izinkan akses kamera pada browser Anda.');
    }
  }, [selectedCameraId]);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    isDetectingRef.current = false;
  };

  useEffect(() => {
    if (!isLoadingModels && !cameraError) {
      startCamera(selectedCameraId);
    }
  }, [isLoadingModels, selectedCameraId]);

  // Main Detection Loop
  useEffect(() => {
    let animId: number;

    const runDetectionLoop = async () => {
      if (!isCameraReady || !videoRef.current || isDetectingRef.current) {
        animId = requestAnimationFrame(runDetectionLoop);
        return;
      }

      // Respect cooldown
      if (Date.now() < cooldownUntilRef.current) {
        animId = requestAnimationFrame(runDetectionLoop);
        return;
      }

      isDetectingRef.current = true;
      setDetectionStatus('detecting');

      try {
        const video = videoRef.current;
        const detection = await detectFaceFromVideo(video);

        if (detection && canvasRef.current) {
          // Draw bounding box on overlay canvas
          const canvas = canvasRef.current;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            const { x, y, width, height } = detection.boundingBox;
            ctx.strokeStyle = '#8b5cf6';
            ctx.lineWidth = 3;
            ctx.strokeRect(x, y, width, height);
          }

          // Perform matching
          const result = await findBestMatch(detection.descriptor, siswaList);
          setLastMatchResult(result);

          if (result.success && result.siswa) {
            setDetectionStatus('matched');
            playSound('success');
            cooldownUntilRef.current = Date.now() + 2500; // 2.5s cooldown
            onMatchSuccess(result.siswa);
          } else {
            setDetectionStatus('unmatched');
            cooldownUntilRef.current = Date.now() + 1500; // 1.5s retry
          }
        } else {
          setDetectionStatus('idle');
          if (canvasRef.current) {
            const ctx = canvasRef.current.getContext('2d');
            if (ctx) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
          }
        }
      } catch (err) {
        console.error('[FaceScanner] Loop error:', err);
      } finally {
        isDetectingRef.current = false;
        animId = requestAnimationFrame(runDetectionLoop);
      }
    };

    if (isCameraReady) {
      animId = requestAnimationFrame(runDetectionLoop);
    }

    return () => {
      if (animId) cancelAnimationFrame(animId);
    };
  }, [isCameraReady, siswaList, onMatchSuccess, playSound]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-950/70 backdrop-blur-md p-4 animate-fade-in">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden border border-brand-100 flex flex-col"
      >
        {/* Modal Header */}
        <div className="p-5 brand-gradient text-white flex items-center justify-between shadow-md">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-2xl backdrop-blur-sm">
              <ScanFace className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="font-extrabold text-base sm:text-lg leading-tight drop-shadow-xs">{title}</h3>
              <p className="text-xs text-white/80 font-medium leading-normal">{subtitle}</p>
            </div>
          </div>
          <button
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="p-2 hover:bg-white/20 rounded-xl transition-colors text-white cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content / Video Container */}
        <div className="p-5 flex-1 flex flex-col items-center justify-center space-y-4">
          <div className="relative w-full aspect-4/3 bg-slate-900 rounded-2xl overflow-hidden shadow-inner flex items-center justify-center border-2 border-brand-200">
            {isLoadingModels && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-brand-900/90 text-white p-4 text-center space-y-3">
                <Loader2 className="w-10 h-10 animate-spin text-brand-300" />
                <p className="text-sm font-semibold">Memuat Model AI Pengenalan Wajah...</p>
                <p className="text-xs text-white/70">Mohon tunggu beberapa detik saat mengunduh bobot AI.</p>
              </div>
            )}

            {cameraError && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-rose-950/90 text-rose-100 p-6 text-center space-y-3">
                <ShieldAlert className="w-12 h-12 text-rose-400 animate-bounce" />
                <p className="text-sm font-bold text-rose-200">{cameraError}</p>
                <button
                  onClick={() => startCamera(selectedCameraId)}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer"
                >
                  Coba Lagi Kamera
                </button>
              </div>
            )}

            {/* Video stream */}
            <video
              ref={videoRef}
              playsInline
              muted
              className="w-full h-full object-cover transform -scale-x-100"
            />

            {/* Overlay Canvas for face bounding box */}
            <canvas
              ref={canvasRef}
              className="absolute inset-0 w-full h-full pointer-events-none transform -scale-x-100 z-10"
            />

            {/* Target Scanning Oval Guide */}
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-10">
              <div className={`w-48 h-64 sm:w-56 sm:h-72 border-2 border-dashed rounded-[50%] transition-all duration-300 ${
                detectionStatus === 'matched'
                  ? 'border-emerald-400 bg-emerald-500/10 shadow-[0_0_30px_rgba(52,211,153,0.5)]'
                  : detectionStatus === 'unmatched'
                  ? 'border-rose-400 bg-rose-500/10'
                  : 'border-brand-400/70 bg-brand-500/5 animate-pulse'
              }`} />
            </div>

            {/* Detection Match Banner Overlay */}
            <AnimatePresence>
              {lastMatchResult && detectionStatus === 'matched' && lastMatchResult.siswa && (
                <motion.div
                  initial={{ y: 50, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: 50, opacity: 0 }}
                  className="absolute bottom-3 left-3 right-3 z-30 p-3.5 bg-emerald-600/95 backdrop-blur-md text-white rounded-2xl shadow-xl flex items-center gap-3 border border-emerald-400"
                >
                  {lastMatchResult.siswa.foto_url ? (
                    <img 
                      src={lastMatchResult.siswa.foto_url} 
                      className="w-11 h-11 rounded-xl object-cover border-2 border-white/40 shadow-sm shrink-0" 
                      alt="Avatar" 
                    />
                  ) : (
                    <div className="w-11 h-11 bg-white/20 rounded-xl flex items-center justify-center shrink-0">
                      <UserCheck className="w-6 h-6 text-white" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-200 shrink-0" />
                      <span className="text-xs font-bold text-emerald-100 uppercase tracking-wider">Terdeteksi Tepat!</span>
                    </div>
                    <p className="font-extrabold text-sm truncate text-white">{lastMatchResult.siswa.nama}</p>
                    <p className="text-[11px] text-emerald-100 font-medium">Kelas: {lastMatchResult.siswa.kelas} • NIS: {lastMatchResult.siswa.nis}</p>
                  </div>
                </motion.div>
              )}

              {lastMatchResult && detectionStatus === 'unmatched' && (
                <motion.div
                  initial={{ y: 50, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: 50, opacity: 0 }}
                  className="absolute bottom-3 left-3 right-3 z-30 p-3 bg-amber-600/95 backdrop-blur-md text-white rounded-2xl shadow-xl flex items-center gap-3 border border-amber-400"
                >
                  <UserX className="w-6 h-6 text-amber-200 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-xs text-amber-100">Wajah Belum Terdaftar / Tidak Dikenali</p>
                    <p className="text-[10.5px] text-white/80">Posisikan wajah lebih jelas atau daftarkan foto siswa di menu Kelola Siswa.</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Camera Selection & Info Controls */}
          <div className="w-full flex items-center justify-between gap-3 text-xs">
            {cameras.length > 1 ? (
              <div className="flex items-center gap-2 flex-1">
                <Camera className="w-4 h-4 text-brand-600 shrink-0" />
                <select
                  value={selectedCameraId}
                  onChange={(e) => {
                    setSelectedCameraId(e.target.value);
                    startCamera(e.target.value);
                  }}
                  className="w-full py-2 px-3 bg-brand-50 border border-brand-200 rounded-xl text-brand-900 font-medium focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  {cameras.map((cam, idx) => (
                    <option key={cam.deviceId || idx} value={cam.deviceId}>
                      {cam.label || `Kamera ${idx + 1}`}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-brand-700 font-medium text-xs">
                <Sparkles className="w-4 h-4 text-brand-500" />
                <span>Kamera Aktif • Deteksi Realtime AI ($d &lt; 0.55$)</span>
              </div>
            )}

            <button
              onClick={() => startCamera(selectedCameraId)}
              title="Refresh Kamera"
              className="p-2 bg-brand-50 hover:bg-brand-100 border border-brand-200 text-brand-700 rounded-xl transition-colors cursor-pointer"
            >
              <RotateCw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
