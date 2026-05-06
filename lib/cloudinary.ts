import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export type UploadVisitSummaryPdfInput = {
  filename: string;
  pdfBuffer: Buffer;
};

export async function uploadVisitSummaryPdfToCloudinary(
  input: UploadVisitSummaryPdfInput
): Promise<string | null> {
  try {
    const base64String = input.pdfBuffer.toString("base64");
    const dataUri = `data:application/pdf;base64,${base64String}`;

    const result = await cloudinary.uploader.upload(dataUri, {
      resource_type: "raw",
      public_id: input.filename.replace(/\.pdf$/i, ""),
    });

    return result?.secure_url || null;
  } catch (error) {
    console.error("Failed to upload visit summary PDF to Cloudinary", error);
    return null;
  }
}
