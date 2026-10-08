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
import {
  BarChart3,
  ChevronDown,
  Eye,
  GripVertical,
  Layers,
  PenLine,
} from "lucide-react";
import { toast } from "sonner";
import * as classApi from "@/lib/apis/class.api";
import { classKeys } from "@/lib/query-keys";
import { applyModuleOrder } from "@/lib/class-module-order";
import { getMutationErrorMessage } from "@/lib/mutation-feedback";
import type {
  ClassContentItemDto,
  ClassContentModuleGroupDto,
  TheoryProgressTarget,
} from "@/dtos/class-content.dto";
import { formatVnDateTime } from "@/lib/formatters";
import { TimelineKindBadge } from "@/components/class-timeline/TimelineKindBadge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

const ACTION_CLASS =
  "inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-border-default px-2.5 py-1 text-xs font-medium text-text-secondary transition-colors hover:bg-bg-secondary";

interface ClassModuleGroupsProps {
  classId: string;
  /** Kéo-thả đổi thứ tự nhóm (lưu theo lớp, học sinh thấy cùng thứ tự). */
  canReorder?: boolean;
  /** Có thì hiện nút Thống kê / Chấm bài cho tiết thực hành. */
  practiceActionsBasePath?: string | null;
  /** Mở dialog chi tiết lần giao (`ClassContentManager`). */
  onOpenItem: (contentItemId: string) => void;
  /** Có thì hiện nút Tiến độ cho tiết lý thuyết. */
  onOpenTheoryProgress?: (target: TheoryProgressTarget) => void;
}

type ItemActionProps = Pick<
  ClassModuleGroupsProps,
  "practiceActionsBasePath" | "onOpenItem" | "onOpenTheoryProgress"
>;

/**
 * Nội dung lớp gom theo chuyên đề, theo thứ tự của lớp: mỗi nhóm có tiết lý
 * thuyết (thứ tự trong chuyên đề) rồi tiết thực hành đã giao. Kéo nhóm chỉ đổi
 * thứ tự tại chỗ cho tới khi bấm **Lưu thứ tự**.
 */
export default function ClassModuleGroups({
  classId,
  canReorder = false,
  ...itemActions
}: ClassModuleGroupsProps) {
  const queryClient = useQueryClient();
  const { data: groups = [], isLoading, isError } = useQuery({
    queryKey: classKeys.contentGroups(classId),
    queryFn: () => classApi.getClassContentGroups(classId),
  });
  // `null` = theo thứ tự server; có giá trị = đang kéo, chưa lưu.
  const [localOrder, setLocalOrder] = useState<string[] | null>(null);
  const displayedGroups = useMemo(
    () => applyModuleOrder(groups, localOrder),
    [groups, localOrder],
  );
  const sortableIds = useMemo(
    () =>
      displayedGroups.flatMap((group) =>
        group.moduleId ? [group.moduleId] : [],
      ),
    [displayedGroups],
  );

  const reorderMutation = useMutation({
    mutationFn: (moduleIds: string[]) =>
      classApi.reorderClassModules(classId, moduleIds),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: classKeys.contentGroups(classId),
        }),
        queryClient.invalidateQueries({ queryKey: classKeys.modules(classId) }),
      ]);
      // Bỏ thứ tự tạm sau khi server trả thứ tự mới, tránh nháy về thứ tự cũ.
      setLocalOrder(null);
      toast.success("Đã lưu thứ tự chuyên đề.");
    },
    onError: (error) => {
      setLocalOrder(null);
      toast.error(
        getMutationErrorMessage(error, "Không lưu được thứ tự chuyên đề."),
      );
      void queryClient.invalidateQueries({
        queryKey: classKeys.contentGroups(classId),
      });
    },
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = useCallback(
    ({ active, over }: DragEndEvent) => {
      if (!over || active.id === over.id) return;
      const oldIndex = sortableIds.indexOf(String(active.id));
      const newIndex = sortableIds.indexOf(String(over.id));
      if (oldIndex < 0 || newIndex < 0) return;
      setLocalOrder(arrayMove(sortableIds, oldIndex, newIndex));
    },
    [sortableIds],
  );

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2].map((i) => (
          <Skeleton key={i} className="h-14 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <p className="rounded-xl border border-error/30 bg-error/10 px-4 py-3 text-sm text-error">
        Không tải được nội dung theo chuyên đề.
      </p>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border-default p-6 text-center text-sm text-text-muted">
        Lớp chưa thêm chuyên đề nào.
        {canReorder ? (
          <>
            {" "}
            Bấm <b>Chuyên đề</b> để thêm.
          </>
        ) : null}
      </div>
    );
  }

  const allowDrag = canReorder && !reorderMutation.isPending;

  return (
    <div className="space-y-2">
      {canReorder && localOrder ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2">
          <p className="min-w-0 flex-1 text-xs font-medium text-text-secondary">
            Đã đổi thứ tự chuyên đề, chưa lưu.
          </p>
          <button
            type="button"
            onClick={() => setLocalOrder(null)}
            disabled={reorderMutation.isPending}
            className="inline-flex min-h-9 items-center rounded-lg border border-border-default bg-bg-surface px-3 py-1.5 text-xs font-semibold text-text-secondary hover:bg-bg-secondary disabled:opacity-50"
          >
            Huỷ
          </button>
          <button
            type="button"
            onClick={() => reorderMutation.mutate(sortableIds)}
            disabled={reorderMutation.isPending}
            className="inline-flex min-h-9 items-center rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-text-inverse hover:bg-primary-hover disabled:opacity-50"
          >
            {reorderMutation.isPending ? "Đang lưu..." : "Lưu thứ tự"}
          </button>
        </div>
      ) : null}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={sortableIds}
          strategy={verticalListSortingStrategy}
        >
          {displayedGroups.map((group) =>
            group.moduleId ? (
              <SortableModuleGroupCard
                key={group.moduleId}
                id={group.moduleId}
                group={group}
                canReorder={canReorder}
                dragDisabled={!allowDrag}
                {...itemActions}
              />
            ) : (
              <ModuleGroupCard key="ungrouped" group={group} {...itemActions} />
            ),
          )}
        </SortableContext>
      </DndContext>
    </div>
  );
}

function SortableModuleGroupCard({
  id,
  canReorder,
  dragDisabled,
  ...cardProps
}: {
  id: string;
  canReorder: boolean;
  dragDisabled: boolean;
  group: ClassContentModuleGroupDto;
} & ItemActionProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id, disabled: dragDisabled });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.7 : 1,
    position: "relative",
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <ModuleGroupCard
        {...cardProps}
        dragHandle={
          canReorder ? (
            <button
              type="button"
              disabled={dragDisabled}
              className="ml-1 inline-flex size-9 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-text-muted hover:bg-bg-secondary active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-50"
              aria-label={`Kéo để đổi thứ tự chuyên đề ${cardProps.group.title}`}
              {...attributes}
              {...listeners}
            >
              <GripVertical className="size-4" />
            </button>
          ) : null
        }
      />
    </div>
  );
}

function ModuleGroupCard({
  group,
  dragHandle,
  ...itemActions
}: {
  group: ClassContentModuleGroupDto;
  dragHandle?: ReactNode;
} & ItemActionProps) {
  const items = [...group.theoryItems, ...group.practiceItems];
  return (
    <Collapsible
      defaultOpen
      className="rounded-xl border border-border-default bg-bg-surface shadow-sm"
    >
      <div className="flex items-center">
        {dragHandle}
        <CollapsibleTrigger className="group flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-xl p-3 text-left hover:bg-bg-secondary/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus">
          <Layers className="size-4 shrink-0 text-text-muted" aria-hidden />
          <div className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-text-primary">
              {group.title}
            </span>
            <p className="text-xs text-text-muted">
              {group.theoryItems.length} tiết lý thuyết ·{" "}
              {group.practiceItems.length} tiết thực hành đã giao
            </p>
          </div>
          <ChevronDown
            className="size-4 shrink-0 text-text-muted transition-transform group-data-[state=open]:rotate-180"
            aria-hidden
          />
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent className="space-y-2 px-3 pb-3">
        {items.length === 0 ? (
          <p className="py-2 text-center text-xs text-text-muted">
            Chuyên đề chưa có tiết lý thuyết hay tiết thực hành đã giao.
          </p>
        ) : (
          items.map((item) => (
            <ContentItemRow key={item.id} item={item} {...itemActions} />
          ))
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

function ContentItemRow({
  item,
  practiceActionsBasePath,
  onOpenItem,
  onOpenTheoryProgress,
}: {
  item: ClassContentItemDto;
} & ItemActionProps) {
  const isPractice = item.lessonKind === "practice";
  const schedule = isPractice
    ? [
        item.openAt ? `Mở: ${formatVnDateTime(item.openAt)}` : null,
        item.durationMinutes ? `${item.durationMinutes} phút` : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : "";
  const showPracticeActions = isPractice && Boolean(practiceActionsBasePath);
  const showTheoryActions = !isPractice && Boolean(onOpenTheoryProgress);

  return (
    <div
      className={`rounded-lg border border-border-default bg-bg-secondary/20 p-2 ${item.hiddenAt ? "opacity-70" : ""}`}
    >
      <button
        type="button"
        onClick={() => onOpenItem(item.id)}
        className="block w-full cursor-pointer rounded-md p-1 text-left hover:bg-bg-secondary/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
      >
        <span className="flex flex-wrap items-center gap-2">
          <TimelineKindBadge kind="content_item" lessonKind={item.lessonKind} />
          {item.hiddenAt ? (
            <span className="inline-flex rounded-full bg-error/10 px-2 py-0.5 text-[10px] font-semibold text-error">
              Đã ẩn
            </span>
          ) : null}
        </span>
        <span className="mt-1 block truncate text-sm font-medium text-text-primary">
          {item.title}
        </span>
        {schedule ? (
          <span className="mt-0.5 block text-xs text-text-muted">{schedule}</span>
        ) : null}
      </button>
      {showPracticeActions || showTheoryActions ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-2 px-1">
          {showPracticeActions ? (
            <>
              <Link
                href={`${practiceActionsBasePath}/practice/${item.id}/stats`}
                className={ACTION_CLASS}
              >
                <BarChart3 className="size-3.5" />
                Thống kê
              </Link>
              <Link
                href={`${practiceActionsBasePath}/grading/${item.id}`}
                className={ACTION_CLASS}
              >
                <PenLine className="size-3.5" />
                Chấm bài
              </Link>
            </>
          ) : null}
          {showTheoryActions ? (
            <button
              type="button"
              onClick={() =>
                onOpenTheoryProgress?.({
                  contentItemId: item.id,
                  title: item.title,
                })
              }
              className={`${ACTION_CLASS} cursor-pointer`}
            >
              <Eye className="size-3.5" />
              Tiến độ
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
