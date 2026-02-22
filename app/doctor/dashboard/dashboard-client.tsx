"use client";

import { useRouter } from "next/navigation";
import {
  Calendar,
  CalendarOff,
  Play,
  Stethoscope,
  Clock,
  LayoutDashboard,
  Users,
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
    <div className="h-full flex-1 flex-col space-y-0 md:flex">
      <header className="px-4 sm:px-5 py-3 border-b-2 border-border bg-background/95 backdrop-blur z-10">
        <div className="flex flex-col gap-2.5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-10 w-10 shrink-0 rounded-md border-2 border-black bg-yellow-300 flex items-center justify-center">
                <LayoutDashboard className="h-5 w-5 text-black stroke-2" />
              </div>
              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <h1 className="text-lg sm:text-xl font-black tracking-tight text-foreground truncate">
                    Doctor Dashboard
                  </h1>
                  <Badge variant="outline" className="shrink-0 border-2 border-border bg-muted text-foreground font-semibold">Overview</Badge>
                </div>
                <span className="text-sm text-muted-foreground mt-0.5 font-medium truncate">
                  Welcome back, {doctor.name}
                </span>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Button onClick={handleStartSession} className="bg-[#3e2b2b] hover:bg-[#2e1b1b] text-white">
                <Play className="mr-2 h-4 w-4" /> Start Session
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-sm">
            <Badge variant="outline" className="gap-1.5 py-1 border-2 border-border bg-muted/70">
              <Stethoscope className="h-3.5 w-3.5" />
              <span>{doctor.specialty}</span>
            </Badge>
            <Badge variant="outline" className="gap-1.5 py-1 border-2 border-border bg-muted/70">
              <Users className="h-3.5 w-3.5" />
              <span className="inline-block text-center tabular-nums">{todaysOverview.totalPatients}</span>
              <span>Total Patients</span>
            </Badge>
            <Badge className="gap-1.5 py-1 px-2.5 border border-green-400 bg-green-200 text-green-900 dark:border-green-700 dark:bg-green-900/35 dark:text-green-200 font-medium">
              <Calendar className="h-3.5 w-3.5" />
              {todaysOverview.appointments} Appointments Today
            </Badge>
          </div>
        </div>
      </header>

      <div className="space-y-6 px-4 sm:px-5 pt-6 pb-8">
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
    </div>
  );
}
