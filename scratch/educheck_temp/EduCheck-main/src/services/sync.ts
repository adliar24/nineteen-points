import { getSupabaseClient, supabase } from './supabase';
import { getFullState, initDB, saveTeacherProfile } from './db';
import { TeacherProfile } from '../types';

// Tables to sync
const TABLES = ['classes', 'students', 'sessions', 'records', 'schedules', 'events', 'cancellations'];

export const syncService = {
  // --- AUTH ---
  async signUp(email: string, pass: string) {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.auth.signUp({ email, password: pass });
    if (error) throw error;
    return data;
  },

  async signIn(email: string, pass: string) {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password: pass });
    if (error) throw error;
    return data;
  },

  async signOut() {
    const supabase = getSupabaseClient();
    await supabase.auth.signOut();
  },

  async getUser() {
    if (!supabase) return null;
    try {
      const supabase = getSupabaseClient();
      const { data: { user } } = await supabase.auth.getUser();
      return user;
    } catch {
      return null;
    }
  },

  isConfigured(): boolean {
    return supabase !== null;
  },

  // --- SYNC CORE ---
  
  /**
   * PUSH: Menyalin data IndexedDB lokal ke Supabase Cloud
   */
  async pushToCloud(): Promise<{ success: boolean; message: string }> {
    if (!supabase) {
      console.warn('Supabase not configured, skipping push');
      return { success: false, message: 'Supabase belum dikonfigurasi' };
    }
    
    const client = getSupabaseClient();
    const user = await this.getUser();
    console.log('[pushToCloud] User:', user?.id);
    
    if (!user) {
      return { success: false, message: 'Silakan login untuk sinkronisasi' };
    }

    const state = await getFullState();
    console.log('[pushToCloud] State to push:', {
      teacher: state.teacher?.teacherName,
      classes: state.classes.length,
      students: state.students.length
    });
    
    // 1. Sync Teacher Profile
    if (state.teacher) {
      console.log('[pushToCloud] Syncing to ACTUAL schema (Strict Mode):', state.teacher);
      
      const teacherToPush = {
        id: String(state.teacher.id || user.id),
        user_id: user.id,
        teacherName: state.teacher.teacherName || 'Guru',
        schoolName: (state.teacher.schools && state.teacher.schools[state.teacher.currentSchoolIndex]) || 'Sekolah Belum Diatur',
        schoolYear: state.teacher.schoolYear || '2024/2025',
        subjects: Array.isArray(state.teacher.subjects) ? state.teacher.subjects : [],
        customSubjects: Array.isArray(state.teacher.customSubjects) ? state.teacher.customSubjects : [],
        notificationMinutes: Number(state.teacher.notificationMinutes) || 0,
        lateSetting: state.teacher.lateSetting || { isEnabled: true, bufferMinutes: 15 },
        createdAt: state.teacher.createdAt || new Date().toISOString()
      };

      const { error } = await client.from('teacher_profiles').upsert(teacherToPush, {
        onConflict: 'user_id'
      });

      if (error) {
        console.error('[pushToCloud] GAGAL unggah profil:', error.message);
        window.alert("SUPABASE ERROR: " + error.message);
      } else {
        console.log('[pushToCloud] BERHASIL unggah profil ke Supabase.');
      }
    }

    // 2. Sync all other tables (non-destructive sync)
    for (const tableName of TABLES) {
      const data = (state as any)[tableName] || [];
      console.log(`[pushToCloud] ${tableName}:`, data.length, 'items');
      
      const dataToSync = data.map((item: any) => {
        let syncItem: any = { ...item, teacher_id: user.id };
        if (tableName === 'students' && item.face_embedding) {
          syncItem.face_vector = item.face_embedding;
        }
        return syncItem;
      });

      // Step A: Upsert current local data
      if (dataToSync.length > 0) {
        // Break into chunks of 100 to avoid request size limits
        const chunks = [];
        for (let i = 0; i < dataToSync.length; i += 100) {
          chunks.push(dataToSync.slice(i, i + 100));
        }

        for (const chunk of chunks) {
          const { error: upsertError } = await client.from(tableName).upsert(chunk);
          if (upsertError) console.error(`Error upserting ${tableName} chunk:`, upsertError);
        }
      }

      // Step B: Remove data from cloud that no longer exists locally
      const localIds = data.map((item: any) => item.id);
      if (localIds.length > 0) {
        const { error: cleanupError } = await client
          .from(tableName)
          .delete()
          .eq('teacher_id', user.id)
          .not('id', 'in', `(${localIds.join(',')})`);
        
        if (cleanupError) console.error(`Error cleaning up ${tableName}:`, cleanupError);
      } else {
        // If local is empty, delete everything for this user
        await client.from(tableName).delete().eq('teacher_id', user.id);
      }
    }
    
    console.log('[pushToCloud] Complete');
    
    // Update last sync timestamp
    const nowISO = new Date().toISOString();
    if (state.teacher) {
      const updatedProfile = { ...state.teacher, lastSyncTimestamp: nowISO };
      await saveTeacherProfile(updatedProfile);
    }

    return { success: true, message: 'Data berhasil disinkronisasi ke cloud' };
  },

  /**
   * PULL: Mengambil data dari Cloud dan memperbarui database lokal
   */
  async pullFromCloud(): Promise<{ success: boolean; message: string }> {
    if (!supabase) {
      console.warn('Supabase not configured, skipping pull');
      return { success: false, message: 'Supabase belum dikonfigurasi' };
    }
    
    const client = getSupabaseClient();
    const user = await this.getUser();
    console.log('[pullFromCloud] User:', user?.id);
    
    if (!user) {
      return { success: false, message: 'Silakan login untuk sinkronisasi' };
    }

    // Clear state cache before pulling to ensure fresh data
    const { clearStateCache } = await import('./db');
    clearStateCache();
    
    const db = await initDB();
    console.log('[pullFromCloud] Starting pull for user:', user.id);

    // 1. Pull Teacher Profile (Dual-Search Strategy)
    console.log('[pullFromCloud] Fetching profile for user_id:', user.id);
    let { data: rawTeacher, error: teacherError } = await client.from('teacher_profiles').select('*').eq('user_id', user.id).maybeSingle();
    
    // Fallback: If not found by user_id, try by id (sometimes they are the same)
    if (!rawTeacher && !teacherError) {
      console.log('[pullFromCloud] Profile not found by user_id, trying by id...');
      const { data: fallbackTeacher, error: fallbackError } = await client.from('teacher_profiles').select('*').eq('id', user.id).maybeSingle();
      if (fallbackTeacher) {
        rawTeacher = fallbackTeacher;
        console.log('[pullFromCloud] Profile found using fallback id!');
      }
    }
    
    if (rawTeacher) {
      console.log('[pullFromCloud] Processing based on ACTUAL schema:', rawTeacher);
      
      const normalizedTeacher: any = { 
        id: rawTeacher.id || user.id,
        teacherName: rawTeacher.teacherName || rawTeacher.teacher_name || 'Guru',
        schoolYear: rawTeacher.schoolYear || rawTeacher.school_year || '2024/2025',
        currentSchoolIndex: rawTeacher.current_school_index || 0,
        subjects: Array.isArray(rawTeacher.subjects) ? rawTeacher.subjects : [],
        customSubjects: Array.isArray(rawTeacher.customSubjects) ? rawTeacher.customSubjects : [],
        notificationMinutes: rawTeacher.notificationMinutes || 0,
        lateSetting: rawTeacher.lateSetting || { isEnabled: true, bufferMinutes: 15 }
      };
      
      // Schools mapping
      let schools = rawTeacher.schools || [];
      if (rawTeacher.schoolName && !schools.includes(rawTeacher.schoolName)) {
        schools = [rawTeacher.schoolName, ...schools];
      }
      normalizedTeacher.schools = schools.length > 0 ? schools : ['Sekolah Belum Diatur'];

      await saveTeacherProfile(normalizedTeacher as TeacherProfile);
      console.log('[pullFromCloud] Final Match with Schema:', normalizedTeacher);
    }
 else {
      console.warn('[pullFromCloud] WARNING: No teacher profile found in Supabase for this user ID.');
    }

    // 2. Pull all other tables
    for (const tableName of TABLES) {
      const { data, error } = await client.from(tableName).select('*').eq('teacher_id', user.id);
      console.log(`[pullFromCloud] ${tableName}:`, { count: data?.length, error });
      
      if (error) {
        console.error(`Error pulling ${tableName}:`, error);
        continue;
      }

      if (data && data.length > 0) {
        // Bulk put in local IDB
        const tx = db.transaction(tableName as any, 'readwrite');
        const store = tx.objectStore(tableName as any);
        for (const item of data) {
          // For students table, also copy face_vector to face_embedding for local compatibility
          // But only if face_vector exists AND face_embedding is null/undefined
          if (tableName === 'students' && item.face_vector && !item.face_embedding) {
            item.face_embedding = item.face_vector;
            console.log('[pullFromCloud] Copied face_vector to face_embedding for student:', item.id);
          }
          // If face_vector is null but face_embedding exists in cloud, use that
          if (tableName === 'students' && !item.face_vector && item.face_embedding) {
            console.log('[pullFromCloud] Using face_embedding for student:', item.id);
          }
          // If both are null/undefined, ensure face_embedding is explicitly null (deleted)
          if (tableName === 'students' && !item.face_vector && !item.face_embedding) {
            item.face_embedding = null;
            console.log('[pullFromCloud] Clearing face for student:', item.id);
          }
          await store.put(item);
        }
        await tx.done;
      }
    }
    
    console.log('[pullFromCloud] Complete');
    return { success: true, message: 'Data berhasil diambil dari cloud' };
  },

  /**
   * FULL SYNC: Pull followed by Push
   */
  async syncDrive() {
    try {
      console.log("Starting Sync Pull...");
      await this.pullFromCloud();
      console.log("Starting Sync Push...");
      await this.pushToCloud();
      return { success: true };
    } catch (e: any) {
      console.error("Sync Error:", e);
      throw e;
    }
  }
};
