import { Skeleton } from "@/components/ui/skeleton";

/** Khung chờ cho `StaffDetailHero` + section đầu tiên. */
export default function StaffDetailSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden>
      <div className="flex items-center gap-4">
        <Skeleton className="size-14 rounded-full sm:size-16" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-6 w-48 max-w-full" />
          <Skeleton className="h-5 w-32" />
        </div>
      </div>
      <Skeleton className="h-40 w-full rounded-lg" />
    </div>
  );
}
