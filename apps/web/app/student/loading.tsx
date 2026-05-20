import { Skeleton } from "@/components/ui/skeleton";

export default function StudentLoading() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      
      {/* Welcome Banner Skeleton */}
      <div className="relative overflow-hidden rounded-2xl border border-border-default bg-gradient-to-br from-bg-secondary via-bg-surface to-bg-secondary/70 p-5 sm:p-6 shadow-sm animate-pulse">
        <div className="relative space-y-3">
          <Skeleton className="h-8 w-60 rounded-lg bg-bg-tertiary" />
          <Skeleton className="h-4 w-96 rounded-lg bg-bg-tertiary" />
        </div>
      </div>

      {/* Grid for Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border-default bg-bg-surface p-4 shadow-sm space-y-3 animate-pulse">
            <Skeleton className="h-4 w-24 rounded bg-bg-tertiary" />
            <Skeleton className="h-8 w-16 rounded bg-bg-tertiary" />
            <Skeleton className="h-3 w-36 rounded bg-bg-tertiary" />
          </div>
        ))}
      </div>

      {/* Grid for Main Content & Sidebar */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Column: Recent activities */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between border-b border-border-default pb-3">
            <Skeleton className="h-6 w-48 rounded bg-bg-tertiary animate-pulse" />
            <Skeleton className="h-4 w-20 rounded bg-bg-tertiary animate-pulse" />
          </div>

          {/* Activity Rows */}
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border-default bg-bg-surface p-4 shadow-sm flex items-center justify-between gap-4 animate-pulse">
              <div className="space-y-2 flex-1 min-w-0">
                <Skeleton className="h-5 w-2/3 rounded bg-bg-tertiary" />
                <Skeleton className="h-3.5 w-1/3 rounded bg-bg-tertiary" />
              </div>
              <Skeleton className="h-8 w-24 rounded-lg bg-bg-tertiary" />
            </div>
          ))}
        </div>

        {/* Right Column: Upcoming Schedule */}
        <div className="space-y-4">
          <div className="border-b border-border-default pb-3">
            <Skeleton className="h-6 w-36 rounded bg-bg-tertiary animate-pulse" />
          </div>

          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border-default bg-bg-surface p-4 shadow-sm space-y-2 animate-pulse">
              <Skeleton className="h-4 w-1/2 rounded bg-bg-tertiary" />
              <Skeleton className="h-3.5 w-3/4 rounded bg-bg-tertiary" />
              <div className="flex gap-2 pt-1">
                <Skeleton className="h-5 w-16 rounded bg-bg-tertiary" />
                <Skeleton className="h-5 w-16 rounded bg-bg-tertiary" />
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
