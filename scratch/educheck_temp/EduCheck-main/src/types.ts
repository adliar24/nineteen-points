export interface LateSetting {
  isEnabled: boolean;
  bufferMinutes: number;
}

export interface TeacherProfile {
  id: string;
  teacherName: string;
  schools: string[];
  currentSchoolIndex: number;
  schoolYear: string;
  subjects: string[];
  customSubjects: string[];
  lateSetting: LateSetting;
  notificationMinutes?: number;
  lastSyncTimestamp?: string;
  createdAt: string;
}

export const getCurrentSchoolName = (profile: TeacherProfile | null | undefined): string => {
  if (!profile || !profile.schools || !Array.isArray(profile.schools)) return 'SEKOLAH';
  const cleanSchools = profile.schools.filter(s => s && s.trim().length > 0);
  if (cleanSchools.length === 0) return 'SEKOLAH';
  
  const idx = profile.currentSchoolIndex ?? 0;
  return cleanSchools[idx] || cleanSchools[0] || 'SEKOLAH';
};

export interface ClassEntity {
  id: string;
  name: string;
  subject: string;
  schoolIndex: number;
  createdAt: string;
}

export interface Student {
  id: string;
  classId: string;
  name: string;
  createdAt: string;
  face_embedding?: string;
}

export interface StudentWithFace extends Student {
  face_embedding: string;
}

export interface FaceMatchResult {
  studentId: string;
  studentName: string;
  distance: number;
  isMatch: boolean;
}

export type FaceEnrollmentStatus = 'idle' | 'loading' | 'enrolling' | 'success' | 'error';
export type FaceScanStatus = 'idle' | 'loading' | 'scanning' | 'matched' | 'not_found' | 'error';

export interface AttendanceSession {
  id: string;
  classId: string;
  schoolYear: string;
  dateISO: string; // YYYY-MM-DD
  dayName: string;
  dateLabel: string;
  meetingNumber: number;
  topic: string;
  scheduleId?: string; // Links this session to a specific schedule slot
  createdAt: string;
}

export type AttendanceStatus = 'Hadir' | 'Izin' | 'Sakit' | 'Alpha' | 'Terlambat';

export interface AttendanceRecord {
  id: string;
  sessionId: string;
  studentId: string;
  status: AttendanceStatus;
  timeISO: string;
  timeHHMMSS: string;
  note?: string;
}

export interface ScheduleItem {
  id: string;
  dayName: string; // 'Senin', 'Selasa', etc.
  classId: string;
  startTime: string; // "07:00"
  endTime: string; // "08:30"
}

export type EventType = 'Libur' | 'Sakit' | 'Dinas' | 'Lainnya';

export interface CalendarEvent {
  id: string;
  dateISO: string; // YYYY-MM-DD (start date)
  endDateISO?: string; // YYYY-MM-DD (end date for multi-day events)
  type: EventType;
  description: string;
  isFullDay: boolean;
  startTime?: string;
  endTime?: string;
  createdAt: string;
}

export interface ClassCancellation {
  id: string;
  dateISO: string; // YYYY-MM-DD
  classId: string; // Refers to ClassEntity.id
  scheduleId?: string; // Optional, to be specific about which schedule slot
  reason: string;
}

export interface AppState {
  teacher: TeacherProfile | null;
  classes: ClassEntity[];
  students: Student[];
  sessions: AttendanceSession[];
  records: AttendanceRecord[];
  schedules: ScheduleItem[];
  events: CalendarEvent[];
  cancellations: ClassCancellation[];
  activeClassId: string | null;
}
