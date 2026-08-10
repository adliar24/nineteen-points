import React, { useRef, useEffect, useCallback, forwardRef, useImperativeHandle, useState } from 'react';
import * as faceapi from 'face-api.js';
import { Camera, ArrowRightLeft, Loader2 } from 'lucide-react';

interface FaceCameraProps {
  width?: number;
  height?: number;
  onFaceDetected?: (descriptor: Float32Array | null, landmarks?: faceapi.FaceLandmarks68) => void;
  onError?: (error: string) => void;
  showOverlay?: boolean;
  mirror?: boolean;
  autoStart?: boolean;
  deviceId?: string;
  onCamerasLoaded?: (cameras: MediaDeviceInfo[]) => void;
  onCameraSwitch?: () => void;
}

export interface FaceCameraRef {
  getVideoElement: () => HTMLVideoElement | null;
  startCamera: (deviceId?: string) => Promise<MediaStream | null>;
  stopCamera: () => void;
  captureFrame: () => ImageData | null;
  getDescriptor: () => Promise<Float32Array | null>;
}

const FaceCamera = forwardRef<FaceCameraRef, FaceCameraProps>(({
  width = 640,
  height = 480,
  onFaceDetected,
  onError,
  showOverlay = true,
  mirror = true,
  autoStart = true,
  deviceId: externalDeviceId,
  onCamerasLoaded,
  onCameraSwitch,
}, ref) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationRef = useRef<number | null>(null);
  const isDetectingRef = useRef(false);
  const isStartingRef = useRef(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [currentCameraIndex, setCurrentCameraIndex] = useState(0);
  const [isSwitchingCamera, setIsSwitchingCamera] = useState(false);
  const [activeDeviceId, setActiveDeviceId] = useState<string | undefined>(undefined);

  const loadCameras = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(d => d.kind === 'videoinput');
      setCameras(videoDevices);
      onCamerasLoaded?.(videoDevices);
      return videoDevices;
    } catch (e) {
      console.warn('Could not enumerate devices:', e);
      return [];
    }
  }, [onCamerasLoaded]);

  const switchCamera = useCallback(async () => {
    if (cameras.length < 2 || isSwitchingCamera) return;
    
    setIsSwitchingCamera(true);
    
    try {
      const nextIndex = (currentCameraIndex + 1) % cameras.length;
      setCurrentCameraIndex(nextIndex);
      const nextDeviceId = cameras[nextIndex].deviceId;
      setActiveDeviceId(nextDeviceId);
      await startCameraInternal(nextDeviceId);
      onCameraSwitch?.();
    } catch (error) {
      console.error('Error switching camera:', error);
    } finally {
      setIsSwitchingCamera(false);
    }
  }, [cameras, currentCameraIndex, isSwitchingCamera, onCameraSwitch]);

  const startCameraInternal = useCallback(async (forceDeviceId?: string) => {
    if (isStartingRef.current && !forceDeviceId) return streamRef.current;
    isStartingRef.current = true;
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    try {
      setCameraError(null);
      
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        const errorMsg = 'Browser tidak mendukung akses kamera';
        setCameraError(errorMsg);
        onError?.(errorMsg);
        return null;
      }

      const videoConstraints = forceDeviceId
        ? {
            width: { ideal: width, min: 320 },
            height: { ideal: height, min: 240 },
            deviceId: { exact: forceDeviceId },
            frameRate: { ideal: 30 },
          }
        : {
            width: { ideal: width, min: 320 },
            height: { ideal: height, min: 240 },
            facingMode: 'user',
            frameRate: { ideal: 30 },
          };

      const attempts: Array<MediaStreamConstraints> = [
        { video: videoConstraints, audio: false },
        forceDeviceId
          ? { video: { deviceId: { exact: forceDeviceId } } as MediaTrackConstraints, audio: false }
          : { video: { facingMode: 'user' }, audio: false },
        { video: true, audio: false },
      ];

      let stream: MediaStream | null = null;
      for (const constraints of attempts) {
        try {
          stream = await navigator.mediaDevices.getUserMedia(constraints);
          break;
        } catch (e: any) {
          if (e.name === 'OverconstrainedError') continue;
          continue;
        }
      }

      if (!stream) {
        throw new Error('Gagal mengakses kamera');
      }

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
        streamRef.current = stream;
        setIsLoading(false);
      }
      return stream;
    } catch (error: any) {
      console.error('Error accessing camera:', error);
      let errorMsg = 'Gagal mengakses kamera';
      
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        errorMsg = 'Izin kamera ditolak. Silakan klik icon kamera di address bar browser dan izinkan akses.';
      } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        errorMsg = 'Kamera tidak ditemukan. Pastikan perangkat memiliki kamera.';
      } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
        errorMsg = 'Kamera sedang digunakan oleh aplikasi lain. Tutup aplikasi lain yang menggunakan kamera.';
      } else if (error.name === 'PermissionDismissedError') {
        errorMsg = 'Izin kamera dibatalkan. Klik tombol coba lagi untuk meminta izin ulang.';
      }
      
      setCameraError(errorMsg);
      onError?.(errorMsg);
      return null;
    } finally {
      isStartingRef.current = false;
    }
  }, [width, height, onError]);

  useImperativeHandle(ref, () => ({
    getVideoElement: () => videoRef.current,
    startCamera: async (deviceId?: string) => {
      return startCameraInternal(deviceId);
    },
    stopCamera: () => {
      stopCamera();
    },
    captureFrame: () => {
      return captureFrame();
    },
    getDescriptor: async () => {
      return getDescriptor();
    },
  }));

  const startCamera = useCallback(async () => {
    if (isStartingRef.current) return streamRef.current;
    isStartingRef.current = true;
    
    try {
      setCameraError(null);
      
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        const errorMsg = 'Browser tidak mendukung akses kamera';
        setCameraError(errorMsg);
        onError?.(errorMsg);
        return null;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: width, min: 320 },
          height: { ideal: height, min: 240 },
          facingMode: 'user',
          frameRate: { ideal: 30 },
        },
        audio: false,
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
        streamRef.current = stream;
        setIsLoading(false);
      }
      return stream;
    } catch (error: any) {
      console.error('Error accessing camera:', error);
      let errorMsg = 'Gagal mengakses kamera';
      
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        errorMsg = 'Izin kamera ditolak. Silakan klik icon kamera di address bar browser dan izinkan akses.';
      } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        errorMsg = 'Kamera tidak ditemukan. Pastikan perangkat memiliki kamera.';
      } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
        errorMsg = 'Kamera sedang digunakan oleh aplikasi lain. Tutup aplikasi lain yang menggunakan kamera.';
      } else if (error.name === 'PermissionDismissedError') {
        errorMsg = 'Izin kamera dibatalkan. Klik tombol coba lagi untuk meminta izin ulang.';
      }
      
      setCameraError(errorMsg);
      onError?.(errorMsg);
      return null;
    } finally {
      isStartingRef.current = false;
    }
  }, [width, height, onError]);

  const stopCamera = useCallback(() => {
    isStartingRef.current = false;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const captureFrame = useCallback((): ImageData | null => {
    if (!videoRef.current || !canvasRef.current) return null;
    
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return null;
    
    canvasRef.current.width = videoRef.current.videoWidth;
    canvasRef.current.height = videoRef.current.videoHeight;
    ctx.drawImage(videoRef.current, 0, 0);
    
    return ctx.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height);
  }, []);

  const getDescriptor = useCallback(async (): Promise<Float32Array | null> => {
    if (!videoRef.current) return null;
    
      const detection = await faceapi
        .detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks()
        .withFaceDescriptor();
    
    return detection?.descriptor || null;
  }, []);

  useEffect(() => {
    if (autoStart) {
      loadCameras().then(() => {
        startCameraInternal(externalDeviceId);
      });
    }

    return () => {
      stopCamera();
    };
  }, [autoStart, externalDeviceId]);

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !showOverlay) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let lastDetectionTime = 0;
    const DETECTION_INTERVAL = 200; // Only detect every 200ms to reduce lag

    const detect = async () => {
      const now = Date.now();
      
      if (!video.videoWidth || isDetectingRef.current || (now - lastDetectionTime) < DETECTION_INTERVAL) {
        animationRef.current = requestAnimationFrame(detect);
        return;
      }

      isDetectingRef.current = true;
      lastDetectionTime = now;

      try {
        // First detect faces, then get descriptors separately
        const detections = await faceapi
          .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions())
          .withFaceLandmarks()
          .withFaceDescriptors();

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (detections && detections.length > 0) {
          const detection = detections[0];
          const { x, y, width: w, height: h } = detection.detection.box;
          
          // Simple green box
          ctx.strokeStyle = '#10B981';
          ctx.lineWidth = 3;
          ctx.strokeRect(x, y, w, h);

          onFaceDetected?.(detection.descriptor);
        } else {
          onFaceDetected?.(null);
        }
      } catch (error) {
        console.warn('Detection error:', error);
        onFaceDetected?.(null);
      }

      isDetectingRef.current = false;
      animationRef.current = requestAnimationFrame(detect);
    };

    video.addEventListener('loadedmetadata', () => {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      detect();
    });

    if (video.videoWidth) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      detect();
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [showOverlay, onFaceDetected]);

  return (
    <div className="relative inline-block">
      {cameraError ? (
        <div 
          className="flex flex-col items-center justify-center bg-gray-100 rounded-lg"
          style={{ width, height }}
        >
          <Camera className="w-12 h-12 text-gray-400 mb-2" />
          <p className="text-sm text-red-500 text-center px-4">{cameraError}</p>
        </div>
      ) : (
        <>
          <div className="relative" style={{ width, height }}>
            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-900 rounded-lg z-10">
                <div className="text-center text-white">
                  <div className="w-10 h-10 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                  <p className="text-sm">Menyiapkan kamera...</p>
                </div>
              </div>
            )}
            <video
              ref={videoRef}
              className={`rounded-lg ${mirror ? 'scale-x-[-1]' : ''}`}
              style={{ width, height, objectFit: 'cover', filter: 'brightness(1.1) contrast(1.05)' }}
              playsInline
              muted
              autoPlay
            />
            
            {showOverlay && (
              <canvas
                ref={canvasRef}
                className="absolute top-0 left-0 pointer-events-none"
                style={{ 
                  width, 
                  height, 
                  objectFit: 'cover',
                  transform: mirror ? 'scaleX(-1)' : 'none',
                }}
              />
            )}
            
            {cameras.length > 1 && !isLoading && (
              <button
                onClick={switchCamera}
                disabled={isSwitchingCamera}
                className="absolute bottom-2 right-2 w-9 h-9 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/70 disabled:opacity-50 transition-all z-20 border border-white/20"
                title="Pindah Kamera"
              >
                {isSwitchingCamera ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <ArrowRightLeft className="w-4 h-4" />
                )}
              </button>
            )}
          </div>
        </>
      )}
      
      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </div>
  );
});

FaceCamera.displayName = 'FaceCamera';

export default FaceCamera;
