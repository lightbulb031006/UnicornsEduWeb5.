"use client";

import type { ReactNode } from "react";
import { useInClassTestEnabled } from "@/lib/hooks/useInClassTestEnabled";

import type {
  AttendanceReviewFields,
  SessionReviewFields,
} from "@/dtos/session.dto";
import {
  formatHomeworkDueAtLabel,
  formatTestScoreLabel,
  HOMEWORK_QUALITY_LABELS,
  SESSION_PROGRESS_STATUS_LABELS,
  splitReviewLines,
} from "@/lib/session-comment-zalo.helpers";

function ReviewItem({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-medium uppercase text-text-muted">
        {label}
      </p>
      <div className="text-xs text-text-primary">{children}</div>
    </div>
  );
}

/** Danh sách ý của textarea "mỗi dòng một ý"; trả null khi trống. */
function ReviewLines({ value }: { value: string | null | undefined }) {
  const lines = splitReviewLines(value);
  if (lines.length === 0) return null;
  if (lines.length === 1) return <p className="break-words">{lines[0]}</p>;
  return (
    <ul className="list-disc space-y-0.5 pl-4">
      {lines.map((line, index) => (
        <li key={index} className="break-words">
          {line}
        </li>
      ))}
    </ul>
  );
}

function hasLines(value: string | null | undefined): boolean {
  return splitReviewLines(value).length > 0;
}

/**
 * Nhận xét buổi học có cấu trúc, góc nhìn một học sinh: phần riêng của em
 * (kiểm tra, điểm tốt, cần cải thiện, BTVN buổi trước) rồi phần chung của buổi
 * (tiến độ, hạn BTVN, buổi sau, kiểm tra lại). Chỉ dùng khi `progressStatus`
 * khác null — buổi legacy vẫn hiện `notes` tự do.
 */
export function StudentSessionReviewSummary({
  session,
  myReview,
}: {
  session: SessionReviewFields;
  myReview: AttendanceReviewFields | null | undefined;
}) {
  const inClassTestEnabled = useInClassTestEnabled();
  if (!session.progressStatus) return null;

  const showInClassTest = inClassTestEnabled && session.hasInClassTest;
  const testScore = showInClassTest
    ? formatTestScoreLabel(myReview?.testCorrectCount, session.inClassTestTotal)
    : "";
  const dueLabel = formatHomeworkDueAtLabel(session.homeworkDueAt);

  return (
    <div className="space-y-1.5">
      {showInClassTest && (testScore || hasLines(myReview?.testComment)) ? (
        <ReviewItem label="Kiểm tra trong buổi">
          {hasLines(session.inClassTestContent) ? (
            <ReviewLines value={session.inClassTestContent} />
          ) : null}
          {testScore ? <p className="font-medium">{testScore}</p> : null}
          <ReviewLines value={myReview?.testComment} />
        </ReviewItem>
      ) : null}
      {hasLines(myReview?.strengths) ? (
        <ReviewItem label="Điểm tốt">
          <ReviewLines value={myReview?.strengths} />
        </ReviewItem>
      ) : null}
      {hasLines(myReview?.improvements) ? (
        <ReviewItem label="Cần cải thiện">
          <ReviewLines value={myReview?.improvements} />
        </ReviewItem>
      ) : null}
      {myReview?.homeworkQuality ? (
        <ReviewItem label="Chất lượng BTVN buổi trước">
          <p className="font-medium">
            {HOMEWORK_QUALITY_LABELS[myReview.homeworkQuality]}
          </p>
          <ReviewLines value={myReview.homeworkComment} />
        </ReviewItem>
      ) : null}

      <ReviewItem label="Tiến độ">
        <p className="font-medium">
          {SESSION_PROGRESS_STATUS_LABELS[session.progressStatus]}
        </p>
        {hasLines(session.progressDone) ? (
          <div>
            <span className="text-text-muted">Đã xong:</span>
            <ReviewLines value={session.progressDone} />
          </div>
        ) : null}
        {hasLines(session.progressRemaining) ? (
          <div>
            <span className="text-text-muted">Chưa xong:</span>
            <ReviewLines value={session.progressRemaining} />
          </div>
        ) : null}
      </ReviewItem>
      {dueLabel ? (
        <ReviewItem label="Hạn BTVN">
          <p>{dueLabel}</p>
        </ReviewItem>
      ) : null}
      {hasLines(session.nextSessionPlan) ? (
        <ReviewItem label="Buổi sau">
          <ReviewLines value={session.nextSessionPlan} />
        </ReviewItem>
      ) : null}
      {session.hasRetest && hasLines(session.retestContent) ? (
        <ReviewItem label="Kiểm tra lại">
          <ReviewLines value={session.retestContent} />
        </ReviewItem>
      ) : null}
    </div>
  );
}
