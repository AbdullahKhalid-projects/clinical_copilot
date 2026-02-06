// Page Component (Server Side)
import { getDoctorSchedule } from "@/app/actions/doctorActions";
import ScheduleClient from "./schedule-client";

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function SchedulePage({ searchParams }: PageProps) {
  // Await searchParams for Next.js 15+ compat
  const params = await searchParams;
  const dateStr = typeof params?.date === 'string' ? params.date : undefined;
  
  // If no date provided, defaults to today in action
  const appointments = await getDoctorSchedule(dateStr);
  const initialDate = dateStr ? new Date(dateStr) : new Date();

  return (
    <ScheduleClient 
        initialDate={initialDate} 
        appointments={appointments} 
    />
  );
}
