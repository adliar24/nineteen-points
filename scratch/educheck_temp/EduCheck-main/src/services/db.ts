import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { TeacherProfile, ClassEntity, Student, AttendanceSession, AttendanceRecord, AppState, ScheduleItem, CalendarEvent, ClassCancellation } from '../types';
import { getSupabaseClientOrNull, supabase } from './supabase';

interface EduTrackDB extends DBSchema {
  teacher: {
    key: string;
    value: TeacherProfile;
  };
  classes: {
    key: string;
    value: ClassEntity;
    indexes: { 'by-name': string };
  };
  students: {
    key: string;
    value: Student;
    indexes: { 'by-class': string };
  };
  sessions: {
    key: string;
    value: AttendanceSession;
    indexes: { 'by-class-year': [string, string]; 'by-class-date': [string, string] };
  };
  records: {
    key: string;
    value: AttendanceRecord;
    indexes: { 'by-session': string; 'by-student': string };
  };
  schedules: {
    key: string;
    value: ScheduleItem;
    indexes: { 'by-day': string };
  };
  events: {
    key: string;
    value: CalendarEvent;
    indexes: { 'by-date': string };
  };
  cancellations: {
    key: string;
    value: ClassCancellation;
    indexes: { 'by-date': string; 'by-class': string };
  };
}

const DB_NAME = 'educheck-db';
const DB_VERSION = 5; // Bump version for event time ranges

let dbPromise: Promise<IDBPDatabase<EduTrackDB>>;
let currentDbName: string | null = null;

const AUTH_SCOPE_KEY = 'educheck_auth_user_id';
const ACTIVE_CLASS_KEY = 'activeClassId';

let stateCache: { data: AppState | null; timestamp: number } = { data: null, timestamp: 0 };
const STATE_CACHE_TTL = 3000;

const getScopedUserId = () => {
  if (typeof window === 'undefined') return 'guest';
  return localStorage.getItem(AUTH_SCOPE_KEY) || 'guest';
};

const getScopedDbName = () => `${DB_NAME}-${getScopedUserId()}`;

const getScopedStorageKey = (key: string) => `${getScopedUserId()}:${key}`;

export const setAuthScope = async (userId: string | null) => {
  if (typeof window !== 'undefined') {
    if (userId) localStorage.setItem(AUTH_SCOPE_KEY, userId);
    else localStorage.removeItem(AUTH_SCOPE_KEY);
  }

  if (dbPromise) {
    const db = await dbPromise;
    db.close();
  }

  dbPromise = undefined as any;
  currentDbName = null;
};

export const initDB = () => {
  const scopedDbName = getScopedDbName();
  if (!dbPromise || currentDbName !== scopedDbName) {
    currentDbName = scopedDbName;
    dbPromise = openDB<EduTrackDB>(scopedDbName, DB_VERSION, {
      upgrade(db, oldVersion, newVersion, transaction) {
        try {
          if (oldVersion < 1) {
            db.createObjectStore('teacher', { keyPath: 'id' });
            const classStore = db.createObjectStore('classes', { keyPath: 'id' });
            classStore.createIndex('by-name', 'name');

            const studentStore = db.createObjectStore('students', { keyPath: 'id' });
            studentStore.createIndex('by-class', 'classId');

            const sessionStore = db.createObjectStore('sessions', { keyPath: 'id' });
            sessionStore.createIndex('by-class-year', ['classId', 'schoolYear']);
            sessionStore.createIndex('by-class-date', ['classId', 'dateISO']);

            const recordStore = db.createObjectStore('records', { keyPath: 'id' });
            recordStore.createIndex('by-session', 'sessionId');
            recordStore.createIndex('by-student', 'studentId');
          }
          if (oldVersion < 2) {
            const scheduleStore = db.createObjectStore('schedules', { keyPath: 'id' });
            scheduleStore.createIndex('by-day', 'dayName');
          }
          if (oldVersion < 3) {
            const eventStore = db.createObjectStore('events', { keyPath: 'id' });
            eventStore.createIndex('by-date', 'dateISO');
          }
          if (oldVersion < 4) {
            const cancelStore = db.createObjectStore('cancellations', { keyPath: 'id' });
            cancelStore.createIndex('by-date', 'dateISO');
            cancelStore.createIndex('by-class', 'classId');
          }
        } catch (e) {
          console.error('Error in IndexedDB upgrade:', e);
        }
      },
    }).catch((error) => {
      console.error('Failed to open database:', error);
      throw error;
    });
  }
  return dbPromise;
};

// --- CRUD Operations ---

export const getFullState = async (forceRefresh = false): Promise<AppState> => {
  if (!forceRefresh && stateCache.data && Date.now() - stateCache.timestamp < STATE_CACHE_TTL) {
    return stateCache.data;
  }

  try {
    const db = await initDB();
    const tx = db.transaction(['teacher', 'classes', 'students', 'sessions', 'records', 'schedules', 'events', 'cancellations'], 'readonly');
    
    const teachers = await tx.objectStore('teacher').getAll();
    const classes = await tx.objectStore('classes').getAll();
    const students = await tx.objectStore('students').getAll();
    const sessions = await tx.objectStore('sessions').getAll();
    const records = await tx.objectStore('records').getAll();
    const schedules = await tx.objectStore('schedules').getAll();
    const events = await tx.objectStore('events').getAll();
    const cancellations = await tx.objectStore('cancellations').getAll();
    
    await tx.done;

    const result: AppState = {
      teacher: teachers[0] || null,
      classes: classes || [],
      students: students || [],
      sessions: sessions || [],
      records: records || [],
      schedules: schedules || [],
      events: events || [],
      cancellations: cancellations || [],
      activeClassId: typeof window !== 'undefined' ? localStorage.getItem(getScopedStorageKey(ACTIVE_CLASS_KEY)) : null,
    };

    stateCache = { data: result, timestamp: Date.now() };
    return result;
  } catch (error) {
    console.error('Error in getFullState:', error);
    const emptyState: AppState = {
      teacher: null,
      classes: [],
      students: [],
      sessions: [],
      records: [],
      schedules: [],
      events: [],
      cancellations: [],
      activeClassId: null,
    };
    stateCache = { data: emptyState, timestamp: Date.now() };
    return emptyState;
  }
};

export const saveTeacherProfile = async (profile: TeacherProfile) => {
  const db = await initDB();
  const tx = db.transaction('teacher', 'readwrite');
  await tx.objectStore('teacher').clear();
  await tx.objectStore('teacher').put(profile, 'teacher');
  await tx.done;
  stateCache.data = null;
  autoSyncToCloud();
  
  // Paksa sinkronisasi instan khusus untuk profil
  try {
    const { syncService } = await import('./sync');
    syncService.pushToCloud();
  } catch (e) {
    console.error('[saveTeacherProfile] Instant sync failed:', e);
  }
};

export const addClass = async (cls: ClassEntity) => {
  const db = await initDB();
  await db.put('classes', cls);
  autoSyncToCloud();
};

export const deleteClassCascade = async (classId: string) => {
  const db = await initDB();
  const tx = db.transaction(['classes', 'students', 'sessions', 'records', 'schedules', 'cancellations'], 'readwrite');
  
  // 1. Delete Class
  await tx.objectStore('classes').delete(classId);

  // 2. Delete Students
  const students = await tx.objectStore('students').index('by-class').getAll(classId);
  for (const s of students) {
    await tx.objectStore('students').delete(s.id);
    const studentRecords = await tx.objectStore('records').index('by-student').getAll(s.id);
    for (const r of studentRecords) {
      await tx.objectStore('records').delete(r.id);
    }
  }

  // 3. Delete Sessions
  let allSessions = await tx.objectStore('sessions').getAll();
  const classSessions = allSessions.filter(s => s.classId === classId);
  
  for (const sess of classSessions) {
    await tx.objectStore('sessions').delete(sess.id);
    const sessionRecords = await tx.objectStore('records').index('by-session').getAll(sess.id);
    for (const r of sessionRecords) {
      await tx.objectStore('records').delete(r.id);
    }
  }

  // 4. Delete Schedules linked to this class
  let allSchedules = await tx.objectStore('schedules').getAll();
  const classSchedules = allSchedules.filter(s => s.classId === classId);
  for (const sch of classSchedules) {
    await tx.objectStore('schedules').delete(sch.id);
  }
  
  // 5. Delete Cancellations
  let allCancels = await tx.objectStore('cancellations').getAll();
  const classCancels = allCancels.filter(c => c.classId === classId);
  for(const c of classCancels) {
    await tx.objectStore('cancellations').delete(c.id);
  }

  await tx.done;
  
  if (typeof window !== 'undefined' && localStorage.getItem(getScopedStorageKey(ACTIVE_CLASS_KEY)) === classId) {
    localStorage.removeItem(getScopedStorageKey(ACTIVE_CLASS_KEY));
  }
  
  autoSyncToCloud();
};

export const addStudent = async (student: Student) => {
  const db = await initDB();
  await db.put('students', student);
  autoSyncToCloud();
};

export const deleteStudent = async (studentId: string) => {
  const db = await initDB();
  const tx = db.transaction(['students', 'records'], 'readwrite');
  await tx.objectStore('students').delete(studentId);
  const records = await tx.objectStore('records').index('by-student').getAll(studentId);
  for (const r of records) {
    await tx.objectStore('records').delete(r.id);
  }
  await tx.done;
  autoSyncToCloud();
};

export const upsertSession = async (session: AttendanceSession) => {
  const db = await initDB();
  await db.put('sessions', session);
  autoSyncToCloud();
};

export const deleteSession = async (sessionId: string) => {
  const db = await initDB();
  const tx = db.transaction(['sessions', 'records'], 'readwrite');
  
  await tx.objectStore('sessions').delete(sessionId);
  
  const records = await tx.objectStore('records').index('by-session').getAll(sessionId);
  for(const r of records) {
      await tx.objectStore('records').delete(r.id);
  }
  
  await tx.done;
  autoSyncToCloud();
};

export const upsertRecord = async (record: AttendanceRecord) => {
  const db = await initDB();
  await db.put('records', record);
  autoSyncToCloud();
};

export const addSchedule = async (schedule: ScheduleItem) => {
  const db = await initDB();
  await db.put('schedules', schedule);
  autoSyncToCloud();
}

export const deleteSchedule = async (id: string) => {
  const db = await initDB();
  await db.delete('schedules', id);
  autoSyncToCloud();
}

export const addEvent = async (event: CalendarEvent) => {
  const db = await initDB();
  await db.put('events', event);
  autoSyncToCloud();
}

export const deleteEvent = async (id: string) => {
  const db = await initDB();
  await db.delete('events', id);
  autoSyncToCloud();
}

export const addCancellation = async (cancel: ClassCancellation) => {
  const db = await initDB();
  await db.put('cancellations', cancel);
  autoSyncToCloud();
}

export const deleteCancellation = async (id: string) => {
  const db = await initDB();
  await db.delete('cancellations', id);
  autoSyncToCloud();
}

export const importStudents = async (students: Student[]) => {
  const db = await initDB();
  const tx = db.transaction('students', 'readwrite');
  for (const s of students) {
    await tx.store.put(s);
  }
  await tx.done;
  autoSyncToCloud();
};

// Utils
export const setActiveClassId = (id: string | null) => {
  if (typeof window === 'undefined') return;

  const storageKey = getScopedStorageKey(ACTIVE_CLASS_KEY);
  if (id) {
    localStorage.setItem(storageKey, id);
  } else {
    localStorage.removeItem(storageKey);
  }
};

export const resetAllData = async () => {
  skipSync = true;
  stateCache = { data: null, timestamp: 0 };
  
  const db = await initDB();
  const tx = db.transaction(['teacher', 'classes', 'students', 'sessions', 'records', 'schedules', 'events', 'cancellations'], 'readwrite');
  
  await tx.objectStore('teacher').clear();
  await tx.objectStore('classes').clear();
  await tx.objectStore('students').clear();
  await tx.objectStore('sessions').clear();
  await tx.objectStore('records').clear();
  await tx.objectStore('schedules').clear();
  await tx.objectStore('events').clear();
  await tx.objectStore('cancellations').clear();
  await tx.done;

  if (typeof window !== 'undefined') {
    localStorage.removeItem(getScopedStorageKey(ACTIVE_CLASS_KEY));
  }
  
  // Delete all data from cloud
  try {
    const supabaseClient = getSupabaseClientOrNull();
    if (supabaseClient) {
      const { data: { user } } = await supabaseClient.auth.getUser();
      if (user) {
        const tables = ['teacher_profiles', 'classes', 'students', 'sessions', 'records', 'schedules', 'events', 'cancellations'];
        for (const table of tables) {
          await supabaseClient.from(table).delete().eq('teacher_id', user.id);
        }
        console.log('[resetAllData] All cloud data deleted');
      }
    }
  } catch (e) {
    console.error('[resetAllData] Failed to delete cloud data:', e);
  }
  
  skipSync = false;
};

// Auto-sync to cloud after data changes
let syncTimeout: ReturnType<typeof setTimeout> | null = null;
let skipSync = false;
let lastSyncAttempt = 0;
const SYNC_COOLDOWN = 10000; // 10 seconds between actual syncs

export const setSkipSync = (value: boolean) => {
  skipSync = value;
};

export const clearStateCache = () => {
  stateCache = { data: null, timestamp: 0 };
};

export const autoSyncToCloud = async () => {
  stateCache = { data: null, timestamp: 0 };
  
  if (skipSync) {
    console.log('[Auto-sync] Skipped (bulk operation)');
    return;
  }
  
  if (syncTimeout) clearTimeout(syncTimeout);
  
  syncTimeout = setTimeout(async () => {
    const now = Date.now();
    if (now - lastSyncAttempt < SYNC_COOLDOWN) {
        console.log('[Auto-sync] Cooldown active, waiting for next change...');
        return;
    }

    try {
      const supabase = getSupabaseClientOrNull();
      if (!supabase) return;
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      lastSyncAttempt = now;
      const { syncService } = await import('./sync');
      const result = await syncService.pushToCloud();
      console.log('[Auto-sync] Result:', result);
    } catch (e) {
      console.error('[Auto-sync] Failed:', e);
    }
  }, 5000); // Wait 5 seconds of inactivity before syncing
};
