import { createUploadthing, type FileRouter } from "uploadthing/next";
import { currentUser } from "@clerk/nextjs/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

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
    .input(z.object({ appointmentId: z.string().uuid() }))
    .middleware(async ({ input }) => {
      const auth = await handleAuth();
      return {
        ...auth,
        appointmentId: input.appointmentId,
      };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      // This code RUNS ON YOUR SERVER after upload
      console.log("Audio Upload complete for userId:", metadata.userId);
      const recordingUrl = file.ufsUrl || file.appUrl || file.url;

      const appointment = await prisma.appointment.findFirst({
        where: {
          id: metadata.appointmentId,
          doctor: {
            is: {
              user: {
                clerkId: metadata.userId,
              },
            },
          },
        },
        select: { id: true },
      });

      if (!appointment) {
        throw new Error("Appointment not found or not accessible for this doctor");
      }

      await prisma.appointment.update({
        where: { id: appointment.id },
        data: {
          recordingUrl,
          status: "IN_PROGRESS",
          aiStatus: "PROCESSING",
        },
      });

      return {
        appointmentId: appointment.id,
        recordingUrl,
      };
    }),

  // Endpoint for PDF attachments (e.g. SOAP notes if generated as PDF)
  pdfUploader: f({ pdf: { maxFileSize: "8MB" } })
    .middleware(async () => await handleAuth())
    .onUploadComplete(async ({ metadata, file }) => {
      console.log("PDF Upload complete for userId:", metadata.userId);
    }),
    
} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter;
