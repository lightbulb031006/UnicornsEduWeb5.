"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useDebounce } from "use-debounce";
import { Badge } from "@/components/ui/badge";
import type {
  ExtraAllowanceStudentSummary,
  SaleStudentOption,
} from "@/dtos/extra-allowance.dto";
import { getMySaleStudentOptions } from "@/lib/apis/auth.api";
import { searchSaleStudentOptions } from "@/lib/apis/extra-allowance.api";

/** `self`: sale tự chọn qua /users/me; `admin`: admin / kế toán chi tạo thay. */
export type SaleStudentPickerSource = "self" | "admin";

type Props = {
  source: SaleStudentPickerSource;
  value: ExtraAllowanceStudentSummary | null;
  onChange: (student: ExtraAllowanceStudentSummary | null) => void;
  enabled?: boolean;
};

function formatStudentMeta(option: SaleStudentOption): string {
  return [option.birthYear ? String(option.birthYear) : null, option.school?.trim()]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Combobox chọn học sinh cho Trợ cấp sale. Cần search phía server nên dùng
 * listbox tự dựng thay cho UpgradedSelect.
 */
export default function SaleStudentPicker({
  source,
  value,
  onChange,
  enabled = true,
}: Props) {
  const listboxId = useId();
  const [searchInput, setSearchInput] = useState("");
  const [focused, setFocused] = useState(false);
  const [debouncedSearch] = useDebounce(searchInput.trim(), 250);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const { data: options = [], isLoading } = useQuery({
    queryKey: ["extra-allowance", "sale-student-options", source, debouncedSearch],
    queryFn: () =>
      source === "self"
        ? getMySaleStudentOptions(debouncedSearch || undefined)
        : searchSaleStudentOptions(debouncedSearch || undefined),
    enabled: enabled && focused,
    staleTime: 30_000,
  });

  const availableOptions = options.filter((option) => option.id !== value?.id);

  useEffect(() => {
    if (!focused) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setFocused(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setFocused(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [focused]);

  return (
    <div className="space-y-2">
      {value ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2.5">
          <p className="min-w-0 break-words text-sm font-semibold text-text-primary">
            {value.fullName}
          </p>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="inline-flex min-h-10 items-center justify-center rounded-full border border-border-default bg-bg-surface px-3 text-xs font-semibold text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
          >
            Đổi học sinh
          </button>
        </div>
      ) : null}

      <div className="relative" ref={containerRef}>
        <div
          className={`flex min-h-11 items-center rounded-md border bg-bg-surface px-3 ${
            focused
              ? "border-border-focus ring-2 ring-border-focus/30"
              : "border-border-default"
          }`}
        >
          <svg
            className="size-4 shrink-0 text-text-muted"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            aria-hidden
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="m21 21-4.35-4.35m1.85-5.15a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z"
            />
          </svg>
          <input
            name="extra_allowance_student_search"
            type="text"
            autoComplete="off"
            spellCheck={false}
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            onFocus={() => setFocused(true)}
            role="combobox"
            aria-expanded={focused}
            aria-haspopup="listbox"
            aria-controls={focused ? listboxId : undefined}
            aria-autocomplete="list"
            placeholder={
              value ? "Tìm học sinh khác theo họ và tên…" : "Tìm học sinh theo họ và tên…"
            }
            className="min-w-0 flex-1 bg-transparent px-2 py-2.5 text-sm text-text-primary outline-none placeholder:text-text-muted"
          />
        </div>

        {focused ? (
          <div
            id={listboxId}
            role="listbox"
            className="absolute left-0 right-0 top-full z-20 mt-1 max-h-60 overflow-y-auto rounded-xl border border-border-default bg-bg-surface py-1 shadow-lg"
          >
            {isLoading ? (
              <p className="px-3 py-2 text-sm text-text-muted" aria-live="polite">
                Đang tìm học sinh…
              </p>
            ) : availableOptions.length === 0 ? (
              <p className="px-3 py-2 text-sm text-text-muted">
                {searchInput.trim()
                  ? "Không tìm thấy học sinh phù hợp."
                  : "Nhập tên để tìm học sinh."}
              </p>
            ) : (
              availableOptions.map((option) => {
                const meta = formatStudentMeta(option);

                return (
                  <button
                    key={option.id}
                    type="button"
                    role="option"
                    aria-selected={false}
                    onClick={() => {
                      onChange({ id: option.id, fullName: option.fullName });
                      setSearchInput("");
                      setFocused(false);
                    }}
                    className="flex w-full flex-col items-start gap-1 px-3 py-2 text-left text-sm text-text-primary transition-colors hover:bg-bg-tertiary focus:bg-bg-tertiary focus:outline-none"
                  >
                    <span className="flex flex-wrap items-center gap-2 font-medium">
                      {option.fullName}
                      {option.status === "inactive" ? (
                        <Badge variant="warning">Nghỉ học</Badge>
                      ) : null}
                    </span>
                    {meta ? (
                      <span className="text-xs text-text-muted">{meta}</span>
                    ) : null}
                  </button>
                );
              })
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
