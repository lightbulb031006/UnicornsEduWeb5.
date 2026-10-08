import { StudentClassCardGrid } from "@/components/student/StudentClassCard";
import { Skeleton } from "@/components/ui/skeleton";

const classCards = Array.from({ length: 3 });

export function StudentClassCardGridSkeleton() {
  return (
    <StudentClassCardGrid>
      {classCards.map((_, index) => (
        <div
          key={index}
          className="overflow-hidden rounded-2xl border border-border-default bg-bg-surface shadow-sm"
        >
          <Skeleton className="aspect-[16/9] w-full rounded-none bg-bg-tertiary" />
          <div className="space-y-2 p-4">
            <Skeleton className="h-3 w-24 bg-bg-tertiary" />
            <Skeleton className="h-5 w-4/5 bg-bg-tertiary" />
            <Skeleton className="mt-3 h-4 w-3/5 bg-bg-tertiary" />
          </div>
        </div>
      ))}
    </StudentClassCardGrid>
  );
}

export function StudentDashboardSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col space-y-6" aria-busy="true">
      <section className="space-y-4">
        <div>
          <Skeleton className="h-6 w-44 bg-bg-tertiary" />
          <Skeleton className="mt-2 h-4 w-72 max-w-full bg-bg-tertiary" />
        </div>
        <StudentClassCardGridSkeleton />
      </section>
      <Skeleton className="h-48 w-full rounded-2xl bg-bg-tertiary" />
    </div>
  );
}
