import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Camera, Check, X, AlertCircle, Loader2, ImagePlus, Trash2, ScanFace, AlertTriangle } from 'lucide-react';
import * as faceapi from 'face-api.js';
import { motion } from 'framer-motion';
import { initDB, clearStateCache } from '../../services/db';
import { getSupabaseClient } from '../../services/supabase';
import { loadModels } from '../../services/face';
import { Modal, ConfirmModal } from '../UI';

type EnrollmentState = 'loading' | 'ready' | 'enrolling' | 'success' | 'error';
type Step = 'choose' | 'camera' | 'upload';
const DETECTION_INTERVAL = 150;

function descriptorToString(descriptor: Float32Array): string {
  return Array.from(descriptor).join(',');
}

export default function FaceEnrollment({
  studentId,
  studentName,
  hasFaceData,
  onEnrollSuccess,
  onCancel,
  refresh,
}: FaceEnrollmentProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationRef = useRef<number | null>(null);
  const isDetectingRef = useRef(false);
  const lastDetectionTimeRef = useRef(0);
  const modelsLoadedRef = useRef(false);
  const capturedRef = useRef(false);
  const canvasInitializedRef = useRef(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<EnrollmentState>('loading');
  const [message, setMessage] = useState('');
  const [hasFace, setHasFace] = useState(false);
  const [capturedDescriptor, setCapturedDescriptor] = useState<Float32Array | null>(null);
  const [uploading, setUploading] = useState(false);
  const [step, setStep] = useState<'choose' | 'camera' | 'upload'>('choose');
  const [filterStatus, setFilterStatus] = useState<'no_face' | 'detecting' | 'ideal'>('no_face');
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [isModelsReady, setIsModelsReady] = useState(false);
  const [videoSize, setVideoSize] = useState({ width: 640, height: 480 });
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  console.log('[FaceEnrollment] hasFaceData:', hasFaceData, 'showDeleteConfirm:', showDeleteConfirm);

  useEffect(() => {
    initModels();
    
    return () => {
      cleanup();
    };
  }, []);

  const cleanup = useCallback(() => {
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
    isDetectingRef.current = false;
    capturedRef.current = false;
    canvasInitializedRef.current = false;
  }, []);

  const initModels = async () => {
    try {
      setMessage('Memuat sistem pengenalan wajah...');
      const loaded = await loadModels();
      if (loaded) {
        modelsLoadedRef.current = true;
        setIsModelsReady(true);
        setState('ready');
        setMessage('Pilih metode untuk mendaftarkan wajah');
      } else {
        setState('error');
        setMessage('Model wajah tidak tersedia. Pastikan file model ada di folder /models.');
      }
    } catch (error) {
      setState('error');
      setMessage('Gagal memuat model. Periksa koneksi internet.');
    }
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 10 } },
        audio: false,
      });
      
      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          if (videoRef.current) {
            setVideoSize({
              width: videoRef.current.videoWidth || 640,
              height: videoRef.current.videoHeight || 480
            });
          }
          videoRef.current?.play().catch(() => {});
          startDetection();
        };
      }
    } catch (err) {
      setState('error');
      setMessage('Gagal mengakses kamera.');
    }
  };

  const startDetection = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    const detect = async () => {
      if (!video || !video.videoWidth || video.paused || isDetectingRef.current) {
        animationRef.current = requestAnimationFrame(detect);
        return;
      }

      const now = Date.now();
      if (now - lastDetectionTimeRef.current < DETECTION_INTERVAL) {
        animationRef.current = requestAnimationFrame(detect);
        return;
      }

      isDetectingRef.current = true;
      lastDetectionTimeRef.current = now;

      try {
        setFilterStatus('detecting');
        
        const detection = await faceapi
          .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.4 }))
          .withFaceLandmarks()
          .withFaceDescriptor();

        if (detection && !capturedRef.current) {
          setFilterStatus('ideal');
          setHasFace(true);
          capturedRef.current = true;
          setCapturedDescriptor(detection.descriptor);
        } else if (!detection) {
          setFilterStatus('no_face');
          setHasFace(false);
        }
      } catch (error) {
        console.warn('Detection error:', error);
        setFilterStatus('no_face');
      }

      isDetectingRef.current = false;
      animationRef.current = requestAnimationFrame(detect);
    };

    detect();
  }, []);

  const stopCamera = useCallback(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    isDetectingRef.current = false;
  }, []);

  const handleStartCamera = () => {
    setStep('camera');
    setHasFace(false);
    setCapturedDescriptor(null);
    setFilterStatus('no_face');
    capturedRef.current = false;
    setMessage('Arahkan wajah ke kamera');
    startCamera();
  };

  const handleEnroll = async () => {
    if (!capturedDescriptor) {
      setState('error');
      setMessage('Wajah tidak terdeteksi. Coba lagi.');
      return;
    }

    setState('enrolling');
    setMessage('Menyimpan data wajah...');

    const embeddingStr = descriptorToString(capturedDescriptor);
    
    try {
      const db = await initDB();
      const student = await db.get('students', studentId);
      if (student) {
        await db.put('students', { ...student, face_embedding: embeddingStr });
      }

      localStorage.setItem(`face_embedding_${studentId}`, embeddingStr);

      try {
        const supabase = getSupabaseClient();
        await supabase
          .from('students')
          .update({ face_embedding: embeddingStr })
          .eq('id', studentId);
      } catch (supabaseErr) {
        console.warn('Supabase save failed, local only:', supabaseErr);
      }

      setState('success');
      setMessage('Wajah berhasil disimpan!');
      refresh?.();
      setTimeout(() => onEnrollSuccess?.(studentId), 1500);
    } catch (err: any) {
      setState('error');
      setMessage('Gagal: ' + (err?.message || 'Unknown error'));
    }
  };

  const handleRetake = () => {
    setCapturedDescriptor(null);
    setHasFace(false);
    setFilterStatus('no_face');
    capturedRef.current = false;
    setMessage('Arahkan wajah ke kamera');
  };

  const handleBack = () => {
    stopCamera();
    setStep('choose');
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setMessage('Memproses foto...');
    setStep('upload');

    try {
      const objectUrl = URL.createObjectURL(file);
      setPreviewImage(objectUrl);
      
      setMessage('Mendeteksi wajah...');
      
      const img = new Image();
      img.src = objectUrl;
      await new Promise((resolve) => { img.onload = resolve; });
      
      if (!modelsLoadedRef.current) {
        await loadModels();
      }
      
      let descriptor = await faceapi
        .detectSingleFace(img, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.35 }))
        .withFaceLandmarks()
        .withFaceDescriptor();
      
      if (!descriptor) {
        descriptor = await faceapi
          .detectSingleFace(img, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.25 }))
          .withFaceLandmarks()
          .withFaceDescriptor();
      }
      
      if (!descriptor) {
        setState('error');
        setMessage('Wajah tidak terdeteksi. Pastikan wajah jelas.');
        setUploading(false);
        return;
      }
      
      setCapturedDescriptor(descriptor);
      setState('ready');
      setMessage('Wajah terdeteksi! Klik simpan.');
    } catch (err: any) {
      setState('error');
      setMessage('Gagal: ' + (err?.message || 'Unknown error'));
    } finally {
      setUploading(false);
    }
  };

  const handleSaveFromUpload = async () => {
    if (!capturedDescriptor) return;

    setState('enrolling');
    setMessage('Menyimpan data wajah...');

    const embeddingStr = descriptorToString(capturedDescriptor);
    
    try {
      const db = await initDB();
      const student = await db.get('students', studentId);
      if (student) {
        await db.put('students', { ...student, face_embedding: embeddingStr });
      }

      localStorage.setItem(`face_embedding_${studentId}`, embeddingStr);

      try {
        const supabase = getSupabaseClient();
        await supabase
          .from('students')
          .update({ face_embedding: embeddingStr })
          .eq('id', studentId);
      } catch (supabaseErr) {
        console.warn('Supabase save failed, local only:', supabaseErr);
      }

      setState('success');
      setMessage('Wajah berhasil disimpan!');
      refresh?.();
      setTimeout(() => onEnrollSuccess?.(studentId), 1500);
    } catch (err: any) {
      setState('error');
      setMessage('Gagal: ' + (err?.message || 'Unknown error'));
    }
  };

  const handleDeleteFace = async () => {
    if (!confirm(`Hapus data wajah ${studentName}?`)) return;
    
    setMessage('Menghapus data wajah...');
    
    try {
      // 1. Delete from IndexedDB
      const db = await initDB();
      const student = await db.get('students', studentId);
      if (student) {
        const updatedStudent = { ...student };
        delete updatedStudent.face_embedding;
        await db.put('students', updatedStudent);
        console.log('[DeleteFace] Removed from IndexedDB:', studentId);
      }

      // 2. Delete from localStorage
      localStorage.removeItem(`face_embedding_${studentId}`);
      console.log('[DeleteFace] Removed from localStorage');

      // 3. Delete from Supabase
      let supabaseDeleted = false;
      try {
        const supabase = getSupabaseClient();
        console.log('[DeleteFace] Deleting from Supabase for studentId:', studentId);
        
        // First try to set to empty string (more reliable)
        const { error: err1 } = await supabase
          .from('students')
          .update({ face_embedding: '' })
          .eq('id', studentId);
        
        if (err1) {
          console.error('[DeleteFace] Set empty failed:', err1.message);
          
          // Try null as fallback
          const { error: err2 } = await supabase
            .from('students')
            .update({ face_embedding: null })
            .eq('id', studentId);
          
          if (err2) {
            console.error('[DeleteFace] Set null also failed:', err2.message);
          } else {
            supabaseDeleted = true;
          }
        } else {
          supabaseDeleted = true;
          console.log('[DeleteFace] Set empty string in Supabase');
        }
        
        // Also try to set face_vector
        await supabase
          .from('students')
          .update({ face_vector: '' })
          .eq('id', studentId);
          
      } catch (supabaseErr) {
        console.warn('[DeleteFace] Supabase error:', supabaseErr);
      }

      if (supabaseDeleted) {
        setMessage('Data wajah berhasil dihapus');
      } else {
        setMessage('Data wajah dihapus lokal. Cloud mungkin gagal.');
      }

      // 4. Clear cache and refresh
      const { clearStateCache } = await import('../../services/db');
      clearStateCache();
      console.log('[DeleteFace] Cache cleared');
      
      refresh?.();
      console.log('[DeleteFace] Refresh called');
      
      setTimeout(() => {
        onEnrollSuccess?.(studentId);
        onCancel?.();
      }, 1500);
    } catch (err) {
      console.error('[DeleteFace] Error:', err);
      setState('error');
      setMessage('Gagal menghapus data wajah: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
  };

  if (state === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center p-8 min-h-[300px]">
        <div className="w-16 h-16 rounded-full bg-blue-500/20 flex items-center justify-center mb-4">
          <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
        </div>
        <p className="text-gray-700 font-medium">{message || 'Memuat...'}</p>
      </div>
    );
  }

  if (state === 'success') {
    return (
      <div className="flex flex-col items-center justify-center p-8 min-h-[300px]">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="w-20 h-20 rounded-full bg-emerald-500/20 flex items-center justify-center mb-4"
        >
          <Check className="w-10 h-10 text-emerald-500" />
        </motion.div>
        <h2 className="text-xl font-bold text-gray-800 mb-1">TERDAFTAR!</h2>
        <p className="text-emerald-600 font-medium">{studentName}</p>
      </div>
    );
  }

  if (state === 'enrolling') {
    return (
      <div className="flex flex-col items-center justify-center p-8 min-h-[300px]">
        <Loader2 className="w-10 h-10 text-gray-400 animate-spin mb-3" />
        <p className="text-gray-600">{message}</p>
      </div>
    );
  }

  if (step === 'camera') {
    return (
      <div className="flex flex-col" ref={containerRef}>
        <div className="flex items-center justify-between mb-3">
          <button onClick={handleBack} className="p-2 hover:bg-gray-100 rounded-lg text-gray-500">
            <X className="w-5 h-5" />
          </button>
          <h3 className="font-semibold text-gray-800">Daftar Wajah</h3>
          <div className="w-9" />
        </div>

        <div className="relative bg-gray-900 rounded-xl overflow-hidden mb-3">
          <div className="relative" style={{ paddingTop: '75%' }}>
            <video 
              ref={videoRef} 
              className="absolute inset-0 w-full h-full object-cover scale-x-[-1]" 
              playsInline 
              muted 
            />
            <canvas 
              className="absolute inset-0 w-full h-full object-cover pointer-events-none scale-x-[-1]"
            />
            
            <div className={`absolute inset-0 flex items-center justify-center ${filterStatus === 'no_face' ? 'bg-black/50' : ''}`}>
              {filterStatus === 'no_face' && (
                <div className="text-white text-center">
                  <Camera className="w-8 h-8 mx-auto mb-1 opacity-50" />
                  <p className="text-xs">Posisikan wajah di tengah</p>
                </div>
              )}
            </div>
          </div>

          <div className="absolute top-3 left-3 right-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${filterStatus === 'ideal' ? 'bg-emerald-400' : filterStatus === 'no_face' ? 'bg-white/50' : 'bg-yellow-400'}`} />
              <span className="text-white text-xs drop-shadow">
                {filterStatus === 'ideal' ? 'Wajah terdeteksi' : 
                 filterStatus === 'detecting' ? 'Mendeteksi...' : 
                 'Posisikan wajah di tengah'}
              </span>
            </div>
          </div>
        </div>

        {capturedDescriptor ? (
          <div className="space-y-3">
            <div className="flex items-center justify-center gap-2 text-emerald-600">
              <Check className="w-4 h-4" />
              <span className="text-sm font-medium">Wajah berhasil ditangkap</span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleRetake}
                className="flex-1 py-2.5 rounded-lg font-medium text-sm bg-gray-100 text-gray-700 hover:bg-gray-200"
              >
                Ambil Ulang
              </button>
              <button
                onClick={handleEnroll}
                className="flex-1 py-2.5 rounded-lg font-medium text-sm bg-emerald-500 text-white hover:bg-emerald-600"
              >
                Simpan Wajah
              </button>
            </div>
          </div>
        ) : (
          <div className="text-center text-gray-400 text-sm py-2">
            Tunggu wajah terdeteksi...
          </div>
        )}

        {state === 'error' && (
          <div className="mt-2 p-2 bg-red-50 text-red-600 rounded-lg text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            <span>{message}</span>
          </div>
        )}
      </div>
    );
  }

  if (step === 'upload') {
    return (
      <div className="flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <button onClick={handleBack} className="p-2 hover:bg-gray-100 rounded-lg text-gray-500">
            <X className="w-5 h-5" />
          </button>
          <h3 className="font-semibold text-gray-800">Upload Foto</h3>
          <div className="w-9" />
        </div>

        <div className="flex-1 flex items-center justify-center min-h-[200px]">
          {uploading ? (
            <div className="text-center">
              <Loader2 className="w-10 h-10 text-gray-400 animate-spin mx-auto mb-3" />
              <p className="text-gray-600">{message}</p>
            </div>
          ) : previewImage ? (
            <div className="text-center space-y-3 w-full">
              <img src={previewImage} alt="Preview" className="max-h-[200px] mx-auto rounded-lg border border-gray-200" />
              {capturedDescriptor && (
                <div className="flex gap-2">
                  <button
                    onClick={() => { setPreviewImage(null); setCapturedDescriptor(null); }}
                    className="flex-1 py-2.5 rounded-lg font-medium text-sm bg-gray-100 text-gray-700"
                  >
                    Pilih Foto Lain
                  </button>
                  <button
                    onClick={handleSaveFromUpload}
                    className="flex-1 py-2.5 rounded-lg font-medium text-sm bg-emerald-500 text-white hover:bg-emerald-600"
                  >
                    Simpan Wajah
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center space-y-3">
              <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto">
                <ImagePlus className="w-8 h-8 text-gray-400" />
              </div>
              <div>
                <p className="text-gray-700 font-medium">Pilih foto wajah</p>
                <p className="text-gray-400 text-sm">Pastikan wajah jelas</p>
              </div>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                id="face-upload-input"
                ref={fileInputRef}
                onChange={handleFileUpload}
              />
              <label 
                htmlFor="face-upload-input" 
                className="inline-block px-5 py-2.5 bg-emerald-500 text-white rounded-lg font-medium hover:bg-emerald-600 cursor-pointer"
              >
                Pilih Foto
              </label>
            </div>
          )}
        </div>

        {state === 'error' && (
          <div className="mt-2 p-2 bg-red-50 text-red-600 rounded-lg text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            <span>{message}</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-[400px]">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-800">Registrasi Wajah</h3>
        {onCancel && (
          <button onClick={onCancel} className="p-2 hover:bg-gray-100 rounded-lg text-gray-500">
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      <p className="text-gray-500 text-sm text-center mb-4">Pilih metode mendaftarkan wajah:</p>
      
      <div className="space-y-3 flex-1">
        <button
          onClick={handleStartCamera}
          className="w-full p-4 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl hover:bg-emerald-100 transition-colors flex items-center gap-3"
        >
          <Camera className="w-6 h-6" />
          <div className="text-left">
            <span className="block font-medium">Kamera Langsung</span>
            <span className="block text-emerald-600 text-xs">Rekam via kamera</span>
          </div>
        </button>
        
        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-full p-4 bg-blue-50 border border-blue-200 text-blue-700 rounded-xl hover:bg-blue-100 transition-colors flex items-center gap-3"
        >
          <ImagePlus className="w-6 h-6" />
          <div className="text-left">
            <span className="block font-medium">Upload Foto</span>
            <span className="block text-blue-600 text-xs">Pilih dari galeri</span>
          </div>
        </button>

        {hasFaceData && (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="w-full p-3 bg-red-50 border border-red-200 text-red-600 rounded-xl hover:bg-red-100 transition-colors flex items-center justify-center gap-2"
          >
            <Trash2 className="w-4 h-4" />
            <span className="font-medium text-sm">Hapus Data Wajah</span>
          </button>
        )}

        <input
          type="file"
          accept="image/*"
          className="hidden"
          id="face-upload-choose"
          ref={fileInputRef}
          onChange={handleFileUpload}
        />
      </div>

      {state === 'error' && (
        <div className="mt-3 p-2 bg-red-50 text-red-600 rounded-lg text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          <span>{message}</span>
        </div>
      )}

      <ConfirmModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDeleteFace}
        title="Hapus Data Wajah"
        description={`Apakah Anda yakin ingin menghapus data wajah untuk ${studentName}? Data yang dihapus tidak dapat dikembalikan.`}
        confirmText="Hapus"
        cancelText="Batal"
        variant="danger"
      />
    </div>
  );
}