import React from "react"
import { Header } from "@/components/header";
import { Sidebar } from "@/components/sidebar";

export default function DoctorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <Header role="doctor" />
      <div className="flex">
        <Sidebar role="doctor" />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
