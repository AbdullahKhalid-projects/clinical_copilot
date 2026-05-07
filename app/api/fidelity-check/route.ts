import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

// Initialize Gemini client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

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
 * Download audio from URL and convert to bytes
 */
async function downloadAudio(audioUrl: string): Promise<Uint8Array | null> {
  try {
    const response = await fetch(audioUrl, {
      method: "GET",
      // Add a timeout
      signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) {
      console.error(`[fidelity-check] Failed to download audio: ${response.status} ${response.statusText}`);
      return null;
    }

    const blob = await response.blob();
    const arrayBuffer = await blob.arrayBuffer();
    return new Uint8Array(arrayBuffer);
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

  // Check minimum audio size (roughly 1 second at 16kHz mono)
  if (audioBytes.length <= 16000 || !transcriptText.trim()) {
    return out;
  }

  try {
    console.log("[fidelity-check] Sending audio to Gemini for fidelity check...");

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

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
        mimeType: "audio/webm", // Assuming webm from UploadThing, Gemini will handle it
      },
    };

    const result = await model.generateContent([audioPart, prompt]);
    const response = result.response;
    const rawResponseText = response.text();

    out.gemini_raw = rawResponseText || "";

    // Parse JSON response
    const resText = stripJsonFences(rawResponseText || "{}");
    const fidelityData = JSON.parse(resText);
    const parsedScore = fidelityData.fidelity_score;

    if (typeof parsedScore === "number") {
      out.fidelity_score = Math.round(parsedScore);
      out.fidelity_source = "gemini";
    }
    out.fidelity_reasoning = fidelityData.reasoning || "Processed.";

    console.log("[fidelity-check] Gemini response:", {
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
  try {
    // Check API key
    if (!process.env.GEMINI_API_KEY) {
      console.error("[fidelity-check] GEMINI_API_KEY not configured");
      return NextResponse.json(
        {
          fidelity_score: null,
          fidelity_reasoning: "Gemini API key not configured",
          fidelity_source: "error",
        },
        { status: 500 }
      );
    }

    // Parse request body
    const body: FidelityCheckRequest = await request.json();
    const { audioUrl, transcriptSegments, speakerLabels = {} } = body;

    if (!audioUrl) {
      return NextResponse.json(
        {
          fidelity_score: null,
          fidelity_reasoning: "No audio URL provided",
          fidelity_source: "error",
        },
        { status: 400 }
      );
    }

    if (!transcriptSegments || transcriptSegments.length === 0) {
      return NextResponse.json(
        {
          fidelity_score: null,
          fidelity_reasoning: "No transcript segments provided",
          fidelity_source: "not_scored",
        },
        { status: 200 }
      );
    }

    console.log("[fidelity-check] Starting fidelity check:", {
      audioUrl: audioUrl.substring(0, 50) + "...",
      segmentCount: transcriptSegments.length,
    });

    // Download audio
    const audioBytes = await downloadAudio(audioUrl);
    if (!audioBytes) {
      return NextResponse.json(
        {
          fidelity_score: null,
          fidelity_reasoning: "Failed to download audio from URL",
          fidelity_source: "error",
        },
        { status: 200 }
      );
    }

    console.log(`[fidelity-check] Downloaded ${audioBytes.length} bytes of audio`);

    // Build transcript text
    const transcriptText = buildTranscriptText(transcriptSegments, speakerLabels);

    if (!transcriptText.trim()) {
      return NextResponse.json(
        {
          fidelity_score: null,
          fidelity_reasoning: "Empty transcript text",
          fidelity_source: "not_scored",
        },
        { status: 200 }
      );
    }

    // Compute fidelity
    const result = await computeFidelity(audioBytes, transcriptText);

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error("[fidelity-check] Unexpected error:", error);
    return NextResponse.json(
      {
        fidelity_score: null,
        fidelity_reasoning: `Server error: ${error instanceof Error ? error.message : String(error)}`,
        fidelity_source: "error",
      },
      { status: 500 }
    );
  }
}
