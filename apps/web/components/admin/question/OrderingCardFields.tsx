"use client";

import { ArrowDown, ArrowUp, X } from "lucide-react";
import {
  ORDERING_MAX_CARDS,
  ORDERING_MIN_CARDS,
} from "@/dtos/question.dto";

const CARD_MAX_LENGTH = 200;

/**
 * Thẻ của câu sắp xếp, nhập theo ĐÚNG thứ tự — học sinh nhận thẻ đã xáo. Thẻ
 * trùng chữ được phép (vd hai thẻ 「の」); đổi chỗ chúng không làm sai bài.
 */
export default function OrderingCardFields({
  cards,
  onChange,
}: {
  cards: string[];
  onChange: (cards: string[]) => void;
}) {
  const update = (index: number, next: string) =>
    onChange(cards.map((c, i) => (i === index ? next : c)));

  const move = (from: number, to: number) => {
    const next = [...cards];
    [next[from], next[to]] = [next[to], next[from]];
    onChange(next);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2">
        <span className="text-xs font-medium text-text-muted">
          Thẻ theo đúng thứ tự ({cards.length}/{ORDERING_MAX_CARDS})
        </span>
        <span className="text-xs text-text-muted">
          Học sinh sẽ thấy thẻ đã xáo
        </span>
      </div>
      <ol className="space-y-2">
        {cards.map((card, i) => (
          <li key={i} className="flex items-center gap-1.5">
            <span className="w-6 shrink-0 text-center text-sm font-bold text-text-muted">
              {i + 1}
            </span>
            <input
              value={card}
              maxLength={CARD_MAX_LENGTH}
              onChange={(e) => update(i, e.target.value)}
              aria-label={`Thẻ ${i + 1}`}
              placeholder={`Thẻ ${i + 1}`}
              className="min-w-0 flex-1 rounded-md border border-border-default bg-bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
            />
            <button
              type="button"
              onClick={() => move(i, i - 1)}
              disabled={i === 0}
              className="inline-flex size-9 shrink-0 items-center justify-center rounded-md text-text-muted hover:bg-bg-secondary disabled:opacity-30"
              aria-label={`Đưa thẻ ${i + 1} lên`}
            >
              <ArrowUp className="size-4" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => move(i, i + 1)}
              disabled={i === cards.length - 1}
              className="inline-flex size-9 shrink-0 items-center justify-center rounded-md text-text-muted hover:bg-bg-secondary disabled:opacity-30"
              aria-label={`Đưa thẻ ${i + 1} xuống`}
            >
              <ArrowDown className="size-4" aria-hidden />
            </button>
            {cards.length > ORDERING_MIN_CARDS && (
              <button
                type="button"
                onClick={() => onChange(cards.filter((_, j) => j !== i))}
                className="inline-flex size-9 shrink-0 items-center justify-center rounded-md text-text-muted hover:bg-error/10 hover:text-error"
                aria-label={`Xoá thẻ ${i + 1}`}
              >
                <X className="size-4" aria-hidden />
              </button>
            )}
          </li>
        ))}
      </ol>
      {cards.length < ORDERING_MAX_CARDS && (
        <button
          type="button"
          onClick={() => onChange([...cards, ""])}
          className="text-sm text-primary hover:underline"
        >
          + Thêm thẻ
        </button>
      )}
    </div>
  );
}
