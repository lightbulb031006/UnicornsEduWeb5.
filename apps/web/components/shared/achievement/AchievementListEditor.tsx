"use client";

import { useEffect, useId, useState, type CSSProperties } from "react";
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
  Check,
  Download,
  GripVertical,
  ImagePlus,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type {
  AchievementDto,
  AchievementLevel,
  AchievementOwnerRef,
  CreateStudentAchievementPayload,
} from "@/dtos/achievement.dto";
import { ACHIEVEMENT_LEVEL_OPTIONS } from "@/dtos/achievement.dto";
import * as achievementApi from "@/lib/apis/achievement.api";
import ImageLightbox from "@/components/ui/ImageLightbox";
import UpgradedSelect from "@/components/ui/UpgradedSelect";
import { downloadAvatar, suggestAvatarFilename } from "@/lib/avatar";

type Props = {
  owner: AchievementOwnerRef;
  /**
   * When true, show a "Chỉnh sửa" control that unlocks reorder / rename / image.
   * List still starts read-only until the user enters edit mode.
   */
  editable?: boolean;
  className?: string;
  heading?: string;
};

const iconBtnClass =
  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border-default text-text-secondary hover:bg-bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:opacity-50";

const fieldClass =
  "w-full rounded-md border border-border-default bg-bg-surface px-3 py-2 text-sm text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus";

function displayTitle(item: AchievementDto) {
  if (item.award && item.exam) return `${item.award} · ${item.exam}`;
  return item.title || "Thành tích";
}

function levelLabel(level: AchievementLevel | null | undefined) {
  return (
    ACHIEVEMENT_LEVEL_OPTIONS.find((opt) => opt.value === level)?.label ?? level ?? ""
  );
}

async function downloadAchievementImage(
  url: string,
  title: string,
): Promise<void> {
  const filename = suggestAvatarFilename(title || "achievement", url).replace(
    "-avatar.",
    "-achievement.",
  );
  try {
    await downloadAvatar(url, filename);
    toast.success("Đã tải ảnh minh chứng.");
  } catch {
    toast.error("Không tải được ảnh minh chứng. Vui lòng thử lại.");
  }
}

function ImageActions({
  item,
  editable,
  busy,
  onUpload,
  onClearImage,
  onPreviewImage,
  onDelete,
}: {
  item: AchievementDto;
  editable: boolean;
  busy: boolean;
  onUpload: (id: string, file: File) => void;
  onClearImage: (id: string) => void;
  onPreviewImage: (src: string, title: string) => void;
  onDelete: (id: string) => void;
}) {
  const fileId = useId();
  const label = displayTitle(item);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {item.imageUrl ? (
        <button
          type="button"
          onClick={() => onPreviewImage(item.imageUrl!, label)}
          className="group relative h-16 w-16 shrink-0 overflow-hidden rounded-md border border-border-default focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
          aria-label={`Xem ảnh: ${label}`}
          title="Xem ảnh"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.imageUrl}
            alt=""
            className="h-full w-full object-cover transition-opacity group-hover:opacity-90"
          />
        </button>
      ) : (
        <span className="text-xs text-text-muted">Chưa có ảnh minh chứng</span>
      )}

      {item.imageUrl ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void downloadAchievementImage(item.imageUrl!, label)}
          className={iconBtnClass}
          aria-label="Tải ảnh minh chứng"
          title="Tải ảnh"
        >
          <Download className="h-4 w-4" aria-hidden />
        </button>
      ) : null}

      {editable ? (
        <>
          <label
            className={`${iconBtnClass} cursor-pointer`}
            aria-label={item.imageUrl ? "Đổi ảnh minh chứng" : "Tải ảnh minh chứng lên"}
            title={item.imageUrl ? "Đổi ảnh" : "Tải ảnh lên"}
          >
            <ImagePlus className="h-4 w-4" aria-hidden />
            <input
              id={fileId}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) onUpload(item.id, file);
              }}
            />
          </label>
          {item.imageUrl ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => onClearImage(item.id)}
              className={iconBtnClass}
              aria-label="Xoá ảnh minh chứng"
              title="Xoá ảnh"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          ) : null}
          <button
            type="button"
            disabled={busy}
            onClick={() => onDelete(item.id)}
            className={`${iconBtnClass} border-danger/40 text-danger hover:bg-danger/5`}
            aria-label="Xoá thành tích"
            title="Xoá thành tích"
          >
            <Trash2 className="h-4 w-4" aria-hidden />
          </button>
        </>
      ) : null}
    </div>
  );
}

function SortableStaffRow({
  item,
  editable,
  busy,
  onSaveTitle,
  onDelete,
  onUpload,
  onClearImage,
  onPreviewImage,
}: {
  item: AchievementDto;
  editable: boolean;
  busy: boolean;
  onSaveTitle: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onUpload: (id: string, file: File) => void;
  onClearImage: (id: string) => void;
  onPreviewImage: (src: string, title: string) => void;
}) {
  const inputId = useId();
  const [draft, setDraft] = useState(item.title);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id, disabled: !editable || busy });

  useEffect(() => {
    setDraft(item.title);
  }, [item.title]);

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.85 : 1,
  };

  const commitTitle = () => {
    const next = draft.trim();
    if (!next || next === item.title) {
      setDraft(item.title);
      return;
    }
    onSaveTitle(item.id, next);
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex flex-col gap-2 rounded-lg border border-border-default bg-bg-surface p-3 sm:flex-row sm:items-start sm:gap-3"
    >
      {editable ? (
        <button
          type="button"
          className={`${iconBtnClass} cursor-grab touch-none active:cursor-grabbing`}
          aria-label="Kéo để sắp xếp"
          disabled={busy}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" aria-hidden />
        </button>
      ) : null}

      <div className="min-w-0 flex-1 space-y-2">
        {editable ? (
          <input
            id={inputId}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                (e.target as HTMLInputElement).blur();
              }
            }}
            disabled={busy}
            className={fieldClass}
            placeholder="Tiêu đề thành tích"
          />
        ) : (
          <p className="text-sm font-medium text-text-primary">{item.title}</p>
        )}

        <ImageActions
          item={item}
          editable={editable}
          busy={busy}
          onUpload={onUpload}
          onClearImage={onClearImage}
          onPreviewImage={onPreviewImage}
          onDelete={onDelete}
        />
      </div>
    </li>
  );
}

function SortableStudentRow({
  item,
  editable,
  busy,
  onSaveFields,
  onDelete,
  onUpload,
  onClearImage,
  onPreviewImage,
}: {
  item: AchievementDto;
  editable: boolean;
  busy: boolean;
  onSaveFields: (id: string, fields: CreateStudentAchievementPayload) => void;
  onDelete: (id: string) => void;
  onUpload: (id: string, file: File) => void;
  onClearImage: (id: string) => void;
  onPreviewImage: (src: string, title: string) => void;
}) {
  const [award, setAward] = useState(item.award ?? "");
  const [exam, setExam] = useState(item.exam ?? "");
  const [year, setYear] = useState(String(item.year ?? new Date().getFullYear()));
  const [level, setLevel] = useState<AchievementLevel>(
    item.level ?? "HSG_TINH_THANH_PHO",
  );
  const [courseLabel, setCourseLabel] = useState(item.courseLabel ?? "");
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id, disabled: !editable || busy });

  useEffect(() => {
    setAward(item.award ?? "");
    setExam(item.exam ?? "");
    setYear(String(item.year ?? new Date().getFullYear()));
    setLevel(item.level ?? "HSG_TINH_THANH_PHO");
    setCourseLabel(item.courseLabel ?? "");
  }, [item.award, item.exam, item.year, item.level, item.courseLabel]);

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.85 : 1,
  };

  const commit = () => {
    const nextAward = award.trim();
    const nextExam = exam.trim();
    const nextYear = Number(year);
    if (!nextAward || !nextExam || !Number.isFinite(nextYear)) return;
    const nextCourse = courseLabel.trim() || null;
    if (
      nextAward === (item.award ?? "") &&
      nextExam === (item.exam ?? "") &&
      nextYear === item.year &&
      level === item.level &&
      nextCourse === (item.courseLabel ?? null)
    ) {
      return;
    }
    onSaveFields(item.id, {
      award: nextAward,
      exam: nextExam,
      year: nextYear,
      level,
      courseLabel: nextCourse,
    });
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex flex-col gap-2 rounded-lg border border-border-default bg-bg-surface p-3 sm:flex-row sm:items-start sm:gap-3"
    >
      {editable ? (
        <button
          type="button"
          className={`${iconBtnClass} cursor-grab touch-none active:cursor-grabbing`}
          aria-label="Kéo để sắp xếp"
          disabled={busy}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" aria-hidden />
        </button>
      ) : null}

      <div className="min-w-0 flex-1 space-y-2">
        {editable ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="space-y-1 text-xs text-text-secondary">
              <span>Giải thưởng</span>
              <input
                value={award}
                onChange={(e) => setAward(e.target.value)}
                onBlur={commit}
                disabled={busy}
                className={fieldClass}
                placeholder="Giải Khuyến khích"
              />
            </label>
            <label className="space-y-1 text-xs text-text-secondary">
              <span>Kỳ thi</span>
              <input
                value={exam}
                onChange={(e) => setExam(e.target.value)}
                onBlur={commit}
                disabled={busy}
                className={fieldClass}
                placeholder="HSG Quốc gia"
              />
            </label>
            <label className="space-y-1 text-xs text-text-secondary">
              <span>Năm</span>
              <input
                type="number"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                onBlur={commit}
                disabled={busy}
                className={fieldClass}
              />
            </label>
            <div className="space-y-1 text-xs text-text-secondary">
              <span>Cấp</span>
              <UpgradedSelect
                value={level}
                onValueChange={(value) => {
                  setLevel(value as AchievementLevel);
                  const nextAward = award.trim();
                  const nextExam = exam.trim();
                  const nextYear = Number(year);
                  if (!nextAward || !nextExam || !Number.isFinite(nextYear)) return;
                  onSaveFields(item.id, {
                    award: nextAward,
                    exam: nextExam,
                    year: nextYear,
                    level: value as AchievementLevel,
                    courseLabel: courseLabel.trim() || null,
                  });
                }}
                options={ACHIEVEMENT_LEVEL_OPTIONS.map((opt) => ({
                  value: opt.value,
                  label: opt.label,
                }))}
                disabled={busy}
              />
            </div>
            <label className="space-y-1 text-xs text-text-secondary sm:col-span-2">
              <span>Nhãn khóa học</span>
              <input
                value={courseLabel}
                onChange={(e) => setCourseLabel(e.target.value)}
                onBlur={commit}
                disabled={busy}
                className={fieldClass}
                placeholder='VD "KHỐI THPT"'
              />
            </label>
          </div>
        ) : (
          <div className="space-y-1">
            <p className="text-sm font-medium text-text-primary">
              {displayTitle(item)}
            </p>
            <p className="text-xs text-text-muted">
              {[item.year, levelLabel(item.level), item.courseLabel]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
        )}

        <ImageActions
          item={item}
          editable={editable}
          busy={busy}
          onUpload={onUpload}
          onClearImage={onClearImage}
          onPreviewImage={onPreviewImage}
          onDelete={onDelete}
        />
      </div>
    </li>
  );
}

export default function AchievementListEditor({
  owner,
  editable = true,
  className = "",
  heading = "Thành tích",
}: Props) {
  const isStudent = owner.kind === "student";
  const headingId = useId();
  const queryClient = useQueryClient();
  const queryKey = achievementApi.achievementQueryKey(owner);
  const [newTitle, setNewTitle] = useState("");
  const [newTitleFile, setNewTitleFile] = useState<File | null>(null);
  const [draftStudent, setDraftStudent] = useState<CreateStudentAchievementPayload>({
    award: "",
    exam: "",
    year: new Date().getFullYear(),
    level: "HSG_TINH_THANH_PHO",
    courseLabel: "",
  });
  const [draftStudentFile, setDraftStudentFile] = useState<File | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [preview, setPreview] = useState<{ src: string; title: string } | null>(
    null,
  );
  const canMutate = editable && isEditing;

  const listQuery = useQuery({
    queryKey,
    queryFn: () => achievementApi.listAchievements(owner),
  });

  const items = listQuery.data ?? [];

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey });

  const createMutation = useMutation({
    mutationFn: async ({
      payload,
      file,
    }: {
      payload: { title: string } | CreateStudentAchievementPayload;
      file?: File;
    }) => {
      const created = await achievementApi.createAchievement(owner, payload);
      if (file) {
        await achievementApi.uploadAchievementImage(owner, created.id, file);
      }
      return created;
    },
    onSuccess: async () => {
      setNewTitle("");
      setNewTitleFile(null);
      setDraftStudent({
        award: "",
        exam: "",
        year: new Date().getFullYear(),
        level: "HSG_TINH_THANH_PHO",
        courseLabel: "",
      });
      setDraftStudentFile(null);
      await invalidate();
      toast.success("Đã thêm thành tích.");
    },
    onError: () => toast.error("Không thể thêm thành tích."),
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: { title: string } | CreateStudentAchievementPayload;
    }) => achievementApi.updateAchievement(owner, id, payload),
    onSuccess: async () => {
      await invalidate();
      toast.success("Đã cập nhật thành tích.");
    },
    onError: () => toast.error("Không thể cập nhật thành tích."),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => achievementApi.deleteAchievement(owner, id),
    onSuccess: async () => {
      await invalidate();
      toast.success("Đã xoá thành tích.");
    },
    onError: () => toast.error("Không thể xoá thành tích."),
  });

  const reorderMutation = useMutation({
    mutationFn: (orderedIds: string[]) =>
      achievementApi.reorderAchievements(owner, { orderedIds }),
    onSuccess: async (data) => {
      queryClient.setQueryData(queryKey, data);
      toast.success("Đã cập nhật thứ tự.");
    },
    onError: async () => {
      await invalidate();
      toast.error("Không thể sắp xếp lại. Danh sách đã được tải lại.");
    },
  });

  const uploadMutation = useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) =>
      achievementApi.uploadAchievementImage(owner, id, file),
    onSuccess: async () => {
      await invalidate();
      toast.success("Đã tải ảnh minh chứng.");
    },
    onError: () => toast.error("Không thể tải ảnh minh chứng."),
  });

  const clearImageMutation = useMutation({
    mutationFn: (id: string) =>
      achievementApi.deleteAchievementImage(owner, id),
    onSuccess: async () => {
      await invalidate();
      toast.success("Đã xoá ảnh minh chứng.");
    },
    onError: () => toast.error("Không thể xoá ảnh minh chứng."),
  });

  const busy =
    createMutation.isPending ||
    updateMutation.isPending ||
    deleteMutation.isPending ||
    reorderMutation.isPending ||
    uploadMutation.isPending ||
    clearImageMutation.isPending;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    if (!canMutate) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = items.findIndex((row) => row.id === active.id);
    const newIndex = items.findIndex((row) => row.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const next = arrayMove(items, oldIndex, newIndex);
    queryClient.setQueryData(queryKey, next);
    reorderMutation.mutate(next.map((row) => row.id));
  };

  const exitEditMode = () => {
    setIsEditing(false);
    setNewTitle("");
  };

  const canCreateStudent =
    draftStudent.award.trim().length > 0 &&
    draftStudent.exam.trim().length > 0 &&
    Number.isFinite(draftStudent.year);

  return (
    <section
      className={`space-y-3 ${className}`}
      aria-labelledby={headingId}
    >
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          {heading ? (
            <h3
              id={headingId}
              className="text-sm font-medium text-text-secondary"
            >
              {heading}
            </h3>
          ) : (
            <span id={headingId} className="sr-only">
              Thành tích
            </span>
          )}
          {editable ? (
            isEditing ? (
              <button
                type="button"
                onClick={exitEditMode}
                disabled={busy}
                className={iconBtnClass}
                aria-label="Xong chỉnh sửa"
                title="Xong"
              >
                <Check className="h-4 w-4" aria-hidden />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className={iconBtnClass}
                aria-label="Chỉnh sửa thành tích"
                title="Chỉnh sửa"
              >
                <Pencil className="h-4 w-4" aria-hidden />
              </button>
            )
          ) : null}
        </div>
        {listQuery.isFetching ? (
          <span className="text-xs text-text-muted">Đang tải…</span>
        ) : null}
      </div>

      {listQuery.isError ? (
        <p className="text-sm text-danger">Không tải được danh sách thành tích.</p>
      ) : null}

      {!listQuery.isLoading && items.length === 0 ? (
        <p className="text-sm text-text-muted">Chưa có thành tích nào.</p>
      ) : null}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={items.map((row) => row.id)}
          strategy={verticalListSortingStrategy}
        >
          <ul className="space-y-2">
            {items.map((item) =>
              isStudent ? (
                <SortableStudentRow
                  key={item.id}
                  item={item}
                  editable={canMutate}
                  busy={busy}
                  onSaveFields={(id, fields) =>
                    updateMutation.mutate({ id, payload: fields })
                  }
                  onDelete={(id) => {
                    if (window.confirm("Xoá thành tích này?")) {
                      deleteMutation.mutate(id);
                    }
                  }}
                  onUpload={(id, file) =>
                    uploadMutation.mutate({ id, file })
                  }
                  onClearImage={(id) => clearImageMutation.mutate(id)}
                  onPreviewImage={(src, title) => setPreview({ src, title })}
                />
              ) : (
                <SortableStaffRow
                  key={item.id}
                  item={item}
                  editable={canMutate}
                  busy={busy}
                  onSaveTitle={(id, title) =>
                    updateMutation.mutate({ id, payload: { title } })
                  }
                  onDelete={(id) => {
                    if (window.confirm("Xoá thành tích này?")) {
                      deleteMutation.mutate(id);
                    }
                  }}
                  onUpload={(id, file) =>
                    uploadMutation.mutate({ id, file })
                  }
                  onClearImage={(id) => clearImageMutation.mutate(id)}
                  onPreviewImage={(src, title) => setPreview({ src, title })}
                />
              ),
            )}
          </ul>
        </SortableContext>
      </DndContext>

      <ImageLightbox
        open={Boolean(preview)}
        src={preview?.src ?? ""}
        title={preview?.title}
        onClose={() => setPreview(null)}
      />

      {canMutate && !isStudent ? (
        <div className="space-y-2 rounded-lg border border-dashed border-border-default p-3">
          <p className="text-xs font-medium text-text-secondary">
            Thêm thành tích (bắt buộc kèm ảnh minh chứng)
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              disabled={busy}
              className={`min-w-0 flex-1 ${fieldClass}`}
              aria-label="Thêm thành tích mới"
              placeholder="Thêm thành tích mới…"
            />
            <label
              className={`${iconBtnClass} w-auto cursor-pointer gap-1.5 px-3 ${
                newTitleFile ? "border-success/50 text-success" : ""
              }`}
            >
              <ImagePlus className="h-4 w-4" aria-hidden />
              <span className="text-xs">
                {newTitleFile ? "Đã chọn ảnh" : "Chọn ảnh minh chứng"}
              </span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                disabled={busy}
                onChange={(e) => {
                  setNewTitleFile(e.target.files?.[0] ?? null);
                }}
              />
            </label>
            <button
              type="button"
              disabled={busy || !newTitle.trim() || !newTitleFile}
              onClick={() => {
                const title = newTitle.trim();
                if (title && newTitleFile) {
                  createMutation.mutate({ payload: { title }, file: newTitleFile });
                }
              }}
              className={`${iconBtnClass} bg-primary text-text-inverse hover:bg-primary/90 disabled:opacity-50`}
              aria-label="Thêm thành tích"
              title="Thêm"
            >
              <Plus className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>
      ) : null}

      {canMutate && isStudent ? (
        <div className="space-y-2 rounded-lg border border-dashed border-border-default p-3">
          <p className="text-xs font-medium text-text-secondary">
            Thêm thành tích mới
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              value={draftStudent.award}
              onChange={(e) =>
                setDraftStudent((prev) => ({ ...prev, award: e.target.value }))
              }
              disabled={busy}
              className={fieldClass}
              aria-label="Giải thưởng"
              placeholder="Giải thưởng"
            />
            <input
              value={draftStudent.exam}
              onChange={(e) =>
                setDraftStudent((prev) => ({ ...prev, exam: e.target.value }))
              }
              disabled={busy}
              className={fieldClass}
              aria-label="Kỳ thi"
              placeholder="Kỳ thi"
            />
            <input
              type="number"
              value={draftStudent.year}
              onChange={(e) =>
                setDraftStudent((prev) => ({
                  ...prev,
                  year: Number(e.target.value) || new Date().getFullYear(),
                }))
              }
              disabled={busy}
              className={fieldClass}
              placeholder="Năm"
            />
            <UpgradedSelect
              value={draftStudent.level}
              onValueChange={(value) =>
                setDraftStudent((prev) => ({
                  ...prev,
                  level: value as AchievementLevel,
                }))
              }
              options={ACHIEVEMENT_LEVEL_OPTIONS.map((opt) => ({
                value: opt.value,
                label: opt.label,
              }))}
              disabled={busy}
            />
            <input
              value={draftStudent.courseLabel ?? ""}
              onChange={(e) =>
                setDraftStudent((prev) => ({
                  ...prev,
                  courseLabel: e.target.value,
                }))
              }
              disabled={busy}
              className={`sm:col-span-2 ${fieldClass}`}
              placeholder='Nhãn khóa học (VD "KHỐI THPT")'
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label
              className={`${iconBtnClass} w-auto cursor-pointer gap-1.5 px-3 ${
                draftStudentFile ? "border-success/50 text-success" : ""
              }`}
            >
              <ImagePlus className="h-4 w-4" aria-hidden />
              <span className="text-xs">
                {draftStudentFile ? "Đã chọn ảnh" : "Chọn ảnh minh chứng (tuỳ chọn)"}
              </span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                disabled={busy}
                onChange={(e) => {
                  setDraftStudentFile(e.target.files?.[0] ?? null);
                }}
              />
            </label>
            <button
              type="button"
              disabled={busy || !canCreateStudent}
              onClick={() => {
                if (!canCreateStudent) return;
                createMutation.mutate({
                  payload: {
                    award: draftStudent.award.trim(),
                    exam: draftStudent.exam.trim(),
                    year: draftStudent.year,
                    level: draftStudent.level,
                    courseLabel: draftStudent.courseLabel?.trim() || null,
                  },
                  file: draftStudentFile ?? undefined,
                });
              }}
              className={`${iconBtnClass} bg-primary text-text-inverse hover:bg-primary/90 disabled:opacity-50`}
              aria-label="Thêm thành tích"
              title="Thêm"
            >
              <Plus className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
