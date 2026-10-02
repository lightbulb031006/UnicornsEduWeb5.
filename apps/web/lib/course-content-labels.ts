import { BookOpen, CalendarDays, ClipboardList } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ClassTimelineKind } from "@/dtos/class-timeline.dto";
import type { LessonKind } from "@/dtos/course-content.dto";

/** Nhãn đầy đủ — không viết tắt thành "Tiết" hay "Buổi". */
export const LESSON_KIND_LABEL: Record<LessonKind, string> = {
  theory: "Tiết lý thuyết",
  practice: "Tiết thực hành",
};

export const TIMELINE_SESSION_LABEL = "Buổi học";
export const TIMELINE_LESSON_LABEL = "Tiết học";
export const TIMELINE_SURVEY_LABEL = "Khảo sát";

export function lessonKindLabel(
  kind: LessonKind | string | null | undefined,
): string {
  if (kind === "practice") return LESSON_KIND_LABEL.practice;
  if (kind === "theory") return LESSON_KIND_LABEL.theory;
  return TIMELINE_LESSON_LABEL;
}

export function timelineKindIcon(kind: ClassTimelineKind): LucideIcon {
  if (kind === "session") return CalendarDays;
  if (kind === "class_survey") return ClipboardList;
  return BookOpen;
}

/** Semantic badge surface: Tiết học vs Buổi học must differ at a glance. */
export function timelineKindBadgeClass(kind: ClassTimelineKind): string {
  if (kind === "session") {
    return "border-success/20 bg-success/10 text-success";
  }
  if (kind === "class_survey") {
    return "border-border-default bg-bg-secondary text-text-secondary";
  }
  return "border-primary/15 bg-primary/10 text-primary";
}

export function lessonKindBadgeClass(kind: LessonKind | string): string {
  return kind === "practice"
    ? "border-warning/20 bg-warning/10 text-warning"
    : "border-primary/15 bg-primary/10 text-primary";
}
