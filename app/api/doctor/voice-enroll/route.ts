import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Adjust your auth import as necessary
// import { currentUser } from "@clerk/nextjs"; 

export async function POST(req: Request) {
  try {
    // 1. Authenticate user
    // const user = await currentUser();
    // if (!user) return new NextResponse("Unauthorized", { status: 401 });
    
    // For now, assuming you have the doctorId in the request or session:
    const formData = await req.formData();
    const file = formData.get("audio") as Blob;
    const doctorId = formData.get("doctorId") as string; // Change logic based on your auth setup

    if (!file || !doctorId) {
      return new NextResponse("Missing audio file or doctor ID", { status: 400 });
    }

    // 2. Store enrollment sample in Prisma.
    // Modal will derive embedding from this sample when transcription starts.
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!bytes.length) {
      return NextResponse.json({ error: "Empty audio file." }, { status: 400 });
    }
    const audioBase64 = Buffer.from(bytes).toString("base64");
    const enrollmentPayload = {
      type: "audio_sample",
      mimeType: file.type || "audio/webm",
      encoding: "base64",
      data: audioBase64,
      capturedAt: new Date().toISOString(),
    };

    // 3. Save into VoiceEmbedding table
    await prisma.voiceEmbedding.upsert({
      where: { doctorId },
      update: { embeddingData: enrollmentPayload },
      create: { doctorId, embeddingData: enrollmentPayload },
    });

    return NextResponse.json({
      success: true,
      message: "Voice sample enrolled successfully.",
    });
  } catch (error: unknown) {
    console.error("[VOICE_ENROLL_ERROR]", error);
    const message = error instanceof Error ? error.message : "Internal Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}