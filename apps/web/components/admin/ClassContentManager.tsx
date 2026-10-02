"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
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
import { toast } from "sonner";
import {
  GripVertical,
  Plus,
  Trash2,
  X,
  Clock,
  PenLine,
  BarChart3,
  RotateCcw,
} from "lucide-react";
import { classTimelineKeys } from "@/lib/query-keys";
import Link from "next/link";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import MathRichTextEditor from "@/components/ui/MathRichTextEditor";
import { CONTENT_LIMITS, isHttpUrl } from "@/dtos/content-limits";
import {
  ResponsiveDialog,
  ResponsiveDialogBody,
} from "@/components/ui/ResponsiveDialog";
import type { ClassContentItemDto } from "@/dtos/class-content.dto";
import type { CourseLessonForClassDto } from "@/dtos/course-content.dto";
import type { ClassQuestionDraft } from "@/dtos/class-topic-question.dto";
import { lessonKindBadgeClass } from "@/lib/course-content-labels";
import * as classApi from "@/lib/apis/class.api";
import * as questionApi from "@/lib/apis/question.api";
import CourseLessonPicker from "./CourseLessonPicker";
import {
  AssignmentScheduleFields,
  defaultAssignmentSchedule,
  fromOpenAtIso,
  toOpenAtIso,
} from "./AssignmentScheduleFields";
import {
  isOpenAtPairComplete,
  isOpenAtPairPartial,
  parseAssignmentDurationMinutes,
} from "@/lib/assignment-schedule.helpers";
import ClassPracticeQuestionComposer from "./ClassPracticeQuestionComposer";
import { formatVnDateTime } from "@/lib/formatters";

function formatOpenAt(iso: string | null): string {
  if (!iso) return "";
  try {
    return formatVnDateTime(new Date(iso));
  } catch {
    return "";
  }
}

function SortableContentRow({
  item,
  classId,
  canManage,
  onHide,
  onRestore,
  onEditSchedule,
}: {
  item: ClassContentItemDto;
  classId: string;
  canManage: boolean;
  onHide: (id: string) => void;
  onRestore: (id: string) => void;
  onEditSchedule: (item: ClassContentItemDto) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <Card className={`transition-colors hover:border-border-focus/50 ${item.hiddenAt ? "opacity-70" : ""}`}>
        <div className="flex items-center gap-3 p-3.5 sm:p-4">
          {canManage && (
            <button
              type="button"
              className="cursor-grab touch-none text-text-muted hover:text-text-primary p-1 -m-1"
              title="Kéo thả để đổi thứ tự"
              aria-label="Kéo thả để đổi thứ tự"
              {...attributes}
              {...listeners}
            >
              <GripVertical className="h-5 w-5" />
            </button>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold text-text-primary text-sm sm:text-base truncate">
                {item.title}
              </h3>
              <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                {item.source === "course" ? "Từ khoá" : "Riêng lớp"}
              </span>
              <span
                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${lessonKindBadgeClass(item.lessonKind)}`}
              >
                {item.kindLabel}
              </span>
              {item.hiddenAt ? (
                <span className="inline-flex items-center rounded-full bg-error/10 px-2 py-0.5 text-[11px] font-medium text-error">
                  Đã ẩn
                </span>
              ) : null}
              {item.moduleTitle && (
                <span className="text-xs text-text-muted">
                  {item.moduleTitle}
                </span>
              )}
            </div>
            {item.lessonKind === "practice" && (
              <p className="mt-1 text-xs text-text-muted">
                {item.openAt
                  ? `Mở ${formatOpenAt(item.openAt)} · ${item.durationMinutes ?? "—"} phút`
                  : "Chưa đặt thời điểm mở"}
              </p>
            )}
          </div>
          {canManage && (
            <div className="flex shrink-0 items-center gap-1.5">
              {item.lessonKind === "practice" && (
                <>
                  <Link
                    href={`/staff/classes/${classId}/practice/${item.id}/stats`}
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border-default px-3 py-1.5 text-xs sm:text-sm font-medium text-text-secondary hover:bg-bg-secondary transition-colors"
                  >
                    <BarChart3 className="size-3.5" />
                    <span className="hidden sm:inline">Thống kê</span>
                  </Link>
                  <Link
                    href={`/staff/classes/${classId}/grading/${item.id}`}
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border-default px-3 py-1.5 text-xs sm:text-sm font-medium text-text-secondary hover:bg-bg-secondary transition-colors"
                  >
                    <PenLine className="size-3.5" />
                    <span className="hidden sm:inline">Chấm tự luận</span>
                  </Link>
                </>
              )}
              {item.lessonKind === "practice" && (
                <button
                  type="button"
                  onClick={() => onEditSchedule(item)}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border-default px-3 py-1.5 text-xs sm:text-sm font-medium text-text-secondary hover:bg-bg-secondary transition-colors"
                >
                  <Clock className="size-3.5" />
                  <span className="hidden xs:inline sm:inline">Lịch giao</span>
                </button>
              )}
              {item.hiddenAt ? (
                <button
                  type="button"
                  onClick={() => onRestore(item.id)}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border-default px-3 py-1.5 text-xs sm:text-sm font-medium text-text-secondary hover:bg-bg-secondary transition-colors"
                >
                  <RotateCcw className="size-3.5" />
                  <span>Khôi phục</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onHide(item.id)}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-destructive/30 px-3 py-1.5 text-xs sm:text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <Trash2 className="size-3.5" />
                  <span>Ẩn</span>
                </button>
              )}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

export default function ClassContentManager({
  classId,
  canManage,
  addOnly = false,
  addOpen: addOpenProp,
  onAddOpenChange,
  onChanged,
  autoOpenContentItemId = null,
  autoOpenToken = 0,
}: {
  classId: string;
  canManage: boolean;
  addOnly?: boolean;
  addOpen?: boolean;
  onAddOpenChange?: (open: boolean) => void;
  onChanged?: () => void;
  autoOpenContentItemId?: string | null;
  autoOpenToken?: number;
}) {
  const queryClient = useQueryClient();
  const [localItems, setLocalItems] = useState<ClassContentItemDto[]>([]);
  const [hasOrderChanged, setHasOrderChanged] = useState(false);
  const [uncontrolledAddOpen, setUncontrolledAddOpen] = useState(false);
  const addOpen = addOpenProp ?? uncontrolledAddOpen;
  const setAddOpen = onAddOpenChange ?? setUncontrolledAddOpen;
  const [scheduleItem, setScheduleItem] = useState<ClassContentItemDto | null>(
    null,
  );
  const [viewItem, setViewItem] = useState<ClassContentItemDto | null>(null);
  const { confirm, dialog } = useConfirmDialog();

  const { data: serverData, isLoading } = useQuery<ClassContentItemDto[]>({
    queryKey: ["class-content", classId],
    queryFn: () => classApi.getClassContent(classId),
  });

  useEffect(() => {
    if (!autoOpenContentItemId || !serverData) return;
    const item = serverData.find((row) => row.id === autoOpenContentItemId);
    if (!item) return;
    if (canManage && item.lessonKind === "practice") {
      setViewItem(null);
      setScheduleItem(item);
      return;
    }
    setScheduleItem(null);
    setViewItem(item);
  }, [autoOpenContentItemId, autoOpenToken, canManage, serverData]);

  const allItems = useMemo(
    () => (localItems.length > 0 ? localItems : serverData ?? []),
    [localItems, serverData],
  );

  const reorderMutation = useMutation({
    mutationFn: (orderedIds: string[]) =>
      classApi.reorderClassContent(classId, orderedIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["class-content", classId] });
      setLocalItems([]);
      setHasOrderChanged(false);
      toast.success("Đã lưu thứ tự");
      onChanged?.();
    },
    onError: () => {
      toast.error("Lỗi sắp xếp lại tiết học");
      queryClient.invalidateQueries({ queryKey: ["class-content", classId] });
      setLocalItems([]);
      setHasOrderChanged(false);
    },
  });

  const hideMutation = useMutation({
    mutationFn: (itemId: string) =>
      classApi.deleteClassContentItem(classId, itemId),
    onSuccess: (newData) => {
      queryClient.setQueryData(["class-content", classId], newData);
      void queryClient.invalidateQueries({ queryKey: classTimelineKeys.list(classId) });
      setLocalItems([]);
      setHasOrderChanged(false);
      toast.success("Đã ẩn khỏi học sinh");
      onChanged?.();
    },
    onError: () => {
      toast.error("Ẩn tiết học thất bại");
    },
  });

  const restoreMutation = useMutation({
    mutationFn: (itemId: string) =>
      classApi.restoreClassContentItem(classId, itemId),
    onSuccess: (newData) => {
      queryClient.setQueryData(["class-content", classId], newData);
      void queryClient.invalidateQueries({ queryKey: classTimelineKeys.list(classId) });
      setLocalItems([]);
      setHasOrderChanged(false);
      toast.success("Đã khôi phục");
      onChanged?.();
    },
    onError: () => {
      toast.error("Khôi phục thất bại");
    },
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = allItems.findIndex((t) => t.id === active.id);
      const newIndex = allItems.findIndex((t) => t.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;

      const reordered = arrayMove(allItems, oldIndex, newIndex);
      setLocalItems(reordered);
      setHasOrderChanged(true);
    },
    [allItems],
  );

  const handleSaveOrder = useCallback(() => {
    if (!hasOrderChanged || localItems.length === 0) return;
    reorderMutation.mutate(localItems.map((t) => t.id));
  }, [hasOrderChanged, localItems, reorderMutation]);

  const handleCancelOrder = useCallback(() => {
    setLocalItems([]);
    setHasOrderChanged(false);
  }, []);

  const handleHide = useCallback(
    async (itemId: string) => {
      const ok = await confirm({
        title: "Ẩn mục này?",
        description:
          "Ẩn mục này khỏi học sinh? Dữ liệu và bài làm vẫn được giữ để tra cứu.",
        confirmLabel: "Ẩn",
        variant: "destructive",
      });
      if (!ok) return;
      hideMutation.mutate(itemId);
    },
    [hideMutation, confirm],
  );

  const handleRestore = useCallback(
    (itemId: string) => {
      restoreMutation.mutate(itemId);
    },
    [restoreMutation],
  );

  if (isLoading && !addOnly) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <>
      {!addOnly && canManage && (
        <div className="flex items-center justify-between mb-4">
          {hasOrderChanged ? (
            <div className="flex gap-2">
              <button
                onClick={handleCancelOrder}
                disabled={reorderMutation.isPending}
                className="cursor-pointer rounded-xl border border-border-default px-4 py-2.5 text-sm font-medium text-text-secondary hover:bg-bg-secondary disabled:opacity-50"
              >
                Hủy
              </button>
              <button
                onClick={handleSaveOrder}
                disabled={reorderMutation.isPending}
                className="cursor-pointer rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-text-inverse transition-colors hover:bg-primary-hover disabled:opacity-50"
              >
                {reorderMutation.isPending ? "Đang lưu..." : "Lưu thứ tự"}
              </button>
            </div>
          ) : (
            <div />
          )}
          <button
            onClick={() => setAddOpen(true)}
            className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-text-inverse shadow-xs transition-colors hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
          >
            <Plus className="size-4" />
            Thêm tiết học
          </button>
        </div>
      )}

      {!addOnly && (
      <div className="space-y-2.5">
        {allItems.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border-default bg-bg-secondary/20 p-8 text-center text-sm text-text-muted">
            Chưa có nội dung nào trong lớp học này.
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={allItems.map((t) => t.id)}
              strategy={verticalListSortingStrategy}
            >
              {allItems.map((item) => (
                <SortableContentRow
                  key={item.id}
                  item={item}
                  classId={classId}
                  canManage={canManage}
                  onHide={handleHide}
                  onRestore={handleRestore}
                  onEditSchedule={setScheduleItem}
                />
              ))}
            </SortableContext>
          </DndContext>
        )}
      </div>
      )}

      {addOpen && (
        <AddContentDialog
          classId={classId}
          onClose={() => setAddOpen(false)}
          onSuccess={() => {
            setAddOpen(false);
            queryClient.invalidateQueries({
              queryKey: ["class-content", classId],
            });
            onChanged?.();
          }}
        />
      )}

      {scheduleItem && (
        <EditScheduleDialog
          classId={classId}
          item={scheduleItem}
          onClose={() => setScheduleItem(null)}
          onSuccess={() => {
            setScheduleItem(null);
            queryClient.invalidateQueries({
              queryKey: ["class-content", classId],
            });
            onChanged?.();
          }}
        />
      )}

      {viewItem && (
        <ViewContentDialog
          classId={classId}
          item={viewItem}
          canManage={canManage}
          onClose={() => setViewItem(null)}
          onEditSchedule={() => {
            setViewItem(null);
            setScheduleItem(viewItem);
          }}
        />
      )}
      {dialog}
    </>
  );
}

function AddContentDialog({
  classId,
  onClose,
  onSuccess,
}: {
  classId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const queryClient = useQueryClient();
  const formFieldId = useId();
  const [modeTouched, setModeTouched] = useState(false);
  const [userMode, setUserMode] = useState<"new" | "existing">("existing");
  const [title, setTitle] = useState("");
  const [lessonId, setLessonId] = useState("");
  const [kind, setKind] = useState<"theory" | "practice">("theory");
  const [existingKind, setExistingKind] = useState<"theory" | "practice">(
    "theory",
  );
  const [step, setStep] = useState<"pick" | "schedule">("pick");
  const defaults = defaultAssignmentSchedule();
  const [openDate, setOpenDate] = useState("");
  const [openTime, setOpenTime] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(
    defaults.durationMinutes,
  );
  const [drafts, setDrafts] = useState<ClassQuestionDraft[]>([]);
  const [videoUrl, setVideoUrl] = useState("");
  const [theoryContent, setTheoryContent] = useState("");

  const { data: courseLessons } = useQuery<CourseLessonForClassDto[]>({
    queryKey: ["course-lessons-for-class", classId],
    queryFn: () => classApi.getCourseLessonsForClass(classId),
  });

  const hasSelectableCourseLessons =
    courseLessons?.some((t) => !t.alreadyAdded) ?? false;
  const derivedMode: "new" | "existing" =
    courseLessons === undefined
      ? "existing"
      : hasSelectableCourseLessons
        ? "existing"
        : "new";
  const mode = modeTouched ? userMode : derivedMode;

  const selectedIsPractice =
    (mode === "new" && kind === "practice") ||
    (mode === "existing" && existingKind === "practice");

  const { data: cls } = useQuery({
    queryKey: ["class", classId],
    queryFn: () => classApi.getClassById(classId),
    enabled: mode === "new",
  });
  const courseId = cls?.courseId ?? "";

  const createMutation = useMutation({
    mutationFn: async () => {
      const duration = parseAssignmentDurationMinutes(durationMinutes);
      if (selectedIsPractice && duration == null) {
        throw new Error("invalid-duration");
      }
      const practiceSchedule =
        selectedIsPractice && duration != null
          ? {
              ...(isOpenAtPairComplete(openDate, openTime)
                ? { openAt: toOpenAtIso(openDate, openTime) }
                : {}),
              durationMinutes: duration,
            }
          : {};
      const trimmedVideoUrl = videoUrl.trim();
      const trimmedTheoryContent = theoryContent.trim();
      if (mode === "new" && kind === "theory" && trimmedVideoUrl) {
        if (trimmedVideoUrl.length > CONTENT_LIMITS.url) {
          throw new Error("video-url-too-long");
        }
        if (!isHttpUrl(trimmedVideoUrl)) {
          throw new Error("video-url-invalid");
        }
      }
      const created = await classApi.createClassContent(classId, {
        ...(mode === "existing" ? { lessonId: lessonId.trim() } : {}),
        ...(mode === "new" ? { title: title.trim(), kind } : {}),
        ...practiceSchedule,
      });
      if (
        mode === "new" &&
        kind === "theory" &&
        (trimmedVideoUrl || trimmedTheoryContent)
      ) {
        await classApi.updateClassLesson(classId, created.lessonId, {
          videoUrl: trimmedVideoUrl || null,
          content: trimmedTheoryContent || null,
        });
      }
      if (mode === "new" && kind === "practice" && drafts.length > 0) {
        for (const draft of drafts) {
          let questionId = draft.questionId;
          if (!questionId && draft.createPayload) {
            const q = await questionApi.createQuestion(draft.createPayload);
            questionId = q.id;
          }
          if (!questionId) continue;
          await classApi.addPracticeLessonQuestion(created.lessonId, {
            questionId,
          });
        }
      }
      return created;
    },
    onSuccess: () => {
      toast.success("Đã thêm tiết học");
      queryClient.invalidateQueries({
        queryKey: ["course-lessons-for-class", classId],
      });
      onSuccess();
    },
    onError: (err: {
      message?: string;
      response?: { data?: { message?: string } };
    }) => {
      if (err?.message === "video-url-invalid") {
        toast.error("Link video phải bắt đầu bằng http:// hoặc https://");
        return;
      }
      if (err?.message === "video-url-too-long") {
        toast.error(`Link video tối đa ${CONTENT_LIMITS.url} ký tự.`);
        return;
      }
      toast.error(err?.response?.data?.message || "Lỗi thêm tiết học");
    },
  });

  const canPick =
    (mode === "existing" && lessonId.trim()) ||
    (mode === "new" && title.trim());
  const parsedDuration = parseAssignmentDurationMinutes(durationMinutes);
  const durationError =
    parsedDuration == null
      ? "Thời lượng phải từ 1 đến 720 phút."
      : null;
  const openAtPartial = isOpenAtPairPartial(openDate, openTime);
  const canSubmitSchedule =
    parsedDuration != null && !openAtPartial;

  const handlePrimary = () => {
    if (selectedIsPractice && step === "pick") {
      setStep("schedule");
      return;
    }
    createMutation.mutate();
  };

  return (
    <ResponsiveDialog onBackdropClick={onClose} size="4xl">
      <ResponsiveDialogBody className="flex flex-col p-4 sm:p-6 max-h-[92vh] overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-border-default pb-4 shrink-0">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-text-primary">
              {step === "schedule" ? "Đặt lần giao" : "Thêm tiết học"}
            </h2>
            <p className="text-xs text-text-muted mt-0.5">
              {step === "schedule"
                ? "Thời điểm mở bài và thời lượng thuộc lần giao của lớp này, không đụng đề."
                : "Chọn tiết học từ khoá học hoặc tạo mới cho lớp."}
            </p>
          </div>
          <button
            onClick={onClose}
            className="cursor-pointer rounded-lg p-1.5 text-text-muted hover:bg-bg-secondary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
            aria-label="Đóng"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-4 pr-1 [scrollbar-width:thin] space-y-4">
          {step === "schedule" ? (
            <>
            <AssignmentScheduleFields
              openDate={openDate}
              openTime={openTime}
              durationMinutes={durationMinutes}
              openAtOptional
              durationError={durationError}
              onOpenDateChange={setOpenDate}
              onOpenTimeChange={setOpenTime}
              onDurationChange={setDurationMinutes}
            />
            {openAtPartial ? (
              <p className="text-xs text-error">
                Nhập cả ngày và giờ, hoặc để trống cả hai.
              </p>
            ) : null}
            </>
          ) : (
            <>
          {/* Mode toggle */}
          <div className="inline-flex max-w-full flex-wrap items-center gap-1 rounded-xl border border-border-default bg-bg-surface p-1 shadow-2xs">
            <button
              type="button"
              onClick={() => {
                setModeTouched(true);
                setUserMode("new");
                setStep("pick");
              }}
              className={`inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-semibold transition-all ${
                mode === "new"
                  ? "bg-primary text-text-inverse shadow-xs"
                  : "text-text-muted hover:text-text-primary"
              }`}
            >
              Tạo mới cho lớp
            </button>
            <button
              type="button"
              onClick={() => {
                setModeTouched(true);
                setUserMode("existing");
                setStep("pick");
              }}
              className={`inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-semibold transition-all ${
                mode === "existing"
                  ? "bg-primary text-text-inverse shadow-xs"
                  : "text-text-muted hover:text-text-primary"
              }`}
            >
              Thêm từ khoá
            </button>
          </div>

          {mode === "new" ? (
            <>
              <div>
                <label
                  htmlFor={`${formFieldId}-title`}
                  className="text-xs font-semibold uppercase tracking-wider text-text-muted"
                >
                  Tiêu đề <span className="text-error">*</span>
                </label>
                <input
                  id={`${formFieldId}-title`}
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-border-default bg-bg-surface px-4 py-2.5 text-sm text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus font-medium"
                  placeholder="Ví dụ: Tiết bổ trợ Phương trình bậc 2..."
                />
              </div>
              <div>
                <span
                  id={`${formFieldId}-kind-label`}
                  className="block text-xs font-semibold uppercase tracking-wider text-text-muted"
                >
                  Loại tiết học
                </span>
                <div
                  role="group"
                  aria-labelledby={`${formFieldId}-kind-label`}
                  className="mt-1.5 inline-flex items-center gap-1 rounded-xl border border-border-default bg-bg-surface p-1 shadow-2xs"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setKind("theory");
                      setDrafts([]);
                    }}
                    className={`inline-flex cursor-pointer items-center rounded-lg px-3 py-1 text-xs font-semibold transition-all ${
                      kind === "theory"
                        ? "bg-primary text-text-inverse shadow-xs"
                        : "text-text-muted hover:text-text-primary"
                    }`}
                  >
                    Tiết lý thuyết
                  </button>
                  <button
                    type="button"
                    onClick={() => setKind("practice")}
                    className={`inline-flex cursor-pointer items-center rounded-lg px-3 py-1 text-xs font-semibold transition-all ${
                      kind === "practice"
                        ? "bg-primary text-text-inverse shadow-xs"
                        : "text-text-muted hover:text-text-primary"
                    }`}
                  >
                    Tiết thực hành
                  </button>
                </div>
              </div>
              {kind === "theory" ? (
                <>
                  <div>
                    <label
                      htmlFor={`${formFieldId}-video-url`}
                      className="text-xs font-semibold uppercase tracking-wider text-text-muted"
                    >
                      Link video (tuỳ chọn)
                    </label>
                    <input
                      id={`${formFieldId}-video-url`}
                      type="text"
                      value={videoUrl}
                      onChange={(e) => setVideoUrl(e.target.value)}
                      placeholder="https://youtube.com/watch?v=..."
                      className="mt-1.5 w-full rounded-xl border border-border-default bg-bg-surface px-4 py-2.5 text-sm text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                    />
                  </div>
                  <div>
                    <span className="block text-xs font-semibold uppercase tracking-wider text-text-muted">
                      Nội dung lý thuyết (hỗ trợ LaTeX: $x^2$)
                    </span>
                    <div className="mt-1.5">
                      <MathRichTextEditor
                        value={theoryContent}
                        onChange={setTheoryContent}
                        ariaLabel="Nội dung lý thuyết"
                        placeholder="Nhập nội dung tiết lý thuyết..."
                        minHeight="min-h-[120px]"
                      />
                    </div>
                  </div>
                </>
              ) : null}
              {kind === "practice" && courseId ? (
                <ClassPracticeQuestionComposer
                  courseId={courseId}
                  drafts={drafts}
                  onChange={setDrafts}
                />
              ) : null}
            </>
          ) : (
            <CourseLessonPicker
              classId={classId}
              selectedLessonId={lessonId}
              onSelect={(id, lessonKind) => {
                setLessonId(id);
                setExistingKind(lessonKind);
              }}
            />
          )}
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 pt-4 border-t border-border-default shrink-0">
          {step === "schedule" && (
            <button
              type="button"
              onClick={() => setStep("pick")}
              className="mr-auto cursor-pointer rounded-xl border border-border-default px-4 py-2.5 text-sm font-medium text-text-secondary hover:bg-bg-secondary transition-colors"
            >
              Quay lại
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-xl border border-border-default px-4 py-2.5 text-sm font-medium text-text-secondary hover:bg-bg-secondary transition-colors"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={handlePrimary}
            disabled={
              (step === "pick" && !canPick) ||
              (step === "schedule" && !canSubmitSchedule) ||
              createMutation.isPending
            }
            className="cursor-pointer rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-text-inverse transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60 shadow-xs"
          >
            {createMutation.isPending
              ? "Đang thêm..."
              : selectedIsPractice && step === "pick"
                ? "Tiếp theo"
                : selectedIsPractice
                  ? "Giao đề"
                  : "Thêm tiết học"}
          </button>
        </div>
      </ResponsiveDialogBody>
    </ResponsiveDialog>
  );
}

function EditScheduleDialog({
  classId,
  item,
  onClose,
  onSuccess,
}: {
  classId: string;
  item: ClassContentItemDto;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const fallback = defaultAssignmentSchedule();
  const parsed = item.openAt
    ? fromOpenAtIso(item.openAt)
    : { date: fallback.openDate, time: fallback.openTime };
  const [openDate, setOpenDate] = useState(parsed.date);
  const [openTime, setOpenTime] = useState(parsed.time);
  const [durationMinutes, setDurationMinutes] = useState(
    String(item.durationMinutes ?? 60),
  );
  const parsedDuration = parseAssignmentDurationMinutes(durationMinutes);
  const durationError =
    parsedDuration == null
      ? "Thời lượng phải từ 1 đến 720 phút."
      : null;
  const canSave =
    Boolean(openDate && openTime && parsedDuration != null) &&
    !isOpenAtPairPartial(openDate, openTime);

  const mutation = useMutation({
    mutationFn: () => {
      if (parsedDuration == null) {
        return Promise.reject(new Error("invalid-duration"));
      }
      return classApi.updateClassContentSchedule(classId, item.id, {
        openAt: toOpenAtIso(openDate, openTime),
        durationMinutes: parsedDuration,
      });
    },
    onSuccess: () => {
      toast.success("Đã cập nhật lần giao");
      onSuccess();
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      toast.error(err?.response?.data?.message || "Lỗi cập nhật lần giao");
    },
  });

  return (
    <ResponsiveDialog onBackdropClick={onClose} size="lg">
      <ResponsiveDialogBody className="flex flex-col p-4 sm:p-6">
        <div className="flex items-center justify-between gap-3 border-b border-border-default pb-4">
          <div>
            <h2 className="text-lg font-bold text-text-primary">Đặt lần giao</h2>
            <p className="text-xs text-text-muted mt-0.5 truncate">{item.title}</p>
          </div>
          <button
            onClick={onClose}
            className="cursor-pointer rounded-lg p-1.5 text-text-muted hover:bg-bg-secondary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
            aria-label="Đóng"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="py-4">
          <AssignmentScheduleFields
            openDate={openDate}
            openTime={openTime}
            durationMinutes={durationMinutes}
            durationError={durationError}
            onOpenDateChange={setOpenDate}
            onOpenTimeChange={setOpenTime}
            onDurationChange={setDurationMinutes}
          />
        </div>
        <div className="flex items-center justify-end gap-2 pt-4 border-t border-border-default">
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-xl border border-border-default px-4 py-2.5 text-sm font-medium text-text-secondary hover:bg-bg-secondary"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={!canSave || mutation.isPending}
            className="cursor-pointer rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-text-inverse hover:bg-primary-hover disabled:opacity-60"
          >
            {mutation.isPending ? "Đang lưu..." : "Lưu lần giao"}
          </button>
        </div>
      </ResponsiveDialogBody>
    </ResponsiveDialog>
  );
}

function TheoryLessonInlineEditor({
  classId,
  lessonId,
  lessonTitle,
  canManage,
}: {
  classId: string;
  lessonId: string;
  lessonTitle: string;
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const { data: lesson, isLoading } = useQuery({
    queryKey: ["class-lesson", classId, lessonId],
    queryFn: () => classApi.getClassLesson(classId, lessonId),
  });
  const theoryFieldId = useId();
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [content, setContent] = useState<string | null>(null);

  const videoUrlValue = videoUrl ?? lesson?.videoUrl ?? "";
  const contentValue = content ?? lesson?.content ?? "";

  const saveMutation = useMutation({
    mutationFn: async () => {
      const trimmedUrl = videoUrlValue.trim();
      if (trimmedUrl) {
        if (trimmedUrl.length > CONTENT_LIMITS.url) {
          throw new Error("video-url-too-long");
        }
        if (!isHttpUrl(trimmedUrl)) {
          throw new Error("video-url-invalid");
        }
      }
      await classApi.updateClassLesson(classId, lessonId, {
        title: lesson?.title || lessonTitle,
        videoUrl: trimmedUrl || null,
        content: contentValue.trim() || null,
      });
    },
    onSuccess: () => {
      toast.success("Đã lưu nội dung lý thuyết");
      void queryClient.invalidateQueries({
        queryKey: ["class-lesson", classId, lessonId],
      });
      setVideoUrl(null);
      setContent(null);
    },
    onError: (err: {
      message?: string;
      response?: { data?: { message?: string } };
    }) => {
      if (err?.message === "video-url-invalid") {
        toast.error("Link video phải bắt đầu bằng http:// hoặc https://");
        return;
      }
      if (err?.message === "video-url-too-long") {
        toast.error(`Link video tối đa ${CONTENT_LIMITS.url} ký tự.`);
        return;
      }
      toast.error(err?.response?.data?.message || "Lỗi lưu nội dung");
    },
  });

  if (isLoading) {
    return <Skeleton className="h-32 w-full rounded-xl" />;
  }

  if (!canManage) {
    return null;
  }

  return (
    <div className="space-y-3">
      <div>
        <label
          htmlFor={`${theoryFieldId}-video-url`}
          className="text-xs font-semibold uppercase tracking-wider text-text-muted"
        >
          Link video (tuỳ chọn)
        </label>
        <input
          id={`${theoryFieldId}-video-url`}
          type="text"
          value={videoUrlValue}
          onChange={(e) => setVideoUrl(e.target.value)}
          placeholder="https://youtube.com/watch?v=..."
          className="mt-1.5 w-full rounded-xl border border-border-default bg-bg-surface px-4 py-2.5 text-sm text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
        />
      </div>
      <div>
        <span className="block text-xs font-semibold uppercase tracking-wider text-text-muted">
          Nội dung lý thuyết (hỗ trợ LaTeX: $x^2$)
        </span>
        <div className="mt-1.5">
          <MathRichTextEditor
            value={contentValue}
            onChange={setContent}
            ariaLabel="Nội dung lý thuyết"
            placeholder="Nhập nội dung tiết lý thuyết..."
            minHeight="min-h-[120px]"
          />
        </div>
      </div>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          className="cursor-pointer rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-text-inverse hover:bg-primary-hover disabled:opacity-60"
        >
          {saveMutation.isPending ? "Đang lưu..." : "Lưu nội dung"}
        </button>
      </div>
    </div>
  );
}

function ViewContentDialog({
  classId,
  item,
  canManage,
  onClose,
  onEditSchedule,
}: {
  classId: string;
  item: ClassContentItemDto;
  canManage: boolean;
  onClose: () => void;
  onEditSchedule: () => void;
}) {
  return (
    <ResponsiveDialog onBackdropClick={onClose} size="lg">
      <ResponsiveDialogBody className="flex flex-col p-4 sm:p-6">
        <div className="flex items-start justify-between gap-3 border-b border-border-default pb-4">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">
              {item.kindLabel}
            </p>
            <h2 className="mt-1 text-lg font-bold text-text-primary">{item.title}</h2>
            <p className="mt-1 text-xs text-text-muted">
              {item.source === "course" ? "Từ khoá" : "Riêng lớp"}
              {item.moduleTitle ? ` · ${item.moduleTitle}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-lg p-1.5 text-text-muted hover:bg-bg-secondary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
            aria-label="Đóng"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="space-y-2 py-4 text-sm text-text-secondary">
          {item.lessonKind === "practice" ? (
            <p>
              {item.openAt
                ? `Mở ${formatOpenAt(item.openAt)} · ${item.durationMinutes ?? "—"} phút`
                : "Chưa đặt thời điểm mở"}
            </p>
          ) : (
            <TheoryLessonInlineEditor
              classId={classId}
              lessonId={item.lessonId}
              lessonTitle={item.title}
              canManage={canManage}
            />
          )}
        </div>
        {canManage && item.lessonKind === "practice" ? (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border-default pt-4">
            <Link
              href={`/staff/classes/${classId}/practice/${item.id}/stats`}
              className="inline-flex min-h-9 items-center rounded-lg border border-border-default px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-bg-secondary"
            >
              Thống kê
            </Link>
            <Link
              href={`/staff/classes/${classId}/grading/${item.id}`}
              className="inline-flex min-h-9 items-center rounded-lg border border-border-default px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-bg-secondary"
            >
              Chấm tự luận
            </Link>
            <button
              type="button"
              onClick={onEditSchedule}
              className="inline-flex min-h-9 items-center rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-text-inverse hover:bg-primary-hover"
            >
              Lịch giao
            </button>
          </div>
        ) : null}
      </ResponsiveDialogBody>
    </ResponsiveDialog>
  );
}
