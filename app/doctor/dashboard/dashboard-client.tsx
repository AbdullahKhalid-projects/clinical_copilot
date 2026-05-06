"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Calendar,
  Stethoscope,
  LayoutDashboard,
  Users,
  FileText,
  ArrowRight,
  ChevronRight,
  ClipboardList,
  Zap,
  Link as LinkIcon,
  FileCheck,
  Sparkles,
  StickyNote,
  Mic,
  BookOpen,
  ShieldCheck,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from "@/components/ui/carousel";

interface Patient {
  id: string;
  name: string;
  imageUrl?: string | null;
  initials: string;
  lastVisit: string;
  condition: string;
}

interface DashboardData {
  doctor: {
    name: string;
    specialty: string;
    title: string;
    initials: string;
    licenseNumber: string;
  };
  stats: {
    todayAppointments: number;
    totalPatients: number;
    weeklySessions: number;
    newPatientsThisWeek: number;
    pendingNotes: number;
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
  recentPatients: Patient[];
  actionItems: {
    id: string;
    type: "IN_PROGRESS" | "UNLINKED" | "MISSING_NOTES";
    title: string;
    subtitle: string;
    patientId?: string;
    appointmentId: string;
  }[];
}

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; className: string }> = {
  PENDING: { label: "Pending", variant: "outline", className: "border-amber-400 bg-amber-100 text-amber-900 font-medium" },
  CONFIRMED: { label: "Confirmed", variant: "outline", className: "border-blue-400 bg-blue-100 text-blue-900 font-medium" },
  IN_PROGRESS: { label: "In Progress", variant: "outline", className: "border-green-400 bg-green-100 text-green-900 font-medium" },
  COMPLETED: { label: "Completed", variant: "secondary", className: "bg-slate-200 text-slate-700 font-medium" },
  CANCELLED: { label: "Cancelled", variant: "outline", className: "border-red-300 bg-red-50 text-red-700 font-medium" },
  UNLINKED: { label: "Unlinked", variant: "outline", className: "border-red-400 bg-red-100 text-red-900 font-medium" },
};

const actionTypeConfig: Record<string, { icon: React.ElementType; color: string; borderColor: string; bgColor: string }> = {
  IN_PROGRESS: { icon: Zap, color: "text-green-700", borderColor: "border-l-green-500", bgColor: "bg-green-50" },
  UNLINKED: { icon: LinkIcon, color: "text-red-700", borderColor: "border-l-red-500", bgColor: "bg-red-50" },
  MISSING_NOTES: { icon: FileText, color: "text-amber-700", borderColor: "border-l-amber-500", bgColor: "bg-amber-50" },
};

const carouselSlides = [
  {
    icon: Mic,
    title: "AI-Powered Sessions",
    text: "Record and transcribe clinical sessions in real-time with speaker diarization.",
    color: "bg-green-50 border-green-200 text-green-700",
  },
  {
    icon: StickyNote,
    title: "Smart Note Studio",
    text: "Generate structured SOAP notes and visit summaries from session transcripts.",
    color: "bg-amber-50 border-amber-200 text-amber-700",
  },
  {
    icon: BookOpen,
    title: "Patient Insights",
    text: "Access AI-generated summaries, health metrics, and medication histories.",
    color: "bg-blue-50 border-blue-200 text-blue-700",
  },
  {
    icon: ShieldCheck,
    title: "Secure & Compliant",
    text: "All data is encrypted and stored securely with full HIPAA compliance.",
    color: "bg-purple-50 border-purple-200 text-purple-700",
  },
];

export default function DashboardClient({
  initialData,
  allPatients,
}: {
  initialData: DashboardData;
  allPatients: Patient[];
}) {
  const router = useRouter();
  const [currentTime] = useState(() =>
    new Date().toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    })
  );

  const [carouselApi, setCarouselApi] = useState<CarouselApi>();

  const handleAppointmentAction = (appointmentId: string) => {
    router.push(`/doctor/clinical-session/${appointmentId}`);
  };

  const handleActionItemClick = (item: DashboardData["actionItems"][number]) => {
    router.push(`/doctor/clinical-session/${item.appointmentId}`);
  };

  const handlePatientClick = (patientId: string) => {
    router.push(`/doctor/patients/${patientId}`);
  };

  const { doctor, stats, appointments, actionItems } = initialData;

  const shortcuts = [
    { label: "My Patients", href: "/doctor/patients", icon: Users, desc: "Browse and manage your patient records" },
    { label: "Schedule", href: "/doctor/schedule", icon: Calendar, desc: "View and manage your daily appointments" },
    { label: "Note Studio", href: "/doctor/note-studio/gallery", icon: ClipboardList, desc: "View and edit your clinical note templates" },
    { label: "Post-Visit", href: "/doctor/post-visit", icon: FileCheck, desc: "Write and finalize visit summaries" },
  ];

  // Autoplay carousel every 4 seconds
  useEffect(() => {
    if (!carouselApi) return;
    const interval = setInterval(() => {
      carouselApi.scrollNext();
    }, 4000);
    return () => clearInterval(interval);
  }, [carouselApi]);

  return (
    <div className="h-full flex-1 flex-col space-y-0 md:flex overflow-auto">
      {/* Header */}
      <header className="px-4 sm:px-5 py-3 border-b-2 border-border bg-background/95 backdrop-blur z-10 shrink-0">
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
                  <Badge variant="outline" className="shrink-0 border-2 border-border bg-muted text-foreground font-semibold">
                    Overview
                  </Badge>
                </div>
                <span className="text-sm text-muted-foreground mt-0.5 font-medium truncate">
                  Welcome back, {doctor.name}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-sm">
            <Badge variant="outline" className="gap-1.5 py-1 border-2 border-border bg-muted/70">
              <Stethoscope className="h-3.5 w-3.5" />
              <span>{doctor.specialty}</span>
            </Badge>
            <Badge variant="outline" className="gap-1.5 py-1 border-2 border-border bg-muted/70">
              <Calendar className="h-3.5 w-3.5" />
              <span>{currentTime}</span>
            </Badge>
            <Badge className="gap-1.5 py-1 px-2.5 border border-green-400 bg-green-200 text-green-900 dark:border-green-700 dark:bg-green-900/35 dark:text-green-200 font-medium">
              <Sparkles className="h-3.5 w-3.5" />
              {stats.todayAppointments} Appointments Today
            </Badge>
          </div>
        </div>
      </header>

      {/* Scrollable Content */}
      <div className="space-y-5 px-4 sm:px-5 pt-5 pb-8">
        {/* Welcome Banner */}
        <div className="rounded-xl border-2 border-border bg-muted/30 p-5">
          <div className="border-l-4 border-yellow-400 pl-4">
            <h2 className="text-base font-black text-foreground tracking-tight">
              Good to see you, Dr. {doctor.name.split(" ").pop() || doctor.name}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Here's everything you need for a productive day. Review your schedule, catch up on action items, and access your tools quickly.
            </p>
          </div>
        </div>

        {/* Carousel — Site Info */}
        <div className="rounded-xl border-2 border-border bg-card p-4">
          <Carousel
            setApi={setCarouselApi}
            opts={{
              align: "start",
              loop: true,
            }}
            className="w-full"
          >
            <CarouselContent className="-ml-2">
              {carouselSlides.map((slide, index) => {
                const Icon = slide.icon;
                return (
                  <CarouselItem key={index} className="pl-2 md:basis-1/2 lg:basis-1/3">
                    <div className={`rounded-lg border-2 p-4 h-full ${slide.color}`}>
                      <div className="flex items-center gap-2 mb-2">
                        <Icon className="h-5 w-5" />
                        <h3 className="text-sm font-bold">{slide.title}</h3>
                      </div>
                      <p className="text-xs opacity-90 leading-relaxed">{slide.text}</p>
                    </div>
                  </CarouselItem>
                );
              })}
            </CarouselContent>
            <div className="flex justify-end gap-2 mt-3">
              <CarouselPrevious className="relative inset-0 translate-x-0 translate-y-0 h-8 w-8" />
              <CarouselNext className="relative inset-0 translate-x-0 translate-y-0 h-8 w-8" />
            </div>
          </Carousel>
        </div>

        {/* Main Split: Today's Schedule + Sidebar */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Today's Schedule */}
          <Card className="lg:col-span-2 border-2 border-border">
            <CardHeader className="pb-2 px-4 pt-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-bold border-l-4 border-green-400 pl-3">
                  Today's Schedule
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1 text-xs font-semibold h-8"
                  onClick={() => router.push("/doctor/schedule")}
                >
                  View All <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {appointments.length > 0 ? (
                <div className="space-y-1.5">
                  {appointments.map((apt) => {
                    const status = statusConfig[apt.status] || statusConfig.PENDING;
                    return (
                      <div
                        key={apt.id}
                        className="group flex items-center gap-3 p-2.5 rounded-lg border border-border hover:bg-muted/40 transition-colors"
                      >
                        <div className="w-12 shrink-0 text-center">
                          <p className="text-sm font-bold text-foreground leading-tight">{apt.time}</p>
                        </div>
                        <Separator orientation="vertical" className="h-6" />
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <Avatar className="h-8 w-8 border border-border">
                            <AvatarFallback className="bg-primary text-primary-foreground text-[10px] font-bold">
                              {apt.patientInitials}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-foreground truncate">{apt.patientName}</p>
                            <p className="text-xs text-muted-foreground truncate">{apt.type}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge variant={status.variant} className={`text-xs ${status.className}`}>
                            {status.label}
                          </Badge>
                          <Button
                            size="sm"
                            className="h-6 px-2 text-[11px] bg-[#3e2b2b] hover:bg-[#2e1b1b] text-white opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => handleAppointmentAction(apt.id)}
                          >
                            Open
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-6 text-center">
                  <p className="text-sm font-medium text-muted-foreground">No appointments scheduled for today</p>
                  <p className="text-xs text-muted-foreground/70 mt-0.5">Start a new session or check your schedule</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Right Column: Action Items + Shortcuts */}
          <div className="space-y-5">
            {/* Action Items */}
            <Card className="border-2 border-border">
              <CardHeader className="pb-2 px-4 pt-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-bold border-l-4 border-red-400 pl-3">
                    Action Items
                  </CardTitle>
                  {actionItems.length > 0 && (
                    <Badge variant="outline" className="border-2 border-border bg-muted text-xs">
                      {actionItems.length}
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                {actionItems.length > 0 ? (
                  <div className="space-y-2">
                    {actionItems.map((item) => {
                      const config = actionTypeConfig[item.type];
                      const Icon = config.icon;
                      return (
                        <button
                          key={item.id}
                          onClick={() => handleActionItemClick(item)}
                          className={`w-full text-left p-3 rounded-lg border border-border ${config.borderColor} border-l-4 ${config.bgColor} hover:brightness-95 transition-all group`}
                        >
                          <div className="flex items-start gap-2.5">
                            <Icon className={`h-4 w-4 ${config.color} mt-0.5 shrink-0`} />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-bold text-foreground truncate">{item.title}</p>
                              <p className="text-xs text-muted-foreground truncate">{item.subtitle}</p>
                            </div>
                            <ChevronRight className="h-4 w-4 text-muted-foreground/50 group-hover:text-foreground transition-colors shrink-0 mt-0.5" />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-6 text-center">
                    <p className="text-sm font-medium text-muted-foreground">All caught up</p>
                    <p className="text-xs text-muted-foreground/70 mt-0.5">No pending action items</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Quick Shortcuts — expand within card */}
            <Card className="border-2 border-border">
              <CardHeader className="pb-2 px-4 pt-4">
                <CardTitle className="text-base font-bold border-l-4 border-purple-400 pl-3">
                  Quick Shortcuts
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="space-y-0.5">
                  {shortcuts.map((shortcut) => (
                    <div key={shortcut.label} className="group">
                      <button
                        onClick={() => router.push(shortcut.href)}
                        className="w-full text-left rounded-lg border border-transparent hover:border-border hover:bg-muted/40 transition-colors px-3 py-2 flex items-center gap-3"
                      >
                        <shortcut.icon className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="flex-1 text-sm font-semibold text-foreground">{shortcut.label}</span>
                        <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-foreground transition-colors shrink-0" />
                      </button>
                      <div className="px-3 max-h-0 overflow-hidden group-hover:max-h-10 transition-all duration-300 ease-out">
                        <p className="text-[11px] text-muted-foreground pl-7 pb-1.5">
                          {shortcut.desc}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Bottom Row: All Patients Cards with Clerk avatars */}
        <Card className="border-2 border-border">
          <CardHeader className="pb-2 px-4 pt-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-bold border-l-4 border-blue-400 pl-3">
                Patients
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1 text-xs font-semibold h-8"
                onClick={() => router.push("/doctor/patients")}
              >
                View All <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {allPatients.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {allPatients.map((patient) => (
                  <button
                    key={patient.id}
                    onClick={() => handlePatientClick(patient.id)}
                    className="group flex flex-col items-center text-center p-4 rounded-xl border-2 border-border hover:border-primary/40 hover:bg-muted/30 transition-all"
                  >
                    <Avatar className="h-12 w-12 border-2 border-border mb-2">
                      {patient.imageUrl ? (
                        <AvatarImage src={patient.imageUrl} alt={patient.name} />
                      ) : null}
                      <AvatarFallback className="bg-primary text-primary-foreground text-sm font-bold">
                        {patient.initials}
                      </AvatarFallback>
                    </Avatar>
                    <p className="text-sm font-bold text-foreground truncate w-full">{patient.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{patient.lastVisit}</p>
                    <Badge variant="outline" className="mt-2 text-[10px] border-2 border-border bg-muted/50">
                      {patient.condition}
                    </Badge>
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-6 text-center">
                <p className="text-sm font-medium text-muted-foreground">No patients yet</p>
                <p className="text-xs text-muted-foreground/70 mt-0.5">Patients will appear here after sessions</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
