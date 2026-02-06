"use client";

import { useRouter } from "next/navigation";
import {
  Calendar,
  CalendarOff,
  Play,
  Stethoscope,
  Clock,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface DashboardData {
  doctor: {
    name: string;
    specialty: string;
    title: string;
    initials: string;
    licenseNumber: string;
  };
  todaysOverview: {
    appointments: number;
    totalPatients: number;
  };
  appointments: {
    id: string;
    patientId: string;
    patientName: string;
    patientInitials: string;
    date: string;
    time: string;
    type: string;
    status: string;
  }[];
}

export default function DashboardClient({ initialData }: { initialData: DashboardData }) {
  const router = useRouter();

  const handleStartSession = () => {
    router.push("/doctor/clinical-session");
    // If we want to start with the next appointment, we could pick it here
  };

  const handleRequestLeave = () => {
    alert("Request Leave feature coming soon!");
  };

  const handleStartAppointment = (patientId: string) => {
    router.push(`/doctor/clinical-session?patientId=${patientId}`);
  };

  const { doctor, todaysOverview, appointments } = initialData;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Doctor Dashboard</h1>

      {/* Doctor Profile Header */}
      <Card className="bg-primary text-primary-foreground overflow-hidden">
        <CardContent className="p-6">
          <div className="flex items-center gap-6">
            <div className="w-20 h-20 rounded-full bg-white/20 flex items-center justify-center text-3xl font-semibold">
              {doctor.initials}
            </div>
            <div>
              <h2 className="text-2xl font-bold">{doctor.name}</h2>
              <p className="text-primary-foreground/80">{doctor.specialty}</p>
              <p className="text-primary-foreground/80">{doctor.title}</p>
              <Badge className="mt-2 bg-white/20 text-primary-foreground hover:bg-white/30">
                <Stethoscope className="w-3 h-3 mr-1" />
                {doctor.licenseNumber}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column */}
        <div className="space-y-6">
          {/* Quick Actions */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button
                onClick={handleStartSession}
                className="w-full justify-start gap-2 h-12"
              >
                <Play className="w-5 h-5" />
                Start Clinical Session
              </Button>
              <Button
                variant="outline"
                onClick={handleRequestLeave}
                className="w-full justify-start gap-2 h-12 bg-transparent"
              >
                <CalendarOff className="w-5 h-5" />
                Request Leave
              </Button>
            </CardContent>
          </Card>

          {/* Today's Overview */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Today&apos;s Overview</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-4 bg-muted rounded-lg">
                  <p className="text-3xl font-bold text-primary">
                    {todaysOverview.appointments}
                  </p>
                  <p className="text-sm text-muted-foreground">Appointments</p>
                </div>
                <div className="text-center p-4 bg-muted rounded-lg">
                  <p className="text-3xl font-bold text-primary">
                    {todaysOverview.totalPatients}
                  </p>
                  <p className="text-sm text-muted-foreground">Total Patients</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Upcoming Appointments */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Calendar className="w-5 h-5 text-primary" />
              Upcoming Appointments
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {appointments.map((apt) => (
              <div
                key={apt.id}
                className="p-4 border border-border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-sm font-medium">
                      {apt.patientInitials}
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{apt.patientName}</p>
                      <p className="text-sm text-muted-foreground flex items-center gap-2">
                        <Calendar className="w-3 h-3" />
                        {apt.date}
                        <Clock className="w-3 h-3 ml-2" />
                        {apt.time}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{apt.type}</Badge>
                    <Button
                      size="sm"
                      onClick={() => handleStartAppointment(apt.patientId)}
                    >
                      Start
                    </Button>
                  </div>
                </div>
              </div>
            ))}

            {appointments.length === 0 && (
              <div className="text-center py-8">
                <Calendar className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No upcoming appointments</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
