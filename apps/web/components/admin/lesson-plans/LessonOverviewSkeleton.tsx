"use client";

function SkeletonBlock({ className }: { className: string }) {
  return (
    <div
      className={`animate-pulse rounded-2xl bg-bg-tertiary ${className}`}
      aria-hidden
    />
  );
}

export default function LessonOverviewSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-4 py-1">
        <SkeletonBlock className="h-8 w-56" />
        <div className="space-y-3">
          <SkeletonBlock className="h-28" />
          <SkeletonBlock className="h-28" />
          <SkeletonBlock className="h-28" />
        </div>
      </div>

      <hr className="border-border-default/60 my-6" />

      <div className="space-y-4 py-1">
        <SkeletonBlock className="h-8 w-52" />
        <div className="space-y-3">
          <SkeletonBlock className="h-24" />
          <SkeletonBlock className="h-24" />
          <SkeletonBlock className="h-24" />
        </div>
      </div>
    </div>
  );
}
