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

export interface SessionFidelityPayload {
  fidelity_score: number | null;
  fidelity_reasoning: string;
  fidelity_source: string;
  gemini_raw?: string;
}

type LanguageCode = "en" | "ur";

interface UseClinicalWebSocketOptions {
  backendUrl?: string;
  language?: LanguageCode;
  doctorVoiceEmbeddingData?: unknown;
}

export const useClinicalWebSocket = ({
  backendUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000",
  language = "en",
  doctorVoiceEmbeddingData,
}: UseClinicalWebSocketOptions = {}) => {
  const [connected, setConnected] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptSegment[]>([]);
  const [draftTranscript, setDraftTranscript] = useState<string>("");
  const [facts, setFacts] = useState<ClinicalFacts>({});
  const [alerts, setAlerts] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [speakerRoles, setSpeakerRoles] = useState<Record<string, string>>({});
  const [sessionStopped, setSessionStopped] = useState(false);
  const [serverReady, setServerReady] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const connectPromiseRef = useRef<Promise<boolean> | null>(null);
  const shouldReconnectRef = useRef(true);
  const serverReadyWaitersRef = useRef<Array<(ready: boolean) => void>>([]);
  const fidelityWaitersRef = useRef<Array<(payload: SessionFidelityPayload | null) => void>>([]);
  const lastFidelityRef = useRef<SessionFidelityPayload | null>(null);

  // Modal cold start can exceed 2 minutes when models hydrate on first request.
  const CONNECT_TIMEOUT_MS = 240000;

  const resolveFidelityWaiters = useCallback((payload: SessionFidelityPayload | null) => {
    const waiters = [...fidelityWaitersRef.current];
    fidelityWaitersRef.current = [];
    waiters.forEach((fn) => fn(payload));
  }, []);

  const resolveServerReadyWaiters = useCallback((ready: boolean) => {
    const waiters = [...serverReadyWaitersRef.current];
    serverReadyWaitersRef.current = [];
    waiters.forEach((resolve) => resolve(ready));
  }, []);

  // Connect to WebSocket - PROPERLY WAITS FOR CONNECTION
  const connect = useCallback(async (): Promise<boolean> => {
    // If already connected, return immediately
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      console.log("Already connected");
      setConnected(true);
      return true;
    }

    // If connection is in progress, wait for it
    if (connectPromiseRef.current) {
      console.log("Connection in progress, waiting...");
      return connectPromiseRef.current;
    }

    // Create new connection promise
    const connectionPromise = new Promise<boolean>((resolve) => {
      let settled = false;
      const settle = (ok: boolean) => {
        if (settled) return;
        settled = true;
        connectPromiseRef.current = null;
        resolve(ok);
      };

      try {
        shouldReconnectRef.current = true;
        const baseUrl = backendUrl;
        const wsUrl = baseUrl.replace(/^http/, "ws") + "/ws/transcribe/v2";
        console.log("Creating WebSocket connection to:", wsUrl);
        const ws = new WebSocket(wsUrl);

        // Modal cold start: TCP/WebSocket handshake can exceed 10s on first container boot
        const timeout = setTimeout(() => {
          try {
            ws.close();
          } catch (closeError) {
            console.error("Error closing websocket after timeout:", closeError);
          }
          settle(false);
        }, CONNECT_TIMEOUT_MS);

        ws.onopen = () => {
          clearTimeout(timeout);
          console.log("✅ WebSocket OPENED and ready");
          ws.send(JSON.stringify({ action: "set_language", language }));
          setConnected(true);
          setError(null);
          wsRef.current = ws;
          settle(true);
        };

        ws.onmessage = (event) => {
          try {
            const message: WebSocketMessage = JSON.parse(event.data);
            handleMessage(message);
            if (message.type === "session_stopped") {
              shouldReconnectRef.current = false;
              try {
                ws.close();
              } catch (closeError) {
                console.error("Error closing WebSocket after session stop:", closeError);
              }
            }
          } catch (e) {
            console.error("Failed to parse WebSocket message:", e);
          }
        };

        ws.onerror = (event) => {
          clearTimeout(timeout);
          if (shouldReconnectRef.current) {
            console.error("❌ WebSocket error:", event);
          } else {
            console.warn("WebSocket closed during teardown");
          }
          if (shouldReconnectRef.current) {
            setError("WebSocket connection error");
          }
          setConnected(false);
          wsRef.current = null;
          settle(false);
        };

        ws.onclose = () => {
          clearTimeout(timeout);
          console.log("WebSocket disconnected");
          setConnected(false);
          wsRef.current = null;
          if (!settled) {
            settle(false);
          }
          if (shouldReconnectRef.current) {
            // Attempt to reconnect after 3 seconds
            reconnectTimeoutRef.current = setTimeout(() => {
              void connect().catch((error) => {
                console.warn("WebSocket reconnect failed:", error);
              });
            }, 3000);
          }
        };
      } catch (e) {
        console.error("Failed to create WebSocket:", e);
        setError("Failed to connect to backend");
        settle(false);
      }
    });

    connectPromiseRef.current = connectionPromise;
    return connectionPromise;
  }, [backendUrl, language]);

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
        setAlerts([]);
        setDraftTranscript("");
        setSessionStopped(false);
        setServerReady(false);
        lastFidelityRef.current = null;
        break;

      case "fidelity_result": {
        const payload: SessionFidelityPayload = {
          fidelity_score: typeof message.fidelity_score === "number" ? message.fidelity_score : null,
          fidelity_reasoning: typeof message.fidelity_reasoning === "string" ? message.fidelity_reasoning : "",
          fidelity_source: typeof message.fidelity_source === "string" ? message.fidelity_source : "not_scored",
          gemini_raw: typeof message.gemini_raw === "string" ? message.gemini_raw : "",
        };
        lastFidelityRef.current = payload;
        console.log("[clinical-ws] fidelity_result (Gemini payload):", payload);
        resolveFidelityWaiters(payload);
        break;
      }

      case "server_ready":
        console.log("🚀 Server Ready");
        setServerReady(true);
        if (doctorVoiceEmbeddingData) {
          try {
            wsRef.current?.send(
              JSON.stringify({
                action: "set_doctor_embedding",
                embedding: doctorVoiceEmbeddingData,
              }),
            );
            console.log("✅ Doctor voice embedding sent to backend");
          } catch (error) {
            console.error("❌ Failed to send doctor voice embedding", error);
          }
        }
        resolveServerReadyWaiters(true);
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
        if (Array.isArray(message.alerts)) {
          setAlerts(message.alerts.map((alert: unknown) => String(alert)));
        } else if (Array.isArray((message.facts || {}).alerts)) {
          setAlerts((message.facts || {}).alerts.map((alert: unknown) => String(alert)));
        }
        break;

      case "alerts_update":
      case "clinical_alerts":
        if (Array.isArray(message.alerts)) {
          setAlerts(message.alerts.map((alert: unknown) => String(alert)));
        }
        break;

      case "session_stopped":
        console.log("⏹️ Session Stopped");
        setSessionStopped(true);
        setServerReady(false);
        resolveServerReadyWaiters(false);
        if (fidelityWaitersRef.current.length > 0) {
          resolveFidelityWaiters(lastFidelityRef.current);
        }
        break;

      default:
        console.log("❓ Unknown message type:", message.type);
    }
  }, [doctorVoiceEmbeddingData, resolveFidelityWaiters, resolveServerReadyWaiters]);

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
        shouldReconnectRef.current = false;
        wsRef.current.send(JSON.stringify({ action: "stop" }));
      } catch (e) {
        console.error("Error sending stop signal:", e);
      }
    }
  }, []);

  // Disconnect
  const disconnect = useCallback(() => {
    shouldReconnectRef.current = false;
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
    setServerReady(false);
    resolveServerReadyWaiters(false);
  }, []);

  const waitForServerReady = useCallback(
    (timeoutMs = 30000): Promise<boolean> => {
      if (serverReady) {
        return Promise.resolve(true);
      }

      return new Promise<boolean>((resolve) => {
        const timeout = setTimeout(() => {
          serverReadyWaitersRef.current = serverReadyWaitersRef.current.filter((waiter) => waiter !== wrappedResolve);
          resolve(false);
        }, timeoutMs);

        const wrappedResolve = (ready: boolean) => {
          clearTimeout(timeout);
          resolve(ready);
        };

        serverReadyWaitersRef.current.push(wrappedResolve);
      });
    },
    [serverReady],
  );

  const waitForFidelityResult = useCallback((timeoutMs = 120000): Promise<SessionFidelityPayload | null> => {
    if (lastFidelityRef.current) {
      return Promise.resolve(lastFidelityRef.current);
    }
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        fidelityWaitersRef.current = fidelityWaitersRef.current.filter((fn) => fn !== wrappedResolve);
        resolve(lastFidelityRef.current);
      }, timeoutMs);

      const wrappedResolve = (payload: SessionFidelityPayload | null) => {
        clearTimeout(timeout);
        resolve(payload);
      };

      fidelityWaitersRef.current.push(wrappedResolve);
    });
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
    alerts,
    speakerRoles,
    error,
    sendAudioChunk,
    stopSession,
    sessionStopped,
    serverReady,
    waitForServerReady,
    waitForFidelityResult,
  };
};
