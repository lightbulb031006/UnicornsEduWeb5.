"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import * as classApi from "@/lib/apis/class.api";
import type { ClassTheoryProgressStudentDto } from "@/dtos/class-theory-progress.dto";
import type { TheoryProgressTarget } from "@/dtos/class-content.dto";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ResponsiveDialog,
  ResponsiveDialogBody,
} from "@/components/ui/ResponsiveDialog";

const VIEWED_AT_FORMATTER = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function formatViewedAt(iso: string | null): string {
  if (!iso) return "Chưa xem";
  try {
    return VIEWED_AT_FORMATTER.format(new Date(iso));
  } catch {
    return "Đã xem";
  }
}

type TheoryProgressFilter = "all" | "viewed" | "completed" | "attention";

const THEORY_PROGRESS_FILTERS: { value: TheoryProgressFilter; label: string }[] = [
  { value: "all", label: "Tất cả" },
  { value: "viewed", label: "Đã xem" },
  { value: "completed", label: "Đã làm bài tập" },
  { value: "attention", label: "Chưa xong" },
];

/** Ai đã xem tiết lý thuyết / làm câu ôn nhẹ trong lớp. */
export default function TheoryProgressDialog({
  classId,
  item,
  onClose,
}: {
  classId: string;
  item: TheoryProgressTarget;
  onClose: () => void;
}) {
  const [filter, setFilter] = useState<TheoryProgressFilter>("all");
  const contentItemId = item.contentItemId;
  const { data, isLoading, isError } = useQuery({
    queryKey: ["class-theory-progress", classId, contentItemId],
    queryFn: () => classApi.getClassTheoryProgress(classId, contentItemId),
    enabled: Boolean(contentItemId),
  });

  const filteredStudents = useMemo(() => {
    const students = data?.students ?? [];
    return students.filter((student) => {
      if (filter === "viewed") return student.viewed;
      if (filter === "completed") return student.completedQuiz;
      if (filter === "attention") {
        return (
          !student.viewed ||
          (student.quizQuestionCount > 0 && !student.completedQuiz)
        );
      }
      return true;
    });
  }, [data?.students, filter]);

  return (
    <ResponsiveDialog
      size="3xl"
      labelledBy="theory-progress-title"
      onBackdropClick={onClose}
    >
      <div className="flex items-start justify-between gap-3 border-b border-border-default px-4 py-4 sm:px-5">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            Tiến độ tiết lý thuyết
          </p>
          <h2
            id="theory-progress-title"
            className="mt-1 truncate text-base font-semibold text-text-primary"
          >
            {data?.title ?? item.title}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-text-muted hover:bg-bg-secondary hover:text-text-primary"
          aria-label="Đóng"
        >
          <X className="size-4" />
        </button>
      </div>

      <ResponsiveDialogBody className="space-y-4">
        {isLoading ? (
          <div className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-3">
              {[1, 2, 3].map((key) => (
                <Skeleton key={key} className="h-20 rounded-xl" />
              ))}
            </div>
            {[1, 2, 3, 4].map((key) => (
              <Skeleton key={key} className="h-14 rounded-xl" />
            ))}
          </div>
        ) : isError || !data ? (
          <div className="rounded-xl border border-error/30 bg-error/10 p-4 text-sm text-error">
            Không tải được tiến độ tiết lý thuyết.
          </div>
        ) : (
          <>
            <div className="grid gap-2 sm:grid-cols-3">
              <TheoryProgressMetric
                label="Đã xem"
                value={`${data.viewedCount}/${data.rosterCount}`}
              />
              <TheoryProgressMetric
                label="Đã làm bài tập"
                value={
                  data.quizQuestionCount > 0
                    ? `${data.completedQuizCount}/${data.rosterCount}`
                    : "Không có"
                }
              />
              <TheoryProgressMetric
                label="Câu ôn nhẹ"
                value={String(data.quizQuestionCount)}
              />
            </div>

            <div className="flex flex-wrap gap-2">
              {THEORY_PROGRESS_FILTERS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setFilter(option.value)}
                  className={`inline-flex min-h-8 items-center rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                    filter === option.value
                      ? "border-primary bg-primary text-text-inverse"
                      : "border-border-default bg-bg-surface text-text-secondary hover:bg-bg-secondary"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>

            {filteredStudents.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border-default p-6 text-center text-sm text-text-muted">
                Không có học sinh khớp bộ lọc.
              </div>
            ) : (
              <div className="space-y-2">
                {filteredStudents.map((student) => (
                  <TheoryProgressStudentRow
                    key={student.studentId}
                    student={student}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </ResponsiveDialogBody>
    </ResponsiveDialog>
  );
}

function TheoryProgressMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-border-default bg-bg-secondary/40 p-3">
      <p className="text-xs font-medium text-text-muted">{label}</p>
      <p className="mt-1 text-lg font-semibold text-text-primary">{value}</p>
    </div>
  );
}

function TheoryProgressStudentRow({
  student,
}: {
  student: ClassTheoryProgressStudentDto;
}) {
  const quizText =
    student.quizQuestionCount > 0
      ? `${student.answeredQuizQuestionCount}/${student.quizQuestionCount} câu`
      : "Không có bài tập";

  return (
    <div className="rounded-xl border border-border-default bg-bg-surface p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-text-primary">
            {student.studentName}
          </p>
          <p className="mt-0.5 text-xs text-text-muted">
            {student.viewed
              ? `Xem lần cuối: ${formatViewedAt(student.lastViewedAt)}`
              : "Chưa xem tiết học"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span
            className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
              student.viewed
                ? "bg-success/10 text-success"
                : "bg-bg-secondary text-text-muted"
            }`}
          >
            {student.viewed ? "Đã xem" : "Chưa xem"}
          </span>
          <span
            className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
              student.completedQuiz
                ? "bg-success/10 text-success"
                : "bg-bg-secondary text-text-muted"
            }`}
          >
            {student.completedQuiz ? "Đã làm bài tập" : quizText}
          </span>
        </div>
      </div>
    </div>
  );
}
