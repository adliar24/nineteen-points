import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, ScanFace, CheckCircle, XCircle, AlertTriangle, ArrowRightLeft, Loader2, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import * as faceapi from 'face-api.js';
import { initDB } from '../../services/db';
import { loadModels, findBestMatchFromLocal } from '../../services/face';

const MODEL_URL = '/models';
const MATCH_COOLDOWN = 2500;
const NO_MATCH_COOLDOWN = 3000;
const REQUIRED_CONSECUTIVE_MATCHES = 1;
const FEEDBACK_DURATION = 3000;
const DETECTION_INTERVAL = 250;
const MATCH_THRESHOLD = 0.7;

interface FaceScannerProps {
  classId: string;
  className?: string;
  sessionTopic?: string;
  onMatchSuccess: (studentId: string, studentName: string) => void;
  onCancel: () => void;
}

type FeedbackType = 'success' | 'late' | 'warning' | 'error' | 'already';

interface Feedback {
  type: FeedbackType;
  title: string;
  message: string;
  timestamp: number;
}

export default function FaceScanner({ classId, className, sessionTopic, onMatchSuccess, onCancel }: FaceScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationRef = useRef<number | null>(null);
  const isDetectingRef = useRef(false);
  const cooldownUntilRef = useRef<number>(0);
  const lastDetectionTimeRef = useRef(0);
  const lastNoMatchRef = useRef(0);
  const successfullyMatchedRef = useRef<Set<string>>(new Set());
  const consecutiveMatchRef = useRef<{ studentId: string; studentName: string; count: number } | null>(null);
  const consecutiveNoMatchRef = useRef<number>(0);
  const feedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isModelLoadedRef = useRef(false);

  const [isInitializing, setIsInitializing] = useState(true);
  const [isModelsReady, setIsModelsReady] = useState(false);
  const [isError, setIsError] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [detectionStatus, setDetectionStatus] = useState<'no_face' | 'detecting' | 'ideal'>('no_face');
  const [matchProgress, setMatchProgress] = useState(0);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [currentCameraIndex, setCurrentCameraIndex] = useState(0);
  const [isBackCamera, setIsBackCamera] = useState(false);
  const [isSwitchingCamera, setIsSwitchingCamera] = useState(false);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);

  useEffect(() => {
    initModels();
    return cleanup;
  }, []);

  useEffect(() => {
    if (!isModelsReady) return;
    initCamera();
  }, [isModelsReady]);

  const initCamera = async () => {
    try {
      // 1. Get generic stream first to prompt for permissions
      // Request front camera ('user') first as requested
      let stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false
      }).catch(async (e) => {
        // Fallback to environment facing if user camera is not available
        return await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false
        });
      });
      
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play().catch(() => {});
          startDetection();
        };
      }

      // 2. Enumerate devices now that permission is granted
      const devices = await navigator.mediaDevices.enumerateDevices();
      const rawCams = devices.filter(d => d.kind === 'videoinput');
      
      const uniqueDevices: MediaDeviceInfo[] = [];
      const seenIds = new Set<string>();
      const seenLabels = new Set<string>();
      
      for (const d of rawCams) {
        if (/(virtual|obs|snap|epoc|droidcam|xsplit|iriun|vdo)/i.test(d.label)) continue;
        
        if (d.deviceId) {
          if (seenIds.has(d.deviceId)) continue;
          if (d.label) {
             if (seenLabels.has(d.label)) continue;
             seenLabels.add(d.label);
          }
          
          seenIds.add(d.deviceId);
          uniqueDevices.push(d);
        } else {
          if (uniqueDevices.length === 0) {
             uniqueDevices.push(d);
          }
        }
      }
      
      setCameras(uniqueDevices);
      
      if (uniqueDevices.length > 0) {
        const streamTrack = stream.getVideoTracks()[0];
        const settings = streamTrack.getSettings ? streamTrack.getSettings() : null;
        let activeId = settings?.deviceId;
        
        let activeIndex = uniqueDevices.findIndex(d => d.deviceId === activeId);
        if (activeIndex === -1) activeIndex = 0;
        
        setCurrentCameraIndex(activeIndex);
        setIsBackCamera(uniqueDevices[activeIndex]?.label.toLowerCase().includes('back') || false);
      }
    } catch (err) {
      console.error('Camera error:', err);
      setIsError(true);
      setErrorMsg('Gagal mengakses kamera. Mohon izinkan akses kamera.');
    }
  };

  useEffect(() => {
    if (cooldownUntilRef.current > 0) {
      const interval = setInterval(() => {
        const remaining = Math.max(0, Math.ceil((cooldownUntilRef.current - Date.now()) / 1000));
        setCooldownRemaining(remaining);
        if (remaining === 0) {
          setDetectionStatus('no_face');
          clearInterval(interval);
        }
      }, 200);
      return () => clearInterval(interval);
    }
  }, [cooldownUntilRef.current]);

  const startCamera = async (deviceIndex: number) => {
    if (!cameras[deviceIndex]) return;
    try {
      const deviceId = cameras[deviceIndex].deviceId;
      const videoConstraints: MediaTrackConstraints = { width: { ideal: 640 }, height: { ideal: 480 } };
      
      if (deviceId) {
        videoConstraints.deviceId = { exact: deviceId };
      } else {
        videoConstraints.facingMode = 'user';
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: false
      });
      
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play().catch(() => {});
          startDetection();
        };
      }
    } catch (err) {
      console.error('Camera switch error:', err);
    }
  };

  const initModels = async () => {
    try {
      const loaded = await loadModels();
      if (loaded) {
        isModelLoadedRef.current = true;
        setIsModelsReady(true);
      } else {
        console.warn('[FaceScanner] Models failed to load - face scanning disabled');
        setIsError(true);
        setErrorMsg('Model wajah tidak tersedia. Pastikan file model ada di folder /models.');
      }
    } catch (err: any) {
      console.error('[FaceScanner] Failed to load models:', err);
      setIsError(true);
      setErrorMsg(err.message || 'Gagal menginisialisasi');
    } finally {
      setIsInitializing(false);
    }
  };

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
    
    setTimeout(() => { ctx.close(); }, (duration + delay + 0.2) * 1000);
  } catch (e) {
    console.error("Audio error", e);
  }
};

  const playSuccessSound = () => {
    playTone(1046.50, 'sine', 0.6, 0.8, 0); 
    playTone(1318.51, 'triangle', 0.6, 0.6, 0.05);
    playTone(1567.98, 'sine', 0.8, 0.4, 0.1);
  };

  const playWarningSound = () => {
    playTone(600, 'triangle', 0.1, 0.4, 0);
    playTone(600, 'triangle', 0.1, 0.4, 0.15);
  };

  const playErrorSound = () => {
    playTone(150, 'sawtooth', 0.3, 0.6, 0); 
    playTone(100, 'square', 0.3, 0.4, 0.1);
  };

  const playSound = (type: FeedbackType) => {
    switch (type) {
      case 'success':
      case 'late': playSuccessSound(); break;
      case 'warning':
      case 'already': playWarningSound(); break;
      case 'error': playErrorSound(); break;
    }
  };

  const showFeedback = (type: FeedbackType, title: string, message: string) => {
    setFeedback({ type, title, message, timestamp: Date.now() });
    playSound(type);
    
    if (feedbackTimeoutRef.current) {
      clearTimeout(feedbackTimeoutRef.current);
    }
    
    feedbackTimeoutRef.current = setTimeout(() => {
      setFeedback(null);
      feedbackTimeoutRef.current = null;
    }, FEEDBACK_DURATION);
  };

  const drawBoxOverlay = useCallback((ctx: CanvasRenderingContext2D, width: number, height: number, isIdeal: boolean = false) => {
    if (width <= 0 || height <= 0) return;
    
    ctx.clearRect(0, 0, width, height);
    
    if (!isIdeal) return;
    
    const centerX = width / 2;
    const centerY = height / 2;
    const boxWidth = Math.min(width * 0.7, 500);
    const boxHeight = Math.min(height * 0.65, 450);
    const x = centerX - boxWidth / 2;
    const y = centerY - boxHeight / 2;
    const cornerLength = 24;
    const cornerWidth = 4;
    
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    ctx.fillStyle = 'rgba(52, 211, 153, 0.15)';
    ctx.beginPath();
    ctx.roundRect(x, y, boxWidth, boxHeight, 8);
    ctx.fill();
    
    ctx.strokeStyle = 'rgba(52, 211, 153, 1)';
    ctx.shadowColor = 'rgba(52, 211, 153, 0.8)';
    ctx.shadowBlur = 15;
    ctx.lineWidth = cornerWidth;
    
    ctx.beginPath();
    ctx.moveTo(x + cornerLength, y);
    ctx.lineTo(x + 8, y);
    ctx.lineTo(x, y + 8);
    ctx.lineTo(x, y + cornerLength);
    
    ctx.moveTo(x + boxWidth - cornerLength, y);
    ctx.lineTo(x + boxWidth - 8, y);
    ctx.lineTo(x + boxWidth, y + 8);
    ctx.lineTo(x + boxWidth, y + cornerLength);
    
    ctx.moveTo(x + cornerLength, y + boxHeight);
    ctx.lineTo(x + 8, y + boxHeight);
    ctx.lineTo(x, y + boxHeight - 8);
    ctx.lineTo(x, y + boxHeight - cornerLength);
    
    ctx.moveTo(x + boxWidth - cornerLength, y + boxHeight);
    ctx.lineTo(x + boxWidth - 8, y + boxHeight);
    ctx.lineTo(x + boxWidth, y + boxHeight - 8);
    ctx.lineTo(x + boxWidth, y + boxHeight - cornerLength);
    
    ctx.stroke();
    ctx.shadowBlur = 0;
  }, []);

  const startDetection = () => {
    const video = videoRef.current;
    if (!video) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    
    const detect = async () => {
      if (!video || !video.videoWidth || video.paused || isDetectingRef.current) {
        animationRef.current = requestAnimationFrame(detect);
        return;
      }
      
      const now = Date.now();
      
      if (now - lastDetectionTimeRef.current < DETECTION_INTERVAL) {
        drawBoxOverlay(ctx, canvas.width, canvas.height);
        animationRef.current = requestAnimationFrame(detect);
        return;
      }
      
      if (now < cooldownUntilRef.current) {
        drawBoxOverlay(ctx, canvas.width, canvas.height);
        animationRef.current = requestAnimationFrame(detect);
        return;
      }
      
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      isDetectingRef.current = true;
      
      try {
        const isDesktop = window.innerWidth > 768;
        const inputSize = isDesktop ? 416 : 320;
        
        const detection = await faceapi
          .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize, scoreThreshold: 0.35 }))
          .withFaceLandmarks()
          .withFaceDescriptor();
        
        lastDetectionTimeRef.current = now;
        
        if (detection) {
          setDetectionStatus('ideal');
          
          const descriptor = detection.descriptor;
          const match = await findBestMatchFromLocal(descriptor, classId);
          
          if (match.success && match.studentId && match.studentName) {
            if (successfullyMatchedRef.current.has(match.studentId)) {
              if (now - lastNoMatchRef.current > NO_MATCH_COOLDOWN) {
                lastNoMatchRef.current = now;
                showFeedback('warning', 'SUDAH ABSEN', match.studentName);
              }
              consecutiveMatchRef.current = null;
            } else {
              const currentMatch = consecutiveMatchRef.current;
              if (currentMatch && currentMatch.studentId === match.studentId) {
                currentMatch.count++;
                setMatchProgress(currentMatch.count);
                if (currentMatch.count >= REQUIRED_CONSECUTIVE_MATCHES) {
                  successfullyMatchedRef.current.add(match.studentId);
                  cooldownUntilRef.current = now + MATCH_COOLDOWN;
                  consecutiveMatchRef.current = null;
                  setMatchProgress(0);
                  setDetectionStatus('no_face');
                  showFeedback('success', 'BERHASIL - HADIR', match.studentName);
                  onMatchSuccess(match.studentId, match.studentName);
                }
              } else {
                consecutiveMatchRef.current = { studentId: match.studentId, studentName: match.studentName, count: 1 };
                setMatchProgress(1);
              }
            }
            consecutiveNoMatchRef.current = 0;
          } else {
            consecutiveMatchRef.current = null;
            consecutiveNoMatchRef.current++;
            
            if (consecutiveNoMatchRef.current >= 4) {
              if (now - lastNoMatchRef.current > NO_MATCH_COOLDOWN) {
                lastNoMatchRef.current = now;
                showFeedback('error', 'TIDAK TERDAFTAR', match.message || 'Wajah tidak cocok');
              }
            }
          }
        } else {
          consecutiveNoMatchRef.current = 0;
        }
        
        drawBoxOverlay(ctx, canvas.width, canvas.height, !!detection);
      } catch (error) {
        console.warn('[FaceScanner] Detection error:', error);
      }
      
      isDetectingRef.current = false;
      animationRef.current = requestAnimationFrame(detect);
    };

    detect();
  };

  const cleanup = () => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  const handleSwitchCamera = async () => {
    if (cameras.length < 2 || isSwitchingCamera) return;
    
    setIsSwitchingCamera(true);
    
    try {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      
      const nextIndex = (currentCameraIndex + 1) % cameras.length;
      setCurrentCameraIndex(nextIndex);
      setIsBackCamera(!isBackCamera);
      
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
      
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: cameras[nextIndex].deviceId } },
        audio: false,
      });
      
      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play().catch(() => {});
          startDetection();
        };
      }
    } catch (error) {
      console.error('[FaceScanner] Error switching camera:', error);
    } finally {
      setIsSwitchingCamera(false);
    }
  };

  const getFilterMessage = () => {
    switch (detectionStatus) {
      case 'no_face': return 'Posisikan wajah di area scan';
      case 'detecting': return 'Mendeteksi wajah...';
      case 'ideal': return 'Wajah terdeteksi';
      default: return 'Memproses...';
    }
  };

  const getFeedbackStyle = (type: FeedbackType) => {
    switch (type) {
      case 'success':
      case 'late': return 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-white border-emerald-400 shadow-2xl shadow-emerald-500/40';
      case 'warning':
      case 'already': return 'bg-gradient-to-r from-blue-500 to-blue-600 text-white border-blue-300 shadow-2xl shadow-blue-500/40';
      case 'error': return 'bg-gradient-to-r from-red-500 to-red-600 text-white border-red-400 shadow-2xl shadow-red-500/40';
      default: return 'bg-gray-600 text-white border-gray-400';
    }
  };

  const getFeedbackIcon = (type: FeedbackType) => {
    switch (type) {
      case 'success':
      case 'late': return <CheckCircle className="w-8 h-8" />;
      case 'warning':
      case 'already': return <AlertTriangle className="w-7 h-7" />;
      case 'error': return <XCircle className="w-8 h-8" />;
      default: return <AlertCircle className="w-8 h-8" />;
    }
  };

  const isInCooldown = () => Date.now() < cooldownUntilRef.current;

  if (isError) {
    return (
      <div className="fixed inset-0 z-[100] bg-gradient-to-b from-gray-900 to-black flex flex-col items-center justify-center p-6">
        <div className="w-24 h-24 rounded-full bg-red-500/20 flex items-center justify-center mb-6">
          <AlertCircle className="w-12 h-12 text-red-400" />
        </div>
        <h3 className="text-white font-bold text-2xl mb-2">Scanner Error</h3>
        <p className="text-white/60 mb-8 text-center max-w-sm">{errorMsg}</p>
        
        <button 
          onClick={() => { cleanup(); onCancel(); }}
          className="px-8 py-3 bg-white/10 text-white rounded-2xl hover:bg-white/20 font-medium transition-all"
        >
          Kembali
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] bg-gradient-to-b from-gray-900 via-gray-800 to-black flex flex-col">
      <video 
        ref={videoRef} 
        className={`absolute inset-0 w-full h-full object-cover ${!isBackCamera ? 'scale-x-[-1]' : ''}`}
        playsInline 
        muted 
      />
      <canvas 
        ref={canvasRef} 
        className={`absolute inset-0 w-full h-full object-cover pointer-events-none ${!isBackCamera ? 'scale-x-[-1]' : ''}`}
      />

      <div className="absolute top-0 inset-x-0 z-30 bg-gradient-to-b from-black/90 via-black/60 to-transparent pt-6 pb-4 px-6 md:pt-8 md:px-12">
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-4 md:gap-6">
            <div className="w-14 h-14 md:w-16 md:h-16 rounded-2xl md:rounded-3xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/30">
              <ScanFace className="w-7 h-7 md:w-8 md:h-8 text-white" />
            </div>
            <div className="text-white">
              <h2 className="font-bold text-xl md:text-2xl tracking-tight">{className || 'Scan Wajah'}</h2>
              <p className="text-white/50 text-sm md:text-base">{sessionTopic || 'Absensi Otomatis'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 md:gap-4">
            {cameras.length > 1 && (
              <motion.button 
                whileTap={{ scale: 0.95 }}
                onClick={handleSwitchCamera}
                disabled={isSwitchingCamera}
                className="w-12 h-12 md:w-16 md:h-16 rounded-xl md:rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center text-white hover:bg-white/20 transition-all border border-white/10"
                title="Pindah Kamera"
              >
                {isSwitchingCamera ? (
                  <Loader2 className="w-5 h-5 md:w-7 md:h-7 animate-spin" />
                ) : (
                  <ArrowRightLeft className="w-5 h-5 md:w-7 md:h-7" />
                )}
              </motion.button>
            )}
            <motion.button 
              whileTap={{ scale: 0.95 }}
              onClick={() => { cleanup(); onCancel(); }}
              className="w-12 h-12 md:w-16 md:h-16 rounded-xl md:rounded-2xl bg-red-500/80 backdrop-blur-md flex items-center justify-center text-white hover:bg-red-600 transition-all shadow-lg shadow-red-900/40 border border-red-400/30"
            >
              <X className="w-5 h-5 md:w-7 md:h-7" />
            </motion.button>
          </div>
        </div>
        
        <div className="w-full mt-4 md:mt-6 flex items-center gap-2">
          <div className={`w-2.5 h-2.5 md:w-3 md:h-3 rounded-full ${detectionStatus === 'ideal' ? 'bg-emerald-400 shadow-lg shadow-emerald-400 animate-pulse' : detectionStatus === 'no_face' ? 'bg-white/30' : 'bg-yellow-400 shadow-lg shadow-yellow-400 animate-pulse'}`} />
          <span className="text-white/70 text-sm md:text-base font-medium">
            {isInitializing ? 'Memuat sistem...' : isModelsReady ? (
              isInCooldown() ? (
                <span className="text-amber-400">Tunggu {cooldownRemaining}s...</span>
              ) : matchProgress > 0 ? (
                <span className="text-emerald-400">Mendeteksi {matchProgress}/{REQUIRED_CONSECUTIVE_MATCHES}...</span>
              ) : (
                getFilterMessage()
              )
            ) : 'Memuat model...'}
          </span>
        </div>
        
        {matchProgress > 0 && !isInCooldown() && (
          <div className="w-full mt-3 md:mt-4 flex items-center gap-1.5 md:gap-2">
            {Array.from({ length: REQUIRED_CONSECUTIVE_MATCHES }).map((_, i) => (
              <motion.div 
                key={i} 
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                className={`h-1.5 md:h-2 flex-1 rounded-full ${i < matchProgress ? 'bg-gradient-to-r from-emerald-400 to-emerald-500 shadow-lg shadow-emerald-400' : 'bg-white/20'}`}
              />
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 flex items-center justify-center relative">
        {isInitializing && (
          <div className="flex flex-col items-center">
            <div className="relative">
              <div className="w-20 h-20 rounded-2xl bg-emerald-500/20 flex items-center justify-center">
                <Loader2 className="w-10 h-10 text-emerald-400 animate-spin" />
              </div>
              <div className="absolute inset-0 rounded-2xl bg-emerald-400/20 animate-ping" />
            </div>
            <p className="text-white/50 text-sm mt-4">Memuat scanner wajah...</p>
          </div>
        )}
        
        {!isInitializing && detectionStatus === 'ideal' && !isInCooldown() && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative w-72 h-96"
          >
            <div className="absolute inset-0 rounded-3xl border-2 border-emerald-400/60 shadow-[0_0_40px_rgba(52,211,153,0.4)]" />
            <motion.div
              className="absolute left-0 right-0 h-1 bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_15px_rgba(52,211,153,0.8)]"
              animate={{ top: ['5%', '95%', '5%'] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
            />
            <motion.div
              className="absolute inset-0 rounded-3xl border-2 border-emerald-400/30"
              animate={{ 
                borderColor: ['rgba(52,211,153,0.3)', 'rgba(52,211,153,0.8)', 'rgba(52,211,153,0.3)'],
                boxShadow: ['0 0 20px rgba(52,211,153,0.2)', '0 0 40px rgba(52,211,153,0.5)', '0 0 20px rgba(52,211,153,0.2)']
              }}
              transition={{ duration: 1.5, repeat: Infinity }}
            />
          </motion.div>
        )}
        
        {!isInitializing && detectionStatus === 'no_face' && !feedback && (
          <div className="flex flex-col items-center">
            <div className="w-24 h-24 md:w-32 md:h-32 rounded-full bg-white/5 flex items-center justify-center mb-4 md:mb-6">
              <ScanFace className="w-12 h-12 md:w-16 md:h-16 text-white/30" />
            </div>
            <p className="text-white/40 text-sm md:text-base">Posisikan wajah Anda di area scan</p>
            <p className="text-white/25 text-xs md:text-sm mt-2">Pastikan wajah jelas dan cahaya cukup</p>
          </div>
        )}
      </div>

      <div className="absolute bottom-0 inset-x-0 z-40 pb-8 pt-4 md:pb-12 md:pt-6 bg-gradient-to-t from-black/80 via-black/50 to-transparent px-4 md:px-8">
        <AnimatePresence mode="wait">
          {feedback ? (
            <motion.div 
              key={feedback.timestamp}
              initial={{ y: 100, opacity: 0, scale: 0.9 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 20, opacity: 0, scale: 0.9 }}
              transition={{ type: 'spring', damping: 20, stiffness: 300 }}
              className={`w-full mx-auto md:w-3/4 lg:w-1/2 rounded-2xl md:rounded-3xl p-5 md:p-6 shadow-2xl border-t-4 backdrop-blur-xl ${getFeedbackStyle(feedback.type)}`}
            >
              <div className="flex items-center gap-4 md:gap-6">
                <div className={`w-14 h-14 md:w-16 md:h-16 rounded-xl md:rounded-2xl flex items-center justify-center shrink-0 ${
                  feedback.type === 'success' || feedback.type === 'late' ? 'bg-white/20' : 'bg-black/20'
                }`}>
                  {getFeedbackIcon(feedback.type)}
                </div>
                <div>
                  <h3 className="font-bold text-lg md:text-2xl leading-tight uppercase tracking-wide">{feedback.title}</h3>
                  <p className="font-medium text-white/90 text-base md:text-xl md:mt-1 mt-0.5">{feedback.message}</p>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              className="text-center"
            >
              <p className="text-white/40 text-xs md:text-sm">
                {isInCooldown() ? 'Menunggu verifikasi berikutnya...' : 'Sistem siap memindai wajah'}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}