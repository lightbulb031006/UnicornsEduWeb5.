"use client";

import { useQuery } from "@tanstack/react-query";
import * as classApi from "@/lib/apis/class.api";
import { courseKeys } from "@/lib/query-keys";

export function useCourseModules(courseId: string | undefined) {
  return useQuery({
    queryKey: courseKeys.modules(courseId ?? ""),
    queryFn: () => classApi.getModules(courseId!),
    enabled: Boolean(courseId),
  });
}
