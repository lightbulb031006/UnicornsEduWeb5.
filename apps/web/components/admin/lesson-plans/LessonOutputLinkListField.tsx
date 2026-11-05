"use client";

import { Plus, X } from "lucide-react";

type Props = {
  label: string;
  /** Giá trị thô đang nhập (có thể chứa dòng trống); form trim + gộp trùng khi lưu. */
  links: string[];
  maxLinks: number;
  inputClassName: string;
  onChange: (links: string[]) => void;
};

/** Danh sách nhiều link (thêm / xoá từng dòng). Luôn hiện ít nhất 1 ô nhập. */
export default function LessonOutputLinkListField({
  label,
  links,
  maxLinks,
  inputClassName,
  onChange,
}: Props) {
  const rows = links.length > 0 ? links : [""];
  const canAdd = rows.length < maxLinks;

  const updateRow = (index: number, value: string) => {
    onChange(rows.map((row, rowIndex) => (rowIndex === index ? value : row)));
  };

  const removeRow = (index: number) => {
    onChange(rows.filter((_, rowIndex) => rowIndex !== index));
  };

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm text-text-secondary">
        {label} <span className="text-error">*</span>
      </legend>
      <ul className="space-y-2">
        {rows.map((row, index) => (
          <li key={index} className="flex items-center gap-2">
            <input
              type="url"
              value={row}
              onChange={(event) => updateRow(index, event.target.value)}
              className={inputClassName}
              placeholder="https://..."
              autoComplete="off"
              aria-label={`${label} ${index + 1}`}
            />
            {rows.length > 1 ? (
              <button
                type="button"
                onClick={() => removeRow(index)}
                className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl border border-border-default text-text-muted transition-colors hover:bg-bg-tertiary hover:text-error focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                aria-label={`Xoá link ${index + 1}`}
              >
                <X className="size-4" aria-hidden />
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => onChange([...rows, ""])}
        disabled={!canAdd}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2 text-sm font-medium text-primary transition-colors hover:bg-bg-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Plus className="size-4" aria-hidden />
        Thêm link
      </button>
      <p className="text-xs text-text-muted">
        Ít nhất 1 link, tối đa {maxLinks} link.
      </p>
    </fieldset>
  );
}
