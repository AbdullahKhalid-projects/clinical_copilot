"use client";

import React from "react"

import {
  Calendar,
  ClipboardList,
  FileText,
  FlaskConical,
  LayoutDashboard,
  MessageSquare,
  Pill,
  Play,
  StickyNote,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
}

const patientNavItems: NavItem[] = [
  { label: "Dashboard", href: "/patient/dashboard", icon: <LayoutDashboard className="w-5 h-5" /> },
  { label: "Visit Summaries", href: "/patient/visit-summaries", icon: <ClipboardList className="w-5 h-5" /> },
  { label: "Transcripts", href: "/patient/transcripts", icon: <MessageSquare className="w-5 h-5" /> },
  { label: "Labs & Imaging", href: "/patient/labs", icon: <FlaskConical className="w-5 h-5" /> },
  { label: "My Notes", href: "/patient/notes", icon: <StickyNote className="w-5 h-5" /> },
  { label: "Medications", href: "/patient/medications", icon: <Pill className="w-5 h-5" /> },
];

const doctorNavItems: NavItem[] = [
  { label: "Dashboard", href: "/doctor/dashboard", icon: <LayoutDashboard className="w-5 h-5" /> },
  { label: "Clinical Session", href: "/doctor/clinical-session", icon: <Play className="w-5 h-5" /> },
  { label: "Post-Visit Editor", href: "/doctor/post-visit", icon: <FileText className="w-5 h-5" /> },
  { label: "My Patients", href: "/doctor/patients", icon: <Users className="w-5 h-5" /> },
  { label: "Schedule", href: "/doctor/schedule", icon: <Calendar className="w-5 h-5" /> },
];

interface SidebarProps {
  role: "doctor" | "patient";
}

export function Sidebar({ role }: SidebarProps) {
  const pathname = usePathname();
  const navItems = role === "doctor" ? doctorNavItems : patientNavItems;

  return (
    <aside className="w-52 min-h-[calc(100vh-4rem)] bg-card border-r border-border py-4">
      <nav className="space-y-1 px-3">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {item.icon}
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
