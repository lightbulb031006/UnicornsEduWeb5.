import { Skeleton } from "@/components/ui/skeleton";

export default function StaffLoading() {
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-bg-primary p-3 pb-8 sm:p-6">
      <div className="flex min-w-0 flex-1 flex-col rounded-xl border border-border-default bg-bg-surface p-3 shadow-sm sm:rounded-lg sm:p-5 animate-pulse">
        
        {/* Header Block Skeleton */}
        <div className="relative mb-6 overflow-hidden rounded-2xl border border-border-default bg-gradient-to-br from-bg-secondary via-bg-surface to-bg-secondary/70 p-4 sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2.5">
              <Skeleton className="h-8 w-44 rounded-lg bg-bg-tertiary" />
              <Skeleton className="h-4 w-80 rounded-lg bg-bg-tertiary" />
            </div>
            <Skeleton className="h-10 w-28 rounded-xl bg-bg-tertiary" />
          </div>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1">
              <Skeleton className="h-4 w-16 rounded-md mb-1.5 bg-bg-tertiary" />
              <Skeleton className="h-11 w-full rounded-xl bg-bg-tertiary" />
            </div>
          </div>
        </div>

        {/* Content Table Skeleton */}
        <div className="min-w-0 flex-1 overflow-auto space-y-4">
          {/* Table Header Placeholder */}
          <div className="flex gap-4 border-b border-border-default pb-3.5 pt-1 px-2">
            <Skeleton className="h-5 w-1/4 rounded-md bg-bg-tertiary" />
            <Skeleton className="h-5 w-1/4 rounded-md bg-bg-tertiary" />
            <Skeleton className="h-5 w-1/6 rounded-md bg-bg-tertiary" />
            <Skeleton className="h-5 w-1/6 rounded-md bg-bg-tertiary" />
            <Skeleton className="h-5 w-1/12 rounded-md bg-bg-tertiary" />
          </div>
          {/* Rows */}
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex gap-4 items-center py-3.5 border-b border-border-subtle/50 px-2">
              <Skeleton className="h-5 w-1/4 rounded-md bg-bg-tertiary" />
              <Skeleton className="h-5 w-1/4 rounded-md bg-bg-tertiary" />
              <Skeleton className="h-5 w-1/6 rounded-md bg-bg-tertiary" />
              <Skeleton className="h-5 w-1/6 rounded-md bg-bg-tertiary" />
              <Skeleton className="h-5 w-1/12 rounded-md bg-bg-tertiary" />
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}
