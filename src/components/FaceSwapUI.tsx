import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Camera, Video, Zap, Upload, Download, X, RefreshCcw, User as UserIcon, Settings, MoreHorizontal, LogIn, Sun, ZapOff, ZoomIn, ZoomOut } from 'lucide-react';
import { CameraView } from './CameraView';
import { cn } from '../lib/utils';
import { swapFaces } from '../lib/face-swap';
import { auth, db, signIn, handleFirestoreError, OperationType } from '../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { User } from 'firebase/auth';

const TARGET_FACES = [
  { id: 'elon', name: 'Elon', url: 'https://picsum.photos/seed/elon/200/200' },
  { id: 'taylor', name: 'Taylor', url: 'https://picsum.photos/seed/taylor/200/200' },
  { id: 'mona', name: 'Mona Lisa', url: 'https://picsum.photos/seed/mona/200/200' },
  { id: 'custom', name: 'Custom', url: null },
];

interface FaceSwapUIProps {
  onOpenGallery: () => void;
  user: User | null;
}

export const FaceSwapUI: React.FC<FaceSwapUIProps> = ({ onOpenGallery, user }) => {
  const [mode, setMode] = useState<'photo' | 'video' | 'live'>('photo');
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [selectedFace, setSelectedFace] = useState(TARGET_FACES[0]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [customFace, setCustomFace] = useState<string | null>(null);
  const [isFaceDetected, setIsFaceDetected] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [torch, setTorch] = useState(false);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    brightness: 100,
    contrast: 100,
    saturation: 100,
  });
  const [showFilters, setShowFilters] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

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
  const handleVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setVideoPreview(url);
      processVideoFrame(url);
    }
  };

  const processVideoFrame = async (videoUrl: string) => {
    setIsProcessing(true);
    try {
      const video = document.createElement('video');
      video.src = videoUrl;
      video.crossOrigin = "anonymous";
      await new Promise((resolve) => (video.onloadeddata = resolve));
      video.currentTime = 0.1; // Seek a bit to get a frame
      await new Promise((resolve) => (video.onseeked = resolve));

      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(video, 0, 0);
      const frameBase64 = canvas.toDataURL('image/jpeg');

      let targetBase64 = selectedFace.url;
      if (!targetBase64) {
        alert("Please select a target face");
        setIsProcessing(false);
        return;
      }

      const targetImg = new Image();
      targetImg.crossOrigin = "anonymous";
      targetImg.src = targetBase64;
      await new Promise((resolve) => (targetImg.onload = resolve));
      
      const targetCanvas = document.createElement('canvas');
      targetCanvas.width = targetImg.width;
      targetCanvas.height = targetImg.height;
      targetCanvas.getContext('2d')?.drawImage(targetImg, 0, 0);
      const targetBase64Data = targetCanvas.toDataURL('image/jpeg');

      const swapped = await swapFaces(targetBase64Data, frameBase64);
      setResultImage(swapped);
    } catch (error) {
      console.error("Video processing failed:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownload = () => {
    if (!resultImage) return;
    const link = document.createElement('a');
    link.href = resultImage;
    link.download = `face-swap-${Date.now()}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  const handleCapture = async () => {
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
      
      // Flip horizontally to match mirror preview if using front camera
      if (facingMode === 'user') {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
      }
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

  const handlePost = async () => {
    if (!user) {
      await signIn();
      return;
    }
    if (!resultImage || isProcessing) return;
    setIsProcessing(true);

    try {
      const canvas = document.createElement('canvas');
      const img = new Image();
      img.src = resultImage;
      await new Promise((resolve) => (img.onload = resolve));
      
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      
      ctx.filter = `brightness(${filters.brightness}%) contrast(${filters.contrast}%) saturate(${filters.saturation}%)`;
      ctx.drawImage(img, 0, 0);
      
      const finalImage = canvas.toDataURL('image/jpeg', 0.7);

      await addDoc(collection(db, 'posts'), {
        imageUrl: finalImage,
        authorId: user.uid,
        authorName: user.displayName || 'Anonymous',
        likes: 0,
        commentsCount: 0,
        createdAt: serverTimestamp(),
      });

      setResultImage(null);
      alert("Post successful!");
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'posts');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="relative h-screen w-screen bg-black text-white font-sans overflow-hidden">
      {/* Main Camera View */}
      <CameraView 
        onFaceDetected={(d) => setIsFaceDetected(!!d)}
        facingMode={facingMode}
        zoom={zoom}
        torch={torch}
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
              style={{
                filter: `brightness(${filters.brightness}%) contrast(${filters.contrast}%) saturate(${filters.saturation}%)`
              }}
            />
            
            {/* Result Controls */}
            <div className="absolute top-10 left-6 right-6 flex justify-between items-center z-50">
              <button 
                onClick={() => {
                  setResultImage(null);
                  setShowFilters(false);
                  setFilters({ brightness: 100, contrast: 100, saturation: 100 });
                }}
                className="p-3 bg-black/40 backdrop-blur-md rounded-full border border-white/10 hover:bg-black/60 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowFilters(!showFilters)}
                  className={cn(
                    "p-3 backdrop-blur-md rounded-full border border-white/10 transition-colors",
                    showFilters ? "bg-white text-black" : "bg-black/40 hover:bg-black/60"
                  )}
                >
                  <Settings className="w-6 h-6" />
                </button>
                <button 
                  onClick={handleDownload}
                  className="p-3 bg-black/40 backdrop-blur-md rounded-full border border-white/10 hover:bg-black/60 transition-colors"
                >
                  <Download className="w-6 h-6" />
                </button>
                <button 
                  onClick={handlePost}
                  className="px-6 py-3 bg-white text-black font-bold rounded-full hover:bg-white/90 transition-colors"
                >
                  {user ? 'Post' : 'Login to Post'}
                </button>
              </div>
            </div>

            {/* Filter Sliders */}
            <AnimatePresence>
              {showFilters && (
                <motion.div
                  initial={{ y: 100, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: 100, opacity: 0 }}
                  className="absolute bottom-10 left-6 right-6 bg-black/60 backdrop-blur-xl p-6 rounded-3xl border border-white/10 z-50"
                >
                  <div className="space-y-6">
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs font-bold uppercase tracking-widest opacity-60">
                        <span>Brightness</span>
                        <span>{filters.brightness}%</span>
                      </div>
                      <input 
                        type="range" 
                        min="50" 
                        max="150" 
                        value={filters.brightness}
                        onChange={(e) => setFilters({ ...filters, brightness: parseInt(e.target.value) })}
                        className="w-full accent-white"
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs font-bold uppercase tracking-widest opacity-60">
                        <span>Contrast</span>
                        <span>{filters.contrast}%</span>
                      </div>
                      <input 
                        type="range" 
                        min="50" 
                        max="150" 
                        value={filters.contrast}
                        onChange={(e) => setFilters({ ...filters, contrast: parseInt(e.target.value) })}
                        className="w-full accent-white"
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs font-bold uppercase tracking-widest opacity-60">
                        <span>Saturation</span>
                        <span>{filters.saturation}%</span>
                      </div>
                      <input 
                        type="range" 
                        min="0" 
                        max="200" 
                        value={filters.saturation}
                        onChange={(e) => setFilters({ ...filters, saturation: parseInt(e.target.value) })}
                        className="w-full accent-white"
                      />
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {/* TikTok Style UI Overlay */}
      {!resultImage && (
        <>
          {/* Top Bar */}
          <div className="absolute top-10 left-6 right-6 flex justify-between items-center z-20">
            <button 
              onClick={() => setFacingMode(prev => prev === 'user' ? 'environment' : 'user')}
              className="p-2 bg-black/20 backdrop-blur-sm rounded-full active:scale-90 transition-transform"
            >
              <RefreshCcw className="w-6 h-6" />
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
            <button 
              onClick={onOpenGallery}
              className="p-2 bg-black/20 backdrop-blur-sm rounded-full"
            >
              <UserIcon className="w-6 h-6" />
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
            <input 
              type="file" 
              ref={videoInputRef} 
              onChange={handleVideoUpload} 
              accept="video/*" 
              className="hidden" 
            />
            
            {/* Torch Toggle */}
            <button
              onClick={() => setTorch(!torch)}
              className={cn(
                "p-3 rounded-full backdrop-blur-md border border-white/10 transition-all",
                torch ? "bg-yellow-500 text-black" : "bg-black/20 text-white"
              )}
            >
              {torch ? <Zap className="w-6 h-6" /> : <ZapOff className="w-6 h-6" />}
            </button>

            {/* Zoom Controls */}
            <div className="flex flex-col gap-2 bg-black/20 backdrop-blur-md p-2 rounded-full border border-white/10">
              <button onClick={() => setZoom(prev => Math.min(prev + 0.5, 5))} className="p-2 hover:bg-white/10 rounded-full">
                <ZoomIn className="w-5 h-5" />
              </button>
              <div className="h-20 w-1 bg-white/20 mx-auto rounded-full relative">
                <div 
                  className="absolute bottom-0 left-0 right-0 bg-white rounded-full transition-all" 
                  style={{ height: `${(zoom - 1) / 4 * 100}%` }}
                />
              </div>
              <button onClick={() => setZoom(prev => Math.max(prev - 0.5, 1))} className="p-2 hover:bg-white/10 rounded-full">
                <ZoomOut className="w-5 h-5" />
              </button>
            </div>

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
              <button 
                onClick={() => videoInputRef.current?.click()}
                className="flex flex-col items-center gap-1 opacity-60 hover:opacity-100 transition-opacity"
              >
                <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center border border-white/10">
                  <Upload className="w-6 h-6" />
                </div>
                <span className="text-[10px] font-bold uppercase">Video</span>
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
