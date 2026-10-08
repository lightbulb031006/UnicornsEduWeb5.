"use client";

import { useRef, type ReactNode } from "react";
import { VideoOff } from "lucide-react";

import type { ClassTimelineItemDto } from "@/dtos/class-timeline.dto";
import MathContent from "@/components/ui/MathContent";
import YouTubeEmbed from "@/components/ui/YouTubeEmbed";
import { useNearViewport } from "@/hooks/use-near-viewport";
import { formatVnWeekday } from "@/lib/formatters";

type TimelineSession = NonNullable<ClassTimelineItemDto["session"]>;
type TimelineSurvey = NonNullable<ClassTimelineItemDto["survey"]>;

/** Nhãn tiếng Việt cho `AttendanceStatus` (present | excused | absent). */
export function attendanceStatusLabel(status: string | null): string | null {
  if (!status) return null;
  if (status === "present") return "Có mặt";
  if (status === "excused") return "Vắng có phép";
  if (status === "absent") return "Vắng mặt";
  return status;
}

function attendanceStatusClassName(status: string | null): string {
  if (status === "present") return "bg-success/10 text-success";
  if (status === "excused") return "bg-warning/10 text-warning";
  if (status === "absent") return "bg-danger/10 text-danger";
  return "bg-primary/10 text-primary";
}

function formatWeekday(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return formatVnWeekday(date);
}

function formatDateOnly(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("vi-VN");
}

/** `startTime`/`endTime` từ API là chuỗi `HH:mm:ss`, cắt còn `HH:mm`. */
function formatTimeRange(
  startTime: string | null,
  endTime: string | null,
): string {
  const start = startTime?.slice(0, 5);
  const end = endTime?.slice(0, 5);
  if (start && end) return `${start} – ${end}`;
  return start || end || "—";
}

function SessionField({ label, content }: { label: string; content: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-medium uppercase text-text-muted">
        {label}
      </p>
      <MathContent content={content} className="text-xs" />
    </div>
  );
}

/**
 * Khung video 16:9 của thẻ buổi học. Trình phát `YouTubeEmbed` (poster tới khi
 * bấm, không tự phát) chỉ mount khi khung gần viewport; buổi chưa có video giữ
 * khung rỗng cùng tỉ lệ để các thẻ thẳng hàng.
 */
function SessionVideoFrame({
  recordingUrl,
  sessionDate,
}: {
  recordingUrl: string;
  sessionDate: string;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const nearViewport = useNearViewport(frameRef);
  const title = `Video buổi học ngày ${formatDateOnly(sessionDate)}`;

  if (!recordingUrl) {
    return (
      <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border-default bg-bg-secondary/40 text-xs text-text-muted">
        <VideoOff className="size-6 text-text-muted/60" aria-hidden />
        Buổi học chưa có video.
      </div>
    );
  }

  return (
    <div
      ref={frameRef}
      className="aspect-video w-full overflow-hidden rounded-xl bg-bg-secondary"
    >
      {nearViewport ? (
        <YouTubeEmbed
          url={recordingUrl}
          protected
          title={title}
          className="aspect-video w-full rounded-xl"
        />
      ) : null}
    </div>
  );
}

/**
 * Thẻ buổi học trên tab Buổi học của học sinh: ngày giờ ở đầu; video lớn bên
 * trái (trên ở mobile); cột chữ bắt đầu bằng điểm danh + nhận xét dành riêng
 * cho em, rồi Nội dung bài học, BTVN, Tutorial. Không hiện dữ liệu vận hành
 * (hệ số, thanh toán gia sư, trợ cấp) và không hiện điểm danh/nhận xét của bạn
 * học khác.
 */
export function StudentSessionTimelineCard({
  session,
  leading,
}: {
  session: TimelineSession;
  /** Hiện trước ngày giờ trên hàng đầu thẻ (số thứ tự, badge loại). */
  leading?: ReactNode;
}) {
  const fields = [
    { label: "Nội dung bài học", content: session.lessonContent },
    { label: "BTVN", content: session.homework },
    { label: "Tutorial", content: session.tutorial },
  ].filter((field): field is { label: string; content: string } =>
    Boolean(field.content?.trim()),
  );
  const statusLabel = attendanceStatusLabel(session.myAttendanceStatus);
  const myNotes = session.myAttendanceNotes?.trim() ?? "";
  const recordingUrl = session.recordingUrl?.trim() ?? "";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {leading}
        <p className="flex flex-wrap items-baseline gap-x-2 text-sm font-semibold text-text-primary">
          <span>
            {formatWeekday(session.date)}, {formatDateOnly(session.date)}
          </span>
          <span className="font-mono text-xs font-normal text-text-muted">
            {formatTimeRange(session.startTime, session.endTime)}
          </span>
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] md:gap-4">
        <SessionVideoFrame
          recordingUrl={recordingUrl}
          sessionDate={session.date}
        />

        <div className="min-w-0 space-y-2">
          {statusLabel || myNotes ? (
            <div className="flex flex-col gap-1 border-b border-border-subtle pb-2">
              {statusLabel ? (
                <span
                  className={`inline-flex w-fit rounded-full px-2 py-0.5 text-[11px] font-medium ${attendanceStatusClassName(
                    session.myAttendanceStatus,
                  )}`}
                >
                  {statusLabel}
                </span>
              ) : null}
              {myNotes ? (
                <MathContent content={myNotes} className="text-xs" />
              ) : null}
            </div>
          ) : null}

          {fields.length ? (
            <div className="space-y-1.5">
              {fields.map((field) => (
                <SessionField
                  key={field.label}
                  label={field.label}
                  content={field.content}
                />
              ))}
            </div>
          ) : (
            <p className="text-xs text-text-muted">
              Chưa có nội dung cho buổi học này.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Row khảo sát trên timeline học sinh: tên bài + ngày báo cáo + nhận xét dành
 * riêng cho em (đầy đủ, không cắt). Đánh giá kiến thức chung của lớp chỉ dành
 * cho staff.
 */
export function StudentSurveyTimelineCard({
  survey,
}: {
  survey: TimelineSurvey;
}) {
  const assessment = survey.myAssessment?.trim() ?? "";

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase text-text-muted">
            Bài khảo sát
          </p>
          <p className="truncate text-sm font-semibold text-text-primary">
            {survey.surveyName?.trim() || "Báo cáo khảo sát"}
          </p>
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase text-text-muted">
            Ngày báo cáo
          </p>
          <p className="text-sm text-text-primary">
            {formatDateOnly(survey.reportDate)}
          </p>
        </div>
      </div>

      <div className="border-t border-border-subtle pt-2">
        {assessment ? (
          <MathContent content={assessment} className="text-xs" />
        ) : (
          <p className="text-xs text-text-muted">
            Chưa có nhận xét dành cho em ở bài khảo sát này.
          </p>
        )}
      </div>
    </div>
  );
}
