import React, { useState } from 'react';
import { AppState, ScheduleItem, CalendarEvent, EventType } from '../types';
import { compareClassName } from '../constants';
import { Button, Card, Input, Modal, ConfirmModal } from '../components/UI';
import { addSchedule, deleteSchedule, addEvent, deleteEvent } from '../services/db';
import { Plus, Trash2, Calendar, Clock, BookOpen, CalendarOff, Briefcase, Thermometer, AlertCircle, ChevronDown, CheckCircle2, Pencil } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { motion, AnimatePresence } from 'framer-motion';

interface Props {
  state: AppState;
  refresh: () => void;
  notify: (msg: string, type?: 'success' | 'error') => void;
}

const DAYS = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
const EVENT_TYPES: EventType[] = ['Libur', 'Sakit', 'Dinas', 'Lainnya'];

// Helper Constants for Time Picker
const HOURS = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));
const MINUTES = Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, '0'));

// Custom 24-Hour Time Picker Component
const TimePicker = ({ label, value, onChange }: { label: string, value: string, onChange: (val: string) => void }) => {
  const [h, m] = value ? value.split(':') : ['07', '00'];

  return (
    <div className="flex flex-col gap-1.5 w-full">
      <label className="text-sm font-medium text-gray-700 ml-1">{label}</label>
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <select 
            value={h}
            onChange={(e) => onChange(`${e.target.value}:${m}`)}
            className="w-full appearance-none bg-white text-gray-900 border border-gray-200 rounded-2xl pl-2 pr-6 md:pl-4 md:pr-8 py-3 text-center font-bold text-base md:text-lg outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 transition-all cursor-pointer"
          >
            {HOURS.map(hr => <option key={hr} value={hr}>{hr}</option>)}
          </select>
          <div className="absolute right-2 md:right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
             <ChevronDown className="w-4 h-4" />
          </div>
        </div>
        <span className="text-lg md:text-xl font-bold text-gray-300">:</span>
        <div className="relative flex-1">
          <select 
            value={m}
            onChange={(e) => onChange(`${h}:${e.target.value}`)}
            className="w-full appearance-none bg-white text-gray-900 border border-gray-200 rounded-2xl pl-2 pr-6 md:pl-4 md:pr-8 py-3 text-center font-bold text-base md:text-lg outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 transition-all cursor-pointer"
          >
            {MINUTES.map(min => <option key={min} value={min}>{min}</option>)}
          </select>
          <div className="absolute right-2 md:right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
             <ChevronDown className="w-4 h-4" />
          </div>
        </div>
      </div>
    </div>
  )
}

export const Schedule: React.FC<Props> = ({ state, refresh, notify }) => {
  const currentSchoolIndex = state.teacher?.currentSchoolIndex ?? 0;
  const schoolClasses = state.classes.filter(c => (c.schoolIndex ?? 0) === currentSchoolIndex);
  const schoolClassIds = new Set(schoolClasses.map(c => c.id));
  const sortedClasses = [...schoolClasses].sort((a, b) => compareClassName(a.name, b.name));
  const [tab, setTab] = useState<'weekly' | 'events'>('weekly');

  // --- WEEKLY SCHEDULE STATE ---
  const [activeDay, setActiveDay] = useState('Senin');
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);
  const [newClassId, setNewClassId] = useState('');
  
  // Delete State
  const [deleteTarget, setDeleteTarget] = useState<{id: string, type: 'schedule'|'event'} | null>(null);
  
  // Default values in 24h format
  const [startTime, setStartTime] = useState('07:00');
  const [endTime, setEndTime] = useState('08:30');

  // --- EVENTS STATE ---
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [eventDate, setEventDate] = useState('');
  const [eventEndDate, setEventEndDate] = useState('');
  const [eventType, setEventType] = useState<EventType>('Libur');
  const [eventDesc, setEventDesc] = useState('');
  const [isFullDay, setIsFullDay] = useState(true);
  const [eventStart, setEventStart] = useState('07:00');
  const [eventEnd, setEventEnd] = useState('14:00');

  const currentSchedules = state.schedules
    .filter(s => schoolClassIds.has(s.classId))
    .filter(s => s.dayName === activeDay)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  const upcomingEvents = state.events
    .sort((a, b) => a.dateISO.localeCompare(b.dateISO));

  // --- HANDLERS ---

  const handleOpenAddSchedule = () => {
    setEditingScheduleId(null);
    setNewClassId('');
    setStartTime('07:00');
    setEndTime('08:30');
    setIsScheduleModalOpen(true);
  }

  const handleOpenEditSchedule = (sch: ScheduleItem) => {
    setEditingScheduleId(sch.id);
    setNewClassId(sch.classId);
    setStartTime(sch.startTime);
    setEndTime(sch.endTime);
    setIsScheduleModalOpen(true);
  }

  const handleSaveSchedule = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newClassId || !startTime || !endTime) return;
    const schedule: ScheduleItem = {
      id: editingScheduleId || uuidv4(),
      dayName: activeDay,
      classId: newClassId,
      startTime,
      endTime
    };
    await addSchedule(schedule);
    refresh();
    setIsScheduleModalOpen(false);
    notify(editingScheduleId ? "Jadwal diperbarui" : "Jadwal ditambahkan");
  };

  const handleConfirmDelete = async () => {
      if (!deleteTarget) return;

      if (deleteTarget.type === 'schedule') {
          await deleteSchedule(deleteTarget.id);
          notify("Jadwal dihapus");
      } else {
          await deleteEvent(deleteTarget.id);
          notify("Catatan kalender dihapus");
      }
      refresh();
      setDeleteTarget(null);
  };

  const handleAddEvent = async (e?: React.FormEvent) => {
    if(e) e.preventDefault();
    if (!eventDate || !eventDesc) return;
    
    const startDate = new Date(eventDate);
    const endDate = eventEndDate ? new Date(eventEndDate) : startDate;
    
    // Handle case where end date is before start date
    if (endDate < startDate) {
      notify("Tanggal akhir tidak boleh sebelum tanggal mulai.", "error");
      return;
    }

    // Generate all dates in range
    const dates: string[] = [];
    const current = new Date(startDate);
    while (current <= endDate) {
      dates.push(current.toISOString().split('T')[0]);
      current.setDate(current.getDate() + 1);
    }

    // Create event for each date
    for (let i = 0; i < dates.length; i++) {
      const isLastDay = i === dates.length - 1;
      const event: CalendarEvent = {
        id: i === 0 ? uuidv4() : uuidv4(),
        dateISO: dates[i],
        endDateISO: dates.length > 1 && isLastDay ? dates[dates.length - 1] : undefined,
        type: eventType,
        description: dates.length > 1 
          ? `${eventDesc} (${i + 1}/${dates.length})` 
          : eventDesc,
        isFullDay,
        startTime: !isFullDay ? eventStart : undefined,
        endTime: !isFullDay ? eventEnd : undefined,
        createdAt: new Date().toISOString()
      };
      await addEvent(event);
    }
    
    refresh();
    setIsEventModalOpen(false);
    setEventDate('');
    setEventEndDate('');
    setEventDesc('');
    setIsFullDay(true);
    notify(dates.length > 1 ? `Catatan kalender disimpan untuk ${dates.length} hari` : "Catatan kalender disimpan");
  };

  const getEventIcon = (type: EventType) => {
      switch(type) {
          case 'Libur': return <CalendarOff className="w-5 h-5 text-red-500" />;
          case 'Sakit': return <Thermometer className="w-5 h-5 text-amber-500" />;
          case 'Dinas': return <Briefcase className="w-5 h-5 text-blue-500" />;
          default: return <AlertCircle className="w-5 h-5 text-gray-500" />;
      }
  }

  const getEventColor = (type: EventType) => {
    switch(type) {
        case 'Libur': return 'bg-red-50 border-red-100';
        case 'Sakit': return 'bg-amber-50 border-amber-100';
        case 'Dinas': return 'bg-blue-50 border-blue-100';
        default: return 'bg-gray-50 border-gray-100';
    }
  }

  // --- SUB-COMPONENTS FOR SPLIT VIEW ---
  const WeeklyView = () => (
      <div className="flex flex-col h-full">
          {/* Day Tabs */}
          <div className="flex justify-between items-center mb-4">
             <h3 className="font-bold text-gray-700 text-lg">Jadwal Pelajaran</h3>
             <Button onClick={handleOpenAddSchedule} className="!px-3 !py-2 text-xs rounded-xl">
               <Plus className="w-4 h-4 mr-1" /> Tambah Jam
             </Button>
          </div>
          <div className="flex flex-wrap gap-2 mb-6 bg-gray-100 p-1.5 rounded-2xl">
            {DAYS.map(day => (
              <button
                key={day}
                onClick={() => setActiveDay(day)}
                className={`flex-1 min-w-[80px] px-3 py-2 rounded-xl text-sm font-semibold transition-all text-center ${
                  activeDay === day 
                    ? 'bg-white text-emerald-600 shadow-sm ring-1 ring-black/5' 
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {day}
              </button>
            ))}
          </div>

          {/* List */}
          <div className="flex flex-col gap-4 flex-1">
            {currentSchedules.length === 0 && (
              <div className="text-center py-16 bg-white rounded-3xl border-dashed border-2 border-gray-100 text-gray-400 flex flex-col items-center justify-center h-full min-h-[300px]">
                <Calendar className="w-16 h-16 mx-auto mb-4 opacity-10" />
                <p className="font-medium">Belum ada jadwal hari {activeDay}.</p>
                <Button variant="ghost" onClick={handleOpenAddSchedule} className="mt-3 text-emerald-600 hover:bg-emerald-50">
                  + Tambah Jadwal Sekarang
                </Button>
              </div>
            )}
            
            <AnimatePresence mode="popLayout">
            {currentSchedules.map(sch => {
              const cls = schoolClasses.find(c => c.id === sch.classId);
              return (
                <motion.div 
                  key={sch.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  layout
                >
                  <Card className="flex items-center justify-between p-6 hover:shadow-lg transition-shadow border border-gray-100 hover:border-emerald-200">
                    <div className="flex items-center gap-6">
                      <div className="flex flex-col items-center justify-center w-20 h-20 bg-emerald-50 rounded-2xl text-emerald-700 border border-emerald-100 shrink-0">
                        <span className="text-lg font-bold">{sch.startTime}</span>
                        <div className="h-px w-10 bg-emerald-200 my-1"></div>
                        <span className="text-xs opacity-75 font-semibold">{sch.endTime}</span>
                      </div>
                      <div>
                        <h3 className="font-bold text-gray-900 text-xl">{cls?.name || 'Kelas Dihapus'}</h3>
                        <div className="flex items-center gap-2 text-sm text-gray-500 mt-1">
                          <div className="bg-gray-100 p-1 rounded-md"><BookOpen className="w-3.5 h-3.5" /></div>
                          <span className="font-medium">{cls?.subject}</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex flex-col gap-2">
                      <button 
                        onClick={() => handleOpenEditSchedule(sch)}
                        className="p-3 text-gray-300 hover:text-emerald-500 hover:bg-emerald-50 rounded-xl transition-colors"
                        title="Edit Jadwal"
                      >
                        <Pencil className="w-5 h-5" />
                      </button>
                      <button 
                        onClick={() => setDeleteTarget({ id: sch.id, type: 'schedule' })}
                        className="p-3 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors"
                        title="Hapus Jadwal"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </Card>
                </motion.div>
              );
            })}
            </AnimatePresence>
          </div>
      </div>
  );

  const EventsView = () => (
      <div className="flex flex-col h-full">
          <div className="flex justify-between items-center mb-4">
             <h3 className="font-bold text-gray-700 text-lg">Kalender Sekolah</h3>
             <Button onClick={() => setIsEventModalOpen(true)} className="!px-3 !py-2 text-xs rounded-xl bg-gray-800 hover:bg-gray-900 shadow-gray-300">
               <Plus className="w-4 h-4 mr-1" /> Catatan
             </Button>
          </div>
          
          <div className="flex flex-col gap-3 flex-1 overflow-y-auto max-h-[calc(100vh-250px)] no-scrollbar">
             {upcomingEvents.length === 0 && (
                <div className="text-center py-10 bg-white rounded-3xl border-dashed border-2 border-gray-100 text-gray-400">
                    <CalendarOff className="w-10 h-10 mx-auto mb-3 opacity-20" />
                    <p className="text-sm">Tidak ada catatan libur/izin.</p>
                </div>
             )}
             
             {upcomingEvents.map(evt => {
                 const dateObj = new Date(evt.dateISO);
                 const dateLabel = dateObj.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
                 const dayLabel = dateObj.toLocaleDateString('id-ID', { weekday: 'long' });
                 const isPast = dateObj < new Date(new Date().setHours(0,0,0,0));

                 return (
                     <Card key={evt.id} className={`p-4 flex items-center justify-between border ${getEventColor(evt.type)} ${isPast ? 'opacity-60 grayscale' : ''}`}>
                        <div className="flex items-start gap-3">
                           <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm shrink-0 mt-0.5">
                               {getEventIcon(evt.type)}
                           </div>
                           <div>
                               <div className="flex items-center gap-2 mb-0.5">
                                  <span className="text-[10px] font-bold uppercase tracking-wider bg-white/60 px-1.5 py-0.5 rounded">{evt.type}</span>
                                  <span className="text-xs text-gray-500 font-medium">{dayLabel}</span>
                               </div>
                               <h3 className="font-bold text-gray-900 text-sm leading-tight">{evt.description}</h3>
                               <div className="flex items-center gap-2 mt-1">
                                  <span className="text-xs text-gray-500">{dateLabel}</span>
                                  {!evt.isFullDay && (
                                     <span className="text-[10px] font-bold bg-white/60 text-gray-600 px-1 rounded border border-gray-100">
                                       {evt.startTime} - {evt.endTime}
                                     </span>
                                  )}
                               </div>
                           </div>
                        </div>
                        <button onClick={() => setDeleteTarget({ id: evt.id, type: 'event' })} className="p-2 text-gray-400 hover:text-red-500 transition-colors">
                            <Trash2 className="w-4 h-4" />
                        </button>
                     </Card>
                 )
             })}
          </div>
      </div>
  );

  return (
    <div className="p-6 pb-24 md:pb-6 h-full">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Jadwal & Kalender</h1>
          <p className="text-gray-500 text-sm">Atur jadwal mingguan dan hari libur sekolah</p>
        </div>
        
        {/* Mobile Toggle only */}
        <div className="lg:hidden flex bg-gray-100 p-1 rounded-xl self-start">
            <button 
                onClick={() => setTab('weekly')}
                className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all ${tab === 'weekly' ? 'bg-white shadow text-emerald-600' : 'text-gray-500'}`}
            >
                Jadwal
            </button>
            <button 
                onClick={() => setTab('events')}
                className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all ${tab === 'events' ? 'bg-white shadow text-emerald-600' : 'text-gray-500'}`}
            >
                Kalender
            </button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-8 items-start h-full">
         
         {/* LEFT (MAIN SCHEDULE) - Always visible on Desktop, Toggled on Mobile */}
         <div className={`flex-1 w-full ${(tab === 'weekly' || window.innerWidth >= 1024) ? 'block' : 'hidden'}`}>
             <WeeklyView />
         </div>

         {/* RIGHT (EVENTS SIDEBAR) - Always visible on Desktop, Toggled on Mobile */}
         <div className={`w-full lg:w-96 shrink-0 lg:sticky lg:top-8 ${(tab === 'events' || window.innerWidth >= 1024) ? 'block' : 'hidden'}`}>
             <EventsView />
         </div>

      </div>

      {/* SCHEDULE MODAL */}
      <Modal isOpen={isScheduleModalOpen} onClose={() => setIsScheduleModalOpen(false)} title={editingScheduleId ? "Edit Jadwal" : `Jadwal Hari ${activeDay}`}>
        <form onSubmit={handleSaveSchedule} className="flex flex-col gap-5">
           <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-xl text-xs text-emerald-700 leading-relaxed mb-1">
             <span className="font-bold">Info:</span> Gunakan format waktu 24 jam (Contoh: 13:00 untuk jam 1 siang).
           </div>

           <div className="space-y-1.5">
             <label className="text-sm font-medium text-gray-700 ml-1">Pilih Kelas</label>
             <select 
               className="w-full bg-white text-gray-900 border border-gray-200 rounded-2xl px-4 py-3 outline-none focus:ring-2 focus:ring-emerald-500"
               value={newClassId}
               onChange={e => setNewClassId(e.target.value)}
             >
               <option value="">-- Pilih Kelas --</option>
               {sortedClasses.map(c => (
                 <option key={c.id} value={c.id}>{c.name} ({c.subject})</option>
               ))}
             </select>
           </div>
           
           <div className="grid grid-cols-2 gap-4">
             <TimePicker 
               label="Jam Mulai"
               value={startTime}
               onChange={setStartTime}
             />
             <TimePicker 
               label="Jam Selesai"
               value={endTime}
               onChange={setEndTime}
             />
           </div>

           <Button type="submit" disabled={!newClassId || !startTime || !endTime}>
             Simpan Jadwal
           </Button>
        </form>
      </Modal>

      {/* EVENT MODAL */}
      <Modal isOpen={isEventModalOpen} onClose={() => setIsEventModalOpen(false)} title="Tambah Catatan Libur/Izin">
         <form onSubmit={handleAddEvent} className="flex flex-col gap-5">
             <div className="grid grid-cols-2 gap-3">
               <Input 
                  label="Mulai"
                  type="date"
                  value={eventDate}
                  onChange={e => {
                    setEventDate(e.target.value);
                    if (!eventEndDate || new Date(e.target.value) > new Date(eventEndDate)) {
                      setEventEndDate(e.target.value);
                    }
                  }}
                />
                <Input 
                  label="Sampai"
                  type="date"
                  value={eventEndDate}
                  onChange={e => setEventEndDate(e.target.value)}
                />
             </div>
             {(eventDate && eventEndDate && eventDate !== eventEndDate) && (
               <div className="text-xs text-emerald-600 bg-emerald-50 px-3 py-2 rounded-lg">
                 ✓ Libur {Math.ceil((new Date(eventEndDate).getTime() - new Date(eventDate).getTime()) / (1000 * 60 * 60 * 24)) + 1} hari
               </div>
             )}
             
             <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700 ml-1">Jenis Keterangan</label>
                <div className="grid grid-cols-2 gap-2">
                    {EVENT_TYPES.map(type => (
                        <button
                           type="button"
                           key={type}
                           onClick={() => setEventType(type)}
                           className={`py-2 px-3 rounded-xl text-sm font-medium border transition-all ${
                               eventType === type 
                               ? 'bg-emerald-500 text-white border-emerald-500 shadow-md' 
                               : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                           }`}
                        >
                            {type}
                        </button>
                    ))}
                </div>
             </div>

             <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 flex flex-col gap-3">
                 <label className="text-sm font-medium text-gray-700">Durasi</label>
                 <div className="flex bg-white rounded-lg p-1 border border-gray-200">
                    <button 
                        type="button"
                        onClick={() => setIsFullDay(true)}
                        className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${isFullDay ? 'bg-emerald-500 text-white shadow-sm' : 'text-gray-500'}`}
                    >
                        Seharian
                    </button>
                    <button 
                        type="button"
                        onClick={() => setIsFullDay(false)}
                        className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${!isFullDay ? 'bg-emerald-500 text-white shadow-sm' : 'text-gray-500'}`}
                    >
                        Jam Tertentu
                    </button>
                 </div>

                 {!isFullDay && (
                     <div className="grid grid-cols-2 gap-3 mt-1 animate-in slide-in-from-top-2 fade-in duration-300">
                         <TimePicker label="Mulai" value={eventStart} onChange={setEventStart} />
                         <TimePicker label="Selesai" value={eventEnd} onChange={setEventEnd} />
                     </div>
                 )}
             </div>

             <Input 
                label="Keterangan / Alasan"
                placeholder="Contoh: Hari Raya Idul Fitri / Dinas ke Provinsi"
                value={eventDesc}
                onChange={e => setEventDesc(e.target.value)}
             />

             <Button type="submit" disabled={!eventDate || !eventDesc}>
                 Simpan Catatan
             </Button>
         </form>
      </Modal>

      {/* CONFIRMATION MODAL */}
      <ConfirmModal 
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
        title={deleteTarget?.type === 'schedule' ? "Hapus Jadwal?" : "Hapus Catatan?"}
        description={deleteTarget?.type === 'schedule' ? "Jadwal ini akan dihapus dari daftar." : "Catatan kalender ini akan dihapus permanen."}
      />
    </div>
  );
};