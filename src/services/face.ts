import * as faceapi from 'face-api.js';
import { supabase } from '../supabaseClient';
import { Siswa } from '../types';
import {
  saveFaceDescriptorLocal,
  getAllFaceDescriptorsLocal,
  deleteFaceDescriptorLocal,
  StoredFaceDescriptor
} from './faceDb';

const MODEL_URL = '/models';

let modelsLoaded = false;
let modelLoadingPromise: Promise<boolean> | null = null;

// In-memory cache of face descriptors (Float32Array keyed by siswaId).
// Built ONCE from IndexedDB and reused across detection frames so we never
// re-read/re-parse the whole descriptor store on every frame (big CPU/GC win).
let descriptorCache: Map<string, Float32Array> | null = null;

/**
 * Load (once) all face descriptors from IndexedDB into an in-memory Map.
 * Returns the cached Map on subsequent calls (no I/O after first load).
 */
export async function loadDescriptorCache(): Promise<Map<string, Float32Array>> {
  if (descriptorCache) return descriptorCache;
  const local = await getAllFaceDescriptorsLocal();
  const map = new Map<string, Float32Array>();
  for (const entry of local) {
    const desc = stringToDescriptor(entry.descriptor);
    if (desc) map.set(entry.siswaId, desc);
  }
  descriptorCache = map;
  return map;
}

/**
 * Drop the in-memory cache so it is rebuilt from IndexedDB on next use.
 * Call after any bulk write (enroll / re-extract / sync) to stay consistent.
 */
export function invalidateDescriptorCache(): void {
  descriptorCache = null;
}

export const MATCH_THRESHOLD = 0.40; // Very strict — prevents false positives. Lower = stricter.
export const MATCH_MARGIN = 0.08;    // Required gap between best and second-best candidate to confirm identity

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
 * Load face-api models from /models static directory with multiple path fallbacks
 */
export async function loadModels(): Promise<boolean> {
  if (modelsLoaded) return true;
  if (modelLoadingPromise) return modelLoadingPromise;

  modelLoadingPromise = (async () => {
    const candidatePaths = [
      '/models',
      `${window.location.origin}/models`,
      'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights',
      'https://cdn.jsdelivr.net/gh/cddh/face-api.js@master/weights'
    ];

    for (const path of candidatePaths) {
      try {
        console.log('[FaceService] Trying to load models from:', path);
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(path),
          faceapi.nets.faceLandmark68Net.loadFromUri(path),
          faceapi.nets.faceRecognitionNet.loadFromUri(path),
        ]);
        modelsLoaded = true;
        console.log('[FaceService] Successfully loaded face-api models from:', path);
        return true;
      } catch (err) {
        console.warn(`[FaceService] Failed to load models from ${path}, trying next fallback...`, err);
      }
    }

    console.error('[FaceService] All model loading fallbacks failed.');
    modelsLoaded = false;
    return false;
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
      .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.35 }))
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
 * Multi-stage pipeline: detectAllFaces (Tiny) -> detectAllFaces (SSD) -> multi-resolution (224/320/512)
 */
export async function extractFaceDescriptorFromImage(
  image: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement
): Promise<Float32Array | null> {
  if (!modelsLoaded) {
    const loaded = await loadModels();
    if (!loaded) return null;
  }

  try {
    // Stage 1: Try TinyFaceDetector with detectAllFaces (takes largest face box)
    let detections = await faceapi
      .detectAllFaces(image, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.1 }))
      .withFaceLandmarks()
      .withFaceDescriptors();

    if (detections && detections.length > 0) {
      detections.sort((a, b) => (b.detection.box.width * b.detection.box.height) - (a.detection.box.width * a.detection.box.height));
      return detections[0].descriptor;
    }

    // Stage 2: Fallback to high-precision SsdMobilenetv1
    try {
      await faceapi.nets.ssdMobilenetv1.loadFromUri('/models');
      detections = await faceapi
        .detectAllFaces(image, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.1 }))
        .withFaceLandmarks()
        .withFaceDescriptors();

      if (detections && detections.length > 0) {
        detections.sort((a, b) => (b.detection.box.width * b.detection.box.height) - (a.detection.box.width * a.detection.box.height));
        return detections[0].descriptor;
      }
    } catch (e) {
      // SsdMobilenetv1 optional load
    }

    // Stage 3: Multi-resolution fallback (224, 320, 512, 608)
    for (const size of [224, 320, 512, 608]) {
      try {
        const single = await faceapi
          .detectSingleFace(image, new faceapi.TinyFaceDetectorOptions({ inputSize: size, scoreThreshold: 0.05 }))
          .withFaceLandmarks()
          .withFaceDescriptor();

        if (single?.descriptor) return single.descriptor;
      } catch (e) {}
    }

    return null;
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

  // 1b. Keep in-memory cache fresh (no reload needed mid-session)
  if (descriptorCache) {
    descriptorCache.set(siswaId, new Float32Array(descriptor));
  }

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

  // 1. Use the in-memory descriptor cache (built once from IndexedDB) — no I/O per frame
  const cache = await loadDescriptorCache();

  let minDistance = 999;
  let secondDistance = 999;
  let bestMatchSiswa: Siswa | undefined = undefined;

  for (const s of siswaList) {
    let targetDescriptor = cache.get(s.id);

    if (!targetDescriptor && s.face_embedding) {
      targetDescriptor = stringToDescriptor(s.face_embedding) || undefined;
      if (targetDescriptor) {
        // Cache to memory + IndexedDB
        cache.set(s.id, targetDescriptor);
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
        secondDistance = minDistance;
        minDistance = dist;
        bestMatchSiswa = s;
      } else if (dist < secondDistance) {
        secondDistance = dist;
      }
    }
  }

  // Must pass: (1) below threshold, (2) clear margin gap from second-best candidate
  const marginOk = (secondDistance - minDistance) >= MATCH_MARGIN;
  if (bestMatchSiswa && minDistance < MATCH_THRESHOLD && marginOk) {
    const confidence = Math.max(0, Math.min(1, 1 - (minDistance / 0.7)));
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
    message: minDistance < MATCH_THRESHOLD ? 'Wajah terlalu mirip dua murid, tidak bisa dikonfirmasi' : 'Wajah tidak dikenali',
  };
}

/**
 * Auto-sync face embeddings from Supabase payload into local IndexedDB
 */
export async function syncFaceEmbeddingsFromSupabase(siswaList: Siswa[]): Promise<number> {
  let synced = 0;
  for (const s of siswaList) {
    if (s.face_embedding && s.face_embedding.trim() !== '') {
      await saveFaceDescriptorLocal({
        siswaId: s.id,
        name: s.nama,
        kelas: s.kelas,
        nis: s.nis,
        descriptor: s.face_embedding,
        updatedAt: Date.now(),
      });
      synced++;
    }
  }
  // Rebuild in-memory cache from the (now up-to-date) IndexedDB store
  invalidateDescriptorCache();
  await loadDescriptorCache();
  return synced;
}

/**
 * Smart Batch generate face embeddings:
 * Only processes students who don't have a valid face_embedding in Supabase database yet!
 * If local IndexedDB already has the descriptor, pushes it to Supabase instantly.
 */
export async function batchGenerateEmbeddingsFromPhotos(
  siswaList: Siswa[],
  onProgress?: (processed: number, total: number, currentName: string) => void,
  forceRebuild: boolean = false
): Promise<{ successCount: number; failedCount: number; skippedCount: number; totalEligible: number }> {
  await loadModels();

  const eligibleSiswa = siswaList.filter((s) => s.foto_url && s.foto_url.trim() !== '');

  // 1. Map of local descriptors from IndexedDB
  const localDescriptors = await getAllFaceDescriptorsLocal();
  const localMap = new Map<string, StoredFaceDescriptor>();
  for (const entry of localDescriptors) {
    if (entry.descriptor && entry.descriptor.trim() !== '') {
      localMap.set(entry.siswaId, entry);
    }
  }

  // 2. Identify students missing face_embedding in Supabase DB
  const targetSiswa = forceRebuild
    ? eligibleSiswa
    : eligibleSiswa.filter((s) => !s.face_embedding || s.face_embedding.trim() === '');

  const skippedCount = eligibleSiswa.length - targetSiswa.length;

  if (targetSiswa.length === 0) {
    return {
      successCount: 0,
      failedCount: 0,
      skippedCount,
      totalEligible: eligibleSiswa.length
    };
  }

  let successCount = 0;
  let failedCount = 0;

  for (let i = 0; i < targetSiswa.length; i++) {
    const siswa = targetSiswa[i];
    if (onProgress) {
      onProgress(i + 1, targetSiswa.length, siswa.nama);
    }

    try {
      // Check if IndexedDB already has it, sync to Supabase directly
      const cached = localMap.get(siswa.id);
      if (cached && cached.descriptor) {
        const desc = stringToDescriptor(cached.descriptor);
        if (desc) {
          await saveFaceEmbedding(siswa.id, desc, {
            nama: siswa.nama,
            kelas: siswa.kelas,
            nis: siswa.nis,
          });
          successCount++;
          continue;
        }
      }

      // Otherwise extract from photo
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

  return {
    successCount,
    failedCount,
    skippedCount,
    totalEligible: eligibleSiswa.length
  };
}

/**
 * Clear stale face embedding for one student (Supabase + IndexedDB)
 * then re-extract from their current foto_url.
 * Use this when a student's photo is updated.
 */
export async function clearAndReExtractOneSiswa(
  siswa: Siswa
): Promise<'success' | 'no_face' | 'no_photo' | 'error'> {
  if (!siswa.foto_url || siswa.foto_url.trim() === '') return 'no_photo';

  try {
    // 1. Delete from local IndexedDB cache
    await deleteFaceDescriptorLocal(siswa.id);
    if (descriptorCache) descriptorCache.delete(siswa.id);

    // 2. Clear Supabase face_embedding column
    const { error } = await supabase
      .from('siswa')
      .update({ face_embedding: null })
      .eq('id', siswa.id);
    if (error) console.warn('[FaceService] Supabase clear warning:', error.message);

    // 3. Load models & re-extract from current photo URL
    await loadModels();
    const img = await loadImageFromUrl(siswa.foto_url);
    const descriptor = await extractFaceDescriptorFromImage(img);

    if (!descriptor) return 'no_face';

    // 4. Save new embedding to Supabase + IndexedDB
    await saveFaceEmbedding(siswa.id, descriptor, {
      nama: siswa.nama,
      kelas: siswa.kelas,
      nis: siswa.nis,
    });

    return 'success';
  } catch (err) {
    console.error('[FaceService] clearAndReExtractOneSiswa error:', err);
    return 'error';
  }
}
