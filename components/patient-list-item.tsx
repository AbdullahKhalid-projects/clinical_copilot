"use client";

import { Calendar, ChevronRight, Clock, User } from "lucide-react";
import { format } from "date-fns";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface PatientListItemProps {
  patient: {
    id: string;
    name: string;
    initials: string;
    email: string;
    phone: string | null;
    dateOfBirth: Date | null;
    gender: string | null;
    lastVisit: Date | null;
    nextAppointment: Date | null;
    status: "Upcoming" | "Past";
    condition: string | null;
  };
  onClick: () => void;
}

export function PatientListItem({ patient, onClick }: PatientListItemProps) {
  const isUpcoming = patient.status === "Upcoming";

  return (
    <div 
      onClick={onClick}
      className={cn(
        "group flex items-center justify-between p-4 bg-card hover:bg-muted/50 border rounded-lg transition-all cursor-pointer",
        isUpcoming ? "border-l-4 border-l-primary" : "border"
      )}
    >
      <div className="flex items-center gap-4">
        <Avatar className={cn("h-12 w-12 border-2", isUpcoming ? "border-primary" : "border-transparent")}>
          <AvatarFallback className={cn(isUpcoming ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
            {patient.initials}
          </AvatarFallback>
        </Avatar>
        
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-lg leading-none">{patient.name}</h3>
            {isUpcoming && (
              <Badge variant="default" className="text-[10px] h-5 px-1.5">
                Upcoming
              </Badge>
            )}
            {patient.condition && (
                <Badge variant="outline" className="text-[10px] h-5 px-1.5 font-normal text-muted-foreground">
                    {patient.condition}
                </Badge>
            )}
          </div>
          
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            {patient.gender && <span>{patient.gender}</span>}
            {patient.dateOfBirth && (
                <>
                    <span className="w-1 h-1 rounded-full bg-muted-foreground/40" />
                    <span>{new Date().getFullYear() - new Date(patient.dateOfBirth).getFullYear()} yrs</span>
                </>
            )}
            <span className="w-1 h-1 rounded-full bg-muted-foreground/40" />
            <span>{patient.email}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-8">
        {/* Next Appointment or Status */}
        <div className="hidden md:flex flex-col items-end gap-1 min-w-[140px]">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
            {isUpcoming ? "Next Appointment" : "Last Visit"}
          </span>
          <div className="flex items-center gap-2 text-sm font-medium">
            {isUpcoming && patient.nextAppointment ? (
              <>
                <Calendar className="w-4 h-4 text-primary" />
                <span className="text-primary">
                  {format(new Date(patient.nextAppointment), "MMM d, HH:mm")}
                </span>
              </>
            ) : patient.lastVisit ? (
              <>
                <Clock className="w-4 h-4 text-muted-foreground" />
                <span>{format(new Date(patient.lastVisit), "MMM d, yyyy")}</span>
              </>
            ) : (
                <span className="text-muted-foreground">-</span>
            )}
          </div>
        </div>

        <Button variant="ghost" size="icon" className="text-muted-foreground group-hover:text-foreground">
          <ChevronRight className="w-5 h-5" />
        </Button>
      </div>
    </div>
  );
}
