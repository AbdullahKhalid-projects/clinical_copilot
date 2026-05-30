/**
 * Encode raw 16-bit PCM into a standard WAV Blob (RIFF/WAVE).
 */
export function encodeWav(
  pcmData: Int16Array,
  sampleRate: number = 16000,
  channels: number = 1
): Blob {
  const numSamples = pcmData.length;
  const bytesPerSample = 2;
  const blockAlign = channels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataChunkSize = numSamples * bytesPerSample;
  const riffChunkSize = 36 + dataChunkSize;

  const buffer = new ArrayBuffer(44 + dataChunkSize);
  const view = new DataView(buffer);
  let offset = 0;

  const writeString = (str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset++, str.charCodeAt(i));
    }
  };

  const writeUint32 = (v: number) => {
    view.setUint32(offset, v, true);
    offset += 4;
  };

  const writeUint16 = (v: number) => {
    view.setUint16(offset, v, true);
    offset += 2;
  };

  // RIFF chunk descriptor
  writeString("RIFF");
  writeUint32(riffChunkSize);
  writeString("WAVE");

  // fmt sub-chunk
  writeString("fmt ");
  writeUint32(16); // Subchunk1Size
  writeUint16(1); // AudioFormat (PCM)
  writeUint16(channels);
  writeUint32(sampleRate);
  writeUint32(byteRate);
  writeUint16(blockAlign);
  writeUint16(16); // BitsPerSample

  // data sub-chunk
  writeString("data");
  writeUint32(dataChunkSize);

  // PCM data
  for (let i = 0; i < numSamples; i++) {
    view.setInt16(offset, pcmData[i], true);
    offset += 2;
  }

  return new Blob([buffer], { type: "audio/wav" });
}

/**
 * Convert Float32 audio samples (range [-1, 1]) to Int16Array.
 */
export function float32ToInt16(input: Float32Array): Int16Array {
  const output = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    output[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return output;
}

/**
 * Read a Blob as a base64 data URL.
 */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      // Strip the data:audio/wav;base64, prefix
      const base64 = result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
