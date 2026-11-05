"use client";

import { useAppConfig } from "@/lib/hooks/useAppConfig";

/**
 * Nhận xét buổi học có phần Kiểm tra trong buổi hay không (IT tắt; JP/ENG bật).
 * Lúc app-config chưa tải xong giữ hành vi cũ (bật).
 */
export function useInClassTestEnabled(): boolean {
  const { data: appConfig } = useAppConfig();
  return appConfig?.inClassTest ?? true;
}
