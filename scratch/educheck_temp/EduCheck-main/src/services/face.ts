import * as faceapi from 'face-api.js';
import { getSupabaseClient, getSupabaseClientOrNull } from './supabase';
import { initDB, clearStateCache } from './db';

const MODEL_URL = '/models';
const FACE_DATA_URL = '/data/face-embeddings.json';

let modelsLoaded = false;
let lastLoadTime = 0;
const CACHE_DURATION = 60000;

const MATCH_THRESHOLD_HIGH = 0.65;
const MATCH_THRESHOLD_MEDIUM = 0.55;

export interface FaceEmbeddingEntry {
  id: string;
  name: string;
  face_embedding: string;
}

export interface MatchResult {
  success: boolean;
  studentId?: string;
  studentName?: string;
  confidence?: number;
  message: string;
}

export interface FaceDetectionResult {
  boundingBox: { x: number; y: number; width: number; height: number };
  imageData: ImageData | null;
  descriptor: Float32Array | null;
}

export async function loadModels(): Promise<boolean> {
  if (modelsLoaded && Date.now() - lastLoadTime < CACHE_DURATION) return true;
  
  const fullUrl = new URL(MODEL_URL, window.location.origin).href;
  console.log('[FaceService] Loading models from:', fullUrl);
  
  try {
    console.log('[FaceService] Loading face-api.js models...');
    
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(fullUrl),
      faceapi.nets.faceLandmark68Net.loadFromUri(fullUrl),
      faceapi.nets.faceRecognitionNet.loadFromUri(fullUrl),
    ]);
    
    modelsLoaded = true;
    lastLoadTime = Date.now();
    console.log('[FaceService] Face API models loaded successfully');
    return true;
  } catch (error: any) {
    const errorMsg = error?.message || '';
    console.warn('[FaceService] Model load warning:', errorMsg);
    
    if (errorMsg.includes('tensor') || errorMsg.includes('values')) {
      throw new Error('Model AI corrupt. Clear browser cache or use incognito mode.');
    }
    if (errorMsg.includes('Unexpected token') || errorMsg.includes('is not valid JSON')) {
      console.warn('[FaceService] Model files not found at ' + fullUrl + ' - face features will be disabled');
      return false;
    }
    if (errorMsg.includes('Failed to fetch') || errorMsg.includes('NetworkError') || errorMsg.includes('fetch')) {
      console.warn('[FaceService] Network error - continuing without face features');
      return false;
    }
    throw new Error('Gagal memuat model pengenalan wajah. Periksa koneksi internet.');
  }
}

export function isModelLoaded(): boolean {
  return modelsLoaded;
}

export async function loadModelsForce(): Promise<boolean> {
  modelsLoaded = false;
  lastLoadTime = 0;
  return await loadModels();
}

export async function initializeAllModels(): Promise<boolean> {
  return await loadModels();
}

export async function detectFaceFromVideo(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement
): Promise<FaceDetectionResult | null> {
  if (!modelsLoaded) {
    const loaded = await loadModels();
    if (!loaded) return null;
  }
  
  try {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);
    
    const detection = await faceapi
      .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.35 }))
      .withFaceLandmarks()
      .withFaceDescriptor();
    
    if (!detection) {
      return null;
    }
    
    const box = detection.detection.box;
    const padding = Math.max(box.width, box.height) * 0.25;
    const x = Math.max(0, box.x - padding / 2);
    const y = Math.max(0, box.y - padding / 2);
    const w = Math.min(canvas.width - x, box.width + padding);
    const h = Math.min(canvas.height - y, box.height + padding);
    
    const faceCanvas = document.createElement('canvas');
    faceCanvas.width = 224;
    faceCanvas.height = 224;
    const faceCtx = faceCanvas.getContext('2d', { willReadFrequently: true });
    if (!faceCtx) return null;
    
    faceCtx.drawImage(canvas, x, y, w, h, 0, 0, 224, 224);
    const imageData = faceCtx.getImageData(0, 0, 224, 224);
    
    return {
      boundingBox: { x: box.x, y: box.y, width: box.width, height: box.height },
      imageData,
      descriptor: detection.descriptor,
    };
  } catch (error) {
    console.error('[FaceService] Detection error:', error);
    return null;
  }
}

export async function extractFaceDescriptor(
  imageElement: HTMLImageElement | HTMLCanvasElement
): Promise<Float32Array | null> {
  return getFaceDescriptorFromImage(imageElement);
}

export async function saveFaceDescriptor(
  studentId: string,
  descriptor: Float32Array
): Promise<boolean> {
  try {
    await saveFaceEmbeddingLocal(studentId, descriptor);
    await saveFaceEmbeddingToSupabase(studentId, descriptor);
    return true;
  } catch (error) {
    console.error('[FaceService] Save descriptor error:', error);
    return false;
  }
}

export { findBestMatchCombined as findBestMatchFromSupabase };

function descriptorToString(descriptor: Float32Array): string {
  return Array.from(descriptor).join(',');
}

export function stringToDescriptor(str: string): Float32Array {
  const arr = str.split(',').map(Number);
  return new Float32Array(arr);
}

function euclideanDistance(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

export async function getFaceDescriptor(
  video: HTMLVideoElement
): Promise<Float32Array | null> {
  if (!modelsLoaded) {
    const loaded = await loadModels();
    if (!loaded) return null;
  }

  const detection = await faceapi
    .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.35 }))
    .withFaceLandmarks()
    .withFaceDescriptor();

  return detection?.descriptor || null;
}

export async function getFaceDescriptorFromImage(
  image: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement
): Promise<Float32Array | null> {
  if (!modelsLoaded) {
    const loaded = await loadModels();
    if (!loaded) return null;
  }

  let detection = await faceapi
    .detectSingleFace(image, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.35 }))
    .withFaceLandmarks()
    .withFaceDescriptor();
  
  if (!detection) {
    detection = await faceapi
      .detectSingleFace(image, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.25 }))
      .withFaceLandmarks()
      .withFaceDescriptor();
  }
  
  if (!detection) {
    const allDetections = await faceapi
      .detectAllFaces(image, new faceapi.TinyFaceDetectorOptions({ inputSize: 512, scoreThreshold: 0.2 }))
      .withFaceLandmarks()
      .withFaceDescriptors();
    
    if (allDetections && allDetections.length > 0) {
      detection = allDetections[0];
    }
  }

  return detection?.descriptor || null;
}

export async function processImageFile(file: File): Promise<Float32Array | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = async () => {
      try {
        if (!modelsLoaded) {
          const loaded = await loadModels();
          if (!loaded) { resolve(null); return; }
        }
        
        let detections = await faceapi
          .detectAllFaces(img, new faceapi.TinyFaceDetectorOptions({ inputSize: 512, scoreThreshold: 0.4 }))
          .withFaceLandmarks()
          .withFaceDescriptors();
        
        if (detections && detections.length > 0) {
          const box = detections[0].detection.box;
          const minFaceSize = Math.min(box.width, box.height);
          if (minFaceSize < 50) {
            console.warn('[FaceService] Face detected but too small:', minFaceSize);
          }
          resolve(detections[0].descriptor);
        } else {
          const fallbackDetections = await faceapi
            .detectAllFaces(img, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.3 }))
            .withFaceLandmarks()
            .withFaceDescriptors();
          
          if (fallbackDetections && fallbackDetections.length > 0) {
            resolve(fallbackDetections[0].descriptor);
          } else {
            resolve(null);
          }
        }
      } catch (error) {
        console.error('[FaceService] Error processing image:', error);
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = URL.createObjectURL(file);
  });
}

export async function saveFaceEmbeddingLocal(
  studentId: string,
  descriptor: Float32Array
): Promise<void> {
  const embeddingStr = descriptorToString(descriptor);
  console.log('[FaceService] Saving face for student:', studentId);
  
  localStorage.setItem(`face_embedding_${studentId}`, embeddingStr);
  
  try {
    const db = await initDB();
    const student = await db.get('students', studentId);
    
    if (student) {
      await db.put('students', { ...student, face_embedding: embeddingStr });
      console.log('[FaceService] Updated IndexedDB student:', studentId);
    } else {
      const allStudents = await db.getAll('students');
      const matchingStudent = allStudents.find(s => s.id === studentId);
      if (matchingStudent) {
        await db.put('students', { ...matchingStudent, face_embedding: embeddingStr });
        console.log('[FaceService] Updated student (found by matching):', studentId);
      } else {
        console.warn('[FaceService] Student not found:', studentId);
      }
    }
  } catch (err) {
    console.error('[FaceService] Failed to save to IndexedDB:', err);
  }
}

export async function saveFaceEmbeddingToSupabase(
  studentId: string,
  descriptor: Float32Array
): Promise<boolean> {
  try {
    const client = getSupabaseClient();
    const embeddingStr = descriptorToString(descriptor);

    const { error } = await client
      .from('students')
      .update({ 
        face_embedding: embeddingStr,
        face_vector: embeddingStr 
      })
      .eq('id', studentId);
    
    if (error) {
      console.error('[FaceService] Supabase save error:', error);
      return false;
    }
    return true;
  } catch (error) {
    console.error('[FaceService] Save to Supabase error:', error);
    return false;
  }
}

export async function enrollFace(
  descriptor: Float32Array | null,
  studentId: string
): Promise<{ success: boolean; message: string }> {
  try {
    if (!descriptor) {
      return { success: false, message: 'Wajah tidak terdeteksi. Pastikan wajah terlihat jelas di kamera.' };
    }

    await saveFaceEmbeddingLocal(studentId, descriptor);
    console.log('[FaceService] Saved to local storage');
    
    const savedToCloud = await saveFaceEmbeddingToSupabase(studentId, descriptor);
    
    if (savedToCloud) {
      return { success: true, message: 'Wajah berhasil terdaftar!' };
    } else {
      return { success: true, message: 'Wajah berhasil disimpan (mode offline)' };
    }
  } catch (error) {
    console.error('[FaceService] Enroll error:', error);
    return { success: false, message: 'Gagal mendaftarkan wajah. Coba lagi.' };
  }
}

export async function deleteFaceEmbedding(
  studentId: string,
  deleteFromCloud = true
): Promise<{ success: boolean; message: string }> {
  console.log('[FaceService] Deleting face for student:', studentId);
  
  try {
    // Delete from localStorage
    localStorage.removeItem(`face_embedding_${studentId}`);
    console.log('[FaceService] Removed from localStorage');
    
    // Delete from IndexedDB
    const db = await initDB();
    const tx = db.transaction('students', 'readwrite');
    const store = tx.objectStore('students');
    const student = await store.get(studentId);
    
    if (student) {
      await store.put({ ...student, face_embedding: null });
      console.log('[FaceService] Removed from IndexedDB:', studentId);
    } else {
      console.log('[FaceService] Student not found in IndexedDB:', studentId);
    }
    await tx.done;
    
    // Clear state cache to force refresh
    clearStateCache();
    console.log('[FaceService] State cache cleared');
    
    // Delete from Cloud
    if (deleteFromCloud) {
      try {
        const supabase = getSupabaseClientOrNull();
        if (supabase) {
          const { error } = await supabase
            .from('students')
            .update({ face_embedding: null, face_vector: null })
            .eq('id', studentId);
          
          if (error) {
            console.error('[FaceService] Cloud delete error:', error);
          } else {
            console.log('[FaceService] Removed from Cloud Supabase');
          }
        } else {
          console.log('[FaceService] Supabase not configured, skipping cloud delete');
        }
      } catch (e) {
        console.warn('[FaceService] Cloud delete error:', e);
      }
    }
    
    return { success: true, message: 'Data wajah berhasil dihapus' };
  } catch (error) {
    console.error('[FaceService] Delete error:', error);
    return { success: false, message: 'Gagal menghapus data wajah' };
  }
}

function hasFaceEmbeddingLocal(studentId: string): boolean {
  return localStorage.getItem(`face_embedding_${studentId}`) !== null;
}

export async function findBestMatchFromLocal(
  descriptor: Float32Array,
  classId?: string
): Promise<MatchResult> {
  try {
    const db = await initDB();
    let students = await db.getAll('students');
    
    if (classId) {
      students = students.filter(s => s.classId === classId);
    }
    
    const studentsWithFace = students.filter(s => 
      s.face_embedding && typeof s.face_embedding === 'string'
    );
    
    if (studentsWithFace.length === 0) {
      return { success: false, message: 'Tidak ada data wajah tersimpan' };
    }
    
    let bestMatch: { studentId: string; studentName: string; distance: number } | null = null;
    
    for (const student of studentsWithFace) {
      if (!student.face_embedding) continue;
      
      try {
        const storedDescriptor = stringToDescriptor(student.face_embedding);
        
        if (storedDescriptor.length !== descriptor.length) {
          continue;
        }
        
        const distance = euclideanDistance(descriptor, storedDescriptor);
        
        if (!bestMatch || distance < bestMatch.distance) {
          bestMatch = {
            studentId: student.id,
            studentName: student.name,
            distance,
          };
        }
      } catch (e) {
        console.warn('[FaceService] Invalid descriptor for student:', student.id);
      }
    }
    
    if (!bestMatch) {
      return { success: false, message: 'Wajah tidak dikenal' };
    }
    
    const confidence = 1 - bestMatch.distance;
    
    if (bestMatch.distance <= MATCH_THRESHOLD_HIGH) {
      return {
        success: true,
        studentId: bestMatch.studentId,
        studentName: bestMatch.studentName,
        confidence,
        message: 'Hadir',
      };
    } else if (bestMatch.distance <= MATCH_THRESHOLD_MEDIUM) {
      return {
        success: false,
        confidence,
        message: 'Dekatkan wajah atau cari cahaya lebih terang',
      };
    } else {
      return {
        success: false,
        confidence,
        message: 'Wajah tidak dikenal',
      };
    }
  } catch (error) {
    console.error('[FaceService] Match error:', error);
    return { success: false, message: 'Terjadi kesalahan' };
  }
}

async function fetchAllFaceEmbeddingsFromSupabase(): Promise<
  Array<{ studentId: string; descriptor: Float32Array; studentName: string }>
> {
  try {
    const client = getSupabaseClientOrNull();
    if (!client) return [];
    
    const { data, error } = await client
      .from('students')
      .select('id, name, face_embedding')
      .not('face_embedding', 'is', null);

    if (error || !data) return [];

    return data
      .filter((s) => s?.id && s?.face_embedding && typeof s.face_embedding === 'string')
      .map((s) => {
        try {
          return {
            studentId: s.id,
            studentName: s.name || s.id,
            descriptor: stringToDescriptor(s.face_embedding),
          };
        } catch (e) {
          return null;
        }
      })
      .filter((entry): entry is { studentId: string; descriptor: Float32Array; studentName: string } => entry !== null);
  } catch (error) {
    console.warn('[FaceService] Fetch from Supabase error:', error);
    return [];
  }
}

async function fetchAllFaceEmbeddingsFromJSON(): Promise<
  Array<{ studentId: string; descriptor: Float32Array; studentName: string }>
> {
  try {
    const response = await fetch(FACE_DATA_URL);
    if (!response.ok) return [];
    
    const data: FaceEmbeddingEntry[] = await response.json();
    if (!Array.isArray(data)) return [];
    
    return data
      .filter((entry) => entry?.id && entry?.face_embedding)
      .map((entry) => {
        try {
          return {
            studentId: entry.id,
            studentName: entry.name || entry.id,
            descriptor: stringToDescriptor(entry.face_embedding),
          };
        } catch (e) {
          return null;
        }
      })
      .filter((entry): entry is { studentId: string; descriptor: Float32Array; studentName: string } => entry !== null);
  } catch (error) {
    return [];
  }
}

export async function findBestMatchCombined(
  descriptor: Float32Array,
  classId?: string
): Promise<MatchResult> {
  const localResult = await findBestMatchFromLocal(descriptor, classId);
  
  if (localResult.success) {
    return localResult;
  }
  
  if (localResult.message === 'Tidak ada data wajah tersimpan') {
    return { 
      success: false, 
      message: 'Belum ada siswa yang terdaftar untuk absensi wajah. Silakan daftar dulu.' 
    };
  }
  
  return localResult;
}

export async function saveFaceEmbeddingToJSON(
  studentId: string,
  studentName: string,
  descriptor: Float32Array
): Promise<boolean> {
  try {
    const response = await fetch(FACE_DATA_URL);
    let data: FaceEmbeddingEntry[] = [];
    
    if (response.ok) {
      data = await response.json();
    }
    
    const existingIndex = data.findIndex(e => e.id === studentId);
    const embeddingStr = descriptorToString(descriptor);
    
    if (existingIndex >= 0) {
      data[existingIndex] = { id: studentId, name: studentName, face_embedding: embeddingStr };
    } else {
      data.push({ id: studentId, name: studentName, face_embedding: embeddingStr });
    }
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'face-embeddings.json';
    link.click();
    URL.revokeObjectURL(url);
    
    return true;
  } catch (error) {
    console.error('[FaceService] Save to JSON error:', error);
    return false;
  }
}

export function createLabeledDescriptors(
  embeddings: Array<{ studentId: string; descriptor: Float32Array; studentName: string }>
): faceapi.LabeledFaceDescriptors[] {
  return embeddings.map(
    (e) => new faceapi.LabeledFaceDescriptors(e.studentName || e.studentId, [e.descriptor])
  );
}

export async function createFaceMatcher(): Promise<faceapi.FaceMatcher | null> {
  const embeddings = await fetchAllFaceEmbeddingsFromSupabase();
  
  if (embeddings.length === 0) {
    return null;
  }

  const labeledDescriptors = createLabeledDescriptors(embeddings);
  return new faceapi.FaceMatcher(labeledDescriptors, 0.6);
}
