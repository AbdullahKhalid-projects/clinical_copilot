// Page Component (Server Side)
import { getDoctorPatients } from "@/app/actions/doctorActions";
import PatientsClient from "./patients-client";

function pickSearchParam(
  value: string | string[] | undefined,
): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

export default async function PatientsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  try {
    const resolvedSearchParams = (await searchParams) ?? {};
    const mode = pickSearchParam(resolvedSearchParams.mode);
    const appointmentId = pickSearchParam(resolvedSearchParams.appointmentId);
    const returnTo = pickSearchParam(resolvedSearchParams.returnTo);

    const linkMode = {
      enabled: mode === "link",
      appointmentId: appointmentId ?? "",
      returnTo: returnTo ?? "",
    };

    const patients = await getDoctorPatients();
    
    return <PatientsClient patients={patients} linkMode={linkMode} />;
  } catch (error) {
    console.error("Failed to load patients", error);
    return (
        <div className="p-8">
            <h1 className="text-2xl font-bold mb-4">My Patients</h1>
            <div className="p-4 border border-red-200 bg-red-50 text-red-800 rounded">
                Failed to load patients. Please try again later.
            </div>
        </div>
    );
  }
}
