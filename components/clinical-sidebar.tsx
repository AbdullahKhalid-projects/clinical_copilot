"use client";

import * as React from "react";
import {
  Search,
  ArrowUpDown,
  RefreshCw,
  Clock,
  FlaskConical,
  MoreVertical,
  ChevronRight,
  Sparkles,
  ChevronLeft
} from "lucide-react";

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

// Dummy data for appointments
const appointments = [
  {
    date: "10/02/2026",
    sessions: [
      { id: 1, time: "2:34PM", title: "Untitled session", status: "upcoming" },
      { id: 2, time: "2:28PM", title: "Untitled session", status: "upcoming" },
      { id: 21, time: "11:30AM", title: "Untitled session", status: "upcoming" },
      { id: 22, time: "09:15AM", title: "Untitled session", status: "upcoming" },
    ]
  },
  {
    date: "09/02/2026",
    sessions: [
      { id: 3, time: "7:17PM", title: "Untitled session", status: "past" },
      { id: 4, time: "6:42PM", title: "Untitled session", status: "past" },
      { id: 5, time: "4:15PM", title: "Untitled session", status: "past" },
      { id: 6, time: "2:00PM", title: "Untitled session", status: "past" },
    ]
  },
  {
    date: "08/02/2026",
    sessions: [
      { id: 7, time: "5:30PM", title: "Untitled session", status: "past" },
      { id: 8, time: "3:45PM", title: "Untitled session", status: "past" },
      { id: 9, time: "1:20PM", title: "Untitled session", status: "past" },
    ]
  },
  {
    date: "07/02/2026",
    sessions: [
      { id: 10, time: "4:10PM", title: "Untitled session", status: "past" },
      { id: 11, time: "2:50PM", title: "Untitled session", status: "past" },
      { id: 12, time: "11:00AM", title: "Untitled session", status: "past" },
      { id: 13, time: "09:30AM", title: "Untitled session", status: "past" },
    ]
  },
  {
    date: "06/02/2026",
    sessions: [
      { id: 14, time: "6:00PM", title: "Untitled session", status: "past" },
      { id: 15, time: "4:45PM", title: "Untitled session", status: "past" },
      { id: 16, time: "3:15PM", title: "Untitled session", status: "past" },
    ]
  }
];

const ITEMS_PER_PAGE = 10;

type ListItem = 
  | { type: 'header'; date: string; id: string }
  | { type: 'session'; id: number; time: string; title: string; status: string; date: string };

// Helper to determine if a date string is in the future
// Assuming DD/MM/YYYY format based on data: "10/02/2026", "09/02/2026", "06/02/2026"
// Comparing against current date context: "February 13, 2026"
function isFutureDate(dateStr: string): boolean {
  const [day, month, year] = dateStr.split('/').map(Number);
  const date = new Date(year, month - 1, day);
  const today = new Date(2026, 1, 13); // Feb 13, 2026
  
  // Reset hours for pure date comparison
  date.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  
  return date >= today;
}

function filterAppointments(data: typeof appointments, tab: "upcoming" | "past") {
    return data.filter(group => {
        const isFuture = isFutureDate(group.date);
        return tab === "upcoming" ? isFuture : !isFuture;
    });
}

function flattenAndPaginate(data: typeof appointments, itemsPerPage: number): ListItem[][] {
  // 1. Flatten
  const flattened: ListItem[] = [];
  data.forEach(group => {
    // Only push header if there are sessions
    if (group.sessions.length > 0) {
       flattened.push({ type: 'header', date: group.date, id: `header-${group.date}` });
       group.sessions.forEach(session => {
         flattened.push({ type: 'session', ...session, date: group.date });
       });
    }
  });

  if (flattened.length === 0) return [];

  // 2. Paginate
  const pages: ListItem[][] = [];
  let currentPage: ListItem[] = [];

  for (let i = 0; i < flattened.length; i++) {
     const item = flattened[i];
     
     // Check if current page is full
     if (currentPage.length >= itemsPerPage) {
        
        // Anti-orphan rule: don't leave a header as the last item of a page
        const lastItem = currentPage[currentPage.length - 1];
        if (lastItem.type === 'header') {
           currentPage.pop();
           pages.push([...currentPage]); // Push copy of valid page
           // Start new page with that header
           currentPage = [lastItem];
        } else {
           pages.push([...currentPage]);
           currentPage = [];
        }
     }

     // Inject repeated header if this is the start of a new page (or effective start)
     // and the item is a session
     if (currentPage.length === 0 && item.type === 'session') {
         // Create a synthetic header for display context
         // We give it a unique ID to satisfy React keys
         currentPage.push({ 
             type: 'header', 
             date: item.date, 
             id: `header-repeated-${item.date}-${pages.length}` 
         });
         
         // If adding this header filled the page (itemsPerPage=1 edge case), unlikely but possible
         if (currentPage.length >= itemsPerPage) {
             // We can't end with a header, so we just continue to add the session 
             // which will be handled by the next loop check or just adding it now?
             // Actually, if we just added a header, we NEED to add the session to not have an orphan header.
             // So we proceed to add `item` below regardless of limit for this one edge case.
             // But to be cleaner, we let it flow. The limit check is at the START of the loop.
         }
     }

     currentPage.push(item);
  }

  // Final push
  if (currentPage.length > 0) {
     const lastItem = currentPage[currentPage.length - 1];
     if (lastItem.type === 'header') {
         // If a page ends with a header and there's no more content, discard it
         currentPage.pop();
     }
     if (currentPage.length > 0) {
        pages.push(currentPage);
     }
  }

  return pages;
}

export function ClinicalSidebar() {
  const [isSearchOpen, setIsSearchOpen] = React.useState(false);
  const [currentPage, setCurrentPage] = React.useState(1);
  const [activeTab, setActiveTab] = React.useState<"upcoming" | "past">("upcoming");

  // Filter based on active tab
  const filteredAppointments = React.useMemo(() => 
    filterAppointments(appointments, activeTab), 
  [activeTab]);

  // Memoize pagination calculation
  const pages = React.useMemo(() => flattenAndPaginate(filteredAppointments, ITEMS_PER_PAGE), [filteredAppointments]);
  const totalPages = pages.length;
  
  // Ensure current page is valid when switching tabs
  React.useEffect(() => {
    setCurrentPage(1);
  }, [activeTab]);

  const safeCurrentPage = totalPages > 0 ? Math.min(Math.max(1, currentPage), totalPages) : 1;
  const currentItems = totalPages > 0 ? pages[safeCurrentPage - 1] : [];

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  return (
    <div className="w-[17rem] h-svh sticky top-0 border-r bg-white text-sidebar-foreground flex flex-col transition-all duration-300 ease-in-out" data-sidebar="sub-sidebar">
      {/* Header */}
      <div className="p-4 flex flex-col gap-4">
        {/* Top actions */}
        <div className="flex items-center justify-end gap-2 text-sidebar-foreground/70">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setIsSearchOpen(!isSearchOpen)}>
            <Search className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowUpDown className="h-4 w-4" />
          </Button>
        </div>

        {/* Search Bar */}
        {isSearchOpen && (
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search"
              className="w-full pl-9 bg-background"
            />
          </div>
        )}

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "upcoming" | "past")} className="w-full">
          <TabsList className="grid w-full grid-cols-2 bg-transparent p-0 gap-4 border-b rounded-none h-auto">
            <TabsTrigger 
              value="upcoming" 
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-0 pb-2 bg-transparent font-medium"
            >
              Upcoming 
              {/* Count logic assumes we want total session count here, we can calculate it dynamically if needed */}
              <span className="ml-2 bg-muted-foreground/10 text-xs px-1.5 py-0.5 rounded-full">
                 {filterAppointments(appointments, "upcoming").reduce((acc, curr) => acc + curr.sessions.length, 0)}
              </span>
            </TabsTrigger>
            <TabsTrigger 
              value="past" 
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-0 pb-2 bg-transparent font-medium"
            >
              Past
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {currentItems.length > 0 ? (
          <ScrollArea className="flex-1">
            <div className="p-4 space-y-2">
              {currentItems.map((item) => {
                if (item.type === 'header') {
                  return (
                    <h3 key={item.id} className="text-sm font-medium text-muted-foreground pt-2 pb-1 sticky top-0 bg-white/95 backdrop-blur-sm z-10 w-full">
                      {item.date}
                    </h3>
                  );
                }
                
                const session = item;
                return (
                    <div 
                      key={session.id} 
                      className={cn(
                        "flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors group",
                        session.id === 4 ? "bg-sidebar-accent text-sidebar-accent-foreground" : "hover:bg-sidebar-accent/50"
                      )}
                    >
                      <div className={cn(
                        "h-8 w-8 rounded-full border flex items-center justify-center shrink-0",
                        session.id === 4 ? "border-primary/20 bg-background" : "bg-transparent"
                      )}>
                        <RefreshCw className={cn("h-4 w-4", session.id === 4 ? "text-primary" : "text-muted-foreground")} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium leading-none truncate">{session.title}</p>
                        <p className="text-xs text-muted-foreground mt-1">{session.time}</p>
                      </div>
                    </div>
                );
              })}
            </div>
          </ScrollArea>
        ) : (
           <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-4 text-center">
             <div className="bg-stone-50 p-3 rounded-full mb-3">
                <Clock className="w-6 h-6 text-muted-foreground/50" />
             </div>
             <p className="text-sm font-medium">No appointments</p>
             <p className="text-xs mt-1 text-muted-foreground/70">
               {activeTab === "upcoming" ? "You're all caught up for now." : "No past sessions found."}
             </p>
           </div>
        )}

        {/* Pagination - Always show at bottom (sticky footer logic inside container) */}
        <div className="p-2 border-t bg-white mt-auto shrink-0 min-h-[50px] flex items-center">
          <Pagination>
            <PaginationContent className="w-full flex justify-between gap-0">
              <PaginationItem>
               <Button
                 variant="ghost"
                 size="icon"
                 disabled={totalPages <= 1 || safeCurrentPage === 1}
                 className={cn("h-8 w-8", (totalPages <= 1 || safeCurrentPage === 1) && "pointer-events-none opacity-50")}
                 onClick={() => handlePageChange(Math.max(1, safeCurrentPage - 1))}
               >
                 <ChevronLeft className="h-4 w-4" />
               </Button>
              </PaginationItem>
              
              <div className="text-xs text-muted-foreground font-medium flex items-center">
                {totalPages > 0 ? safeCurrentPage : 1} of {Math.max(1, totalPages)}
              </div>

              <PaginationItem>
                 <Button
                    variant="ghost"
                    size="icon"
                    disabled={totalPages <= 1 || safeCurrentPage === totalPages}
                    className={cn("h-8 w-8", (totalPages <= 1 || safeCurrentPage === totalPages) && "pointer-events-none opacity-50")}
                    onClick={() => handlePageChange(Math.min(totalPages, safeCurrentPage + 1))}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      </div>
    </div>
  );
}
