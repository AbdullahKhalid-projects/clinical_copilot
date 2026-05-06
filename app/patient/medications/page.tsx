import { getPatientMedications } from "@/app/actions/fetchers"
import MedicationsList from "@/components/medications-list"

export default async function MedicationsPage() {
  const medications = await getPatientMedications()

  return (
    <div className="space-y-6">
       <MedicationsList initialMedications={medications} />
    </div>
  )
}
