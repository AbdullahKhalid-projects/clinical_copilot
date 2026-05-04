import { useState, useRef, useCallback } from "react";
import { encodeWav, float32ToInt16 } from "@/lib/audio-encoder";

export interface TranscriptSegment {
  text: string;
  speaker: string;
  start: number;
  end: number;
  role?: string;
}

interface ChunkApiResponse {
  segments: Array<{ type: "doctor" | "patient"; text: string }>;
}

const SAMPLE_RATE = 32000;
const MIN_CHUNK_SEC = 15;
const MAX_CHUNK_SEC = 25; // Strictly below 30s
const SILENCE_SEC = 20;
const SILENCE_THRESHOLD = 0.015;

export function useSmartChunker(language: "urdu" | "english" = "urdu") {
  const [transcript, setTranscript] = useState<TranscriptSegment[]>([]);
  const transcriptRef = useRef<TranscriptSegment[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pcmBuffersRef = useRef<Int16Array[]>([]);
  const totalSamplesRef = useRef(0);
  const silenceSamplesRef = useRef(0);
  const lastSafeSplitRef = useRef(0); // Tracks the last brief pause to cut cleanly

  const isPausedRef = useRef(false);
  const isActiveRef = useRef(false);
  const isFlushingRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const flushTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const rms = (frame: Float32Array): number => {
    let sum = 0;
    for (let i = 0; i < frame.length; i++) {
      sum += frame[i] * frame[i];
    }
    return Math.sqrt(sum / frame.length);
  };

  /** Flush an EXACT number of samples to the API and carry over the remainder. */
  const flushBuffer = useCallback(
    async (samplesToFlush: number) => {
      if (isFlushingRef.current) return;
      isFlushingRef.current = true;

      const buffers = pcmBuffersRef.current;
      if (buffers.length === 0 || totalSamplesRef.current === 0) {
        isFlushingRef.current = false;
        return;
      }

      // Prevent asking for more samples than we have
      samplesToFlush = Math.min(samplesToFlush, totalSamplesRef.current);

      // Flatten current buffers
      const totalSamples = totalSamplesRef.current;
      const concatenated = new Int16Array(totalSamples);
      let offset = 0;
      for (const buf of buffers) {
        concatenated.set(buf, offset);
        offset += buf.length;
      }

      // Extract exactly the chunk we are allowed to send (<= 28s)
      const chunkToProcess = concatenated.slice(0, samplesToFlush);

      // Carry over the remainder into the next chunk
      const remainder = concatenated.slice(samplesToFlush);
      pcmBuffersRef.current = remainder.length > 0 ? [remainder] : [];
      totalSamplesRef.current = remainder.length;
      silenceSamplesRef.current = 0;
      lastSafeSplitRef.current = 0;

      // Skip tiny artifact chunks
      if (chunkToProcess.length < SAMPLE_RATE * 1) {
        isFlushingRef.current = false;
        return;
      }

      // Encode strictly the isolated chunk
      const wavBlob = encodeWav(chunkToProcess, SAMPLE_RATE, 1);

      setIsProcessing(true);

      try {
        const currentTranscript = transcriptRef.current;
        const context = currentTranscript.slice(-1).map((seg) => ({
          type: seg.role?.toLowerCase() || seg.speaker.toLowerCase(),
          text: seg.text,
        }));

        const formData = new FormData();
        formData.append("audio", wavBlob, `chunk-${Date.now()}.wav`);
        formData.append("language", language);
        if (context.length > 0) {
          formData.append("context", JSON.stringify(context));
        }

        const res = await fetch("/api/transcribe-chunk", {
          method: "POST",
          body: formData,
          signal: abortControllerRef.current?.signal,
        });

        if (!res.ok) {
          const text = await res.text();
          throw new Error(
            `Transcription failed (${res.status}): ${text.slice(0, 200)}`,
          );
        }

        const data = (await res.json()) as ChunkApiResponse;
        const newSegments: TranscriptSegment[] = (data.segments || []).map(
          (seg) => ({
            text: seg.text.trim(),
            speaker: seg.type === "doctor" ? "Doctor" : "Patient",
            role: seg.type === "doctor" ? "Doctor" : "Patient",
            start: 0,
            end: 0,
          }),
        );

        setTranscript((prev) => {
          const next = [...prev, ...newSegments];
          transcriptRef.current = next;
          return next;
        });
      } catch (err: any) {
        console.error("[Chunker] Flush error:", err);
        setError(err.message || "Transcription chunk failed");
      } finally {
        setIsProcessing(false);
        isFlushingRef.current = false;
      }
    },
    [language],
  );

  const maybeFlush = useCallback(() => {
    const totalSec = totalSamplesRef.current / SAMPLE_RATE;
    const silenceSec = silenceSamplesRef.current / SAMPLE_RATE;

    // 1. Natural chunk based on silence
    if (totalSec >= MIN_CHUNK_SEC && silenceSec >= SILENCE_SEC) {
      void flushBuffer(totalSamplesRef.current);
    }
    // 2. Hard limit reached, force a split before the 30s limit
    else if (totalSec >= MAX_CHUNK_SEC) {
      const safeSplitSec = lastSafeSplitRef.current / SAMPLE_RATE;

      // If we recorded a brief pause recently, cut cleanly there so words aren't broken
      if (safeSplitSec >= MIN_CHUNK_SEC) {
        void flushBuffer(lastSafeSplitRef.current);
      } else {
        // No pause found. Cut aggressively exactly at the MAX limit
        const hardCutSamples = Math.floor(MAX_CHUNK_SEC * SAMPLE_RATE);
        void flushBuffer(hardCutSamples);
      }
    }
  }, [flushBuffer]);

  const start = useCallback(
    (stream: MediaStream) => {
      if (isActiveRef.current) return;
      isActiveRef.current = true;
      isPausedRef.current = false;
      setError(null);

      abortControllerRef.current = new AbortController();

      const AudioContextCtor =
        window.AudioContext || (window as any).webkitAudioContext;
      const audioContext = new AudioContextCtor({ sampleRate: SAMPLE_RATE });
      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);

      processor.onaudioprocess = (event) => {
        if (!isActiveRef.current || isPausedRef.current) return;

        const inputData = event.inputBuffer.getChannelData(0);
        const energy = rms(inputData);

        if (energy < SILENCE_THRESHOLD) {
          silenceSamplesRef.current += inputData.length;
          // Mark a safe split point if silence is at least 0.4 seconds
          if (silenceSamplesRef.current >= SAMPLE_RATE * 0.4) {
            lastSafeSplitRef.current =
              totalSamplesRef.current + inputData.length;
          }
        } else {
          silenceSamplesRef.current = 0;
        }

        pcmBuffersRef.current.push(float32ToInt16(inputData));
        totalSamplesRef.current += inputData.length;

        maybeFlush();
      };

      source.connect(processor);
      processor.connect(audioContext.destination);

      audioContextRef.current = audioContext;
      sourceRef.current = source;
      processorRef.current = processor;
    },
    [maybeFlush],
  );

  const stop = useCallback(async () => {
    isActiveRef.current = false;
    isPausedRef.current = false;

    if (flushTimeoutRef.current) {
      clearTimeout(flushTimeoutRef.current);
      flushTimeoutRef.current = null;
    }

    // Do NOT abort in-flight requests — let the current chunk finish so we
    // don't lose transcription. We only abort on explicit discard.
    // abortControllerRef.current?.abort();

    const remainingSec = totalSamplesRef.current / SAMPLE_RATE;
    if (remainingSec > 0.5) {
      await flushBuffer(totalSamplesRef.current);
    } else {
      pcmBuffersRef.current = [];
      totalSamplesRef.current = 0;
      silenceSamplesRef.current = 0;
      lastSafeSplitRef.current = 0;
    }

    if (processorRef.current) {
      try {
        processorRef.current.disconnect();
      } catch {}
      processorRef.current = null;
    }
    if (sourceRef.current) {
      try {
        sourceRef.current.disconnect();
      } catch {}
      sourceRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      void audioContextRef.current.close();
      audioContextRef.current = null;
    }
  }, [flushBuffer]);

  const discard = useCallback(() => {
    isActiveRef.current = false;
    isPausedRef.current = false;

    abortControllerRef.current?.abort();

    pcmBuffersRef.current = [];
    totalSamplesRef.current = 0;
    silenceSamplesRef.current = 0;
    lastSafeSplitRef.current = 0;

    if (processorRef.current) {
      try {
        processorRef.current.disconnect();
      } catch {}
      processorRef.current = null;
    }
    if (sourceRef.current) {
      try {
        sourceRef.current.disconnect();
      } catch {}
      sourceRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      void audioContextRef.current.close();
      audioContextRef.current = null;
    }
  }, []);

  const pause = useCallback((paused: boolean) => {
    isPausedRef.current = paused;
  }, []);

  return { transcript, isProcessing, error, start, stop, discard, pause };
}
