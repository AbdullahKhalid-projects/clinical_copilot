"use client"

import * as React from "react"
import { format, addDays, isSameDay } from "date-fns"
import { Calendar as CalendarIcon, Clock, Info, Check, Pill, User, AlertCircle } from "lucide-react"
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
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea } from "@/components/ui/scroll-area"

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

export default function MedicationsSchedule({ initialMedications }: { initialMedications: Medication[] }) {
  // Use state to force hydration match for dates
  const [days, setDays] = React.useState<Date[]>([])
  const [isClient, setIsClient] = React.useState(false)

  React.useEffect(() => {
    setDays(Array.from({ length: 7 }, (_, i) => addDays(new Date(), i)))
    setIsClient(true)
  }, [])

  const [takenLogs, setTakenLogs] = React.useState<Record<string, boolean>>({})

  const toggleTaken = (medId: string, dayStr: string, slot: string) => {
    const key = `${medId}-${dayStr}-${slot}`
    setTakenLogs(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const activeMeds = initialMedications.filter(m => m.status === "ACTIVE")

  if (!isClient) {
     return <div className="p-8 text-center text-muted-foreground">Loading schedule...</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
         <div>
            <h2 className="text-2xl font-bold tracking-tight">Weekly Schedule</h2>
            <p className="text-muted-foreground">Your medication timeline for the upcoming week.</p>
         </div>
         <div className="flex items-center gap-2">
            <Badge variant="outline" className="gap-1 py-1">
               <div className="w-2 h-2 rounded-full bg-green-500" />
               Taken
            </Badge>
            <Badge variant="outline" className="gap-1 py-1">
               <div className="w-2 h-2 rounded-full bg-primary" />
               Scheduled
            </Badge>
         </div>
      </div>

      <Card>
        <div className="rounded-md border overflow-hidden">
          {/* Header Row */}
          <div className="grid grid-cols-[80px_1fr_1fr_1fr] sm:grid-cols-[120px_1fr_1fr_1fr] divide-x border-b bg-muted/40 text-sm font-medium">
            <div className="p-2 sm:p-4 flex items-center justify-center text-muted-foreground">Day</div>
            <div className="p-2 sm:p-4 flex items-center justify-center gap-2 text-orange-600 bg-orange-50/50">
               <span className="hidden sm:inline">Morning</span>
               <span className="sm:hidden">AM</span>
            </div>
            <div className="p-2 sm:p-4 flex items-center justify-center gap-2 text-yellow-600 bg-yellow-50/50">
               <span className="hidden sm:inline">Afternoon</span>
               <span className="sm:hidden">Mid</span>
            </div>
            <div className="p-2 sm:p-4 flex items-center justify-center gap-2 text-indigo-600 bg-indigo-50/50">
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
                  <div key={dayStr} className="grid grid-cols-[80px_1fr_1fr_1fr] sm:grid-cols-[120px_1fr_1fr_1fr] divide-x group hover:bg-muted/5 transition-colors">
                     {/* Date Column */}
                     <div className={cn("p-2 sm:p-4 flex flex-col items-center justify-center text-center", isToday ? "bg-primary/5 font-semibold text-primary" : "")}>
                        <span className="text-[10px] sm:text-xs uppercase text-muted-foreground">{format(day, 'EEE')}</span>
                        <span className="text-xl sm:text-2xl font-bold">{format(day, 'd')}</span>
                        {isToday && <Badge variant="secondary" className="mt-1 h-5 text-[10px] px-1">Today</Badge>}
                     </div>

                     {/* Time Slots */}
                     {(['morning', 'afternoon', 'evening'] as const).map(slot => (
                        <div key={slot} className="p-1 sm:p-2 space-y-1 sm:space-y-2 relative min-h-[80px]">
                           {activeMeds.map(med => {
                              const slots = getTimeSlots(med.frequency)
                              if (!slots[slot]) return null
                              
                              const logKey = `${med.id}-${dayStr}-${slot}`
                              const isTaken = takenLogs[logKey]

                              return (
                                 <MedicationDetailDialog 
                                    key={med.id + slot} 
                                    med={med} 
                                    slot={slot} 
                                    day={day}
                                    isTaken={isTaken}
                                    onToggle={() => toggleTaken(med.id, dayStr, slot)}
                                 >
                                    <button 
                                       className={cn(
                                          "w-full text-left text-xs p-1.5 sm:p-2 rounded-md border shadow-sm transition-all hover:scale-[1.02] flex items-center gap-1.5 sm:gap-2",
                                          isTaken 
                                             ? "bg-green-50 border-green-200 text-green-700 dark:bg-green-900/20 dark:border-green-900/50 dark:text-green-400" 
                                             : "bg-surface hover:bg-card border-border bg-white dark:bg-zinc-900"
                                       )}
                                    >
                                       <div className={cn(
                                          "w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full shrink-0",
                                          isTaken ? "bg-green-500" : "bg-primary"
                                       )} />
                                       <div className="flex-1 min-w-0">
                                          <span className="font-semibold block truncate leading-tight text-[11px] sm:text-sm">{med.name}</span>
                                          <span className="hidden sm:block text-[10px] text-muted-foreground truncate opacity-80">{med.dosage}</span>
                                       </div>
                                       {isTaken && <Check className="w-3 h-3 shrink-0" />}
                                    </button>
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
