"use client";

import React from "react";
import {
  Calendar,
  ClipboardList,
  FileText,
  FlaskConical,
  LayoutDashboard,
  MessageSquare,
  Pill,
  StickyNote,
  Users,
  AudioLines,
  Settings,
  HelpCircle,
  Plus,
  ChevronsUpDown,
  LogOut,
  BadgeCheck,
  ChevronRight,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUser, useClerk } from "@clerk/nextjs";

import {
  Sidebar as ShadcnSidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarTrigger,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar";
import { ClinicalSidebar } from "@/components/clinical-sidebar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
}

// Patient Items (Kept as one group for now)
const patientNavItems: NavItem[] = [
  { label: "Dashboard", href: "/patient/dashboard", icon: LayoutDashboard },
  { label: "Visit Summaries", href: "/patient/visit-summaries", icon: ClipboardList },
  { label: "Transcripts", href: "/patient/transcripts", icon: MessageSquare },
  { label: "Labs & Imaging", href: "/patient/labs", icon: FlaskConical },
  { label: "My Notes", href: "/patient/notes", icon: StickyNote },
  { label: "Medications", href: "/patient/medications", icon: Pill },
];

// Doctor Group 1: Menu
const doctorMenuItems: NavItem[] = [
  { label: "Dashboard", href: "/doctor/dashboard", icon: LayoutDashboard },
  { label: "Clinical Session", href: "/doctor/clinical-session", icon: AudioLines },
];

// Doctor Group 2: My Space
const doctorSpaceItems: NavItem[] = [
  { label: "My Patients", href: "/doctor/patients", icon: Users },
  { label: "Schedule", href: "/doctor/schedule", icon: Calendar },
  { label: "Post-Visit Editor", href: "/doctor/post-visit", icon: FileText },
];

const bottomItems: NavItem[] = [
  { label: "Settings", href: "/doctor/settings", icon: Settings },
];

interface SidebarProps {
  role: "doctor" | "patient";
}

export function Sidebar({ role }: SidebarProps) {
  const pathname = usePathname();
  const { user } = useUser();
  const { signOut, openUserProfile } = useClerk();
  const { isMobile } = useSidebar();
  const [isClinicalSidebarOpen, setIsClinicalSidebarOpen] = React.useState(false);

  // Close clinical sidebar when navigating away from clinical session
  React.useEffect(() => {
    if (pathname !== "/doctor/clinical-session") {
      setIsClinicalSidebarOpen(false);
    }
  }, [pathname]);

  // Define groups based on role
  const navGroups = role === "doctor" 
    ? [
        { label: "Menu", items: doctorMenuItems },
        { label: "My Space", items: doctorSpaceItems }
      ]
    : [
        { label: "Menu", items: patientNavItems }
      ];

  return (
    <>
    <ShadcnSidebar collapsible="icon" className="border-r bg-sidebar">
      <SidebarHeader className="h-fit gap-0 p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            {/* Header Box */}
            <div className="flex w-full items-center justify-between rounded-lg bg-sky-300 p-3 transition-all duration-300 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-2">
              <span className="whitespace-nowrap text-lg font-black tracking-tight text-black group-data-[collapsible=icon]:hidden w-full text-center">
                Shifa Scribe
              </span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <SidebarTrigger className="text-black hover:bg-black/10 shrink-0" />
                </TooltipTrigger>
                <TooltipContent side="right">Toggle Sidebar</TooltipContent>
              </Tooltip>
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
        
        <SidebarMenu className="mt-3">
            {/* Button Container */}
            <SidebarMenuItem className="px-1-4"> 
               <Button 
                   className="w-full justify-center gap-2 bg-primary text-primary-foreground hover:bg-black hover:text-white group-data-[collapsible=icon]:hidden shadow-md h-10 font-semibold" 
               >
                    <Plus className="h-4 w-4" /> 
                    <span>New Appointment</span>
               </Button>
               
               <Tooltip>
                 <TooltipTrigger asChild>
                    <Button 
                        className="h-9 w-9 p-0 hidden group-data-[collapsible=icon]:flex mx-auto bg-primary text-primary-foreground hover:bg-black hover:text-white rounded-lg" 
                        size="icon"
                    >
                        <Plus className="h-5 w-5" />
                    </Button>
                 </TooltipTrigger>
                 <TooltipContent side="right">New Appointment</TooltipContent>
               </Tooltip>
            </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {navGroups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel className="uppercase tracking-wider text-xs font-semibold text-muted-foreground/70">
              {group.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const isClinicalSession = item.label === "Clinical Session";
                  // Active state is driven by path, except for Clinical Session which is just a trigger
                  const isActive = isClinicalSession ? false : pathname === item.href;
                  
                  return (
                    <SidebarMenuItem key={item.label}>
                      <SidebarMenuButton 
                        asChild={!isClinicalSession} 
                        isActive={isActive}
                        tooltip={item.label}
                        className={`
                          transition-all duration-200 
                          ${isActive ? "font-medium bg-stone-100 text-primary border-l-4 border-primary rounded-r-lg rounded-l-none pl-3" : "text-muted-foreground pl-4"}
                          ${isClinicalSession ? "cursor-pointer hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" : ""}
                        `}
                        onClick={(e) => {
                           if (isClinicalSession) {
                               e.preventDefault();
                               setIsClinicalSidebarOpen(!isClinicalSidebarOpen);
                           } else {
                               setIsClinicalSidebarOpen(false);
                           }
                        }}
                      >
                         {isClinicalSession ? (
                            <>
                                <item.icon className={isActive ? "text-primary" : "text-muted-foreground"} />
                                <span className="flex-1 truncate group-data-[collapsible=icon]:hidden">{item.label}</span>
                                <ChevronRight 
                                  className={`ml-auto h-4 w-4 transition-transform duration-200 group-data-[collapsible=icon]:hidden ${isClinicalSidebarOpen ? "rotate-180" : ""}`} 
                                />
                            </>
                         ) : (
                            <Link href={item.href}>
                                <item.icon className={isActive ? "text-primary" : "text-muted-foreground"} />
                                <span>{item.label}</span>
                            </Link>
                         )}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarSeparator className="mx-0" />

      <SidebarFooter className="p-2">
        <SidebarMenu>
            {role === "doctor" && bottomItems.map((item) => (
                <SidebarMenuItem key={item.label}>
                    <SidebarMenuButton asChild tooltip={item.label} className="pl-4 text-muted-foreground">
                        <Link href={item.href}>
                            <item.icon />
                            <span>{item.label}</span>
                        </Link>
                    </SidebarMenuButton>
                </SidebarMenuItem>
            ))}
            <SidebarMenuItem>
                <SidebarMenuButton tooltip="Help" className="pl-4 text-muted-foreground">
                    <HelpCircle />
                    <span>Help</span>
                </SidebarMenuButton>
            </SidebarMenuItem>
            
            <div className="h-0.5" />

            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton
                    size="lg"
                    className="pl-4 text-muted-foreground rounded-xl transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                  >
                    <Avatar className="h-8 w-8 rounded-lg border border-stone-200">
                      <AvatarImage src={user?.imageUrl} alt={user?.fullName || ""} />
                      <AvatarFallback className="rounded-lg">CN</AvatarFallback>
                    </Avatar>
                    <div className="grid flex-1 text-left text-sm leading-tight">
                      <span className="truncate font-semibold text-primary">{user?.fullName}</span>
                      <span className="truncate text-xs text-muted-foreground">{user?.primaryEmailAddress?.emailAddress}</span>
                    </div>
                    <ChevronsUpDown className="ml-auto size-4 text-muted-foreground" />
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
                  side={isMobile ? "bottom" : "right"}
                  align="end"
                  sideOffset={4}
                >
                  <DropdownMenuLabel className="p-0 font-normal">
                    <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                      <Avatar className="h-8 w-8 rounded-lg">
                        <AvatarImage src={user?.imageUrl} alt={user?.fullName || ""} />
                        <AvatarFallback className="rounded-lg">CN</AvatarFallback>
                      </Avatar>
                      <div className="grid flex-1 text-left text-sm leading-tight">
                        <span className="truncate font-semibold">{user?.fullName}</span>
                        <span className="truncate text-xs">{user?.primaryEmailAddress?.emailAddress}</span>
                      </div>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuGroup>
                    <DropdownMenuItem onClick={() => openUserProfile()}>
                      <BadgeCheck className="mr-2 h-4 w-4" />
                      Account
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => signOut()}>
                    <LogOut className="mr-2 h-4 w-4" />
                    Log out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </ShadcnSidebar>
    {isClinicalSidebarOpen && <ClinicalSidebar />}
    </>
  );
}