const FALLBACK_NEO4J_PATIENT_ID = "38cc16ef-8b17-4841-985e-bdafe4c92e37";

export function resolveNeo4jPatientGraphId(args?: {
  appointmentPatientId?: string | null;
  patientProfileId?: string | null;
  patientUserId?: string | null;
}): string {
  void args;

  const explicitGraphPatientId = process.env.NEO4J_PATIENT_ID?.trim();
  if (explicitGraphPatientId) {
    return explicitGraphPatientId;
  }
  return FALLBACK_NEO4J_PATIENT_ID;
}
