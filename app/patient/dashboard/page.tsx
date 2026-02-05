"use client";

import { Activity, Calendar, Heart, Pill, Sparkles, TrendingUp, Minus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  currentPatient,
  aiHealthSummary,
  healthTrends,
  appointments,
  currentPrescriptions,
} from "@/lib/mockData";

export default function PatientDashboard() {
  const patientAppointment = appointments.find(
    (apt) => apt.patientId === currentPatient.id
  );

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
                  {currentPatient.initials}
                </div>
                <div className="flex-1">
                  <h2 className="text-xl font-semibold text-foreground">
                    {currentPatient.name}
                  </h2>
                  <div className="grid grid-cols-3 gap-4 mt-4">
                    <div className="text-center p-3 bg-muted rounded-lg">
                      <p className="text-xs text-muted-foreground">Age</p>
                      <p className="text-lg font-semibold text-foreground">
                        {currentPatient.age}
                      </p>
                    </div>
                    <div className="text-center p-3 bg-muted rounded-lg">
                      <p className="text-xs text-muted-foreground">Weight</p>
                      <p className="text-lg font-semibold text-foreground">
                        {currentPatient.weight}
                      </p>
                    </div>
                    <div className="text-center p-3 bg-muted rounded-lg">
                      <p className="text-xs text-muted-foreground">Height</p>
                      <p className="text-lg font-semibold text-foreground">
                        {currentPatient.height}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* AI Health Summary */}
          <Card className="border-l-4 border-l-primary">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Sparkles className="w-5 h-5 text-primary" />
                AI Health Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground leading-relaxed">
                {aiHealthSummary}
              </p>
            </CardContent>
          </Card>

          {/* Health Trends */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-lg">
                <TrendingUp className="w-5 h-5 text-primary" />
                My Health Trends
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {healthTrends.map((trend) => (
                  <div
                    key={trend.id}
                    className="p-4 bg-muted rounded-lg space-y-2"
                  >
                    <div className="flex items-center gap-2 text-muted-foreground">
                      {trend.icon === "activity" ? (
                        <Activity className="w-4 h-4" />
                      ) : (
                        <Heart className="w-4 h-4" />
                      )}
                      <span className="text-sm">{trend.label}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-lg font-semibold text-foreground">
                        {trend.value}
                      </span>
                      {trend.trend === "improving" ? (
                        <TrendingUp className="w-5 h-5 text-success" />
                      ) : (
                        <Minus className="w-5 h-5 text-muted-foreground" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Sidebar */}
        <div className="space-y-6">
          {/* Upcoming Appointments */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Calendar className="w-5 h-5 text-primary" />
                Upcoming Appointments
              </CardTitle>
            </CardHeader>
            <CardContent>
              {patientAppointment ? (
                <div className="p-3 border border-border rounded-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-foreground">
                        {patientAppointment.doctorName}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {patientAppointment.date} at {patientAppointment.time}
                      </p>
                    </div>
                    <Badge variant="secondary">{patientAppointment.type}</Badge>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No upcoming appointments
                </p>
              )}
            </CardContent>
          </Card>

          {/* Current Prescriptions */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Pill className="w-5 h-5 text-primary" />
                Current Prescriptions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {currentPrescriptions.map((med) => (
                <div
                  key={med.id}
                  className="p-3 border border-border rounded-lg"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-foreground">{med.name}</p>
                        {med.isNew && (
                          <Badge className="bg-primary text-primary-foreground text-xs">
                            New
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {med.dosage} · {med.frequency}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
