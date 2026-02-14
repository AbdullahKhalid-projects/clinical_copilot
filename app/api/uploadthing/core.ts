import { createUploadthing, type FileRouter } from "uploadthing/next";
import { currentUser } from "@clerk/nextjs/server";

const f = createUploadthing();

const handleAuth = async () => {
  const user = await currentUser();
  if (!user) throw new Error("Unauthorized");
  return { userId: user.id };
};

// FileRouter for your app, can contain multiple FileRoutes
export const ourFileRouter = {
  // Define as many FileRoutes as you like, each with a unique routeSlug
  
  // Endpoint specifically for audio recordings (MP3/WAV from browser)
  audioUploader: f({ audio: { maxFileSize: "16MB" } })
    .middleware(async () => await handleAuth())
    .onUploadComplete(async ({ metadata, file }) => {
      // This code RUNS ON YOUR SERVER after upload
      console.log("Audio Upload complete for userId:", metadata.userId);
      console.log("file url", file.url);
    }),

  // Endpoint for PDF attachments (e.g. SOAP notes if generated as PDF)
  pdfUploader: f({ pdf: { maxFileSize: "8MB" } })
    .middleware(async () => await handleAuth())
    .onUploadComplete(async ({ metadata, file }) => {
      console.log("PDF Upload complete for userId:", metadata.userId);
    }),
    
} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter;
