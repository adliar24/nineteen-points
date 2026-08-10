import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Check, X, AlertCircle, ScanFace, CheckCircle, XCircle, Loader2, Camera, ArrowRightLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { initializeAllModels, detectFaceFromVideo, extractFaceDescriptor, findBestMatchFromSupabase, saveFaceDescriptor } from '../../services/face';

const MATCH_COOLDOWN = 3000;
const STABILITY_FRAMES = 5;

interface FaceScannerProps {
  classId: string;
  className?: string;
  sessionTopic?: string;
  onMatchSuccess: (studentId: string, studentName: string) => void;
  onCancel: () => void;
}

type ScannerState = 'loading' | 'ready' | 'scanning' | 'success' | 'error';
type FeedbackType = 'success' | 'warning' | 'error';

interface Feedback {
  type: FeedbackType;
  title: string;
  message: string;
}

interface FaceLockStatus {
  isLocked: boolean;
  progress: number;
}

export default function FaceScanner({ classId, className, sessionTopic, onMatchSuccess, onCancel }: FaceScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationRef = useRef<number | null>(null);
  
  const lockStatusRef = useRef<FaceLockStatus>({ isLocked: false, progress: 0 });
  const cooldownUntilRef = useRef<number>(0);
  const matchedStudentsRef = useRef<Set<string>>(new Set());
  
  const [state, setState] = useState<ScannerState>('loading');
  const [message, setMessage] = useState('Memuat model...');
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [currentCameraIndex, setCurrentCameraIndex] = useState(0);
  const [isBackCamera, setIsBackCamera] = useState(false);
  const [isSwitchingCamera, setIsSwitchingCamera] = useState(false);
  const [lockStatus, setLockStatus] = useState<FaceLockStatus>({ isLocked: false, progress: 0 });

  useEffect(() => {
    initCamera();
    initModels();
    return () => cleanup();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      if (cooldownUntilRef.current > 0) {
        const remaining = Math.max(0, cooldownUntilRef.current - Date.now());
        setCooldownRemaining(Math.ceil(remaining / 1000));
      } else {
        setCooldownRemaining(0);
      }
    }, 100);
    return () => clearInterval(timer);
  }, []);

  const initCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      
      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play();
          startDetection();
        };
      }
      
      const devices = await navigator.mediaDevices.enumerateDevices();
      setCameras(devices.filter(d => d.kind === 'videoinput'));
    } catch (err: any) {
      console.error('Kamera error:', err);
      setState('error');
      setMessage('Gagal mengakses kamera: ' + err.message);
    }
  };

  const initModels = async () => {
    try {
      setMessage('Memuat model deteksi wajah...');
      await initializeAllModels();
      setState('ready');
      setMessage('Posisikan wajah di kotak');
    } catch (err: any) {
      console.error('Model error:', err);
      setState('error');
      setMessage('Gagal memuat model: ' + err.message);
    }
  };

  const playSound = (type: FeedbackType) => {
    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContext) return;
      
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      if (type === 'success') {
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
        osc.start();
        osc.stop(ctx.currentTime + 0.3);
      } else if (type === 'warning') {
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
        osc.start();
        osc.stop(ctx.currentTime + 0.2);
      } else {
        osc.frequency.setValueAtTime(200, ctx.currentTime);
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
        osc.start();
        osc.stop(ctx.currentTime + 0.3);
      }
      
      setTimeout(() => ctx.close(), 500);
    } catch (e) {}
  };

  const showFeedback = (type: FeedbackType, title: string, msg: string) => {
    setFeedback({ type, title, message: msg });
    playSound(type);
    setTimeout(() => setFeedback(null), 3000);
  };

  const drawOverlay = useCallback((ctx: CanvasRenderingContext2D, width: number, height: number, locked: boolean) => {
    ctx.clearRect(0, 0, width, height);
    
    ctx.strokeStyle = locked ? 'rgba(52, 211, 153, 0.9)' : 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = locked ? 4 : 2;
    ctx.setLineDash(locked ? [] : [10, 5]);
    
    const centerX = width / 2;
    const centerY = height / 2;
    const radiusX = Math.min(width * 0.35, 180);
    const radiusY = Math.min(height * 0.45, 240);
    
    ctx.beginPath();
    ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, 2 * Math.PI);
    ctx.stroke();
    
    ctx.setLineDash([]);
    
    if (locked) {
      ctx.fillStyle = 'rgba(52, 211, 153, 0.1)';
      ctx.beginPath();
      ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, 2 * Math.PI);
      ctx.fill();
    }
  }, []);

  const startDetection = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const detect = async () => {
      if (!video || !video.videoWidth || video.paused) {
        animationRef.current = requestAnimationFrame(detect);
        return;
      }
      
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      const now = Date.now();
      
      if (now < cooldownUntilRef.current) {
        drawOverlay(ctx, canvas.width, canvas.height, false);
        animationRef.current = requestAnimationFrame(detect);
        return;
      }
      
      try {
        const result = await detectFaceFromVideo(video, canvas);
        
        if (result) {
          lockStatusRef.current.isLocked = true;
          lockStatusRef.current.progress = Math.min(100, lockStatusRef.current.progress + 20);
          setLockStatus({ ...lockStatusRef.current });
          
          drawOverlay(ctx, canvas.width, canvas.height, true);
          
          if (lockStatusRef.current.progress >= 100) {
            const img = new Image();
            img.src = canvas.toDataURL('image/jpeg', 0.8);
            img.onload = async () => {
              const descriptor = await extractFaceDescriptor(img);
              
              if (descriptor) {
                const match = await findBestMatchFromSupabase(descriptor, classId);
                
                if (match.success && match.studentId && match.studentName) {
                  if (matchedStudentsRef.current.has(match.studentId)) {
                    showFeedback('warning', 'SUDAH ABSEN', match.studentName);
                  } else {
                    matchedStudentsRef.current.add(match.studentId);
                    cooldownUntilRef.current = now + MATCH_COOLDOWN;
                    showFeedback('success', 'TERDETEKSI', match.studentName);
                    onMatchSuccess(match.studentId, match.studentName);
                  }
                } else if (match.confidence && match.confidence >= 0.4) {
                  showFeedback('warning', 'KURANG JELAS', match.message);
                } else {
                  showFeedback('error', 'TIDAK DIKENAL', match.message);
                }
              }
              
              lockStatusRef.current = { isLocked: false, progress: 0 };
              setLockStatus({ isLocked: false, progress: 0 });
            };
          }
        } else {
          lockStatusRef.current.isLocked = false;
          lockStatusRef.current.progress = Math.max(0, lockStatusRef.current.progress - 10);
          setLockStatus({ ...lockStatusRef.current });
          drawOverlay(ctx, canvas.width, canvas.height, false);
        }
      } catch (error) {
        console.warn('[Scanner] Error:', error);
        drawOverlay(ctx, canvas.width, canvas.height, false);
      }
      
      animationRef.current = requestAnimationFrame(detect);
    };
    
    detect();
  };

  const cleanup = () => {
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  const handleSwitchCamera = async () => {
    if (cameras.length < 2 || isSwitchingCamera) return;
    
    setIsSwitchingCamera(true);
    
    try {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      
      const nextIndex = (currentCameraIndex + 1) % cameras.length;
      setCurrentCameraIndex(nextIndex);
      setIsBackCamera(!isBackCamera);
      
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: cameras[nextIndex].deviceId } },
        audio: false,
      });
      
      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play();
          startDetection();
        };
      }
    } catch (error) {
      console.error('[Camera] Error:', error);
    } finally {
      setIsSwitchingCamera(false);
    }
  };

  const getFeedbackStyle = (type: FeedbackType) => {
    switch (type) {
      case 'success': return 'bg-emerald-600 text-white border-emerald-400';
      case 'warning': return 'bg-amber-500 text-white border-amber-300';
      case 'error': return 'bg-red-600 text-white border-red-400';
    }
  };

  const getFeedbackIcon = (type: FeedbackType) => {
    switch (type) {
      case 'success': return <CheckCircle className="w-8 h-8" />;
      case 'warning': return <AlertCircle className="w-7 h-7" />;
      case 'error': return <XCircle className="w-8 h-8" />;
    }
  };

  if (state === 'loading') {
    return (
      <div className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center">
        <Loader2 className="w-12 h-12 text-white/50 animate-spin mb-4" />
        <p className="text-white/70">{message}</p>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center p-6">
        <AlertCircle className="w-12 h-12 text-red-400 mb-4" />
        <p className="text-white/70 text-center mb-4">{message}</p>
        <button onClick={onCancel} className="px-6 py-2 bg-white/10 text-white rounded-lg">
          Kembali
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col">
      <video ref={videoRef} className={`absolute inset-0 w-full h-full object-cover ${!isBackCamera ? 'scale-x-[-1]' : ''}`} playsInline muted />
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full object-cover pointer-events-none" />

      <div className="absolute top-0 inset-x-0 p-4 z-30 bg-gradient-to-b from-black/80 to-transparent">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
              <ScanFace className="w-5 h-5 text-emerald-400" />
            </div>
            <div className="text-white">
              <h2 className="font-bold text-base">{className || 'Absensi Wajah'}</h2>
              <p className="text-white/50 text-xs">{sessionTopic || 'Face Detection'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {cameras.length > 1 && (
              <button onClick={handleSwitchCamera} disabled={isSwitchingCamera} className="p-2 rounded-full bg-black/40 text-white">
                {isSwitchingCamera ? <Loader2 className="w-5 h-5 animate-spin" /> : <ArrowRightLeft className="w-5 h-5" />}
              </button>
            )}
            <button onClick={onCancel} className="p-2 rounded-full bg-red-500/80 text-white">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        
        <div className="mt-3 flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${lockStatus.isLocked ? 'bg-emerald-400 animate-pulse' : 'bg-white/30'}`} />
          <span className="text-white/60 text-xs">
            {cooldownRemaining > 0 
              ? `Tunggu ${cooldownRemaining}s` 
              : lockStatus.isLocked 
                ? `Mengunci wajah... ${lockStatus.progress}%` 
                : message}
          </span>
        </div>
        
        {lockStatus.progress > 0 && !cooldownRemaining && (
          <div className="mt-2 h-1 bg-white/20 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-400 transition-all" style={{ width: `${lockStatus.progress}%` }} />
          </div>
        )}
      </div>

      <div className="flex-1 flex items-center justify-center">
        {lockStatus.isLocked && lockStatus.progress >= 100 && (
          <div className="w-32 h-32 border-4 border-emerald-400 rounded-full flex items-center justify-center animate-pulse">
            <CheckCircle className="w-16 h-16 text-emerald-400" />
          </div>
        )}
      </div>

      <div className="absolute bottom-0 inset-x-0 p-6 z-40">
        <AnimatePresence mode="wait">
          {feedback ? (
            <motion.div 
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              className={`w-full max-w-lg mx-auto rounded-2xl p-4 border-t-4 ${getFeedbackStyle(feedback.type)}`}
            >
              <div className="flex items-center gap-3">
                {getFeedbackIcon(feedback.type)}
                <div>
                  <h3 className="font-bold text-lg uppercase">{feedback.title}</h3>
                  <p className="font-medium text-white/90">{feedback.message}</p>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div initial={{opacity:0}} animate={{opacity:1}} className="text-center text-white/50 text-xs">
              {cooldownRemaining > 0 ? 'Menunggu...' : 'Wajah terdeteksi = hijau'}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}