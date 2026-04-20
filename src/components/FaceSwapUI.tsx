import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Camera, Video, Zap, Upload, Download, X, RefreshCcw, 
  User as UserIcon, Settings, MoreHorizontal, LogIn, 
  Sun, ZapOff, ZoomIn, ZoomOut, Check, Trash2, Scissors,
  FileImage, Eye 
} from 'lucide-react';
import Cropper from 'react-easy-crop';
import gifshot from 'gifshot';
import { CameraView } from './CameraView';
import { cn } from '../lib/utils';
import { swapFaces } from '../lib/face-swap';
import { auth, db, signIn, handleFirestoreError, OperationType } from '../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { User } from 'firebase/auth';
import { getCroppedImg } from '../lib/cropImage';

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
  const [selectedFaces, setSelectedFaces] = useState<(typeof TARGET_FACES[0])[]>([TARGET_FACES[0]]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingIndex, setProcessingIndex] = useState<number | null>(null);
  const [resultImages, setResultImages] = useState<string[]>([]);
  const [activeResultIndex, setActiveResultIndex] = useState(0);
  const [customFace, setCustomFace] = useState<string | null>(null);
  const [isFaceDetected, setIsFaceDetected] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [torch, setTorch] = useState(false);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [downloadFormat, setDownloadFormat] = useState<'jpg' | 'gif'>('jpg');
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  
  // Cropper states
  const [imageToCrop, setImageToCrop] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoomCrop, setZoomCrop] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);

  const [filters, setFilters] = useState({
    brightness: 100,
    contrast: 100,
    saturation: 100,
  });
  const [showFilters, setShowFilters] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  // Live Swap Logic
  useEffect(() => {
    let timer: any;
    if (mode === 'live' && isFaceDetected && !isProcessing && resultImages.length === 0) {
      timer = setTimeout(() => {
        handleCapture();
      }, 3000); // 3 second intervals for "live" feel
    }
    return () => clearTimeout(timer);
  }, [mode, isFaceDetected, isProcessing, resultImages.length]);

  const handleFaceSelect = (face: typeof TARGET_FACES[0]) => {
    if (face.id === 'custom') {
      fileInputRef.current?.click();
    } else {
      setSelectedFaces(prev => {
        const exists = prev.find(f => f.id === face.id);
        if (exists) {
          if (prev.length === 1) return prev; // Keep at least one
          return prev.filter(f => f.id !== face.id);
        }
        return [...prev, face];
      });
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const url = event.target?.result as string;
        setImageToCrop(url);
      };
      reader.readAsDataURL(file);
    }
  };

  const onCropComplete = useCallback((_croppedArea: any, croppedAreaPixels: any) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const handleApplyCrop = async () => {
    if (!imageToCrop || !croppedAreaPixels) return;
    try {
      const croppedImage = await getCroppedImg(imageToCrop, croppedAreaPixels);
      setCustomFace(croppedImage);
      const faceObj = { id: 'custom', name: 'Custom', url: croppedImage };
      setSelectedFaces(prev => {
        const others = prev.filter(f => f.id !== 'custom');
        return [...others, faceObj];
      });
      setImageToCrop(null);
    } catch (e) {
      console.error(e);
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
    if (selectedFaces.length === 0) {
      alert("Please select at least one target face");
      return;
    }
    setIsProcessing(true);
    const results: string[] = [];
    try {
      const video = document.createElement('video');
      video.src = videoUrl;
      video.crossOrigin = "anonymous";
      await new Promise((resolve) => (video.onloadeddata = resolve));
      video.currentTime = 0.1;
      await new Promise((resolve) => (video.onseeked = resolve));

      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(video, 0, 0);
      const frameBase64 = canvas.toDataURL('image/jpeg');

      for (let i = 0; i < selectedFaces.length; i++) {
        setProcessingIndex(i);
        const face = selectedFaces[i];
        let targetBase64 = face.url;
        if (!targetBase64) continue;

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
        results.push(swapped);
      }
      setResultImages(results);
      setActiveResultIndex(0);
      setIsConfirmed(false);
    } catch (error) {
      console.error("Video processing failed:", error);
    } finally {
      setIsProcessing(false);
      setProcessingIndex(null);
    }
  };

  const handleDownload = () => {
    const currentImg = resultImages[activeResultIndex];
    if (!currentImg) return;

    if (downloadFormat === 'gif' && originalImage) {
      const frames = [originalImage, currentImg];
      gifshot.createGIF({
        images: frames,
        gifWidth: 512,
        gifHeight: 512,
        interval: 0.8,
        numFrames: 2,
      }, (obj: any) => {
        if (!obj.error) {
          const link = document.createElement('a');
          link.href = obj.image;
          link.download = `face-swap-${activeResultIndex}-${Date.now()}.gif`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        }
      });
      return;
    }

    const link = document.createElement('a');
    link.href = currentImg;
    link.download = `face-swap-${activeResultIndex}-${Date.now()}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  const handleCapture = async () => {
    if (isProcessing) return;
    if (selectedFaces.length === 0) {
      if (mode !== 'live') alert("Please select at least one target face");
      return;
    }
    setIsProcessing(true);
    const results: string[] = [];

    try {
      const video = document.querySelector('video');
      if (!video) return;

      const canvas = document.createElement('canvas');
      // Resize for lower latency
      const scale = 512 / Math.max(video.videoWidth, video.videoHeight);
      canvas.width = video.videoWidth * scale;
      canvas.height = video.videoHeight * scale;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      
      if (facingMode === 'user') {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      const sourceBase64 = canvas.toDataURL('image/jpeg', 0.8);
      setOriginalImage(sourceBase64);
      
      for (let i = 0; i < selectedFaces.length; i++) {
        setProcessingIndex(i);
        const face = selectedFaces[i];
        let targetBase64 = face.url;
        if (!targetBase64) continue;

        const targetImg = new Image();
        targetImg.crossOrigin = "anonymous";
        targetImg.src = targetBase64;
        await new Promise((resolve) => (targetImg.onload = resolve));
        
        const targetCanvas = document.createElement('canvas');
        // Resize target too
        const targetScale = 512 / Math.max(targetImg.width, targetImg.height);
        targetCanvas.width = targetImg.width * targetScale;
        targetCanvas.height = targetImg.height * targetScale;
        targetCanvas.getContext('2d')?.drawImage(targetImg, 0, 0, targetCanvas.width, targetCanvas.height);
        const targetBase64Data = targetCanvas.toDataURL('image/jpeg');

        const swapped = await swapFaces(targetBase64Data, sourceBase64);
        results.push(swapped);
      }
      setResultImages(results);
      setActiveResultIndex(0);
      setIsConfirmed(false);
    } catch (error) {
      console.error("Capture failed:", error);
    } finally {
      setIsProcessing(false);
      setProcessingIndex(null);
    }
  };

  const handlePost = async () => {
    if (!user) {
      await signIn();
      return;
    }
    const currentImg = resultImages[activeResultIndex];
    if (!currentImg || isProcessing) return;
    setIsProcessing(true);

    try {
      const canvas = document.createElement('canvas');
      const img = new Image();
      img.src = currentImg;
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

      // Remove from current results instead of closing everything?
      // Or just close everything. TikTok usually does one by one.
      setResultImages(prev => prev.filter((_, i) => i !== activeResultIndex));
      if (resultImages.length <= 1) {
        setResultImages([]);
      } else {
        setActiveResultIndex(0);
      }
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
        className={cn(resultImages.length > 0 ? "opacity-0" : "opacity-100")}
      />

      {/* Rendering Active Indicator */}
      <AnimatePresence>
        {isProcessing && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-40 flex items-center justify-center pointer-events-none"
          >
            <div className="absolute inset-0 bg-white/5 backdrop-blur-[2px]" />
            <div className="relative flex flex-col items-center gap-6">
              <div className="w-16 h-16 border-4 border-white/20 border-t-white rounded-full animate-spin" />
              <div className="px-4 py-2 bg-black/60 backdrop-blur-md rounded-xl border border-white/20 animate-pulse">
                <p className="text-[10px] font-black uppercase tracking-[0.2em]">Active Rendering</p>
              </div>
              {/* Scanning visual line */}
              <motion.div 
                animate={{ top: ['0%', '100%', '0%'] }}
                transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                className="absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-white to-transparent shadow-[0_0_15px_rgba(255,255,255,0.8)] z-50 w-[200%] -left-1/2"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Result Preview Overlay */}
      <AnimatePresence mode="wait">
        {resultImages.length > 0 && (
          <motion.div 
            key="result-overlay"
            initial={{ opacity: 0, scale: 1.1 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 bg-black flex flex-col"
          >
            <div className="relative flex-1 overflow-hidden">
              <motion.img 
                key={activeResultIndex}
                initial={{ opacity: 0, x: 50 }}
                animate={{ opacity: 1, x: 0 }}
                whileHover={{ scale: 1.05 }}
                transition={{ type: 'spring', damping: 20, stiffness: 100 }}
                src={resultImages[activeResultIndex]} 
                alt="Swapped Result" 
                className="w-full h-full object-cover transition-transform duration-500"
                referrerPolicy="no-referrer"
                style={{
                  filter: `brightness(${filters.brightness}%) contrast(${filters.contrast}%) saturate(${filters.saturation}%)`
                }}
              />

              {/* Sequential Indicator */}
              <div className="absolute top-24 left-1/2 -translate-x-1/2 flex gap-1 z-[60]">
                {resultImages.map((_, i) => (
                  <div 
                    key={i}
                    className={cn(
                      "h-1 rounded-full transition-all duration-300",
                      i === activeResultIndex ? "bg-white w-8 shadow-[0_0_10px_rgba(255,255,255,0.5)]" : "bg-white/30 w-4"
                    )}
                  />
                ))}
              </div>
            </div>
            
            {/* Confirmation Banner */}
            {!isConfirmed && (
              <div className="absolute inset-x-0 bottom-32 flex flex-col items-center gap-4 z-50">
                <div className="px-6 py-3 bg-black/60 backdrop-blur-md rounded-2xl border border-white/20 text-center animate-in fade-in slide-in-from-bottom-5">
                  <p className="text-sm font-bold uppercase tracking-widest text-white/90">Reviewing {activeResultIndex + 1} of {resultImages.length}</p>
                  <p className="text-xs text-white/60">Generate next or confirm this one?</p>
                </div>
                <div className="flex gap-4">
                  <button 
                    onClick={() => {
                      setResultImages(prev => prev.filter((_, i) => i !== activeResultIndex));
                      if (resultImages.length <= 1) {
                        setIsConfirmed(false);
                      }
                    }}
                    className="p-5 bg-red-500/20 backdrop-blur-md rounded-full border border-red-500/50 hover:bg-red-500/40 transition-all active:scale-95 flex items-center gap-2"
                  >
                    <Trash2 className="w-6 h-6 text-red-500" />
                    <span className="font-bold text-sm uppercase">Discard</span>
                  </button>
                  {activeResultIndex < resultImages.length - 1 ? (
                    <button 
                      onClick={() => setActiveResultIndex(prev => prev + 1)}
                      className="p-5 bg-white backdrop-blur-md rounded-full border border-white/20 hover:bg-white/90 transition-all active:scale-95 flex items-center gap-2 text-black"
                    >
                      <RefreshCcw className="w-6 h-6" />
                      <span className="font-bold text-sm uppercase">Next Swap</span>
                    </button>
                  ) : (
                    <button 
                      onClick={() => setIsConfirmed(true)}
                      className="p-5 bg-green-500 backdrop-blur-md rounded-full border border-green-400 hover:bg-green-400 transition-all active:scale-95 flex items-center gap-2 text-black shadow-[0_0_20px_rgba(34,197,94,0.4)]"
                    >
                      <Check className="w-6 h-6" />
                      <span className="font-bold text-sm uppercase">Confirm All</span>
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Result Controls - Only visible when confirmed */}
            <div className="absolute top-10 left-6 right-6 flex justify-between items-center z-50">
              <button 
                onClick={() => {
                  setResultImages([]);
                  setIsConfirmed(false);
                  setShowFilters(false);
                  setFilters({ brightness: 100, contrast: 100, saturation: 100 });
                }}
                className="p-3 bg-black/40 backdrop-blur-md rounded-full border border-white/10 hover:bg-black/60 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
              
              {isConfirmed && (
                <motion.div 
                  initial={{ x: 20, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  className="flex gap-3"
                >
                  {resultImages.length > 1 && (
                    <div className="flex gap-1 overflow-x-auto p-1 max-w-[150px] no-scrollbar mr-2">
                       {resultImages.map((img, i) => (
                         <button 
                           key={i}
                           onClick={() => setActiveResultIndex(i)}
                           className={cn(
                             "w-10 h-10 rounded-lg border-2 overflow-hidden flex-shrink-0 transition-all",
                             i === activeResultIndex ? "border-white scale-110" : "border-white/20 opacity-50"
                           )}
                         >
                           <img src={img} className="w-full h-full object-cover" />
                         </button>
                       ))}
                    </div>
                  )}
                  {/* Download with format toggle */}
                  <div className="flex bg-black/40 backdrop-blur-md rounded-full border border-white/10 overflow-hidden">
                    <button 
                      onClick={() => setDownloadFormat('jpg')}
                      className={cn("px-3 py-2 text-[10px] font-bold uppercase transition-colors", downloadFormat === 'jpg' ? "bg-white text-black" : "hover:bg-white/10")}
                    >
                      JPG
                    </button>
                    <button 
                      onClick={() => setDownloadFormat('gif')}
                      className={cn("px-3 py-2 text-[10px] font-bold uppercase transition-colors border-l border-white/10", downloadFormat === 'gif' ? "bg-white text-black" : "hover:bg-white/10")}
                    >
                      GIF
                    </button>
                    <button 
                      onClick={handleDownload}
                      className="px-4 py-2 hover:bg-white/10 transition-colors border-l border-white/10"
                      title={`Download as ${downloadFormat.toUpperCase()}`}
                    >
                      <Download className="w-5 h-5" />
                    </button>
                  </div>
                  
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
                    onClick={handlePost}
                    className="px-6 py-3 bg-white text-black font-bold rounded-full hover:bg-white/90 transition-colors shadow-[0_0_15px_rgba(255,255,255,0.3)]"
                  >
                    {user ? 'Post' : 'Login to Post'}
                  </button>
                </motion.div>
              )}
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
      {resultImages.length === 0 && (
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

            {TARGET_FACES.map((face) => {
              const isSelected = selectedFaces.some(f => f.id === face.id);
              return (
                <button
                  key={face.id}
                  onClick={() => handleFaceSelect(face)}
                  className={cn(
                    "relative group transition-transform active:scale-95",
                    isSelected ? "scale-110" : "scale-100"
                  )}
                >
                  {isSelected && (
                    <div className="absolute -top-1 -right-1 z-30 bg-white text-black rounded-full p-0.5 shadow-lg">
                      <Check className="w-3 h-3" />
                    </div>
                  )}
                  <div className={cn(
                    "w-14 h-14 rounded-full border-2 overflow-hidden transition-colors",
                    isSelected ? "border-white shadow-[0_0_15px_rgba(255,255,255,0.5)]" : "border-white/20"
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
              );
            })}
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
                    "w-16 h-16 rounded-full transition-all duration-300 relative overflow-hidden",
                    isProcessing ? "bg-red-500 scale-75 rounded-lg" : "bg-white"
                  )}>
                    {isProcessing && processingIndex !== null && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-[10px] font-black text-white">
                        {processingIndex + 1}/{selectedFaces.length}
                      </div>
                    )}
                  </div>
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

      {/* Style Overlay */}
      <AnimatePresence>
        {imageToCrop && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black flex flex-col"
          >
            <div className="relative flex-1">
              <Cropper
                image={imageToCrop}
                crop={crop}
                zoom={zoomCrop}
                aspect={1}
                showGrid={true}
                onCropChange={setCrop}
                onCropComplete={onCropComplete}
                onZoomChange={setZoomCrop}
              />
              {/* Target Outline Indicator */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                <div className="w-64 h-64 border-2 border-white/30 rounded-full flex items-center justify-center">
                  <div className="w-48 h-48 border border-white/10 rounded-full" />
                </div>
              </div>
            </div>
            <div className="p-8 bg-zinc-950 border-t border-white/10">
              <div className="max-w-md mx-auto space-y-6">
                <div className="text-center space-y-1">
                  <div className="flex items-center justify-center gap-2">
                    <Scissors className="w-4 h-4 text-white/40" />
                    <h3 className="text-lg font-bold tracking-tight">Crop Selection</h3>
                  </div>
                  <p className="text-xs text-white/50 uppercase tracking-widest">Adjust the face to be perfectly centered</p>
                </div>
                
                <div className="space-y-4">
                  <div className="flex justify-between items-end">
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-white/40">Zoom Level</p>
                      <p className="text-2xl font-black">{zoomCrop.toFixed(1)}<span className="text-sm text-white/40 ml-1">X</span></p>
                    </div>
                    <div className="flex gap-2">
                       <button onClick={() => setZoomCrop(prev => Math.max(prev - 0.2, 1))} className="p-2 bg-white/5 rounded-lg border border-white/10 active:scale-90 transition-transform">
                         <ZoomOut className="w-4 h-4" />
                       </button>
                       <button onClick={() => setZoomCrop(prev => Math.min(prev + 0.2, 3))} className="p-2 bg-white/5 rounded-lg border border-white/10 active:scale-90 transition-transform">
                         <ZoomIn className="w-4 h-4" />
                       </button>
                    </div>
                  </div>
                  <input
                    type="range"
                    value={zoomCrop}
                    min={1}
                    max={3}
                    step={0.01}
                    aria-labelledby="Zoom"
                    onChange={(e) => setZoomCrop(Number(e.target.value))}
                    className="w-full h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer accent-white"
                  />
                </div>

                <div className="flex gap-4">
                  <button
                    onClick={() => setImageToCrop(null)}
                    className="flex-1 px-6 py-4 bg-white/5 border border-white/10 rounded-2xl font-bold uppercase text-xs tracking-widest hover:bg-white/10 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleApplyCrop}
                    className="flex-1 px-6 py-4 bg-white text-black rounded-2xl font-bold uppercase text-xs tracking-widest hover:bg-white/90 transition-all flex items-center justify-center gap-2 shadow-[0_0_30px_rgba(255,255,255,0.2)]"
                  >
                    <Check className="w-4 h-4" />
                    Apply Crop
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes dash {
          to { stroke-dashoffset: 0; }
        }
      `}} />
    </div>
  );
};
