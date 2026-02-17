"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Mic, Square, Trash, Download, Timer as TimerIcon, ChevronDown, CheckCircle2, ChevronRight, StopCircle } from "lucide-react";
import { FaMicrophone, FaPlay, FaPause } from "react-icons/fa";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

type Props = {
  className?: string; // Not used as much now, but good to keep
  timerClassName?: string;
  onStop: (blob: Blob) => void;
  isUploading: boolean;
};

// Utility function to pad a number with leading zeros
const padWithLeadingZeros = (num: number, length: number): string => {
  return String(num).padStart(length, "0");
};

export const AudioRecorderWithVisualizer = ({
  className,
  timerClassName,
  onStop,
  isUploading
}: Props) => {
  const { theme } = useTheme();
  // States
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [timer, setTimer] = useState<number>(0);
  
  // Calculate the hours, minutes, and seconds from the timer
  // const hours = Math.floor(timer / 3600); 
  const minutes = Math.floor((timer % 3600) / 60);
  const seconds = timer % 60;

  // Split the hours, minutes, and seconds into individual digits
  const [minuteLeft, minuteRight] = useMemo(
    () => padWithLeadingZeros(minutes, 2).split(""),
    [minutes]
  );
  const [secondLeft, secondRight] = useMemo(
    () => padWithLeadingZeros(seconds, 2).split(""),
    [seconds]
  );
  
  // Refs
  const mediaRecorderRef = useRef<{
    stream: MediaStream | null;
    analyser: AnalyserNode | null;
    mediaRecorder: MediaRecorder | null;
    audioContext: AudioContext | null;
  }>({
    stream: null,
    analyser: null,
    mediaRecorder: null,
    audioContext: null,
  });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  function startRecording() {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices
        .getUserMedia({
          audio: true,
        })
        .then((stream) => {
          setIsRecording(true);
          setIsPaused(false);
          // ============ Analyzing ============
          const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
          const audioCtx = new AudioContext();
          const analyser = audioCtx.createAnalyser();
          const source = audioCtx.createMediaStreamSource(stream);
          source.connect(analyser);
          
          const mimeType = MediaRecorder.isTypeSupported("audio/webm")
            ? "audio/webm"
            : MediaRecorder.isTypeSupported("audio/mp4")
            ? "audio/mp4" 
            : "audio/wav";

          const mediaRecorder = new MediaRecorder(stream, { mimeType });
          
          mediaRecorderRef.current = {
            stream,
            analyser,
            mediaRecorder,
            audioContext: audioCtx,
          };

          chunksRef.current = [];
          
          mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) {
              chunksRef.current.push(e.data);
            }
          };

          mediaRecorder.onstop = () => {
             // If we stopped intentionally to save
             // Note: in resetRecording we nullify onstop to avoid this call
            const recordBlob = new Blob(chunksRef.current, { type: mimeType });
            onStop(recordBlob);
            chunksRef.current = [];
          };

          mediaRecorder.start(1000);
        })
        .catch((error) => {
          console.error("Error accessing microphone:", error);
        });
    }
  }

  function stopRecording() {
    const { mediaRecorder } = mediaRecorderRef.current;
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }
    cleanupAudioResources();
    setIsRecording(false);
    setIsPaused(false);
    setTimer(0);
  }

  function togglePause() {
      const { mediaRecorder } = mediaRecorderRef.current;
      if (!mediaRecorder) return;

      if (isPaused) {
          mediaRecorder.resume();
          setIsPaused(false);
      } else {
          mediaRecorder.pause();
          setIsPaused(true);
      }
  }

  function cleanupAudioResources() {
    const { stream, analyser, audioContext } = mediaRecorderRef.current;

    if (analyser) {
        analyser.disconnect();
    }
    if (stream) {
        stream.getTracks().forEach((track) => track.stop());
    }
    if (audioContext && audioContext.state !== 'closed') {
        audioContext.close();
    }
    
    if (timerTimeoutRef.current) {
        clearTimeout(timerTimeoutRef.current);
    }
    
    if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
    }
  }

  function resetRecording() {
     // Just stop without saving
     const { mediaRecorder } = mediaRecorderRef.current;
     if (mediaRecorder && mediaRecorder.state !== 'inactive') {
         // Remove onstop handler to prevent upload
         mediaRecorder.onstop = null; 
         mediaRecorder.stop();
     }
     cleanupAudioResources();
     setIsRecording(false);
     setIsPaused(false);
     setTimer(0);
  }

  // Effect to update the timer every second
  useEffect(() => {
    if (isRecording && !isPaused) {
        timerTimeoutRef.current = setTimeout(() => {
        setTimer((prev) => prev + 1);
      }, 1000);
    }
    return () => {
        if (timerTimeoutRef.current) clearTimeout(timerTimeoutRef.current);
    };
  }, [isRecording, isPaused, timer]);

  // Visualizer
  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const canvasCtx = canvas.getContext("2d");
    const WIDTH = canvas.width;
    const HEIGHT = canvas.height;

    const drawDots = (dataArray: Uint8Array) => {
      if (!canvasCtx) return;
      canvasCtx.clearRect(0, 0, WIDTH, HEIGHT);
      
      const dotCount = 5;
      const dotSize = 4;
      const gap = 4;
      // Calculate total width of dots
      const totalWidth = (dotCount * dotSize) + ((dotCount - 1) * gap);
      // Start X to center them in the canvas
      let startX = (WIDTH - totalWidth) / 2;
      const startY = HEIGHT / 2;

      // We need to sample the frequency data to get 5 representative values
      // Or we can just use the average volume to scale the opacity/color of all dots
      
      // Focus on the vocal range (lower frequencies)
      // Most human voice is in the lower 20-30% of the spectrum for these FFT sizes
      const usefulDataLength = Math.floor(dataArray.length * 0.25);
      const step = Math.floor(usefulDataLength / dotCount);

      for (let i = 0; i < dotCount; i++) {
        // Get average value for this chunk
        let sum = 0;
        for(let j = 0; j < step; j++) {
            // Using a quadratic curve to boost higher frequencies in the vocal range
             const index = (i * step) + j;
             if (index < dataArray.length) {
                 sum += dataArray[index];
             }
        }
        const avg = sum / step;
        
        // Boost sensitivity significantly
        // Use a non-linear opacity curve
        let normalizedVolume = (avg / 255);
        normalizedVolume = Math.pow(normalizedVolume, 0.8) * 4.0; // Boost
        
        // Clamp to 1
        normalizedVolume = Math.min(1, normalizedVolume);
        
        // Ensure minimum visibility but allow enough dynamic range
        const alpha = Math.max(0.2, normalizedVolume);
        
        // Draw circle
        canvasCtx.beginPath();
        canvasCtx.arc(startX + (dotSize/2), startY, dotSize/2, 0, 2 * Math.PI);
        
        // Color logic - RED as requested (#ef4444)
        if (isPaused) {
             canvasCtx.fillStyle = `rgba(168, 162, 158, 0.5)`; // Gray when paused   
        } else {
             canvasCtx.fillStyle = `rgba(239, 68, 68, ${alpha})`; 
        }
        canvasCtx.fill();

        startX += dotSize + gap;
      }
    };

    const visualizeVolume = () => {
        const { analyser } = mediaRecorderRef.current;
        if (!analyser) return;

        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        const draw = () => {
            if (!isRecording) {
                if (animationRef.current) cancelAnimationFrame(animationRef.current);
                return;
            }
            animationRef.current = requestAnimationFrame(draw);
            // If paused, just draw static dots or keep last frame? 
            // Better to keep drawing but with 0 volume or specialized paused state
            if (isPaused) {
                 // Zero out data for visual effect or just draw static
                 // Let's just draw with current data but the drawDots handle color
            } 
            analyser.getByteFrequencyData(dataArray); 
            drawDots(dataArray);
        };

        draw();
    };

    if (isRecording) {
      visualizeVolume();
    } else {
      if (canvasCtx) {
        canvasCtx.clearRect(0, 0, WIDTH, HEIGHT);
      }
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    }

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [isRecording, isPaused, theme]);

  return (
    <div className={cn("flex items-center gap-2", className)}>
        <div 
            className={cn(
                "group relative flex items-center justify-between transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] overflow-hidden",
                isRecording 
                    // Recording State: Expanded boxy container
                    ? "w-[380px] pl-4 pr-2 bg-white dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-lg h-12 shadow-sm"
                    // Start State: Default Button size/shape wrapper (will be filled by the Button below)
                    : "w-[180px] h-10 rounded-md cursor-pointer hover:shadow-md" 
            )}
            onClick={!isRecording ? startRecording : undefined}
        >
            {/* Start Button Content (Visible when NOT recording) */}
            <div 
                className={cn(
                    "absolute inset-0 flex items-center justify-center transition-all duration-500",
                    isRecording ? "opacity-0 translate-y-10 pointer-events-none" : "opacity-100 translate-y-0"
                )}
            >
                <Button 
                    className={cn(
                        "w-full h-full gap-2 font-medium shadow-none rounded-md",
                        // Using default primary/secondary variants or specific classes to match theme
                    )}
                    variant="default" // Use default variant (usually black/primary color)
                >
                    <FaMicrophone className="w-4 h-4" />
                    Start Session
                </Button>
            </div>

            {/* Recording Interface (Visible when recording) */}
             <div 
                className={cn(
                    "flex items-center w-full gap-4 transition-all duration-500 delay-100 cursor-default",
                     isRecording ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-10 pointer-events-none absolute"
                )}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Timer Section */}
                <div className="flex items-center gap-2 text-stone-900 dark:text-stone-100 min-w-[60px]">
                    <div className={cn("w-2 h-2 rounded-full", isPaused ? "bg-amber-400 animate-none" : "bg-red-500 animate-pulse")} />
                    <span className={cn("text-sm tabular-nums font-semibold tracking-tight", timerClassName)}>
                        {minuteLeft}{minuteRight}:{secondLeft}{secondRight}
                    </span>
                </div>

                {/* Visualizer Section */}
                <div className="flex items-center gap-1.5 flex-1 justify-center h-8 bg-stone-50 dark:bg-stone-900/50 rounded-md px-2 border border-stone-100 dark:border-stone-800/50">
                    <canvas
                        ref={canvasRef}
                        width={60} 
                        height={20}
                        className="w-[60px] h-[20px]"
                    />
                </div>
                
                {/* Controls - Pause/Stop/Trash */}
                <div className="flex items-center gap-1">
                     <TooltipProvider delayDuration={0}>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button 
                                    onClick={togglePause} 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-8 w-8 rounded-full hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-500 hover:text-stone-700 transition-colors"
                                >
                                    {isPaused ? <FaPlay className="w-3.5 h-3.5 text-stone-600" /> : <FaPause className="w-3.5 h-3.5 text-stone-600" />}
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>{isPaused ? "Resume" : "Pause"}</TooltipContent>
                        </Tooltip>

                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button 
                                    onClick={stopRecording} 
                                    size="icon" 
                                    className="h-8 w-8 rounded-full bg-stone-900 text-white hover:bg-black dark:bg-stone-100 dark:text-stone-950 dark:hover:bg-white transition-all hover:scale-105 shadow-sm"
                                >
                                    <StopCircle className="w-4 h-4 fill-current" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>Finish & Save</TooltipContent>
                        </Tooltip>
                        
                         <Tooltip>
                            <TooltipTrigger asChild>
                                <Button 
                                    onClick={resetRecording} 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-8 w-8 rounded-full hover:bg-red-50 text-stone-400 hover:text-red-600 transition-colors"
                                >
                                    <Trash className="w-3.5 h-3.5" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>Discard</TooltipContent>
                        </Tooltip>
                     </TooltipProvider>
                </div>
            </div>
        </div>

      {/* Uploading State Overlay handled by parent or different component */}
      {isUploading && (
         <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-4 fade-in">
             <div className="bg-stone-900 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3">
                 <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                 <span className="text-sm font-medium">Finalizing session...</span>
             </div>
         </div>
      )}
    </div>
  );
};