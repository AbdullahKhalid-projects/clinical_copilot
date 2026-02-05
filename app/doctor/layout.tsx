import React from "react"
import { Header } from "@/components/header";
import { Sidebar } from "@/components/sidebar";
import { currentDoctor } from "@/lib/mockData";

export default function DoctorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <Header
        userName={currentDoctor.name}
        userInitials={currentDoctor.initials}
        role="doctor"
      />
      <div className="flex">
        <Sidebar role="doctor" />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
