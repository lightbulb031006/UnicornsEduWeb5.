"use client";

import { useState } from "react";
import { Play } from "lucide-react";

import type { ClassTimelineItemDto } from "@/dtos/class-timeline.dto";
import MathContent from "@/components/ui/MathContent";
import { formatVnWeekday } from "@/lib/formatters";
import { extractYouTubeVideoId, youtubeThumbnailUrl } from "@/lib/youtube";

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

function SessionField({
  label,
  content,
}: {
  label: string;
  content: string;
}) {
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
 * Ảnh tĩnh từ `recordingUrl` (field chính thức của buổi học). Không nhúng
 * `YouTubeEmbed` — trình phát chỉ mở khi học sinh bấm vào dòng/thumbnail.
 */
function SessionVideoThumbnail({
  recordingUrl,
  sessionDate,
}: {
  recordingUrl: string;
  sessionDate: string;
}) {
  const videoId = extractYouTubeVideoId(recordingUrl);
  const [imgFailed, setImgFailed] = useState(false);
  const dateLabel = formatDateOnly(sessionDate);
  const alt = `Video buổi học ngày ${dateLabel}`;
  const src = videoId && !imgFailed ? youtubeThumbnailUrl(videoId) : null;

  return (
    <div className="order-2 w-full max-w-[13.5rem] shrink-0 overflow-hidden rounded-lg bg-bg-secondary sm:order-3 sm:w-36">
      <div className="relative aspect-video">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element -- remote YouTube poster; Next Image needs a remotePatterns allowlist per host
          <img
            src={src}
            alt={alt}
            loading="lazy"
            decoding="async"
            className="size-full object-cover"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <div
            className="flex size-full items-center justify-center bg-bg-secondary"
            role="img"
            aria-label={alt}
          />
        )}
        <span
          className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/30"
          aria-hidden
        >
          <Play className="size-7 fill-white text-white drop-shadow-sm" />
        </span>
      </div>
    </div>
  );
}

/**
 * Row buổi học trên timeline học sinh: thời gian + nội dung buổi đầy đủ + nhận
 * xét dành riêng cho chính em. Có video thì hiện thumbnail tĩnh từ
 * `recordingUrl`; không suy đoán từ chữ trong mô tả. Không hiện dữ liệu vận
 * hành (hệ số, thanh toán gia sư, trợ cấp) và không hiện điểm danh/nhận xét
 * của bạn học khác.
 */
export function StudentSessionTimelineCard({
  session,
}: {
  session: TimelineSession;
}) {
  const fields = [
    { label: "Nội dung", content: session.lessonContent },
    { label: "Bài tập", content: session.homework },
    { label: "Hướng dẫn", content: session.tutorial },
  ].filter((field) => Boolean(field.content?.trim()));
  const statusLabel = attendanceStatusLabel(session.myAttendanceStatus);
  const myNotes = session.myAttendanceNotes?.trim() ?? "";
  const recordingUrl = session.recordingUrl?.trim() ?? "";
  const hasRecording = Boolean(recordingUrl);

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
      <div className="order-1 flex min-w-[5.5rem] shrink-0 flex-col gap-0.5 text-left">
        <p className="text-xs leading-tight text-text-secondary">
          {formatWeekday(session.date)}:
        </p>
        <p className="text-sm font-bold leading-tight text-text-primary">
          {formatDateOnly(session.date)}
        </p>
        <p className="font-mono text-[11px] leading-tight text-text-muted">
          {formatTimeRange(session.startTime, session.endTime)}
        </p>
      </div>

      {hasRecording ? (
        <SessionVideoThumbnail
          recordingUrl={recordingUrl}
          sessionDate={session.date}
        />
      ) : null}

      <div className="order-3 min-w-0 flex-1 space-y-2 sm:order-2">
        {fields.length ? (
          <div className="space-y-1.5">
            {fields.map((field) => (
              <SessionField
                key={field.label}
                label={field.label}
                content={field.content as string}
              />
            ))}
          </div>
        ) : (
          <p className="text-xs text-text-muted">
            Chưa có nội dung cho buổi học này.
          </p>
        )}

        {statusLabel || myNotes ? (
          <div className="flex flex-col gap-1 border-t border-border-subtle pt-2">
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
