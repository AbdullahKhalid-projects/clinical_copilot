import { getPatientReports } from "@/app/actions/fetchers";
import { ReportsDashboard } from "./reports-dashboard";

export default async function ReportsPage() {
    const reports = await getPatientReports();

    return <ReportsDashboard initialReports={reports} />;
}
