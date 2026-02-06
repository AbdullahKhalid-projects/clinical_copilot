"use client";

import { Calendar, CheckCircle2, ChevronRight, Clock, MapPin, XCircle } from "lucide-react";
import { format, addMinutes } from "date-fns";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ScheduleAppointmentCardProps {
  appt: {
    id: string;
    patientName: string;
    patientId: string;
    startTime: Date;
    durationMins: number; // in minutes
    status: string;
    reason: string;
  };
  onClick: () => void;
}

export function ScheduleAppointmentCard({ appt, onClick }: ScheduleAppointmentCardProps) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case "COMPLETED": return "bg-green-50 hover:bg-green-100 border-green-200";
      case "IN_PROGRESS": return "bg-blue-50 hover:bg-blue-100 border-blue-200";
      case "CANCELLED": return "bg-red-50 hover:bg-red-100 border-red-200";
      default: return "bg-card hover:bg-muted/50 border-input";
    }
  };

  const statusColor = getStatusColor(appt.status);
  const initials = appt.patientName.split(' ').map(n => n[0]).join('').substring(0, 2);

  return (
    <div 
      onClick={onClick}
      className={cn(
        "group flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all mb-2 shadow-sm",
        statusColor
      )}
    >
      <div className="flex items-center gap-4">
        {/* Time Column */}
        <div className="flex flex-col items-center justify-center w-16 text-center border-r pr-3 border-border/50">
            <span className="text-sm font-bold text-foreground">
                {format(new Date(appt.startTime), "h:mm a")}
            </span>
            <span className="text-xs text-muted-foreground">
                {appt.durationMins}m
            </span>
        </div>

        {/* Patient Info */}
        <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10 border border-input">
                <AvatarFallback className="bg-background text-foreground text-xs">
                    {initials}
                </AvatarFallback>
            </Avatar>
            
            <div className="flex flex-col">
                <span className="font-semibold text-sm text-foreground">{appt.patientName}</span>
                <span className="text-xs text-muted-foreground">{appt.reason}</span>
            </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Badge variant="outline" className="bg-background/50 backdrop-blur-sm">
            {appt.status}
        </Badge>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground group-hover:text-primary">
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
