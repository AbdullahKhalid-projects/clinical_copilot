import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export default async function DoctorSettingsPage() {
  const user = await currentUser();
  if (!user) {
    redirect("/");
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Doctor Settings</h1>
        <p className="text-sm text-muted-foreground">
          Configure your account and preferences.
        </p>
      </div>
      
      <div className="rounded-lg border bg-card p-6">
        <p className="text-sm text-muted-foreground">
          No additional settings to configure at this time.
        </p>
      </div>
    </div>
  );
}
