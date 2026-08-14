import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'motion/react';
import { X, Camera, ScanFace, CheckCircle, Loader2, Image as ImageIcon, Sparkles, AlertCircle } from 'lucide-react';
import { Siswa } from '../../types';
import { loadModels, extractFaceDescriptorFromImage, saveFaceEmbedding, loadImageFromUrl } from '../../services/face';

interface FaceEnrollModalProps {
  siswa: Siswa;
  onClose: () => void;
  onSuccess: () => void;
}

export default function FaceEnrollModal({ siswa, onClose, onSuccess }: FaceEnrollModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [mode, setMode] = useState<'camera' | 'photo'>('photo');
  const [isLoading, setIsLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);

  useEffect(() => {
    loadModels();
    return () => {
      stopCamera();
    };
  }, []);

  const startCamera = async () => {
    setErrorMsg(null);
    setIsCameraActive(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setIsCameraActive(true);
      }
    } catch (err) {
      console.error('[FaceEnroll] Camera start error:', err);
      setErrorMsg('Gagal mengaktifkan kamera. Mohon berikan izin pada browser.');
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
  };

  const handleEnrollFromPhoto = async () => {
    if (!siswa.foto_url) {
      setErrorMsg('Siswa belum memiliki pas foto di sistem. Silakan unggah foto terlebih dahulu.');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);
    setStatusMsg('Menganalisis pas foto siswa...');

    try {
      const img = await loadImageFromUrl(siswa.foto_url);
      const descriptor = await extractFaceDescriptorFromImage(img);

      if (!descriptor) {
        setErrorMsg('Wajah tidak terdeteksi pada pas foto. Gunakan foto dengan posisi wajah jelas atau gunakan Kamera.');
        setIsLoading(false);
        return;
      }

      await saveFaceEmbedding(siswa.id, descriptor, {
        nama: siswa.nama,
        kelas: siswa.kelas,
        nis: siswa.nis,
      });

      setStatusMsg('Berhasil mendaftarkan embedding wajah siswa!');
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1200);
    } catch (err: any) {
      console.error('[FaceEnroll] Error from photo:', err);
      setErrorMsg('Gagal memproses pas foto siswa. Pastikan URL foto valid.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEnrollFromCamera = async () => {
    if (!videoRef.current) return;

    setIsLoading(true);
    setErrorMsg(null);
    setStatusMsg('Mengambil sampel wajah dari kamera...');

    try {
      const descriptor = await extractFaceDescriptorFromImage(videoRef.current);

      if (!descriptor) {
        setErrorMsg('Wajah tidak terdeteksi di kamera. Posisikan wajah di tengah dan cukup pencahayaan.');
        setIsLoading(false);
        return;
      }

      await saveFaceEmbedding(siswa.id, descriptor, {
        nama: siswa.nama,
        kelas: siswa.kelas,
        nis: siswa.nis,
      });

      setStatusMsg('Berhasil mendaftarkan sampel wajah dari kamera!');
      stopCamera();
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1200);
    } catch (err: any) {
      console.error('[FaceEnroll] Error from camera:', err);
      setErrorMsg('Terjadi kesalahan saat memproses gambar dari kamera.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 animate-fade-in">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden border border-brand-100 flex flex-col"
      >
        {/* Header */}
        <div className="p-5 brand-gradient text-white flex items-center justify-between shadow-md">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-2xl">
              <ScanFace className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="font-extrabold text-base leading-tight">Pendaftaran Wajah Siswa</h3>
              <p className="text-xs text-white/80 font-medium">{siswa.nama} ({siswa.kelas})</p>
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

        {/* Content */}
        <div className="p-5 space-y-4">
          {/* Mode Switcher */}
          <div className="flex bg-brand-50 p-1 rounded-2xl border border-brand-200">
            <button
              onClick={() => {
                setMode('photo');
                stopCamera();
              }}
              className={`flex-1 py-2 text-xs font-extrabold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                mode === 'photo' ? 'bg-white text-brand-900 shadow-sm' : 'text-brand-600 hover:text-brand-900'
              }`}
            >
              <ImageIcon className="w-4 h-4" />
              Dari Pas Foto
            </button>
            <button
              onClick={() => {
                setMode('camera');
                startCamera();
              }}
              className={`flex-1 py-2 text-xs font-extrabold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                mode === 'camera' ? 'bg-white text-brand-900 shadow-sm' : 'text-brand-600 hover:text-brand-900'
              }`}
            >
              <Camera className="w-4 h-4" />
              Ambil via Kamera
            </button>
          </div>

          {/* Mode 1: Dari Pas Foto */}
          {mode === 'photo' && (
            <div className="flex flex-col items-center justify-center p-4 bg-brand-50/50 rounded-2xl border border-brand-100 text-center space-y-3">
              {siswa.foto_url ? (
                <img
                  src={siswa.foto_url}
                  className="w-24 h-32 rounded-2xl object-cover border-2 border-brand-300 shadow-md"
                  alt={siswa.nama}
                />
              ) : (
                <div className="w-24 h-32 bg-brand-100 rounded-2xl flex flex-col items-center justify-center text-brand-400 p-2">
                  <ImageIcon className="w-8 h-8 mb-1" />
                  <span className="text-[10px] font-bold">Belum Ada Foto</span>
                </div>
              )}
              <div className="text-xs">
                <p className="font-bold text-brand-900">{siswa.nama}</p>
                <p className="text-brand-600">NIS: {siswa.nis || '-'}</p>
              </div>
              <button
                disabled={isLoading || !siswa.foto_url}
                onClick={handleEnrollFromPhoto}
                className="w-full py-3 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                Ekstrak Wajah dari Pas Foto
              </button>
            </div>
          )}

          {/* Mode 2: Dari Kamera Live */}
          {mode === 'camera' && (
            <div className="flex flex-col items-center space-y-3">
              <div className="relative w-full aspect-4/3 bg-slate-900 rounded-2xl overflow-hidden shadow-inner flex items-center justify-center border border-brand-200">
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  className="w-full h-full object-cover transform -scale-x-100"
                />
                {!isCameraActive && (
                  <div className="absolute inset-0 flex items-center justify-center bg-slate-900 text-white text-xs">
                    Memulai Kamera...
                  </div>
                )}
              </div>
              <button
                disabled={isLoading || !isCameraActive}
                onClick={handleEnrollFromCamera}
                className="w-full py-3 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                Ambil Sampel & Simpan Wajah
              </button>
            </div>
          )}

          {/* Status / Error Alerts */}
          {statusMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-semibold flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{statusMsg}</span>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
