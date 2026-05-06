import { UTApi, UTFile } from "uploadthing/server";

const utapi = new UTApi();

export type UploadVisitSummaryPdfInput = {
  filename: string;
  pdfBuffer: Buffer;
};

export async function uploadVisitSummaryPdf(input: UploadVisitSummaryPdfInput): Promise<string | null> {
  try {
    const file = new UTFile([input.pdfBuffer], input.filename, {
      type: "application/pdf",
    });

    const result = await utapi.uploadFiles(file, {
      contentDisposition: "attachment",
      acl: "public-read",
    });

    if (result.error || !result.data) {
      console.error("UploadThing PDF upload returned no data", result.error);
      return null;
    }

    return result.data.ufsUrl || result.data.appUrl || result.data.url || null;
  } catch (error) {
    console.error("Failed to upload visit summary PDF to UploadThing", error);
    return null;
  }
}
