
"use client";

import * as React from "react";
import {
  Search,
  RefreshCw,
} from "lucide-react";

import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { getSidebarAppointments, type SidebarAppointment } from "@/app/actions/sidebarActions";
import { useRouter } from "next/navigation";

// Define the display item types
type FeedItem = 
  | { type: 'header'; date: string; id: string }
  | { type: 'session'; data: SidebarAppointment };

// --- Helper Functions ---

function groupAppointments(appointments: SidebarAppointment[]): FeedItem[] {
  const grouped: FeedItem[] = [];
  let lastDate = "";
  
  appointments.forEach((apt) => {
    if (apt.date !== lastDate) {
      grouped.push({ 
        type: 'header', 
        date: apt.date, 
        id: `header-${apt.date}` 
      });
      lastDate = apt.date;
    }
    grouped.push({ type: 'session', data: apt });
  });

  return grouped;
}

export function ClinicalSidebar() {
  const router = useRouter();
  const [isSearchOpen, setIsSearchOpen] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<"upcoming" | "past">("upcoming");
  
  // Data State
  const [appointments, setAppointments] = React.useState<{ upcoming: SidebarAppointment[], past: SidebarAppointment[] }>({ upcoming: [], past: [] });
  const [loading, setLoading] = React.useState(true);
  const [searchQuery, setSearchQuery] = React.useState("");

  // Fetch Data on Mount
  React.useEffect(() => {
    async function load() {
      try {
        const data = await getSidebarAppointments();
        setAppointments(data);
      } catch (err) {
        console.error("Failed to load sidebar appointments", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Filter & Group Logic
  const displayItems = React.useMemo(() => {
    let source = activeTab === "upcoming" ? appointments.upcoming : appointments.past;
    
    // Search Filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      source = source.filter(a => 
        a.patientName.toLowerCase().includes(q) || 
        a.title.toLowerCase().includes(q)
      );
    }
    
    return groupAppointments(source);
  }, [activeTab, appointments, searchQuery]);

  // Handle Navigation
  const handleSelectSession = (appointmentId: string) => {
      router.push(`/doctor/clinical-session/${appointmentId}`);
  };

  return (
    <div className="w-[17rem] h-svh sticky top-0 border-r bg-white text-sidebar-foreground flex flex-col transition-all duration-300 ease-in-out" data-sidebar="sub-sidebar">
      {/* Header */}
      <div className="px-3 py-3 flex flex-col gap-2 border-b bg-white z-20">
        {/* Top actions */}
        <div className="flex items-center justify-between text-sidebar-foreground/70 mb-0.5">
            <span className="text-sm font-semibold text-foreground/80 tracking-tight">Appointments</span>
            <div className="flex items-center gap-0.5">
                <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-muted/50" onClick={() => setIsSearchOpen(!isSearchOpen)}>
                    <Search className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-muted/50" onClick={() => {
                    setLoading(true);
                    getSidebarAppointments().then(d => { setAppointments(d); setLoading(false); });
                }}>
                    <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
                </Button>
            </div>
        </div>

        {/* Search Bar */}
        {isSearchOpen && (
          <div className="relative animate-in fade-in slide-in-from-top-1 duration-200 mb-1">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search..."
              className="w-full pl-8 bg-muted/30 h-8 text-xs focus-visible:ring-1 border-muted/60"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        )}

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "upcoming" | "past")} className="w-full">
          <TabsList className="grid w-full grid-cols-2 bg-muted/20 p-1 gap-1 h-8 rounded-lg">
            <TabsTrigger 
              value="upcoming" 
              className="text-xs font-medium data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-md px-2 h-full transition-all"
            >
              Upcoming 
              {appointments.upcoming.length > 0 && (
                <span className="ml-1.5 bg-primary/10 text-primary text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                    {appointments.upcoming.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger 
              value="past" 
              className="text-xs font-medium data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-md px-2 h-full transition-all"
            >
              Past
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex flex-col bg-slate-50/50">
        {loading ? (
             <div className="flex-1 flex items-center justify-center">
                <div className="flex flex-col items-center gap-2">
                    <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground/30" />
                    <span className="text-xs text-muted-foreground/50">Loading appointments...</span>
                </div>
             </div>
        ) : displayItems.length > 0 ? (
          <ScrollArea className="flex-1">
            <div className="px-3 pb-8 pt-1">
              {displayItems.map((item) => {
                if (item.type === 'header') {
                  return (
                    <div key={item.id} className="sticky top-0 z-10 w-full pt-3 pb-1.5 px-1 shadow-[0_1px_0_0_rgba(0,0,0,0.02)] backdrop-blur-sm bg-slate-50/80">
                       <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        {item.date}
                        </h3>
                    </div>
                  );
                }
                
                const session = item.data;
                const isCompleted = session.status === 'COMPLETED';
                const isCanceled = session.status === 'CANCELLED';

                return (
                    <div 
                      key={session.id} 
                      onClick={() => handleSelectSession(session.id)}
                      className={cn(
                        "mt-2 mb-1 relative flex items-start gap-3 p-3 rounded-xl cursor-pointer transition-all duration-200 border group",
                        "bg-white hover:border-blue-200 hover:shadow-[0_2px_8px_-2px_rgba(0,0,0,0.05)]",
                        "border-slate-100 shadow-[0_1px_2px_rgba(0,0,0,0.02)]"
                      )}
                    >
                        {/* Avatar / Initials */}
                      <div className={cn(
                        "h-8 w-8 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold mt-0.5 transition-colors",
                         isCompleted ? "bg-green-50 text-green-600 border border-green-100" : "bg-blue-50 text-blue-600 border border-blue-100 group-hover:bg-blue-100/50"
                      )}>
                        {session.initials}
                      </div>

                      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                        {/* Reason / Title - Primary */}
                        <p className={cn(
                            "text-sm font-semibold leading-tight truncate transition-colors",
                            isCompleted ? "text-slate-600" : "text-slate-800 group-hover:text-blue-700"
                        )}>
                            {session.title}
                        </p>
                        
                        {/* Patient Name - Subtext */}
                        <p className="text-[11px] text-slate-500 truncate font-medium">
                            {session.patientName}
                        </p> 

                        {/* Status/Time Row */}
                        <div className="flex items-center justify-between mt-2">
                             <div className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-md font-mono font-medium border border-slate-200/60">
                                {session.time}
                             </div>
                             
                             {/* Detailed Status Indicator */}
                             {isCompleted ? (
                                <div className="flex items-center gap-1 text-[10px] text-green-600 font-medium bg-green-50/50 px-1.5 py-0.5 rounded-full border border-green-100/50">
                                   <span className="w-1 h-1 rounded-full bg-green-500" />
                                   Done
                                </div>
                             ) : isCanceled ? (
                                <div className="flex items-center gap-1 text-[10px] text-red-600 font-medium bg-red-50/50 px-1.5 py-0.5 rounded-full border border-red-100/50">
                                   Cancelled
                                </div>
                             ) : (
                                <div className="flex items-center gap-1 text-[10px] text-sky-600 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                                   Open
                                </div>
                             )}
                        </div>
                      </div>
                    </div>
                );
              })}
            </div>
          </ScrollArea>
        ) : (
             <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                 <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center mb-3">
                    <Search className="h-5 w-5 text-slate-400" />
                 </div>
                 <p className="text-sm font-medium text-slate-600">No appointments</p>
                 <p className="text-xs text-slate-400 mt-1">Check back later or try a different search.</p>
             </div>
        )}
      </div>
    </div>
  );
}
