// Server Component
import { getDoctorDashboardData } from "@/app/actions/doctorActions";
import DashboardClient from "./dashboard-client";

export default async function DoctorDashboardPage() {
  try {
    const data = await getDoctorDashboardData();
    
    // If no data (meaning user might not be a doctor or not found), handle gracefully
    if (!data) {
       return (
         <div className="p-8 text-center">
            <h1 className="text-2xl font-bold text-red-600">Access Denied</h1>
            <p className="mt-2 text-muted-foreground">
              You do not have a registered doctor profile. Please contact support.
            </p>
         </div>
       );
    }
    
    return <DashboardClient initialData={data} />;
  } catch (error) {
    // If it's an authorization error or other
    console.error("Dashboard error:", error);
    return (
        <div className="p-8 text-center">
           <p className="text-muted-foreground">
             Please sign in as a doctor to view this dashboard.
           </p>
        </div>
    );
  }
}
