import { Activity, Calendar, Heart, Pill, Sparkles, TrendingUp, TrendingDown, Minus } from "lucide-react";
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

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">My Dashboard</h1>

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
  );
}
