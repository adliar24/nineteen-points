import React, { useRef, useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Html5Qrcode, CameraDevice, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import {
  X,
  QrCode,
  ScanLine,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Loader2,
  ShieldAlert,
  ArrowRightLeft,
  Check,
} from 'lucide-react';

export interface QrScanFeedback {
  type: 'success' | 'duplicate' | 'not_found';
  title: string;
  message: string;
  kelas?: string;
  fotoUrl?: string;
}

interface QrScannerProps {
  onScanSuccess: (decodedText: string) => QrScanFeedback | Promise<QrScanFeedback> | null | void;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  batchCount?: number;
  onBatchConfirm?: () => void;
}

interface Feedback extends QrScanFeedback {
  ts: number;
}

const FEEDBACK_DURATION_MS = 3000;
const SCAN_COOLDOWN_MS = 1500;

let scannerIdCounter = 0;

export default function QrScanner({
  onScanSuccess,
  onClose,
  title = 'Scan QR',
  subtitle = 'Pindai Kartu Murid',
  batchCount,
  onBatchConfirm,
}: QrScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const elementIdRef = useRef(`qr-scanner-${++scannerIdCounter}`);
  const lastScannedRef = useRef<string>('');
  const cooldownUntilRef = useRef<number>(0);
  const isProcessingRef = useRef(false);
  const mountedRef = useRef(true);

  const [isStarting, setIsStarting] = useState(true);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const [cameras, setCameras] = useState<CameraDevice[]>([]);
  const [currentCameraIndex, setCurrentCameraIndex] = useState(0);
  const [isSwitchingCamera, setIsSwitchingCamera] = useState(false);

  const onScanSuccessRef = useRef(onScanSuccess);
  useEffect(() => {
    onScanSuccessRef.current = onScanSuccess;
  });

  const playBeep = useCallback(() => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.2);
    } catch {
      // Audio context might be restricted, fail silently
    }
  }, []);

  const clearFeedbackTimerRef = useRef<number | null>(null);

  const showFeedback = useCallback((next: QrScanFeedback, ts: number) => {
    setFeedback({ ...next, ts });
    if (clearFeedbackTimerRef.current) window.clearTimeout(clearFeedbackTimerRef.current);
    clearFeedbackTimerRef.current = window.setTimeout(() => {
      setFeedback((prev) => (prev && prev.ts === ts ? null : prev));
    }, FEEDBACK_DURATION_MS);
  }, []);

  const stopScanner = useCallback(() => {
    const s = scannerRef.current;
    if (!s) return;
    scannerRef.current = null;
    try {
      s.stop()
        .then(() => {
          try {
            s.clear();
          } catch {
            // ignore
          }
        })
        .catch(() => {
          try {
            s.clear();
          } catch {
            // ignore
          }
        });
    } catch {
      try {
        s.clear();
      } catch {
        // ignore
      }
    }
  }, []);

  const listCameras = useCallback(async () => {
    try {
      const devices = await Html5Qrcode.getCameras();
      const filtered = devices.filter((d) => !/(virtual|obs|snap|epoc|droidcam|xsplit|iriun|vdo)/i.test(d.label));
      setCameras(filtered);
    } catch {
      // Camera enumeration not supported
    }
  }, []);

  const handleDecoded = useCallback(async (decodedText: string) => {
    const trimmed = decodedText.trim();
    const now = Date.now();
    const isSameQr = trimmed === lastScannedRef.current;
    if (isProcessingRef.current || (isSameQr && now < cooldownUntilRef.current)) {
      return;
    }
    isProcessingRef.current = true;
    lastScannedRef.current = trimmed;
    window.setTimeout(() => {
      if (lastScannedRef.current === trimmed) lastScannedRef.current = '';
    }, SCAN_COOLDOWN_MS);
    try {
      const result = await onScanSuccessRef.current(trimmed);
      if (result) {
        if (result.type === 'success') playBeep();
        cooldownUntilRef.current = now + SCAN_COOLDOWN_MS;
        showFeedback(result, now);
      }
    } catch (err) {
      console.error('[QrScanner] scan processing error:', err);
      showFeedback(
        { type: 'not_found', title: 'KESALAHAN', message: 'Gagal memproses QR code.' },
        now
      );
    } finally {
      isProcessingRef.current = false;
    }
  }, [playBeep, showFeedback]);

  const startScanner = useCallback(async (deviceId?: string) => {
    setCameraError(null);
    setIsStarting(true);
    try {
      const scanner = new Html5Qrcode(elementIdRef.current, {
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        verbose: false
      });
      scannerRef.current = scanner;
      await scanner.start(
        deviceId ? { deviceId } : { facingMode: 'environment' },
        {
          fps: 20,
          qrbox: { width: 240, height: 240 },
          disableFlip: true,
          experimentalFeatures: {
            useBarCodeDetectorIfSupported: true,
          },
          videoConstraints: {
            width: { ideal: 640 },
            height: { ideal: 480 },
          },
        } as any,
        handleDecoded,
        () => {}
      );
      if (!mountedRef.current) return;
      setIsStarting(false);
      setIsCameraReady(true);
      listCameras();
    } catch (err) {
      console.error('[QrScanner] start failed:', err);
      if (!mountedRef.current) return;
      setCameraError('Gagal mengaktifkan kamera. Berikan izin kamera pada browser.');
      setIsStarting(false);
      setIsCameraReady(false);
    }
  }, [handleDecoded, listCameras]);

  useEffect(() => {
    mountedRef.current = true;
    const timer = window.setTimeout(() => {
      startScanner();
    }, 400);

    return () => {
      mountedRef.current = false;
      window.clearTimeout(timer);
      if (clearFeedbackTimerRef.current) window.clearTimeout(clearFeedbackTimerRef.current);
      stopScanner();
    };
  }, [startScanner, stopScanner]);

  const handleSwitchCamera = async () => {
    if (cameras.length < 2 || isSwitchingCamera) return;
    setIsSwitchingCamera(true);
    try {
      const nextIndex = (currentCameraIndex + 1) % cameras.length;
      stopScanner();
      await startScanner(cameras[nextIndex].id);
      if (!mountedRef.current) return;
      setCurrentCameraIndex(nextIndex);
    } catch (err) {
      console.error('[QrScanner] switch camera error:', err);
      if (!mountedRef.current) return;
      setCameraError('Gagal mengganti kamera.');
    } finally {
      if (mountedRef.current) setIsSwitchingCamera(false);
    }
  };

  const getFeedbackStyle = (type: QrScanFeedback['type']) => {
    if (type === 'success') return 'bg-gradient-to-r from-emerald-500 to-emerald-600 border-emerald-400 shadow-emerald-500/40';
    if (type === 'duplicate') return 'bg-gradient-to-r from-amber-500 to-amber-600 border-amber-400 shadow-amber-500/40';
    return 'bg-gradient-to-r from-rose-500 to-rose-600 border-rose-400 shadow-rose-500/40';
  };

  const getFeedbackIcon = (type: QrScanFeedback['type']) => {
    if (type === 'success') return <CheckCircle className="w-9 h-9" />;
    if (type === 'duplicate') return <AlertTriangle className="w-8 h-8" />;
    return <XCircle className="w-9 h-9" />;
  };

  return createPortal(
    <div className="fixed inset-0 z-[99999] bg-black flex flex-col overflow-hidden">
      {/* Html5Qrcode renders the live camera stream into this container */}
      <div
        id={elementIdRef.current}
        className="absolute inset-0 w-full h-full [&_video]:w-full [&_video]:h-full [&_video]:object-cover"
      />

      {/* ── TOP GRADIENT HEADER ── */}
      <div className="absolute top-0 inset-x-0 z-30 bg-gradient-to-b from-black/90 via-black/60 to-transparent pt-safe pt-8 pb-6 px-5 md:px-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 md:gap-5">
            <div className="w-12 h-12 md:w-14 md:h-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-900/50 flex-shrink-0">
              <QrCode className="w-6 h-6 md:w-7 md:h-7 text-white" />
            </div>
            <div>
              <h2 className="font-extrabold text-white text-lg md:text-xl leading-tight">{title}</h2>
              <p className="text-white/50 text-xs md:text-sm">{subtitle}</p>
            </div>
          </div>

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
            isCameraReady && !isStarting
              ? 'bg-emerald-400 shadow-lg shadow-emerald-400 animate-pulse'
              : isStarting
              ? 'bg-amber-400 animate-pulse'
              : 'bg-white/25'
          }`} />
          <span className="text-white/60 text-sm font-medium">
            {isStarting
              ? 'Menghubungkan kamera...'
              : isCameraReady
              ? 'Sistem siap memindai QR'
              : 'Kamera tidak tersedia'}
          </span>
        </div>
      </div>

      {/* ── CENTRE AREA ── */}
      <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
        <AnimatePresence mode="wait">
          {/* Loading spinner */}
          {(isStarting || !isCameraReady) && !cameraError && (
            <motion.div
              key="loading"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="flex flex-col items-center gap-4"
            >
              <div className="relative">
                <div className="w-20 h-20 rounded-3xl bg-emerald-500/20 flex items-center justify-center">
                  <Loader2 className="w-10 h-10 text-emerald-300 animate-spin" />
                </div>
                <div className="absolute inset-0 rounded-3xl bg-emerald-400/20 animate-ping" />
              </div>
              <p className="text-white/50 text-sm">Menyiapkan kamera...</p>
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
                onClick={() => startScanner()}
                className="px-6 py-2.5 bg-white/10 text-white rounded-xl hover:bg-white/20 text-sm font-semibold transition-all pointer-events-auto"
              >
                Coba Lagi
              </button>
            </motion.div>
          )}

          {/* Idle guide — scanner ready */}
          {!isStarting && isCameraReady && !cameraError && (
            <motion.div
              key="guide"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="relative w-64 h-64 md:w-72 md:h-72"
            >
              {/* Scan box */}
              <div className="absolute inset-0 rounded-3xl border-2 border-white/20 bg-white/5" />
              {/* Animated scan line */}
              <motion.div
                className="absolute left-4 right-4 h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_15px_rgba(52,211,153,0.8)]"
                animate={{ top: ['8%', '92%', '8%'] }}
                transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
              />
              {/* Corner markers */}
              {[
                'top-0 left-0 border-t-4 border-l-4 rounded-tl-2xl',
                'top-0 right-0 border-t-4 border-r-4 rounded-tr-2xl',
                'bottom-0 left-0 border-b-4 border-l-4 rounded-bl-2xl',
                'bottom-0 right-0 border-b-4 border-r-4 rounded-br-2xl',
              ].map((cls, i) => (
                <div key={i} className={`absolute w-6 h-6 border-emerald-400 ${cls}`} />
              ))}
              {/* Center hint */}
              <div className="absolute inset-0 flex flex-col items-center justify-center text-white/50">
                <ScanLine className="w-10 h-10" />
                <p className="text-xs font-semibold mt-3">Arahkan QR ke dalam bingkai</p>
              </div>
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
                {(feedback.type === 'success' || feedback.type === 'duplicate') && feedback.fotoUrl ? (
                  <img
                    src={feedback.fotoUrl}
                    className="w-14 h-14 rounded-2xl object-cover border border-white/20 flex-shrink-0 shadow-lg"
                    alt={feedback.message}
                  />
                ) : (
                  <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center flex-shrink-0">
                    {getFeedbackIcon(feedback.type)}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-black text-xs uppercase tracking-widest opacity-80">{feedback.title}</p>
                  <p className="font-extrabold text-base md:text-lg truncate mt-0.5">{feedback.message}</p>
                  {feedback.kelas && (
                    <p className="text-xs text-white/70 font-semibold uppercase mt-0.5">{feedback.kelas}</p>
                  )}
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center text-white/35 text-xs md:text-sm"
            >
              {isStarting ? 'Menyiapkan sistem...' : 'Arahkan QR kartu murid ke kamera'}
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      {onBatchConfirm && (
        <div className="fixed bottom-36 inset-x-0 flex justify-center pointer-events-auto z-[60]">
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={onBatchConfirm}
            className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 border border-emerald-400/40 text-white rounded-full font-black text-xs shadow-xl flex items-center gap-3 transition-colors cursor-pointer"
          >
            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-white/20 text-white font-extrabold text-[10px]">
              {batchCount || 0}
            </span>
            <span>Selesai & Terapkan</span>
            <Check className="w-3.5 h-3.5 text-white" />
          </motion.button>
        </div>
      )}
    </div>,
    document.body
  );
}
