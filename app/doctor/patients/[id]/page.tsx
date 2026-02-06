// Page Component (Server Side)
import { getPatientProfile } from "@/app/actions/doctorActions";
import { notFound } from "next/navigation";
import PatientDetailsClient from "./patient-details-client";

interface PageProps {
  params: Promise<{
    id: string; // The patientId (User ID or Profile ID depending on route) 
  }>;
}

export default async function PatientDetailsPage({ params }: PageProps) {
  // Wait f params (Next.js 15+ convention, but safer to just use params.id if standard Next 14)
  // Actually in recent versions params can be awaited
  const { id } = await params;

  // We need to implement getPatientProfile in doctorActions
  const patient = await getPatientProfile(id);

  if (!patient) {
    notFound();
  }

  return <PatientDetailsClient patient={patient} />;
}
