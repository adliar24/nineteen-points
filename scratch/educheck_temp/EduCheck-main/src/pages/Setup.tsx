import React, { useState } from 'react';
import { TeacherProfile } from '../types';
import { Button, Input, MultiSelect, BrandLogo } from '../components/UI';
import { SCHOOL_YEARS, DEFAULT_SUBJECTS } from '../constants';
import { saveTeacherProfile, initDB, resetAllData} from '../services/db';
import { v4 as uuidv4 } from 'uuid';
import { School, User, Calendar, BookOpen, Clock, AlertCircle, Bell, Plus, X, ChevronDown, Cloud } from 'lucide-react';

interface Props {
  initialData?: TeacherProfile | null;
  onComplete: () => void;
}

export const Setup: React.FC<Props> = ({ initialData, onComplete }) => {
  const [name, setName] = useState(initialData?.teacherName || '');
  const [schools, setSchools] = useState<string[]>(initialData?.schools?.length ? initialData.schools : []);
  const [currentSchoolIndex, setCurrentSchoolIndex] = useState(initialData?.currentSchoolIndex ?? 0);
  const [newSchool, setNewSchool] = useState('');
  const [showSchoolDropdown, setShowSchoolDropdown] = useState(false);
  const [year, setYear] = useState(initialData?.schoolYear || SCHOOL_YEARS[0]);
  const [subjects, setSubjects] = useState<string[]>(initialData?.subjects || []);
  
  const [restoreError, setRestoreError] = useState<string | null>(null);
const [customSubjects, setCustomSubjects] = useState<string[]>(initialData?.customSubjects || []);
  
  // Late Settings
  const [lateEnabled, setLateEnabled] = useState(initialData?.lateSetting?.isEnabled ?? true);
  const [lateBuffer, setLateBuffer] = useState<string | number>(initialData?.lateSetting?.bufferMinutes ?? 15);

  // Notification Settings
  const [notifEnabled, setNotifEnabled] = useState(!!initialData?.notificationMinutes && initialData.notificationMinutes > 0);
  const [notifBuffer, setNotifBuffer] = useState<string | number>(initialData?.notificationMinutes || 5);

  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const handleManualCloudPull = async () => {
    setSyncing(true);
    try {
      const { syncService } = await import('../services/sync');
      const result = await syncService.pullFromCloud();
      if (result.success) {
        alert("Data berhasil dipulihkan dari Cloud! Halaman akan dimuat ulang.");
        onComplete();
      } else {
        alert("Data tidak ditemukan di Cloud untuk akun ini.");
      }
    } catch (err: any) {
      alert("Gagal menarik data: " + err.message);
    } finally {
      setSyncing(false);
    }
  };

  const allSubjects = [...DEFAULT_SUBJECTS, ...customSubjects].sort();

  const handleToggleNotif = async (e: React.MouseEvent) => {
      e.preventDefault(); // Prevent form submit if inside form
      const newState = !notifEnabled;
      
      if (newState && 'Notification' in window) {
          if (Notification.permission === 'denied') {
              alert("Izin notifikasi telah di-BLOKIR oleh browser.\n\nSolusi:\n1. Klik ikon 'Gembok' atau 'Pengaturan' di samping alamat URL browser.\n2. Cari 'Notifikasi' dan ubah menjadi 'Izinkan' (Allow).\n3. Refresh halaman ini.");
              return; // Jangan aktifkan state jika sudah denied
          }

          if (Notification.permission !== 'granted') {
              const permission = await Notification.requestPermission();
              if (permission !== 'granted') {
                  alert("Izin notifikasi ditolak. Fitur pengingat tidak dapat diaktifkan.");
                  return;
              }
          }
      }
      
      setNotifEnabled(newState);
  };

  const handleAddSchool = () => {
    const trimmed = newSchool.trim();
    if (!trimmed) return;
    if (schools.some(s => s.toLowerCase() === trimmed.toLowerCase())) {
      alert("Sekolah sudah ada dalam daftar.");
      return;
    }
    setSchools([...schools, trimmed]);
    setNewSchool('');
  };

  const handleRemoveSchool = (index: number) => {
    if (schools.length <= 1) {
      alert("Minimal harus ada 1 sekolah.");
      return;
    }
    const newSchools = schools.filter((_, i) => i !== index);
    setSchools(newSchools);
    if (currentSchoolIndex >= newSchools.length) {
      setCurrentSchoolIndex(newSchools.length - 1);
    }
  };

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setLoading(true);

    // Auto-add school if user typed but forgot to click Plus
    let finalSchools = [...schools];
    if (newSchool.trim() && !finalSchools.some(s => s.toLowerCase() === newSchool.trim().toLowerCase())) {
      finalSchools.push(newSchool.trim());
    }

    if (!name.trim() || finalSchools.length === 0 || subjects.length === 0) {
      alert("Mohon lengkapi semua data wajib (Nama, Sekolah, dan Mapel).");
      setLoading(false);
      return;
    }

    const profile: TeacherProfile = {
      id: initialData?.id || uuidv4(),
      teacherName: name,
      schools: finalSchools,
      currentSchoolIndex: currentSchoolIndex >= finalSchools.length ? 0 : currentSchoolIndex,
      schoolYear: year,
      subjects,
      customSubjects,
      lateSetting: {
        isEnabled: lateEnabled,
        bufferMinutes: lateBuffer === '' ? 15 : Number(lateBuffer)
      },
      notificationMinutes: notifEnabled ? (notifBuffer === '' ? 5 : Number(notifBuffer)) : 0,
      createdAt: initialData?.createdAt || new Date().toISOString()
    };

    try {
      // 1. Simpan Lokal
      await saveTeacherProfile(profile);
      
      // 2. Simpan Cloud (Tunggu Sampai Selesai)
      const { syncService } = await import('../services/sync');
      if (syncService.isConfigured()) {
        const user = await syncService.getUser();
        if (user) {
          console.log('[Setup] Memulai sinkronisasi Cloud...');
          const result = await syncService.pushToCloud();
          console.log('[Setup] Hasil sinkronisasi:', result);
          
          if (!result.success) {
            console.error('[Setup] Sinkronisasi Cloud gagal:', result.message);
          }
        }
      }
      
      setLoading(false);
      onComplete();
    } catch (err: any) {
      console.error('Gagal menyimpan profil:', err);
      alert("Terjadi kesalahan saat menyimpan: " + err.message);
      setLoading(false);
    }
  };

  const addCustomSubject = (val: string) => {
    if (allSubjects.some(s => s.toLowerCase() === val.toLowerCase())) {
      alert("Mapel sudah ada.");
      return;
    }
    setCustomSubjects([...customSubjects, val]);
    setSubjects([...subjects, val]);
  };

  
const isFullBackupByContent = (data: any) => {
  if (!data || typeof data !== 'object') return false;

  // Minimal required
  if (!('teacher' in data) || !('classes' in data) || !('students' in data)) return false;

  // Prefer FULL: should contain attendance-related collections if they exist in this app
  const fullHints = ['sessions', 'records', 'schedules', 'events', 'cancellations'];
  const hasAnyFullHint = fullHints.some((k) => k in data);
  return hasAnyFullHint;
};

const handleRestoreFullBackup = async (file: File) => {
  setRestoreError(null);

  if (!file.name.toLowerCase().endsWith('.json')) {
    setRestoreError('File harus berupa JSON (.json)');
    return;
  }

  let parsed: any;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    setRestoreError('File JSON tidak valid');
    return;
  }

  if (!isFullBackupByContent(parsed)) {
    setRestoreError('File ini bukan backup JSON FULL EduCheck yang valid.');
    return;
  }

  const ok = confirm(
    'Pulihkan data lama akan MENGGANTI seluruh data saat ini.\n\nLanjutkan?'
  );
  if (!ok) return;

  try {
    // Clear old data (IndexedDB + localStorage used by the app)
    await resetAllData();

    const db = await initDB();
    const storeNames = Array.from(db.objectStoreNames);

    // Validate: at least required stores exist in backup (tolerant for future stores)
    const missingRequired: string[] = [];
    for (const k of ['teacher', 'classes', 'students']) {
      if (!(k in parsed)) missingRequired.push(k);
    }
    if (missingRequired.length) {
      setRestoreError(
        `Backup tidak lengkap. Key wajib tidak ditemukan: ${missingRequired.join(', ')}`
      );
      return;
    }

    const tx = db.transaction(storeNames, 'readwrite');

    for (const storeName of storeNames) {
      if (!(storeName in parsed)) continue;

      const store = tx.objectStore(storeName);
      const value = parsed[storeName];

      if (Array.isArray(value)) {
        for (const item of value) {
          await store.put(item);
        }
      } else if (value) {
        await store.put(value);
      }
    }

    await tx.done;
    
    // Auto-push to cloud after restore
    try {
      const { syncService } = await import('../services/sync');
      if (syncService.isConfigured()) {
        const user = await syncService.getUser();
        if (user) {
          await syncService.pushToCloud();
          console.log('Restored data synced to cloud');
        }
      }
    } catch (e) {
      console.error('Auto-sync after restore failed:', e);
    }
    
    window.location.reload();
  } catch (e: any) {
    setRestoreError(e?.message ?? 'Gagal memulihkan data.');
  }
};
return (
    <div className="w-full min-h-screen md:min-h-0 md:h-auto flex flex-col md:flex-row bg-white md:max-w-4xl md:mx-auto md:shadow-2xl md:rounded-3xl md:overflow-hidden">
      
      {/* 1. Mobile Top Header (Green) - Horizontal Layout */}
      <div className="md:hidden bg-emerald-600 pb-10 pt-8 px-6 flex flex-row items-center justify-center gap-4 text-white relative z-0">
         <div className="bg-white/20 p-3.5 rounded-2xl backdrop-blur-sm shadow-inner shrink-0">
           <BrandLogo className="w-10 h-10 text-white" />
         </div>
         <div className="text-left">
           <h1 className="text-2xl font-bold tracking-tight leading-none">EduCheck</h1>
           <p className="text-emerald-100 text-xs opacity-90 font-medium tracking-wide mt-1.5 leading-snug">
             Aplikasi Absensi Digital Sekolah
           </p>
         </div>
      </div>

      {/* 2. Desktop Left Sidebar (Green) */}
      <div className="hidden md:flex flex-col justify-center items-center bg-emerald-600 text-white p-12 w-2/5">
         <div className="bg-white/20 p-6 rounded-3xl mb-6 backdrop-blur-sm">
           <BrandLogo className="w-20 h-20 text-white" />
         </div>
         <h1 className="text-3xl font-bold mb-2">EduCheck</h1>
         <p className="text-emerald-100 text-center text-sm opacity-90">
           Aplikasi Absensi Digital Sekolah<br/>100% Offline & Aman
         </p>
      </div>

      {/* 3. Right Side (Form Area) */}
      <div className="flex-1 bg-white relative -mt-6 rounded-t-3xl md:mt-0 md:rounded-none px-6 py-8 md:p-12 h-full flex flex-col shadow-2xl md:shadow-none z-10 overflow-hidden">
        
        <div className="flex justify-between items-start mb-8">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Selamat Datang, Guru!</h2>
            <p className="text-gray-500 text-sm mt-2 leading-relaxed">Silakan lengkapi profil mengajar Anda untuk memulai menggunakan aplikasi.</p>
          </div>
          <button 
            onClick={handleManualCloudPull}
            disabled={syncing}
            className={`hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              syncing ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
            }`}
          >
            {syncing ? <Clock className="w-3 h-3 animate-spin" /> : <Cloud className="w-3 h-3" />}
            {syncing ? 'Menarik Data...' : 'Cek Data Cloud'}
          </button>
        </div>

        <form onSubmit={handleSave} className="flex flex-col gap-5 flex-1 overflow-y-auto pb-4 custom-scrollbar">
          
          {/* Nama Lengkap */}
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-gray-900 ml-1">Nama Lengkap</label>
            <div className="relative">
              <User className="absolute left-4 top-3.5 w-5 h-5 text-gray-400 z-10" />
              <input 
                className="w-full bg-white text-gray-900 border border-gray-200 rounded-2xl pl-11 pr-4 py-3 text-base placeholder:text-gray-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 outline-none transition-all"
                placeholder="Nama Lengkap & Gelar"
                value={name}
                onChange={e => setName(e.target.value)}
              />
            </div>
          </div>
          
          {/* Schools */}
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-gray-900 ml-1">Sekolah Tempat Mengajar</label>
            
            {schools.length > 0 && (
              <div className="relative">
                <div 
                  className="w-full bg-white border border-gray-200 rounded-2xl px-4 py-3 cursor-pointer flex items-center justify-between"
                  onClick={() => setShowSchoolDropdown(!showSchoolDropdown)}
                >
                  <span className="text-gray-900 font-medium">{schools[currentSchoolIndex]}</span>
                  <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${showSchoolDropdown ? 'rotate-180' : ''}`} />
                </div>
                
                {showSchoolDropdown && (
                  <div className="absolute z-20 w-full mt-2 bg-white border border-gray-200 rounded-2xl shadow-lg max-h-48 overflow-y-auto">
                    {schools.map((s, idx) => (
                      <div 
                        key={idx}
                        className={`px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-gray-50 ${idx === currentSchoolIndex ? 'bg-emerald-50 text-emerald-700' : 'text-gray-700'}`}
                        onClick={() => {
                          setCurrentSchoolIndex(idx);
                          setShowSchoolDropdown(false);
                        }}
                      >
                        <span className="font-medium">{s}</span>
                        {schools.length > 1 && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleRemoveSchool(idx); }}
                            className="p-1 hover:bg-red-100 rounded-lg text-red-500"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-2 mt-2">
              <div className="relative flex-1">
                <School className="absolute left-4 top-3.5 w-5 h-5 text-gray-400 z-10" />
                <input 
                  className="w-full bg-white text-gray-900 border border-gray-200 rounded-2xl pl-11 pr-4 py-3 text-base placeholder:text-gray-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 outline-none transition-all"
                  placeholder="Tambah sekolah baru..."
                  value={newSchool}
                  onChange={e => setNewSchool(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddSchool(); }}}
                />
              </div>
              <button 
                type="button"
                onClick={handleAddSchool}
                className="px-4 py-3 bg-emerald-100 text-emerald-600 rounded-2xl hover:bg-emerald-200 transition-colors"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>
            
            {schools.length > 1 && (
              <p className="text-xs text-gray-500 mt-1 ml-1">Klik dropdown di atas untuk mengganti sekolah aktif</p>
            )}
          </div>

          {/* Tahun Pelajaran */}
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-gray-900 ml-1">Tahun Pelajaran</label>
            <div className="relative">
              <Calendar className="absolute left-4 top-3.5 w-5 h-5 text-gray-400 z-10 pointer-events-none" />
              <select 
                className="w-full appearance-none bg-white text-gray-900 border border-gray-200 rounded-2xl pl-11 pr-10 py-3 text-base focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 outline-none transition-all cursor-pointer"
                value={year}
                onChange={e => setYear(e.target.value)}
              >
                {SCHOOL_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              <div className="absolute right-4 top-4 pointer-events-none text-gray-400">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
              </div>
            </div>
          </div>

          {/* Mapel */}
          <div className="relative pt-1">
             <MultiSelect 
              label="Mata Pelajaran Diampu"
              options={allSubjects}
              selected={subjects}
              onChange={setSubjects}
              onAddCustom={addCustomSubject}
              placeholder="Pilih mapel..."
            />
          </div>


          {/* Pulihkan data lama (FULL backup) */}
          <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-2xl">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="font-bold text-emerald-700">Pulihkan data lama</p>
                <p className="text-sm text-emerald-600 truncate">
                  Restore dari file backup JSON (FULL)
                </p>
              </div>

              <label className="shrink-0 cursor-pointer text-sm font-bold text-emerald-700 hover:underline">
                Pilih file
                <input
                  type="file"
                  accept="application/json"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleRestoreFullBackup(f);
                    // reset input so selecting same file twice still triggers change
                    e.currentTarget.value = "";
                  }}
                />
              </label>
            </div>

            {restoreError && (
              <div className="mt-2 flex items-start gap-2 text-sm text-red-600">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{restoreError}</span>
              </div>
            )}
          </div>

          {/* Late Settings Config */}
          <div className="bg-gray-50 border border-gray-100 p-4 rounded-2xl space-y-3">
             <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                   <div className={`p-2 rounded-xl ${lateEnabled ? 'bg-amber-100 text-amber-600' : 'bg-gray-200 text-gray-500'}`}>
                      <Clock className="w-5 h-5" />
                   </div>
                   <div>
                      <span className="block text-sm font-bold text-gray-800">Deteksi Terlambat Otomatis</span>
                      <span className="block text-xs text-gray-500">Tandai terlambat jika lewat jam masuk</span>
                   </div>
                </div>
                {/* Custom Toggle Switch */}
                <button 
                  type="button"
                  onClick={() => setLateEnabled(!lateEnabled)}
                  className={`w-12 h-7 rounded-full p-1 transition-colors duration-200 ease-in-out ${lateEnabled ? 'bg-emerald-500' : 'bg-gray-300'}`}
                >
                   <div className={`w-5 h-5 bg-white rounded-full shadow-md transform transition-transform duration-200 ease-in-out ${lateEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
             </div>

             {lateEnabled && (
                <div className="pt-2 pl-12 border-t border-gray-200/50 mt-2">
                   <div className="flex items-center gap-3">
                      <div className="flex-1">
                         <label className="text-xs font-semibold text-gray-600 mb-1 block">Toleransi Waktu (Menit)</label>
                         <input 
                           type="number" 
                           min="0"
                           max="60"
                           value={lateBuffer}
                           onChange={(e) => {
                               const val = e.target.value;
                               setLateBuffer(val === '' ? '' : Number(val));
                           }}
                           className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm font-bold text-gray-800 outline-none focus:ring-2 focus:ring-emerald-500"
                           onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()} // Prevent submit on this field to avoid accidental saves
                         />
                      </div>
                      <div className="flex-1 text-xs text-gray-400 leading-tight">
                         Siswa akan ditandai <span className="text-amber-600 font-bold">Terlambat</span> jika scan {lateBuffer || 0} menit setelah jam masuk.
                      </div>
                   </div>
                </div>
             )}
          </div>

          {/* Notification Config */}
          <div className="bg-gray-50 border border-gray-100 p-4 rounded-2xl space-y-3">
             <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                   <div className={`p-2 rounded-xl ${notifEnabled ? 'bg-blue-100 text-blue-600' : 'bg-gray-200 text-gray-500'}`}>
                      <Bell className="w-5 h-5" />
                   </div>
                   <div>
                      <span className="block text-sm font-bold text-gray-800">Pengingat Jadwal</span>
                      <span className="block text-xs text-gray-500">Notifikasi browser sebelum mengajar</span>
                   </div>
                </div>
                <button 
                  type="button"
                  onClick={handleToggleNotif}
                  className={`w-12 h-7 rounded-full p-1 transition-colors duration-200 ease-in-out ${notifEnabled ? 'bg-blue-500' : 'bg-gray-300'}`}
                >
                   <div className={`w-5 h-5 bg-white rounded-full shadow-md transform transition-transform duration-200 ease-in-out ${notifEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
             </div>

             {notifEnabled && (
                <div className="pt-2 pl-12 border-t border-gray-200/50 mt-2">
                   <div className="flex items-center gap-3">
                      <div className="flex-1">
                         <label className="text-xs font-semibold text-gray-600 mb-1 block">Ingatkan Sebelum (Menit)</label>
                         <input 
                           type="number" 
                           min="1"
                           max="60"
                           value={notifBuffer}
                           onChange={(e) => {
                               const val = e.target.value;
                               setNotifBuffer(val === '' ? '' : Number(val));
                           }}
                           className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm font-bold text-gray-800 outline-none focus:ring-2 focus:ring-blue-500"
                           onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
                         />
                      </div>
                      <div className="flex-1 text-xs text-gray-400 leading-tight">
                         Aplikasi akan mengirim notifikasi {notifBuffer || 5} menit sebelum jadwal dimulai.
                      </div>
                   </div>
                </div>
             )}
          </div>

          <div className="mt-8 pt-4 border-t border-gray-50">
            <Button type="submit" isLoading={loading} className="w-full !py-4 text-base shadow-xl shadow-emerald-200/50">
              Simpan & Lanjutkan
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Setup;
