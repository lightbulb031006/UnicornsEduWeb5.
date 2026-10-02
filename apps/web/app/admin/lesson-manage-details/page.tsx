import { Suspense } from "react";
import Link from "next/link";
import LessonExercisesTab from "@/components/admin/lesson-plans/LessonExercisesTab";

export function LessonManageDetailsPage({
  basePagePath = "/admin/lesson-plans",
  manageDetailsPath = "/admin/lesson-manage-details",
  participantMode = false,
}: {
  basePagePath?: string;
  manageDetailsPath?: string;
  participantMode?: boolean;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-bg-primary p-3 pb-8 sm:p-6">
      <div className="mx-auto flex w-full max-w-[1720px] flex-col gap-4 rounded-xl border border-border-default bg-bg-surface p-2 shadow-sm sm:rounded-lg sm:p-4">
        <div className="flex items-center justify-start">
          <Link
            href={`${basePagePath}?tab=exercises`}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border-default bg-bg-surface px-3 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
          >
            <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Quay lại
          </Link>
        </div>
        <Suspense fallback={null}>
          <LessonExercisesTab
            expandedView
            basePagePath={basePagePath}
            manageDetailsPath={manageDetailsPath}
            participantMode={participantMode}
          />
        </Suspense>
      </div>
    </div>
  );
}

export default function AdminLessonManageDetailsPage() {
  return <LessonManageDetailsPage />;
}
