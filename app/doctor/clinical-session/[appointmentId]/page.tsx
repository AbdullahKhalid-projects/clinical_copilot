import { notFound } from "next/navigation";
import { getClinicalSessionData } from "../actions";
import { ClinicalSessionClient } from "./client";

interface PageProps {
  params: Promise<{
    appointmentId: string;
  }>;
}

export default async function ClinicalSessionPage({ params }: PageProps) {
  const { appointmentId } = await params;
  console.log("Page received appointmentId:", appointmentId);
  const appointment = await getClinicalSessionData(appointmentId);

  if (!appointment) {
    console.log("Appointment not found, rendering 404");
    notFound();
  }

  return <ClinicalSessionClient appointment={appointment} />;
}
