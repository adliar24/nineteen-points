import * as faceapi from '@vladmandic/face-api';
import { supabase } from '../supabaseClient';
import { Siswa } from '../types';
import {
  saveFaceDescriptorLocal,
  getAllFaceDescriptorsLocal,
  StoredFaceDescriptor
} from './faceDb';

const MODEL_URL = '/models';

let modelsLoaded = false;
let modelLoadingPromise: Promise<boolean> | null = null;

export const MATCH_THRESHOLD = 0.55; // Lower = stricter match, higher = more lenient

export interface FaceDetectionResult {
  boundingBox: { x: number; y: number; width: number; height: number };
  descriptor: Float32Array;
}

export interface MatchResult {
  success: boolean;
  siswa?: Siswa;
  confidence: number; // 0 to 1
  distance: number;
  message: string;
}

/**
 * Load face-api models from /models static directory
 */
export async function loadModels(): Promise<boolean> {
  if (modelsLoaded) return true;
  if (modelLoadingPromise) return modelLoadingPromise;

  modelLoadingPromise = (async () => {
    try {
      console.log('[FaceService] Loading models from:', MODEL_URL);
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
      ]);
      modelsLoaded = true;
      console.log('[FaceService] All face-api models loaded successfully');
      return true;
    } catch (err) {
      console.error('[FaceService] Error loading models:', err);
      modelsLoaded = false;
      return false;
    } finally {
      modelLoadingPromise = null;
    }
  })();

  return modelLoadingPromise;
}

export function isModelLoaded(): boolean {
  return modelsLoaded;
}

export function descriptorToString(descriptor: Float32Array): string {
  return Array.from(descriptor).join(',');
}

export function stringToDescriptor(str: string): Float32Array | null {
  if (!str) return null;
  const parts = str.split(',').map(Number);
  if (parts.length < 128 || parts.some(isNaN)) return null;
  return new Float32Array(parts);
}

export function euclideanDistance(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

/**
 * Detect face from HTMLVideoElement and return face descriptor & bounding box
 */
export async function detectFaceFromVideo(
  video: HTMLVideoElement
): Promise<FaceDetectionResult | null> {
  if (!modelsLoaded) {
    const loaded = await loadModels();
    if (!loaded) return null;
  }

  try {
    const detection = await faceapi
      .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.35 }))
      .withFaceLandmarks()
      .withFaceDescriptor();

    if (!detection) return null;

    const box = detection.detection.box;
    return {
      boundingBox: { x: box.x, y: box.y, width: box.width, height: box.height },
      descriptor: detection.descriptor,
    };
  } catch (err) {
    console.error('[FaceService] Video detection error:', err);
    return null;
  }
}

/**
 * Extract face descriptor from an HTMLImageElement, Canvas, or HTMLVideoElement
 */
export async function extractFaceDescriptorFromImage(
  image: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement
): Promise<Float32Array | null> {
  if (!modelsLoaded) {
    const loaded = await loadModels();
    if (!loaded) return null;
  }

  try {
    const detection = await faceapi
      .detectSingleFace(image, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.3 }))
      .withFaceLandmarks()
      .withFaceDescriptor();

    return detection?.descriptor || null;
  } catch (err) {
    console.error('[FaceService] Image extraction error:', err);
    return null;
  }
}

/**
 * Load image from URL with CORS crossOrigin support
 */
export function loadImageFromUrl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
    img.src = url;
  });
}

/**
 * Save face embedding to Supabase & IndexedDB
 */
export async function saveFaceEmbedding(
  siswaId: string,
  descriptor: Float32Array,
  siswaInfo: { nama: string; kelas?: string; nis?: string }
): Promise<boolean> {
  const descriptorStr = descriptorToString(descriptor);

  // 1. Save to local IndexedDB for fast instant matching
  await saveFaceDescriptorLocal({
    siswaId,
    name: siswaInfo.nama,
    kelas: siswaInfo.kelas,
    nis: siswaInfo.nis,
    descriptor: descriptorStr,
    updatedAt: Date.now(),
  });

  // 2. Save to Supabase DB column
  try {
    const { error } = await supabase
      .from('siswa')
      .update({ face_embedding: descriptorStr })
      .eq('id', siswaId);

    if (error) {
      console.warn('[FaceService] Supabase update warning (column might be missing):', error.message);
    }
    return true;
  } catch (err) {
    console.error('[FaceService] Supabase save error:', err);
    return false;
  }
}

/**
 * Find best matching student from detected descriptor against student list
 */
export async function findBestMatch(
  detectedDescriptor: Float32Array,
  siswaList: Siswa[]
): Promise<MatchResult> {
  if (siswaList.length === 0) {
    return { success: false, confidence: 0, distance: 1, message: 'Daftar siswa kosong' };
  }

  // 1. Fetch local descriptors from IndexedDB for maximum speed
  const localDescriptors = await getAllFaceDescriptorsLocal();
  const localMap = new Map<string, Float32Array>();
  for (const entry of localDescriptors) {
    const desc = stringToDescriptor(entry.descriptor);
    if (desc) localMap.set(entry.siswaId, desc);
  }

  let minDistance = 999;
  let bestMatchSiswa: Siswa | undefined = undefined;

  for (const s of siswaList) {
    let targetDescriptor = localMap.get(s.id);

    if (!targetDescriptor && s.face_embedding) {
      targetDescriptor = stringToDescriptor(s.face_embedding) || undefined;
      if (targetDescriptor) {
        // Cache to local IndexedDB
        saveFaceDescriptorLocal({
          siswaId: s.id,
          name: s.nama,
          kelas: s.kelas,
          nis: s.nis,
          descriptor: s.face_embedding,
          updatedAt: Date.now(),
        });
      }
    }

    if (targetDescriptor) {
      const dist = euclideanDistance(detectedDescriptor, targetDescriptor);
      if (dist < minDistance) {
        minDistance = dist;
        bestMatchSiswa = s;
      }
    }
  }

  if (bestMatchSiswa && minDistance < MATCH_THRESHOLD) {
    const confidence = Math.max(0, Math.min(1, 1 - (minDistance / 0.8)));
    return {
      success: true,
      siswa: bestMatchSiswa,
      confidence,
      distance: minDistance,
      message: `Wajah terdeteksi: ${bestMatchSiswa.nama} (${bestMatchSiswa.kelas})`,
    };
  }

  return {
    success: false,
    confidence: 0,
    distance: minDistance,
    message: minDistance < 0.8 ? 'Wajah mirip tetapi belum cukup yakin' : 'Wajah tidak dikenali',
  };
}

/**
 * Batch generate face embeddings for all students who have foto_url
 */
export async function batchGenerateEmbeddingsFromPhotos(
  siswaList: Siswa[],
  onProgress?: (processed: number, total: number, currentName: string) => void
): Promise<{ successCount: number; failedCount: number }> {
  await loadModels();

  const eligibleSiswa = siswaList.filter((s) => s.foto_url && s.foto_url.trim() !== '');
  let successCount = 0;
  let failedCount = 0;

  for (let i = 0; i < eligibleSiswa.length; i++) {
    const siswa = eligibleSiswa[i];
    if (onProgress) {
      onProgress(i + 1, eligibleSiswa.length, siswa.nama);
    }

    try {
      const img = await loadImageFromUrl(siswa.foto_url!);
      const descriptor = await extractFaceDescriptorFromImage(img);

      if (descriptor) {
        await saveFaceEmbedding(siswa.id, descriptor, {
          nama: siswa.nama,
          kelas: siswa.kelas,
          nis: siswa.nis,
        });
        successCount++;
      } else {
        failedCount++;
        console.warn(`[FaceService] Wajah tidak terdeteksi di pas foto siswa: ${siswa.nama}`);
      }
    } catch (err) {
      failedCount++;
      console.error(`[FaceService] Gagal memuat foto siswa ${siswa.nama}:`, err);
    }
  }

  return { successCount, failedCount };
}
