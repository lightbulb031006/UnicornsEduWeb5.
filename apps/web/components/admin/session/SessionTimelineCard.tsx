"use client";

import { useMemo, useState } from "react";

import type { ClassTimelineItemDto } from "@/dtos/class-timeline.dto";
import type { SessionItem } from "@/dtos/session.dto";
import { resolveSessionCommentDisplayContent } from "@/lib/session-comment-zalo.helpers";

import {
  ClassDetailDateTimeBlock,
  ClassDetailInfoColumn,
  renderSessionStatus,
} from "./SessionHistoryTable";
import { SessionCommentPreview } from "./session-form-ui";

type TimelineSession = NonNullable<ClassTimelineItemDto["session"]>;

/**
 * Timeline chỉ trả về sub-DTO gọn của buổi học, còn các block trình bày dùng chung
 * (`ClassDetailDateTimeBlock`, `ClassDetailInfoColumn`) nhận `SessionItem` đầy đủ.
 * Hàm này bắc cầu giữa hai shape, các field không có trên timeline để undefined.
 */
function toSessionItem(session: TimelineSession): SessionItem {
  return {
    id: session.id,
    classId: "",
    teacherId: "",
    date: session.date,
    startTime: session.startTime ?? undefined,
    endTime: session.endTime ?? undefined,
    notes: session.notes ?? undefined,
    lessonContent: session.lessonContent ?? undefined,
    homework: session.homework ?? undefined,
    tutorial: session.tutorial ?? undefined,
    recordingUrl: session.recordingUrl ?? undefined,
    coefficient: session.coefficient ?? undefined,
    teacherPaymentStatus: session.teacherPaymentStatus ?? undefined,
    trainingManagerAllowanceAmount:
      session.trainingManagerAllowanceAmount ?? undefined,
    class: session.className ? { name: session.className } : undefined,
    teacher: {
      fullName: session.teacher?.fullName ?? session.teacherName ?? undefined,
    },
    makeupScheduleEvent: session.makeupOriginalDate
      ? { originalDate: session.makeupOriginalDate }
      : undefined,
    attendance: (session.attendance ?? []).map((item) => ({
      studentId: item.studentId,
      status: item.status,
      notes: item.notes ?? undefined,
      student: { fullName: item.student?.fullName ?? undefined },
    })),
  } as SessionItem;
}

export default function SessionTimelineCard({
  session,
}: {
  session: TimelineSession;
}) {
  const [expanded, setExpanded] = useState(false);
  const sessionItem = useMemo(() => toSessionItem(session), [session]);
  const comment = useMemo(
    () => resolveSessionCommentDisplayContent(sessionItem),
    [sessionItem],
  );
  const status = useMemo(
    () => renderSessionStatus(sessionItem, "payment"),
    [sessionItem],
  );

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
      <div className="shrink-0">
        <ClassDetailDateTimeBlock session={sessionItem} />
      </div>

      <div className="min-w-0 flex-1">
        <SessionCommentPreview
          content={comment}
          className={expanded ? "" : "line-clamp-3"}
        />
        {comment.text ? (
          <button
            type="button"
            className="mt-1 text-[11px] font-medium text-primary hover:underline"
            onClick={(event) => {
              event.stopPropagation();
              setExpanded((prev) => !prev);
            }}
          >
            {expanded ? "Thu gọn" : "Xem thêm"}
          </button>
        ) : null}
      </div>

      <div className="w-full shrink-0 sm:w-40">
        <ClassDetailInfoColumn
          session={sessionItem}
          entityMode="teacher"
          status={status}
          showTrainingManagerAllowance={Boolean(
            session.trainingManagerAllowanceAmount,
          )}
        />
      </div>
    </div>
  );
}
