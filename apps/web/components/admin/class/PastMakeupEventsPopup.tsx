"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { MakeupScheduleEventRecord } from "@/dtos/class-schedule.dto";
import { formatVnDate } from "@/lib/formatters";

type PastMakeupEventsPopupProps = {
  open: boolean;
  onClose: () => void;
  classId: string;
  queryKeyPrefix: readonly unknown[];
  listFn: (
    classId: string,
    params: { startDate: string; endDate: string; page?: number; limit?: number },
  ) => Promise<{ data: MakeupScheduleEventRecord[]; total: number }>;
};

function formatDate(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function addDays(value: Date, days: number) {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
}

function formatDateLabel(value?: string | null) {
  if (!value) return "--";
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return formatVnDate(parsed);
}

function formatTime(value?: string | null) {
  return value ? value.slice(0, 5) : "--:--";
}

export default function PastMakeupEventsPopup({
  open,
  onClose,
  classId,
  queryKeyPrefix,
  listFn,
}: PastMakeupEventsPopupProps) {
  const range = useMemo(() => {
    const today = new Date();
    const yesterday = addDays(today, -1);
    return {
      startDate: formatDate(addDays(today, -31)),
      endDate: formatDate(yesterday),
    };
  }, []);

  const { data, isLoading, isError } = useQuery({
    queryKey: [...queryKeyPrefix, "past-makeup-events", classId, range.startDate, range.endDate],
    queryFn: () =>
      listFn(classId, {
        startDate: range.startDate,
        endDate: range.endDate,
        page: 1,
        limit: 100,
      }),
    enabled: open && Boolean(classId),
    staleTime: 60_000,
  });

  if (!open) {
    return null;
  }

  const items = data?.data ?? [];

  return (
    <>
      <div className="fixed inset-0 z-40 bg-bg-primary/75 backdrop-blur-[2px]" aria-hidden onClick={onClose} />
      <div className="fixed inset-0 z-50 overflow-y-auto p-3 sm:p-6">
        <div className="mx-auto flex min-h-full w-full max-w-2xl items-center">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="past-makeup-title"
            className="w-full rounded-lg border border-border-default bg-bg-surface p-4 shadow-2xl sm:p-5"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 id="past-makeup-title" className="text-base font-semibold text-text-primary">
                  Buổi bù đã qua
                </h2>
                <p className="mt-1 text-xs text-text-secondary">
                  {formatDateLabel(range.startDate)} - {formatDateLabel(range.endDate)}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex min-h-10 items-center justify-center rounded-md border border-border-default px-3 py-2 text-sm font-medium text-text-primary transition hover:bg-bg-tertiary"
              >
                Đóng
              </button>
            </div>

            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div key={index} className="h-16 animate-pulse rounded-lg bg-bg-secondary" />
                ))}
              </div>
            ) : isError ? (
              <p className="rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">
                Không tải được danh sách buổi bù đã qua.
              </p>
            ) : items.length === 0 ? (
              <p className="rounded-lg border border-border-default bg-bg-secondary px-3 py-3 text-sm text-text-secondary">
                Không có buổi bù đã qua trong 1 tháng gần nhất.
              </p>
            ) : (
              <div className="space-y-2">
                {items.map((item) => (
                  <article
                    key={item.id}
                    className="rounded-lg border border-border-default bg-bg-primary px-3 py-3"
                  >
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <div className="font-medium text-text-primary">
                        {formatDateLabel(item.date)} · {formatTime(item.startTime)}
                        {item.endTime ? `-${formatTime(item.endTime)}` : ""}
                      </div>
                      <div className="text-xs text-text-secondary">
                        {item.teacherName ?? "Chưa rõ gia sư"}
                      </div>
                    </div>
                    {item.note ? (
                      <p className="mt-2 text-xs text-text-secondary">{item.note}</p>
                    ) : null}
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
