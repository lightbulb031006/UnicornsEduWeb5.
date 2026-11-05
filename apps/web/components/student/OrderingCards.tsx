"use client";

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
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Check, RotateCcw, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { isOrderCorrect, restoreOrderIndices } from "@/lib/ordering";

const CARD_CLASS =
  "inline-flex min-h-11 items-center rounded-xl border px-3 py-2 text-base sm:text-sm";

/**
 * Câu sắp xếp: chạm thẻ bên dưới để đặt vào hàng trả lời, chạm thẻ trong hàng để
 * gỡ ra; kéo thẻ trong hàng để đổi chỗ. Gửi đi dạng chữ thẻ theo thứ tự xếp.
 * Xem lại: tô từng vị trí so với thứ tự đúng và hiện thứ tự đúng.
 */
export default function OrderingCards({
  cards,
  orderAnswer,
  orderingKey,
  disabled,
  reveal,
  onChange,
}: {
  /** Thẻ đã xáo (thứ tự hiển thị). */
  cards: string[];
  orderAnswer: string[] | null | undefined;
  /** Thứ tự đúng — chỉ có khi xem lại. */
  orderingKey?: string[] | null;
  disabled: boolean;
  reveal: boolean;
  onChange: (orderAnswer: string[]) => void;
}) {
  const placed = restoreOrderIndices(cards, orderAnswer);
  const pool = cards.flatMap((_, i) => (placed.includes(i) ? [] : [i]));
  const locked = disabled || reveal;
  const key = reveal ? orderingKey : null;

  const emit = (indices: number[]) => onChange(indices.map((i) => cards[i]));

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = placed.indexOf(Number(active.id));
    const to = placed.indexOf(Number(over.id));
    if (from < 0 || to < 0) return;
    emit(arrayMove(placed, from, to));
  };

  return (
    <div className="space-y-3">
      <div
        className={cn(
          "flex min-h-14 flex-wrap items-center gap-2 rounded-xl border border-dashed p-2",
          key
            ? isOrderCorrect(orderAnswer, key)
              ? "border-success"
              : "border-error"
            : "border-border-default",
        )}
        aria-label="Hàng trả lời"
      >
        {placed.length === 0 ? (
          <span className="px-1 text-sm text-text-muted">
            {locked ? "Chưa xếp thẻ nào" : "Chạm thẻ bên dưới để xếp vào đây"}
          </span>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={placed.map(String)}
              strategy={rectSortingStrategy}
            >
              {placed.map((cardIndex, pos) => (
                <PlacedCard
                  key={cardIndex}
                  id={String(cardIndex)}
                  text={cards[cardIndex]}
                  locked={locked}
                  verdict={
                    key ? (key[pos] === cards[cardIndex] ? "right" : "wrong") : null
                  }
                  onRemove={() => emit(placed.filter((i) => i !== cardIndex))}
                />
              ))}
            </SortableContext>
          </DndContext>
        )}
      </div>

      {!locked && (
        <div className="flex flex-wrap items-center gap-2">
          {pool.map((cardIndex) => (
            <button
              key={cardIndex}
              type="button"
              onClick={() => emit([...placed, cardIndex])}
              className={cn(
                CARD_CLASS,
                "border-border-default bg-bg-surface text-text-primary hover:border-primary/50",
              )}
            >
              {cards[cardIndex]}
            </button>
          ))}
          {placed.length > 0 && (
            <button
              type="button"
              onClick={() => emit([])}
              className="inline-flex min-h-11 items-center gap-1 px-2 text-sm text-text-muted hover:text-primary"
            >
              <RotateCcw className="size-4" aria-hidden />
              Xếp lại
            </button>
          )}
        </div>
      )}

      {key && !isOrderCorrect(orderAnswer, key) && (
        <p className="text-xs text-text-muted">
          Thứ tự đúng:{" "}
          <span className="font-medium text-success">{key.join(" → ")}</span>
        </p>
      )}
    </div>
  );
}

function PlacedCard({
  id,
  text,
  locked,
  verdict,
  onRemove,
}: {
  id: string;
  text: string;
  locked: boolean;
  verdict: "right" | "wrong" | null;
  onRemove: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled: locked });

  return (
    <button
      ref={setNodeRef}
      type="button"
      disabled={locked && verdict === null}
      onClick={locked ? undefined : onRemove}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      {...attributes}
      {...listeners}
      aria-label={locked ? text : `${text} — chạm để gỡ, kéo để đổi chỗ`}
      className={cn(
        CARD_CLASS,
        "gap-1",
        !locked && "touch-none border-primary bg-primary/5 text-text-primary",
        isDragging && "z-10 shadow-md",
        verdict === "right" && "border-success bg-success/5 text-success",
        verdict === "wrong" && "border-error bg-error/5 text-error",
        locked && verdict === null && "border-border-default text-text-secondary",
      )}
    >
      {verdict === "right" && <Check className="size-3.5" aria-hidden />}
      {verdict === "wrong" && <X className="size-3.5" aria-hidden />}
      {text}
    </button>
  );
}
