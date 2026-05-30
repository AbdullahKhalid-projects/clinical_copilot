"use client";

import * as React from "react";
import { useClerk, useUser } from "@clerk/nextjs";
import { Bell, Link2, ShieldCheck, SlidersHorizontal, User } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type SettingsPageProps = {
  role: "doctor" | "patient";
};

type SettingsSection = "account" | "security" | "preferences" | "integrations" | "alerts";

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : "";
  return (first + last).toUpperCase() || "U";
}

export function SettingsPage({ role }: SettingsPageProps) {
  const { user } = useUser();
  const { openUserProfile } = useClerk();

  const displayName =
    user?.fullName ||
    [user?.firstName, user?.lastName]
      .filter((part): part is string => Boolean(part))
      .join(" ") ||
    "Your account";

  const email = user?.primaryEmailAddress?.emailAddress ?? "No email on file";
  const initials = getInitials(displayName);
  const twoFactorEnabled = Boolean(user?.twoFactorEnabled);
  const emailVerified = user?.primaryEmailAddress?.verification?.status === "verified";
  const roleLabel = role === "doctor" ? "Clinician" : "Patient";
  const enabledBadgeClass = "border-emerald-300 bg-emerald-100/70 text-emerald-900";
  const warningBadgeClass = "border-amber-300 bg-amber-100/70 text-amber-900";
  const mutedBadgeClass = "border-border bg-muted text-muted-foreground";
  const [activeSection, setActiveSection] = React.useState<SettingsSection>("account");
  const sectionTabs: Array<{
    value: SettingsSection;
    label: string;
    icon: React.ElementType;
    activeClass: string;
    idleClass: string;
  }> = [
    {
      value: "account",
      label: "Account",
      icon: User,
      activeClass: "h-4 w-4 text-emerald-600",
      idleClass: "h-4 w-4 text-muted-foreground group-hover:text-emerald-500",
    },
    {
      value: "security",
      label: "Security",
      icon: ShieldCheck,
      activeClass: "h-4 w-4 text-violet-600",
      idleClass: "h-4 w-4 text-muted-foreground group-hover:text-violet-500",
    },
    {
      value: "preferences",
      label: "Preferences",
      icon: SlidersHorizontal,
      activeClass: "h-4 w-4 text-blue-600",
      idleClass: "h-4 w-4 text-muted-foreground group-hover:text-blue-500",
    },
    {
      value: "integrations",
      label: "Integrations",
      icon: Link2,
      activeClass: "h-4 w-4 text-amber-600",
      idleClass: "h-4 w-4 text-muted-foreground group-hover:text-amber-500",
    },
    {
      value: "alerts",
      label: "Alerts",
      icon: Bell,
      activeClass: "h-4 w-4 text-rose-600",
      idleClass: "h-4 w-4 text-muted-foreground group-hover:text-rose-500",
    },
  ];

  return (
    <div className="h-full flex-1 flex-col space-y-0 md:flex">
      <header className="px-4 sm:px-5 py-3 border-b-2 border-border bg-background/95 backdrop-blur z-10">
        <div className="flex flex-col gap-2.5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0 text-left">
              <Avatar className="h-10 w-10 border">
                <AvatarImage src={user?.imageUrl ?? undefined} alt={displayName} />
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <h1 className="text-lg sm:text-xl font-black tracking-tight text-foreground truncate">Settings</h1>
                  <Badge variant="outline" className="shrink-0 border-2 border-border bg-muted text-foreground font-semibold">
                    Clerk profile
                  </Badge>
                </div>
                <span className="text-sm text-muted-foreground mt-0.5 font-medium truncate">
                  {displayName} - {email}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => openUserProfile()}>
                Open Clerk profile
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-sm">
            <Badge variant="outline" className="gap-1.5 py-1 border-2 border-border bg-muted/70">
              {roleLabel}
            </Badge>
            <Badge
              variant="outline"
              className={`gap-1.5 py-1 border-2 ${twoFactorEnabled ? enabledBadgeClass : warningBadgeClass}`}
            >
              {twoFactorEnabled ? "2FA enabled" : "2FA not enabled"}
            </Badge>
            <Badge
              variant="outline"
              className={`gap-1.5 py-1 border-2 ${emailVerified ? enabledBadgeClass : warningBadgeClass}`}
            >
              {emailVerified ? "Email verified" : "Email not verified"}
            </Badge>
          </div>
        </div>
      </header>

      <div className="space-y-6 px-4 sm:px-5 pt-6 pb-8">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 bg-transparent">
            {sectionTabs.map((tab, index) => {
              const Icon = tab.icon;
              const isActive = activeSection === tab.value;
              return (
                <React.Fragment key={tab.value}>
                  {index > 0 && <div className="h-6 w-px bg-border/70" />}
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setActiveSection(tab.value)}
                    className={`group rounded-lg px-3 h-9 border transition-colors ${isActive
                      ? "bg-muted text-foreground border-transparent"
                      : "text-foreground border-transparent hover:bg-muted"}`}
                  >
                    <Icon className={isActive ? tab.activeClass : tab.idleClass} />
                    {tab.label}
                  </Button>
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {activeSection === "account" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <User className="h-5 w-5 text-primary" />
                Account
              </CardTitle>
              <CardDescription>Profile details are managed in Clerk.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <Avatar className="h-12 w-12 border border-border">
                  <AvatarImage src={user?.imageUrl ?? undefined} alt={displayName} />
                  <AvatarFallback className="bg-muted text-muted-foreground">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="space-y-1">
                  <div className="text-sm font-semibold text-foreground">{displayName}</div>
                  <div className="text-xs text-muted-foreground">{email}</div>
                  <Badge variant="outline">Clerk profile</Badge>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor={`${role}-display-name`}>Display name</Label>
                  <Input id={`${role}-display-name`} value={displayName} readOnly />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`${role}-email`}>Email</Label>
                  <Input id={`${role}-email`} value={email} readOnly />
                </div>
              </div>

              <Button variant="outline" className="w-full" onClick={() => openUserProfile()}>
                Update profile in Clerk
              </Button>
            </CardContent>
          </Card>
        )}

        {activeSection === "security" && (
          <div className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <ShieldCheck className="h-5 w-5 text-primary" />
                  Security
                </CardTitle>
                <CardDescription>Two-factor authentication and verification.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium">Two-factor authentication</p>
                    <p className="text-xs text-muted-foreground">Managed in Clerk security settings.</p>
                  </div>
                  <Badge
                    variant="outline"
                    className={twoFactorEnabled ? enabledBadgeClass : warningBadgeClass}
                  >
                    {twoFactorEnabled ? "Enabled" : "Not enabled"}
                  </Badge>
                </div>

                <Separator />

                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium">Email verification</p>
                    <p className="text-xs text-muted-foreground">
                      {emailVerified ? "Verified" : "Not verified"}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className={emailVerified ? enabledBadgeClass : warningBadgeClass}
                  >
                    {emailVerified ? "Verified" : "Unverified"}
                  </Badge>
                </div>

                <Separator />

                <div className="space-y-2">
                  <Label htmlFor={`${role}-session-timeout`}>Session timeout</Label>
                  <Select defaultValue="30">
                    <SelectTrigger id={`${role}-session-timeout`}>
                      <SelectValue placeholder="Select timeout" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="15">15 minutes</SelectItem>
                      <SelectItem value="30">30 minutes</SelectItem>
                      <SelectItem value="60">60 minutes</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button variant="outline" className="w-full" onClick={() => openUserProfile()}>
                  Manage security in Clerk
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Active sessions</CardTitle>
                <CardDescription>Review and revoke active sessions.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Device</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Last active</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell colSpan={3} className="text-muted-foreground">
                        Session history will appear here when available.
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
                <Button variant="outline" className="w-full" disabled>
                  Sign out other sessions
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {activeSection === "preferences" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <SlidersHorizontal className="h-5 w-5 text-primary" />
                Preferences
              </CardTitle>
              <CardDescription>App defaults and notification behavior.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <Label htmlFor={`${role}-autosave`} className="text-sm font-medium">
                    Auto-save drafts
                  </Label>
                  <p className="text-xs text-muted-foreground">Save edits every 30 seconds.</p>
                </div>
                <Switch id={`${role}-autosave`} defaultChecked />
              </div>

              <Separator />

              <div className="flex items-center justify-between gap-4">
                <div>
                  <Label htmlFor={`${role}-notifications`} className="text-sm font-medium">
                    Email notifications
                  </Label>
                  <p className="text-xs text-muted-foreground">Note-ready and patient updates.</p>
                </div>
                <Switch id={`${role}-notifications`} defaultChecked />
              </div>

              <Separator />

              <div className="space-y-2">
                <Label htmlFor={`${role}-note-style`}>Default note style</Label>
                <Select defaultValue="soap">
                  <SelectTrigger id={`${role}-note-style`}>
                    <SelectValue placeholder="Choose a format" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="soap">SOAP</SelectItem>
                    <SelectItem value="narrative">Narrative</SelectItem>
                    <SelectItem value="apso">APSO</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        )}

        {activeSection === "integrations" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Link2 className="h-5 w-5 text-primary" />
                Integrations
              </CardTitle>
              <CardDescription>Connected services and external tools.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium">Clerk</p>
                  <p className="text-xs text-muted-foreground">Authentication provider</p>
                </div>
                <Badge variant="outline" className={enabledBadgeClass}>
                  Connected
                </Badge>
              </div>

              <Separator />

              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium">Calendar</p>
                  <p className="text-xs text-muted-foreground">Sync appointments</p>
                </div>
                <Badge variant="outline" className={mutedBadgeClass}>
                  Not connected
                </Badge>
              </div>

              <Separator />

              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium">EHR connector</p>
                  <p className="text-xs text-muted-foreground">Send notes to your EHR</p>
                </div>
                <Badge variant="outline" className={mutedBadgeClass}>
                  Coming soon
                </Badge>
              </div>

              <Button variant="outline" className="w-full">
                Manage integrations
              </Button>
            </CardContent>
          </Card>
        )}

        {activeSection === "alerts" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Bell className="h-5 w-5 text-primary" />
                Alerts
              </CardTitle>
              <CardDescription>Controls for how you receive alerts.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <Label htmlFor={`${role}-sms`} className="text-sm font-medium">
                    SMS alerts
                  </Label>
                  <p className="text-xs text-muted-foreground">Critical note and system alerts.</p>
                </div>
                <Switch id={`${role}-sms`} />
              </div>

              <Separator />

              <div className="flex items-center justify-between gap-4">
                <div>
                  <Label htmlFor={`${role}-push`} className="text-sm font-medium">
                    Push alerts
                  </Label>
                  <p className="text-xs text-muted-foreground">Reminders for upcoming sessions.</p>
                </div>
                <Switch id={`${role}-push`} defaultChecked />
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
