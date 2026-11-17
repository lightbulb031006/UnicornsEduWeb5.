"use client";

import { useAppConfig } from "@/lib/hooks/useAppConfig";

/**
 * Giáo án học sinh giỏi (workspace task / lesson output — nơi đội giáo án điền
 * bài và trợ cấp) chỉ tồn tại trên instance IT và Toán. JP/ENG vẫn giữ nguyên
 * tính năng của role `lesson_plan` / `lesson_plan_head` (thu nhập role, trang
 * chi tiết, hoa hồng doanh thu Trưởng ban Chuyên môn) nên các route chi tiết
 * không nằm ở đây.
 */
const GIFTED_LESSON_PLAN_ROUTE_PREFIXES = [
  "/admin/lesson-plans",
  "/admin/lesson-manage-details",
  "/admin/lessons",
  "/staff/lesson-plans",
  "/staff/lesson-plan-tasks",
  "/staff/lesson-plan-manage-details",
  "/staff/lesson-manage-details",
] as const;

export function isGiftedLessonPlanRoute(pathname: string): boolean {
  return GIFTED_LESSON_PLAN_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * `true` khi instance có Giáo án học sinh giỏi (IT/Toán). Trả `undefined` lúc
 * app-config chưa tải xong để nơi gọi tránh nháy/ẩn sai.
 */
export function useGiftedLessonPlanEnabled(): boolean | undefined {
  const { data: appConfig } = useAppConfig();
  return appConfig
    ? appConfig.profile === "it" || appConfig.profile === "math"
    : undefined;
}
