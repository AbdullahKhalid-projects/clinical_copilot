import type { ReactNode } from "react";

interface ClinicalSessionLayoutProps {
  children: ReactNode;
}

export default function ClinicalSessionLayout({ children }: ClinicalSessionLayoutProps) {
  // Cancel the vertical padding inherited from app/doctor/layout.tsx for this route.
  return <div className="-my-6">{children}</div>;
}
