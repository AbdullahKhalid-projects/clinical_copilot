import { Badge } from "@/components/ui/badge";
import { Stethoscope, Users } from "lucide-react";

export default function PatientDoctorsPage() {
  return (
    <div className="h-full flex-1 flex-col space-y-0 md:flex">
      <header className="px-4 sm:px-5 py-3 border-b-2 border-border bg-background/95 backdrop-blur z-10">
        <div className="flex flex-col gap-2.5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-10 w-10 shrink-0 rounded-md border-2 border-black bg-yellow-300 flex items-center justify-center">
                <Stethoscope className="h-5 w-5 text-black stroke-2" />
              </div>
              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <h1 className="text-lg sm:text-xl font-black tracking-tight text-foreground truncate">
                    Doctors
                  </h1>
                  <Badge
                    variant="outline"
                    className="shrink-0 border-2 border-border bg-muted text-foreground font-semibold"
                  >
                    Appointments
                  </Badge>
                </div>
                <span className="text-sm text-muted-foreground mt-0.5 font-medium truncate">
                  Choose a doctor to schedule your next appointment
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-sm">
            <Badge variant="outline" className="gap-1.5 py-1 border-2 border-border bg-muted/70">
              <Users className="h-3.5 w-3.5" />
              <span>Available Doctors</span>
            </Badge>
          </div>
        </div>
      </header>
    </div>
  );
}
