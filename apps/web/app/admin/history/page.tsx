"use client";

import { type UIEvent, useMemo, useRef, useState, Suspense } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { DateInput } from "@/components/ui/DateInput";
import UpgradedSelect from "@/components/ui/UpgradedSelect";
import type {
  ActionHistoryActionType,
  ActionHistoryChangedFields,
  ActionHistoryDetail,
  ActionHistoryListItem,
} from "@/dtos/action-history.dto";
import * as actionHistoryApi from "@/lib/apis/action-history.api";
import {
  formatVnDate,
  formatVnNumber,
  formatVnTime,
} from "@/lib/formatters";

const PAGE_SIZE = 20;
const EMPTY_HISTORY_ENTRIES: ActionHistoryListItem[] = [];
const UUID_PART =
  "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const SHORT_ENTITY_ID_PART = "[0-9a-f]{10}";
const SHORT_ENTITY_ID_PREFIXES = [
  "UNIST",
  "UNICL",
  "UNISTAFF",
  "UNILTK",
  "UNILRS",
  "UNILOT",
  "UNISLT",
] as const;
// Accepts short system entity IDs or bare UUIDs for other entity types.
const ENTITY_ID_PATTERN = new RegExp(
  `^(?:(?:${SHORT_ENTITY_ID_PREFIXES.join("|")})-${SHORT_ENTITY_ID_PART}|${UUID_PART})$`
);

const ACTION_LABELS: Record<ActionHistoryActionType, string> = {
  create: "Tạo mới",
  update: "Cập nhật",
  delete: "Xóa",
};

const ENTITY_LABELS: Record<string, string> = {
  user: "Người dùng",
  student: "Học sinh",
  staff: "Nhân sự",
  class: "Lớp học",
  session: "Buổi học",
  cost: "Khoản chi",
  bonus: "Khoản thưởng",
  extra_allowance: "Trợ cấp thêm",
  cf_problem_tutorial: "Tutorial CF",
};

const ENTITY_OPTIONS = [
  { value: "all", label: "Tất cả đối tượng" },
  { value: "session", label: "Buổi học" },
  { value: "class", label: "Lớp học" },
  { value: "student", label: "Học sinh" },
  { value: "staff", label: "Nhân sự" },
  { value: "user", label: "Người dùng" },
  { value: "cost", label: "Khoản chi" },
  { value: "bonus", label: "Khoản thưởng" },
  { value: "extra_allowance", label: "Trợ cấp thêm" },
  { value: "cf_problem_tutorial", label: "Tutorial CF" },
];

const ACTION_OPTIONS = [
  { value: "all", label: "Mọi thao tác" },
  { value: "create", label: "Tạo mới" },
  { value: "update", label: "Cập nhật" },
  { value: "delete", label: "Xóa" },
];

interface HistoryFilterDraft {
  entityType: string;
  actionType: string;
  entityId: string;
  startDate: string;
  endDate: string;
}

function formatDateInput(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getDefaultStartDate() {
  const date = new Date();
  date.setDate(date.getDate() - 29);
  return formatDateInput(date);
}

function getDefaultEndDate() {
  return formatDateInput(new Date());
}

function parsePage(value: string | null) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : 1;
}

function isEntityId(value: string | null | undefined): value is string {
  return !!value && ENTITY_ID_PATTERN.test(value);
}

function normalizeDateParam(value: string | null, fallback: string) {
  if (!value) {
    return fallback;
  }

  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback;
}

function normalizeSelectValue(value: string | null) {
  return value?.trim() ? value : "all";
}

function getEntityLabel(entityType: string | null | undefined) {
  if (!entityType) {
    return "Đối tượng khác";
  }

  return ENTITY_LABELS[entityType] ?? entityType.replaceAll("_", " ");
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return {
      short: value,
      date: value,
      time: "",
    };
  }

  return {
    short: new Intl.DateTimeFormat("vi-VN", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date),
    date: formatVnDate(date),
    time: formatVnTime(date),
  };
}

function formatDateLabel(value: string) {
  const matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!matched) {
    return value;
  }

  return `${matched[3]}/${matched[2]}`;
}

function formatMetricNumber(value: number) {
  return formatVnNumber(value);
}

function shortenMiddle(value: string, start = 8, end = 4) {
  if (value.length <= start + end + 1) {
    return value;
  }

  return `${value.slice(0, start)}…${value.slice(-end)}`;
}

function getActionFilterLabel(actionType: string | null | undefined) {
  if (!actionType || actionType === "all") {
    return "Mọi thao tác";
  }

  return ACTION_LABELS[actionType as ActionHistoryActionType] ?? actionType;
}

function getFilterSummaryChips(draft: HistoryFilterDraft) {
  const chips = [`${formatDateLabel(draft.startDate)} - ${formatDateLabel(draft.endDate)}`];

  if (draft.entityType !== "all") {
    chips.unshift(getEntityLabel(draft.entityType));
  }

  if (draft.actionType !== "all") {
    chips.push(getActionFilterLabel(draft.actionType));
  }

  if (draft.entityId.trim()) {
    chips.push(`ID ${shortenMiddle(draft.entityId.trim(), 6, 4)}`);
  }

  return chips;
}

function countNarrowedFilters(
  draft: HistoryFilterDraft,
  defaults: Pick<HistoryFilterDraft, "startDate" | "endDate">,
) {
  return (
    Number(draft.entityType !== "all") +
    Number(draft.actionType !== "all") +
    Number(Boolean(draft.entityId.trim())) +
    Number(draft.startDate !== defaults.startDate || draft.endDate !== defaults.endDate)
  );
}

function formatValuePreview(value: unknown) {
  if (value == null) {
    return "null";
  }

  if (typeof value === "string") {
    const compact = value.trim();
    if (!compact) {
      return '""';
    }

    return compact.length > 60 ? `${compact.slice(0, 57)}…` : compact;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return `Array(${value.length})`;
  }

  if (typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>);
    return keys.length > 0 ? `{ ${keys.slice(0, 3).join(", ")} }` : "{}";
  }

  return String(value);
}

function formatJsonBlock(value: unknown) {
  if (value == null) {
    return "null";
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function getChangedFieldEntries(changedFields: ActionHistoryChangedFields | null | undefined) {
  return Object.entries(changedFields ?? {});
}

function extractEntityNameFromSnapshot(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const candidateKeys = [
    "fullName",
    "name",
    "email",
    "accountHandle",
    "title",
    "category",
    "workType",
  ];

  for (const key of candidateKeys) {
    const candidate = record[key];
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return null;
}

function getEntryTitle(item: ActionHistoryListItem, detail?: ActionHistoryDetail) {
  const entityLabel = getEntityLabel(item.entityType);
  const entityName =
    item.entityDisplayName?.trim() ||
    extractEntityNameFromSnapshot(detail?.afterValue) ||
    extractEntityNameFromSnapshot(detail?.beforeValue);

  if (entityName) {
    return `${entityLabel}: ${entityName}`;
  }

  if (item.entityId) {
    return `${entityLabel}: ${item.entityId}`;
  }

  return entityLabel;
}

function getActionTone(actionType: ActionHistoryActionType | null | undefined) {
  if (actionType === "create") {
    return {
      marker: "bg-success",
      badge: "border-success/25 bg-success/12 text-success",
      summary: "text-success",
      previewFrom: "text-text-muted",
      previewTo: "text-success",
    };
  }

  if (actionType === "delete") {
    return {
      marker: "bg-error",
      badge: "border-error/25 bg-error/12 text-error",
      summary: "text-error",
      previewFrom: "text-text-muted",
      previewTo: "text-error",
    };
  }

  return {
    marker: "bg-primary",
    badge: "border-primary/25 bg-primary/12 text-primary",
    summary: "text-primary",
    previewFrom: "text-text-muted",
    previewTo: "text-primary",
  };
}

type SnapshotPaneName = "before" | "after";

function syncScrollablePanePosition(source: HTMLElement, target: HTMLElement) {
  const sourceVerticalRange = source.scrollHeight - source.clientHeight;
  const targetVerticalRange = target.scrollHeight - target.clientHeight;
  const sourceHorizontalRange = source.scrollWidth - source.clientWidth;
  const targetHorizontalRange = target.scrollWidth - target.clientWidth;
  const nextScrollTop =
    sourceVerticalRange > 0
      ? (source.scrollTop / sourceVerticalRange) * targetVerticalRange
      : 0;
  const nextScrollLeft =
    sourceHorizontalRange > 0
      ? (source.scrollLeft / sourceHorizontalRange) * targetHorizontalRange
      : 0;

  target.scrollTop = Number.isFinite(nextScrollTop) ? nextScrollTop : 0;
  target.scrollLeft = Number.isFinite(nextScrollLeft) ? nextScrollLeft : 0;
}

function SnapshotComparisonPanels({
  beforeValue,
  afterValue,
}: {
  beforeValue: unknown;
  afterValue: unknown;
}) {
  const beforeRef = useRef<HTMLPreElement>(null);
  const afterRef = useRef<HTMLPreElement>(null);
  const syncSourceRef = useRef<SnapshotPaneName | null>(null);

  const handlePaneScroll =
    (sourcePane: SnapshotPaneName) => (event: UIEvent<HTMLPreElement>) => {
      if (syncSourceRef.current && syncSourceRef.current !== sourcePane) {
        return;
      }

      const targetPane = sourcePane === "before" ? afterRef.current : beforeRef.current;
      if (!targetPane) {
        return;
      }

      syncSourceRef.current = sourcePane;
      syncScrollablePanePosition(event.currentTarget, targetPane);

      requestAnimationFrame(() => {
        if (syncSourceRef.current === sourcePane) {
          syncSourceRef.current = null;
        }
      });
    };

  return (
    <div className="mt-4">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-medium text-text-primary">Snapshot trước / sau</p>
        <p className="text-xs leading-5 text-text-muted">
          Cuộn một khung để khung còn lại bám theo cùng vị trí.
        </p>
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        <section className="min-w-0 rounded-xl border border-border-default bg-bg-surface p-3.5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
              Trước khi thay đổi
            </h3>
            
          </div>
          <pre
            ref={beforeRef}
            tabIndex={0}
            aria-label="Snapshot trước khi thay đổi"
            onScroll={handlePaneScroll("before")}
            className="mt-3 max-h-80 overflow-auto overscroll-contain rounded-xl bg-bg-secondary/45 p-3 text-[11px] leading-6 text-text-secondary outline-none transition focus-visible:ring-2 focus-visible:ring-border-focus"
          >
            {formatJsonBlock(beforeValue)}
          </pre>
        </section>

        <section className="min-w-0 rounded-xl border border-border-default bg-bg-surface p-3.5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
              Sau khi thay đổi
            </h3>
            
          </div>
          <pre
            ref={afterRef}
            tabIndex={0}
            aria-label="Snapshot sau khi thay đổi"
            onScroll={handlePaneScroll("after")}
            className="mt-3 max-h-80 overflow-auto overscroll-contain rounded-xl bg-bg-secondary/45 p-3 text-[11px] leading-6 text-text-primary outline-none transition focus-visible:ring-2 focus-visible:ring-border-focus"
          >
            {formatJsonBlock(afterValue)}
          </pre>
        </section>
      </div>
    </div>
  );
}

function HistoryTimelineSkeleton() {
  return (
    <div className="space-y-3 p-4 sm:p-5">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="relative pl-7 sm:pl-9">
          <div className="absolute left-0.5 top-5 size-4 rounded-full border-2 border-bg-surface bg-bg-tertiary sm:size-5 sm:border-4" />
          {index < 4 ? (
            <div className="absolute left-[8px] top-9 h-[calc(100%+1rem)] w-px bg-border-default sm:left-[10px]" />
          ) : null}
          <div className="h-44 animate-pulse rounded-xl border border-border-default bg-bg-secondary/70" />
        </div>
      ))}
    </div>
  );
}

function TimelineItem({
  item,
  isLast,
  isExpanded,
  onToggle,
}: {
  item: ActionHistoryListItem;
  isLast: boolean;
  isExpanded: boolean;
  onToggle: (id: string) => void;
}) {
  const tone = getActionTone(item.actionType);
  const changedFieldEntries = getChangedFieldEntries(item.changedFields);
  const dateTime = formatDateTime(item.createdAt);
  const detailQuery = useQuery({
    queryKey: ["action-history", "detail", item.id],
    queryFn: () => actionHistoryApi.getActionHistoryById(item.id),
    enabled: isExpanded,
    staleTime: 30_000,
  });
  const detailErrorMessage =
    (detailQuery.error as { response?: { data?: { message?: string } } })?.response
      ?.data?.message ??
    (detailQuery.error as Error | undefined)?.message ??
    "Không tải được chi tiết bản ghi lịch sử.";
  const entryTitle = getEntryTitle(item, detailQuery.data);

  return (
    <li className="relative pl-7 sm:pl-9">
      <div
        className={`absolute left-0.5 top-5 z-10 size-4 rounded-full border-2 border-bg-surface sm:size-5 sm:border-4 ${tone.marker}`}
      />
      {!isLast ? (
        <div className="absolute left-[8px] top-9 h-[calc(100%+1rem)] w-px bg-border-default sm:left-[10px]" />
      ) : null}

      <article
        className={`overflow-hidden rounded-xl border bg-bg-surface shadow-sm transition-[border-color,box-shadow,transform] duration-200 motion-hover-lift ${
          isExpanded
            ? "border-border-focus ring-1 ring-primary/10"
            : "border-border-default hover:border-border-focus/70"
        }`}
      >
        <button
          type="button"
          onClick={() => onToggle(item.id)}
          className="touch-manipulation w-full rounded-xl px-4 py-2.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus sm:px-5 sm:py-3"
          aria-expanded={isExpanded}
        >
          <div className="flex flex-col gap-2.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${tone.badge}`}
                  >
                    {item.actionType ? ACTION_LABELS[item.actionType] : "Cập nhật"}
                  </span>
                  <span className="rounded-full border border-border-default bg-bg-secondary/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                    {getEntityLabel(item.entityType)}
                  </span>
                  <span className="text-xs font-medium text-text-muted">
                    {changedFieldEntries.length} trường
                  </span>
                </div>

                <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-text-muted">
                  {dateTime.short}
                </p>

                <h2 className="mt-1 break-words text-[15px] font-semibold leading-6 text-text-primary sm:text-base">
                  {entryTitle}
                </h2>
              </div>

              <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-border-default bg-bg-surface text-text-muted">
                <svg
                  className={`size-4 transition-transform duration-200 ${
                    isExpanded ? "rotate-180" : ""
                  }`}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </span>
            </div>

            <p className="line-clamp-2 break-words text-sm leading-6 text-text-secondary">
              {item.description?.trim() || "Không có mô tả thao tác."}
            </p>

            <div className="border-t border-border-subtle pt-2 text-sm text-text-secondary">
              <span className="font-semibold text-text-primary">
                {item.userFullName?.trim() || "Không xác định"}
              </span>
              {item.userEmail?.trim() ? (
                <span className="text-text-muted">, {item.userEmail.trim()}</span>
              ) : null}
            </div>
          </div>
        </button>

        {isExpanded ? (
          <div className="border-t border-border-default bg-bg-secondary/20 px-4 py-4 sm:px-5">
            <div>
              <div className="rounded-xl border border-border-default bg-bg-surface p-3.5 sm:p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className={`text-sm font-medium ${tone.summary}`}>Trường đã thay đổi</p>
                  <span className="text-xs font-medium text-text-muted">{changedFieldEntries.length} mục</span>
                </div>

                {changedFieldEntries.length > 0 ? (
                  <div className="mt-3 space-y-2.5">
                    {changedFieldEntries.map(([field, change]) => (
                      <div
                        key={field}
                        className="rounded-xl border border-border-default bg-bg-secondary/18 px-3.5 py-3.5"
                      >
                        <p className="text-sm font-semibold text-text-primary">{field}</p>

                        <div className="mt-2 space-y-2">
                          <div className="flex flex-col gap-1">
                            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                              Trước
                            </span>
                            <p className={`break-words text-xs leading-6 ${tone.previewFrom}`}>
                              {formatValuePreview(change.old)}
                            </p>
                          </div>
                          <div className="h-px w-full bg-border-subtle" aria-hidden />
                          <div className="flex flex-col gap-1">
                            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                              Sau
                            </span>
                            <p className={`break-words text-xs font-medium leading-6 ${tone.previewTo}`}>
                              {formatValuePreview(change.new)}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-sm leading-6 text-text-muted">
                    Bản ghi này không có diff field-level để hiển thị.
                  </p>
                )}
              </div>
            </div>

            <div className="mt-4">
              {detailQuery.isLoading ? (
                <div className="grid gap-3 xl:grid-cols-2">
                  <div className="h-52 animate-pulse rounded-xl border border-border-default bg-bg-secondary" />
                  <div className="h-52 animate-pulse rounded-xl border border-border-default bg-bg-secondary" />
                </div>
              ) : detailQuery.isError ? (
                <div className="rounded-xl border border-error/20 bg-error/10 p-4 text-sm text-error">
                  {detailErrorMessage}
                </div>
              ) : detailQuery.data ? (
                <SnapshotComparisonPanels
                  beforeValue={detailQuery.data.beforeValue}
                  afterValue={detailQuery.data.afterValue}
                />
              ) : null}
            </div>
          </div>
        ) : null}
      </article>
    </li>
  );
}

function HistoryFilterCard({
  initialDraft,
  summaryChips,
  narrowedFilterCount,
  onApply,
  onReset,
}: {
  initialDraft: HistoryFilterDraft;
  summaryChips: string[];
  narrowedFilterCount: number;
  onApply: (draft: HistoryFilterDraft) => void;
  onReset: () => void;
}) {
  const [entityType, setEntityType] = useState(initialDraft.entityType);
  const [actionType, setActionType] = useState(initialDraft.actionType);
  const [entityId, setEntityId] = useState(initialDraft.entityId);
  const [startDate, setStartDate] = useState(initialDraft.startDate);
  const [endDate, setEndDate] = useState(initialDraft.endDate);

  const isEntityIdValid = entityId.trim() === "" || isEntityId(entityId.trim());
  const isDateRangeValid = startDate <= endDate;
  const canApplyFilters = isEntityIdValid && isDateRangeValid;

  return (
    <section className="overflow-hidden rounded-xl border border-border-default bg-bg-surface shadow-sm motion-fade-up">
      <div className="border-b border-border-default px-4 py-3 sm:px-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-sm font-semibold text-text-primary">Lịch sử</h1>
          <span className="text-xs text-text-muted">
            {narrowedFilterCount === 0 ? "Mặc định 30 ngày" : `${narrowedFilterCount} tiêu chí lọc`}
          </span>
        </div>

        <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
          {summaryChips.map((chip) => (
            <span
              key={chip}
              className="whitespace-nowrap rounded-full border border-border-default bg-bg-secondary/30 px-3 py-1 text-xs font-medium text-text-secondary"
            >
              {chip}
            </span>
          ))}
        </div>
      </div>

      <div className="grid gap-3 p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <label className="block rounded-xl border border-border-default bg-bg-secondary/20 p-3">
            <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
              Loại đối tượng
            </span>
            <UpgradedSelect
              name="entityType"
              value={entityType}
              onValueChange={setEntityType}
              options={ENTITY_OPTIONS}
              ariaLabel="Chọn loại đối tượng"
              buttonClassName="min-h-11 w-full rounded-lg border border-border-default bg-bg-surface px-3 py-2 text-left text-sm font-medium text-text-primary shadow-sm transition-[border-color,background-color,box-shadow] duration-200 hover:border-border-focus hover:bg-bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus touch-manipulation"
              menuClassName="rounded-xl border border-border-default bg-bg-surface p-1.5 shadow-xl"
            />
          </label>

          <label className="block rounded-xl border border-border-default bg-bg-secondary/20 p-3">
            <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
              Loại hành động
            </span>
            <UpgradedSelect
              name="actionType"
              value={actionType}
              onValueChange={setActionType}
              options={ACTION_OPTIONS}
              ariaLabel="Chọn loại hành động"
              buttonClassName="min-h-11 w-full rounded-lg border border-border-default bg-bg-surface px-3 py-2 text-left text-sm font-medium text-text-primary shadow-sm transition-[border-color,background-color,box-shadow] duration-200 hover:border-border-focus hover:bg-bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus touch-manipulation"
              menuClassName="rounded-xl border border-border-default bg-bg-surface p-1.5 shadow-xl"
            />
          </label>

          <label className="block rounded-xl border border-border-default bg-bg-secondary/20 p-3">
            <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
              Từ ngày
            </span>
            <DateInput
              name="startDate"
              autoComplete="off"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              aria-invalid={!isDateRangeValid}
              className="min-h-11 w-full rounded-lg border border-border-default bg-bg-surface px-3 py-2 text-sm text-text-primary shadow-sm outline-none transition-[border-color,box-shadow] duration-200 focus:border-border-focus focus:ring-2 focus:ring-border-focus"
            />
          </label>

          <label className="block rounded-xl border border-border-default bg-bg-secondary/20 p-3">
            <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
              Đến ngày
            </span>
            <DateInput
              name="endDate"
              autoComplete="off"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              aria-invalid={!isDateRangeValid}
              className="min-h-11 w-full rounded-lg border border-border-default bg-bg-surface px-3 py-2 text-sm text-text-primary shadow-sm outline-none transition-[border-color,box-shadow] duration-200 focus:border-border-focus focus:ring-2 focus:ring-border-focus"
            />
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end">
          <label className="block rounded-xl border border-border-default bg-bg-secondary/20 p-3">
            <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
              Entity ID exact
            </span>
            <input
              type="text"
              name="entityId"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              value={entityId}
              onChange={(event) => setEntityId(event.target.value)}
              aria-invalid={!isEntityIdValid}
              placeholder="Dán mã entity hoặc UUID…"
              className={`min-h-11 w-full rounded-lg border bg-bg-surface px-3 py-2 text-sm text-text-primary shadow-sm outline-none transition-[border-color,box-shadow] duration-200 ${
                isEntityIdValid
                  ? "border-border-default focus:border-border-focus focus:ring-2 focus:ring-border-focus"
                  : "border-error focus:border-error focus:ring-2 focus:ring-error"
              }`}
            />

            {!isEntityIdValid ? (
              <span className="mt-2 block text-xs text-error">
                Entity ID cần là mã UNIST/UNICL/UNISTAFF/UNILTK/UNILRS/UNILOT/UNISLT-xxxxxxxxxx hoặc UUID.
              </span>
            ) : !isDateRangeValid ? (
              <span className="mt-2 block text-xs text-error">
                Ngày bắt đầu phải nhỏ hơn hoặc bằng ngày kết thúc.
              </span>
            ) : (
              <span className="mt-2 block text-xs leading-5 text-text-muted">
                Filter exact-match để bám đúng query path hiện tại.
              </span>
            )}
          </label>

          <button
            type="button"
            onClick={() =>
              onApply({
                entityType,
                actionType,
                entityId,
                startDate,
                endDate,
              })
            }
            disabled={!canApplyFilters}
            className="min-h-11 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-text-inverse transition hover:bg-[var(--ue-primary-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-50 touch-manipulation"
          >
            Áp dụng
          </button>

          <button
            type="button"
            onClick={onReset}
            className="min-h-11 rounded-lg border border-border-default bg-bg-surface px-4 py-2.5 text-sm font-medium text-text-primary transition hover:bg-bg-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus touch-manipulation"
          >
            Reset
          </button>
        </div>
      </div>
    </section>
  );
}

function AdminHistoryPageContent() {
  const { replace } = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const getSearchParam = searchParams.get.bind(searchParams);
  const [expandedEntryIds, setExpandedEntryIds] = useState<string[]>([]);
  // Set: tra cứu O(1) khi render danh sách timeline dài.
  const expandedEntryIdSet = useMemo(
    () => new Set(expandedEntryIds),
    [expandedEntryIds],
  );
  const defaultStartDate = getDefaultStartDate();
  const defaultEndDate = getDefaultEndDate();

  const page = parsePage(getSearchParam("page"));
  const urlEntityType = normalizeSelectValue(getSearchParam("entityType"));
  const urlActionType = normalizeSelectValue(getSearchParam("actionType"));
  const urlEntityId = getSearchParam("entityId") ?? "";
  const urlStartDate = normalizeDateParam(getSearchParam("startDate"), defaultStartDate);
  const urlEndDate = normalizeDateParam(getSearchParam("endDate"), defaultEndDate);

  const replaceSearchParams = (params: URLSearchParams) => {
    const nextQuery = params.toString();
    replace(nextQuery ? `${pathname}?${nextQuery}` : pathname);
  };

  const listQuery = useQuery({
    queryKey: [
      "action-history",
      "list",
      page,
      PAGE_SIZE,
      urlEntityType,
      urlActionType,
      urlEntityId,
      urlStartDate,
      urlEndDate,
    ],
    queryFn: () =>
      actionHistoryApi.getActionHistoryList({
        page,
        limit: PAGE_SIZE,
        entityType: urlEntityType !== "all" ? urlEntityType : undefined,
        actionType:
          urlActionType !== "all"
            ? (urlActionType as ActionHistoryActionType)
            : undefined,
        entityId: urlEntityId.trim() || undefined,
        startDate: urlStartDate,
        endDate: urlEndDate,
      }),
    placeholderData: (previousData) => previousData,
    staleTime: 30_000,
  });

  const historyEntries = listQuery.data?.data ?? EMPTY_HISTORY_ENTRIES;
  const total = listQuery.data?.meta.total ?? 0;
  const currentPage = listQuery.data?.meta.page ?? page;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rangeStart = total === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const rangeEnd = total === 0 ? 0 : Math.min(currentPage * PAGE_SIZE, total);
  const currentFilterDraft: HistoryFilterDraft = {
    entityType: urlEntityType,
    actionType: urlActionType,
    entityId: urlEntityId,
    startDate: urlStartDate,
    endDate: urlEndDate,
  };
  const filterSummaryChips = getFilterSummaryChips(currentFilterDraft);
  const narrowedFilterCount = countNarrowedFilters(currentFilterDraft, {
    startDate: defaultStartDate,
    endDate: defaultEndDate,
  });
  const applyFilters = (draft: HistoryFilterDraft) => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("page", "1");
    setExpandedEntryIds([]);

    if (draft.entityType !== "all") {
      params.set("entityType", draft.entityType);
    } else {
      params.delete("entityType");
    }

    if (draft.actionType !== "all") {
      params.set("actionType", draft.actionType);
    } else {
      params.delete("actionType");
    }

    if (draft.entityId.trim()) {
      params.set("entityId", draft.entityId.trim());
    } else {
      params.delete("entityId");
    }

    params.set("startDate", draft.startDate);
    params.set("endDate", draft.endDate);
    replaceSearchParams(params);
  };

  const resetFilters = () => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("page", "1");
    setExpandedEntryIds([]);
    params.delete("entityType");
    params.delete("actionType");
    params.delete("entityId");
    params.set("startDate", defaultStartDate);
    params.set("endDate", defaultEndDate);
    replaceSearchParams(params);
  };

  const updatePage = (nextPage: number) => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("page", String(nextPage));
    setExpandedEntryIds([]);
    replaceSearchParams(params);
  };

  const toggleEntry = (id: string) => {
    setExpandedEntryIds((currentIds) =>
      currentIds.includes(id)
        ? currentIds.filter((currentId) => currentId !== id)
        : [...currentIds, id],
    );
  };

  const listErrorMessage =
    (listQuery.error as { response?: { data?: { message?: string } } })?.response
      ?.data?.message ??
    (listQuery.error as Error | undefined)?.message ??
    "Không tải được lịch sử thay đổi.";

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-bg-primary px-3 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-3 sm:p-6">
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 sm:gap-5">
        <HistoryFilterCard
          key={[urlEntityType, urlActionType, urlEntityId, urlStartDate, urlEndDate].join("|")}
          initialDraft={currentFilterDraft}
          summaryChips={filterSummaryChips}
          narrowedFilterCount={narrowedFilterCount}
          onApply={applyFilters}
          onReset={resetFilters}
        />

        <section className="min-w-0 flex-1 overflow-hidden rounded-xl border border-border-default bg-bg-surface shadow-sm motion-fade-up">
          {listQuery.isLoading ? (
            <HistoryTimelineSkeleton />
          ) : listQuery.isError ? (
            <div className="px-4 py-16 sm:px-5" role="alert">
              <div className="mx-auto max-w-lg rounded-2xl border border-error/20 bg-error/10 p-5 text-center text-error">
                <p className="text-sm">{listErrorMessage}</p>
              </div>
            </div>
          ) : historyEntries.length === 0 ? (
            <div className="px-4 py-16 sm:px-5">
              <div className="mx-auto max-w-md rounded-xl border border-border-default bg-bg-secondary/30 px-5 py-10 text-center text-text-muted">
                <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full border border-border-default bg-bg-surface shadow-sm">
                  <svg
                    width="30"
                    height="30"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden
                  >
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                </div>
                <p className="text-lg font-semibold text-text-primary">Chưa có lịch sử phù hợp</p>
                <p className="mt-2 text-sm leading-6">
                  Các hành động chỉnh sửa sẽ hiển thị tại đây khi có dữ liệu trùng với bộ lọc hiện
                  tại. Thử nới khoảng ngày hoặc bỏ exact `entityId`.
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="border-b border-border-default px-4 py-2.5 text-sm text-text-muted sm:px-5">
                <span aria-live="polite">
                  {formatMetricNumber(rangeStart)}-{formatMetricNumber(rangeEnd)} / {formatMetricNumber(total)}
                </span>
              </div>

              <ol className="space-y-3 p-4 sm:p-5">
                {historyEntries.map((item, index) => (
                  <TimelineItem
                    key={item.id}
                    item={item}
                    isLast={index === historyEntries.length - 1}
                    isExpanded={expandedEntryIdSet.has(item.id)}
                    onToggle={toggleEntry}
                  />
                ))}
              </ol>

              {totalPages > 1 ? (
                <nav
                  className="flex flex-col gap-3 border-t border-border-default px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5"
                  aria-label="Phân trang action history"
                >
                  <div>
                    <p className="text-sm font-medium text-text-secondary">
                      Trang {currentPage}/{totalPages}
                    </p>
                    <p className="mt-1 text-sm text-text-muted">
                      Điều hướng page nhưng vẫn giữ nguyên toàn bộ query filter hiện tại.
                    </p>
                  </div>

                  <div className="grid grid-cols-3 gap-2 sm:flex sm:items-center">
                    <button
                      type="button"
                      onClick={() => updatePage(Math.max(1, currentPage - 1))}
                      disabled={currentPage <= 1}
                      className="min-h-12 rounded-2xl border border-border-default bg-bg-surface px-3 py-3 text-sm font-medium text-text-primary transition hover:bg-bg-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-50 touch-manipulation"
                    >
                      Trước
                    </button>
                    <span className="flex min-h-12 items-center justify-center rounded-2xl border border-border-default bg-bg-secondary/50 px-4 py-3 text-sm tabular-nums text-text-secondary">
                      {currentPage}
                    </span>
                    <button
                      type="button"
                      onClick={() => updatePage(Math.min(totalPages, currentPage + 1))}
                      disabled={currentPage >= totalPages}
                      className="min-h-12 rounded-2xl border border-border-default bg-bg-surface px-3 py-3 text-sm font-medium text-text-primary transition hover:bg-bg-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-50 touch-manipulation"
                    >
                      Sau
                    </button>
                  </div>
                </nav>
              ) : null}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

export default function AdminHistoryPage() {
  // useSearchParams cần <Suspense>, nếu không Next.js sẽ bỏ static render cả route.
  return (
    <Suspense fallback={null}>
      <AdminHistoryPageContent />
    </Suspense>
  );
}
