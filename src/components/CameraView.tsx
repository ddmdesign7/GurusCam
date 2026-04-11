import React, { useEffect, useRef, useState } from 'react';
import * as faceapi from 'face-api.js';
import { cn } from '../lib/utils';

interface CameraViewProps {
  onFaceDetected?: (detection: faceapi.FaceDetection | null) => void;
  isRecording?: boolean;
  activeFilter?: string;
  className?: string;
  facingMode?: 'user' | 'environment';
  zoom?: number;
  torch?: boolean;
}

export const CameraView: React.FC<CameraViewProps> = ({ 
  onFaceDetected, 
  isRecording, 
  activeFilter,
  className,
  facingMode = 'user',
  zoom = 1,
  torch = false
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [capabilities, setCapabilities] = useState<MediaTrackCapabilities | null>(null);

  useEffect(() => {
    const loadModels = async () => {
      const MODEL_URL = 'https://justadudewhohacks.github.io/face-api.js/models';
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      ]);
      setIsModelLoaded(true);
    };
    loadModels();
  }, []);

  useEffect(() => {
    if (isModelLoaded) {
      startVideo();
    }
  }, [isModelLoaded]);

  const startVideo = () => {
    // Stop existing stream if any
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
    }

    navigator.mediaDevices
      .getUserMedia({ 
        video: { 
          width: { ideal: 1280 }, 
          height: { ideal: 720 }, 
          facingMode 
        } 
      })
      .then((stream) => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          const track = stream.getVideoTracks()[0];
          // @ts-ignore - getCapabilities is not in all types
          if (track.getCapabilities) {
            // @ts-ignore
            setCapabilities(track.getCapabilities());
          }
        }
      })
      .catch((err) => console.error("Camera error:", err));
  };

  useEffect(() => {
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      const track = stream.getVideoTracks()[0];
      
      const constraints: any = {};
      // @ts-ignore
      if (capabilities?.zoom) {
        constraints.zoom = zoom;
      }
      // @ts-ignore
      if (capabilities?.torch !== undefined) {
        constraints.torch = torch;
      }

      if (Object.keys(constraints).length > 0) {
        track.applyConstraints({ advanced: [constraints] } as any)
          .catch(err => console.error("Constraint error:", err));
      }
    }
  }, [zoom, torch, capabilities]);

  useEffect(() => {
    if (isModelLoaded) {
      startVideo();
    }
  }, [isModelLoaded, facingMode]);

  useEffect(() => {
    let interval: any;
    if (isModelLoaded && videoRef.current) {
      interval = setInterval(async () => {
        if (videoRef.current && videoRef.current.readyState === 4) {
          const detections = await faceapi.detectSingleFace(
            videoRef.current,
            new faceapi.TinyFaceDetectorOptions()
          ).withFaceLandmarks();

          if (detections) {
            onFaceDetected?.(detections.detection);
            if (canvasRef.current) {
              const displaySize = { width: videoRef.current.videoWidth, height: videoRef.current.videoHeight };
              faceapi.matchDimensions(canvasRef.current, displaySize);
              const resizedDetections = faceapi.resizeResults(detections, displaySize);
              const ctx = canvasRef.current.getContext('2d');
              ctx?.clearRect(0, 0, displaySize.width, displaySize.height);
              
              // Draw landmarks or box if needed for debugging
              // faceapi.draw.drawDetections(canvasRef.current, resizedDetections);
            }
          } else {
            onFaceDetected?.(null);
          }
        }
      }, 100);
    }
    return () => clearInterval(interval);
  }, [isModelLoaded, onFaceDetected]);

  return (
    <div className={cn("relative w-full h-full bg-black overflow-hidden", className)}>
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className={cn(
          "absolute inset-0 w-full h-full object-cover",
          facingMode === 'user' && "scale-x-[-1]"
        )}
      />
      <canvas
        ref={canvasRef}
        className={cn(
          "absolute inset-0 w-full h-full object-cover pointer-events-none",
          facingMode === 'user' && "scale-x-[-1]"
        )}
      />
      {!isModelLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-white">
          <div className="flex flex-col items-center gap-4">
            <div className="w-8 h-8 border-4 border-white/20 border-t-white rounded-full animate-spin" />
            <p className="text-sm font-medium">Initializing AI Models...</p>
          </div>
        </div>
      )}
    </div>
  );
};
