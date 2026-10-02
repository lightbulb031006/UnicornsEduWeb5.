"use client";

import type { StudentSessionItem } from "@/dtos/student-class.dto";
import {
  ResponsiveDialog,
  ResponsiveDialogBody,
} from "@/components/ui/ResponsiveDialog";
import YouTubeEmbed from "@/components/ui/YouTubeEmbed";
import { Badge } from "@/components/ui/badge";
import MathContent from "@/components/ui/MathContent";
import { attendanceStatusLabel } from "./StudentTimelineCards";
import { formatVnWeekdayDate } from "@/lib/formatters";

function formatDateTime(date: Date, startTime?: string | null, endTime?: string | null): string {
  const d = formatVnWeekdayDate(new Date(date));

  if (startTime && endTime) {
    return `${d} • ${startTime.slice(0, 5)} - ${endTime.slice(0, 5)}`;
  }
  if (startTime) {
    return `${d} • Bắt đầu lúc ${startTime.slice(0, 5)}`;
  }
  return d;
}

export default function StudentSessionDetailDialog({
  session,
  onClose,
}: {
  session: StudentSessionItem;
  onClose: () => void;
}) {
  const myAttendance = session.attendance?.[0];
  const teacherName =
    [session.teacher?.user?.first_name, session.teacher?.user?.last_name]
      .filter(Boolean)
      .join(" ") || "Gia sư";

  return (
    <ResponsiveDialog onBackdropClick={onClose} size="7xl">
      <ResponsiveDialogBody className="max-h-[94vh] overflow-y-auto p-5 sm:p-7">
        <div className="space-y-5">
          {/* Header */}
          <div className="flex items-start justify-between gap-3 border-b border-border-default pb-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="default" className="text-xs">Buổi học</Badge>
                {myAttendance?.status && (
                  <span className="inline-flex rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                    Điểm danh: {attendanceStatusLabel(myAttendance.status)}
                  </span>
                )}
              </div>
              <h2 className="mt-2 text-xl font-bold text-text-primary sm:text-2xl">
                Chi tiết buổi học
              </h2>
              <p className="text-xs sm:text-sm text-text-muted mt-0.5">
                {formatDateTime(session.date, session.startTime, session.endTime)} • Gia sư: <span className="text-text-secondary font-semibold">{teacherName}</span>
              </p>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-text-muted hover:bg-bg-secondary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
              aria-label="Đóng popup"
            >
              <svg className="size-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* 2-Column Responsive Layout: Left Large Video (8 cols), Right Text Cards (4 cols) */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-start">
            {/* Left Column: Large Video Recording (Sticky on desktop) */}
            <div className="lg:col-span-7 xl:col-span-8 space-y-3 lg:sticky lg:top-0">
              {session.recordingUrl ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-primary flex items-center gap-1.5">
                      <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Video recording buổi học
                    </span>
                    <span className="text-[11px] text-text-muted">Bảo mật nội dung</span>
                  </div>
                  <YouTubeEmbed
                    url={session.recordingUrl}
                    protected
                    className="w-full aspect-video min-h-[280px] sm:min-h-[380px] md:min-h-[440px] lg:min-h-[480px] xl:min-h-[560px] 2xl:min-h-[620px] rounded-2xl shadow-xl"
                  />
                </div>
              ) : (
                <div className="flex aspect-video w-full min-h-[300px] sm:min-h-[400px] flex-col items-center justify-center rounded-2xl border border-dashed border-border-default bg-bg-secondary/30 p-8 text-center text-sm text-text-muted">
                  <svg className="size-12 text-text-muted/50 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Buổi học này chưa có video recording đính kèm.
                </div>
              )}
            </div>

            {/* Right Column: Detailed Text Cards (Scrollable independently when content is long) */}
            <div className="lg:col-span-5 xl:col-span-4 space-y-4 lg:max-h-[calc(88vh-120px)] lg:overflow-y-auto lg:pr-2 lg:overscroll-contain [scrollbar-width:thin]">
              {/* 1. Nhận xét dành riêng cho bạn */}
              {myAttendance?.notes && (
                <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 sm:p-5 shadow-xs break-words">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-primary mb-2 flex items-center gap-1.5">
                    <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                    </svg>
                    Nhận xét dành riêng cho bạn
                  </h3>
                  <MathContent content={myAttendance.notes} />
                </div>
              )}

              {/* 2. Nội dung bài học */}
              {session.lessonContent && (
                <div className="rounded-xl border border-border-default bg-bg-secondary/40 p-4 sm:p-5 break-words">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted mb-2 flex items-center gap-1.5">
                    <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                    </svg>
                    Nội dung bài học
                  </h3>
                  <MathContent content={session.lessonContent} />
                </div>
              )}

              {/* 3. Bài tập về nhà */}
              {session.homework && (
                <div className="rounded-xl border border-border-default bg-bg-secondary/40 p-4 sm:p-5 break-words">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted mb-2 flex items-center gap-1.5">
                    <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                    Bài tập về nhà
                  </h3>
                  <MathContent content={session.homework} />
                </div>
              )}

              {/* 4. Hướng dẫn tự học / Tutorial */}
              {session.tutorial && (
                <div className="rounded-xl border border-border-default bg-bg-secondary/40 p-4 sm:p-5 break-words">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted mb-2 flex items-center gap-1.5">
                    <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Hướng dẫn tự học / Tutorial
                  </h3>
                  <MathContent content={session.tutorial} />
                </div>
              )}

              {!session.lessonContent && !myAttendance?.notes && !session.homework && !session.tutorial && (
                <div className="rounded-xl border border-dashed border-border-default bg-bg-secondary/20 p-6 text-center text-xs text-text-muted">
                  Chưa có ghi chú hoặc bài tập cho buổi học này.
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end pt-2 border-t border-border-subtle">
            <button
              onClick={onClose}
              className="rounded-xl border border-border-default bg-bg-surface px-5 py-2.5 text-sm font-medium text-text-primary hover:bg-bg-secondary"
            >
              Đóng
            </button>
          </div>
        </div>
      </ResponsiveDialogBody>
    </ResponsiveDialog>
  );
}
