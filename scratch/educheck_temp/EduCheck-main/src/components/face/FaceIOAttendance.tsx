import React, { useState } from 'react';
import { Camera, UserCheck, Loader2, CheckCircle, XCircle, ArrowLeft } from 'lucide-react';
import { motion } from 'framer-motion';
import { authenticateStudent, getFaceIOErrorMessage } from '../../services/faceIO';

interface FaceIOAttendanceProps {
  classId: string;
  className?: string;
  sessionId?: string;
  onSuccess?: (studentId: string, studentName: string) => void;
  onCancel?: () => void;
}

type AttendanceState = 'idle' | 'scanning' | 'success' | 'error';

interface AttendanceResult {
  studentId: string;
  studentName: string;
  timestamp: Date;
}

export default function FaceIOAttendance({ 
  classId, 
  className,
  sessionId,
  onSuccess, 
  onCancel 
}: FaceIOAttendanceProps) {
  const [state, setState] = useState<AttendanceState>('idle');
  const [message, setMessage] = useState('');
  const [lastResult, setLastResult] = useState<AttendanceResult | null>(null);
  const [scanHistory, setScanHistory] = useState<AttendanceResult[]>([]);
  
  const handleStartScan = async () => {
    setState('scanning');
    setMessage('Memindai wajah...');
    setLastResult(null);
    
    try {
      const result = await authenticateStudent();
      
      if (result.success && result.studentId && result.studentName) {
        setState('success');
        setMessage('Wajah dikenali!');
        setLastResult({
          studentId: result.studentId,
          studentName: result.studentName,
          timestamp: new Date(),
        });
        setScanHistory(prev => [...prev.slice(-4), {
          studentId: result.studentId,
          studentName: result.studentName,
          timestamp: new Date(),
        }]);
        onSuccess?.(result.studentId, result.studentName);
      } else {
        setState('error');
        setMessage(result.error || 'Wajah tidak dikenali');
      }
    } catch (error: any) {
      setState('error');
      const errorMsg = getFaceIOErrorMessage(error);
      setMessage(errorMsg);
    }
  };
  
  if (state === 'success' && lastResult) {
    return (
      <div className="fixed inset-0 z-[100] bg-black/80 flex flex-col">
        <div className="flex-1 flex flex-col items-center justify-center">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="w-32 h-32 bg-emerald-500 rounded-full flex items-center justify-center mb-6"
          >
            <CheckCircle className="w-16 h-16 text-white" />
          </motion.div>
          
          <h2 className="text-2xl font-bold text-white mb-2">TERDETEKSI</h2>
          <p className="text-xl text-emerald-400 font-medium">{lastResult.studentName}</p>
          <p className="text-white/50 text-sm mt-2">
            {lastResult.timestamp.toLocaleTimeString('id-ID')}
          </p>
        </div>
        
        <div className="p-6 bg-gray-900">
          <button
            onClick={() => {
              setState('idle');
              setMessage('');
              setLastResult(null);
            }}
            className="w-full py-4 bg-emerald-500 text-white rounded-xl font-medium hover:bg-emerald-600 transition-colors flex items-center justify-center gap-2"
          >
            <Camera className="w-5 h-5" />
            <span>Scan Lagi</span>
          </button>
          
          {onCancel && (
            <button
              onClick={onCancel}
              className="w-full py-3 mt-3 text-white/60 hover:text-white transition-colors"
            >
              Selesai
            </button>
          )}
        </div>
      </div>
    );
  }
  
  if (state === 'error') {
    return (
      <div className="fixed inset-0 z-[100] bg-black/80 flex flex-col">
        <div className="flex-1 flex flex-col items-center justify-center p-6">
          <div className="w-24 h-24 bg-red-500/20 rounded-full flex items-center justify-center mb-6">
            <XCircle className="w-12 h-12 text-red-400" />
          </div>
          
          <h2 className="text-xl font-bold text-white mb-2">GAGAL</h2>
          <p className="text-white/70 text-center max-w-xs">{message}</p>
        </div>
        
        <div className="p-6 bg-gray-900">
          <button
            onClick={() => {
              setState('idle');
              setMessage('');
            }}
            className="w-full py-4 bg-emerald-500 text-white rounded-xl font-medium hover:bg-emerald-600 transition-colors flex items-center justify-center gap-2"
          >
            <Camera className="w-5 h-5" />
            <span>Coba Lagi</span>
          </button>
          
          {onCancel && (
            <button
              onClick={onCancel}
              className="w-full py-3 mt-3 text-white/60 hover:text-white transition-colors"
            >
              Batal
            </button>
          )}
        </div>
      </div>
    );
  }
  
  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col">
      <div className="p-4 flex items-center justify-between">
        <button
          onClick={onCancel}
          className="p-2 rounded-full bg-white/10 text-white hover:bg-white/20"
        >
          <ArrowLeft className="w-6 h-6" />
        </button>
        <div className="text-white text-center">
          <h2 className="font-bold">{className || 'Absensi Wajah'}</h2>
          <p className="text-white/50 text-sm">FaceIO Scanner</p>
        </div>
        <div className="w-10" />
      </div>
      
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="w-48 h-48 bg-gray-800 rounded-full flex items-center justify-center mb-6 relative overflow-hidden">
          {state === 'scanning' ? (
            <div className="absolute inset-0 bg-emerald-500/20 animate-pulse" />
          ) : (
            <Camera className="w-20 h-20 text-white/30" />
          )}
          <UserCheck className={`w-12 h-12 text-white/50 ${state === 'scanning' ? 'animate-pulse' : ''}`} />
        </div>
        
        {message && (
          <div className="flex items-center gap-2 text-white/80 mb-4">
            {state === 'scanning' && <Loader2 className="w-5 h-5 animate-spin" />}
            <span>{message}</span>
          </div>
        )}
        
        {scanHistory.length > 0 && (
          <div className="w-full max-w-xs">
            <p className="text-white/40 text-xs mb-2">Terakhir:</p>
            <div className="flex flex-wrap gap-2">
              {scanHistory.slice().reverse().map((item, idx) => (
                <span key={idx} className="px-2 py-1 bg-emerald-500/20 text-emerald-400 text-xs rounded">
                  {item.studentName}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
      
      <div className="p-6 bg-gray-900">
        <button
          onClick={handleStartScan}
          disabled={state === 'scanning'}
          className="w-full py-4 bg-emerald-500 text-white rounded-xl font-medium hover:bg-emerald-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {state === 'scanning' ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Memindai...</span>
            </>
          ) : (
            <>
              <Camera className="w-5 h-5" />
              <span>Mulai Absen</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}