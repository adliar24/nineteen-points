import React, { useState } from 'react';
import { Camera, UserPlus, Loader2, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { enrollNewStudent, getFaceIOErrorMessage } from '../../services/faceIO';

interface FaceIOEnrollmentProps {
  studentId: string;
  studentName: string;
  onSuccess?: (facialId: string) => void;
  onError?: (error: string) => void;
  onCancel?: () => void;
}

type EnrollmentState = 'idle' | 'enrolling' | 'success' | 'error';

export default function FaceIOEnrollment({ 
  studentId, 
  studentName, 
  onSuccess, 
  onError,
  onCancel 
}: FaceIOEnrollmentProps) {
  const [state, setState] = useState<EnrollmentState>('idle');
  const [message, setMessage] = useState('');
  
  const handleEnroll = async () => {
    setState('enrolling');
    setMessage('Memuat kamera...');
    
    try {
      const result = await enrollNewStudent(studentId, studentName);
      
      if (result.success && result.facialId) {
        setState('success');
        setMessage('Wajah berhasil didaftarkan!');
        onSuccess?.(result.facialId);
      } else {
        setState('error');
        setMessage(result.error || 'Gagal mendaftarkan wajah');
        onError?.(result.error || 'Gagal mendaftarkan wajah');
      }
    } catch (error: any) {
      setState('error');
      const errorMsg = getFaceIOErrorMessage(error);
      setMessage(errorMsg);
      onError?.(errorMsg);
    }
  };
  
  if (state === 'success') {
    return (
      <div className="flex flex-col items-center justify-center p-8 space-y-4 bg-emerald-50 rounded-xl">
        <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center">
          <CheckCircle className="w-8 h-8 text-emerald-500" />
        </div>
        <p className="text-lg font-medium text-emerald-700">{message}</p>
        <p className="text-sm text-emerald-600">{studentName}</p>
      </div>
    );
  }
  
  if (state === 'error') {
    return (
      <div className="space-y-4">
        <div className="flex flex-col items-center justify-center p-6 bg-red-50 rounded-xl">
          <XCircle className="w-10 h-10 text-red-500 mb-2" />
          <p className="text-sm text-red-600 text-center">{message}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleEnroll}
            className="flex-1 py-3 bg-emerald-500 text-white rounded-lg font-medium hover:bg-emerald-600 transition-colors"
          >
            Coba Lagi
          </button>
          {onCancel && (
            <button
              onClick={onCancel}
              className="px-4 py-3 bg-gray-100 text-gray-600 rounded-lg font-medium hover:bg-gray-200 transition-colors"
            >
              Batal
            </button>
          )}
        </div>
      </div>
    );
  }
  
  return (
    <div className="space-y-4">
      <div className="text-center">
        <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
          <UserPlus className="w-10 h-10 text-blue-500" />
        </div>
        <h3 className="font-semibold text-gray-900">Daftarkan Wajah</h3>
        <p className="text-sm text-gray-500 mt-1">{studentName}</p>
      </div>
      
      {message && (
        <div className="flex items-center gap-2 text-sm text-gray-600 justify-center">
          {state === 'enrolling' && <Loader2 className="w-4 h-4 animate-spin" />}
          <span>{message}</span>
        </div>
      )}
      
      <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
        <div className="flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-blue-500 mt-0.5" />
          <p className="text-xs text-blue-700">
            Pastikan wajah terlihat jelas, pencahayaan cukup, dan kacamata dilepas (jika ada).
          </p>
        </div>
      </div>
      
      <div className="flex gap-2">
        <button
          onClick={handleEnroll}
          disabled={state === 'enrolling'}
          className="flex-1 flex items-center justify-center gap-2 py-3 bg-emerald-500 text-white rounded-lg font-medium hover:bg-emerald-600 transition-colors disabled:opacity-50"
        >
          {state === 'enrolling' ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Mohon Tunggu...</span>
            </>
          ) : (
            <>
              <Camera className="w-5 h-5" />
              <span>Mulai Pendaftaran</span>
            </>
          )}
        </button>
        {onCancel && (
          <button
            onClick={onCancel}
            className="px-4 py-3 bg-gray-100 text-gray-600 rounded-lg font-medium hover:bg-gray-200 transition-colors"
          >
            Batal
          </button>
        )}
      </div>
    </div>
  );
}