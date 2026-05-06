import { ContentPaneHeaderSkeleton } from "@/components/content-pane-loading";
import { Spinner } from "@/components/ui/spinner";

export function NoteStudioLoadingShell() {
  return (
    <div className="h-full min-h-[70vh] flex-1 flex-col space-y-0 md:flex">
      <ContentPaneHeaderSkeleton />

      <div className="relative flex-1 min-h-[72vh]">
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="rounded-full bg-background/80 p-2 backdrop-blur-sm">
            <Spinner className="size-8 text-primary" />
          </div>
        </div>
      </div>
    </div>
  );
}
