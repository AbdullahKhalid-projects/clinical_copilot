import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { Stethoscope, Shield, Heart, Eye } from "lucide-react";
import Link from "next/link";
import { SignInButton } from "@clerk/nextjs";

export default async function LandingPage() {
  const user = await currentUser();

  if (user) {
    // Check DB for role
    const dbUser = await prisma.user.findUnique({
      where: { clerkId: user.id },
    });

    if (dbUser) {
      if (dbUser.role === "DOCTOR") {
        redirect("/doctor/dashboard");
      } else {
        redirect("/patient/dashboard");
      }
    } else {
      // User created in Clerk but not DB yet (webhook latency)
      // Redirect to a loading/checking page or just patient as fallback
      // For now, let's assume patient or stay here
      console.log("User in Clerk but not DB yet");
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col lg:flex-row">
      {/* Left side - Hero/Branding */}
      <div className="flex-1 bg-primary p-8 lg:p-12 flex flex-col justify-between text-primary-foreground relative overflow-hidden">
        <div className="absolute inset-0 bg-black/10 z-0" />
        <div className="z-10 relative">
          <div className="flex items-center gap-3 mb-8">
            <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
              <Stethoscope className="w-8 h-8" />
            </div>
            <span className="text-2xl font-bold tracking-tight">
              Clinical Co-Pilot
            </span>
          </div>
          <div className="max-w-md">
            <h1 className="text-4xl lg:text-5xl font-extrabold tracking-tight mb-6">
              Your Health Journey, Intelligently Guided.
            </h1>
            <p className="text-lg text-primary-foreground/90 mb-8 leading-relaxed">
              Experience the future of healthcare with our AI-powered patient
              management system. Seamless communication, smart insights, and
              better outcomes.
            </p>
          </div>
        </div>

        <div className="z-10 relative grid grid-cols-3 gap-6 mt-12">
          <FeatureCard
            icon={<Shield className="w-6 h-6" />}
            label="Secure & Private"
          />
          <FeatureCard
            icon={<Heart className="w-6 h-6" />}
            label="Patient Centric"
          />
          <FeatureCard
            icon={<Eye className="w-6 h-6" />}
            label="AI Insights"
          />
        </div>
      </div>

      {/* Right side - Auth Action */}
      <div className="flex-1 flex items-center justify-center p-8 bg-muted/20">
        <div className="max-w-md w-full space-y-8 text-center">
          <div className="space-y-2">
            <h2 className="text-3xl font-bold tracking-tight">Welcome Back</h2>
            <p className="text-muted-foreground">
              Sign in to access your dashboard
            </p>
          </div>

          <div className="flex justify-center">
             <SignInButton mode="modal">
                <Button size="lg" className="w-full max-w-xs">
                  Sign In / Sign Up
                </Button>
             </SignInButton>
          </div>
        </div>
      </div>
    </div>
  );
}

function FeatureCard({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex flex-col gap-3 p-4 rounded-xl bg-white/10 backdrop-blur-sm border border-white/20">
      <div className="p-2 bg-white/20 w-fit rounded-lg">{icon}</div>
      <span className="font-medium text-sm">{label}</span>
    </div>
  );
}
