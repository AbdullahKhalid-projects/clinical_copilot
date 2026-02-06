// Page Component (Server Side)
import { getDoctorPatients } from "@/app/actions/doctorActions";
import PatientsClient from "./patients-client";

export default async function PatientsPage() {
  try {
    const patients = await getDoctorPatients();
    
    return <PatientsClient patients={patients} />;
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
