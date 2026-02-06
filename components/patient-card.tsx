"use client";

import { Calendar, Clock, MoreHorizontal, Phone, User } from "lucide-react";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface PatientCardProps {
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

export function PatientCard({ patient, onClick }: PatientCardProps) {
  return (
    <Card 
      className="cursor-pointer hover:shadow-md transition-shadow group border-l-4 border-l-transparent hover:border-l-primary"
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <Avatar className="h-12 w-12 border-2 border-primary/10">
              <AvatarFallback className="bg-primary/5 text-primary font-semibold">
                {patient.initials}
              </AvatarFallback>
            </Avatar>
            <div>
              <h3 className="font-semibold text-lg text-foreground group-hover:text-primary transition-colors">
                {patient.name}
              </h3>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                {patient.condition && (
                   <Badge variant="outline" className="text-xs font-normal">
                     {patient.condition}
                   </Badge>
                )}
                <span>
                    {patient.dateOfBirth ? 
                        `${new Date().getFullYear() - new Date(patient.dateOfBirth).getFullYear()} yrs` 
                        : "Age N/A"}
                </span>
                {patient.gender && (
                    <>
                        <span>•</span>
                        <span>{patient.gender}</span>
                    </>
                )}
              </div>
            </div>
          </div>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onClick}>View Details</DropdownMenuItem>
              <DropdownMenuItem>Book Appointment</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
          <div className="flex flex-col gap-1">
            <span className="text-muted-foreground text-xs uppercase tracking-wider">Last Visit</span>
            <div className="flex items-center gap-2 font-medium">
               <Clock className="w-4 h-4 text-muted-foreground" />
               {patient.lastVisit ? format(new Date(patient.lastVisit), "MMM d, yyyy") : "No history"}
            </div>
          </div>
          
          <div className="flex flex-col gap-1">
            <span className="text-muted-foreground text-xs uppercase tracking-wider">
               {patient.status === "Upcoming" ? "Next Appointment" : "Status"}
            </span>
            <div className="flex items-center gap-2 font-medium">
               {patient.status === "Upcoming" && patient.nextAppointment ? (
                  <>
                    <Calendar className="w-4 h-4 text-primary" />
                    <span className="text-primary">{format(new Date(patient.nextAppointment), "MMM d, HH:mm")}</span>
                  </>
               ) : (
                  <Badge variant="secondary">Check History</Badge>
               )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
