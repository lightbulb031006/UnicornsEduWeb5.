"use client";

import { useMemo, useState, type ReactNode } from "react";
import { DateInput } from "@/components/ui/DateInput";
import UpgradedSelect from "@/components/ui/UpgradedSelect";
import type {
  LessonOutputStaffOption,
  LessonOutputStatus,
} from "@/dtos/lesson.dto";
import { LESSON_OUTPUT_STATUS_LABELS } from "./lessonTaskUi";
import LessonTagFilterPicker from "./LessonTagFilterPicker";

export type LessonWorkFilterDraft = {
  search: string;
  tag: string;
  outputStatus: string;
  staffId: string;
  dateFrom: string;
  dateTo: string;
};

const OUTPUT_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "Tất cả" },
  ...(
    ["pending", "completed", "cancelled"] as LessonOutputStatus[]
  ).map((value) => ({
    value,
    label: LESSON_OUTPUT_STATUS_LABELS[value],
  })),
];

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialDraft: LessonWorkFilterDraft;
  onApply: (draft: LessonWorkFilterDraft) => void;
  onClear: () => void;
  staffOptions: LessonOutputStaffOption[];
  showStaffFilter?: boolean;
  footerNote?: ReactNode | null;
};

export default function LessonWorkQuickFilters({
  open,
  onOpenChange,
  initialDraft,
  onApply,
  onClear,
  staffOptions,
  showStaffFilter = true,
  footerNote,
}: Props) {
  const [draft, setDraft] = useState(initialDraft);
  const selectedFilterTags = useMemo(
    () =>
      Array.from(
        new Set(
          draft.tag.split(/[,;]/).flatMap((item) => {
            const tag = item.trim();
            return tag ? [tag] : [];
          }),
        ),
      ),
    [draft.tag],
  );
  const activeFilterCount = useMemo(
    () =>
      [
        draft.search.trim(),
        draft.tag.trim(),
        draft.outputStatus !== "all" ? draft.outputStatus.trim() : "",
        showStaffFilter ? draft.staffId.trim() : "",
        draft.dateFrom.trim(),
        draft.dateTo.trim(),
      ].filter(Boolean).length,
    [draft, showStaffFilter],
  );
  const staffSelectOptions = [
    { value: "", label: "Tất cả nhân sự" },
    ...staffOptions.map((s) => ({
      value: s.id,
      label: s.fullName,
    })),
  ];

  const handleClear = () => {
    setDraft({
      search: "",
      tag: "",
      outputStatus: "all",
      staffId: "",
      dateFrom: "",
      dateTo: "",
    });
    onClear();
  };

  return (
    <div className="overflow-visible rounded-xl border border-border-default/50 bg-bg-secondary/40 hover:bg-bg-secondary/60 shadow-none transition-colors duration-150">
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        className="flex min-h-12 w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-medium text-text-primary transition-colors rounded-t-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface sm:px-5"
        aria-expanded={open}
      >
        <span className="truncate">Bộ lọc nhanh</span>

        <span className="inline-flex shrink-0 items-center gap-2 text-text-secondary">
          {activeFilterCount > 0 ? (
            <span className="inline-flex min-h-7 min-w-7 items-center justify-center rounded-full border border-primary/20 bg-primary/10 px-2 text-xs font-semibold text-primary">
              {activeFilterCount}
            </span>
          ) : null}
          <span className="hidden text-xs font-medium sm:inline">
            {open ? "Thu gọn" : "Mở bộ lọc"}
          </span>
          <svg
            className={`size-5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 15l7-7 7 7"
            />
          </svg>
        </span>
      </button>

      {open ? (
        <div className="space-y-4 border-t border-border-default/50 px-4 py-4 sm:px-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
              <span>Tìm kiếm</span>
              <span className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">
                  <svg
                    className="size-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                </span>
                <input
                  type="search"
                  name="lesson-work-search"
                  value={draft.search}
                  onChange={(e) =>
                    setDraft((current) => ({ ...current, search: e.target.value }))
                  }
                  placeholder="Tìm theo tên hoặc tag…"
                  autoComplete="off"
                  className="min-h-11 w-full rounded-xl border border-border-default bg-bg-surface py-2.5 pl-9 pr-3 text-sm text-text-primary shadow-sm placeholder:text-text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                />
              </span>
            </label>

            <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
              <span>Tag</span>
              <LessonTagFilterPicker
                value={selectedFilterTags}
                onChange={(next) =>
                  setDraft((current) => ({ ...current, tag: next.join(", ") }))
                }
              />
            </label>

            <div className="flex flex-col gap-1.5 text-sm text-text-secondary">
              <span>Trạng thái</span>
              <UpgradedSelect
                value={draft.outputStatus}
                onValueChange={(value) =>
                  setDraft((current) => ({
                    ...current,
                    outputStatus: value || "all",
                  }))
                }
                options={OUTPUT_FILTER_OPTIONS.map((o) => ({
                  value: o.value,
                  label: o.label,
                }))}
                ariaLabel="Trạng thái output"
                placeholder="Tất cả"
                buttonClassName="min-h-11 w-full justify-between rounded-xl border border-border-default bg-bg-surface px-3 py-2.5 text-left text-sm text-text-primary shadow-sm"
              />
            </div>

            {showStaffFilter ? (
              <div className="flex flex-col gap-1.5 text-sm text-text-secondary">
                <span>Nhân sự nhận thanh toán</span>
                <UpgradedSelect
                  value={draft.staffId}
                  onValueChange={(value) =>
                    setDraft((current) => ({ ...current, staffId: value ?? "" }))
                  }
                  options={staffSelectOptions}
                  ariaLabel="Nhân sự nhận thanh toán"
                  placeholder="Tất cả nhân sự"
                  buttonClassName="min-h-11 w-full justify-between rounded-xl border border-border-default bg-bg-surface px-3 py-2.5 text-left text-sm text-text-primary shadow-sm"
                />
              </div>
            ) : null}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
            <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
              <span>Từ ngày</span>
              <span className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">
                  <svg
                    className="size-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                </span>
                <DateInput
                  name="lesson-work-date-from"
                  value={draft.dateFrom}
                  onChange={(e) =>
                    setDraft((current) => ({
                      ...current,
                      dateFrom: e.target.value,
                    }))
                  }
                  autoComplete="off"
                  className="min-h-11 w-full rounded-xl border border-border-default bg-bg-surface py-2.5 pl-9 pr-3 text-sm text-text-primary shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                />
              </span>
            </label>

            <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
              <span>Đến ngày</span>
              <span className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">
                  <svg
                    className="size-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                </span>
                <DateInput
                  name="lesson-work-date-to"
                  value={draft.dateTo}
                  onChange={(e) =>
                    setDraft((current) => ({
                      ...current,
                      dateTo: e.target.value,
                    }))
                  }
                  autoComplete="off"
                  className="min-h-11 w-full rounded-xl border border-border-default bg-bg-surface py-2.5 pl-9 pr-3 text-sm text-text-primary shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                />
              </span>
            </label>

            <div className="flex flex-col gap-2 sm:col-span-2 sm:flex-row sm:justify-end lg:col-span-2 lg:gap-2">
              <button
                type="button"
                onClick={() => onApply(draft)}
                className="inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-4 py-2 text-sm font-medium text-text-inverse transition-colors hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
              >
                Áp dụng
              </button>
              <button
                type="button"
                onClick={handleClear}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border-default bg-bg-surface px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
              >
                <svg
                  className="size-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
                Xóa lọc
              </button>
            </div>
          </div>

          {footerNote ? <div className="hidden">{footerNote}</div> : null}
        </div>
      ) : null}
    </div>
  );
}
