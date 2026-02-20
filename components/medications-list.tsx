"use client"

import * as React from "react"
import { format, addDays, isSameDay } from "date-fns"
import { Calendar as CalendarIcon, Clock, Check, Pill, User, Sun, Sunset, Moon } from "lucide-react"
import { cn } from "@/lib/utils"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose
} from "@/components/ui/dialog"
import {
  Card,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import {
   Pagination,
   PaginationContent,
   PaginationEllipsis,
   PaginationItem,
   PaginationLink,
   PaginationNext,
   PaginationPrevious,
} from "@/components/ui/pagination"

interface Medication {
  id: string
  name: string
  dosage: string
  frequency: string
  startDate: Date
  status: string
  doctorName: string
}

const getTimeSlots = (frequency: string) => {
  const f = frequency.toLowerCase()
  const slots = {
    morning: false,
    afternoon: false,
    evening: false
  }

  if (f.includes("morning") || f.includes("am")) slots.morning = true
  if (f.includes("noon") || f.includes("afternoon") || f.includes("lunch")) slots.afternoon = true
  if (f.includes("evening") || f.includes("night") || f.includes("pm") || f.includes("bed")) slots.evening = true
  
  if (f.includes("once daily") || f.includes("once a day")) slots.morning = true
  if (f.includes("twice daily") || f.includes("twice a day")) { slots.morning = true; slots.evening = true; }
  if (f.includes("three times")) { slots.morning = true; slots.afternoon = true; slots.evening = true; }

  if (!slots.morning && !slots.afternoon && !slots.evening) slots.morning = true

  return slots
}

const countActiveSlots = (frequency: string) => {
   const slots = getTimeSlots(frequency)
   return Number(slots.morning) + Number(slots.afternoon) + Number(slots.evening)
}

const slotMeta: Record<"morning" | "afternoon" | "evening", { icon: React.ElementType; className: string; label: string }> = {
   morning: {
      icon: Sun,
      className: "bg-yellow-100 text-yellow-700 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-800",
      label: "Morning"
   },
   afternoon: {
      icon: Sunset,
      className: "bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-800",
      label: "Evening"
   },
   evening: {
      icon: Moon,
      className: "bg-zinc-100 text-black border-zinc-300 dark:bg-zinc-800 dark:text-zinc-100 dark:border-zinc-600",
      label: "Night"
   }
}

const takenBadgeClass = "gap-1.5 py-1 px-2.5 border border-green-400 bg-green-200 text-green-900 dark:border-green-700 dark:bg-green-900/35 dark:text-green-200"

export default function MedicationsSchedule({ initialMedications }: { initialMedications: Medication[] }) {
  // Use state to force hydration match for dates
  const [days, setDays] = React.useState<Date[]>([])
  const [isClient, setIsClient] = React.useState(false)
   const [weekPage, setWeekPage] = React.useState(1)
   const totalWeekPages = 12

  React.useEffect(() => {
      const offset = (weekPage - 1) * 7
      setDays(Array.from({ length: 7 }, (_, i) => addDays(new Date(), offset + i)))
    setIsClient(true)
   }, [weekPage])

  const [takenLogs, setTakenLogs] = React.useState<Record<string, boolean>>({})

  const toggleTaken = (medId: string, dayStr: string, slot: string) => {
    const key = `${medId}-${dayStr}-${slot}`
    setTakenLogs(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const activeMeds = initialMedications.filter(m => m.status === "ACTIVE")
   const todayStr = format(new Date(), 'yyyy-MM-dd')
   const scheduledTodayCount = React.useMemo(
      () => activeMeds.reduce((total, med) => total + countActiveSlots(med.frequency), 0),
      [activeMeds]
   )
   const takenTodayCount = React.useMemo(
      () => Object.entries(takenLogs).filter(([key, value]) => key.includes(`-${todayStr}-`) && value).length,
      [takenLogs, todayStr]
   )

   const pageItems = React.useMemo(() => {
      const pages = new Set<number>([1, totalWeekPages, weekPage - 1, weekPage, weekPage + 1])
      return Array.from(pages).filter((page) => page >= 1 && page <= totalWeekPages).sort((a, b) => a - b)
   }, [weekPage])

  if (!isClient) {
     return <div className="p-8 text-center text-muted-foreground">Loading schedule...</div>
  }

   return (
      <div className="space-y-0">
         <header className="px-4 sm:px-5 py-3 border-b-2 border-border bg-background/95 backdrop-blur z-10">
         <div className="flex flex-col gap-2.5">
            <div className="flex items-start justify-between gap-3">
               <div className="flex items-center gap-3 min-w-0">
                  <div className="h-10 w-10 shrink-0 rounded-md border-2 border-black bg-yellow-300 flex items-center justify-center">
                     <Pill className="h-5 w-5 text-black stroke-2" />
                  </div>
                  <div className="flex flex-col min-w-0">
                     <div className="flex items-center gap-2 min-w-0">
                        <h2 className="text-lg sm:text-xl font-black tracking-tight text-foreground truncate">Medication Schedule</h2>
                        <Badge variant="outline" className="shrink-0 border-2 border-border bg-muted text-foreground font-semibold">Weekly</Badge>
                     </div>
                     <span className="text-sm text-muted-foreground mt-0.5 font-medium truncate">
                        Compact medication timeline with quick dose tracking.
                     </span>
                  </div>
               </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 text-sm">
               <Badge variant="outline" className="gap-1.5 py-1 border-2 border-border bg-muted/70">
                  <CalendarIcon className="h-3.5 w-3.5" />
                  {format(new Date(), "MMMM dd, yyyy")}
               </Badge>
               <Badge variant="outline" className="gap-1.5 py-1 border-2 border-border bg-muted/70">
                  <Clock className="h-3.5 w-3.5" />
                  <span className="inline-block w-8 text-center tabular-nums">{takenTodayCount}/{scheduledTodayCount}</span>
                  <span>Taken Today</span>
               </Badge>
               <Badge className="gap-1.5 py-1 px-2.5 border-2 border-primary bg-primary/15 text-primary font-bold">
                  <Pill className="h-3.5 w-3.5" />
                  {activeMeds.length} Active
               </Badge>
               <Badge className={takenBadgeClass}>
                  <Check className="h-3.5 w-3.5" />
                  Taken
               </Badge>
            </div>
         </div>
      </header>

         <Card className="border-0 shadow-none rounded-none overflow-hidden bg-background">
            <div className="overflow-hidden border border-border rounded-md bg-background">
          {/* Header Row */}
          <div className="grid grid-cols-[80px_1fr_1fr_1fr] sm:grid-cols-[120px_1fr_1fr_1fr] divide-x border-b border-border bg-muted/40 text-sm font-semibold">
            <div className="p-2 sm:p-4 flex items-center justify-center text-muted-foreground uppercase tracking-wide">Day</div>
            <div className="p-2 sm:p-4 flex items-center justify-center gap-2 text-black bg-amber-200/70 dark:text-black dark:bg-amber-900/35">
               <span className="hidden sm:inline">Morning</span>
               <span className="sm:hidden">AM</span>
            </div>
            <div className="p-2 sm:p-4 flex items-center justify-center gap-2 text-black bg-orange-200/70 dark:text-black dark:bg-orange-900/35">
               <span className="hidden sm:inline">Afternoon</span>
               <span className="sm:hidden">Mid</span>
            </div>
            <div className="p-2 sm:p-4 flex items-center justify-center gap-2 text-black bg-zinc-300/85 dark:text-black dark:bg-zinc-800/80">
               <span className="hidden sm:inline">Evening</span>
               <span className="sm:hidden">PM</span>
            </div>
          </div>

          {/* Days Rows */}
          <div className="divide-y">
            {days.map((day) => {
               const dayStr = format(day, 'yyyy-MM-dd')
               const isToday = isSameDay(day, new Date())

               return (
                  <div
                     key={dayStr}
                     className="grid grid-cols-[80px_1fr_1fr_1fr] sm:grid-cols-[120px_1fr_1fr_1fr] divide-x group hover:bg-muted/20 transition-colors"
                  >
                     {/* Date Column */}
                     <div className="p-2 sm:p-4 flex flex-col items-center justify-center text-center border-r border-border bg-background">
                        <span className="text-[10px] sm:text-xs uppercase text-muted-foreground">{format(day, 'EEE')}</span>
                        <span className="text-xl sm:text-2xl font-black">{format(day, 'd')}</span>
                        <span className="text-[10px] sm:text-xs uppercase tracking-wide text-muted-foreground">{format(day, 'MMM')}</span>
                        {isToday && <Badge className="mt-1 h-6 text-xs px-2 border-2 border-black bg-yellow-300 text-black font-black tracking-tight">Today</Badge>}
                     </div>

                     {/* Time Slots */}
                     {(['morning', 'afternoon', 'evening'] as const).map(slot => (
                        <div
                           key={slot}
                           className={cn(
                              "p-1 sm:p-2 space-y-1 sm:space-y-2 relative min-h-[80px]",
                              slot === "morning" && "bg-amber-50/35 dark:bg-amber-900/10",
                              slot === "afternoon" && "bg-orange-50/40 dark:bg-orange-900/10",
                              slot === "evening" && "bg-zinc-100/55 dark:bg-zinc-900/30"
                           )}
                        >
                           {activeMeds.map(med => {
                              const slots = getTimeSlots(med.frequency)
                              if (!slots[slot]) return null
                              
                              const logKey = `${med.id}-${dayStr}-${slot}`
                              const isTaken = takenLogs[logKey]
                              const meta = slotMeta[slot]
                              const SlotIcon = meta.icon

                              return (
                                 <MedicationDetailDialog 
                                    key={med.id + slot} 
                                    med={med} 
                                    slot={slot} 
                                    day={day}
                                    isTaken={isTaken}
                                    onToggle={() => toggleTaken(med.id, dayStr, slot)}
                                 >
                                    <div className="relative w-full">
                                       <Checkbox
                                          checked={isTaken}
                                          onCheckedChange={() => toggleTaken(med.id, dayStr, slot)}
                                          onClick={(event) => event.stopPropagation()}
                                          onPointerDown={(event) => event.stopPropagation()}
                                          aria-label={`Mark ${med.name} as taken`}
                                          className="absolute right-2 top-2 z-10 border-black data-[state=checked]:border-black data-[state=checked]:bg-black data-[state=checked]:text-white"
                                       />

                                       <div
                                          className="w-full text-left text-xs p-1.5 sm:p-2 pr-8 rounded-md border shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md flex items-start gap-1.5 sm:gap-2 bg-background hover:bg-accent/40 border-border"
                                       >
                                          <div className={cn(
                                             "w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full shrink-0 mt-1.5",
                                             isTaken ? "bg-green-500" : "bg-primary"
                                          )} />
                                          <div className="flex-1 min-w-0 space-y-1">
                                             <div className="flex items-center justify-between gap-1 pr-2">
                                                <div className="flex items-center gap-1.5 min-w-0">
                                                   <span className="font-semibold block truncate leading-tight text-[11px] sm:text-sm">{med.name}</span>
                                                   <span className={cn("inline-flex items-center rounded-md border px-1 py-0.5", meta.className)} title={meta.label}>
                                                      <SlotIcon className="h-3 w-3" />
                                                   </span>
                                                </div>
                                             </div>
                                             <div className="flex items-end justify-between gap-2">
                                                <span className="block text-xs text-muted-foreground truncate opacity-90">{med.dosage}</span>
                                                <Badge
                                                   variant="secondary"
                                                   className={cn(takenBadgeClass, !isTaken && "opacity-0 pointer-events-none")}
                                                >
                                                   <Check className="h-3.5 w-3.5" />
                                                   Taken
                                                </Badge>
                                             </div>
                                          </div>
                                       </div>
                                    </div>
                                 </MedicationDetailDialog>
                              )
                           })}
                        </div>
                     ))}
                  </div>
               )
            })}
          </div>
        </div>
      </Card>

      <div className="border-x border-b border-border rounded-b-md bg-background px-2 py-3 sm:px-4">
         <Pagination>
            <PaginationContent>
               <PaginationItem>
                  <PaginationPrevious
                     href="#"
                     onClick={(event) => {
                        event.preventDefault()
                        if (weekPage > 1) setWeekPage((prev) => prev - 1)
                     }}
                     className={cn(weekPage === 1 && "pointer-events-none opacity-50")}
                  />
               </PaginationItem>

               {pageItems.map((page, index) => {
                  const previousPage = pageItems[index - 1]
                  const showEllipsis = previousPage && page - previousPage > 1

                  return (
                     <React.Fragment key={page}>
                        {showEllipsis ? (
                           <PaginationItem>
                              <PaginationEllipsis />
                           </PaginationItem>
                        ) : null}
                        <PaginationItem>
                           <PaginationLink
                              href="#"
                              isActive={page === weekPage}
                              onClick={(event) => {
                                 event.preventDefault()
                                 setWeekPage(page)
                              }}
                           >
                              {page}
                           </PaginationLink>
                        </PaginationItem>
                     </React.Fragment>
                  )
               })}

               <PaginationItem>
                  <PaginationNext
                     href="#"
                     onClick={(event) => {
                        event.preventDefault()
                        if (weekPage < totalWeekPages) setWeekPage((prev) => prev + 1)
                     }}
                     className={cn(weekPage === totalWeekPages && "pointer-events-none opacity-50")}
                  />
               </PaginationItem>
            </PaginationContent>
         </Pagination>
      </div>
    </div>
  )
}

function MedicationDetailDialog({ 
   med, 
   slot, 
   day, 
   isTaken, 
   onToggle, 
   children 
}: { 
   med: Medication, 
   slot: string, 
   day: Date,
   isTaken: boolean,
   onToggle: () => void,
   children: React.ReactNode 
}) {
   return (
      <Dialog>
         <DialogTrigger asChild>
            {children}
         </DialogTrigger>
         <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
               <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 bg-primary/10 rounded-full">
                     <Pill className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                     <DialogTitle className="text-xl">{med.name}</DialogTitle>
                     <DialogDescription className="text-foreground font-medium">{med.dosage}</DialogDescription>
                  </div>
               </div>
            </DialogHeader>

            <div className="space-y-4 py-4">
               {/* Context Badge */}
               <div className="flex items-center gap-2 p-3 bg-muted rounded-lg text-sm">
                  <CalendarIcon className="w-4 h-4 text-muted-foreground" />
                  <span className="font-medium">
                     {format(day, 'EEEE, MMMM do')} • <span className="capitalize">{slot}</span>
                  </span>
               </div>

               {/* Details Grid */}
               <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="space-y-1">
                     <span className="text-muted-foreground text-xs uppercase tracking-wider">Frequency</span>
                     <div className="flex items-center gap-1.5">
                        <Clock className="w-4 h-4 text-primary" />
                        <span>{med.frequency}</span>
                     </div>
                  </div>
                  <div className="space-y-1">
                     <span className="text-muted-foreground text-xs uppercase tracking-wider">Prescribed By</span>
                     <div className="flex items-center gap-1.5">
                        <User className="w-4 h-4 text-primary" />
                        <span className="truncate" title={med.doctorName}>{med.doctorName}</span>
                     </div>
                  </div>
               </div>
               
               {/* Status */}
               <div className="space-y-1">
                  <span className="text-muted-foreground text-xs uppercase tracking-wider">Instructions</span>
                  <p className="text-sm bg-accent/50 p-3 rounded-md border text-muted-foreground">
                     Take this medication with water. Do not skip doses. If you experience dizziness, contact your provider.
                  </p>
               </div>
            </div>

            <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0">
               <div className="flex items-center gap-2 mr-auto">
                  <Checkbox id="taken" checked={isTaken} onCheckedChange={onToggle} />
                  <label htmlFor="taken" className="text-sm font-medium cursor-pointer">
                     Mark as taken
                  </label>
               </div>
               <DialogClose asChild>
                  <Button type="button" variant="secondary">Close</Button>
               </DialogClose>
            </DialogFooter>
         </DialogContent>
      </Dialog>
   )
}
