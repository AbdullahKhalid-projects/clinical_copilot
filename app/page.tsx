"use client";

import React from "react"

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Heart, Shield, Stethoscope, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    // Simulate login delay
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Check credentials and redirect based on role
    if (email.toLowerCase().includes("doctor")) {
      router.push("/doctor/dashboard");
    } else if (email.toLowerCase().includes("patient")) {
      router.push("/patient/dashboard");
    } else {
      // Default to patient if no match
      router.push("/patient/dashboard");
    }

    setIsLoading(false);
  };

  const fillDemoCredentials = (role: "doctor" | "patient") => {
    if (role === "doctor") {
      setEmail("doctor@clinic.com");
      setPassword("doctor123");
    } else {
      setEmail("patient@example.com");
      setPassword("patient123");
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left Side - Marketing Banner */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-primary to-teal-600 p-12 flex-col justify-between text-white">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-10 h-10 rounded-full bg-white/20">
            <Stethoscope className="w-6 h-6 text-white" />
          </div>
          <span className="font-semibold text-xl">CLINICAL CO-PILOT</span>
        </div>

        <div className="space-y-8">
          <div>
            <h1 className="text-4xl font-bold leading-tight text-balance">
              Your Health Journey,
              <br />
              Intelligently Guided
            </h1>
          </div>

          <div className="space-y-6">
            <div className="flex items-start gap-4">
              <div className="flex items-center justify-center w-12 h-12 rounded-full bg-white/20 shrink-0">
                <Heart className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-semibold text-lg">Personalized Health Insights</h3>
                <p className="text-white/80 text-sm">
                  AI-powered analysis of your health data for better outcomes
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="flex items-center justify-center w-12 h-12 rounded-full bg-white/20 shrink-0">
                <Shield className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-semibold text-lg">Secure & Private</h3>
                <p className="text-white/80 text-sm">
                  HIPAA-compliant platform keeping your data safe
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="flex items-center justify-center w-12 h-12 rounded-full bg-white/20 shrink-0">
                <Users className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-semibold text-lg">Connected Care</h3>
                <p className="text-white/80 text-sm">
                  Seamless communication between you and your healthcare team
                </p>
              </div>
            </div>
          </div>
        </div>

        <p className="text-sm text-white/60">
          © 2026 Clinical Co-Pilot. All rights reserved.
        </p>
      </div>

      {/* Right Side - Login Form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-background">
        <div className="w-full max-w-md space-y-8">
          {/* Mobile Logo */}
          <div className="lg:hidden flex items-center justify-center gap-2 mb-8">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10">
              <Stethoscope className="w-6 h-6 text-primary" />
            </div>
            <span className="font-semibold text-xl text-primary">CLINICAL CO-PILOT</span>
          </div>

          <div className="text-center">
            <h2 className="text-2xl font-bold text-foreground">Welcome Back</h2>
            <p className="mt-2 text-muted-foreground">
              Enter your credentials to access your account
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? (
                    <EyeOff className="w-5 h-5" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                className="text-sm text-primary hover:underline"
              >
                Forgot Password?
              </button>
            </div>

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? "Signing in..." : "Sign In"}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground">
            Don&apos;t have an account?{" "}
            <button className="text-primary hover:underline font-medium">
              Sign Up
            </button>
          </p>

          {/* Demo Credentials */}
          <div className="pt-4 border-t border-border">
            <p className="text-center text-sm text-muted-foreground mb-4">
              Demo Credentials
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Card
                className="cursor-pointer hover:border-primary transition-colors"
                onClick={() => fillDemoCredentials("doctor")}
              >
                <CardContent className="p-4">
                  <p className="font-medium text-sm">Doctor</p>
                  <p className="text-xs text-muted-foreground">doctor@clinic.com</p>
                  <p className="text-xs text-muted-foreground">doctor123</p>
                </CardContent>
              </Card>
              <Card
                className="cursor-pointer hover:border-primary transition-colors"
                onClick={() => fillDemoCredentials("patient")}
              >
                <CardContent className="p-4">
                  <p className="font-medium text-sm">Patient</p>
                  <p className="text-xs text-muted-foreground">patient@example.com</p>
                  <p className="text-xs text-muted-foreground">patient123</p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
