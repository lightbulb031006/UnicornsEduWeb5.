import { Skeleton } from "@/components/ui/skeleton";

const LIST_SHELL =
  "flex min-h-0 flex-1 flex-col bg-bg-primary p-3 pb-8 sm:p-6";

function RowStack({
  count,
  label,
}: {
  count: number;
  label: string;
}) {
  return (
    <div className="mt-4 space-y-2" role="status" aria-label={label}>
      {Array.from({ length: count }).map((_, index) => (
        <Skeleton
          key={index}
          className="h-14 w-full rounded-lg bg-bg-tertiary"
        />
      ))}
    </div>
  );
}

export function CourseListSkeleton() {
  return (
    <div className={LIST_SHELL} aria-busy="true">
      <span className="sr-only">Đang tải danh sách khoá học…</span>
      <div className="flex min-w-0 flex-1 flex-col rounded-xl border border-border-default bg-bg-surface p-3 shadow-sm sm:rounded-lg sm:p-5">
        <section className="rounded-2xl border border-border-default bg-bg-secondary/40 p-4 sm:p-5">
          <Skeleton className="h-7 w-36 bg-bg-tertiary" />
          <Skeleton className="mt-2 h-4 w-full max-w-md bg-bg-tertiary" />
        </section>
        <RowStack count={4} label="Đang tải danh sách khoá học" />
      </div>
    </div>
  );
}

export function CourseDetailSkeleton() {
  return (
    <div className={LIST_SHELL} aria-busy="true">
      <span className="sr-only">Đang tải khoá học…</span>
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <section className="rounded-2xl border border-border-default bg-bg-surface p-4 sm:p-5">
          <Skeleton className="h-4 w-24 bg-bg-tertiary" />
          <Skeleton className="mt-3 h-8 w-56 max-w-full bg-bg-tertiary" />
          <Skeleton className="mt-2 h-4 w-full max-w-lg bg-bg-tertiary" />
        </section>
        <div className="inline-flex w-full items-center gap-1 rounded-2xl border border-border-default bg-bg-secondary/70 p-1.5 sm:w-fit">
          <Skeleton className="h-10 w-24 rounded-xl bg-bg-tertiary" />
          <Skeleton className="h-10 w-24 rounded-xl bg-bg-tertiary" />
          <Skeleton className="h-10 w-24 rounded-xl bg-bg-tertiary" />
        </div>
        <section className="rounded-xl border border-border-default bg-bg-surface p-4 shadow-sm sm:p-5">
          <Skeleton className="h-5 w-32 bg-bg-tertiary" />
          <Skeleton className="mt-2 h-4 w-full max-w-md bg-bg-tertiary" />
          <RowStack count={3} label="Đang tải nội dung khoá" />
        </section>
      </div>
    </div>
  );
}

export function CourseContentListSkeleton({
  label = "Đang tải nội dung khoá",
}: {
  label?: string;
}) {
  return (
    <section
      className="rounded-xl border border-border-default bg-bg-surface p-4 shadow-sm sm:p-5"
      aria-busy="true"
    >
      <Skeleton className="h-5 w-40 bg-bg-tertiary" />
      <Skeleton className="mt-2 h-4 w-full max-w-md bg-bg-tertiary" />
      <RowStack count={3} label={label} />
    </section>
  );
}

export function LessonEditorSkeleton() {
  return (
    <div className="space-y-3" role="status" aria-label="Đang tải tiết học">
      <Skeleton className="h-6 w-20 rounded-full bg-bg-tertiary" />
      <Skeleton className="h-8 w-2/3 max-w-sm bg-bg-tertiary" />
      <Skeleton className="h-40 w-full bg-bg-tertiary" />
      <Skeleton className="h-24 w-full bg-bg-tertiary" />
    </div>
  );
}

export function LessonWorkspaceSkeleton() {
  return (
    <div
      className="flex min-h-0 flex-1 flex-col bg-bg-primary p-3 sm:p-6"
      aria-busy="true"
    >
      <span className="sr-only">Đang tải tiết học…</span>
      <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col gap-4">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-16 bg-bg-tertiary" />
          <Skeleton className="h-4 w-24 bg-bg-tertiary" />
          <Skeleton className="h-4 w-28 bg-bg-tertiary" />
        </div>
        <section className="rounded-xl border border-border-default bg-bg-surface p-4 shadow-sm sm:p-5">
          <Skeleton className="h-6 w-20 rounded-full bg-bg-tertiary" />
          <Skeleton className="mt-3 h-8 w-2/3 max-w-sm bg-bg-tertiary" />
          <Skeleton className="mt-6 h-40 w-full bg-bg-tertiary" />
          <Skeleton className="mt-3 h-24 w-full bg-bg-tertiary" />
        </section>
      </div>
    </div>
  );
}
