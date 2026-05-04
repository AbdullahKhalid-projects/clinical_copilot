import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const GEMMA_BASE_URL =
  process.env.GEMMA_BASE_URL?.trim() ||
  "https://muddasirjaved666--example-gemma-4-e2b-autoround-it-infer-780f02.modal.run/v1";
const GEMMA_API_KEY = "sk-dummy-anything";
const GEMMA_MODEL =
  process.env.GEMMA_MODEL?.trim() || "cyankiwi/gemma-4-E4B-it-AWQ-INT4";

const openai = new OpenAI({
  baseURL: GEMMA_BASE_URL,
  apiKey: GEMMA_API_KEY,
});

async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function buildUrduPrompt(hasPreviousContext: boolean, formattedRules: string) {
  return `آپ ایک ماہر میڈیکل ٹرانسکرپشنسٹ (medical transcriptionist) ہیں جو ڈاکٹر اور مریض کے مشوروں کو تحریر کرنے میں مہارت رکھتے ہیں۔
آپ کا کام آڈیو سن کر بالکل درست اور بولنے والے کی شناخت (speaker-diarized) کے ساتھ ٹرانسکرپٹ تیار کرنا ہے۔

انتہائی اہم زبان کی شرط (اس پر عمل کرنا لازمی ہے):
- آپ کو آڈیو کو صرف اور صرف اردو زبان اور معیاری 'اردو رسم الخط' میں ٹرانسکرائب کرنا ہے۔
- ہندی یا دیوناگری رسم الخط کا استعمال ہرگز نہ کریں۔ اگرچہ لہجہ ہندی جیسا محسوس ہو، تب بھی آؤٹ پٹ سختی سے صرف اردو رسم الخط میں ہونی چاہیے۔
- اگر کوئی معیاری طبی اصطلاح (medical terminology) انگریزی میں بولی گئی ہے تو اسے انگریزی میں ہی رہنے دیں، لیکن باقی سب کچھ اردو میں لکھیں۔

بولنے والے کی شناخت اور آڈیو چنکس کے لازمی اصول (انتہائی اہم):
${formattedRules}

SPEAKER IDENTIFICATION (بولنے والے کی شناخت):
- 'doctor' = کلینیشن (ڈاکٹر) جو سوالات پوچھ رہا ہے، ہدایات دے رہا ہے یا مشاہدات بتا رہا ہے۔
- 'patient' = وہ شخص جو سوالات کا جواب دے رہا ہے، علامات بیان کر رہا ہے یا ردعمل دے رہا ہے۔

OUTPUT FORMAT (آؤٹ پٹ کا فارمیٹ):
صرف اور صرف ایک درست JSON object واپس کریں جس میں ایک ہی key "segments" ہو اور اس میں objects کی ایک array ہو۔ کوئی مارک ڈاؤن (markdown) فارمیٹنگ استعمال نہ کریں۔
مثال:
{
  "segments":[
    {"type":"doctor","text":"آپ کا نام کیا ہے؟"},
    {"type":"patient","text":"میرا نام احمد ہے۔"},
    {"type":"doctor","text":"ٹھیک ہے، کیا آپ کو درد محسوس ہوتا ہے؟"}
  ]
}`;
}

function buildEnglishPrompt(
  hasPreviousContext: boolean,
  formattedRules: string,
) {
  return `You are an expert medical transcriptionist specializing in doctor-patient consultations.
Your job is to listen to the audio and produce a perfectly accurate, speaker-diarized transcript — capturing every word exactly as spoken.

CRITICAL LANGUAGE REQUIREMENT:
- Transcribe the audio SOLELY in English.
- Use standard English spelling and grammar.
- Retain any medical terminology exactly as spoken (e.g., "hypertension", "metformin").
- Do NOT paraphrase, summarize, clean up, or correct the speech. Transcribe every "um", "uh", false start, and repetition verbatim.

MANDATORY RULES FOR SPEAKER DIARIZATION AND CHUNK CONTINUITY:
${formattedRules}

SPEAKER IDENTIFICATION:
- 'doctor' = The clinician asking questions, giving instructions, or stating clinical observations.
- 'patient' = The person answering questions, describing symptoms, or reacting.

OUTPUT FORMAT:
Return ONLY a valid JSON object with a single key "segments" containing an array of objects. Do NOT use markdown formatting (no \`\`\`json fences). No extra keys, no commentary.
Example:
{
  "segments":[
    {"type":"doctor","text":"What brings you in today?"},
    {"type":"patient","text":"I've been having this chest pain, uh, for about three days."},
    {"type":"doctor","text":"Okay, and does the pain radiate anywhere?"}
  ]
}`;
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const audioFile = formData.get("audio");
    const contextJson = formData.get("context");
    const language =
      formData.get("language") === "english" ? "english" : "urdu";

    if (!(audioFile instanceof File)) {
      return NextResponse.json(
        { error: "Missing audio file" },
        { status: 400 },
      );
    }

    const base64Audio = await fileToBase64(audioFile);

    let previousContext = "";
    let hasPreviousContext = false;

    if (typeof contextJson === "string" && contextJson.trim()) {
      try {
        const ctx = JSON.parse(contextJson) as Array<{
          type: string;
          text: string;
        }>;
        if (Array.isArray(ctx) && ctx.length > 0) {
          const lastMsg = ctx[ctx.length - 1];
          previousContext =
            `--- CONTEXT OF PREVIOUS CHUNK ---\n` +
            `Last Speaker: ${lastMsg.type}\n` +
            `Last Words: "${lastMsg.text}"\n` +
            `--- END OF CONTEXT ---\n\n` +
            `STRICT INSTRUCTION: If the new audio starts by completing the "Last Words" above, you MUST use the same "Last Speaker" for the beginning of this transcript.`;
          hasPreviousContext = true;
        }
      } catch {
        // ignore invalid context
      }
    }

    let rules: string[];
    let userText: string;

    if (language === "english") {
      rules = [
        "ZERO TOLERANCE FOR MERGING: Never combine two different speakers into a single JSON element. The moment one speaker finishes and another begins — even mid-exchange — create a NEW segment immediately.",
        'QUESTION-ANSWER BOUNDARIES (CRITICAL): Pay close attention to the conversational flow. If a patient answers a question and the doctor immediately follows with another question, you MUST create a new segment for the doctor. Merging a patient answer and a doctor question into one segment is a severe error.\n   - WRONG (merged): {"type": "patient", "text": "No, I feel okay. And does the pain get worse when you lie down?"}\n   - CORRECT (split): {"type": "patient", "text": "No, I feel okay."}, {"type": "doctor", "text": "And does the pain get worse when you lie down?"}',
        "CHUNK BOUNDARY WARNING: Audio is sent in 28-second clips. Sentences WILL be cut off at the boundary. Your primary responsibility is to correctly identify whether the first words of this chunk are a continuation of the previous speaker or the start of a new one.",
        'VERBATIM ACCURACY: Transcribe every single spoken word. Do not omit, summarize, or rephrase anything. Preserve all filler words ("um", "uh", "like"), false starts, and repetitions exactly as heard.',
        "INTERRUPTIONS: If a speaker is cut off mid-sentence by the other, close the interrupted speaker's segment at the point of interruption, open a new segment for the interrupter, then open another new segment when the original speaker resumes.",
      ];

      if (hasPreviousContext) {
        rules.push(
          "CONTEXT BRIDGING (CRITICAL): You are provided with the very last message from the previous audio chunk as reference. If the current audio begins mid-sentence or mid-phrase, it is likely the continuation of that last speaker's cut-off sentence. You MUST assign those opening words to the same speaker as the 'Last Speaker' in the context, and seamlessly complete their thought before switching speakers if the audio continues beyond that.",
        );
      }

      const formattedRules = rules
        .map((rule, index) => `${index + 1}. ${rule}`)
        .join("\n");

      const systemPromptText = buildEnglishPrompt(
        hasPreviousContext,
        formattedRules,
      );

      userText = hasPreviousContext
        ? `${previousContext}\n\nTask: Transcribe the current audio clip. Ensure the transition from the previous context into this chunk is seamless and the correct speaker is assigned to any bridging words.`
        : "Transcribe this medical consultation audio clip.";

      const combinedPrompt = `${systemPromptText}\n\n${userText}`;

      const response = await openai.chat.completions.create({
        model: GEMMA_MODEL,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: combinedPrompt },
              {
                type: "input_audio",
                input_audio: {
                  data: base64Audio,
                  format: "wav",
                },
              } as any,
            ],
          },
        ],
        max_tokens: 8000,
        temperature: 0,
        response_format: { type: "json_object" },
      });

      const rawContent = response.choices[0]?.message?.content || "{}";
      let parsedData: { segments: Array<{ type: string; text: string }> };
      try {
        parsedData = JSON.parse(rawContent);
      } catch (parseError) {
        console.error("Failed to parse JSON from response:", rawContent);
        return NextResponse.json(
          { error: "Model returned invalid JSON" },
          { status: 502 },
        );
      }

      const rawSegments = Array.isArray(parsedData.segments)
        ? parsedData.segments
        : [];
      const segments = rawSegments.map((seg) => ({
        type: seg.type?.toLowerCase() === "doctor" ? "doctor" : "patient",
        text: String(seg.text ?? "").trim(),
      }));

      return NextResponse.json({ segments });
    }

    // Urdu mode (remains untouched as requested)
    rules = [
      "دو مختلف بولنے والوں کی گفتگو کو کبھی بھی ایک ہی element میں نہ ملائیں۔ یہ ایک بہت بڑی غلطی تصور ہوگی۔",
      'سوال و جواب کے تسلسل پر نظر رکھیں: اگر مریض کسی سوال کا جواب دیتا ہے اور ڈاکٹر فوراً اگلا سوال پوچھتا ہے، تو آپ کو ڈاکٹر کے لیے ایک نیا (NEW) element بنانا لازمی ہے۔\n   - غلط (ملا ہوا): {"type": "patient", "text": "نہیں، ٹھیک ہے۔ اور کیا لیٹنے کے علاوہ کوئی اور چیز ہے جو درد کو بڑھاتی ہے؟"}\n   - درست (الگ الگ): {"type": "patient", "text": "نہیں، ٹھیک ہے۔"}, {"type": "doctor", "text": "اور کیا لیٹنے کے علاوہ کوئی اور چیز ہے جو درد کو بڑھاتی ہے؟"}',
      "CHUNK BOUNDARY & CUT-OFF SENTENCES (آڈیو چنک اور کٹے ہوئے جملوں کی وارننگ): آڈیو آپ کو 28 سیکنڈ کے چھوٹے کلپس (chunks) میں بھیجی جا رہی ہے۔ اس بات کا قوی امکان ہے کہ 28 سیکنڈ پورے ہونے پر ڈاکٹر یا مریض کا کوئی جملہ درمیان میں ہی کٹ گیا ہو۔",
    ];

    if (hasPreviousContext) {
      rules.push(
        "CONTEXT OF LAST MESSAGE (پچھلے میسج کا سیاق و سباق): آپ کو ریفرنس کے طور پر پچھلے آڈیو حصے کا صرف آخری میسج (پچھلے 2 نہیں، صرف بالکل آخری میسج) فراہم کیا جائے گا۔ آپ نے اس بات کا خاص خیال رکھنا ہے کہ اگر موجودہ آڈیو کلپ میں کوئی جملہ بیچ میں سے شروع ہو رہا ہے، تو وہ پچھلے میسج کے کٹے ہوئے جملے کا بقیہ حصہ ہو سکتا ہے۔ اسے پچھلے میسج سے جوڑ کر درست سیاق و سباق اور درست بولنے والے (type) کے ساتھ مکمل کریں۔",
      );
    }

    rules.push(
      "ہر JSON element صرف ایک شخص کی لگار گفتگو کو ظاہر کرتا ہے۔",
      "ڈاکٹر سوالات پوچھتا ہے اور ہدایات دیتا ہے۔ مریض جواب دیتا ہے اور اپنی علامات بیان کرتا ہے۔",
      "جب دوسرا شخص بولنا شروع کرے تو فوراً ایک نیا element بنائیں۔ آپس کی بات چیت کو ایک ہی بلاک میں ہرگز اکٹھا نہ کریں۔",
      "بولا گیا ہر ایک لفظ ٹرانسکرائب کریں۔ کوئی لفظ نہ چھوڑیں، نہ خلاصہ کریں اور نہ ہی اپنے الفاظ میں بیان کریں۔",
      "آڈیو کے عین مطابق الفاظ استعمال کریں۔ جو کہا گیا ہے اسے 'درست' کرنے کی کوشش نہ کریں۔",
    );

    const formattedRules = rules
      .map((rule, index) => `${index + 1}. ${rule}`)
      .join("\n");

    const systemPromptText = buildUrduPrompt(
      hasPreviousContext,
      formattedRules,
    );

    userText = hasPreviousContext
      ? previousContext + " ٹرانسکرپٹ کو وہیں سے جاری رکھیں جہاں سے یہ رکی تھی۔"
      : "اس مشاورتی آڈیو کو ٹرانسکرائب کریں۔";

    const combinedPrompt = `${systemPromptText}\n\n${userText}`;

    const response = await openai.chat.completions.create({
      model: GEMMA_MODEL,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: combinedPrompt },
            {
              type: "input_audio",
              input_audio: {
                data: base64Audio,
                format: "wav",
              },
            } as any,
          ],
        },
      ],
      temperature: 0,
      max_tokens: 8000,
      response_format: { type: "json_object" },
    });
    console.log(response);
    const rawContent = response.choices[0]?.message?.content || "{}";
    let parsedData: { segments: Array<{ type: string; text: string }> };
    try {
      parsedData = JSON.parse(rawContent);
    } catch (parseError) {
      console.error("Failed to parse JSON from response:", rawContent);
      return NextResponse.json(
        { error: "Model returned invalid JSON" },
        { status: 502 },
      );
    }

    const rawSegments = Array.isArray(parsedData.segments)
      ? parsedData.segments
      : [];
    const segments = rawSegments.map((seg) => ({
      type: seg.type?.toLowerCase() === "doctor" ? "doctor" : "patient",
      text: String(seg.text ?? "").trim(),
    }));

    return NextResponse.json({ segments });
  } catch (err: any) {
    console.error("[/api/transcribe-chunk] Error:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 },
    );
  }
}
