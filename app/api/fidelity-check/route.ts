import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

// Initialize Gemini client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const GEMINI_MODEL = process.env.GEMINI_FIDELITY_MODEL || "gemini-2.5-flash";

interface TranscriptSegment {
  text: string;
  speaker: string;
  start: number;
  role?: string;
}

interface FidelityCheckRequest {
  audioUrl: string;
  transcriptSegments: TranscriptSegment[];
  speakerLabels?: Record<string, string>;
}

interface FidelityCheckResponse {
  fidelity_score: number | null;
  fidelity_reasoning: string;
  fidelity_source: string;
  gemini_raw?: string;
}

/**
 * Build transcript text from segments similar to the Python implementation
 */
function buildTranscriptText(
  segments: TranscriptSegment[],
  speakerLabels: Record<string, string> = {}
): string {
  if (!segments || segments.length === 0) {
    return "";
  }

  return segments
    .map((seg) => {
      const label = speakerLabels[seg.speaker] || seg.speaker || "Unknown";
      return `[${label}] ${seg.text}`;
    })
    .join("\n");
}

/**
 * Strip markdown code fences from JSON response
 */
function stripJsonFences(text: string): string {
  if (!text) return "{}";

  const trimmed = text.trim();

  // Handle ```json ... ```
  if (trimmed.startsWith("```json")) {
    const withoutStart = trimmed.slice(7).trimStart();
    if (withoutStart.endsWith("```")) {
      return withoutStart.slice(0, -3).trim();
    }
    return withoutStart;
  }

  // Handle ``` ... ```
  if (trimmed.startsWith("```")) {
    const withoutStart = trimmed.slice(3).trimStart();
    if (withoutStart.endsWith("```")) {
      return withoutStart.slice(0, -3).trim();
    }
    return withoutStart;
  }

  return trimmed;
}

/**
 * Download audio from URL with manual timeout (more compatible than AbortSignal.timeout)
 */
async function downloadAudio(audioUrl: string): Promise<Uint8Array | null> {
  console.log(`[fidelity-check] Downloading audio from: ${audioUrl.substring(0, 60)}...`);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    const response = await fetch(audioUrl, {
      method: "GET",
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error(`[fidelity-check] Failed to download audio: ${response.status} ${response.statusText}`);
      return null;
    }

    console.log(`[fidelity-check] Audio download response OK, content-type: ${response.headers.get("content-type") || "unknown"}, content-length: ${response.headers.get("content-length") || "unknown"}`);

    const blob = await response.blob();
    console.log(`[fidelity-check] Audio blob size: ${blob.size} bytes, type: ${blob.type}`);

    const arrayBuffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    console.log(`[fidelity-check] Audio converted to Uint8Array: ${bytes.length} bytes`);
    return bytes;
  } catch (error) {
    console.error("[fidelity-check] Error downloading audio:", error);
    return null;
  }
}

/**
 * Compute fidelity score by comparing audio against transcript using Gemini
 */
async function computeFidelity(
  audioBytes: Uint8Array,
  transcriptText: string
): Promise<FidelityCheckResponse> {
  const out: FidelityCheckResponse = {
    fidelity_score: null,
    fidelity_reasoning: "Not enough audio to score.",
    fidelity_source: "not_scored",
    gemini_raw: "",
  };

  // Check minimum audio size (roughly 1 second at 16kHz mono ~ 32000 bytes for webm)
  if (audioBytes.length <= 16000 || !transcriptText.trim()) {
    console.log(`[fidelity-check] Skipping fidelity check: audio=${audioBytes.length} bytes, transcript=${transcriptText.trim().length} chars`);
    return out;
  }

  try {
    console.log(`[fidelity-check] Calling Gemini model: ${GEMINI_MODEL}`);
    console.log(`[fidelity-check] Transcript length: ${transcriptText.length} chars, Audio: ${audioBytes.length} bytes`);

    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

    const prompt =
      "Listen to this audio and read the provided transcript.\n" +
      "Calculate a 'fidelity_score' (1-100) based on how accurately the transcript captures the core medical facts. " +
      "Ignore minor filler words (um, ah, stutters). Focus ONLY on the integrity of the clinical information.\n\n" +
      `TRANSCRIPT:\n${transcriptText}\n\n` +
      "Return ONLY a valid JSON object in this format:\n" +
      '{"fidelity_score": 99, "reasoning": "Brief explanation"}';

    // Create audio part
    const audioPart = {
      inlineData: {
        data: Buffer.from(audioBytes).toString("base64"),
        mimeType: "audio/webm",
      },
    };

    console.log("[fidelity-check] Sending request to Gemini...");
    const result = await model.generateContent([audioPart, prompt]);
    const response = result.response;
    const rawResponseText = response.text();

    out.gemini_raw = rawResponseText || "";
    console.log(`[fidelity-check] GEMINI RAW RESPONSE: ${rawResponseText}`);

    // Parse JSON response
    const resText = stripJsonFences(rawResponseText || "{}");
    console.log(`[fidelity-check] Stripped JSON: ${resText}`);

    let fidelityData: Record<string, unknown>;
    try {
      fidelityData = JSON.parse(resText);
    } catch (parseError) {
      console.error("[fidelity-check] JSON parse failed:", parseError, "Raw text:", rawResponseText);
      out.fidelity_reasoning = `Gemini returned non-JSON: ${rawResponseText?.substring(0, 200)}`;
      out.fidelity_source = "error";
      return out;
    }

    const parsedScore = fidelityData.fidelity_score;
    console.log(`[fidelity-check] Parsed score from Gemini: ${parsedScore} (type: ${typeof parsedScore})`);

    if (typeof parsedScore === "number") {
      out.fidelity_score = Math.round(parsedScore);
      out.fidelity_source = "gemini";
    } else {
      console.warn(`[fidelity-check] Gemini returned non-numeric score: ${parsedScore}`);
    }

    out.fidelity_reasoning = typeof fidelityData.reasoning === "string" ? fidelityData.reasoning : "Processed.";

    console.log("[fidelity-check] Fidelity result:", {
      score: out.fidelity_score,
      source: out.fidelity_source,
      reasoning: out.fidelity_reasoning?.substring(0, 100),
    });
  } catch (error) {
    console.error("[fidelity-check] Fidelity check failed:", error);
    out.fidelity_reasoning = `Gemini fidelity check failed: ${error instanceof Error ? error.message : String(error)}`;
    out.fidelity_source = "error";
  }

  return out;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  console.log("[fidelity-check] ========== REQUEST START ==========");
  const startTime = Date.now();

  try {
    // Check API key
    if (!process.env.GEMINI_API_KEY) {
      console.error("[fidelity-check] GEMINI_API_KEY not configured");
      return NextResponse.json(
        {
          fidelity_score: null,
          fidelity_reasoning: "Gemini API key not configured",
          fidelity_source: "error",
          gemini_raw: "",
        },
        { status: 500 }
      );
    }

    // Parse request body
    let body: FidelityCheckRequest;
    try {
      body = await request.json();
    } catch (parseError) {
      console.error("[fidelity-check] Failed to parse request body:", parseError);
      return NextResponse.json(
        {
          fidelity_score: null,
          fidelity_reasoning: "Invalid request body",
          fidelity_source: "error",
          gemini_raw: "",
        },
        { status: 400 }
      );
    }

    const { audioUrl, transcriptSegments, speakerLabels = {} } = body;

    console.log("[fidelity-check] Request received:", {
      audioUrl: audioUrl ? `${audioUrl.substring(0, 60)}...` : "MISSING",
      segmentCount: transcriptSegments?.length ?? 0,
      speakerLabelCount: Object.keys(speakerLabels).length,
    });

    if (!audioUrl) {
      console.warn("[fidelity-check] No audio URL provided");
      return NextResponse.json(
        {
          fidelity_score: null,
          fidelity_reasoning: "No audio URL provided",
          fidelity_source: "error",
          gemini_raw: "",
        },
        { status: 400 }
      );
    }

    if (!transcriptSegments || transcriptSegments.length === 0) {
      console.warn("[fidelity-check] No transcript segments provided");
      return NextResponse.json(
        {
          fidelity_score: null,
          fidelity_reasoning: "No transcript segments provided",
          fidelity_source: "not_scored",
          gemini_raw: "",
        },
        { status: 200 }
      );
    }

    // Download audio
    const audioBytes = await downloadAudio(audioUrl);
    if (!audioBytes) {
      console.error("[fidelity-check] Audio download returned null");
      return NextResponse.json(
        {
          fidelity_score: null,
          fidelity_reasoning: "Failed to download audio from URL",
          fidelity_source: "error",
          gemini_raw: "",
        },
        { status: 200 }
      );
    }

    // Build transcript text
    const transcriptText = buildTranscriptText(transcriptSegments, speakerLabels);
    console.log(`[fidelity-check] Built transcript: ${transcriptText.length} chars, ${transcriptSegments.length} segments`);

    if (!transcriptText.trim()) {
      console.warn("[fidelity-check] Empty transcript text after building");
      return NextResponse.json(
        {
          fidelity_score: null,
          fidelity_reasoning: "Empty transcript text",
          fidelity_source: "not_scored",
          gemini_raw: "",
        },
        { status: 200 }
      );
    }

    // Compute fidelity
    const result = await computeFidelity(audioBytes, transcriptText);

    const duration = Date.now() - startTime;
    console.log(`[fidelity-check] ========== REQUEST END (${duration}ms) ==========`);
    console.log("[fidelity-check] Final result:", {
      score: result.fidelity_score,
      source: result.fidelity_source,
      reasoning: result.fidelity_reasoning?.substring(0, 80),
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[fidelity-check] Unexpected error after ${duration}ms:`, error);
    return NextResponse.json(
      {
        fidelity_score: null,
        fidelity_reasoning: `Server error: ${error instanceof Error ? error.message : String(error)}`,
        fidelity_source: "error",
        gemini_raw: "",
      },
      { status: 500 }
    );
  }
}
