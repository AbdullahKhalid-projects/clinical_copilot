import { getPatientVisitSummaries } from "@/app/actions/fetchers";
import { VisitSummariesDashboard } from "./visit-summaries-dashboard";

export default async function VisitSummariesPage() {
  const summaries = await getPatientVisitSummaries();

  return <VisitSummariesDashboard initialSummaries={summaries} />;
}
