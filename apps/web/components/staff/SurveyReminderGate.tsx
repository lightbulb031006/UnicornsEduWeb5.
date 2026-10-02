"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import * as surveysApi from "@/lib/apis/surveys.api";

const SESSION_DISMISS_KEY = "survey-reminder-dismissed-session";

function formatDate(value: string | null): string {
  if (!value) return "—";
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function isOverdue(endDate: string | null): boolean {
  if (!endDate) return false;
  return endDate.slice(0, 10) < getTodayIsoDate();
}

function getTodayIsoDate(): string {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}

/**
 * Modal cảnh báo cho gia sư: hiện mỗi khi truy cập web nếu có lớp đang running
 * còn thiếu báo cáo bài khảo sát đã mở. Một card/lớp, mỗi card liệt kê tất cả
 * bài khảo sát còn thiếu của lớp đó.
 *
 * Nếu có ít nhất 1 bài khảo sát quá hạn (endDate < hôm nay), việc "Để sau" chỉ
 * ẩn tạm trong lượt truy cập hiện tại (state, không lưu sessionStorage) — dialog
 * sẽ hiển thị lại ngay từ lần truy cập kế tiếp (tải lại trang / mở tab mới) cho
 * đến khi báo cáo xong. Nếu không có bài quá hạn, "Để sau" ẩn cho hết phiên
 * (sessionStorage) như trước.
 */
/** Giá trị chỉ đọc một lần lúc mount nên không cần subscribe thật. */
const subscribeNoop = () => () => {};

export default function SurveyReminderGate() {
  // Đọc sessionStorage qua useSyncExternalStore: server snapshot luôn là false
  // nên HTML server và lần hydrate đầu khớp nhau, sau đó React đọc lại giá trị
  // thật ở client. Không dùng lazy useState vì sẽ gây hydration mismatch.
  const dismissedThisSession = useSyncExternalStore(
    subscribeNoop,
    () => window.sessionStorage.getItem(SESSION_DISMISS_KEY) === "1",
    () => false,
  );
  const [dismissedLocally, setDismissedLocally] = useState(false);

  const warningsQuery = useQuery({
    queryKey: ["surveys", "my-warnings"],
    queryFn: () => surveysApi.getMyTeacherSurveyWarnings(),
    staleTime: 60_000,
    retry: false,
  });

  const warnings = warningsQuery.data ?? [];
  const hasOverdue = warnings.some((item) =>
    item.pendingSurveys.some((survey) => isOverdue(survey.endDate)),
  );
  const isDismissed = hasOverdue
    ? dismissedLocally
    : dismissedThisSession || dismissedLocally;
  const shouldShow = warnings.length > 0 && !isDismissed;

  if (!shouldShow) {
    return null;
  }

  const handleDismiss = () => {
    if (!hasOverdue) {
      window.sessionStorage.setItem(SESSION_DISMISS_KEY, "1");
    }
    setDismissedLocally(true);
  };

  return (
    <>
      <div className="fixed inset-0 z-[70] bg-bg-primary/80" aria-hidden />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="survey-reminder-gate-title"
        className="fixed left-1/2 top-1/2 z-[71] flex max-h-[85vh] w-[calc(100vw-1.5rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-warning/40 bg-bg-surface shadow-2xl sm:w-full"
      >
        <div
          className={`border-b border-border-default px-5 py-4 ${
            hasOverdue ? "bg-danger/10" : "bg-warning/10"
          }`}
        >
          <h2
            id="survey-reminder-gate-title"
            className="text-base font-semibold text-text-primary"
          >
            {hasOverdue
              ? "🔴 Có báo cáo khảo sát đã quá hạn"
              : "⚠️ Còn lớp chưa báo cáo khảo sát"}
          </h2>
          <p className="mt-1 text-sm text-text-secondary">
            Bạn đang phụ trách {warnings.length} lớp còn thiếu báo cáo khảo
            sát.{" "}
            {hasOverdue
              ? "Có bài đã quá hạn — cảnh báo này sẽ hiển thị lại mỗi khi bạn truy cập cho đến khi báo cáo xong."
              : "Vui lòng báo cáo sớm."}
          </p>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {warnings.map((item) => (
            <div
              key={item.classId}
              className="rounded-lg border border-border-default bg-bg-secondary/40 p-3"
            >
              <p className="text-sm font-semibold text-text-primary">
                {item.className}
              </p>
              <ul className="mt-2 space-y-1 text-xs text-text-secondary">
                {item.pendingSurveys.map((survey) => {
                  const overdue = isOverdue(survey.endDate);
                  return (
                    <li key={survey.surveyId}>
                      • {survey.name} ({formatDate(survey.startDate)} →{" "}
                      {formatDate(survey.endDate)})
                      {overdue ? (
                        <span className="ml-1.5 rounded-full bg-danger/15 px-1.5 py-0.5 text-[10px] font-semibold text-danger">
                          Quá hạn
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
              <Link
                href={`/staff/classes/${item.classId}?tab=surveys`}
                prefetch={false}
                onClick={handleDismiss}
                className="mt-3 inline-flex rounded-md bg-primary px-3 py-2 text-xs font-semibold text-text-inverse transition hover:opacity-90"
              >
                Báo cáo ngay
              </Link>
            </div>
          ))}
        </div>

        <div className="flex justify-end border-t border-border-default px-5 py-3">
          <button
            type="button"
            onClick={handleDismiss}
            className="rounded-md border border-border-default px-4 py-2 text-sm font-semibold text-text-secondary hover:bg-bg-secondary"
          >
            Để sau
          </button>
        </div>
      </div>
    </>
  );
}
