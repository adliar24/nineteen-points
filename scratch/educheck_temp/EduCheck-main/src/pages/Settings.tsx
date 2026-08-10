import React, { Suspense, useRef, useState, useEffect, lazy } from 'react';
import { AppState, getCurrentSchoolName, TeacherProfile } from '../types';
import { saveTeacherProfile } from '../services/db';
import { Button, Card, Modal, ConfirmModal } from '../components/UI';
import { resetAllData, getFullState, initDB } from '../services/db';
import { Setup } from './Setup';
import { Trash2, Save, Upload, LogOut, UserCog, Database, Users, Archive, RefreshCw, Cloud, Loader2, User, ScanFace, Download } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

const FaceBulkEnrollment = lazy(() => import('./FaceBulkEnrollment'));

const LazyAuth = React.lazy(() =>
  import('../components/Auth').then((module) => ({ default: module.Auth }))
);

const loadSyncService = async () => {
  const { syncService } = await import('../services/sync');
  return syncService;
};

interface Props {
  state: AppState;
  refresh: () => void;
  notify: (msg: string, type?: 'success' | 'error') => void;
  authUser?: any;
  onSignOut?: () => Promise<void> | void;
}

export const Settings: React.FC<Props> = ({ state, refresh, notify, authUser, onSignOut }) => {
  const [isEditing, setIsEditing] = useState(false);
  
  // Modals
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);
  const [isRestoreModalOpen, setIsRestoreModalOpen] = useState(false);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [isExitModalOpen, setIsExitModalOpen] = useState(false);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [isSchoolPickerOpen, setIsSchoolPickerOpen] = useState(false);
  const [isFaceEnrollmentOpen, setIsFaceEnrollmentOpen] = useState(false);
  const [isPrivacyModalOpen, setIsPrivacyModalOpen] = useState(false);
  const [isTermsModalOpen, setIsTermsModalOpen] = useState(false);
  
  // Restore State
  const [restoreMode, setRestoreMode] = useState<'full' | 'master' | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- SYNC STATE (SUPABASE) ---
  const [user, setUser] = useState<any>(null);
  const [lastSyncTime, setLastSyncTime] = useState<string>('-');
  const [isSyncing, setIsSyncing] = useState(false);
  const [canInstall, setCanInstall] = useState(false);

  // Load user and sync state on mount
  useEffect(() => {
    const handleInstallable = (e: any) => {
      if (e.detail) setCanInstall(true);
    };
    window.addEventListener('pwa-installable', handleInstallable);
    
    // Check if already in standalone mode
    if (window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone) {
      setCanInstall(false);
    }

    const initSync = async () => {
      if (authUser) setUser(authUser);
      else {
        try {
          const syncService = await loadSyncService();
          const u = await syncService.getUser();
          setUser(u);
        } catch {
          setUser(null);
        }
      }
      
      if (state.teacher?.lastSyncTimestamp) {
        setLastSyncTime(new Date(state.teacher.lastSyncTimestamp).toLocaleString('id-ID', { 
          day: '2-digit', 
          month: 'long', 
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        }).replace(/\./g, ':'));
      }
    };
    initSync();

    return () => {
      window.removeEventListener('pwa-installable', handleInstallable);
    };
  }, [authUser, state.teacher]);

  const handleInstallApp = async () => {
    const prompt = (window as any).deferredPrompt || (window as any).parent?.deferredPrompt;
    // We actually stored it in a global variable in App.tsx
    // Let's use a simpler approach: use a global variable on window
    const win = window as any;
    if (win.deferredPrompt) {
      win.deferredPrompt.prompt();
      const { outcome } = await win.deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setCanInstall(false);
        win.deferredPrompt = null;
      }
    }
  };

  const handleSyncDrive = async () => {
    if (!user) return;
    
    setIsSyncing(true);
    try {
      const syncService = await loadSyncService();
      await syncService.syncDrive();
      
      const now = new Date();
      setLastSyncTime(now.toLocaleString('id-ID', { 
        day: '2-digit', 
        month: 'long', 
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }).replace(/\./g, ':'));
      
      notify("Sinkronisasi Cloud berhasil!", "success");
      refresh();
    } catch (e: any) {
      notify(e.message || "Gagal sinkronisasi", "error");
    } finally {
      setIsSyncing(false);
    }
  };

  const handlePullFromCloud = async () => {
    if (!user) return;
    if (!confirm("Tarik data dari Cloud akan menimpa data lokal Anda (jika ada konflik). Lanjutkan?")) return;

    setIsSyncing(true);
    try {
      const syncService = await loadSyncService();
      const res = await syncService.pullFromCloud();
      if (res.success) {
        notify("Data berhasil ditarik dari Cloud", "success");
        refresh();
      } else {
        notify(res.message, "error");
      }
    } catch (e: any) {
      notify(e.message || "Gagal menarik data", "error");
    } finally {
      setIsSyncing(false);
    }
  };

  const performLogout = async () => {
    setUser(null);
    if (onSignOut) await onSignOut();
    else {
      const syncService = await loadSyncService();
      await syncService.signOut();
    }
    notify("Keluar dari akun guru");
  };

  const handleLogoutCloud = async () => {
    if (!confirm("Logout dari akun EduCheck?")) return;
    await performLogout();
  };

  // --- HANDLERS ---
  const handleSwitchSchool = async (index: number) => {
    if (!state.teacher) return;
    const updated: TeacherProfile = {
      ...state.teacher,
      currentSchoolIndex: index,
    };
    await saveTeacherProfile(updated);
    refresh();
  };



  // --- EXISTING LOGIC ---

  const handleConfirmReset = async () => {
    await resetAllData();
    if (onSignOut) {
      await onSignOut();
    }
    window.location.href = '/';
  };

  const handleConfirmExit = async () => {
    try {
      window.close();
    } catch (e) {}
    if (onSignOut) {
      await onSignOut();
    }
    window.location.href = '/';
  };

  const triggerDownload = (data: any, filename: string) => {
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${filename}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleFullBackup = async () => {
    const fullState = await getFullState();
    triggerDownload(fullState, `EduCheck_FullBackup_${new Date().toISOString().slice(0,10)}`);
    setIsBackupModalOpen(false);
    notify("Backup Lengkap berhasil diunduh");
  };

  const handleMasterBackup = async () => {
    const fullState = await getFullState();
    const masterData = {
        teacher: fullState.teacher,
        classes: fullState.classes,
        students: fullState.students,
        sessions: [],
        records: [],
        schedules: [],
        events: [],
        cancellations: [],
        activeClassId: null
    };
    triggerDownload(masterData, `EduCheck_MasterData_${new Date().toISOString().slice(0,10)}`);
    setIsBackupModalOpen(false);
    notify("Backup Data Master berhasil diunduh");
  };

  const triggerRestoreFile = (mode: 'full' | 'master') => {
      setRestoreMode(mode);
      setIsRestoreModalOpen(false);
      setTimeout(() => {
        if (fileInputRef.current) fileInputRef.current.click();
      }, 200);
  };

  const handleRestore = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !restoreMode) return; 

    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        if (!data.teacher || !data.classes) throw new Error("Invalid format");
        
        const confirmMsg = restoreMode === 'full' 
            ? "Restore Lengkap: Data Guru, Kelas, Siswa, Jadwal, dan Absensi akan dipulihkan/ditimpa. Lanjutkan?"
            : "Restore Master: HANYA Data Guru, Kelas, dan Siswa yang akan dipulihkan. Data absensi di file akan DIABAIKAN. Lanjutkan?";

        if(confirm(confirmMsg)) {
           const db = await initDB();
           const tx = db.transaction(['teacher', 'classes', 'students', 'sessions', 'records', 'schedules', 'events', 'cancellations'], 'readwrite');
           
           if (data.teacher) await tx.objectStore('teacher').put(data.teacher);
           
           if (data.classes && Array.isArray(data.classes)) {
               for(const c of data.classes) await tx.objectStore('classes').put(c);
           }
           if (data.students && Array.isArray(data.students)) {
               for(const s of data.students) await tx.objectStore('students').put(s);
           }

           if (restoreMode === 'full') {
               if (data.sessions && Array.isArray(data.sessions)) {
                   for(const s of data.sessions) await tx.objectStore('sessions').put(s);
               }
               if (data.records && Array.isArray(data.records)) {
                   for(const r of data.records) await tx.objectStore('records').put(r);
               }
               if (data.schedules && Array.isArray(data.schedules)) {
                   for(const s of data.schedules) await tx.objectStore('schedules').put(s);
               }
               if (data.events && Array.isArray(data.events)) {
                   for(const ev of data.events) await tx.objectStore('events').put(ev);
               }
               if (data.cancellations && Array.isArray(data.cancellations)) {
                   for(const c of data.cancellations) await tx.objectStore('cancellations').put(c);
               }
           }
           
           await tx.done;
           notify(restoreMode === 'full' ? "Restore Lengkap Berhasil" : "Restore Data Master Berhasil");
           refresh();
        }
      } catch (err) {
        console.error(err);
        notify("Gagal restore: File korup atau format salah.", "error");
      } finally {
        setRestoreMode(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  if (isEditing) {
    return (
      <div className="p-4 max-w-2xl mx-auto">
        <Button onClick={() => setIsEditing(false)} variant="secondary" className="mb-4">Batal</Button>
        <Setup initialData={state.teacher} onComplete={() => { setIsEditing(false); refresh(); }} />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-full">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Pengaturan</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
        {/* COLUMN 1: PROFILE */}
        <Card className="p-8 flex flex-col gap-6 h-full min-h-[400px] justify-center bg-white border border-gray-100 shadow-sm hover:shadow-md transition-all">
            <div className="flex flex-col items-center text-center">
               <div className="w-24 h-24 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600 mb-6">
                  <UserCog className="w-10 h-10" />
               </div>
               <h3 className="font-bold text-3xl text-gray-900 mb-2">{state.teacher?.teacherName}</h3>
               
                 {/* School Switcher in Profile */}
                {state.teacher && state.teacher.schools && state.teacher.schools.length > 0 && (
                  <div className="mt-3">
                    <button
                      onClick={() => setIsSchoolPickerOpen(true)}
                      className="flex items-center justify-center gap-2 w-full max-w-xs px-5 py-3 bg-emerald-50 border-2 border-emerald-200 rounded-xl text-emerald-700 font-medium hover:bg-emerald-100 hover:border-emerald-300 transition-all"
                    >
                      <span>{getCurrentSchoolName(state.teacher)}</span>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {state.teacher.schools && state.teacher.schools.length > 1 && (
                      <p className="text-xs text-gray-400 mt-2">Klik untuk mengganti sekolah</p>
                    )}
                  </div>
                )}

               <div className="mt-4 px-4 py-2 bg-emerald-50 text-emerald-700 font-bold rounded-xl border border-emerald-100 inline-block">
                  Tahun Ajaran {state.teacher?.schoolYear}
               </div>
            </div>
            <div className="mt-4 flex justify-center">
               <Button onClick={() => setIsEditing(true)} className="w-full md:w-auto px-8">Edit Profil Guru</Button>
            </div>
        </Card>

        {/* COLUMN 2: DATA MANAGEMENT */}
        <div className="flex flex-col gap-6">
            <Card className="p-8 h-full bg-white border border-gray-100 shadow-sm">
                <div className="flex items-center gap-3 mb-6">
                   <div className="bg-blue-50 p-2.5 rounded-xl text-blue-600">
                      <Database className="w-6 h-6" />
                   </div>
                   <h3 className="font-bold text-gray-900 text-xl">Manajemen Data</h3>
                </div>
                
                <div className="flex flex-col gap-4">
                    <Button variant="secondary" onClick={() => setIsBackupModalOpen(true)} className="justify-start py-4">
                        <Save className="w-5 h-5 mr-3" /> Cadangkan Data (JSON)
                    </Button>
                    
                    {/* Hidden Input for File */}
                    <input type="file" accept=".json" ref={fileInputRef} onChange={handleRestore} className="hidden" />
                    
                    <Button variant="secondary" onClick={() => setIsRestoreModalOpen(true)} className="justify-start py-4">
                        <Upload className="w-5 h-5 mr-3" /> Pulihkan Data (JSON)
                    </Button>

                    <Button variant="secondary" onClick={() => setIsSyncModalOpen(true)} className="justify-start py-4 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-100">
                        <Cloud className="w-5 h-5 mr-3" /> Sinkronisasi (Cloud)
                    </Button>

                    <Button variant="secondary" onClick={() => setIsFaceEnrollmentOpen(true)} className="justify-start py-4 bg-violet-50 text-violet-700 hover:bg-violet-100 border border-violet-100">
                        <ScanFace className="w-5 h-5 mr-3" /> Pendaftaran Wajah Massal
                    </Button>

                    {canInstall && (
                      <Button onClick={handleInstallApp} className="justify-start py-4 bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-200">
                          <Download className="w-5 h-5 mr-3" /> Instal Aplikasi ke Perangkat
                      </Button>
                    )}

                    <div className="border-t border-gray-100 my-4"></div>
                    
                    <Button variant="danger" onClick={() => setIsResetModalOpen(true)} className="justify-start py-4">
                        <Trash2 className="w-5 h-5 mr-3" /> Reset Aplikasi (Hapus Semua)
                    </Button>
                    
                    <div className="border-t border-gray-100 my-4"></div>
                    
                    <div className="flex gap-2">
                        <button onClick={() => setIsPrivacyModalOpen(true)} className="text-[10px] text-gray-400 hover:text-emerald-600 transition-colors">Kebijakan Privasi</button>
                        <span className="text-[10px] text-gray-300">•</span>
                        <button onClick={() => setIsTermsModalOpen(true)} className="text-[10px] text-gray-400 hover:text-emerald-600 transition-colors">Syarat & Ketentuan</button>
                    </div>
                </div>
            </Card>

            <Card className="p-6 bg-red-50 border border-red-100 shadow-none">
                <div className="flex items-center justify-between">
                    <div>
                        <h4 className="font-bold text-red-900">Keluar</h4>
                        <p className="text-red-700/70 text-sm">Logout dan kembali ke halaman login</p>
                    </div>
                    <Button variant="outline" onClick={() => setIsExitModalOpen(true)} className="border-red-200 text-red-600 hover:bg-red-100 hover:border-red-300">
                        <LogOut className="w-5 h-5 mr-2" /> Logout
                    </Button>
                </div>
            </Card>
        </div>
      </div>
      

      {/* SYNC MODAL */}
      <Modal isOpen={isSyncModalOpen} onClose={() => setIsSyncModalOpen(false)} title="Sync Drive Cloud">
         {!user ? (
            <Suspense fallback={<div className="py-8 text-center text-sm text-gray-500">Memuat autentikasi cloud...</div>}>
              <LazyAuth onSuccess={(u) => setUser(u)} notify={notify} />
            </Suspense>
         ) : (
            <div className="flex flex-col gap-6">
                <div className="flex items-center gap-4 p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
                    <div className="w-12 h-12 rounded-full bg-emerald-500 flex items-center justify-center text-white">
                        <User className="w-6 h-6" />
                    </div>
                    <div className="overflow-hidden">
                        <p className="text-xs font-bold text-emerald-600 uppercase tracking-widest">Akun Terhubung</p>
                        <p className="font-bold text-gray-900 truncate">{user.email}</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-4">
                    <div className="bg-gray-50 border border-gray-200 p-4 rounded-2xl flex justify-between items-center">
                        <div>
                            <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider">SINKRONISASI TERAKHIR</span>
                            <div className="font-bold text-gray-800 mt-0.5">{lastSyncTime}</div>
                        </div>
                        <RefreshCw className={`w-5 h-5 text-emerald-500 ${isSyncing ? 'animate-spin' : ''}`} />
                    </div>
                </div>

                <p className="text-xs text-gray-500 leading-relaxed text-center px-2">
                    Sinkronisasi akan mengunggah data lokal ke Cloud dan mengambil data terbaru dari perangkat lain secara manual.
                </p>

                <div className="flex flex-col gap-3">
                    <Button 
                        onClick={handleSyncDrive} 
                        isLoading={isSyncing} 
                        className="w-full !py-4 text-base font-bold shadow-xl shadow-emerald-200"
                    >
                        {isSyncing ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Cloud className="w-5 h-5 mr-2" />}
                        {isSyncing ? 'Sinkronisasi...' : 'Sync Drive Sekarang'}
                    </Button>

                    <Button 
                        onClick={handlePullFromCloud} 
                        variant="secondary"
                        disabled={isSyncing}
                        className="w-full !py-3 text-emerald-700 bg-emerald-50 border-emerald-100"
                    >
                        <Download className="w-5 h-5 mr-2" /> Tarik Data dari Cloud (Download)
                    </Button>
                    
                    <Button 
                        onClick={handleLogoutCloud} 
                        variant="outline" 
                        disabled={isSyncing}
                        className="w-full !py-3 text-red-500 border-red-200 hover:bg-red-50"
                    >
                        Logout dari Cloud
                    </Button>
                </div>
            </div>
         )}
      </Modal>

      {/* BACKUP CHOICE MODAL */}
      <Modal isOpen={isBackupModalOpen} onClose={() => setIsBackupModalOpen(false)} title="Pilih Jenis Backup">
          <div className="flex flex-col gap-4">
              <button 
                onClick={handleFullBackup}
                className="flex items-start gap-4 p-5 rounded-2xl border border-gray-200 hover:border-emerald-500 hover:bg-emerald-50 transition-all text-left group"
              >
                  <div className="bg-emerald-100 text-emerald-600 p-3 rounded-xl group-hover:bg-emerald-500 group-hover:text-white transition-colors">
                      <Archive className="w-6 h-6" />
                  </div>
                  <div>
                      <h4 className="font-bold text-gray-900 text-lg">Backup Lengkap (Full)</h4>
                      <p className="text-sm text-gray-500 mt-1">Simpan semua data termasuk profil, kelas, siswa, riwayat absensi, jadwal, dan catatan.</p>
                  </div>
              </button>

              <button 
                onClick={handleMasterBackup}
                className="flex items-start gap-4 p-5 rounded-2xl border border-gray-200 hover:border-blue-500 hover:bg-blue-50 transition-all text-left group"
              >
                  <div className="bg-blue-100 text-blue-600 p-3 rounded-xl group-hover:bg-blue-500 group-hover:text-white transition-colors">
                      <Users className="w-6 h-6" />
                  </div>
                  <div>
                      <h4 className="font-bold text-gray-900 text-lg">Backup Data Master Saja</h4>
                      <p className="text-sm text-gray-500 mt-1">Hanya menyimpan <strong>Profil Guru, Data Kelas, dan Data Siswa</strong>. Riwayat absensi tidak disertakan.</p>
                  </div>
              </button>
          </div>
      </Modal>

      {/* RESTORE CHOICE MODAL */}
      <Modal isOpen={isRestoreModalOpen} onClose={() => setIsRestoreModalOpen(false)} title="Pilih Jenis Restore">
          <div className="flex flex-col gap-4">
              <button 
                onClick={() => triggerRestoreFile('full')}
                className="flex items-start gap-4 p-5 rounded-2xl border border-gray-200 hover:border-emerald-500 hover:bg-emerald-50 transition-all text-left group"
              >
                  <div className="bg-emerald-100 text-emerald-600 p-3 rounded-xl group-hover:bg-emerald-500 group-hover:text-white transition-colors">
                      <RefreshCw className="w-6 h-6" />
                  </div>
                  <div>
                      <h4 className="font-bold text-gray-900 text-lg">Restore Lengkap (Full)</h4>
                      <p className="text-sm text-gray-500 mt-1">Pulihkan seluruh data dari file backup. Data yang ada akan ditimpa jika ID sama.</p>
                  </div>
              </button>

              <button 
                onClick={() => triggerRestoreFile('master')}
                className="flex items-start gap-4 p-5 rounded-2xl border border-gray-200 hover:border-blue-500 hover:bg-blue-50 transition-all text-left group"
              >
                  <div className="bg-blue-100 text-blue-600 p-3 rounded-xl group-hover:bg-blue-500 group-hover:text-white transition-colors">
                      <Users className="w-6 h-6" />
                  </div>
                  <div>
                      <h4 className="font-bold text-gray-900 text-lg">Restore Data Master Saja</h4>
                      <p className="text-sm text-gray-500 mt-1">Hanya memulihkan <strong>Profil Guru, Kelas, dan Siswa</strong> beserta ID uniknya. Riwayat absensi, jadwal, dan catatan pada file akan DIABAIKAN.</p>
                  </div>
              </button>
          </div>
      </Modal>

      {/* EXIT CONFIRMATION MODAL */}
      <ConfirmModal 
        isOpen={isExitModalOpen}
        onClose={() => setIsExitModalOpen(false)}
        onConfirm={async () => {
          setIsExitModalOpen(false);
          await performLogout();
        }}
        title="Konfirmasi Logout"
        description="Apakah Anda yakin ingin logout? Anda akan kembali ke halaman login."
        confirmText="Ya, Logout"
        cancelText="Batal"
        variant="danger"
      />

      {/* RESET CONFIRMATION MODAL */}
      <ConfirmModal 
        isOpen={isResetModalOpen}
        onClose={() => setIsResetModalOpen(false)}
        onConfirm={handleConfirmReset}
        title="Reset Aplikasi?"
        description="PERINGATAN: Tindakan ini akan MENGHAPUS SEMUA DATA (Profil, Kelas, Siswa, Absensi) secara permanen. Aplikasi akan kembali ke pengaturan awal. Apakah Anda yakin?"
        confirmText="Ya, Hapus Semua"
        cancelText="Batal"
        variant="danger"
      />

      {/* SCHOOL PICKER MODAL */}
      <AnimatePresence>
        {isSchoolPickerOpen && state?.teacher && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            onClick={() => setIsSchoolPickerOpen(false)}
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6 border-b border-gray-100">
                <h2 className="text-xl font-bold text-gray-900">Pilih Sekolah</h2>
                <p className="text-sm text-gray-500 mt-1">Data yang ditampilkan akan sesuai sekolah yang dipilih</p>
              </div>
              <div className="p-4">
                {state.teacher.schools.map((school, idx) => (
                  <button
                    key={idx}
                    onClick={async () => {
                      if (idx !== state.teacher.currentSchoolIndex) {
                        await handleSwitchSchool(idx);
                        refresh();
                      }
                      setIsSchoolPickerOpen(false);
                    }}
                    className={`w-full text-left px-4 py-3 rounded-xl flex items-center justify-between mb-2 last:mb-0 transition-colors ${
                      idx === state.teacher.currentSchoolIndex 
                        ? 'bg-emerald-50 text-emerald-700 border-2 border-emerald-200' 
                        : 'hover:bg-gray-50 text-gray-700 border-2 border-transparent'
                    }`}
                  >
                    <span className="font-medium">{school}</span>
                    {idx === state.teacher.currentSchoolIndex && (
                      <svg className="w-5 h-5 text-emerald-500" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
              <div className="p-4 border-t border-gray-100">
                <button 
                  onClick={() => setIsSchoolPickerOpen(false)}
                  className="w-full py-2.5 text-gray-600 font-medium hover:text-gray-800 transition-colors"
                >
                  Batal
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* FACE BULK ENROLLMENT MODAL */}
      <Modal 
        isOpen={isFaceEnrollmentOpen} 
        onClose={() => setIsFaceEnrollmentOpen(false)} 
        title="Pendaftaran Wajah Massal"
        size="3xl"
      >
        <FaceBulkEnrollment 
          state={state} 
          notify={notify}
        />
      </Modal>

      {/* PRIVACY POLICY MODAL */}
      <Modal isOpen={isPrivacyModalOpen} onClose={() => setIsPrivacyModalOpen(false)} title="Kebijakan Privasi EduCheck">
        <div className="prose prose-sm max-w-none text-gray-600 space-y-4">
            <section>
                <h4 className="font-bold text-gray-900">1. Pengumpulan Data</h4>
                <p>EduCheck mengumpulkan data profil guru, data siswa, dan data kehadiran untuk keperluan administrasi sekolah. Data wajah (biometrik) yang didaftarkan diolah secara lokal pada perangkat Anda.</p>
            </section>
            <section>
                <h4 className="font-bold text-gray-900">2. Penyimpanan Data</h4>
                <p>Data Anda disimpan secara lokal menggunakan database IndexedDB dan dapat disinkronkan ke cloud menggunakan layanan Supabase jika Anda mengaktifkan fitur Sinkronisasi Cloud.</p>
            </section>
            <section>
                <h4 className="font-bold text-gray-900">3. Keamanan</h4>
                <p>Kami berkomitmen untuk melindungi data Anda. Data biometrik disimpan dalam bentuk representasi numerik (embedding) yang tidak dapat dikembalikan menjadi gambar wajah asli.</p>
            </section>
        Section 
        </div>
      </Modal>

      {/* TERMS OF SERVICE MODAL */}
      <Modal isOpen={isTermsModalOpen} onClose={() => setIsTermsModalOpen(false)} title="Syarat & Ketentuan">
        <div className="prose prose-sm max-w-none text-gray-600 space-y-4">
            <p>Dengan menggunakan aplikasi EduCheck, Anda setuju untuk:</p>
            <ul className="list-disc pl-5 space-y-2">
                <li>Menggunakan aplikasi ini hanya untuk keperluan administrasi pendidikan yang sah.</li>
                <li>Menjaga kerahasiaan akun guru Anda.</li>
                <li>Bertanggung jawab penuh atas data siswa yang Anda masukkan ke dalam sistem.</li>
                <li>Tidak menyalahgunakan fitur pengenalan wajah untuk tujuan ilegal.</li>
            </ul>
            <p className="mt-4">EduCheck disediakan "sebagaimana adanya" tanpa jaminan apa pun.</p>
        </div>
      </Modal>
    </div>
  );
};

export default Settings;
