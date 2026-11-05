"use client";

import { useAppConfig } from "@/lib/hooks/useAppConfig";

/**
 * Giáo án học sinh giỏi (workspace lesson plan / lesson output) chỉ tồn tại
 * trên instance IT và Toán. JP/ENG giữ role `lesson_plan` / `lesson_plan_head` cho đội
 * giáo án khoá, nhưng không có workspace này.
 */
const GIFTED_LESSON_PLAN_ROUTE_PREFIXES = [
  "/admin/lesson-plans",
  "/admin/lesson-manage-details",
  "/admin/lesson_plan_detail",
  "/admin/lessons",
  "/staff/lesson-plans",
  "/staff/lesson-plan-tasks",
  "/staff/lesson-plan-manage-details",
  "/staff/lesson-manage-details",
  "/staff/lesson-plan-detail",
  "/staff/lesson_plan_detail",
] as const;

export function isGiftedLessonPlanRoute(pathname: string): boolean {
  return GIFTED_LESSON_PLAN_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * `true` khi instance có Giáo án học sinh giỏi (IT, Toán). Trả `undefined` lúc
 * app-config chưa tải xong để nơi gọi tránh nháy/ẩn sai.
 */
export function useGiftedLessonPlanEnabled(): boolean | undefined {
  const { data: appConfig } = useAppConfig();
  return appConfig ? ["it", "math"].includes(appConfig.profile) : undefined;
}
