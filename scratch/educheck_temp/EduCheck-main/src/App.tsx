import React, { useState, useEffect, useRef } from 'react';
import { 
  LayoutGrid, 
  Users, 
  QrCode, 
  PieChart, 
  Settings as SettingsIcon,
  LogOut,
  ChevronLeft,
  ChevronRight,
  School,
  CalendarClock,
  Power,
  Bell
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  TeacherProfile, 
  AppState, 
  getCurrentSchoolName 
} from './types';
import { 
  getFullState, 
  setAuthScope, 
  saveTeacherProfile 
} from './services/db';
import { syncService } from './services/sync';

// Import pages correctly based on their export styles
import { Classes } from './pages/Classes';
import { Students } from './pages/Students';
import { Attendance } from './pages/Attendance';
import { Recap } from './pages/Recap';
import Settings from './pages/Settings';
import Setup from './pages/Setup';
import { Auth } from './components/Auth';
import { Schedule } from './pages/Schedule';

// Error Boundary for Page Loading
class PageErrorBoundary extends React.Component<{ children: React.ReactNode; page: string; onReset: () => void }, { hasError: boolean }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidUpdate(prevProps: any) {
    if (prevProps.page !== this.props.page) this.setState({ hasError: false });
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-[60vh] p-6 text-center">
          <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mb-4">
            <SettingsIcon className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Ups! Terjadi Kesalahan</h2>
          <p className="text-gray-600 mb-6 max-w-xs">Gagal memuat halaman ini. Silakan coba segarkan data.</p>
          <button onClick={() => this.props.onReset()} className="px-6 py-2.5 bg-emerald-600 text-white rounded-xl font-bold shadow-lg shadow-emerald-200">Segarkan Halaman</button>
        </div>
      );
    }
    return this.props.children;
  }
}

// Custom Modal Component
const ConfirmModal = ({ isOpen, onClose, onConfirm, title, description, confirmText, cancelText }: any) => (
  <AnimatePresence>
    {isOpen && (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden" onClick={(e) => e.stopPropagation()}>
          <div className="p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-2">{title}</h3>
            <p className="text-gray-600 mb-6">{description}</p>
            <div className="flex gap-3">
              <button onClick={onClose} className="flex-1 py-3 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 transition-colors">{cancelText}</button>
              <button onClick={onConfirm} className="flex-1 py-3 bg-red-600 text-white font-bold rounded-xl shadow-lg shadow-red-200 hover:bg-red-700 transition-colors">{confirmText}</button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    )}
  </AnimatePresence>
);

const BrandLogo = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <rect x="3" y="3" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="2.5"/><rect x="14" y="3" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="2.5"/><rect x="3" y="14" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="2.5"/><circle cx="17.5" cy="17.5" r="3.5" stroke="currentColor" strokeWidth="2.5"/>
  </svg>
);

function App() {
  const [page, setPage] = useState<'auth' | 'setup' | 'classes' | 'students' | 'attendance' | 'recap' | 'settings' | 'schedule'>('auth');
  const [state, setState] = useState<AppState | null>(null);
  const [authUser, setAuthUser] = useState<any>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [pageRenderKey, setPageRenderKey] = useState(0);
  const [isExitModalOpen, setIsExitModalOpen] = useState(false);
  const [isSchoolPickerOpen, setIsSchoolPickerOpen] = useState(false);
  
  const stateRef = useRef<AppState | null>(null);
  const notifiedSchedulesRef = useRef<Set<string>>(new Set());

  const refreshData = async () => {
    try {
      const data = await getFullState(true);
      setState(data);
      stateRef.current = data;
      return data;
    } catch (error) {
      console.error('Error refreshing data:', error);
      return { teacher: null, classes: [], students: [], sessions: [], records: [], schedules: [], events: [], cancellations: [], activeClassId: null };
    }
  };

  const notify = (message: string, type: 'success' | 'error' = 'success') => setToast({ message, type });

  const applyAuthenticatedUser = async (user: any) => {
    try {
      await setAuthScope(user.id);
      setAuthUser(user);
      
      if (syncService.isConfigured()) {
        notify("Menarik data profil dari Cloud...", "success");
        console.log("[Auth] Memulai sinkronisasi otomatis...");
        const syncResult = await syncService.pullFromCloud();
        console.log("[Auth] Hasil sinkronisasi:", syncResult);
        
        // Beri jeda sangat singkat agar IndexedDB selesai menulis data
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Cek apakah ada data yang berhasil ditarik (Guru atau Kelas)
        const freshData = await refreshData();
        console.log("[Auth] Data setelah sinkronisasi:", { teacher: !!freshData.teacher, classes: freshData.classes.length });

        if (freshData.teacher || freshData.classes.length > 0) {
          console.log("[Auth] Data ditemukan! Mengarahkan ke Beranda...");
          setPage('classes');
          return;
        }
      }
    } catch (error) {
      console.error("[Auth] Error saat sinkronisasi otomatis:", error);
    }

    // Jika gagal sinkron atau data memang tidak ada, baru ke setup
    const finalData = await refreshData();
    setPage(finalData.teacher ? 'classes' : 'setup');
  };

  const handleSignOut = async () => {
    try { await syncService.signOut(); } catch (error) { console.error(error); }
    await setAuthScope(null);
    setAuthUser(null);
    setState(null);
    setPage('auth');
  };

  const handleConfirmExit = () => {
    setIsExitModalOpen(false);
    if (window.navigator.userAgent.match(/Android|iPhone/i)) window.history.back();
    window.close();
    setTimeout(() => { window.location.href = 'about:blank'; }, 100);
  };

  const setActiveClassId = async (id: string | null) => {
    if (state) {
      const newState = { ...state, activeClassId: id };
      setState(newState);
      stateRef.current = newState;
      localStorage.setItem('activeClassId', id || '');
    }
  };

  useEffect(() => {
    const init = async () => {
      const user = await syncService.getUser();
      if (user) await applyAuthenticatedUser(user);
      else {
        const data = await refreshData();
        if (data.teacher) setPage('classes');
        else if (data.classes.length > 0) setPage('setup');
        else setPage('auth');
      }
    };
    init();
  }, []);

  useEffect(() => {
    const checkNotifications = () => {
        const appState = stateRef.current;
        if (!appState || !appState.teacher || !appState.teacher.notificationMinutes) return;
        if (Notification.permission !== 'granted') return;
        const buffer = appState.teacher.notificationMinutes;
        const now = new Date();
        const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
        const dayName = days[now.getDay()];
        const currentMinutes = now.getHours() * 60 + now.getMinutes();
        const todayStr = now.toISOString().split('T')[0];
        const todayEvent = appState.events.find(e => e.dateISO === todayStr);
        if (todayEvent && todayEvent.isFullDay) return;
        appState.schedules.forEach(schedule => {
            if (schedule.dayName === dayName) {
                const [h, m] = schedule.startTime.split(':').map(Number);
                const startMinutes = h * 60 + m;
                const timeDiff = startMinutes - currentMinutes;
                if (timeDiff > 0 && timeDiff <= buffer) {
                    const uniqueId = `${todayStr}-${schedule.id}`;
                    if (!notifiedSchedulesRef.current.has(uniqueId)) {
                        const cls = appState.classes.find(c => c.id === schedule.classId);
                        new Notification("EduCheck: Waktunya Absensi", { body: `Kelas ${cls?.name || 'Anda'} akan dimulai dalam ${timeDiff} menit (${schedule.startTime}).`, icon: "/icon-192.png" });
                        notifiedSchedulesRef.current.add(uniqueId);
                    }
                }
            }
        });
    };
    const interval = setInterval(checkNotifications, 60000);
    checkNotifications();
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  useEffect(() => {
    if (page === 'classes' && state?.teacher) {
      const welcomed = sessionStorage.getItem(`welcome_${state.teacher.id}`);
      if (!welcomed) {
        notify(`Selamat datang kembali, ${state.teacher.teacherName}!`, "success");
        sessionStorage.setItem(`welcome_${state.teacher.id}`, 'true');
      }
    }
  }, [page, state?.teacher]);

  const handleNavClick = (p: typeof page) => setPage(p);

  const getPageTitle = () => {
    switch (page) {
      case 'classes': return 'Beranda';
      case 'students': return 'Data Kelas';
      case 'attendance': return 'Absensi';
      case 'recap': return 'Rekapitulasi';
      case 'settings': return 'Pengaturan';
      case 'schedule': return 'Jadwal';
      default: return 'EduCheck';
    }
  };

  const NavButton = ({ p, icon: Icon, label }: { p: typeof page; icon: any; label: string }) => (
    <button onClick={() => handleNavClick(p)} className={`flex items-center gap-4 w-full px-4 py-2.5 rounded-2xl transition-all ${page === p ? 'bg-white text-emerald-600 shadow-lg shadow-emerald-900/10' : 'text-emerald-50 hover:bg-white/10 hover:translate-x-1'}`}>
      <Icon className={`w-5 h-5 ${page === p ? 'text-emerald-600' : 'text-emerald-100'}`} /><span className={`text-sm font-bold ${page === p ? 'text-emerald-700' : 'text-emerald-50'}`}>{label}</span>
      {page === p && <motion.div layoutId="activeNav" className="ml-auto w-1.5 h-1.5 bg-emerald-600 rounded-full" />}
    </button>
  );

  const MobileNavButton = ({ p, icon: Icon, label }: { p: typeof page; icon: any; label: string }) => (
    <button onClick={() => handleNavClick(p)} className={`flex flex-col items-center justify-center py-2 px-1 gap-1 transition-all flex-1 ${page === p ? 'text-white' : 'text-emerald-200/60'}`}>
      <div className={`relative p-1.5 rounded-xl transition-all ${page === p ? 'bg-white/20' : ''}`}><Icon className={`w-5 h-5 ${page === p ? 'scale-110' : ''}`} /></div><span className="text-[9px] font-bold tracking-tight uppercase">{label}</span>
    </button>
  );

  if (page === 'auth') {
    return (
      <div style={{ minHeight: '100vh', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#059669', padding: '1rem' }}>
        <div style={{ width: '100%', maxWidth: '400px', backgroundColor: 'white', borderRadius: '1.5rem', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', padding: '2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem' }}>
            <BrandLogo className="w-12 h-12 text-emerald-600" />
          </div>
          <Auth onSuccess={applyAuthenticatedUser} notify={notify} />
        </div>
      </div>
    );
  }

  if (page === 'setup') return <div className="min-h-screen bg-gray-50 flex items-center justify-center md:p-4"><Setup initialData={state?.teacher} onComplete={async () => { await refreshData(); setPage('classes'); }} /></div>;

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <AnimatePresence>{toast && (<motion.div initial={{ opacity: 0, y: -50 }} animate={{ opacity: 1, y: 20 }} exit={{ opacity: 0, y: -50 }} className="fixed top-0 left-0 right-0 z-[100] flex justify-center px-4"><div className={`px-6 py-3 rounded-2xl shadow-xl font-bold flex items-center gap-3 ${toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}><div className="w-2 h-2 bg-white rounded-full animate-ping"></div>{toast.message}</div></motion.div>)}</AnimatePresence>
      <AnimatePresence>{isSchoolPickerOpen && state?.teacher && (<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setIsSchoolPickerOpen(false)}><motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden" onClick={(e) => e.stopPropagation()}><div className="p-6 border-b border-gray-100"><h2 className="text-xl font-bold text-gray-900">Pilih Sekolah</h2><p className="text-sm text-gray-500 mt-1">Data yang ditampilkan akan sesuai sekolah yang dipilih</p></div><div className="p-4">{state.teacher.schools.map((school, idx) => (<button key={idx} onClick={async () => { if (idx !== state.teacher.currentSchoolIndex) { const updated: TeacherProfile = { ...state.teacher, currentSchoolIndex: idx }; await saveTeacherProfile(updated); await setActiveClassId(null); await refreshData(); } setIsSchoolPickerOpen(false); }} className={`w-full text-left px-4 py-3 rounded-xl flex items-center justify-between transition-colors ${idx === state.teacher.currentSchoolIndex ? 'bg-emerald-50 text-emerald-700 border-2 border-emerald-200' : 'hover:bg-gray-50 text-gray-700 border-2 border-transparent'}`}><span className="font-medium">{school}</span>{idx === state.teacher.currentSchoolIndex && (<svg className="w-5 h-5 text-emerald-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>)}</button>))}</div><div className="p-4 border-t border-gray-100"><button onClick={() => setIsSchoolPickerOpen(false)} className="w-full py-2.5 text-gray-600 font-medium hover:text-gray-800 transition-colors">Batal</button></div></motion.div></motion.div>)}</AnimatePresence>
      <div className="hidden md:flex flex-col w-64 bg-emerald-600 fixed inset-y-0 left-0 z-50 px-4 py-6 shadow-xl border-r border-emerald-500/20">
         <div className="flex items-center gap-3 mb-6 px-2 shrink-0"><div className="bg-white p-2 rounded-lg shadow-md shadow-emerald-900/10"><BrandLogo className="w-6 h-6 text-emerald-600" /></div><div><h1 className="font-bold text-lg text-white tracking-tight leading-none">EduCheck</h1></div></div>
         <div className="flex flex-col gap-1 flex-1 overflow-y-auto no-scrollbar">
           <div className="px-2 mb-1.5 shrink-0"><p className="text-[10px] font-bold text-emerald-200/60 uppercase tracking-widest">Menu Utama</p></div>
           <NavButton p="classes" icon={LayoutGrid} label="Beranda" /><NavButton p="schedule" icon={CalendarClock} label="Jadwal Pelajaran" /><NavButton p="students" icon={Users} label="Data Kelas" /><NavButton p="attendance" icon={QrCode} label="Absensi" /><NavButton p="recap" icon={PieChart} label="Rekapitulasi" />
           <div className="px-2 mt-6 mb-1.5 shrink-0"><p className="text-[10px] font-bold text-emerald-200/60 uppercase tracking-widest">Aplikasi</p></div>
           <NavButton p="settings" icon={SettingsIcon} label="Pengaturan" /><button onClick={() => setIsExitModalOpen(true)} className="flex items-center gap-4 w-full px-4 py-3 rounded-2xl text-emerald-50 hover:bg-red-500/20 hover:text-white transition-all mt-1"><Power className="w-5 h-5" /><span className="font-bold">Keluar Aplikasi</span></button>
         </div>
         {state?.teacher && (
           <div className="mt-4 shrink-0">
              <div className="bg-emerald-700/40 rounded-xl p-3 flex items-center gap-3 border border-emerald-500/30 backdrop-blur-sm cursor-pointer hover:bg-emerald-700/50 transition-colors" onClick={() => setIsSchoolPickerOpen(true)}>
                <div className="w-9 h-9 rounded-full bg-white flex items-center justify-center text-emerald-600 font-bold text-sm shadow-sm shrink-0">{state.teacher.teacherName?.charAt(0) || '?'}</div>
                <div className="overflow-hidden min-w-0">
                  <p className="text-sm font-bold text-white leading-snug line-clamp-2">{state.teacher.teacherName || 'Guru'}</p>
                  <div className="mt-1 space-y-0.5"><p className="text-[9px] uppercase tracking-wider text-emerald-300 font-semibold opacity-80">Sekolah Aktif:</p><div className="text-[11px] text-white truncate leading-tight font-medium bg-emerald-600/40 px-1.5 py-0.5 rounded border border-emerald-500/20 flex items-center justify-between gap-1"><span className="truncate">{getCurrentSchoolName(state.teacher)}</span>{state.teacher.schools.length > 1 && <svg className="w-2.5 h-2.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>}</div></div>
                </div>
              </div>
           </div>
         )}
      </div>
      <div className="flex-1 md:ml-64 flex flex-col min-h-screen">
        <div className="md:hidden bg-emerald-600 pb-10 pt-8 px-6 flex flex-row items-center justify-between gap-4 text-white relative z-0">
          <div className="flex flex-col gap-1 min-w-0 flex-1"><h1 className="text-2xl font-bold tracking-tight truncate">{getPageTitle()}</h1><div className="flex items-center gap-2 overflow-hidden"><span className="flex-shrink-0 bg-white/20 backdrop-blur-md px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border border-white/10">Sekolah</span><p className="text-emerald-50 truncate text-xs font-medium opacity-90 italic">{getCurrentSchoolName(state.teacher)}</p></div></div>
          <div className="flex items-center gap-2 shrink-0">{state?.teacher && state.teacher.schools.length > 1 && (<button onClick={() => setIsSchoolPickerOpen(true)} className="p-2.5 bg-white/10 hover:bg-white/20 rounded-xl backdrop-blur-md border border-white/10 transition-all active:scale-95 flex items-center gap-1.5"><School className="w-5 h-5" /><div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse"></div></button>)}<div className="bg-white p-2 rounded-xl shadow-lg shadow-emerald-900/20"><BrandLogo className="w-7 h-7 text-emerald-600" /></div></div>
        </div>
        <div className="flex-1 w-full p-0 md:p-6 lg:p-8">
           <PageErrorBoundary page={page} onReset={() => setPageRenderKey(k => k + 1)}>
             <div key={pageRenderKey} className="min-h-full pb-28 md:pb-0">
               {!state ? <div className="flex h-[50vh] items-center justify-center text-emerald-500 font-bold animate-pulse">Memuat...</div> : (
                 <>
                   {page === 'classes' && <Classes state={state} refresh={refreshData} onNavigate={(p: any) => setPage(p)} notify={notify} />}
                   {page === 'students' && <Students state={state} refresh={refreshData} notify={notify} />}
                   {page === 'attendance' && <Attendance state={state} refresh={refreshData} notify={notify} />}
                   {page === 'recap' && <Recap state={state} refresh={refreshData} notify={notify} />}
                   {page === 'schedule' && <Schedule state={state} refresh={refreshData} notify={notify} />}
                   {page === 'settings' && <Settings state={state} refresh={refreshData} notify={notify} authUser={authUser} onSignOut={handleSignOut} />}
                 </>
               )}
             </div>
           </PageErrorBoundary>
         </div>
      </div>
      <div className="md:hidden fixed bottom-0 inset-x-0 bg-emerald-600 border-t border-emerald-500 flex justify-between items-end px-2 pb-safe pt-1 z-50 rounded-t-3xl shadow-[0_-8px_30px_rgba(0,0,0,0.15)]">
         <MobileNavButton p="classes" icon={LayoutGrid} label="Beranda" /><MobileNavButton p="schedule" icon={CalendarClock} label="Jadwal" />
         <div className="relative -top-8 mx-1"><button onClick={() => handleNavClick('attendance')} className="w-16 h-16 bg-white rounded-full flex items-center justify-center text-emerald-600 shadow-xl shadow-emerald-900/20 ring-4 ring-emerald-600 hover:scale-105 transition-all active:scale-95"><QrCode className="w-8 h-8" /></button></div>
         <MobileNavButton p="students" icon={Users} label="Kelas" /><MobileNavButton p="settings" icon={SettingsIcon} label="Atur" />
      </div>
      <ConfirmModal isOpen={isExitModalOpen} onClose={() => setIsExitModalOpen(false)} onConfirm={handleConfirmExit} title="Keluar Aplikasi" description="Apakah Anda yakin ingin keluar dari aplikasi EduCheck?" confirmText="Ya, Keluar" cancelText="Batal" />
    </div>
  );
}
export default App;
