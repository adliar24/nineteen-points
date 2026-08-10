import React, { useState, useMemo, useEffect } from 'react';
import { motion } from 'framer-motion';
import { AppState, ClassCancellation } from '../types';
import { Button, Card, Modal, Input } from '../components/UI';
import { addCancellation, deleteCancellation, setActiveClassId } from '../services/db';
import { Calendar, ArrowRight, Ban, RefreshCcw, LayoutGrid, Filter, BarChart3, AlertCircle, CalendarOff, Thermometer, Briefcase, Clock } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { compareClassName } from '../constants';

interface Props {
  state: AppState;
  refresh: () => void;
  onNavigate: (page: string) => void;
  notify: (msg: string, type?: 'success' | 'error') => void;
}

// Helper to convert HH:MM to minutes
const getMinutesFromTime = (timeStr: string) => {
    if (!timeStr) return -1;
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
};

// Helper to check overlap between two time ranges
const isTimeOverlap = (startA: string, endA: string, startB: string, endB: string) => {
    const sA = getMinutesFromTime(startA);
    const eA = getMinutesFromTime(endA);
    const sB = getMinutesFromTime(startB);
    const eB = getMinutesFromTime(endB);
    // Overlap logic: StartA < EndB AND EndA > StartB
    return sA < eB && eA > sB;
};

export const Classes: React.FC<Props> = ({ state, refresh, onNavigate, notify }) => {
  // View Mode: 'schedule' (Home) or 'stats' (Dashboard)
  const [viewMode, setViewMode] = useState<'schedule' | 'stats'>('schedule');

  // Modal States
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  
  // Cancellation States
  const [cancelClassId, setCancelClassId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('Izin Mendadak');

  // --- REAL-TIME CLOCK STATE ---
  // This ensures the UI updates automatically when a class starts/ends
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    // Initial set
    setCurrentTime(new Date());
    
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000); // Update every second
    return () => clearInterval(timer);
  }, []);

  // --- DASHBOARD STATES ---
  const currentSchoolIndex = state.teacher?.currentSchoolIndex ?? 0;
  const schoolClasses = state.classes.filter(c => (c.schoolIndex ?? 0) === currentSchoolIndex);
  const schoolClassIds = new Set(schoolClasses.map(c => c.id));
  const [statsClassId, setStatsClassId] = useState<string>(schoolClasses[0]?.id || '');
  const [statsRange, setStatsRange] = useState<'week' | 'month' | 'semester' | 'year'>('week');

  const sortedClasses = useMemo(() => {
    return [...schoolClasses].sort((a, b) => compareClassName(a.name, b.name));
  }, [schoolClasses]);

  const studentCountByClass = useMemo(() => {
    const map = new Map<string, number>();
    state.students.forEach(s => {
      map.set(s.classId, (map.get(s.classId) || 0) + 1);
    });
    return map;
  }, [state.students]);

  // --- SCHEDULE LOGIC ---
  const todayISO = new Date().toISOString().split('T')[0];
  const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const todayName = days[new Date().getDay()];
  
  const todayEvent = state.events.find(e => e.dateISO === todayISO);
  
  // Filter schedules based on Events/Notes
  const todaySchedules = state.schedules
    .filter(s => schoolClassIds.has(s.classId))
    .filter(s => s.dayName === todayName)
    .filter(s => {
        // If no event today, show all
        if (!todayEvent) return true;
        
        // If full day event, hide all schedules
        if (todayEvent.isFullDay) return false;

        // If partial day event, hide overlapping schedules
        if (todayEvent.startTime && todayEvent.endTime) {
            const isOverlapping = isTimeOverlap(s.startTime, s.endTime, todayEvent.startTime, todayEvent.endTime);
            return !isOverlapping;
        }

        return true;
    })
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  // --- STATS CALCULATION LOGIC ---
  const dashboardStats = useMemo(() => {
    if (!statsClassId) return null;

    const now = new Date();
    let startDate = new Date();
    let rangeLabel = '';
    
    // Determine Start Date
    if (statsRange === 'week') {
        startDate.setDate(now.getDate() - 7);
        rangeLabel = '7 Hari Terakhir';
    } else if (statsRange === 'month') {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        rangeLabel = 'Bulan Ini';
    } else if (statsRange === 'semester') {
        const currentMonth = now.getMonth();
        const startMonth = currentMonth < 6 ? 0 : 6; // Ganjil: Jan-Jun, Genap: Jul-Dec
        startDate = new Date(now.getFullYear(), startMonth, 1);
        rangeLabel = currentMonth < 6 ? 'Semester Ganjil' : 'Semester Genap';
    } else {
        startDate = new Date(now.getFullYear(), 0, 1);
        rangeLabel = 'Tahun Ini';
    }
    const startDateISO = startDate.toISOString().split('T')[0];

    // 1. Filter Sessions
    const relevantSessions = state.sessions.filter(s => 
        s.classId === statsClassId && 
        s.dateISO >= startDateISO && 
        s.dateISO <= todayISO
    );

    const totalMeetings = relevantSessions.length;

    // 2. Filter Students
    const classStudents = state.students.filter(s => s.classId === statsClassId).sort((a,b) => a.name.localeCompare(b.name));

    // 3. Process Records
    let totalPresent = 0;
    let totalLate = 0;
    let totalAlpha = 0;
    let totalRecordsCounted = 0;

    const studentStats = classStudents.map(student => {
        let h = 0, t = 0, a = 0, s = 0, i = 0;

        relevantSessions.forEach(sess => {
            const rec = state.records.find(r => r.sessionId === sess.id && r.studentId === student.id);
            if (!rec) {
                // If no record exists for a session, assume Alpha (unless logic changes)
                // For this dashboard, let's count strictly from records + implicit alpha
                a++; 
            } else {
                if (rec.status === 'Hadir') h++;
                else if (rec.status === 'Terlambat') t++;
                else if (rec.status === 'Alpha') a++;
                else if (rec.status === 'Sakit') s++;
                else if (rec.status === 'Izin') i++;
            }
        });

        totalPresent += h;
        totalLate += t;
        totalAlpha += a;
        totalRecordsCounted += (h + t + a + s + i);

        // Attendance Score: (Present + Late) / Total Meetings
        const presenceCount = h + t;
        const attendanceRate = totalMeetings > 0 ? Math.round((presenceCount / totalMeetings) * 100) : 0;

        return {
            ...student,
            h, t, a, s, i,
            attendanceRate
        };
    });

    // 4. Class Average
    // Denominator: Total Students * Total Meetings
    const totalPossibleAttendance = classStudents.length * totalMeetings;
    const classAverage = totalPossibleAttendance > 0 
        ? Math.round(((totalPresent + totalLate) / totalPossibleAttendance) * 100) 
        : 0;

    return {
        totalMeetings,
        classAverage,
        studentStats,
        rangeLabel
    };

  }, [state.sessions, state.records, state.students, statsClassId, statsRange, todayISO]);


  // --- HANDLERS ---
  const handleSelectClass = (id: string) => {
    setActiveClassId(id);
    refresh();
    setTimeout(() => onNavigate('attendance'), 100);
  };

  const openCancelModal = (e: React.MouseEvent, classId: string) => {
    e.stopPropagation();
    setCancelClassId(classId);
    setCancelReason('Rapat Mendadak');
    setIsCancelModalOpen(true);
  };

  const handleConfirmCancel = async () => {
    if (!cancelClassId) return;
    const cancellation: ClassCancellation = {
      id: uuidv4(),
      dateISO: todayISO,
      classId: cancelClassId,
      reason: cancelReason
    };
    await addCancellation(cancellation);
    refresh();
    setIsCancelModalOpen(false);
    setCancelClassId(null);
    notify("Jadwal dibatalkan untuk hari ini");
  };

  const handleUndoCancel = async (e: React.MouseEvent, cancelId: string) => {
    e.stopPropagation();
    if(confirm("Kembalikan jadwal kelas ini?")) {
      await deleteCancellation(cancelId);
      refresh();
      notify("Jadwal dikembalikan");
    }
  };

  const renderEventBanner = () => {
      if (!todayEvent) return null;
      
      let colorClass = 'bg-gray-100 text-gray-800 border-gray-200';
      let Icon = AlertCircle;
      let title = todayEvent.type;

      if (todayEvent.type === 'Libur') {
          colorClass = 'bg-red-50 text-red-800 border-red-200';
          Icon = CalendarOff;
      } else if (todayEvent.type === 'Sakit') {
          colorClass = 'bg-amber-50 text-amber-800 border-amber-200';
          Icon = Thermometer;
      } else if (todayEvent.type === 'Dinas') {
          colorClass = 'bg-blue-50 text-blue-800 border-blue-200';
          Icon = Briefcase;
      }

      return (
          <div className={`p-8 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center text-center gap-3 ${colorClass} w-full`}>
              <div className="p-4 bg-white/50 rounded-full backdrop-blur-sm shadow-sm">
                  <Icon className="w-10 h-10" />
              </div>
              <div>
                  <h3 className="text-2xl font-bold uppercase tracking-wide">{title}</h3>
                  <p className="font-medium opacity-90 text-lg mt-1">{todayEvent.description}</p>
                  <p className="text-sm opacity-70 mt-2">
                    {todayEvent.isFullDay 
                        ? 'Jadwal mengajar hari ini ditiadakan (Seharian).' 
                        : `Berlaku: ${todayEvent.startTime} - ${todayEvent.endTime}`
                    }
                  </p>
              </div>
          </div>
      );
  }

  // --- DERIVED TIME ---
  // Ensure strict 24h format display
  const currentHHMM = currentTime.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false }).replace(/\./g, ':');
  const currentMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();

  return (
    <div className="p-6 pb-24 md:pb-8 max-w-full">
      
      {/* HEADER & TOGGLE */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
           <h1 className="text-3xl font-bold text-gray-900 tracking-tight">
             {viewMode === 'schedule' ? 'Beranda' : 'Dashboard Kehadiran'}
           </h1>
           <p className="text-gray-500 text-base mt-1">
             {viewMode === 'schedule' ? `Halo, ${state.teacher?.teacherName}` : 'Analisis data kehadiran siswa'}
           </p>
        </div>
        
        <div className="bg-gray-100 p-1.5 rounded-2xl flex self-start md:self-auto shadow-inner">
            <button 
                onClick={() => setViewMode('schedule')}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${viewMode === 'schedule' ? 'bg-white text-emerald-600 shadow-sm ring-1 ring-black/5' : 'text-gray-500 hover:text-gray-700'}`}
            >
                <LayoutGrid className="w-4 h-4" /> Jadwal
            </button>
            <button 
                onClick={() => setViewMode('stats')}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${viewMode === 'stats' ? 'bg-white text-emerald-600 shadow-sm ring-1 ring-black/5' : 'text-gray-500 hover:text-gray-700'}`}
            >
                <BarChart3 className="w-4 h-4" /> Statistik
            </button>
        </div>
      </div>

      {viewMode === 'schedule' ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-8">
            {/* TODAY'S SCHEDULE SECTION */}
            <div>
                <div className="flex flex-col md:flex-row md:items-center justify-between mb-4 gap-2">
                    <div>
                        <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                            <Calendar className="w-6 h-6 text-emerald-500" />
                            {todayEvent ? 'Status Hari Ini' : 'Jadwal Hari Ini'}
                        </h2>
                        <p className="text-sm text-gray-500 md:ml-8 mt-1 flex items-center gap-2">
                           <span>{todayName}, {new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long' })}</span>
                           <span className="w-1 h-1 rounded-full bg-gray-300"></span>
                           <span className="font-bold text-emerald-600 flex items-center gap-1 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-100">
                              <Clock className="w-3.5 h-3.5" />
                              {currentHHMM}
                           </span>
                        </p>
                    </div>
                    {!todayEvent && todaySchedules.length === 0 && (
                        <Button variant="ghost" onClick={() => onNavigate('schedule')} className="text-sm font-semibold text-emerald-600 hover:bg-emerald-50 self-start md:self-auto">
                            + Buat Jadwal
                        </Button>
                    )}
                </div>

                {todayEvent && (
                    <div className="mb-6">
                        {renderEventBanner()}
                    </div>
                )}
                
                {todaySchedules.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-4">
                    {todaySchedules.map(sch => {
                    const cls = schoolClasses.find(c => c.id === sch.classId);
                    if (!cls) return null;
                    const studentCount = studentCountByClass.get(cls.id) || 0;
                    
                    // ROBUST TIME CHECK: Convert to minutes for integer comparison
                    const startMins = getMinutesFromTime(sch.startTime);
                    const endMins = getMinutesFromTime(sch.endTime);
                    const isActive = currentMinutes >= startMins && currentMinutes <= endMins;

                    const cancellation = state.cancellations.find(c => c.classId === cls.id && c.dateISO === todayISO);
                    const isCancelled = !!cancellation;

                    if (isCancelled) {
                        return (
                        <div key={sch.id} className="w-full p-6 rounded-3xl border-2 border-gray-200 bg-gray-50 text-gray-500 relative overflow-hidden flex flex-col justify-between">
                            <div className="flex justify-between items-start mb-2 opacity-50">
                                <span className="text-2xl font-bold line-through">{sch.startTime}</span>
                                <span className="text-xs font-medium px-2 py-1 rounded-lg bg-gray-200">Dibatalkan</span>
                            </div>
                            <div className="mb-2">
                                <h3 className="font-bold text-xl truncate opacity-70">{cls.name}</h3>
                                <div className="flex items-center gap-1.5 mt-2 text-red-500 bg-red-50 p-2 rounded-xl">
                                <Ban className="w-4 h-4 shrink-0" />
                                <span className="text-xs font-bold truncate">{cancellation?.reason}</span>
                                </div>
                            </div>
                            <button 
                                onClick={(e) => handleUndoCancel(e, cancellation.id)}
                                className="mt-2 flex items-center justify-center text-xs font-bold gap-1 text-gray-400 hover:text-emerald-600 transition-colors w-full py-3 border border-gray-200 rounded-xl bg-white"
                            >
                                <RefreshCcw className="w-4 h-4" /> Kembalikan Jadwal
                            </button>
                        </div>
                        )
                    }

                    return (
                        <div 
                        key={sch.id}
                        onClick={() => handleSelectClass(cls.id)}
                        className={`w-full p-6 rounded-3xl border-2 transition-all cursor-pointer group relative overflow-hidden flex flex-col justify-between ${
                            isActive 
                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-xl shadow-emerald-200 scale-[1.02]' 
                            : 'bg-white text-gray-800 border-gray-200 hover:border-emerald-300 hover:shadow-lg'
                        }`}
                        >
                            {isActive && (
                            <div className="absolute bottom-4 right-4 px-2.5 py-1 rounded-full bg-white/20 text-[10px] font-bold animate-pulse pointer-events-none">
                                SEDANG BERLANGSUNG
                            </div>
                            )}
                            
                            <div>
                            <div className="relative mb-4">
                                <span className={`text-3xl font-bold ${isActive ? 'text-white' : 'text-gray-900'}`}>{sch.startTime}</span>

                                <div className="absolute top-0 right-0 flex items-center gap-2">
                                  <span className={`text-xs font-medium px-2.5 py-1.5 rounded-lg ${isActive ? 'bg-white/20' : 'bg-gray-100 text-gray-500'}`}>
                                    s.d {sch.endTime}
                                  </span>

                                  <button
                                    onClick={(e) => openCancelModal(e, cls.id)}
                                    className={`p-2 rounded-full transition-colors ${isActive ? 'hidden' : 'text-gray-300 hover:bg-red-50 hover:text-red-500'}`}
                                    title="Batalkan kelas ini"
                                  >
                                    <Ban className="w-5 h-5" />
                                  </button>
                                </div>
                            </div>
                            <div className="mb-2">
                                <h3 className="font-bold text-2xl truncate">{cls.name}</h3>
                                <p className={`text-sm truncate font-medium mt-1 ${isActive ? 'text-emerald-100' : 'text-gray-500'}`}>{cls.subject}</p>
                            </div>
                            </div>

                            <div className={`mt-6 flex items-center text-sm font-bold gap-2 ${isActive ? 'text-emerald-100 group-hover:text-white' : 'text-emerald-600 group-hover:text-emerald-700'}`}>
                            Buka Kelas <ArrowRight className="w-4 h-4" />
                            </div>
                        </div>
                    )
                    })}
                </div>
                ) : (
                <div className="bg-gray-50 rounded-3xl p-8 text-center border-2 border-dashed border-gray-200">
                    <p className="text-gray-400 font-medium">
                        {todayEvent ? 'Tidak ada jadwal mengajar pada jam ini.' : 'Tidak ada jadwal mengajar hari ini.'}
                    </p>
                </div>
                )}
            </div>
        </motion.div>
      ) : (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {/* --- DASHBOARD VIEW --- */}
            {schoolClasses.length === 0 ? (
                <div className="text-center py-10 text-gray-500">
                    Belum ada data kelas di sekolah ini. Silakan buat kelas terlebih dahulu di menu Jadwal.
                </div>
            ) : (
                <div className="flex flex-col gap-8">
                    {/* FILTERS & METRICS ROW */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <Card className="p-6 flex flex-col justify-center gap-4 bg-white border border-gray-100 shadow-sm lg:col-span-1">
                            <label className="text-sm font-bold text-gray-700">Filter Kelas</label>
                            <div className="relative">
                                <Filter className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                                <select 
                                    className="w-full bg-gray-50 border border-gray-200 text-gray-800 text-base rounded-xl pl-10 pr-4 py-3 outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer font-medium"
                                    value={statsClassId}
                                    onChange={(e) => setStatsClassId(e.target.value)}
                                >
                                    {sortedClasses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-2">
                                <button 
                                    onClick={() => setStatsRange('week')}
                                    className={`px-3 py-2 text-xs font-bold rounded-lg transition-all ${statsRange === 'week' ? 'bg-white text-emerald-600 shadow-sm' : 'text-gray-500 hover:bg-gray-200'}`}
                                >
                                    Minggu
                                </button>
                                <button 
                                    onClick={() => setStatsRange('month')}
                                    className={`px-3 py-2 text-xs font-bold rounded-lg transition-all ${statsRange === 'month' ? 'bg-white text-emerald-600 shadow-sm' : 'text-gray-500 hover:bg-gray-200'}`}
                                >
                                    Bulan
                                </button>
                                <button 
                                    onClick={() => setStatsRange('semester')}
                                    className={`px-3 py-2 text-xs font-bold rounded-lg transition-all ${statsRange === 'semester' ? 'bg-white text-emerald-600 shadow-sm' : 'text-gray-500 hover:bg-gray-200'}`}
                                >
                                    Semester
                                </button>
                                <button 
                                    onClick={() => setStatsRange('year')}
                                    className={`px-3 py-2 text-xs font-bold rounded-lg transition-all ${statsRange === 'year' ? 'bg-white text-emerald-600 shadow-sm' : 'text-gray-500 hover:bg-gray-200'}`}
                                >
                                    Tahun
                                </button>
                            </div>
                        </Card>

                        <div className="grid grid-cols-2 gap-6 lg:col-span-2">
                            <Card className="p-6 flex flex-col items-center justify-center text-center bg-gradient-to-br from-blue-50 to-white border-blue-100">
                                <span className="text-sm font-bold text-blue-400 uppercase tracking-widest mb-2">Total Pertemuan</span>
                                <span className="text-5xl font-bold text-blue-600">{dashboardStats?.totalMeetings || 0}</span>
                                <span className="text-xs text-gray-400 mt-2 font-medium">{dashboardStats?.rangeLabel}</span>
                            </Card>
                            <Card className="p-6 flex flex-col items-center justify-center text-center bg-gradient-to-br from-emerald-50 to-white border-emerald-100">
                                <span className="text-sm font-bold text-emerald-400 uppercase tracking-widest mb-2">Rata-Rata Kelas</span>
                                <span className="text-5xl font-bold text-emerald-600">{dashboardStats?.classAverage || 0}%</span>
                                <span className="text-xs text-gray-400 mt-2 font-medium">Kehadiran (H+T)</span>
                            </Card>
                        </div>
                    </div>

                    {/* STUDENT TABLE - DESKTOP */}
                    <Card className="hidden md:block overflow-hidden border border-gray-100 shadow-md">
                        <div className="p-6 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
                            <div>
                                <h3 className="font-bold text-lg text-gray-900">Detail Kehadiran Siswa</h3>
                                <p className="text-sm text-gray-500">Statistik individual siswa</p>
                            </div>
                            <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-100">
                                Total: {dashboardStats?.studentStats.length} Siswa
                            </span>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-gray-50 text-gray-500 font-semibold border-b border-gray-100 uppercase text-xs tracking-wider">
                                    <tr>
                                        <th className="p-5 w-[30%]">Nama Siswa</th>
                                        <th className="p-5 text-center text-emerald-600">Hadir</th>
                                        {/* Updated Column Order: Hadir -> Sakit -> Izin -> Terlambat -> Alpha */}
                                        <th className="p-5 text-center text-amber-500">Sakit</th>
                                        <th className="p-5 text-center text-blue-500">Izin</th>
                                        <th className="p-5 text-center text-orange-500">Terlambat</th>
                                        <th className="p-5 text-center text-red-600">Alpha</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {dashboardStats?.studentStats.length === 0 && (
                                        <tr><td colSpan={6} className="p-12 text-center text-gray-400">Tidak ada data untuk periode ini.</td></tr>
                                    )}
                                    {dashboardStats?.studentStats.map(s => (
                                        <tr key={s.id} className="hover:bg-gray-50/50 transition-colors">
                                            <td className="p-5 font-bold text-gray-800">
                                                <div>{s.name}</div>
                                                <div className="flex items-center gap-3 mt-1.5">
                                                    <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                                        <div 
                                                            className={`h-full rounded-full ${s.attendanceRate >= 80 ? 'bg-emerald-500' : s.attendanceRate >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                                                            style={{ width: `${s.attendanceRate}%` }}
                                                        />
                                                    </div>
                                                    <span className={`text-[10px] font-bold ${s.attendanceRate >= 80 ? 'text-emerald-600' : s.attendanceRate >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
                                                        {s.attendanceRate}%
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="p-5 text-center font-bold text-base text-gray-700 bg-emerald-50/20">{s.h}</td>
                                            <td className="p-5 text-center font-bold text-base text-gray-700 bg-amber-50/20">{s.s}</td>
                                            <td className="p-5 text-center font-bold text-base text-gray-700 bg-blue-50/20">{s.i}</td>
                                            <td className="p-5 text-center font-bold text-base text-gray-700 bg-orange-50/20">{s.t}</td>
                                            <td className="p-5 text-center font-bold text-base text-gray-700 bg-red-50/20">{s.a}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </Card>

                    {/* STUDENT LIST - MOBILE (Card Layout to prevent horizontal scroll) */}
                    <div className="md:hidden flex flex-col gap-3">
                        <div className="flex justify-between items-center px-1">
                             <h3 className="font-bold text-gray-900">Statistik Siswa</h3>
                             <span className="text-xs text-emerald-600 font-bold bg-emerald-50 px-2 py-1 rounded">
                                Total: {dashboardStats?.studentStats.length}
                             </span>
                        </div>
                        {dashboardStats?.studentStats.map(s => (
                            <div key={s.id} className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex flex-col gap-3">
                                <div className="flex justify-between items-center">
                                    <span className="font-bold text-gray-800">{s.name}</span>
                                    <span className={`text-xs font-bold px-2 py-1 rounded ${s.attendanceRate >= 80 ? 'bg-emerald-100 text-emerald-700' : s.attendanceRate >= 50 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                                        {s.attendanceRate}% Hadir
                                    </span>
                                </div>
                                <div className="grid grid-cols-5 gap-1.5 text-center text-xs font-medium">
                                    <div className="bg-emerald-50 text-emerald-700 p-2 rounded-lg flex flex-col">
                                        <span className="text-[9px] opacity-70">Hadir</span>
                                        <span className="text-sm font-bold">{s.h}</span>
                                    </div>
                                    <div className="bg-amber-50 text-amber-700 p-2 rounded-lg flex flex-col">
                                        <span className="text-[9px] opacity-70">Sakit</span>
                                        <span className="text-sm font-bold">{s.s}</span>
                                    </div>
                                    <div className="bg-blue-50 text-blue-700 p-2 rounded-lg flex flex-col">
                                        <span className="text-[9px] opacity-70">Izin</span>
                                        <span className="text-sm font-bold">{s.i}</span>
                                    </div>
                                    <div className="bg-orange-50 text-orange-700 p-2 rounded-lg flex flex-col">
                                        <span className="text-[9px] opacity-70">Telat</span>
                                        <span className="text-sm font-bold">{s.t}</span>
                                    </div>
                                    <div className="bg-red-50 text-red-700 p-2 rounded-lg flex flex-col">
                                        <span className="text-[9px] opacity-70">Alpha</span>
                                        <span className="text-sm font-bold">{s.a}</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                         {dashboardStats?.studentStats.length === 0 && (
                            <div className="text-center py-10 text-gray-400 bg-white rounded-xl border border-dashed border-gray-200">
                                Tidak ada data.
                            </div>
                        )}
                    </div>
                </div>
            )}
        </motion.div>
      )}

      {/* CANCEL CLASS MODAL */}
      <Modal isOpen={isCancelModalOpen} onClose={() => setIsCancelModalOpen(false)} title="Batalkan Kelas Ini?">
        <div className="flex flex-col gap-6">
           <p className="text-sm text-gray-600">
             Anda akan membatalkan pertemuan kelas ini untuk hari ini saja. Jadwal minggu depan tidak akan berubah.
           </p>
           
           <div className="space-y-2">
              <label className="text-sm font-bold text-gray-800">Alasan Pembatalan</label>
              <div className="grid grid-cols-2 gap-2">
                 {['Rapat Mendadak', 'Sakit', 'Izin Pulang', 'Kegiatan Sekolah', 'Lainnya'].map(r => (
                   <button 
                     key={r}
                     onClick={() => setCancelReason(r)}
                     className={`py-2 px-3 text-sm rounded-xl border transition-all ${cancelReason === r ? 'bg-red-500 text-white border-red-500' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                   >
                     {r}
                   </button>
                 ))}
              </div>
              <Input 
                value={cancelReason}
                onChange={e => setCancelReason(e.target.value)}
                placeholder="Tulis alasan spesifik..."
              />
           </div>

           <Button variant="danger" onClick={handleConfirmCancel}>
             Konfirmasi Pembatalan
           </Button>
        </div>
      </Modal>
    </div>
  );
};