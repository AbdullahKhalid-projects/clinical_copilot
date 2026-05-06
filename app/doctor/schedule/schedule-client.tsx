"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { ScheduleTimeline } from "@/components/schedule-timeline";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { CalendarDays } from "lucide-react";

interface ScheduleClientProps {
  initialDate: Date;
  appointments: any[];
}

export default function ScheduleClient({ initialDate, appointments }: ScheduleClientProps) {
  const router = useRouter();
  
  const [date, setDate] = useState<Date | undefined>(initialDate);
  const [open, setOpen] = useState(false);

  const handleSelectDate = (newDate: Date | undefined) => {
    if (newDate) {
      setDate(newDate);
      router.push(`/doctor/schedule?date=${format(newDate, "yyyy-MM-dd")}`);
      setOpen(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-100px)] space-y-6 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight text-primary">My Schedule</h1>
        
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="secondary" className="gap-2">
              <CalendarDays className="h-4 w-4" />
              Calendar & Details
            </Button>
          </SheetTrigger>
          <SheetContent side="right">
            <SheetHeader>
              <SheetTitle>Select Date</SheetTitle>
            </SheetHeader>
            <div className="mt-6 flex flex-col gap-6 items-center">
              <Calendar
                mode="single"
                selected={date}
                onSelect={handleSelectDate}
                className="rounded-md border shadow-sm"
              />
              <p className="text-sm text-muted-foreground text-center">
                 Select a date to view appointments for that day.
              </p>
            </div>
          </SheetContent>
        </Sheet>
      </div>

      <div className="flex-1 min-h-0 border rounded-xl overflow-hidden bg-background shadow-sm">
         <ScheduleTimeline 
           date={date || new Date()} 
           appointments={appointments} 
         />
      </div>
    </div>
  );
}
