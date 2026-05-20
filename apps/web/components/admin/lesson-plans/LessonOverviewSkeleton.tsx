"use client";

const DEFAULT_SKELETON_ROWS = 6;

function SkeletonBlock({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-full bg-bg-tertiary ${className}`}
      aria-hidden
    />
  );
}

function ActionSkeleton() {
  return <SkeletonBlock className="size-8 rounded-lg bg-bg-tertiary/70" />;
}

function SectionHeaderSkeleton({
  title,
  actionWidth,
}: {
  title: string;
  actionWidth: string;
}) {
  return (
    <div className="flex flex-col gap-4 border-b border-border-default pb-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h2 className="text-lg font-semibold text-text-primary sm:text-xl">
          {title}
        </h2>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
        <div className="flex flex-wrap items-center gap-2">
          <SkeletonBlock className="h-7 w-28 border border-border-default bg-bg-secondary" />
          <SkeletonBlock className="h-7 w-24 border border-border-default bg-bg-surface" />
        </div>
        <SkeletonBlock className={`h-11 w-full rounded-xl sm:w-auto ${actionWidth}`} />
      </div>
    </div>
  );
}

export function LessonOverviewTableSkeleton({
  rows = DEFAULT_SKELETON_ROWS,
  variant,
}: {
  rows?: number;
  variant: "resource" | "task";
}) {
  const isTask = variant === "task";

  return (
    <>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:hidden">
        {Array.from({ length: rows }).map((_, index) => (
          <article
            key={`mobile-${variant}-${index}`}
            className="rounded-[1.35rem] border border-border-default bg-bg-surface p-4 shadow-sm"
          >
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1 rounded-[1.2rem]">
                <SkeletonBlock className="h-3 w-20 bg-bg-tertiary/80" />
                <SkeletonBlock className="mt-2 h-5 w-4/5 bg-bg-tertiary" />
                <SkeletonBlock className="mt-2 h-4 w-28 bg-bg-tertiary/65" />

                {isTask ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <SkeletonBlock className="h-7 w-24 bg-bg-tertiary/80" />
                    <SkeletonBlock className="h-7 w-20 bg-bg-tertiary/65" />
                  </div>
                ) : (
                  <div className="mt-4 rounded-2xl border border-border-default/70 bg-bg-secondary/35 p-3">
                    <SkeletonBlock className="h-3 w-16 bg-bg-tertiary/75" />
                    <SkeletonBlock className="mt-3 h-4 w-full bg-bg-tertiary/70" />
                    <SkeletonBlock className="mt-2 h-4 w-3/4 bg-bg-tertiary/55" />
                  </div>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <ActionSkeleton />
                <SkeletonBlock className="size-8 rounded-lg bg-bg-tertiary/55" />
              </div>
            </div>

            {isTask ? (
              <div className="mt-4 grid gap-3">
                <div className="rounded-2xl border border-border-default/70 bg-bg-secondary/35 p-3">
                  <SkeletonBlock className="h-3 w-20 bg-bg-tertiary/75" />
                  <SkeletonBlock className="mt-3 h-4 w-32 bg-bg-tertiary/70" />
                  <SkeletonBlock className="mt-2 h-4 w-44 bg-bg-tertiary/55" />
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-border-default/70 bg-bg-secondary/35 p-3">
                <SkeletonBlock className="h-3 w-20 bg-bg-tertiary/75" />
                <div className="mt-3 flex flex-wrap gap-2">
                  <SkeletonBlock className="h-7 w-16 bg-bg-tertiary/80" />
                  <SkeletonBlock className="h-7 w-20 bg-bg-tertiary/65" />
                </div>
              </div>
            )}
          </article>
        ))}
      </div>

      <div className="hidden overflow-hidden rounded-[1.4rem] border border-border-default xl:block">
        <table className="min-w-full border-collapse text-left">
          <thead className="bg-bg-secondary">
            {isTask ? (
              <tr className="text-sm text-text-secondary">
                <th scope="col" className="px-4 py-3 font-medium">
                  Công việc
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Trạng thái
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Ưu tiên
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Hạn xử lý
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Nhân sự thực hiện
                </th>
                <th scope="col" className="w-20 px-4 py-3 text-right">
                  <span className="sr-only">Thao tác</span>
                </th>
              </tr>
            ) : (
              <tr className="text-sm text-text-secondary">
                <th scope="col" className="px-4 py-3 font-medium">
                  Tài nguyên
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Link
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Tag
                </th>
                <th scope="col" className="w-20 px-4 py-3 text-right">
                  <span className="sr-only">Thao tác</span>
                </th>
              </tr>
            )}
          </thead>

          <tbody>
            {Array.from({ length: rows }).map((_, index) => (
              <tr
                key={`${variant}-row-${index}`}
                className="border-t border-border-default bg-bg-surface align-top"
              >
                {isTask ? (
                  <>
                    <td className="p-4">
                      <div className="min-w-[12rem]">
                        <SkeletonBlock className="h-4 w-44 bg-bg-tertiary" />
                        <SkeletonBlock className="mt-3 h-3 w-28 bg-bg-tertiary/60" />
                      </div>
                    </td>
                    <td className="p-4">
                      <SkeletonBlock className="h-7 w-24 bg-bg-tertiary/80" />
                    </td>
                    <td className="p-4">
                      <SkeletonBlock className="h-7 w-20 bg-bg-tertiary/65" />
                    </td>
                    <td className="p-4">
                      <SkeletonBlock className="h-4 w-24 bg-bg-tertiary/70" />
                    </td>
                    <td className="p-4">
                      <SkeletonBlock className="h-4 w-36 bg-bg-tertiary/70" />
                      <SkeletonBlock className="mt-3 h-3 w-24 bg-bg-tertiary/50" />
                    </td>
                  </>
                ) : (
                  <>
                    <td className="p-4">
                      <div className="min-w-[12rem]">
                        <SkeletonBlock className="h-4 w-44 bg-bg-tertiary" />
                        <SkeletonBlock className="mt-3 h-3 w-28 bg-bg-tertiary/60" />
                      </div>
                    </td>
                    <td className="p-4">
                      <SkeletonBlock className="h-4 w-56 bg-bg-tertiary/70" />
                    </td>
                    <td className="p-4">
                      <div className="flex flex-wrap gap-2">
                        <SkeletonBlock className="h-7 w-16 bg-bg-tertiary/80" />
                        <SkeletonBlock className="h-7 w-20 bg-bg-tertiary/65" />
                      </div>
                    </td>
                  </>
                )}

                <td className="p-4">
                  <div className="flex items-start justify-end gap-2">
                    <ActionSkeleton />
                    <SkeletonBlock className="size-8 rounded-lg bg-bg-tertiary/55" />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function LessonTaskDetailSkeleton({
  canManageTask = true,
}: {
  canManageTask?: boolean;
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6" aria-busy="true">
      <div className="lg:col-span-2 flex flex-col gap-6">
        <section className="relative overflow-hidden rounded-[1.5rem] border border-border-default bg-bg-surface p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 flex-1">
                <SkeletonBlock className="h-3 w-40 bg-bg-tertiary/70" />
                <SkeletonBlock className="mt-4 h-8 w-2/3 max-w-lg rounded-2xl bg-bg-tertiary" />
              </div>
              {canManageTask ? (
                <SkeletonBlock className="h-9 w-36 shrink-0 rounded-xl bg-bg-tertiary/80" />
              ) : null}
            </div>

            <div className="rounded-xl border border-border-default bg-bg-secondary/45 p-4">
              <SkeletonBlock className="h-4 w-full bg-bg-tertiary/70" />
              <SkeletonBlock className="mt-2 h-4 w-5/6 bg-bg-tertiary/55" />
              <SkeletonBlock className="mt-2 h-4 w-2/3 bg-bg-tertiary/45" />
            </div>
          </div>
        </section>

        <section className="rounded-[1.5rem] border border-border-default bg-bg-surface p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-text-primary">
                Sản phẩm bài học
              </h2>
              <SkeletonBlock className="mt-2 h-3 w-28 bg-bg-tertiary/60" />
            </div>
            <SkeletonBlock className="h-9 w-28 rounded-xl bg-bg-tertiary/80" />
          </div>

          <div className="mt-4 space-y-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                key={`output-${index}`}
                className="flex items-start justify-between gap-4 rounded-xl border border-border-default bg-bg-secondary/35 p-4"
              >
                <div className="min-w-0 flex-1">
                  <SkeletonBlock className="h-4 w-4/5 bg-bg-tertiary" />
                  <SkeletonBlock className="mt-3 h-3 w-3/5 bg-bg-tertiary/65" />
                  <SkeletonBlock className="mt-3 h-3 w-48 bg-bg-tertiary/55" />
                </div>
                <SkeletonBlock className="h-6 w-20 bg-bg-tertiary/70" />
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-[1.5rem] border border-border-default bg-bg-surface p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-text-primary">
                Tài nguyên liên quan
              </h2>
              <SkeletonBlock className="mt-2 h-3 w-64 bg-bg-tertiary/60" />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {canManageTask ? (
                <SkeletonBlock className="h-9 w-28 rounded-xl bg-bg-tertiary/70" />
              ) : null}
              <SkeletonBlock className="h-9 w-28 rounded-xl border border-border-default bg-bg-surface" />
            </div>
          </div>

          <div className="mt-4 space-y-2">
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                key={`resource-${index}`}
                className="flex items-center justify-between gap-4 rounded-xl border border-border-default bg-bg-secondary/35 p-3.5"
              >
                <div className="min-w-0 flex-1">
                  <SkeletonBlock className="h-4 w-2/3 bg-bg-tertiary" />
                  <SkeletonBlock className="mt-2 h-3 w-4/5 bg-bg-tertiary/60" />
                </div>
                {canManageTask ? (
                  <SkeletonBlock className="h-8 w-14 rounded-lg bg-bg-tertiary/65" />
                ) : null}
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="flex flex-col gap-6">
        <section className="rounded-[1.5rem] border border-border-default bg-bg-surface p-5 shadow-sm">
          <SkeletonBlock className="mb-4 h-3 w-40 bg-bg-tertiary/70" />
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={`meta-${index}`}>
                {index > 0 ? <hr className="mb-4 border-border-default" /> : null}
                <SkeletonBlock className="h-3 w-24 bg-bg-tertiary/55" />
                <SkeletonBlock className="mt-2 h-6 w-32 bg-bg-tertiary/75" />
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-[1.5rem] border border-border-default bg-bg-surface p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <SkeletonBlock className="h-3 w-36 bg-bg-tertiary/70" />
            <SkeletonBlock className="h-6 w-10 bg-bg-tertiary/60" />
          </div>

          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <article
                key={`assignee-${index}`}
                className="flex items-center gap-3 rounded-xl border border-border-default bg-bg-secondary/25 p-3"
              >
                <SkeletonBlock className="size-9 shrink-0 rounded-full bg-bg-tertiary/70" />
                <div className="min-w-0 flex-1">
                  <SkeletonBlock className="h-4 w-32 bg-bg-tertiary" />
                  <SkeletonBlock className="mt-2 h-3 w-24 bg-bg-tertiary/55" />
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

export function LessonTaskDetailPageSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-bg-primary p-3 pb-8 sm:p-6">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 rounded-xl border border-border-default bg-bg-surface p-3 shadow-sm sm:rounded-lg sm:p-5">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <SkeletonBlock className="h-11 w-40 rounded-xl border border-border-default bg-bg-secondary" />
        </div>
        <LessonTaskDetailSkeleton canManageTask={false} />
      </div>
    </div>
  );
}

export function LessonWorkspaceLoadingSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-bg-primary p-3 pb-8 sm:p-6">
      <div className="flex min-w-0 flex-1 flex-col rounded-xl border border-border-default bg-bg-surface p-3 shadow-sm sm:rounded-lg sm:p-5">
        <header className="relative mb-6 min-w-0">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-xl font-semibold tracking-tight text-text-primary sm:text-2xl">
                  Giáo Án
                </h1>
                <SkeletonBlock className="h-6 w-24 rounded-full border border-primary/20 bg-primary/10" />
              </div>
              <SkeletonBlock className="mt-3 h-4 w-full max-w-3xl bg-bg-tertiary/65" />
              <SkeletonBlock className="mt-2 h-4 w-2/3 max-w-2xl bg-bg-tertiary/50" />
            </div>
          </div>

          <div className="mt-6 flex w-full min-w-0 gap-6 border-b border-border-default/80">
            <SkeletonBlock className="h-8 w-20 rounded-none bg-bg-tertiary/75" />
            <SkeletonBlock className="h-8 w-24 rounded-none bg-bg-tertiary/55" />
            <SkeletonBlock className="h-8 w-20 rounded-none bg-bg-tertiary/45" />
          </div>
        </header>

        <div className="min-w-0 flex-1">
          <LessonOverviewSkeleton />
        </div>
      </div>
    </div>
  );
}

export default function LessonOverviewSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true">
      <section className="py-1">
        <SectionHeaderSkeleton
          title="Tài nguyên giáo án"
          actionWidth="sm:w-36"
        />
        <div className="mt-4">
          <LessonOverviewTableSkeleton variant="resource" />
        </div>
      </section>

      <hr className="border-border-default/60 my-6" />

      <section className="py-1">
        <SectionHeaderSkeleton title="Công việc giáo án" actionWidth="sm:w-36" />
        <div className="mt-4">
          <LessonOverviewTableSkeleton variant="task" />
        </div>
      </section>
    </div>
  );
}
