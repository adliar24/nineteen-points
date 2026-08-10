import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Camera, Check, X, AlertCircle, Loader2, UserCheck, WifiOff } from 'lucide-react';
import * as faceapi from 'face-api.js';
import FaceCamera, { FaceCameraRef } from './FaceCamera';
import { loadModels, findBestMatchCombined, MatchResult } from '../../services/face';
import { initDB } from '../../services/db';

interface FaceScanProps {
  onMatchSuccess: (studentId: string, studentName: string) => void;
  onCancel?: () => void;
  matchThreshold?: number;
}

type ScanState = 'initializing' | 'loading' | 'ready' | 'scanning' | 'matched' | 'not_found' | 'error';

export default function FaceScan({
  onMatchSuccess,
  onCancel,
  matchThreshold = 0.45,
}: FaceScanProps) {
  const cameraRef = useRef<FaceCameraRef>(null);
  const [state, setState] = useState<ScanState>('initializing');
  const [message, setMessage] = useState('Memuat sistem pengenalan wajah...');
  const [matchedStudent, setMatchedStudent] = useState<MatchResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [hasFace, setHasFace] = useState(false);
  const [isModelsLoaded, setIsModelsLoaded] = useState(false);
  const [errorDetails, setErrorDetails] = useState<string>('');

  const initScanner = useCallback(async () => {
    try {
      setState('initializing');
      setMessage('Memuat model AI pengenalan wajah...');
      setErrorDetails('');
      
      try {
        const loaded = await loadModels();
        if (!loaded) {
          setState('error');
          setMessage('Model wajah tidak tersedia. Pastikan file model ada di folder /models.');
          setErrorDetails('Model files not found');
          return;
        }
        setIsModelsLoaded(true);
      } catch (modelError: any) {
        console.error('Failed to load models:', modelError);
        setState('error');
        setMessage('Gagal memuat model AI. Periksa koneksi internet Anda.');
        setErrorDetails(modelError?.message || 'Unknown error loading models');
        return;
      }

      setState('ready');
      setMessage('Siap memindai wajah');
    } catch (error: any) {
      console.error('Error initializing scanner:', error);
      setState('error');
      setMessage('Terjadi kesalahan saat menginisialisasi scanner.');
      setErrorDetails(error?.message || 'Unknown error during initialization');
    }
  }, [matchThreshold]);

  useEffect(() => {
    initScanner();
  }, [initScanner]);

  const handleFaceDetected = useCallback(
    async (descriptor: Float32Array | null) => {
      setHasFace(!!descriptor);

      if (!descriptor || isProcessing || state === 'matched') {
        return;
      }

      setIsProcessing(true);
      setState('scanning');
      setMessage('Mencocokkan wajah...');

      try {
        const result = await findBestMatchCombined(descriptor);

        if (result && result.success) {
          setState('matched');
          setMatchedStudent(result);
          setMessage(`Wajah cocok: ${result.studentName}`);

          setTimeout(() => {
            onMatchSuccess(result.studentId, result.studentName);
          }, 1500);
        } else if (result) {
          setState('not_found');
          setMessage('Wajah tidak cocok dengan data manapun');
          
          setTimeout(async () => {
            const db = await initDB();
            const students = await db.getAll('students');
            const studentsWithFace = students.filter(s => s.face_embedding && typeof s.face_embedding === 'string');
            setState('ready');
            setMessage(`${studentsWithFace.length} siswa siap diverifikasi`);
            setIsProcessing(false);
          }, 2000);
        } else {
          setState('not_found');
          setMessage('Wajah tidak terdeteksi dengan jelas');
          
          setTimeout(() => {
            setState('ready');
            setMessage('Arahkan wajah ke kamera');
            setIsProcessing(false);
          }, 2000);
        }
      } catch (error) {
        console.error('Matching error:', error);
        setState('error');
        setMessage('Terjadi kesalahan saat mencocokkan');
        setIsProcessing(false);
      }
    },
    [isProcessing, state, onMatchSuccess]
  );

  if (state === 'initializing' || state === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center p-8 space-y-4 min-h-[400px]">
        <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
        <p className="text-gray-600 text-center">{message}</p>
        {state === 'initializing' && (
          <p className="text-xs text-gray-400">Sedang memuat AI dan data...</p>
        )}
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="flex flex-col items-center justify-center p-8 space-y-4 min-h-[400px]">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
          <AlertCircle className="w-8 h-8 text-red-500" />
        </div>
        <p className="text-center text-red-600 px-4">{message}</p>
        {errorDetails && (
          <p className="text-xs text-gray-400 text-center px-4">{errorDetails}</p>
        )}
        <button
          onClick={initScanner}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
        >
          Coba Lagi
        </button>
        {onCancel && (
          <button
            onClick={onCancel}
            className="text-gray-500 hover:text-gray-700"
          >
            Batal
          </button>
        )}
      </div>
    );
  }

  if (state === 'matched') {
    return (
      <div className="flex flex-col items-center justify-center p-8 space-y-4 min-h-[400px]">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center animate-bounce">
          <Check className="w-10 h-10 text-green-500" />
        </div>
        <div className="text-center">
          <p className="text-lg font-semibold text-green-600">Absen Berhasil!</p>
          <p className="text-xl font-bold text-gray-800">{matchedStudent?.studentName}</p>
        </div>
        <div className="flex items-center gap-2 text-green-600">
          <UserCheck className="w-5 h-5" />
          <span className="text-sm">Identitas terverifikasi</span>
        </div>
        <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
        <p className="text-sm text-gray-500">Mengarahkan ke absensi...</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Scan Wajah</h3>
        {onCancel && (
          <button onClick={onCancel} className="p-2 hover:bg-gray-100 rounded-full">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        )}
      </div>

      <div className="relative bg-gray-900 rounded-xl overflow-hidden mx-auto" style={{ width: '240px', height: '180px' }}>
        <FaceCamera
          ref={cameraRef}
          width={240}
          height={180}
          onFaceDetected={handleFaceDetected}
          showOverlay={true}
          mirror={true}
          autoStart={true}
        />

        {state === 'not_found' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70">
            <div className="text-center text-white">
              <AlertCircle className="w-8 h-8 mx-auto mb-1 text-yellow-400" />
              <p className="text-xs">Wajah tidak cocok</p>
            </div>
          </div>
        )}

        {state === 'scanning' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <Loader2 className="w-8 h-8 text-white animate-spin" />
          </div>
        )}

        {!hasFace && state === 'ready' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <div className="text-center text-white">
              <Camera className="w-8 h-8 mx-auto mb-1 opacity-50" />
              <p className="text-xs">Arahkan wajah ke kamera</p>
            </div>
          </div>
        )}
      </div>

      <div className={`p-2 rounded-lg text-center text-sm ${
        state === 'ready' && hasFace
          ? 'bg-green-50 text-green-700'
          : state === 'not_found'
          ? 'bg-yellow-50 text-yellow-700'
          : 'bg-gray-50 text-gray-600'
      }`}>
        {message}
      </div>

      <div className="text-xs text-gray-400 text-center">
        Tips: Lepas topi/kacamata, pastikan cahaya cukup
      </div>

      <button onClick={initScanner} className="w-full py-2 text-sm text-blue-500 hover:text-blue-600">
        Refresh Data
      </button>
    </div>
  );
}
