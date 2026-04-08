import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Camera, Video, Zap, Upload, Download, X, RefreshCcw, User, Settings, MoreHorizontal } from 'lucide-react';
import { CameraView } from './CameraView';
import { cn } from '../lib/utils';
import { swapFaces } from '../lib/face-swap';

const TARGET_FACES = [
  { id: 'elon', name: 'Elon', url: 'https://picsum.photos/seed/elon/200/200' },
  { id: 'taylor', name: 'Taylor', url: 'https://picsum.photos/seed/taylor/200/200' },
  { id: 'mona', name: 'Mona Lisa', url: 'https://picsum.photos/seed/mona/200/200' },
  { id: 'custom', name: 'Custom', url: null },
];

export const FaceSwapUI: React.FC = () => {
  const [mode, setMode] = useState<'photo' | 'video' | 'live'>('photo');
  const [selectedFace, setSelectedFace] = useState(TARGET_FACES[0]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [customFace, setCustomFace] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFaceSelect = (face: typeof TARGET_FACES[0]) => {
    if (face.id === 'custom') {
      fileInputRef.current?.click();
    } else {
      setSelectedFace(face);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const url = event.target?.result as string;
        setCustomFace(url);
        setSelectedFace({ id: 'custom', name: 'Custom', url });
      };
      reader.readAsDataURL(file);
    }
  };
    if (isProcessing) return;
    setIsProcessing(true);

    try {
      // 1. Capture frame from video
      const video = document.querySelector('video');
      if (!video) return;

      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      
      // Flip horizontally to match mirror preview
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0);
      
      const sourceBase64 = canvas.toDataURL('image/jpeg', 0.8);
      
      // 2. Get target face image
      let targetBase64 = selectedFace.url;
      if (!targetBase64) {
        // Handle custom upload logic here
        alert("Please select a target face");
        setIsProcessing(false);
        return;
      }

      // Convert target URL to base64 (simplified for demo, usually needs proxy or local file)
      const targetImg = new Image();
      targetImg.crossOrigin = "anonymous";
      targetImg.src = targetBase64;
      await new Promise((resolve) => (targetImg.onload = resolve));
      
      const targetCanvas = document.createElement('canvas');
      targetCanvas.width = targetImg.width;
      targetCanvas.height = targetImg.height;
      targetCanvas.getContext('2d')?.drawImage(targetImg, 0, 0);
      const targetBase64Data = targetCanvas.toDataURL('image/jpeg');

      // 3. Call Gemini for swap
      const swapped = await swapFaces(targetBase64Data, sourceBase64);
      setResultImage(swapped);
    } catch (error) {
      console.error("Capture failed:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="relative h-screen w-screen bg-black text-white font-sans overflow-hidden">
      {/* Main Camera View */}
      <CameraView 
        onFaceDetected={(d) => setIsFaceDetected(!!d)}
        className={cn(resultImage ? "opacity-0" : "opacity-100")}
      />

      {/* Result Preview Overlay */}
      <AnimatePresence>
        {resultImage && (
          <motion.div 
            initial={{ opacity: 0, scale: 1.1 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 bg-black"
          >
            <img 
              src={resultImage} 
              alt="Swapped Result" 
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
            
            {/* Result Controls */}
            <div className="absolute top-10 left-6 right-6 flex justify-between items-center">
              <button 
                onClick={() => setResultImage(null)}
                className="p-3 bg-black/40 backdrop-blur-md rounded-full border border-white/10 hover:bg-black/60 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
              <div className="flex gap-3">
                <button className="p-3 bg-black/40 backdrop-blur-md rounded-full border border-white/10 hover:bg-black/60 transition-colors">
                  <Download className="w-6 h-6" />
                </button>
                <button className="px-6 py-3 bg-white text-black font-bold rounded-full hover:bg-white/90 transition-colors">
                  Post
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* TikTok Style UI Overlay */}
      {!resultImage && (
        <>
          {/* Top Bar */}
          <div className="absolute top-10 left-6 right-6 flex justify-between items-center z-20">
            <button className="p-2 bg-black/20 backdrop-blur-sm rounded-full">
              <Settings className="w-6 h-6" />
            </button>
            <div className="flex gap-4 bg-black/20 backdrop-blur-sm px-4 py-2 rounded-full border border-white/10">
              <button 
                onClick={() => setMode('photo')}
                className={cn("text-xs font-bold uppercase tracking-widest transition-opacity", mode === 'photo' ? "opacity-100" : "opacity-40")}
              >
                Photo
              </button>
              <button 
                onClick={() => setMode('video')}
                className={cn("text-xs font-bold uppercase tracking-widest transition-opacity", mode === 'video' ? "opacity-100" : "opacity-40")}
              >
                Video
              </button>
              <button 
                onClick={() => setMode('live')}
                className={cn("text-xs font-bold uppercase tracking-widest transition-opacity", mode === 'live' ? "opacity-100" : "opacity-40")}
              >
                Live
              </button>
            </div>
            <button className="p-2 bg-black/20 backdrop-blur-sm rounded-full">
              <MoreHorizontal className="w-6 h-6" />
            </button>
          </div>

          {/* Right Sidebar - Target Faces */}
          <div className="absolute right-6 top-1/2 -translate-y-1/2 flex flex-col gap-6 z-20">
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileUpload} 
              accept="image/*" 
              className="hidden" 
            />
            {TARGET_FACES.map((face) => (
              <button
                key={face.id}
                onClick={() => handleFaceSelect(face)}
                className={cn(
                  "relative group transition-transform active:scale-95",
                  selectedFace.id === face.id ? "scale-110" : "scale-100"
                )}
              >
                <div className={cn(
                  "w-14 h-14 rounded-full border-2 overflow-hidden transition-colors",
                  selectedFace.id === face.id ? "border-white shadow-[0_0_15px_rgba(255,255,255,0.5)]" : "border-white/20"
                )}>
                  {face.id === 'custom' && customFace ? (
                    <img src={customFace} alt="Custom" className="w-full h-full object-cover" />
                  ) : face.url ? (
                    <img src={face.url} alt={face.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-full h-full bg-white/10 flex items-center justify-center">
                      <Upload className="w-6 h-6 text-white/40" />
                    </div>
                  )}
                </div>
                <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] font-bold uppercase tracking-tighter whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
                  {face.id === 'custom' && customFace ? 'Custom' : face.name}
                </span>
              </button>
            ))}
          </div>

          {/* Bottom Controls */}
          <div className="absolute bottom-12 left-0 right-0 flex flex-col items-center gap-8 z-20">
            {/* Status Indicator */}
            <div className="flex items-center gap-2 px-4 py-1.5 bg-black/40 backdrop-blur-md rounded-full border border-white/10">
              <div className={cn("w-2 h-2 rounded-full animate-pulse", isFaceDetected ? "bg-green-500" : "bg-red-500")} />
              <span className="text-[10px] font-bold uppercase tracking-widest">
                {isFaceDetected ? "Face Detected" : "Searching for Face..."}
              </span>
            </div>

            <div className="flex items-center justify-center gap-12 w-full px-10">
              {/* Effects Button */}
              <button className="flex flex-col items-center gap-1 opacity-60 hover:opacity-100 transition-opacity">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                  <Zap className="w-6 h-6 fill-white" />
                </div>
                <span className="text-[10px] font-bold uppercase">Effects</span>
              </button>

              {/* Capture Button */}
              <button 
                onClick={handleCapture}
                disabled={isProcessing}
                className="relative group active:scale-90 transition-transform"
              >
                <div className="w-20 h-20 rounded-full border-[6px] border-white/30 flex items-center justify-center">
                  <div className={cn(
                    "w-16 h-16 rounded-full transition-all duration-300",
                    isProcessing ? "bg-red-500 scale-75 rounded-lg" : "bg-white"
                  )} />
                </div>
                {isProcessing && (
                  <svg className="absolute inset-0 w-20 h-20 -rotate-90">
                    <circle
                      cx="40"
                      cy="40"
                      r="37"
                      fill="none"
                      stroke="white"
                      strokeWidth="4"
                      strokeDasharray="232"
                      className="animate-[dash_2s_linear_infinite]"
                      style={{
                        strokeDashoffset: 232,
                        animation: 'dash 2s linear infinite'
                      }}
                    />
                  </svg>
                )}
              </button>

              {/* Upload Button */}
              <button className="flex flex-col items-center gap-1 opacity-60 hover:opacity-100 transition-opacity">
                <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center border border-white/10">
                  <Upload className="w-6 h-6" />
                </div>
                <span className="text-[10px] font-bold uppercase">Upload</span>
              </button>
            </div>
          </div>
        </>
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes dash {
          to { stroke-dashoffset: 0; }
        }
      `}} />
    </div>
  );
};
