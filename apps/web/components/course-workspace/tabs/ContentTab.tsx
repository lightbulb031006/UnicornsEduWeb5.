"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CourseModulesPanel } from "@/components/course-workspace/CourseModulesPanel";
import { CourseLessonsPanel } from "@/components/course-workspace/CourseLessonsPanel";
import type { CourseWorkspaceRouteBase } from "@/dtos/course-workspace.dto";
import {
  courseDetailHref,
  newLessonHref,
  lessonHref,
  replaceCourseWorkspaceUrl,
} from "@/lib/course-content-routes";

export function ContentTab({
  courseId,
  canEdit,
  routeBase,
  onOrderDirtyChange,
}: {
  courseId: string;
  canEdit: boolean;
  routeBase: CourseWorkspaceRouteBase;
  onOrderDirtyChange?: (dirty: boolean) => void;
}) {
  const { push } = useRouter();
  const searchParams = useSearchParams();
  const urlModuleId = searchParams.get("module");
  // Hiện panel mới ngay khi bấm; URL bắt kịp sau đó. `undefined` = theo URL.
  const [pendingModuleId, setPendingModuleId] = useState<
    string | null | undefined
  >(undefined);
  if (pendingModuleId !== undefined && pendingModuleId === urlModuleId) {
    setPendingModuleId(undefined);
  }
  const moduleId =
    pendingModuleId !== undefined ? pendingModuleId : urlModuleId;

  const setModuleQuery = (nextModuleId: string | null) => {
    setPendingModuleId(nextModuleId);
    replaceCourseWorkspaceUrl(
      courseDetailHref(routeBase, courseId, {
        tab: "noi-dung",
        module: nextModuleId,
      }),
    );
  };

  if (moduleId) {
    return (
      <CourseLessonsPanel
        courseId={courseId}
        moduleId={moduleId}
        canEdit={canEdit}
        onBack={() => setModuleQuery(null)}
        onOpenLesson={(lesson) =>
          push(lessonHref(routeBase, courseId, moduleId, lesson.id))
        }
        onCreateLesson={() => push(newLessonHref(routeBase, courseId, moduleId))}
        onOrderDirtyChange={onOrderDirtyChange}
      />
    );
  }

  return (
    <CourseModulesPanel
      courseId={courseId}
      canEdit={canEdit}
      onOpenModule={(id) => setModuleQuery(id)}
      onOrderDirtyChange={onOrderDirtyChange}
    />
  );
}
