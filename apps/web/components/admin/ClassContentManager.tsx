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
import { classKeys, classTimelineKeys } from "@/lib/query-keys";
import Link from "next/link";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import MathRichTextEditorWithPreview from "@/components/ui/MathRichTextEditorWithPreview";
import { CONTENT_LIMITS, isHttpUrl } from "@/dtos/content-limits";
import {
  ResponsiveDialog,
  ResponsiveDialogBody,
} from "@/components/ui/ResponsiveDialog";
import type {
  AssignmentCloseAtDraft,
  ClassContentItemDto,
} from "@/dtos/class-content.dto";
import type { CourseLessonForClassDto } from "@/dtos/course-content.dto";
import { lessonKindBadgeClass } from "@/lib/course-content-labels";
import * as classApi from "@/lib/apis/class.api";
import CourseLessonPicker from "./CourseLessonPicker";
import {
  AssignmentScheduleFields,
  defaultAssignmentSchedule,
  fromOpenAtIso,
  toOpenAtIso,
} from "./AssignmentScheduleFields";
import { AssignmentCloseAtField } from "./AssignmentCloseAtField";
import { ShuffleQuestionsField } from "./ShuffleQuestionsField";
import {
  closeAtDraftFromIso,
  closeAtPayload,
  isOpenAtPairComplete,
  isOpenAtPairPartial,
} from "@/lib/assignment-schedule.helpers";
import { formatVnDateTime } from "@/lib/formatters";
import { practiceResultsHref } from "@/lib/practice-results-routes";
import ProtectedVideoSyncStatus from "@/components/admin/ProtectedVideoSyncStatus";

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
  practiceBase,
  canManage,
  onHide,
  onRestore,
  onEditSchedule,
}: {
  item: ClassContentItemDto;
  /** Trang lớp của shell đang đứng — gốc link Kết quả / Chấm bài. */
  practiceBase: string;
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
      <Card
        className={`transition-colors hover:border-border-focus/50 ${item.hiddenAt ? "opacity-70" : ""}`}
      >
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
                  ? `Mở ${formatOpenAt(item.openAt)} · ${item.durationMinutes ?? "—"} phút${item.closeAt ? ` · hạn ${formatOpenAt(item.closeAt)}` : ""}`
                  : "Chưa đặt thời điểm mở"}
              </p>
            )}
          </div>
          {canManage && (
            <div className="flex shrink-0 items-center gap-1.5">
              {item.lessonKind === "practice" && (
                <>
                  <Link
                    href={practiceResultsHref(practiceBase, item.id)}
                    aria-label="Kết quả"
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border-default px-3 py-1.5 text-xs sm:text-sm font-medium text-text-secondary hover:bg-bg-secondary transition-colors"
                  >
                    <BarChart3 className="size-3.5" />
                    <span className="hidden sm:inline">Kết quả</span>
                  </Link>
                  <Link
                    href={practiceResultsHref(practiceBase, item.id, "cho-cham")}
                    aria-label="Chấm bài"
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border-default px-3 py-1.5 text-xs sm:text-sm font-medium text-text-secondary hover:bg-bg-secondary transition-colors"
                  >
                    <PenLine className="size-3.5" />
                    <span className="hidden sm:inline">Chấm bài</span>
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
  practiceActionsBasePath = null,
}: {
  classId: string;
  canManage: boolean;
  /** Trang lớp của shell (`/admin/classes/:id`); mặc định trang lớp staff. */
  practiceActionsBasePath?: string | null;
  addOnly?: boolean;
  addOpen?: boolean;
  onAddOpenChange?: (open: boolean) => void;
  onChanged?: () => void;
  autoOpenContentItemId?: string | null;
  autoOpenToken?: number;
}) {
  const queryClient = useQueryClient();
  const practiceBase = practiceActionsBasePath ?? `/staff/classes/${classId}`;
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
    () => (localItems.length > 0 ? localItems : (serverData ?? [])),
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
      void queryClient.invalidateQueries({
        queryKey: classTimelineKeys.list(classId),
      });
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
      void queryClient.invalidateQueries({
        queryKey: classTimelineKeys.list(classId),
      });
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
            Thêm tiết
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
                    practiceBase={practiceBase}
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
          practiceBase={practiceBase}
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

/**
 * Thêm lẻ một tiết của khoá vào lớp (ADR 2026-10-18). Tiết lý thuyết thêm thẳng;
 * tiết thực hành qua bước **Đặt lần giao** (mở bài, hạn, trộn câu).
 */
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
  const [lesson, setLesson] = useState<CourseLessonForClassDto | null>(null);
  const isPractice = lesson?.kind === "practice";
  const [step, setStep] = useState<"pick" | "schedule">("pick");
  const [openDate, setOpenDate] = useState("");
  const [openTime, setOpenTime] = useState("");
  const [closeAt, setCloseAt] = useState<AssignmentCloseAtDraft>({
    mode: "class",
    date: "",
    time: "",
  });
  const [shuffleQuestions, setShuffleQuestions] = useState(true);

  const openAtPartial = isOpenAtPairPartial(openDate, openTime);
  const closeAtValue = closeAtPayload(closeAt);
  const canSubmitSchedule = !openAtPartial && closeAtValue !== false;

  const createMutation = useMutation({
    mutationFn: () =>
      classApi.createClassContent(
        classId,
        isPractice ? practicePayload() : { lessonId: lesson!.id },
      ),
    onSuccess: () => {
      toast.success(
        isPractice ? "Đã giao tiết thực hành" : "Đã thêm tiết lý thuyết",
      );
      queryClient.invalidateQueries({
        queryKey: classKeys.courseLessons(classId),
      });
      // Tiết đầu của chuyên đề mới tạo nhóm mới cho lớp.
      queryClient.invalidateQueries({ queryKey: classKeys.modules(classId) });
      onSuccess();
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      toast.error(err?.response?.data?.message || "Lỗi thêm tiết vào lớp");
    },
  });

  function practicePayload() {
    return {
      lessonId: lesson!.id,
      ...(isOpenAtPairComplete(openDate, openTime)
        ? { openAt: toOpenAtIso(openDate, openTime) }
        : {}),
      ...(closeAtValue === false || closeAtValue === undefined
        ? {}
        : { closeAt: closeAtValue }),
      shuffleQuestions,
    };
  }

  const handlePrimary = () => {
    if (step === "pick" && isPractice) {
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
              {step === "schedule" ? "Đặt lần giao" : "Thêm tiết vào lớp"}
            </h2>
            <p className="text-xs text-text-muted mt-0.5">
              {step === "schedule"
                ? "Thời điểm mở bài và hạn làm bài thuộc lần giao của lớp này, không đụng đề."
                : "Chọn chuyên đề của khoá, rồi chọn tiết lý thuyết hoặc thực hành. Chuyên đề mới vào lớp đứng đầu danh sách."}
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
                openAtOptional
                onOpenDateChange={setOpenDate}
                onOpenTimeChange={setOpenTime}
              />
              {openAtPartial ? (
                <p className="text-xs text-error">
                  Nhập cả ngày và giờ, hoặc để trống cả hai.
                </p>
              ) : null}
              <AssignmentCloseAtField
                value={closeAt}
                onChange={setCloseAt}
                allowClassDefault
              />
              <ShuffleQuestionsField
                checked={shuffleQuestions}
                onCheckedChange={setShuffleQuestions}
              />
            </>
          ) : (
            <CourseLessonPicker
              classId={classId}
              selectedLessonId={lesson?.id ?? ""}
              onSelect={setLesson}
            />
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
              (step === "pick" && !lesson) ||
              (step === "schedule" && !canSubmitSchedule) ||
              createMutation.isPending
            }
            className="cursor-pointer rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-text-inverse transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60 shadow-xs"
          >
            {createMutation.isPending
              ? "Đang thêm..."
              : step === "schedule"
                ? "Giao đề"
                : isPractice
                  ? "Tiếp theo"
                  : "Thêm tiết"}
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
  const [closeAt, setCloseAt] = useState(() =>
    closeAtDraftFromIso(item.closeAt),
  );
  const [shuffleQuestions, setShuffleQuestions] = useState(
    item.shuffleQuestions,
  );
  const closeAtValue = closeAtPayload(closeAt);
  const canSave =
    Boolean(openDate && openTime) &&
    !isOpenAtPairPartial(openDate, openTime) &&
    closeAtValue !== false;

  const mutation = useMutation({
    mutationFn: () =>
      classApi.updateClassContentSchedule(classId, item.id, {
        openAt: toOpenAtIso(openDate, openTime),
        closeAt: closeAtValue === false ? undefined : closeAtValue,
        shuffleQuestions,
      }),
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
            <h2 className="text-lg font-bold text-text-primary">
              Đặt lần giao
            </h2>
            <p className="text-xs text-text-muted mt-0.5 truncate">
              {item.title}
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
        <div className="space-y-4 py-4">
          <AssignmentScheduleFields
            openDate={openDate}
            openTime={openTime}
            durationMinutes={item.durationMinutes}
            onOpenDateChange={setOpenDate}
            onOpenTimeChange={setOpenTime}
          />
          <AssignmentCloseAtField value={closeAt} onChange={setCloseAt} />
          <ShuffleQuestionsField
            checked={shuffleQuestions}
            onCheckedChange={setShuffleQuestions}
            hint="Đổi chỉ áp cho lượt bắt đầu sau khi lưu."
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
        <ProtectedVideoSyncStatus
          savedUrl={lesson?.videoUrl}
          currentUrl={videoUrlValue}
        />
      </div>
      <div>
        <span className="block text-xs font-semibold uppercase tracking-wider text-text-muted">
          Nội dung lý thuyết (hỗ trợ LaTeX: $x^2$)
        </span>
        <div className="mt-1.5">
          <MathRichTextEditorWithPreview
            value={contentValue}
            onChange={setContent}
            ariaLabel="Nội dung lý thuyết"
            placeholder="Nhập nội dung tiết lý thuyết..."
            minHeight="min-h-[120px]"
            markdown
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
  practiceBase,
  item,
  canManage,
  onClose,
  onEditSchedule,
}: {
  classId: string;
  practiceBase: string;
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
            <h2 className="mt-1 text-lg font-bold text-text-primary">
              {item.title}
            </h2>
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
                ? `Mở ${formatOpenAt(item.openAt)} · ${item.durationMinutes ?? "—"} phút${item.closeAt ? ` · hạn ${formatOpenAt(item.closeAt)}` : ""}`
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
              href={practiceResultsHref(practiceBase, item.id)}
              className="inline-flex min-h-9 items-center rounded-lg border border-border-default px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-bg-secondary"
            >
              Kết quả
            </Link>
            <Link
              href={practiceResultsHref(practiceBase, item.id, "cho-cham")}
              className="inline-flex min-h-9 items-center rounded-lg border border-border-default px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-bg-secondary"
            >
              Chấm bài
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
