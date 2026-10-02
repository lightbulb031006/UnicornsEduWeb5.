"use client";

import { useQuery } from "@tanstack/react-query";
import * as classApi from "@/lib/apis/class.api";
import { courseKeys } from "@/lib/query-keys";

export function useCourseDifficultyLevels(
  courseId: string | undefined,
  includeInactive = false,
) {
  return useQuery({
    queryKey: courseKeys.difficultyLevels(courseId ?? "", includeInactive),
    queryFn: () => classApi.getCourseDifficultyLevels(courseId!, includeInactive),
    enabled: Boolean(courseId),
  });
}
