"use client";

import React from "react";
import { format, isSameDay, addMinutes, startOfToday } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Calendar as CalendarIcon, 
  MapPin, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  AlertCircle 
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ScheduleAppointmentCard } from "@/components/schedule-appointment-card";

interface Appointment {
  id: string;
  patientName: string;
  patientId: string;
  startTime: Date;
  durationMins: number; // in minutes
  status: string;
  reason: string;
}

interface ScheduleTimelineProps {
  date: Date;
  appointments: Appointment[];
}

export function ScheduleTimeline({ date, appointments }: ScheduleTimelineProps) {
  const router = useRouter();
  
  // Create an array of hours for the day (e.g., 8 AM to 6 PM)
  const hours = Array.from({ length: 11 }, (_, i) => i + 8); // 8, 9, ... 18 (6PM)

  return (
    <div className="flex flex-col h-full bg-card rounded-lg border shadow-sm overflow-hidden">
      <div className="p-4 border-b bg-card z-10 sticky top-0">
        <h2 className="text-xl font-semibold flex items-center gap-2">
           {format(date, "EEEE, MMMM do")}
           {isSameDay(date, new Date()) && <Badge>Today</Badge>}
        </h2>
        <p className="text-muted-foreground text-sm mt-1">
          {appointments.length} appointments scheduled
        </p>
      </div>

      <ScrollArea className="flex-1 h-[600px]">
        <div className="relative min-w-[600px]"> 
          {/* Time Grid */}
          <div className="absolute top-0 left-0 w-16 border-r h-full bg-muted/30" />
          
          <div className="py-4">
            {hours.map((hour) => {
              // Get appointments starting in this hour
              const hourAppts = appointments.filter(appt => {
                  const apptHour = new Date(appt.startTime).getHours();
                  return apptHour === hour;
              });

              return (
                <div key={hour} className="flex group min-h-[100px]">
                  {/* Time Label */}
                  <div className="w-16 flex-shrink-0 flex justify-center pt-2 text-sm font-medium text-muted-foreground">
                    {format(new Date().setHours(hour, 0), "h a")}
                  </div>

                  {/* Slot Content */}
                  <div className="flex-1 border-t relative px-4 py-2 group-last:border-b">
                    {hourAppts.length > 0 ? (
                      <div className="space-y-2">
                        {hourAppts.map(appt => (
                           <ScheduleAppointmentCard 
                              key={appt.id}
                              appt={appt}
                              onClick={() => router.push(`/doctor/patients/${appt.patientId}`)}
                           />
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
                 