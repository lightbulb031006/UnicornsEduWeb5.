"use client";

import { Plus, X } from "lucide-react";
import {
  BLANK_ANSWER_MAX_LENGTH,
  BLANK_MARKER,
  MAX_ANSWERS_PER_BLANK,
  MAX_BLANKS,
  countBlanks,
} from "@/dtos/question.dto";
import { resizeBlankKey } from "@/lib/fill-blank";

/**
 * Đáp án hợp lệ từng ô của câu điền vào ô trống. Số ô = số `[[___]]` trong đề
 * (thứ tự xuất hiện); mỗi ô nhận nhiều đáp án — học sinh gõ trùng một đáp án
 * (bỏ khoảng trắng đầu/cuối, không phân biệt hoa/thường, số/chữ Latin toàn góc
 * = nửa góc) là đúng. Kana và kanji khác nhau phải nhập thành hai đáp án.
 */
export default function FillBlankAnswerFields({
  content,
  blankAnswerKey,
  onChange,
  onInsertBlank,
}: {
  content: string;
  blankAnswerKey: string[][];
  onChange: (blankAnswerKey: string[][]) => void;
  onInsertBlank: () => void;
}) {
  const count = countBlanks(content);
  const key = resizeBlankKey(blankAnswerKey, count);

  const setAnswers = (blank: number, answers: string[]) =>
    onChange(key.map((a, i) => (i === blank ? answers : a)));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-medium text-text-muted">
          Đáp án từng ô ({count}/{MAX_BLANKS} ô)
        </span>
        <button
          type="button"
          onClick={onInsertBlank}
          disabled={count >= MAX_BLANKS}
          className="inline-flex min-h-9 items-center gap-1 rounded-md border border-border-default px-3 text-sm text-primary hover:border-primary/50 disabled:opacity-50"
        >
          <Plus className="size-4" aria-hidden />
          Chèn ô trống
        </button>
      </div>
      {count === 0 ? (
        <p className="text-xs text-text-muted">
          Bấm “Chèn ô trống” hoặc gõ <code>{BLANK_MARKER}</code> vào đề tại chỗ
          cần điền.
        </p>
      ) : (
        <ol className="space-y-3">
          {key.map((answers, blank) => (
            <li
              key={blank}
              className="space-y-2 rounded-lg border border-border-default p-3"
            >
              <span className="text-xs font-semibold text-text-secondary">
                Ô 【{blank + 1}】
              </span>
              {answers.map((answer, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    value={answer}
                    maxLength={BLANK_ANSWER_MAX_LENGTH}
                    onChange={(e) =>
                      setAnswers(
                        blank,
                        answers.map((a, j) => (j === i ? e.target.value : a)),
                      )
                    }
                    aria-label={`Ô ${blank + 1} — đáp án ${i + 1}`}
                    placeholder={i === 0 ? "Đáp án" : "Đáp án khác (tuỳ chọn)"}
                    className="min-w-0 flex-1 rounded-md border border-border-default bg-bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                  />
                  {answers.length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        setAnswers(
                          blank,
                          answers.filter((_, j) => j !== i),
                        )
                      }
                      className="inline-flex size-9 shrink-0 items-center justify-center rounded-md text-text-muted hover:bg-error/10 hover:text-error"
                      aria-label={`Xoá đáp án ${i + 1} của ô ${blank + 1}`}
                    >
                      <X className="size-4" aria-hidden />
                    </button>
                  )}
                </div>
              ))}
              {answers.length < MAX_ANSWERS_PER_BLANK && (
                <button
                  type="button"
                  onClick={() => setAnswers(blank, [...answers, ""])}
                  className="text-sm text-primary hover:underline"
                >
                  + Thêm đáp án hợp lệ
                </button>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
