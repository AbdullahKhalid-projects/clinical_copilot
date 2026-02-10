"use client";

import { useState } from "react";
import { 
  Plus, 
  MoreHorizontal, 
  ArrowUpDown, 
  ListTodo, 
  Calendar as CalendarIcon,
  Check,
  User,
  UserMinus
} from "lucide-react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Patient {
  id: string;
  name: string;
  initials: string;
  email: string;
  phone: string | null;
  dateOfBirth: Date | null;
  gender: string | null;
  lastVisit: Date | null;
  nextAppointment: Date | null;
  status: "Upcoming" | "Past";
  condition: string | null;
}

export default function PatientsClient({ patients }: { patients: Patient[] }) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [genderFilter, setGenderFilter] = useState<string | null>(null);
  const [dateFilter, setDateFilter] = useState<Date | undefined>(undefined);

  const filteredPatients = patients.filter((patient) => {
      const matchesSearch = 
        patient.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        patient.email.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesStatus = statusFilter ? patient.status === statusFilter : true;
      
      const matchesGender = genderFilter 
        ? patient.gender?.toLowerCase() === genderFilter.toLowerCase() 
        : true;

      const matchesDate = dateFilter 
        ? patient.lastVisit && new Date(patient.lastVisit).toDateString() === dateFilter.toDateString()
        : true;

      return matchesSearch && matchesStatus && matchesGender && matchesDate;
  });

  const handlePatientClick = (id: string) => {
    router.push(`/doctor/patients/${id}`);
  };

  const formatDate = (date: Date | null) => {
      if (!date) return "-";
      return new Date(date).toLocaleDateString("en-US", {
          year: 'numeric',
          month: 'short',
          day: 'numeric'
      });
  }

  const clearFilters = () => {
      setSearchQuery("");
      setStatusFilter(null);
      setGenderFilter(null);
      setDateFilter(undefined);
  }

  const hasFilters = searchQuery || statusFilter || genderFilter || dateFilter;

  return (
    <div className="h-full flex-1 flex-col space-y-6 px-8 pt-4 pb-8 md:flex">
      <div className="flex items-center justify-between pb-6 border-b">
        <div>
          <h2 className="text-4xl font-bold tracking-tight font-serif text-[#1e1e1e]">Patients</h2>
          <p className="text-muted-foreground mt-2">
            View your patients, and their details
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button className="bg-[#3e2b2b] hover:bg-[#2e1b1b] text-white">
             <Plus className="mr-2 h-4 w-4" /> New patient
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex flex-1 items-center space-x-2">
            <Input
              placeholder="Search for a task or patient"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="h-10 w-[150px] lg:w-[320px] bg-white"
            />
            
            {/* Status Filter */}
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-10 border-dashed bg-white mx-1 my-1">
                        <Check className="mr-2 h-4 w-4" />
                        Status
                        {statusFilter && (
                            <>
                                <DropdownMenuSeparator className="mx-2 h-4" />
                                <Badge variant="secondary" className="rounded-sm px-1 font-normal">
                                    {statusFilter}
                                </Badge>
                            </>
                        )}
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-[150px]">
                    <DropdownMenuLabel>Filter by Status</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setStatusFilter("Upcoming")}>
                        <div className={cn("mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary", statusFilter === "Upcoming" ? "bg-primary text-primary-foreground" : "opacity-50 [&_svg]:invisible")}>
                            <Check className={cn("h-4 w-4")} />
                        </div>
                        <Badge className="bg-green-500 hover:bg-green-600">Upcoming</Badge>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setStatusFilter("Past")}>
                        <div className={cn("mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary", statusFilter === "Past" ? "bg-primary text-primary-foreground" : "opacity-50 [&_svg]:invisible")}>
                             <Check className={cn("h-4 w-4")} />
                        </div>
                         <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 hover:bg-yellow-200 border-yellow-200">Past</Badge>
                    </DropdownMenuItem>
                    {statusFilter && (
                        <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem 
                                onClick={() => setStatusFilter(null)}
                                className="justify-center text-center"
                            >
                                Clear filters
                            </DropdownMenuItem>
                        </>
                    )}
                </DropdownMenuContent>
            </DropdownMenu>

            {/* Gender Filter */}
             <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-10 border-dashed bg-white mx-1">
                        <ListTodo className="mr-2 h-4 w-4" />
                        Gender
                        {genderFilter && (
                            <>
                                <DropdownMenuSeparator className="mx-2 h-4" />
                                <Badge variant="secondary" className="rounded-sm px-1 font-normal">
                                    {genderFilter}
                                </Badge>
                            </>
                        )}
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-[150px]">
                    <DropdownMenuLabel>Filter by Gender</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setGenderFilter("Male")}>
                        <div className={cn("mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary", genderFilter === "Male" ? "bg-primary text-primary-foreground" : "opacity-50 [&_svg]:invisible")}>
                             <Check className={cn("h-4 w-4")} />
                        </div>
                        <User className="mr-2 h-4 w-4 text-blue-500" />
                        <span>Male</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setGenderFilter("Female")}>
                         <div className={cn("mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary", genderFilter === "Female" ? "bg-primary text-primary-foreground" : "opacity-50 [&_svg]:invisible")}>
                             <Check className={cn("h-4 w-4")} />
                        </div>
                        <User className="mr-2 h-4 w-4 text-pink-500" />
                        <span>Female</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setGenderFilter("Other")}>
                         <div className={cn("mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary", genderFilter === "Other" ? "bg-primary text-primary-foreground" : "opacity-50 [&_svg]:invisible")}>
                             <Check className={cn("h-4 w-4")} />
                        </div>
                        <UserMinus className="mr-2 h-4 w-4 text-slate-500" />
                        <span>Other</span>
                    </DropdownMenuItem>
                     {genderFilter && (
                        <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem 
                                onClick={() => setGenderFilter(null)}
                                className="justify-center text-center"
                            >
                                Clear filters
                            </DropdownMenuItem>
                        </>
                    )}
                </DropdownMenuContent>
            </DropdownMenu>

            {/* Last Visit Date Filter */}
             <Popover>
                <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="h-10 border-dashed bg-white mx-1">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        Last Visit
                         {dateFilter && (
                            <>
                                <DropdownMenuSeparator className="mx-2 h-4" />
                                <Badge variant="secondary" className="rounded-sm px-1 font-normal">
                                    {format(dateFilter, "MMM d")}
                                </Badge>
                            </>
                        )}
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                        mode="single"
                        selected={dateFilter}
                        onSelect={setDateFilter}
                        initialFocus
                    />
                </PopoverContent>
            </Popover>
            
            {hasFilters && (
              <Button
                variant="ghost"
                onClick={clearFilters}
                className="h-10 px-2 lg:px-3"
              >
                Reset filters
                <DropdownMenuSeparator className="mx-2 h-4 w-[1px] bg-slate-200 rotate-12" />
                <ListTodo className="ml-1 h-3 w-3 rotate-90" />
              </Button>
            )}
          </div>
        </div>
        
        <div className="rounded-md border bg-white overflow-hidden">
          <Table>
            <TableHeader className="bg-[#FFFBF5]">
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[50px]">
                </TableHead>
                <TableHead className="w-[300px] text-zinc-800 font-semibold">
                   <Button variant="ghost" className="-ml-4 h-8 font-semibold hover:bg-transparent hover:text-zinc-900">
                      Patient
                      <ArrowUpDown className="ml-2 h-4 w-4" />
                   </Button>
                </TableHead>
                 <TableHead className="text-zinc-800 font-semibold">Gender</TableHead>
                 <TableHead className="text-zinc-800 font-semibold">Status</TableHead>
                 <TableHead className="text-zinc-800 font-semibold">Last Visit</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPatients.length > 0 ? (
                filteredPatients.map((patient) => (
                  <TableRow
                    key={patient.id}
                    className="cursor-pointer"
                    onClick={() => handlePatientClick(patient.id)}
                  >
                    <TableCell onClick={(e) => e.stopPropagation()}>
                        <Avatar className="h-8 w-8">
                            <AvatarFallback>{patient.initials}</AvatarFallback>
                        </Avatar>
                    </TableCell>
                    <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                            <span className="truncate font-bold">{patient.name}</span>
                        </div>
                    </TableCell>
                     <TableCell>{patient.gender || "-"}</TableCell>
                    <TableCell>
                        {patient.status === 'Upcoming' ? (
                            <Badge className="bg-green-500 hover:bg-green-600">
                                {patient.status}
                            </Badge>
                        ) : (
                            <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 hover:bg-yellow-200 border-yellow-200">
                                {patient.status}
                            </Badge>
                        )}
                    </TableCell>
                    <TableCell>
                        {formatDate(patient.lastVisit)}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" className="h-8 w-8 p-0">
                                    <span className="sr-only">Open menu</span>
                                    <MoreHorizontal className="h-4 w-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                <DropdownMenuItem onClick={() => handlePatientClick(patient.id)}>View Details</DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem>Edit Patient</DropdownMenuItem>
                                <DropdownMenuItem className="text-destructive">Delete Patient</DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="h-24 text-center"
                  >
                    No results.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
