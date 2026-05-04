"use client";

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

type SettingsPageProps = {
  role: "doctor" | "patient";
};

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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Settings</h1>
          <p className="text-sm text-muted-foreground">
            Manage your {roleLabel.toLowerCase()} account, security, and preferences.
          </p>
        </div>
        <Button variant="outline" onClick={() => openUserProfile()}>
          Open Clerk profile
        </Button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
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
                className={
                  twoFactorEnabled
                    ? "border-emerald-400/50 bg-emerald-100 text-emerald-900"
                    : "border-border bg-muted text-muted-foreground"
                }
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
                className={
                  emailVerified
                    ? "border-emerald-400/50 bg-emerald-100 text-emerald-900"
                    : "border-border bg-muted text-muted-foreground"
                }
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
              <Badge className="border-emerald-400/50 bg-emerald-100 text-emerald-900">Connected</Badge>
            </div>

            <Separator />

            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">Calendar</p>
                <p className="text-xs text-muted-foreground">Sync appointments</p>
              </div>
              <Badge variant="outline" className="border-border bg-muted text-muted-foreground">
                Not connected
              </Badge>
            </div>

            <Separator />

            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">EHR connector</p>
                <p className="text-xs text-muted-foreground">Send notes to your EHR</p>
              </div>
              <Badge variant="outline" className="border-border bg-muted text-muted-foreground">
                Coming soon
              </Badge>
            </div>

            <Button variant="outline" className="w-full">
              Manage integrations
            </Button>
          </CardContent>
        </Card>

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
      </div>
    </div>
  );
}
