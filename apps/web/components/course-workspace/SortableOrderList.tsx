"use client";

import { useCallback, useState, type CSSProperties, type ReactNode } from "react";
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
import { GripVertical } from "lucide-react";

export function useOrderDraft<T extends { id: string }>(
  serverItems: T[],
  resetKey: string,
) {
  const [localItems, setLocalItems] = useState<T[] | null>(null);
  const [orderDirty, setOrderDirty] = useState(false);

  // Reset ngay trong render thay vì useEffect: effect chạy sau paint nên người
  // dùng thấy một frame với draft cũ của item trước. React docs: "Adjusting some
  // state when a prop changes".
  const [prevResetKey, setPrevResetKey] = useState(resetKey);
  if (prevResetKey !== resetKey) {
    setPrevResetKey(resetKey);
    setLocalItems(null);
    setOrderDirty(false);
  }

  const items = localItems ?? serverItems;

  const discard = useCallback(() => {
    setLocalItems(null);
    setOrderDirty(false);
  }, []);

  const applyDrag = useCallback(
    (activeId: string, overId: string) => {
      const oldIndex = items.findIndex((row) => row.id === activeId);
      const newIndex = items.findIndex((row) => row.id === overId);
      if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;
      setLocalItems(arrayMove(items, oldIndex, newIndex));
      setOrderDirty(true);
    },
    [items],
  );

  return { items, orderDirty, applyDrag, discard };
}

export function OrderSaveBar({
  dirty,
  saving,
  onSave,
  onDiscard,
}: {
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  onDiscard: () => void;
}) {
  if (!dirty) return null;
  return (
    <div className="sticky bottom-0 z-10 -mx-1 flex flex-col gap-2 rounded-xl border border-primary/30 bg-bg-surface/95 p-3 shadow-sm backdrop-blur sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-text-secondary">Thứ tự đã đổi — chưa lưu.</p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onDiscard}
          disabled={saving}
          className="inline-flex min-h-11 flex-1 items-center justify-center rounded-md border border-border-default px-3 py-2 text-sm font-medium text-text-secondary hover:bg-bg-tertiary disabled:opacity-60 sm:min-h-10 sm:flex-none"
        >
          Hủy
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="inline-flex min-h-11 flex-1 items-center justify-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-text-inverse hover:bg-primary-hover disabled:opacity-60 sm:min-h-10 sm:flex-none"
        >
          {saving ? "Đang lưu…" : "Lưu thứ tự"}
        </button>
      </div>
    </div>
  );
}

export function SortableOrderList<T extends { id: string }>({
  items,
  canReorder,
  onReorder,
  children,
}: {
  items: T[];
  canReorder: boolean;
  onReorder: (activeId: string, overId: string) => void;
  children: (item: T) => ReactNode;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      if (!canReorder) return;
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      onReorder(String(active.id), String(over.id));
    },
    [canReorder, onReorder],
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={items.map((item) => item.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="flex flex-col gap-2">
          {items.map((item) => children(item))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

export function SortableRow({
  id,
  canReorder,
  rowLabel,
  onRowClick,
  menu,
  children,
}: {
  id: string;
  canReorder: boolean;
  rowLabel: string;
  onRowClick: () => void;
  menu?: ReactNode;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id, disabled: !canReorder });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.7 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="rounded-xl border border-border-default bg-bg-surface shadow-sm"
    >
      <div className="flex items-center gap-1 p-2 sm:gap-2 sm:p-3">
        {canReorder ? (
          <button
            type="button"
            className="inline-flex size-10 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-text-muted hover:bg-bg-secondary active:cursor-grabbing"
            aria-label={`Kéo để sắp xếp ${rowLabel}`}
            {...attributes}
            {...listeners}
          >
            <GripVertical className="size-4" />
          </button>
        ) : null}
        <button
          type="button"
          onClick={onRowClick}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-1 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
          aria-label={rowLabel}
        >
          {children}
        </button>
        {menu}
      </div>
    </div>
  );
}
