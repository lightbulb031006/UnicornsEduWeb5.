"use client";

import { useQuery } from "@tanstack/react-query";
import { getAppConfig } from "@/lib/apis/app-config.api";
import { appConfigKeys } from "@/lib/query-keys";

/** Hồ sơ môn không đổi trong vòng đời một instance → cache vĩnh viễn. */
export function useAppConfig() {
  return useQuery({
    queryKey: appConfigKeys.all,
    queryFn: getAppConfig,
    staleTime: Infinity,
    gcTime: Infinity,
  });
}
