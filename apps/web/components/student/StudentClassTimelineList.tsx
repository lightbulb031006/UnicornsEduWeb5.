"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import Link from "next/link";
import { List, Lock, X } from "lucide-react";
import { getStudentClassTimeline } from "@/lib/apis/class.api";
import { classTimelineKeys } from "@/lib/query-keys";
import type { ClassTimelineItemDto } from "@/dtos/class-timeline.dto";
import { Skeleton } from "@/components/ui/skeleton";
import { TimelineKindBadge } from "@/components/class-timeline/TimelineKindBadge";
import { ResponsiveDialog, ResponsiveDialogBody } from "@/components/ui/ResponsiveDialog";
import StudentSessionDetailDialog from "./StudentSessionDetailDialog";
import StudentSurveyDetailDialog from "./StudentSurveyDetailDialog";
import StudentClassTimelineToc, {
  type TimelineTocEntry,
} from "./StudentClassTimelineToc";
import StudentClassTocSidebar from "./StudentClassTocSidebar";
import {
  StudentSessionTimelineCard,
  StudentSurveyTimelineCard,
} from "./StudentTimelineCards";
import type { StudentSessionItem, StudentSurveyItem } from "@/dtos/student-class.dto";
import { studentLessonHref } from "@/lib/course-content-routes";

function mapSession(item: ClassTimelineItemDto): StudentSessionItem | null {
  if (item.kind !== "session" || !item.session) return null;
  return {
    id: item.session.id,
    teacherId: "",
    classId: "",
    date: new Date(item.session.date),
    startTime: item.session.startTime,
    endTime: item.session.endTime,
    lessonContent: item.session.lessonContent,
    homework: item.session.homework,
    tutorial: item.session.tutorial,
    recordingUrl: item.session.recordingUrl,
    coefficient: 1,
    attendance: item.session.myAttendanceStatus
      ? [
          {
            id: "me",
            studentId: "me",
            status: item.session.myAttendanceStatus,
            notes: item.session.myAttendanceNotes,
          },
        ]
      : [],
    teacher: {
      id: "",
      user: {
        first_name: item.session.teacherName,
        last_name: null,
      },
    },
  };
}

function mapSurvey(item: ClassTimelineItemDto): StudentSurveyItem | null {
  if (item.kind !== "class_survey" || !item.survey) return null;
  return {
    id: item.survey.id,
    classId: null,
    surveyId: null,
    teacherId: null,
    reportDate: new Date(item.survey.reportDate),
    knowledgeAssessment: null,
    survey: {
      id: item.survey.id,
      name: item.survey.surveyName,
      startDate: item.survey.startDate ? new Date(item.survey.startDate) : null,
      endDate: item.survey.endDate ? new Date(item.survey.endDate) : null,
    },
    studentAssessments: item.survey.myAssessment
      ? [
          {
            id: "me",
            studentId: "me",
            knowledgeAssessment: null,
            comment: item.survey.myAssessment,
          },
        ]
      : [],
  };
}

export default function StudentClassTimelineList({
  classId,
  header,
}: {
  classId: string;
  header?: ReactNode;
}) {
  const [selected, setSelected] = useState<ClassTimelineItemDto | null>(null);
  // Mục lục chỉ highlight item được bấm gần nhất (không scroll-spy theo khung nhìn).
  const [selectedTocId, setSelectedTocId] = useState<string | null>(null);
  const [tocOpen, setTocOpen] = useState(false);
  const rowRefs = useRef(new Map<string, HTMLElement>());

  const registerRow = useCallback((id: string, el: HTMLElement | null) => {
    if (el) rowRefs.current.set(id, el);
    else rowRefs.current.delete(id);
  }, []);

  const query = useInfiniteQuery({
    queryKey: classTimelineKeys.student(classId),
    queryFn: ({ pageParam }) =>
      getStudentClassTimeline(classId, {
        cursor: pageParam,
        limit: 20,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });

  const items = useMemo(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data],
  );

  // Mục lục cần biết toàn bộ item nên kéo hết các trang thay vì chờ scroll tới
  // sentinel; timeline một lớp thường chỉ vài chục item.
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const rows = useMemo(
    () =>
      items.map((item, index) => {
        const locked =
          item.kind === "content_item" &&
          item.lessonKind === "practice" &&
          item.isOpen === false;
        const href =
          item.kind === "content_item" && item.classContentItemId && item.lessonId
            ? item.lessonKind === "practice"
              ? `/student/classes/${classId}/assignments/${item.classContentItemId}`
              : studentLessonHref(classId, item.lessonId)
            : null;
        return { item, index, locked, href };
      }),
    [items, classId],
  );

  const tocEntries = useMemo<TimelineTocEntry[]>(
    () =>
      rows.map(({ item, index, locked }) => ({
        id: item.id,
        index: index + 1,
        title: item.title,
        kind: item.kind,
        lessonKind: item.lessonKind,
        locked,
      })),
    [rows],
  );

  const scrollToRow = useCallback((id: string) => {
    setTocOpen(false);
    // Đợi ResponsiveDialog nhả body scroll lock trước khi cuộn.
    requestAnimationFrame(() => {
      rowRefs.current.get(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
      setSelectedTocId(id);
    });
  }, []);

  if (query.isLoading) {
    return (
      <div className="space-y-6">
        {header}
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="space-y-6">
        {header}
        <div className="rounded-xl border border-dashed border-border-default bg-bg-secondary/20 p-8 text-center text-sm text-text-muted">
          Chưa có nội dung trên timeline lớp.
        </div>
      </div>
    );
  }

  const session = selected ? mapSession(selected) : null;
  const survey = selected ? mapSurvey(selected) : null;

  return (
    <>
      <div className="relative left-1/2 -mt-6 w-screen max-w-[100vw] -translate-x-1/2 sm:-mt-8 lg:flex lg:items-start">
        <StudentClassTocSidebar
          entries={tocEntries}
          activeId={selectedTocId}
          onSelect={scrollToRow}
          loadingMore={query.isFetchingNextPage}
        />

        <div className="min-w-0 flex-1 space-y-6 px-4 pt-6 sm:px-6 sm:pt-8 lg:px-8">
          {header}
          <div className="space-y-3">
        {rows.map(({ item, index, locked, href }) => {
          const orderBadge = (
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary">
              {index + 1}
            </div>
          );

          if (href && !locked) {
            return (
              <Link
                key={item.id}
                href={href}
                ref={(el) => registerRow(item.id, el)}
                data-timeline-id={item.id}
                className={`flex scroll-mt-24 items-center gap-3 rounded-xl border bg-bg-surface p-4 shadow-sm transition-shadow hover:border-primary/40 ${
                  selectedTocId === item.id
                    ? "border-primary ring-2 ring-primary ring-offset-2 ring-offset-bg-primary"
                    : "border-border-default"
                }`}
              >
                {orderBadge}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate font-semibold text-text-primary">
                      {item.title}
                    </h3>
                    <TimelineKindBadge
                      kind={item.kind}
                      lessonKind={item.lessonKind}
                      label={item.kindLabel}
                    />
                  </div>
                </div>
              </Link>
            );
          }

          const openDetail = () => {
            if (item.kind === "session" || item.kind === "class_survey") {
              setSelected(item);
            }
          };

          // Row buổi học/khảo sát có MathContent (có thể chứa link) nên không
          // dùng <button> bọc ngoài; dùng div có role="button". Bấm thumbnail
          // tĩnh (ảnh, không nhúng trình phát) cũng nổi sự kiện lên đây.
          return (
            <div
              key={item.id}
              ref={(el) => registerRow(item.id, el)}
              data-timeline-id={item.id}
              role="button"
              tabIndex={0}
              onClick={openDetail}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  openDetail();
                }
              }}
              className={`flex w-full scroll-mt-24 items-start gap-3 rounded-xl border bg-bg-surface p-4 text-left shadow-sm transition-shadow hover:border-primary/40 ${
                selectedTocId === item.id
                  ? "border-primary ring-2 ring-primary ring-offset-2 ring-offset-bg-primary"
                  : "border-border-default"
              }`}
            >
              {orderBadge}
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  {item.kind === "session" || item.kind === "class_survey" ? null : (
                    <h3 className="truncate font-semibold text-text-primary">
                      {item.title}
                    </h3>
                  )}
                  <TimelineKindBadge
                    kind={item.kind}
                    lessonKind={item.lessonKind}
                    label={item.kindLabel}
                  />
                  {locked ? <Lock className="size-3.5 text-text-muted" /> : null}
                </div>
                {item.kind === "session" && item.session ? (
                  <StudentSessionTimelineCard session={item.session} />
                ) : item.kind === "class_survey" && item.survey ? (
                  <StudentSurveyTimelineCard survey={item.survey} />
                ) : null}
              </div>
            </div>
          );
        })}
        {query.isFetchingNextPage ? (
          <p className="text-center text-xs text-text-muted">Đang tải thêm…</p>
        ) : null}
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setTocOpen(true)}
        className="fixed bottom-5 right-5 z-30 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-semibold text-white shadow-lg lg:hidden"
      >
        <List className="size-4" aria-hidden />
        Mục lục
      </button>

      {tocOpen ? (
        <ResponsiveDialog
          size="sm"
          labelledBy="student-timeline-toc-title"
          onBackdropClick={() => setTocOpen(false)}
        >
          <div className="flex shrink-0 items-center justify-between border-b border-border-default px-4 py-3">
            <h2 id="student-timeline-toc-title" className="text-sm font-semibold text-text-primary">
              Mục lục ({tocEntries.length})
            </h2>
            <button
              type="button"
              onClick={() => setTocOpen(false)}
              aria-label="Đóng mục lục"
              className="rounded-lg p-1 text-text-muted hover:bg-bg-secondary hover:text-text-primary"
            >
              <X className="size-4" />
            </button>
          </div>
          <ResponsiveDialogBody className="p-3 sm:p-3 [-webkit-overflow-scrolling:touch] [overscroll-behavior:contain]">
            <StudentClassTimelineToc
              entries={tocEntries}
              activeId={selectedTocId}
              onSelect={scrollToRow}
            />
          </ResponsiveDialogBody>
        </ResponsiveDialog>
      ) : null}

      {session ? (
        <StudentSessionDetailDialog
          session={session}
          onClose={() => setSelected(null)}
        />
      ) : null}
      {survey ? (
        <StudentSurveyDetailDialog
          survey={survey}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </>
  );
}
