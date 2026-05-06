"use client";

import { Stethoscope } from "lucide-react";
import Link from "next/link";

interface LogoProps {
  href?: string;
  className?: string;
}

export function Logo({ href = "/", className = "" }: LogoProps) {
  const content = (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10">
        <Stethoscope className="w-5 h-5 text-primary" />
      </div>
      <span className="font-semibold text-lg text-primary">CLINICAL CO-PILOT</span>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="hover:opacity-80 transition-opacity">
        {content}
      </Link>
    );
  }

  return content;
}
