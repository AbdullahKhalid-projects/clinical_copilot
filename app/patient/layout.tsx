import React from "react"
import { Header } from "@/components/header";
import { Sidebar } from "@/components/sidebar";

export default function PatientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <Header role="patient" />
      <div className="flex">
        <Sidebar role="patient" />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
