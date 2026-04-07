import { useState, useEffect, useCallback, useRef } from "react";

export interface TranscriptSegment {
  text: string;
  speaker: string;
  start: number;
  end: number;
  role?: string;
}

export interface ClinicalFacts {
  patient_profile?: Record<string, string>;
  chief_complaint?: string[];
  history_of_present_illness?: string[];
  past_medical_history?: string[];
  current_illnesses?: string[];
  mental_observations?: string[];
  physical_observations?: string[];
  medications?: string[];
  allergies?: string[];
  vitals?: string[];
  procedures?: string[];
  family_history?: string[];
  social_and_lifestyle?: string[];
  labs_and_imaging?: string[];
  plan?: string[];
  [key: string]: any;
}

export interface SOAPNote {
  subjective?: string;
  objective?: string;
  assessment?: string;
  plan?: string;
}

export interface AVSNote {
  diagnosis?: string;
  instructions?: string;
  medications?: string;
  followup?: string;
  warnings?: string;
}

interface WebSocketMessage {
  type: string;
  [key: string]: any;
}

export const useClinicalWebSocket = (backendUrl: string = "ws://localhost:8000") => {
  const [connected, setConnected] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptSegment[]>([]);
  const [draftTranscript, setDraftTranscript] = useState<string>("");
  const [facts, setFacts] = useState<ClinicalFacts>({});
  const [error, setError] = useState<string | null>(null);
  const [speakerRoles, setSpeakerRoles] = useState<Record<string, string>>({});

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const connectPromiseRef = useRef<Promise<void> | null>(null);

  // Connect to WebSocket - PROPERLY WAITS FOR CONNECTION
  const connect = useCallback(async () => {
    // If already connected, return immediately
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      console.log("Already connected");
      setConnected(true);
      return;
    }

    // If connection is in progress, wait for it
    if (connectPromiseRef.current) {
      console.log("Connection in progress, waiting...");
      return connectPromiseRef.current;
    }

    // Create new connection promise
    const connectionPromise = new Promise<void>((resolve, reject) => {
      try {
        const wsUrl = `${backendUrl.replace("http://", "ws://").replace("https://", "wss://")}/ws/transcribe/v2`;
        console.log("Creating WebSocket connection to:", wsUrl);
        const ws = new WebSocket(wsUrl);

        // Set a timeout - if no connection after 10 seconds, reject
        const timeout = setTimeout(() => {
          ws.close();
          connectPromiseRef.current = null;
          reject(new Error("WebSocket connection timeout"));
        }, 10000);

        ws.onopen = () => {
          clearTimeout(timeout);
          console.log("✅ WebSocket OPENED and ready");
          setConnected(true);
          setError(null);
          wsRef.current = ws;
          connectPromiseRef.current = null;
          resolve();
        };

        ws.onmessage = (event) => {
          try {
            const message: WebSocketMessage = JSON.parse(event.data);
            handleMessage(message);
          } catch (e) {
            console.error("Failed to parse WebSocket message:", e);
          }
        };

        ws.onerror = (event) => {
          clearTimeout(timeout);
          console.error("❌ WebSocket error:", event);
          setError("WebSocket connection error");
          setConnected(false);
          connectPromiseRef.current = null;
          reject(new Error("WebSocket error"));
        };

        ws.onclose = () => {
          clearTimeout(timeout);
          console.log("WebSocket disconnected");
          setConnected(false);
          connectPromiseRef.current = null;
          // Attempt to reconnect after 3 seconds
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, 3000);
        };
      } catch (e) {
        console.error("Failed to create WebSocket:", e);
        setError("Failed to connect to backend");
        connectPromiseRef.current = null;
        reject(e);
      }
    });

    connectPromiseRef.current = connectionPromise;
    return connectionPromise;
  }, [backendUrl]);

  const handleMessage = useCallback((message: WebSocketMessage) => {
    console.log("📨 WebSocket Message Received:", {
      type: message.type,
      keys: Object.keys(message),
      hasData: message.text ? message.text.substring(0, 50) : "N/A"
    });

    switch (message.type) {
      case "session_start":
        console.log("🟢 Session Started:", message.session_id);
        setSessionId(message.session_id);
        setTranscript([]);
        setFacts({});
        setDraftTranscript("");
        break;

      case "transcript_draft":
        console.log("📝 Draft Transcription:", message.text?.substring(0, 100));
        setDraftTranscript(message.text || "");
        break;

      case "transcript_final":
        console.log("✅ Final Transcription Segments:", message.segments?.length || 0);
        message.segments?.forEach((seg: any, idx: number) => {
          console.log(`Segment ${idx}:`, {
            speaker: seg.speaker,
            role: seg.role,
            text: seg.text?.substring(0, 50)
          });
        });
        setTranscript(message.segments || []);
        setSpeakerRoles(message.speaker_roles || {});
        setDraftTranscript("");
        break;

      case "facts_update":
        console.log("📊 Facts Updated:", Object.keys(message.facts || {}));
        Object.entries(message.facts || {}).forEach(([key, value]: any) => {
          console.log(`  ${key}:`, Array.isArray(value) ? `[Array: ${value.length}]` : value);
        });
        setFacts(message.facts || {});
        break;

      case "session_stopped":
        console.log("⏹️ Session Stopped");
        break;

      default:
        console.log("❓ Unknown message type:", message.type);
    }
  }, []);

  // Send audio chunk
  const sendAudioChunk = useCallback((chunk: ArrayBuffer | Uint8Array) => {
    if (!wsRef.current) {
      console.warn("⚠️ WebSocket reference is null");
      return;
    }

    if (wsRef.current.readyState !== WebSocket.OPEN) {
      console.warn(`⚠️ WebSocket not open. State: ${wsRef.current.readyState} (0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED)`);
      return;
    }

    try {
      wsRef.current.send(chunk as any);
      console.log(`✅ Audio chunk sent: ${chunk.byteLength} bytes`);
    } catch (e) {
      console.error("❌ Error sending audio chunk:", e);
    }
  }, []);

  // Stop session
  const stopSession = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify({ action: "stop" }));
      } catch (e) {
        console.error("Error sending stop signal:", e);
      }
      // Close the connection after a short delay to let stop signal be sent
      setTimeout(() => {
        if (wsRef.current) {
          wsRef.current.close();
        }
      }, 100);
    }
  }, []);

  // Disconnect
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch (e) {
        console.error("Error closing WebSocket:", e);
      }
    }
    setConnected(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    connect,
    disconnect,
    connected,
    sessionId,
    transcript,
    draftTranscript,
    facts,
    speakerRoles,
    error,
    sendAudioChunk,
    stopSession,
  };
};
