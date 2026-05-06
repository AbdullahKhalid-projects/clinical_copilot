"use client";

import { 
  ArrowLeft, 
  Calendar, 
  Activity, 
  Pill, 
  FileText, 
  User, 
  AlertTriangle 
} from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface PatientDetails {
  id: string;
  name: string;
  email: string;
  phone: string;
  dob: string;
  gender: string;
  height: string;
  weight: string;
  bloodType: string;
  allergies: string[];
  conditions: string[];
  aiSummary: string | null;
  nextAppointment: {
    date: string;
    time: string;
    reason: string | null;
  } | null;
  recentAppointments: {
    id: string;
    date: string;
    status: string;
    reason: string;
  }[];
  activeMedications: {
    id: string;
    name: string;
    dosage: string;
    frequency: string;
  }[];
  metrics: {
    id: string;
    type: string;
    value: string;
    unit: string | null;
    trend: string | null;
    date: string;
  }[];
  notes: {
    id: string;
    title: string;
    date: string;
    content: string;
  }[];
}

export default function PatientDetailsClient({ patient }: { patient: PatientDetails }) {
  const router = useRouter();
  const initials = patient.name.split(' ').map(n => n[0]).join('').substring(0, 2);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10">
            <AvatarFallback className="bg-primary text-primary-foreground">{initials}</AvatarFallback>
          </Avatar>
          <div>
            <h1 className="text-2xl font-bold">{patient.name}</h1>
            <p className="text-sm text-muted-foreground">{patient.email}</p>
          </div>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Left Column: Demographics & Vitals */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-medium flex items-center gap-2">
                <User className="w-4 h-4 text-primary" />
                Personal Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
               <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Phone</span>
                    <p className="font-medium">{patient.phone}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">DOB</span>
                    <p className="font-medium">{patient.dob}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Gender</span>
                    <p className="font-medium">{patient.gender}</p>
                  </div>
                   <div>
                    <span className="text-muted-foreground">Blood Type</span>
                    <p className="font-medium">{patient.bloodType}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Height</span>
                    <p className="font-medium">{patient.height}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Weight</span>
                    <p className="font-medium">{patient.weight}</p>
                  </div>
               </div>
            </CardContent>
          </Card>

           <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-medium flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-orange-500" />
                Medical Alert
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
               <div>
                  <h4 className="text-sm font-medium mb-2 text-muted-foreground">Allergies</h4>
                  <div className="flex flex-wrap gap-2">
                    {patient.allergies.length > 0 ? (
                        patient.allergies.map((a, i) => (
                          <Badge key={i} variant="destructive" className="font-normal">{a.trim()}</Badge>
                        ))
                    ) : <span className="text-sm text-muted-foreground">None listed</span>}
                  </div>
               </div>
               <div>
                  <h4 className="text-sm font-medium mb-2 text-muted-foreground">Conditions</h4>
                  <div className="flex flex-wrap gap-2">
                    {patient.conditions.length > 0 ? (
                        patient.conditions.map((c, i) => (
                          <Badge key={i} variant="outline" className="font-normal">{c.trim()}</Badge>
                        ))
                    ) : <span className="text-sm text-muted-foreground">None listed</span>}
                  </div>
               </div>
            </CardContent>
          </Card>
        </div>

        {/* Center & Right Column: Content */}
        <div className="md:col-span-2 space-y-6">
          {/* AI Summary Banner */}
          {patient.aiSummary && (
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
                <h3 className="font-semibold text-primary mb-1 flex items-center gap-2">
                   ✨ AI Clinical Summary
                </h3>
                <p className="text-sm text-muted-foreground">{patient.aiSummary}</p>
            </div>
          )}

          <Tabs defaultValue="overview">
              <TabsList>
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="appointments">Appointments</TabsTrigger>
                  <TabsTrigger value="medications">Medications</TabsTrigger>
                  <TabsTrigger value="notes">Notes</TabsTrigger>
              </TabsList>
              
              <TabsContent value="overview" className="mt-4 space-y-4">
                 {/* Next Appointment Card */}
                 <Card>
                    <CardHeader>
                        <CardTitle className="text-sm font-medium uppercase text-muted-foreground">Next Scheduled Visit</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {patient.nextAppointment ? (
                            <div className="flex items-center justify-between">
                                <div className="flex gap-4 items-center">
                                    <div className="bg-primary/10 p-3 rounded-full">
                                        <Calendar className="w-6 h-6 text-primary" />
                                    </div>
                                    <div>
                                        <h4 className="font-semibold text-lg">{patient.nextAppointment.reason || "Consultation"}</h4>
                                        <p className="text-muted-foreground">{patient.nextAppointment.date} at {patient.nextAppointment.time}</p>
                                    </div>
                                </div>
                                <Button>Start Visit</Button>
                            </div>
                        ) : (
                            <div className="text-center py-4 text-muted-foreground">
                                No upcoming appointments scheduled.
                            </div>
                        )}
                    </CardContent>
                 </Card>

                 {/* Recent Metrics */}
                 <Card>
                    <CardHeader>
                        <CardTitle className="text-sm font-medium uppercase text-muted-foreground">Quick Vitals</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                            {patient.metrics.slice(0, 3).map((m) => (
                                <div key={m.id} className="p-3 bg-muted rounded-lg">
                                    <p className="text-xs text-muted-foreground capitalize">{m.type.replace('_', ' ')}</p>
                                    <p className="text-xl font-bold">{m.value} <span className="text-xs font-normal text-muted-foreground">{m.unit}</span></p>
                                    <p className="text-xs text-green-600 mt-1">{m.trend}</p>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                 </Card>
              </TabsContent>

              <TabsContent value="appointments">
                  <Card>
                      <CardContent className="pt-6">
                        <div className="space-y-4">
                            {patient.recentAppointments.map((appt) => (
                                <div key={appt.id} className="flex items-center justify-between border-b last:border-0 pb-4 last:pb-0">
                                    <div>
                                        <p className="font-medium">{appt.reason}</p>
                                        <p className="text-sm text-muted-foreground">{appt.date}</p>
                                    </div>
                                    <Badge variant={appt.status === 'COMPLETED' ? 'outline' : 'default'}>{appt.status}</Badge>
                                </div>
                            ))}
                        </div>
                      </CardContent>
                  </Card>
              </TabsContent>

              <TabsContent value="medications">
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {patient.activeMedications.map(med => (
                        <Card key={med.id}>
                            <CardContent className="p-4 flex items-start gap-3">
                                <div className="bg-blue-100 p-2 rounded-full text-blue-600">
                                    <Pill className="w-4 h-4" />
                                </div>
                                <div>
                                    <h4 className="font-semibold">{med.name}</h4>
                                    <p className="text-sm text-muted-foreground">{med.dosage} • {med.frequency}</p>
                                    <Badge className="mt-2 bg-green-100 text-green-700 hover:bg-green-100">Active</Badge>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                 </div>
              </TabsContent>

               <TabsContent value="notes">
                  <div className="space-y-4">
                    {patient.notes.map(note => (
                         <Card key={note.id}>
                            <CardHeader className="pb-2">
                                <div className="flex justify-between items-start">
                                    <CardTitle className="text-base">{note.title}</CardTitle>
                                    <span className="text-xs text-muted-foreground">{note.date}</span>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <p className="text-sm text-muted-foreground line-clamp-3">{note.content}</p>
                            </CardContent>
                        </Card>
                    ))}
                    {patient.notes.length === 0 && <p className="text-muted-foreground">No notes recorded.</p>}
                  </div>
              </TabsContent>
          </Tabs>
        </div>

      </div>
    </div>
  );
}
