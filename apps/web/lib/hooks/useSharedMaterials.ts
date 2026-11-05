"use client";

import { useQuery } from "@tanstack/react-query";
import * as sharedMaterialApi from "@/lib/apis/shared-material.api";
import { sharedMaterialKeys } from "@/lib/query-keys";

/** Tư liệu dùng chung của khoá — chỉ gọi khi hồ sơ bật (`enabled`). */
export function useSharedMaterials(
  courseId: string | undefined,
  enabled = true,
) {
  return useQuery({
    queryKey: sharedMaterialKeys.course(courseId ?? ""),
    queryFn: () => sharedMaterialApi.getSharedMaterials(courseId!),
    enabled: Boolean(courseId) && enabled,
  });
}
