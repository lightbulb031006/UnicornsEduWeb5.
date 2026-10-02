"use client";

import {
  useCallback,
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
import { GripVertical } from "lucide-react";
import { toast } from "sonner";
import * as classApi from "@/lib/apis/class.api";
import UpgradedSelect from "@/components/ui/UpgradedSelect";
import { Switch } from "@/components/ui/switch";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useCourseDifficultyLevels } from "@/lib/hooks/useCourseDifficultyLevels";
import { invalidateCourseDifficultyLevelsQueries } from "@/lib/query-invalidation";
import { courseKeys } from "@/lib/query-keys";
import { runBackgroundSave } from "@/lib/mutation-feedback";
import type { CourseDifficultyLevel } from "@/dtos/class.dto";
import type { CourseWorkspaceCapabilities } from "@/lib/course-workspace-access";

export function SettingsTab({
  courseId,
  capabilities,
}: {
  courseId: string;
  capabilities: Pick<
    CourseWorkspaceCapabilities,
    | "canMutateDifficultyLevels"
    | "canViewLessonPlanTeam"
    | "canMutateLessonPlanTeam"
  >;
}) {
  const queryClient = useQueryClient();

  const invalidateCourse = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: courseKeys.detail(courseId) }),
      queryClient.invalidateQueries({ queryKey: courseKeys.all }),
    ]);
  };

  return (
    <div className="flex flex-col gap-4">
      <DifficultyLevelsCard
        courseId={courseId}
        canMutate={capabilities.canMutateDifficultyLevels}
        invalidateCourse={invalidateCourse}
      />
      {capabilities.canViewLessonPlanTeam ? (
        <LessonPlanTeamCard
          courseId={courseId}
          canMutate={capabilities.canMutateLessonPlanTeam}
          invalidateCourse={invalidateCourse}
        />
      ) : null}
    </div>
  );
}

function SortableDifficultyRow({
  level,
  index,
  canMutate,
  canReorder,
  isSaving,
  savingLabel,
  editingId,
  editingName,
  onEditingNameChange,
  onSaveEdit,
  onCancelEdit,
  onStartEdit,
  onToggle,
  onDelete,
}: {
  level: CourseDifficultyLevel;
  index: number;
  canMutate: boolean;
  canReorder: boolean;
  isSaving: boolean;
  savingLabel: string | null;
  editingId: string | null;
  editingName: string;
  onEditingNameChange: (value: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onStartEdit: () => void;
  onToggle: (nextActive: boolean) => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: level.id, disabled: !canReorder });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.7 : 1,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex flex-col gap-2 rounded-lg border border-border-default bg-bg-surface p-3 sm:flex-row sm:items-center sm:justify-between"
    >
      {canMutate && editingId === level.id ? (
        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
          {canReorder ? (
            <button
              type="button"
              className="inline-flex size-9 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-text-muted hover:bg-bg-secondary active:cursor-grabbing"
              aria-label={`Kéo để sắp xếp ${level.name}`}
              {...attributes}
              {...listeners}
            >
              <GripVertical className="size-4" />
            </button>
          ) : null}
          <input
            autoFocus
            value={editingName}
            onChange={(e) => onEditingNameChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onSaveEdit();
              }
              if (e.key === "Escape") onCancelEdit();
            }}
            disabled={isSaving}
            className="min-h-11 min-w-0 flex-1 rounded-md border border-border-default bg-bg-surface px-3 py-1.5 text-sm text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:opacity-60 sm:min-h-10"
          />
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={onSaveEdit}
              disabled={isSaving}
              className="min-h-11 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-text-inverse disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-10"
            >
              {savingLabel ?? "Lưu"}
            </button>
            <button
              type="button"
              onClick={onCancelEdit}
              disabled={isSaving}
              className="min-h-11 rounded-md border border-border-default px-3 py-1.5 text-xs font-medium text-text-secondary disabled:opacity-60 sm:min-h-10"
            >
              Huỷ
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex min-w-0 items-center gap-2">
            {canReorder ? (
              <button
                type="button"
                className="inline-flex size-9 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-text-muted hover:bg-bg-secondary active:cursor-grabbing"
                aria-label={`Kéo để sắp xếp ${level.name}`}
                {...attributes}
                {...listeners}
              >
                <GripVertical className="size-4" />
              </button>
            ) : null}
            <span className="w-5 shrink-0 text-center text-xs text-text-muted">
              {index + 1}
            </span>
            <span
              className={
                level.isActive
                  ? "truncate text-sm font-medium text-text-primary"
                  : "truncate text-sm text-text-muted line-through"
              }
            >
              {level.name}
            </span>
            {!level.isActive ? (
              <span className="rounded bg-error/10 px-1.5 py-0.5 text-xs text-error">
                Đã tắt
              </span>
            ) : null}
          </div>
          {canMutate ? (
            <div className="flex shrink-0 flex-wrap items-center gap-2 self-end sm:self-auto">
              <Switch
                checked={level.isActive}
                onCheckedChange={onToggle}
                disabled={isSaving}
                aria-label={`Bật/tắt ${level.name}`}
              />
              <button
                type="button"
                onClick={onStartEdit}
                disabled={isSaving}
                className="min-h-11 rounded-md border border-border-default px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:bg-bg-tertiary disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-10"
              >
                Sửa
              </button>
              <button
                type="button"
                onClick={onDelete}
                disabled={isSaving}
                className="min-h-11 rounded-md border border-error/30 px-3 py-1.5 text-xs font-medium text-error transition-colors hover:bg-error/10 disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-10"
              >
                {savingLabel ?? "Xoá"}
              </button>
            </div>
          ) : null}
        </>
      )}
    </li>
  );
}

function DifficultyLevelsCard({
  courseId,
  canMutate,
  invalidateCourse,
}: {
  courseId: string;
  canMutate: boolean;
  invalidateCourse: () => Promise<void>;
}) {
  const queryClient = useQueryClient();
  const { data: serverLevels = [], isLoading } = useCourseDifficultyLevels(
    courseId,
    true,
  );
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [localItems, setLocalItems] = useState<CourseDifficultyLevel[] | null>(
    null,
  );
  const [orderDirty, setOrderDirty] = useState(false);
  const { confirm, dialog } = useConfirmDialog();

  const levels = localItems ?? serverLevels;
  const canReorder = canMutate && levels.length > 1;

  // Reset ngay trong render thay vì useEffect (tránh 1 frame hiện draft khoá cũ).
  const [prevCourseId, setPrevCourseId] = useState(courseId);
  if (prevCourseId !== courseId) {
    setPrevCourseId(courseId);
    setLocalItems(null);
    setOrderDirty(false);
  }

  const discardDraftOrder = useCallback(() => {
    setLocalItems(null);
    setOrderDirty(false);
  }, []);

  const invalidateLevels = async () => {
    await Promise.all([
      invalidateCourseDifficultyLevelsQueries(queryClient, courseId),
      invalidateCourse(),
    ]);
  };

  const runLevelSave = <T,>(options: {
    loadingMessage: string;
    successMessage: string;
    errorMessage: string;
    action: () => Promise<T>;
    afterSuccess?: (result: T) => void;
  }) => {
    if (isSaving) return;
    setIsSaving(true);
    runBackgroundSave({
      loadingMessage: options.loadingMessage,
      successMessage: options.successMessage,
      errorMessage: options.errorMessage,
      action: options.action,
      onSuccess: async (result) => {
        try {
          options.afterSuccess?.(result);
          await invalidateLevels();
        } finally {
          setIsSaving(false);
        }
      },
      onError: () => {
        setIsSaving(false);
      },
    });
  };

  const addLevel = () => {
    const name = newName.trim();
    if (!name || !canMutate) return;
    setNewName("");
    runLevelSave({
      loadingMessage: "Đang thêm mức độ khó...",
      successMessage: "Đã thêm mức độ khó.",
      errorMessage: "Không thể thêm mức độ khó.",
      action: () =>
        classApi.createCourseDifficultyLevel(courseId, {
          name,
          sort_order: levels.length,
        }),
      afterSuccess: () => discardDraftOrder(),
    });
  };

  const startEdit = (level: CourseDifficultyLevel) => {
    setEditingId(level.id);
    setEditingName(level.name);
  };

  const saveEdit = (level: CourseDifficultyLevel) => {
    const name = editingName.trim();
    if (!name || !canMutate) return;
    setEditingId(null);
    runLevelSave({
      loadingMessage: "Đang cập nhật mức độ khó...",
      successMessage: "Đã cập nhật mức độ khó.",
      errorMessage: "Không thể cập nhật mức độ khó.",
      action: () =>
        classApi.updateCourseDifficultyLevel(courseId, level.id, { name }),
      afterSuccess: () => {
        setLocalItems((prev) =>
          prev
            ? prev.map((item) =>
                item.id === level.id ? { ...item, name } : item,
              )
            : prev,
        );
      },
    });
  };

  const toggleLevel = (level: CourseDifficultyLevel, nextActive: boolean) => {
    if (!canMutate) return;
    runLevelSave({
      loadingMessage: "Đang cập nhật mức độ khó...",
      successMessage: "Đã cập nhật mức độ khó.",
      errorMessage: "Không thể cập nhật mức độ khó.",
      action: () =>
        classApi.updateCourseDifficultyLevel(courseId, level.id, {
          is_active: nextActive,
        }),
      afterSuccess: () => {
        setLocalItems((prev) =>
          prev
            ? prev.map((item) =>
                item.id === level.id ? { ...item, isActive: nextActive } : item,
              )
            : prev,
        );
      },
    });
  };

  const deleteLevel = async (level: CourseDifficultyLevel) => {
    if (!canMutate) return;
    const ok = await confirm({
      title: "Xoá mức độ khó?",
      description: `Xoá mức độ khó "${level.name}"?`,
      confirmLabel: "Xoá",
      variant: "destructive",
    });
    if (!ok) return;
    runLevelSave({
      loadingMessage: "Đang xoá mức độ khó...",
      successMessage: "Đã xoá mức độ khó.",
      errorMessage: "Không thể xoá mức độ khó.",
      action: () => classApi.deleteCourseDifficultyLevel(courseId, level.id),
      afterSuccess: () => discardDraftOrder(),
    });
  };

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
      const oldIndex = levels.findIndex((row) => row.id === active.id);
      const newIndex = levels.findIndex((row) => row.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return;
      setLocalItems(arrayMove(levels, oldIndex, newIndex));
      setOrderDirty(true);
    },
    [levels],
  );

  const reorderMutation = useMutation({
    mutationFn: (next: CourseDifficultyLevel[]) =>
      classApi.reorderCourseDifficultyLevels(
        courseId,
        next.map((level, index) => ({ id: level.id, sort_order: index })),
      ),
    onSuccess: async () => {
      toast.success("Đã lưu thứ tự mức độ khó.");
      discardDraftOrder();
      await invalidateLevels();
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      toast.error(
        err?.response?.data?.message || "Không thể sắp xếp mức độ khó.",
      );
    },
  });

  const handleSaveOrder = () => {
    if (!orderDirty || !localItems?.length || reorderMutation.isPending) return;
    reorderMutation.mutate(localItems);
  };

  const savingLabel =
    isSaving || reorderMutation.isPending ? "Đang lưu…" : null;
  const busy = isSaving || reorderMutation.isPending;

  return (
    <section className="rounded-xl border border-border-default bg-bg-surface p-3 shadow-sm sm:rounded-lg sm:p-5">
      <h2 className="text-base font-semibold text-text-primary">Thang mức độ khó</h2>
      <p className="mt-0.5 text-sm text-text-secondary">
        Thang do khoá tự định nghĩa (tên, thứ tự, bật/tắt) — không dùng thang cố định toàn hệ thống.
        {canReorder ? " Kéo để sắp xếp; Lưu thứ tự mới ghi xuống máy chủ." : ""}
      </p>

      {canMutate ? (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addLevel();
              }
            }}
            aria-label="Tên mức độ khó (VD: Dễ, Trung bình, Khó)"
            placeholder="Tên mức độ khó (VD: Dễ, Trung bình, Khó)"
            disabled={busy}
            className="min-h-11 min-w-0 flex-1 rounded-md border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-10"
          />
          <button
            type="button"
            onClick={addLevel}
            disabled={busy || !newName.trim()}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-text-inverse transition-colors duration-200 hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-10"
          >
            {savingLabel ?? (
              <>
                <svg className="size-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Thêm mức độ
              </>
            )}
          </button>
        </div>
      ) : null}

      {orderDirty ? (
        <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
          <p className="mr-auto text-xs text-text-secondary">
            Thứ tự mới chỉ lưu sau khi bấm Lưu.
          </p>
          <button
            type="button"
            onClick={discardDraftOrder}
            disabled={reorderMutation.isPending}
            className="inline-flex min-h-11 items-center rounded-md border border-border-default px-3 py-1.5 text-xs font-semibold text-text-secondary hover:bg-bg-secondary disabled:opacity-50 sm:min-h-9"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={handleSaveOrder}
            disabled={reorderMutation.isPending}
            className="inline-flex min-h-11 items-center rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-text-inverse hover:bg-primary-hover disabled:opacity-50 sm:min-h-9"
          >
            {reorderMutation.isPending ? "Đang lưu…" : "Lưu thứ tự"}
          </button>
        </div>
      ) : null}

      {isLoading ? (
        <p className="mt-4 text-sm text-text-secondary">Đang tải...</p>
      ) : levels.length === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed border-border-default p-4 text-sm text-text-secondary">
          Chưa có mức độ khó nào.
          {canMutate ? " Thêm mức độ đầu tiên để bắt đầu." : ""}
        </p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={levels.map((level) => level.id)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="mt-4 space-y-2">
              {levels.map((level, index) => (
                <SortableDifficultyRow
                  key={level.id}
                  level={level}
                  index={index}
                  canMutate={canMutate}
                  canReorder={canReorder}
                  isSaving={busy}
                  savingLabel={savingLabel}
                  editingId={editingId}
                  editingName={editingName}
                  onEditingNameChange={setEditingName}
                  onSaveEdit={() => saveEdit(level)}
                  onCancelEdit={() => setEditingId(null)}
                  onStartEdit={() => startEdit(level)}
                  onToggle={(next) => toggleLevel(level, next)}
                  onDelete={() => void deleteLevel(level)}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}
      {dialog}
    </section>
  );
}

function LessonPlanTeamCard({
  courseId,
  canMutate,
  invalidateCourse,
}: {
  courseId: string;
  canMutate: boolean;
  invalidateCourse: () => Promise<void>;
}) {
  const { data: course } = useQuery({
    queryKey: courseKeys.detail(courseId),
    queryFn: () => classApi.getCourseById(courseId),
    enabled: Boolean(courseId),
  });
  const members = course?.lessonPlanMembers ?? [];
  const [selectedStaffId, setSelectedStaffId] = useState("");

  const { data: staffOptions = [] } = useQuery({
    queryKey: courseKeys.lessonPlanStaff(""),
    queryFn: () => classApi.searchLessonPlanStaff({ limit: 200 }),
    staleTime: 30_000,
    enabled: canMutate,
  });

  const availableOptions = staffOptions
    .filter(
      (staff) =>
        !staff.roles.includes("lesson_plan_head") &&
        !members.some((m) => m.staff.id === staff.id),
    )
    .map((staff) => ({
      value: staff.id,
      label: staff.fullName,
      searchLabel: staff.fullName,
    }));

  const assignMutation = useMutation({
    mutationFn: (staffIds: string[]) =>
      classApi.assignCourseLessonPlanMembers(courseId, {
        staff_ids: staffIds,
      }),
  });

  const replaceMembers = (staffIds: string[]) => {
    if (!canMutate || assignMutation.isPending) return;
    runBackgroundSave({
      loadingMessage: "Đang cập nhật đội giáo án...",
      successMessage: "Đã cập nhật đội giáo án.",
      errorMessage: "Không thể cập nhật đội giáo án.",
      action: () => assignMutation.mutateAsync(staffIds),
      onSuccess: async () => {
        setSelectedStaffId("");
        await invalidateCourse();
      },
    });
  };

  const addMember = () => {
    if (!selectedStaffId) return;
    replaceMembers([...members.map((m) => m.staff.id), selectedStaffId]);
  };

  const removeMember = (staffId: string) => {
    replaceMembers(
      members.filter((m) => m.staff.id !== staffId).map((m) => m.staff.id),
    );
  };

  const saving = assignMutation.isPending;

  return (
    <section className="rounded-xl border border-border-default bg-bg-surface p-3 shadow-sm sm:rounded-lg sm:p-5">
      <h2 className="text-base font-semibold text-text-primary">Đội giáo án</h2>
      <p className="mt-0.5 text-sm text-text-secondary">
        Nhân sự soạn nội dung học thuật và ngân hàng câu hỏi của khoá. Thành viên lesson_plan chỉ
        thấy khoá mình được gán; trưởng giáo án thấy mọi khoá.
      </p>

      {canMutate ? (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
          <UpgradedSelect
            searchable
            value={selectedStaffId}
            onValueChange={setSelectedStaffId}
            options={availableOptions}
            placeholder="Chọn nhân sự lesson_plan để gán..."
            emptyStateLabel="Không còn nhân sự nào để gán."
            noResultsLabel="Không tìm thấy nhân sự phù hợp."
            buttonClassName="min-h-11 min-w-0 flex-1 sm:min-h-10"
            menuClassName="max-h-72"
            disabled={saving}
          />
          <button
            type="button"
            onClick={addMember}
            disabled={!selectedStaffId || saving}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-text-inverse transition-colors duration-200 hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-10"
          >
            {saving ? "Đang lưu…" : "Thêm"}
          </button>
        </div>
      ) : null}

      {members.length === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed border-border-default p-4 text-sm text-text-secondary">
          Chưa có thành viên nào trong đội giáo án.
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {members.map((member) => {
            const isLessonPlanHead = member.staff.roles.includes(
              "lesson_plan_head",
            );
            return (
              <li
                key={member.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border-default bg-bg-surface px-3 py-2.5"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-sm font-medium text-text-primary">
                    {member.staff.fullName}
                  </span>
                  {isLessonPlanHead ? (
                    <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary">
                      Mặc định
                    </span>
                  ) : null}
                </div>
                {canMutate && !isLessonPlanHead ? (
                  <button
                    type="button"
                    onClick={() => removeMember(member.staff.id)}
                    disabled={saving}
                    className="min-h-11 shrink-0 rounded-md border border-error/30 px-3 py-1.5 text-xs font-medium text-error transition-colors hover:bg-error/10 disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-10"
                  >
                    {saving ? "Đang lưu…" : "Gỡ"}
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
