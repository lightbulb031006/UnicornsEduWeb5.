"use client";

import { useId, useState, type CSSProperties } from "react";
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
} from "lucide-react";
import { toast } from "sonner";
import type { StudentGalleryItemDto } from "@/dtos/student-gallery.dto";
import * as galleryApi from "@/lib/apis/student-gallery.api";
import ImageLightbox from "@/components/ui/ImageLightbox";
import { downloadAvatar, suggestAvatarFilename } from "@/lib/avatar";

type Props = {
  studentId: string;
  editable?: boolean;
  className?: string;
  heading?: string;
};

const iconBtnClass =
  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border-default text-text-secondary hover:bg-bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:opacity-50";

async function downloadGalleryImage(url: string): Promise<void> {
  const filename = suggestAvatarFilename("gallery", url).replace(
    "-avatar.",
    "-gallery.",
  );
  try {
    await downloadAvatar(url, filename);
    toast.success("Đã tải ảnh feedback.");
  } catch {
    toast.error("Không tải được ảnh feedback. Vui lòng thử lại.");
  }
}

function SortableRow({
  item,
  editable,
  busy,
  onDelete,
  onReplace,
  onPreviewImage,
}: {
  item: StudentGalleryItemDto;
  editable: boolean;
  busy: boolean;
  onDelete: (id: string) => void;
  onReplace: (id: string, file: File) => void;
  onPreviewImage: (src: string) => void;
}) {
  const fileId = useId();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id, disabled: !editable || busy });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.85 : 1,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 rounded-lg border border-border-default bg-bg-surface p-2.5 sm:gap-3 sm:p-3"
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

      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        {item.imageUrl ? (
          <button
            type="button"
            onClick={() => onPreviewImage(item.imageUrl!)}
            className="group relative h-16 w-16 shrink-0 overflow-hidden rounded-md border border-border-default focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
            aria-label="Xem ảnh feedback"
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
          <span className="text-xs text-text-muted">Chưa có ảnh</span>
        )}

        {item.imageUrl ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void downloadGalleryImage(item.imageUrl!)}
            className={iconBtnClass}
            aria-label="Tải ảnh feedback"
            title="Tải ảnh"
          >
            <Download className="h-4 w-4" aria-hidden />
          </button>
        ) : null}

        {editable ? (
          <>
            <label
              className={`${iconBtnClass} cursor-pointer`}
              aria-label={item.imageUrl ? "Đổi ảnh" : "Tải ảnh lên"}
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
                  if (file) onReplace(item.id, file);
                }}
              />
            </label>
            <button
              type="button"
              disabled={busy}
              onClick={() => onDelete(item.id)}
              className={`${iconBtnClass} border-danger/40 text-danger hover:bg-danger/5`}
              aria-label="Xoá ảnh feedback"
              title="Xoá"
            >
              <Trash2 className="h-4 w-4" aria-hidden />
            </button>
          </>
        ) : null}
      </div>
    </li>
  );
}

export default function StudentGalleryEditor({
  studentId,
  editable = true,
  className = "",
  heading = "Feedback",
}: Props) {
  const headingId = useId();
  const addFileId = useId();
  const queryClient = useQueryClient();
  const queryKey = galleryApi.studentGalleryQueryKey(studentId);
  const [isEditing, setIsEditing] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const canMutate = editable && isEditing;

  const listQuery = useQuery({
    queryKey,
    queryFn: () => galleryApi.listStudentGallery(studentId),
  });

  const items = listQuery.data ?? [];

  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  const addOneImage = async (file: File) => {
    const created = await galleryApi.createStudentGalleryItem(studentId, {});
    try {
      return await galleryApi.uploadStudentGalleryImage(
        studentId,
        created.id,
        file,
      );
    } catch (error) {
      await galleryApi
        .deleteStudentGalleryItem(studentId, created.id)
        .catch(() => undefined);
      throw error;
    }
  };

  const addManyMutation = useMutation({
    mutationFn: async (files: File[]) => {
      const results = { ok: 0, failed: 0 };
      for (const file of files) {
        try {
          await addOneImage(file);
          results.ok += 1;
        } catch {
          results.failed += 1;
        }
      }
      return results;
    },
    onSuccess: async (results) => {
      await invalidate();
      if (results.failed === 0) {
        toast.success(
          results.ok === 1
            ? "Đã thêm ảnh feedback."
            : `Đã thêm ${results.ok} ảnh feedback.`,
        );
        return;
      }
      if (results.ok === 0) {
        toast.error("Không thể thêm ảnh feedback.");
        return;
      }
      toast.warning(
        `Đã thêm ${results.ok} ảnh; ${results.failed} ảnh thất bại.`,
      );
    },
    onError: () => toast.error("Không thể thêm ảnh feedback."),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      galleryApi.deleteStudentGalleryItem(studentId, id),
    onSuccess: async () => {
      await invalidate();
      toast.success("Đã xoá ảnh feedback.");
    },
    onError: () => toast.error("Không thể xoá ảnh feedback."),
  });

  const reorderMutation = useMutation({
    mutationFn: (orderedIds: string[]) =>
      galleryApi.reorderStudentGallery(studentId, { orderedIds }),
    onSuccess: async (data) => {
      queryClient.setQueryData(queryKey, data);
      toast.success("Đã cập nhật thứ tự.");
    },
    onError: async () => {
      await invalidate();
      toast.error("Không thể sắp xếp lại. Danh sách đã được tải lại.");
    },
  });

  const replaceMutation = useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) =>
      galleryApi.uploadStudentGalleryImage(studentId, id, file),
    onSuccess: async () => {
      await invalidate();
      toast.success("Đã cập nhật ảnh feedback.");
    },
    onError: () => toast.error("Không thể cập nhật ảnh feedback."),
  });

  const busy =
    addManyMutation.isPending ||
    deleteMutation.isPending ||
    reorderMutation.isPending ||
    replaceMutation.isPending;

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

  return (
    <section className={`space-y-3 ${className}`} aria-labelledby={headingId}>
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
              Feedback
            </span>
          )}
          {editable ? (
            isEditing ? (
              <button
                type="button"
                onClick={() => setIsEditing(false)}
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
                aria-label="Chỉnh sửa feedback"
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
        <p className="text-sm text-danger">Không tải được feedback.</p>
      ) : null}

      {!listQuery.isLoading && items.length === 0 ? (
        <p className="text-sm text-text-muted">Chưa có ảnh feedback nào.</p>
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
            {items.map((item) => (
              <SortableRow
                key={item.id}
                item={item}
                editable={canMutate}
                busy={busy}
                onDelete={(id) => {
                  if (window.confirm("Xoá ảnh feedback này?")) {
                    deleteMutation.mutate(id);
                  }
                }}
                onReplace={(id, file) => replaceMutation.mutate({ id, file })}
                onPreviewImage={(src) => setPreview(src)}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>

      <ImageLightbox
        open={Boolean(preview)}
        src={preview ?? ""}
        title="Ảnh feedback"
        onClose={() => setPreview(null)}
      />

      {canMutate ? (
        <label
          className={`inline-flex cursor-pointer items-center gap-2 rounded-md border border-border-default bg-primary px-3 py-2 text-sm font-medium text-text-inverse hover:bg-primary/90 ${busy ? "pointer-events-none opacity-50" : ""}`}
        >
          <Plus className="h-4 w-4" aria-hidden />
          {addManyMutation.isPending ? "Đang tải…" : "Thêm ảnh"}
          <input
            id={addFileId}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="sr-only"
            disabled={busy}
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = "";
              if (files.length > 0) addManyMutation.mutate(files);
            }}
          />
        </label>
      ) : null}
    </section>
  );
}
