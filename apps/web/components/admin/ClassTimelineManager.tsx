"use client";

import {
  useCallback,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import Link from "next/link";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  type DragEndEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart3, Eye, GripVertical, PenLine, Plus, X } from "lucide-react";
import { toast } from "sonner";
import * as classApi from "@/lib/apis/class.api";
import SessionTimelineCard from "@/components/admin/session/SessionTimelineCard";
import SurveyTimelineCard from "@/components/admin/class/SurveyTimelineCard";
import * as sessionApi from "@/lib/apis/session.api";
import { classTimelineKeys } from "@/lib/query-keys";
import type { ClassTimelineItemDto } from "@/dtos/class-timeline.dto";
import type { ClassTheoryProgressStudentDto } from "@/dtos/class-theory-progress.dto";
import type { SessionItem } from "@/dtos/session.dto";
import type { ClassSurveyRecord } from "@/dtos/class-survey.dto";
import ClassContentManager from "@/components/admin/ClassContentManager";
import { TimelineKindBadge } from "@/components/class-timeline/TimelineKindBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  ResponsiveDialog,
  ResponsiveDialogBody,
} from "@/components/ui/ResponsiveDialog";

const OCCURRED_AT_FORMATTER = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const VIEWED_AT_FORMATTER = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function monthYearFromIso(iso: string | null): { month: string; year: string } | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return {
    year: String(date.getFullYear()),
    month: String(date.getMonth() + 1).padStart(2, "0"),
  };
}

function formatOccurredAt(iso: string | null): string {
  if (!iso) return "";
  try {
    return OCCURRED_AT_FORMATTER.format(new Date(iso));
  } catch {
    return "";
  }
}

function formatViewedAt(iso: string | null): string {
  if (!iso) return "Chưa xem";
  try {
    return VIEWED_AT_FORMATTER.format(new Date(iso));
  } catch {
    return "Đã xem";
  }
}

function SortableTimelineRow({
  item,
  canReorder,
  practiceActionsBasePath,
  onOpenTheoryProgress,
  onOpen,
}: {
  item: ClassTimelineItemDto;
  canReorder: boolean;
  practiceActionsBasePath?: string | null;
  onOpenTheoryProgress?: (item: ClassTimelineItemDto) => void;
  onOpen: (item: ClassTimelineItemDto) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id, disabled: !canReorder });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.7 : 1,
  };
  const showPracticeActions =
    item.kind === "content_item" &&
    item.lessonKind === "practice" &&
    Boolean(item.classContentItemId && practiceActionsBasePath);
  const showTheoryActions =
    item.kind === "content_item" &&
    item.lessonKind === "theory" &&
    Boolean(item.classContentItemId && onOpenTheoryProgress);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-start gap-2 rounded-xl border border-border-default bg-bg-surface p-3 shadow-sm ${item.hiddenAt ? "opacity-70" : ""}`}
    >
      {canReorder ? (
        <button
          type="button"
          className="inline-flex size-9 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-text-muted hover:bg-bg-secondary active:cursor-grabbing"
          aria-label="Kéo để đổi thứ tự"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>
      ) : null}
      <div
        className="min-w-0 flex-1"
      >
        <div
          role="button"
          tabIndex={0}
          onClick={() => onOpen(item)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onOpen(item);
            }
          }}
          className="cursor-pointer rounded-lg p-1 text-left hover:bg-bg-secondary/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
        >
          {item.kind === "session" && item.session ? (
            <div className="space-y-2">
              <TimelineKindBadge kind={item.kind} />
              <SessionTimelineCard session={item.session} />
            </div>
          ) : item.kind === "class_survey" && item.survey ? (
            <div className="space-y-2">
              <TimelineKindBadge kind={item.kind} />
              <SurveyTimelineCard survey={item.survey} />
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <TimelineKindBadge
                  kind={item.kind}
                  lessonKind={item.lessonKind}
                  label={item.kindLabel}
                />
                {item.hiddenAt ? (
                  <span className="inline-flex rounded-full bg-error/10 px-2 py-0.5 text-[10px] font-semibold text-error">
                    Đã ẩn
                  </span>
                ) : null}
              </div>
              <p className="mt-1 truncate text-sm font-medium text-text-primary">
                {item.title}
              </p>
              {item.lessonKind === "practice" &&
              (item.openAt || item.durationMinutes) ? (
                <p className="mt-0.5 text-xs text-text-muted">
                  {[
                    item.openAt ? `Mở: ${formatOccurredAt(item.openAt)}` : null,
                    item.durationMinutes
                      ? `${item.durationMinutes} phút`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              ) : null}
            </>
          )}
        </div>
        {showPracticeActions || showTheoryActions ? (
          <div className="mt-2 flex flex-wrap items-center gap-2 px-1">
            {showPracticeActions ? (
              <>
                <Link
                  href={`${practiceActionsBasePath}/practice/${item.classContentItemId}/stats`}
                  className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-border-default px-2.5 py-1 text-xs font-medium text-text-secondary transition-colors hover:bg-bg-secondary"
                >
                  <BarChart3 className="size-3.5" />
                  Thống kê
                </Link>
                <Link
                  href={`${practiceActionsBasePath}/grading/${item.classContentItemId}`}
                  className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-border-default px-2.5 py-1 text-xs font-medium text-text-secondary transition-colors hover:bg-bg-secondary"
                >
                  <PenLine className="size-3.5" />
                  Chấm bài
                </Link>
              </>
            ) : null}
            {showTheoryActions ? (
              <button
                type="button"
                onClick={() => onOpenTheoryProgress?.(item)}
                className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-border-default px-2.5 py-1 text-xs font-medium text-text-secondary transition-colors hover:bg-bg-secondary"
              >
                <Eye className="size-3.5" />
                Tiến độ
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

type TheoryProgressFilter = "all" | "viewed" | "completed" | "attention";

const THEORY_PROGRESS_FILTERS: { value: TheoryProgressFilter; label: string }[] = [
  { value: "all", label: "Tất cả" },
  { value: "viewed", label: "Đã xem" },
  { value: "completed", label: "Đã làm bài tập" },
  { value: "attention", label: "Chưa xong" },
];

function TheoryProgressDialog({
  classId,
  item,
  onClose,
}: {
  classId: string;
  item: ClassTimelineItemDto;
  onClose: () => void;
}) {
  const [filter, setFilter] = useState<TheoryProgressFilter>("all");
  const contentItemId = item.classContentItemId ?? "";
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

type MonthYearParams = { month: string; year: string };

/** Trang gọi quyết định — không đọc role bên trong component. */
export type TimelineLessonVisibility = "always" | "opt-in";

function LessonItemsToggle({
  checked,
  onCheckedChange,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-h-11 w-full cursor-pointer items-center justify-between gap-3 rounded-lg border border-border-default bg-bg-surface px-3 py-2">
      <span className="min-w-0">
        <span className="block text-sm font-medium text-text-primary">
          Hiện tiết học
        </span>
        <span className="block text-xs text-text-muted">
          Tiết lý thuyết và tiết thực hành
        </span>
      </span>
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        aria-label="Hiện tiết học lý thuyết và tiết học thực hành"
      />
    </label>
  );
}

export default function ClassTimelineManager({
  classId,
  canCreateSession,
  canManageSurveys,
  canManageContent,
  canReorder,
  lessonVisibility = "always",
  practiceActionsBasePath,
  onCreateSession,
  fetchSessions,
  fetchSurveys,
  sessionTable,
  surveyPanel,
}: {
  classId: string;
  canCreateSession: boolean;
  canManageSurveys: boolean;
  canManageContent: boolean;
  canReorder?: boolean;
  lessonVisibility?: TimelineLessonVisibility;
  practiceActionsBasePath?: string | null;
  onCreateSession: () => void;
  fetchSessions?: (
    classId: string,
    params: MonthYearParams,
  ) => Promise<SessionItem[]>;
  fetchSurveys?: (
    classId: string,
    params: MonthYearParams,
  ) => Promise<ClassSurveyRecord[]>;
  sessionTable: (args: {
    sessions: SessionItem[];
    autoOpenSessionId: string | null;
    autoOpenToken: number;
  }) => ReactNode;
  surveyPanel: (args: {
    surveys: ClassSurveyRecord[];
    autoOpenSurveyId: string | null;
    autoOpenToken: number;
    createOpen: boolean;
    onCreateOpenChange: (open: boolean) => void;
  }) => ReactNode;
}) {
  const queryClient = useQueryClient();
  const [localItems, setLocalItems] = useState<ClassTimelineItemDto[] | null>(
    null,
  );
  const [orderDirty, setOrderDirty] = useState(false);
  const [topicAddOpen, setTopicAddOpen] = useState(false);
  const [surveyCreateOpen, setSurveyCreateOpen] = useState(false);
  const [openSession, setOpenSession] = useState<{
    id: string;
    month: string;
    year: string;
    token: number;
  } | null>(null);
  const [openSurvey, setOpenSurvey] = useState<{
    id: string;
    month: string;
    year: string;
    token: number;
  } | null>(null);
  const [openContent, setOpenContent] = useState<{
    id: string;
    token: number;
  } | null>(null);
  const [theoryProgressItem, setTheoryProgressItem] =
    useState<ClassTimelineItemDto | null>(null);
  const [showLessonItems, setShowLessonItems] = useState(
    lessonVisibility === "always",
  );

  const { data: serverItems = [], isLoading } = useQuery({
    queryKey: classTimelineKeys.list(classId),
    queryFn: () => classApi.getClassTimeline(classId),
  });
  const items = localItems ?? serverItems;
  const displayedItems = useMemo(
    () =>
      showLessonItems
        ? items
        : items.filter((item) => item.kind !== "content_item"),
    [items, showLessonItems],
  );

  const loadSessions = fetchSessions ?? sessionApi.getSessionsByClassId;
  const loadSurveys = fetchSurveys ?? classApi.getClassSurveys;

  const { data: sessionsForEdit = [] } = useQuery({
    queryKey: [
      "class-timeline-sessions",
      classId,
      openSession?.year,
      openSession?.month,
    ],
    queryFn: () =>
      loadSessions(classId, {
        month: openSession!.month,
        year: openSession!.year,
      }),
    enabled: Boolean(openSession),
  });

  const surveyQueryMonth = openSurvey ?? {
    month: String(new Date().getMonth() + 1).padStart(2, "0"),
    year: String(new Date().getFullYear()),
    id: "",
  };

  const { data: surveysForEdit = [] } = useQuery({
    queryKey: [
      "class-timeline-surveys",
      classId,
      surveyQueryMonth.year,
      surveyQueryMonth.month,
    ],
    queryFn: () =>
      loadSurveys(classId, {
        month: surveyQueryMonth.month,
        year: surveyQueryMonth.year,
      }),
    enabled: Boolean(openSurvey) || surveyCreateOpen,
  });

  const invalidate = useCallback(async () => {
    await queryClient.invalidateQueries({
      queryKey: classTimelineKeys.list(classId),
    });
    setLocalItems((prev) => (orderDirty ? prev : null));
  }, [classId, orderDirty, queryClient]);

  const reorderMutation = useMutation({
    mutationFn: (orderedIds: string[]) =>
      classApi.reorderClassTimeline(classId, orderedIds),
    onSuccess: async () => {
      toast.success("Đã lưu thứ tự timeline.");
      setOrderDirty(false);
      setLocalItems(null);
      await queryClient.invalidateQueries({
        queryKey: classTimelineKeys.list(classId),
      });
    },
    onError: () => {
      toast.error("Không thể lưu thứ tự.");
      setLocalItems(null);
      setOrderDirty(false);
      void queryClient.invalidateQueries({
        queryKey: classTimelineKeys.list(classId),
      });
    },
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const allowReorder =
    canReorder ?? (canCreateSession || canManageContent || canManageSurveys);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIndex = items.findIndex((row) => row.id === active.id);
      const newIndex = items.findIndex((row) => row.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return;
      const next = arrayMove(items, oldIndex, newIndex);
      setLocalItems(next);
      setOrderDirty(true);
    },
    [items],
  );

  const handleSaveOrder = useCallback(() => {
    if (!orderDirty || !localItems?.length) return;
    reorderMutation.mutate(localItems.map((row) => row.id));
  }, [localItems, orderDirty, reorderMutation]);

  const handleCancelOrder = useCallback(() => {
    setLocalItems(null);
    setOrderDirty(false);
  }, []);

  const handleOpen = (item: ClassTimelineItemDto) => {
    const token = Date.now();
    const fallbackMonth = {
      month: String(new Date().getMonth() + 1).padStart(2, "0"),
      year: String(new Date().getFullYear()),
    };
    if (item.kind === "session" && item.sessionId) {
      const parts = monthYearFromIso(item.occurredAt) ?? fallbackMonth;
      setOpenSession({ id: item.sessionId, ...parts, token });
      return;
    }
    if (item.kind === "class_survey" && item.classSurveyId) {
      const parts = monthYearFromIso(item.occurredAt) ?? fallbackMonth;
      setOpenSurvey({ id: item.classSurveyId, ...parts, token });
      return;
    }
    if (item.kind === "content_item" && item.classContentItemId) {
      setOpenContent({ id: item.classContentItemId, token });
    }
  };

  const empty = items.length === 0;
  const displayedEmpty = displayedItems.length === 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {canCreateSession ? (
          <button
            type="button"
            onClick={onCreateSession}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-text-inverse shadow-sm hover:bg-primary-hover"
          >
            <Plus className="size-3.5" />
            Buổi học
          </button>
        ) : null}
        {canManageContent ? (
          <button
            type="button"
            onClick={() => setTopicAddOpen(true)}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border-default bg-bg-surface px-3 py-1.5 text-xs font-semibold text-text-primary hover:bg-bg-secondary"
          >
            <Plus className="size-3.5" />
            Tiết học
          </button>
        ) : null}
        {canManageSurveys ? (
          <button
            type="button"
            onClick={() => setSurveyCreateOpen(true)}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border-default bg-bg-surface px-3 py-1.5 text-xs font-semibold text-text-primary hover:bg-bg-secondary"
          >
            <Plus className="size-3.5" />
            Khảo sát
          </button>
        ) : null}
        {allowReorder && orderDirty ? (
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleCancelOrder}
              disabled={reorderMutation.isPending}
              className="inline-flex min-h-9 items-center rounded-lg border border-border-default bg-bg-surface px-3 py-1.5 text-xs font-semibold text-text-secondary hover:bg-bg-secondary disabled:opacity-50"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={handleSaveOrder}
              disabled={reorderMutation.isPending}
              className="inline-flex min-h-9 items-center rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-text-inverse hover:bg-primary-hover disabled:opacity-50"
            >
              {reorderMutation.isPending ? "Đang lưu..." : "Lưu thứ tự"}
            </button>
          </div>
        ) : null}
      </div>
      {lessonVisibility === "opt-in" ? (
        <LessonItemsToggle
          checked={showLessonItems}
          onCheckedChange={setShowLessonItems}
        />
      ) : null}

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : empty ? (
        <div className="rounded-xl border border-dashed border-border-default p-8 text-center text-sm text-text-muted">
          Chưa có buổi học, tiết học hay khảo sát trên timeline.
        </div>
      ) : displayedEmpty ? (
        <div className="rounded-xl border border-dashed border-border-default p-8 text-center text-sm text-text-muted">
          Chưa có buổi học hay khảo sát trên timeline. Bật Hiện tiết học để xem
          tiết lý thuyết và tiết thực hành.
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={displayedItems.map((row) => row.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              {displayedItems.map((item) => (
                <SortableTimelineRow
                  key={item.id}
                  item={item}
                  canReorder={allowReorder}
                  practiceActionsBasePath={practiceActionsBasePath}
                  onOpenTheoryProgress={
                    canManageContent ? setTheoryProgressItem : undefined
                  }
                  onOpen={handleOpen}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <ClassContentManager
        classId={classId}
        canManage={canManageContent}
        addOnly
        addOpen={topicAddOpen}
        onAddOpenChange={setTopicAddOpen}
        autoOpenContentItemId={openContent?.id ?? null}
        autoOpenToken={openContent?.token ?? 0}
        onChanged={() => {
          void invalidate();
        }}
      />

      {openSession
        ? sessionTable({
            sessions: sessionsForEdit,
            autoOpenSessionId: openSession.id,
            autoOpenToken: openSession.token,
          })
        : null}

      {surveyPanel({
        surveys: surveysForEdit,
        autoOpenSurveyId: openSurvey?.id ?? null,
        autoOpenToken: openSurvey?.token ?? 0,
        createOpen: surveyCreateOpen,
        onCreateOpenChange: setSurveyCreateOpen,
      })}

      {theoryProgressItem ? (
        <TheoryProgressDialog
          classId={classId}
          item={theoryProgressItem}
          onClose={() => setTheoryProgressItem(null)}
        />
      ) : null}
    </div>
  );
}
