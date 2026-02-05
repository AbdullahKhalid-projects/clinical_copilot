"use client";

import { Bell, LogOut, User } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Logo } from "./logo";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

interface HeaderProps {
  userName: string;
  userInitials: string;
  role: "doctor" | "patient";
}

export function Header({ userName, userInitials, role }: HeaderProps) {
  const router = useRouter();
  const [hasNotifications] = useState(true);

  const handleSignOut = () => {
    router.push("/");
  };

  const handleEditProfile = () => {
    // For demo purposes, just show an alert
    alert("Edit Profile feature coming soon!");
  };

  return (
    <header className="h-16 border-b border-border bg-card flex items-center justify-between px-6">
      <Logo href={`/${role}/dashboard`} />

      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="w-5 h-5 text-muted-foreground" />
          {hasNotifications && (
            <span className="absolute top-1 right-1 w-2 h-2 bg-destructive rounded-full" />
          )}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="flex items-center gap-2 px-2">
              <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-sm font-medium">
                {userInitials}
              </div>
              <span className="text-sm font-medium text-foreground">{userName}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={handleEditProfile} className="cursor-pointer">
              <User className="w-4 h-4 mr-2" />
              Edit Profile
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer text-destructive">
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
