import React, { useState, useMemo } from 'react';
import { Button, Card } from '../components/UI';
import { getSupabaseClient } from '../services/supabase';
import { AppState } from '../types';
import {
  Upload,
  CheckCircle,
  XCircle,
  Loader2,
  Image as ImageIcon,
  AlertCircle,
  Info,
  User,
  X,
  UserCheck,
  CloudUpload,
  ArrowRight,
  FileSearch,
  Maximize2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { loadModels, processImageFile } from '../services/face';
import { setSkipSync, autoSyncToCloud, initDB } from '../services/db';

interface Props {
  state: AppState;
  notify: (msg: string, type?: 'success' | 'error') => void;
}

interface ProcessStatus {
  [studentId: string]: 'none' | 'pending' | 'processing' | 'success' | 'error';
}

interface ErrorDetails {
  [studentId: string]: string;
}

/**
 * EDUCHECK FACE BULK ENROLLMENT COMPONENT
 * Fixed and Cleaned Version
 */
export const FaceBulkEnrollment: React.FC<Props> = ({ state, notify }) => {
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [selectedFiles, setSelectedFiles] = useState<{ [studentId: string]: File }>({});
  const [previews, setPreviews] = useState<{ [studentId: string]: string }>({});
  const [status, setStatus] = useState<ProcessStatus>({});
  const [errors, setErrors] = useState<ErrorDetails>({});

  const [isProcessing, setIsProcessing] = useState(false);
  const [globalProgress, setGlobalProgress] = useState(0);

  // Filter students for the selected class
  const classStudents = useMemo(() => {
    if (!selectedClassId) return [];
    return [...state.students]
      .filter(s => s.classId === selectedClassId)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [selectedClassId, state.students]);

  // Handle file selection for a specific student
  const handleFileSelect = (studentId: string, file: File | null) => {
    if (!file) {
      const newFiles = { ...selectedFiles };
      delete newFiles[studentId];
      setSelectedFiles(newFiles);

      const newPreviews = { ...previews };
      if (newPreviews[studentId]) {
        URL.revokeObjectURL(newPreviews[studentId]);
        delete newPreviews[studentId];
      }
      setPreviews(newPreviews);
      return;
    }

    if (!file.type.startsWith('image/')) {
      notify('File harus berupa gambar', 'error');
      return;
    }

    setSelectedFiles(prev => ({ ...prev, [studentId]: file }));

    if (previews[studentId]) {
      URL.revokeObjectURL(previews[studentId]);
    }

    const url = URL.createObjectURL(file);
    setPreviews(prev => ({ ...prev, [studentId]: url }));
    setStatus(prev => ({ ...prev, [studentId]: 'pending' }));
  };

  const handleDrop = (studentId: string, e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileSelect(studentId, file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const saveAllFaces = async () => {
    const studentIdsToProcess = Object.keys(selectedFiles);
    if (studentIdsToProcess.length === 0) {
      notify('Pilih minimal satu foto siswa', 'error');
      return;
    }

    setIsProcessing(true);
    setGlobalProgress(0);
    setSkipSync(true);

    try {
      const loaded = await loadModels();
      if (!loaded) {
        notify('Gagal memuat model pendeteksi wajah', 'error');
        setIsProcessing(false);
        return;
      }

      const total = studentIdsToProcess.length;
      let successes = 0;
      let failures = 0;

      const supabase = getSupabaseClient();
      const db = await initDB();

      for (let i = 0; i < studentIdsToProcess.length; i++) {
        const studentId = studentIdsToProcess[i];
        const file = selectedFiles[studentId];

        setStatus(prev => ({ ...prev, [studentId]: 'processing' }));

        try {
          const descriptor = await processImageFile(file);
          if (!descriptor) throw new Error('Wajah tidak terdeteksi');

          const embeddingStr = Array.from(descriptor).join(',');

          // Update Cloud
          await supabase.from('students').update({
            face_embedding: embeddingStr,
            face_vector: embeddingStr
          }).eq('id', studentId);

          // Update Local
          const student = await db.get('students', studentId);
          if (student) await db.put('students', { ...student, face_embedding: embeddingStr });
          localStorage.setItem(`face_embedding_${studentId}`, embeddingStr);

          setStatus(prev => ({ ...prev, [studentId]: 'success' }));
          successes++;
        } catch (err: any) {
          console.error(`Error processing student ${studentId}:`, err);
          setStatus(prev => ({ ...prev, [studentId]: 'error' }));
          setErrors(prev => ({ ...prev, [studentId]: err.message || 'Gagal' }));
          failures++;
        }

        setGlobalProgress(Math.round(((i + 1) / total) * 100));
      }

      notify(`Berhasil mendaftarkan ${successes} wajah. ${failures > 0 ? `${failures} gagal.` : ''}`, failures > 0 ? 'error' : 'success');
    } catch (error) {
      console.error('Fatal error:', error);
      notify('Terjadi kesalahan sistem', 'error');
    } finally {
      setIsProcessing(false);
      setSkipSync(false);
      await autoSyncToCloud();
    }
  };

  const clearSelection = () => {
    Object.values(previews).forEach(url => URL.revokeObjectURL(url));
    setSelectedFiles({});
    setPreviews({});
    setStatus({});
    setErrors({});
    setGlobalProgress(0);
  };

  return (
    <div className="flex flex-col min-h-[60vh] animate-in fade-in duration-500 -m-5">
      <div className="flex-1 p-6 lg:p-10 w-full space-y-6 lg:space-y-10">
        <header className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 border-b border-gray-100 pb-8">
          <div className="space-y-1.5">
            <div className="flex items-center gap-3 text-emerald-600 mb-1">
              <div className="p-1.5 bg-emerald-50 rounded-lg">
                <UserCheck size={20} />
              </div>
              <span className="text-xs font-black uppercase tracking-[0.2em]">Sistem Pendaftaran</span>
            </div>
            <h2 className="text-2xl lg:text-3xl font-bold text-gray-900 tracking-tight">Pendaftaran Wajah Massal</h2>
            <p className="text-sm text-gray-500 font-medium">Unggah foto wajah siswa satu kelas dengan presisi data yang terjamin.</p>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            {selectedClassId && (
              <button 
                onClick={clearSelection} 
                className="text-xs font-bold text-gray-400 hover:text-red-500 transition-colors uppercase tracking-wider px-3 py-2" 
                disabled={isProcessing}
              >
                Atur Ulang
              </button>
            )}
            <div className="relative min-w-[240px]">
              <select
                value={selectedClassId}
                onChange={(e) => { setSelectedClassId(e.target.value); clearSelection(); }}
                className="w-full h-11 px-5 rounded-xl border border-gray-200 bg-white focus:border-emerald-500 transition-all text-sm font-bold appearance-none shadow-sm cursor-pointer"
                disabled={isProcessing}
              >
                <option value="">Pilih Kelas</option>
                {[...state.classes].sort((a,b) => a.name.localeCompare(b.name)).map((cls) => (
                  <option key={cls.id} value={cls.id}>{cls.name}</option>
                ))}
              </select>
            </div>
          </div>
        </header>

        {!selectedClassId ? (
          <div className="py-24 flex flex-col items-center text-center space-y-6">
            <div className="w-20 h-20 bg-gray-50 text-gray-200 rounded-[28px] flex items-center justify-center border-2 border-dashed border-gray-100 animate-pulse">
              <FileSearch size={40} />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-bold text-gray-600">Kelas Belum Dipilih</h3>
              <p className="text-sm text-gray-400 max-w-xs">Pilih kelas dari menu dropdown di atas untuk memulai navigasi data siswa.</p>
            </div>
          </div>
        ) : (
          <div className="space-y-8 pb-10">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white border border-gray-100 p-4 rounded-2xl flex items-center gap-4">
                <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center">
                  <User size={20} />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Total Siswa</p>
                  <p className="text-xl font-bold text-gray-900 leading-none mt-1">{classStudents.length}</p>
                </div>
              </div>
              <div className="bg-white border border-gray-100 p-4 rounded-2xl flex items-center gap-4">
                <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center">
                  <ImageIcon size={20} />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Foto Terpilih</p>
                  <p className="text-xl font-bold text-gray-900 leading-none mt-1">{Object.keys(selectedFiles).length}</p>
                </div>
              </div>
              <div className="sm:col-span-2 bg-emerald-600/5 border border-emerald-100 p-4 rounded-2xl flex items-center gap-4">
                <div className="w-10 h-10 bg-emerald-500 text-white rounded-xl flex items-center justify-center shadow-md shadow-emerald-200">
                  <Info size={20} />
                </div>
                <div className="flex-1">
                  <p className="text-xs font-bold text-emerald-800 tracking-tight">Panduan: Pencocokan Siswa</p>
                  <p className="text-[11px] text-emerald-600 font-medium opacity-80 leading-relaxed mt-0.5">Tarik file foto langsung ke kotak di samping nama siswa.</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-5">
              <AnimatePresence mode="popLayout">
                {classStudents.map((student) => (
                  <motion.div key={student.id} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.2 }} layout>
                    <Card className={`group relative p-3 border-2 transition-all duration-300 h-full overflow-hidden ${status[student.id] === 'success' ? 'border-emerald-500/20 bg-emerald-50/20' :
                        status[student.id] === 'error' ? 'border-red-500/20 bg-red-50/20' :
                          previews[student.id] ? 'border-blue-500/20 bg-blue-50/10' : 'border-gray-50 bg-white hover:border-gray-200 shadow-sm'
                      }`}>
                      <div className="flex flex-col h-full space-y-3">
                        <div className="flex items-start justify-between min-h-[40px]">
                          <div className="min-w-0 pr-2">
                            <h4 className="text-sm font-bold text-gray-800 truncate leading-tight uppercase font-outfit">{student.name}</h4>
                            <span className="text-[9px] font-black text-gray-400 tracking-widest">{student.id}</span>
                          </div>
                          {status[student.id] && (
                            <div className="shrink-0">
                              {status[student.id] === 'processing' && <Loader2 className="animate-spin text-emerald-500" size={16} />}
                              {status[student.id] === 'success' && <CheckCircle className="text-emerald-500" size={18} />}
                              {status[student.id] === 'error' && <XCircle className="text-red-500" size={18} />}
                            </div>
                          )}
                        </div>
                        <div
                          onDrop={(e) => handleDrop(student.id, e)} onDragOver={handleDragOver}
                          onClick={() => document.getElementById(`file-${student.id}`)?.click()}
                          className="relative aspect-[4/3] rounded-xl border border-gray-200 flex flex-col items-center justify-center cursor-pointer overflow-hidden bg-gray-50/50 hover:bg-emerald-50/30 transition-all"
                        >
                          <input id={`file-${student.id}`} type="file" className="hidden" onChange={(e) => handleFileSelect(student.id, e.target.files?.[0] || null)} accept="image/*" disabled={isProcessing} />
                          {previews[student.id] ? (
                            <>
                              <img src={previews[student.id]} alt={student.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                              <button onClick={(e) => { e.stopPropagation(); handleFileSelect(student.id, null); }} className="absolute top-2 right-2 p-1 bg-white/90 rounded-lg shadow-sm"><X size={12} /></button>
                            </>
                          ) : (
                            <div className="flex flex-col items-center gap-2">
                              <div className="w-9 h-9 bg-white rounded-xl flex items-center justify-center text-emerald-400 border border-gray-100 shadow-sm">
                                <Upload size={16} />
                              </div>
                              <span className="text-[10px] font-black text-gray-300 uppercase tracking-widest">Box Foto</span>
                            </div>
                          )}
                        </div>
                        {errors[student.id] && <div className="text-[9px] text-red-500 font-bold bg-red-50 p-1.5 rounded-lg border border-red-100">{errors[student.id]}</div>}
                      </div>
                    </Card>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
        )}
      </div>

      <AnimatePresence>
        {selectedClassId && (
          <motion.div key="action-bar" initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }} className="sticky bottom-0 z-50 w-full">
            <div className="bg-white/90 border-t border-emerald-100 shadow-[0_-10px_40px_rgba(16,185,129,0.1)] p-6 sm:px-10 backdrop-blur-md rounded-t-3xl">
              <div className="flex flex-col sm:flex-row items-center gap-6">
                <div className="flex-1 w-full space-y-3">
                  <div className="flex items-center justify-between text-gray-800">
                    <div className="flex items-center gap-3">
                      {isProcessing ? <Loader2 className="w-5 h-5 text-emerald-500 animate-spin" /> : <CloudUpload size={18} className="text-emerald-500" />}
                      <span className="text-[11px] font-black uppercase tracking-widest">
                        {isProcessing ? `Menyinkronkan... ${globalProgress}%` : `Siap Diproses • ${Object.keys(selectedFiles).length} Foto`}
                      </span>
                    </div>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <motion.div className="h-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]" initial={{ width: 0 }} animate={{ width: isProcessing ? `${globalProgress}%` : `${(Object.keys(selectedFiles).length / Math.max(classStudents.length, 1)) * 100}%` }} transition={{ duration: 0.3 }} />
                  </div>
                </div>
                <div className="shrink-0 w-full sm:w-auto">
                  <Button onClick={saveAllFaces} disabled={isProcessing || Object.keys(selectedFiles).length === 0} className="w-full !px-8 h-12 rounded-2xl text-[11px] bg-emerald-500 text-white font-black uppercase tracking-widest shadow-lg shadow-emerald-200">
                    {isProcessing ? 'Memproses...' : <span className="flex items-center gap-2">Mulai Pendaftaran <ArrowRight size={14} /></span>}
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default FaceBulkEnrollment;