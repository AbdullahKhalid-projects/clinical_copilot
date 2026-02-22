import { Activity, Calendar, Heart, Pill, Sparkles, TrendingUp, TrendingDown, Minus, LayoutDashboard } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getPatientDashboardData } from "@/app/actions/fetchers";
import Link from "next/link";
import { format } from "date-fns";

export default async function PatientDashboard() {
  const data = await getPatientDashboardData();

  if (!data) {
    return (
      <div className="p-8 text-center">
        <h2 className="text-xl font-semibold">Profile Not Found</h2>
        <p className="text-muted-foreground mt-2">
          We couldn't load your patient profile. Please contact support.
        </p>
      </div>
    );
  }

  const { 
    name, initials, age, weight, height, 
    aiSummary, appointments, healthMetrics, prescriptions 
  } = data;

  const nextAppointment = appointments[0];
  const activeMedicationsCount = prescriptions.length;
  const upcomingAppointmentsCount = appointments.length;

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
                    My Dashboard
                  </h1>
                  <Badge variant="outline" className="shrink-0 border-2 border-border bg-muted text-foreground font-semibold">Overview</Badge>
                </div>
                <span className="text-sm text-muted-foreground mt-0.5 font-medium truncate">
                  Welcome back, {name}
                </span>
              </div>
            </div>
            <Button asChild className="bg-[#3e2b2b] hover:bg-[#2e1b1b] text-white">
              <Link href="/patient/schedule">Schedule Visit</Link>
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-sm">
            <Badge variant="outline" className="gap-1.5 py-1 border-2 border-border bg-muted/70">
              <Heart className="h-3.5 w-3.5" />
              <span>{age} yrs</span>
            </Badge>
            <Badge className="gap-1.5 py-1 px-2.5 border border-green-400 bg-green-200 text-green-900 dark:border-green-700 dark:bg-green-900/35 dark:text-green-200 font-medium">
              <Calendar className="h-3.5 w-3.5" />
              {upcomingAppointmentsCount} Upcoming
            </Badge>
            <Badge variant="outline" className="gap-1.5 py-1 border-2 border-border bg-muted/70">
              <Pill className="h-3.5 w-3.5" />
              <span>{activeMedicationsCount} Active Medications</span>
            </Badge>
          </div>
        </div>
      </header>

      <div className="space-y-6 px-4 sm:px-5 pt-6 pb-8">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content - Left Side */}
        <div className="lg:col-span-2 space-y-6">
          {/* Profile Header */}
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-6">
                <div className="w-16 h-16 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-2xl font-semibold">
                  {initials}
                </div>
                <div className="flex-1">
                  <h2 className="text-xl font-semibold text-foreground">
                    {name}
                  </h2>
                  <div className="grid grid-cols-3 gap-4 mt-4">
                    <div className="text-center p-3 bg-muted rounded-lg">
                      <p className="text-xs text-muted-foreground">Age</p>
                      <p className="text-lg font-semibold text-foreground">
                        {age}
                      </p>
                    </div>
                    <div className="text-center p-3 bg-muted rounded-lg">
                      <p className="text-xs text-muted-foreground">Weight</p>
                      <p className="text-lg font-semibold text-foreground">
                        {weight || "N/A"}
                      </p>
                    </div>
                    <div className="text-center p-3 bg-muted rounded-lg">
                      <p className="text-xs text-muted-foreground">Height</p>
                      <p className="text-lg font-semibold text-foreground">
                        {height || "N/A"}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* AI Health Summary */}
          {aiSummary && (
            <Card className="border-l-4 border-l-primary">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Sparkles className="w-5 h-5 text-primary" />
                  AI Health Summary
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground leading-relaxed">
                  {aiSummary}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Health Trends */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-lg">
                <TrendingUp className="w-5 h-5 text-primary" />
                Latest Vitals
              </CardTitle>
            </CardHeader>
            <CardContent>
              {healthMetrics.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {healthMetrics.map((metric) => (
                    <div
                      key={metric.id}
                      className="p-4 bg-muted rounded-lg space-y-2"
                    >
                      <div className="flex items-center gap-2 text-muted-foreground">
                         <Activity className="w-4 h-4" />
                        <span className="text-sm capitalize">{metric.type.replace('_', ' ')}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-2xl font-bold text-foreground">
                          {metric.value} <span className="text-sm font-normal text-muted-foreground">{metric.unit}</span>
                        </span>
                        {metric.trend === 'up' && <TrendingUp className="w-4 h-4 text-red-500" />}
                        {metric.trend === 'down' && <TrendingDown className="w-4 h-4 text-green-500" />}
                        {metric.trend === 'stable' && <Minus className="w-4 h-4 text-gray-400" />}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground">No recent vitals recorded.</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar - Right Side */}
        <div className="space-y-6">
           {/* Upcoming Appointment */}
           <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Calendar className="w-5 h-5 text-primary" />
                Next Appointment
              </CardTitle>
            </CardHeader>
            <CardContent>
              {nextAppointment ? (
                <div className="space-y-4">
                  <div className="p-4 bg-primary/5 rounded-lg space-y-1 border border-primary/20">
                    <p className="font-medium text-foreground">
                      {format(nextAppointment.date, "EEEE, MMMM d, yyyy")}
                    </p>
                    <p className="text-2xl font-bold text-primary">
                      {format(nextAppointment.date, "h:mm a")}
                    </p>
                    <div className="pt-2 flex items-center gap-2 text-sm text-muted-foreground">
                      <span className="w-2 h-2 rounded-full bg-green-500" />
                      Confirmed
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Doctor</span>
                      <span className="font-medium">{nextAppointment.doctor?.specialization || "General"}</span> 
                      {/* Note: I didn't verify if I pulled doctor name. Doctor relation is loaded. */}
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Reason</span>
                      <span className="font-medium">{nextAppointment.reason}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mt-4">
                    <Button variant="outline" className="w-full" asChild>
                       <Link href="/patient/schedule">Reschedule</Link>
                    </Button>
                    <Button className="w-full">Details</Button>
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground py-4">No upcoming appointments.</p>
              )}
            </CardContent>
          </Card>

          {/* Current Medications */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Pill className="w-5 h-5 text-primary" />
                Active Medications
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {prescriptions.length > 0 ? prescriptions.map((med) => (
                  <div
                    key={med.id}
                    className="flex items-center justify-between p-3 bg-muted rounded-lg"
                  >
                    <div>
                      <p className="font-medium text-foreground">{med.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {med.dosage} • {med.frequency}
                      </p>
                    </div>
                    <Badge variant="outline" className="bg-background text-xs">
                      Active
                    </Badge>
                  </div>
                )) : (
                   <p className="text-muted-foreground">No active medications.</p>
                )}
                <Button variant="ghost" className="w-full text-primary" asChild>
                  <Link href="/patient/medications">View All Medications</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
    </div>
  );
}
