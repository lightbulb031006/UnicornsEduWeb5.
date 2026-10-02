"use client";

import type { ClassTimelineKind } from "@/dtos/class-timeline.dto";
import type { LessonKind } from "@/dtos/course-content.dto";
import {
  lessonKindLabel,
  TIMELINE_LESSON_LABEL,
  TIMELINE_SESSION_LABEL,
  TIMELINE_SURVEY_LABEL,
  timelineKindBadgeClass,
  timelineKindIcon,
} from "@/lib/course-content-labels";
import { cn } from "@/lib/utils";

export function TimelineKindBadge({
  kind,
  lessonKind,
  label,
}: {
  kind: ClassTimelineKind;
  lessonKind?: LessonKind | string | null;
  label?: string | null;
}) {
  const Icon = timelineKindIcon(kind);
  const text =
    kind === "session"
      ? TIMELINE_SESSION_LABEL
      : kind === "class_survey"
        ? TIMELINE_SURVEY_LABEL
        : lessonKind
          ? lessonKindLabel(lessonKind)
          : label || TIMELINE_LESSON_LABEL;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold normal-case tracking-normal",
        timelineKindBadgeClass(kind),
      )}
    >
      <Icon className="size-3 shrink-0" aria-hidden />
      {text}
    </span>
  );
}
