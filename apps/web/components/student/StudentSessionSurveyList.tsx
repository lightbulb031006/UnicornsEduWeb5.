"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import type { StudentSessionItem, StudentSurveyItem } from "@/dtos/student-class.dto";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import StudentSessionDetailDialog from "./StudentSessionDetailDialog";
import StudentSurveyDetailDialog from "./StudentSurveyDetailDialog";

type CombinedItem =
  | { type: "session"; date: Date; data: StudentSessionItem }
  | { type: "survey"; date: Date; data: StudentSurveyItem };

const INITIAL_PAGE_SIZE = 10;
const PAGE_INCREMENT = 10;

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("vi-VN", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(date));
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}

export default function StudentSessionSurveyList({
  sessions,
  surveys,
  isLoading,
}: {
  sessions: StudentSessionItem[];
  surveys: StudentSurveyItem[];
  isLoading: boolean;
}) {
  const [selectedItem, setSelectedItem] = useState<CombinedItem | null>(null);
  const [visibleCount, setVisibleCount] = useState(INITIAL_PAGE_SIZE);
  const [isRevealingMore, setIsRevealingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const combined = useMemo(() => {
    const items: CombinedItem[] = [
      ...sessions.map((s) => ({ type: "session" as const, date: new Date(s.date), data: s })),
      ...surveys.map((s) => ({ type: "survey" as const, date: new Date(s.reportDate), data: s })),
    ];
    return items.sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [sessions, surveys]);

  const hasMore = visibleCount < combined.length;

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setIsRevealingMore(true);
          // Small delay for smooth scroll UX
          setTimeout(() => {
            setVisibleCount((prev) => Math.min(prev + PAGE_INCREMENT, combined.length));
            setIsRevealingMore(false);
          }, 150);
        }
      },
      { rootMargin: "250px" },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, combined.length]);

  const visibleItems = useMemo(
    () => combined.slice(0, visibleCount),
    [combined, visibleCount],
  );

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (!combined.length) {
    return (
      <div className="rounded-xl border border-dashed border-border-default bg-bg-secondary/20 p-8 text-center text-sm text-text-muted">
        Chưa có buổi học hoặc khảo sát nào trong lớp học này.
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {visibleItems.map((item, idx) => {
          const isSession = item.type === "session";
          const hasRecording = isSession && Boolean(item.data.recordingUrl);
          const title = isSession
            ? item.data.lessonContent
              ? stripHtml(item.data.lessonContent).slice(0, 100)
              : "Buổi học"
            : item.data.survey?.name || "Khảo sát định kỳ";

          return (
            <div
              key={`${item.type}-${item.data.id || idx}`}
              className="group flex cursor-pointer flex-col gap-2.5 rounded-xl border border-border-default bg-bg-surface p-4 transition-[color,background-color,border-color,box-shadow] hover:border-primary/40 hover:bg-bg-secondary/60 hover:shadow-sm sm:flex-row sm:items-center sm:justify-between"
              role="button"
              tabIndex={0}
              onClick={() => setSelectedItem(item)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setSelectedItem(item);
                }
              }}
            >
              <div className="flex items-start gap-3 min-w-0">
                <div
                  className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg ${
                    isSession
                      ? "bg-primary/10 text-primary"
                      : "bg-info/10 text-info"
                  }`}
                  aria-hidden
                >
                  {isSession ? (
                    <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                    </svg>
                  ) : (
                    <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                    </svg>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={isSession ? "default" : "secondary"} className="text-[11px]">
                      {isSession ? "Buổi học" : "Khảo sát"}
                    </Badge>
                    <span className="text-xs font-semibold text-text-secondary">
                      {formatDate(item.date)}
                    </span>
                    {hasRecording && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-error/10 px-2 py-0.5 text-[10px] font-semibold text-error">
                        <svg className="size-3" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615 12.816v-8l8 3.993-8 4.007z" />
                        </svg>
                        Recording
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-sm font-medium text-text-primary group-hover:text-primary transition-colors line-clamp-1">
                    {title}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 shrink-0 pt-1 sm:pt-0">
                <span className="text-xs font-medium text-text-muted group-hover:text-primary flex items-center gap-1">
                  Xem chi tiết
                  <svg className="size-4 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </span>
              </div>
            </div>
          );
        })}

        {/* Sentinel for infinite scroll */}
        {hasMore && (
          <div ref={sentinelRef} className="h-4 w-full" aria-hidden />
        )}

        {isRevealingMore && (
          <div className="flex items-center justify-center gap-2 py-3 text-xs font-medium text-text-muted">
            <Loader2 className="size-4 animate-spin text-primary" />
            <span>Đang tải thêm buổi học & khảo sát…</span>
          </div>
        )}
      </div>

      {selectedItem?.type === "session" && (
        <StudentSessionDetailDialog
          session={selectedItem.data}
          onClose={() => setSelectedItem(null)}
        />
      )}
      {selectedItem?.type === "survey" && (
        <StudentSurveyDetailDialog
          survey={selectedItem.data}
          onClose={() => setSelectedItem(null)}
        />
      )}
    </>
  );
}
