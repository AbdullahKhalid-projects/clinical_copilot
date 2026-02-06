"use client";

import { useState } from "react";
import { Search, UserPlus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PatientListItem } from "@/components/patient-list-item";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";

interface Patient {
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
}

export default function PatientsClient({ patients }: { patients: Patient[] }) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");

  const filteredPatients = patients.filter(
    (patient) =>
      patient.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      patient.email.toLowerCase().includes(searchQuery.toLowerCase())
  ).sort((a, b) => {
    // Sort logic: Upcoming first, then by name
    if (a.status === "Upcoming" && b.status !== "Upcoming") return -1;
    if (a.status !== "Upcoming" && b.status === "Upcoming") return 1;
    return a.name.localeCompare(b.name);
  });

  const handlePatientClick = (id: string) => {
    router.push(`/doctor/patients/${id}`);
  };

  return (
    <div className="space-y-6">
      {/* Header Section with Search */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-6">
        <div>
           <h1 className="text-3xl font-bold tracking-tight text-foreground">My Patients</h1>
           <p className="text-muted-foreground mt-1">Manage and view your patient records.</p>
        </div>
        
        <div className="flex items-center gap-3 w-full md:w-auto">
            <div className="relative w-full md:w-[300px]">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                placeholder="Search patients..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-10 w-full"
                />
            </div>
            {/* You could add an "Add Patient" button here if needed */}
             {/* <Button>
                <UserPlus className="w-4 h-4 mr-2" />
                Add Patient
             </Button> */}
        </div>
      </div>

      <div className="space-y-4">
          {filteredPatients.length > 0 ? (
            <div className="flex flex-col gap-3">
              {filteredPatients.map((patient) => (
                <PatientListItem
                  key={patient.id}
                  patient={patient}
                  onClick={() => handlePatientClick(patient.id)}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-16 bg-muted/20 rounded-lg border border-dashed">
                <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                     <Search className="w-6 h-6 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-medium">No patients found</h3>
                <p className="text-muted-foreground mt-1">
                   {searchQuery ? `No results for "${searchQuery}"` : "You haven't assigned any patients yet."}
                </p>
                {searchQuery && (
                    <Button variant="link" onClick={() => setSearchQuery("")} className="mt-2">
                        Clear search
                    </Button>
                )}
            </div>
          )}
      </div>
    </div>
  );
}
