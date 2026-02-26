import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'

export function ContentPaneLoading() {
  return (
    <div className="h-full min-h-[70vh] flex-1 flex-col space-y-0 md:flex">
      <header className="px-4 sm:px-5 py-3 border-b-2 border-border bg-background/95 backdrop-blur z-10">
        <div className="flex flex-col gap-2.5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <Skeleton className="h-10 w-10 shrink-0 rounded-md" />
              <div className="flex flex-col gap-2 min-w-0">
                <Skeleton className="h-6 w-52" />
                <Skeleton className="h-4 w-40" />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-sm">
            <Skeleton className="h-7 w-24 rounded-md" />
            <Skeleton className="h-7 w-32 rounded-md" />
            <Skeleton className="h-7 w-44 rounded-md" />
          </div>
        </div>
      </header>

      <div className="relative flex-1">
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="rounded-full bg-background/80 p-2 backdrop-blur-sm">
            <Spinner className="size-8 text-primary" />
          </div>
        </div>
      </div>
    </div>
  )
}