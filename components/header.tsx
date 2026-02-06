"use client";

import { Bell } from "lucide-react";
import { UserButton } from "@clerk/nextjs";
import { Logo } from "./logo";
import { Button } from "./ui/button";

interface HeaderProps {
  role: "doctor" | "patient";
}

export function Header({ role }: HeaderProps) {
  return (
    <header className="h-16 border-b border-border bg-card flex items-center justify-between px-6">
      <Logo href={`/${role}/dashboard`} />

      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="w-5 h-5 text-muted-foreground" />
        </Button>

        <UserButton />
      </div>
    </header>
  );
}
