"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  useDeferredValue,
  useState,
  type ReactNode,
  type SyntheticEvent,
} from "react";
import { toast } from "sonner";
import { DateInput } from "@/components/ui/DateInput";
import UpgradedSelect from "@/components/ui/UpgradedSelect";
import type {
  CreateLessonOutputPayload,
  LessonOutputItem,
  LessonPaymentStatus,
  LessonOutputStaffOption,
  LessonOutputStatus,
  LessonUpsertMode,
} from "@/dtos/lesson.dto";
import * as lessonApi from "@/lib/apis/lesson.api";
import {
  LESSON_PAYMENT_STATUS_OPTIONS,
  LESSON_PAYMENT_STATUS_LABELS,
  formatLessonStaffRoleLabel,
  formatLessonStaffStatusLabel,
  LESSON_OUTPUT_STATUS_LABELS,
  lessonPaymentStatusChipClass,
  lessonOutputStatusChipClass,
} from "./lessonTaskUi";
import LessonTagPicker from "./LessonTagPicker";

type TaskContext = {
  id: string;
  title: string | null;
} | null;

type Props = {
  mode: LessonUpsertMode;
  initialData?: LessonOutputItem | null;
  initialTask?: TaskContext;
  /** Khi `false`, ẩn khối “Parent Task” (dùng tab Công việc — chọn task ở ngoài). */
  showParentTaskBanner?: boolean;
  /** Khi `true`, ẩn toàn bộ khối gán nhân sự (tab Công việc — Thêm bài mới). */
  hideStaffFields?: boolean;
  /** Khi `true`, vẫn dùng shared layout của task detail dù đang ở chế độ taskless. */
  forceSharedLayout?: boolean;
  /** Khi `true`, cho phép submit không có `lessonTaskId` (gửi `null`). */
  allowTasklessOutput?: boolean;
  /** Khi `false`, ẩn dropdown thanh toán và giữ `paymentStatus` hiện tại. */
  allowPaymentStatusEdit?: boolean;
  /** Khi `false`, giữ nguyên `cost` hiện tại và chỉ hiển thị read-only. */
  allowCostEdit?: boolean;
  isSubmitting?: boolean;
  onCancel?: () => void;
  onSubmit: (payload: CreateLessonOutputPayload) => Promise<void> | void;
  submitLabel?: string;
  footerLeadingActions?: ReactNode;
};

const STATUS_OPTIONS: { value: LessonOutputStatus; label: string }[] = [
  {
    value: "pending",
    label: LESSON_OUTPUT_STATUS_LABELS.pending,
  },
  {
    value: "completed",
    label: LESSON_OUTPUT_STATUS_LABELS.completed,
  },
  {
    value: "cancelled",
    label: LESSON_OUTPUT_STATUS_LABELS.cancelled,
  },
];

const LEVEL_VALUES = [
  "",
  "Level 0",
  "Level 1",
  "Level 2",
  "Level 3",
  "Level 4",
  "Level 5",
] as const;

function getSubmitLabel(mode: LessonUpsertMode, submitLabel?: string) {
  if (submitLabel) {
    return submitLabel;
  }

  return mode === "create" ? "Tạo output" : "Lưu thay đổi";
}

function normalizeSelectedStaff(
  value: LessonOutputItem["staff"] | null | undefined,
): LessonOutputStaffOption | null {
  if (!value) {
    return null;
  }

  return {
    id: value.id,
    fullName: value.fullName,
    roles: value.roles,
    status: value.status,
  };
}

function StaffCard({
  staff,
  onClear,
}: {
  staff: LessonOutputStaffOption;
  onClear?: () => void;
}) {
  return (
    <article className="rounded-2xl border border-border-default bg-bg-secondary/70 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-text-primary">
            {staff.fullName}
          </p>
          <p className="mt-1 text-xs text-text-secondary">
            {formatLessonStaffRoleLabel(staff.roles)}
          </p>
          <p className="mt-2 text-xs text-text-muted">
            {formatLessonStaffStatusLabel(staff.status)}
          </p>
        </div>

        {onClear ? (
          <button
            type="button"
            onClick={onClear}
            className="rounded-full border border-border-default bg-bg-surface px-3 py-1 text-xs font-medium text-text-secondary transition-colors hover:bg-bg-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
          >
            Bỏ chọn
          </button>
        ) : null}
      </div>
    </article>
  );
}

function fieldInputClass() {
  return "min-h-11 w-full rounded-xl border border-border-default bg-bg-surface px-3 py-2.5 text-sm text-text-primary shadow-sm placeholder:text-text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus";
}

function selectButtonClass() {
  return "min-h-11 rounded-xl border border-border-default bg-[linear-gradient(180deg,color-mix(in_srgb,var(--ue-bg-surface)_96%,transparent),color-mix(in_srgb,var(--ue-bg-secondary)_74%,transparent))] px-3 py-2.5 text-sm text-text-primary shadow-sm transition-all duration-200 hover:border-primary/25 hover:bg-bg-secondary/65 focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus";
}

function selectMenuClass() {
  return "overflow-auto rounded-[1.2rem] border border-border-default bg-bg-surface/96 p-1.5 shadow-[0_28px_68px_-30px_color-mix(in_srgb,var(--ue-text-primary)_50%,transparent)] backdrop-blur-sm";
}

function DropdownLabel({
  eyebrow,
  title,
  hint,
  badge,
}: {
  eyebrow?: string;
  title: string;
  hint?: string;
  badge?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-start gap-3">
      {badge ? <div className="pt-0.5">{badge}</div> : null}
      <div className="min-w-0">
        {eyebrow ? (
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
            {eyebrow}
          </div>
        ) : null}
        <div className="truncate text-sm font-semibold text-text-primary">{title}</div>
        {hint ? (
          <div className="mt-0.5 text-xs leading-5 text-text-muted">{hint}</div>
        ) : null}
      </div>
    </div>
  );
}

function CompactDropdownValue({
  title,
  badge,
}: {
  title: string;
  badge?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      {badge ? <div className="shrink-0">{badge}</div> : null}
      <div className="truncate text-sm font-medium text-text-primary">{title}</div>
    </div>
  );
}

function levelBadgeClass(level: string) {
  if (!level.trim()) {
    return "border-border-default bg-bg-secondary text-text-secondary";
  }

  return "border-primary/20 bg-primary/10 text-primary";
}

const LEVEL_OPTIONS = LEVEL_VALUES.map((value) => {
  const hasValue = value.trim().length > 0;
  const title = hasValue ? value : "Không gắn level";
  const hint = "";

  return {
    value,
    label: (
      <DropdownLabel
        eyebrow="Level"
        title={title}
        hint={hint}
        badge={
          <span
            className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${levelBadgeClass(
              value,
            )}`}
          >
            {hasValue ? value.replace("Level ", "L") : "None"}
          </span>
        }
      />
    ),
    selectedLabel: (
      <CompactDropdownValue
        title={title}
        badge={
          <span
            className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${levelBadgeClass(
              value,
            )}`}
          >
            {hasValue ? value.replace("Level ", "L") : "None"}
          </span>
        }
      />
    ),
  };
});

const STATUS_SELECT_OPTIONS = STATUS_OPTIONS.map((option) => ({
  value: option.value,
  label: (
    <DropdownLabel
      // eyebrow="Workflow"
      // title={option.label}
      title=""
      hint=""
      badge={
        <span
          className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ring-1 ${lessonOutputStatusChipClass(
            option.value,
          )}`}
        >
          {option.label}
        </span>
      }
    />
  ),
  selectedLabel: (
    <CompactDropdownValue
      title={option.label}
      badge={
        <span
          className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ring-1 ${lessonOutputStatusChipClass(
            option.value,
          )}`}
        >
          {option.label}
        </span>
      }
    />
  ),
}));

const PAYMENT_SELECT_OPTIONS = LESSON_PAYMENT_STATUS_OPTIONS.map((option) => ({
  value: option.value,
  label: (
    <DropdownLabel
      // eyebrow="Payment"
      // title={typeof option.label === "string" ? option.label : LESSON_PAYMENT_STATUS_LABELS[option.value as LessonPaymentStatus]}
      title=""
      hint=""
      badge={
        <span
          className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ring-1 ${lessonPaymentStatusChipClass(
            option.value as LessonPaymentStatus,
          )}`}
        >
          {LESSON_PAYMENT_STATUS_LABELS[option.value as LessonPaymentStatus]}
        </span>
      }
    />
  ),
  selectedLabel: (
    <CompactDropdownValue
      title={LESSON_PAYMENT_STATUS_LABELS[option.value as LessonPaymentStatus]}
      badge={
        <span
          className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ring-1 ${lessonPaymentStatusChipClass(
            option.value as LessonPaymentStatus,
          )}`}
        >
          {LESSON_PAYMENT_STATUS_LABELS[option.value as LessonPaymentStatus]}
        </span>
      }
    />
  ),
}));

function formatCurrency(value: number) {
  return new Intl.NumberFormat("vi-VN").format(value);
}

export default function LessonOutputEditorForm({
  mode,
  initialData,
  initialTask = null,
  showParentTaskBanner = true,
  hideStaffFields = false,
  forceSharedLayout = false,
  allowTasklessOutput = false,
  allowPaymentStatusEdit = true,
  allowCostEdit = true,
  isSubmitting = false,
  onCancel,
  onSubmit,
  submitLabel,
  footerLeadingActions,
}: Props) {
  const useCompactTasklessLayout = hideStaffFields && !forceSharedLayout;
  const lessonTaskId = initialData?.lessonTaskId ?? initialTask?.id ?? "";
  const lessonTaskTitle = initialData?.task?.title ?? initialTask?.title ?? null;
  const hasParentTask = lessonTaskId.trim().length > 0;
  const [lessonName, setLessonName] = useState(
    () => initialData?.lessonName ?? "",
  );
  const [contestUploaded, setContestUploaded] = useState(
    () => initialData?.contestUploaded ?? "",
  );
  const [date, setDate] = useState(() => initialData?.date ?? "");
  const [status, setStatus] = useState<LessonOutputStatus>(
    () => initialData?.status ?? "pending",
  );
  const [paymentStatus, setPaymentStatus] = useState<LessonPaymentStatus>(
    () => initialData?.paymentStatus ?? "pending",
  );
  const [cost, setCost] = useState(() => String(initialData?.cost ?? 0));
  const [level, setLevel] = useState(() => initialData?.level ?? "");
  const [source, setSource] = useState(() => initialData?.source ?? "");
  const [originalTitle, setOriginalTitle] = useState(
    () => initialData?.originalTitle ?? "",
  );
  const [originalLink, setOriginalLink] = useState(
    () => initialData?.originalLink ?? "",
  );
  const [link, setLink] = useState(() => initialData?.link ?? "");
  const [selectedTags, setSelectedTags] = useState<string[]>(
    () => initialData?.tags ?? [],
  );
  const [tagChecker, setTagChecker] = useState(
    () => (initialData?.tags ?? []).some((tag) => tag.trim().toLowerCase() === "checker"),
  );
  const [tagCode, setTagCode] = useState(
    () => (initialData?.tags ?? []).some((tag) => tag.trim().toLowerCase() === "code"),
  );
  const [staffSearch, setStaffSearch] = useState("");
  const [selectedStaff, setSelectedStaff] = useState<LessonOutputStaffOption | null>(
    () => normalizeSelectedStaff(initialData?.staff),
  );

  const deferredStaffSearch = useDeferredValue(staffSearch.trim());
  const { data: staffOptions = [] } = useQuery<LessonOutputStaffOption[]>({
      queryKey: ["lesson", "output-staff-options", deferredStaffSearch],
      queryFn: () =>
        lessonApi.searchLessonOutputStaffOptions({
          search: deferredStaffSearch || undefined,
          limit: 4,
        }),
      placeholderData: keepPreviousData,
    });

  const validateOptionalUrl = (value: string, label: string) => {
    const trimmedValue = value.trim();
    if (!trimmedValue) {
      return true;
    }

    try {
      const url = new URL(trimmedValue);
      if (!["http:", "https:"].includes(url.protocol)) {
        toast.error(`${label} phải bắt đầu bằng http hoặc https.`);
        return false;
      }

      return true;
    } catch {
      toast.error(`${label} không hợp lệ.`);
      return false;
    }
  };

  const handleSubmit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedLessonName = lessonName.trim();
    if (!allowTasklessOutput && !lessonTaskId.trim()) {
      toast.error("Không xác định được task cha cho lesson output.");
      return;
    }

    if (!trimmedLessonName) {
      toast.error("Tên bài là bắt buộc.");
      return;
    }

    if (hideStaffFields) {
      if (!originalLink.trim()) {
        toast.error("Link gốc là bắt buộc.");
        return;
      }
      if (!originalTitle.trim()) {
        toast.error("Tên gốc là bắt buộc.");
        return;
      }
      if (!source.trim()) {
        toast.error("Nguồn là bắt buộc.");
        return;
      }
    }

    if (!date.trim()) {
      toast.error("Ngày tạo output là bắt buộc.");
      return;
    }

    const enrichedTags = Array.from(new Set([
      ...selectedTags,
      ...(tagChecker ? ["Checker"] : []),
      ...(tagCode ? ["Code"] : []),
    ]));

    if (enrichedTags.length === 0) {
      toast.error("Vui lòng chọn ít nhất một tag.");
      return;
    }

    if (!link.trim()) {
      toast.error("Link output là bắt buộc.");
      return;
    }

    if (
      !validateOptionalUrl(originalLink, "Link gốc") ||
      !validateOptionalUrl(link, "Link output")
    ) {
      return;
    }

    const parsedCost = Number(cost.trim() || "0");
    if (allowCostEdit && (!Number.isInteger(parsedCost) || parsedCost < 0)) {
      toast.error("Chi phí phải là số nguyên không âm.");
      return;
    }

    const resolvedTaskId = allowTasklessOutput
      ? lessonTaskId.trim() || null
      : lessonTaskId.trim();

    const payload: CreateLessonOutputPayload = {
      lessonTaskId: resolvedTaskId,
      lessonName: trimmedLessonName,
      originalTitle: originalTitle.trim() || null,
      source: source.trim() || null,
      originalLink: originalLink.trim() || null,
      level: level.trim() || null,
      tags: enrichedTags,
      date: date.trim(),
      contestUploaded: contestUploaded.trim() || null,
      link: link.trim() || null,
      status,
    };

    if (allowPaymentStatusEdit) {
      payload.paymentStatus = paymentStatus;
    }

    if (!hideStaffFields) {
      payload.staffId = selectedStaff?.id ?? null;
    }

    if (allowCostEdit) {
      payload.cost = parsedCost;
    }

    await onSubmit(payload);
  };

  if (useCompactTasklessLayout) {
    const parsedCost = Number(cost.trim() || "0");
    const displayCost = Number.isFinite(parsedCost) ? Math.max(0, parsedCost) : 0;

    return (
      <form onSubmit={handleSubmit} className="space-y-4">
        <section className="rounded-lg border border-border-default bg-bg-surface p-3 sm:p-4">
          <div className="grid grid-cols-1 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm text-text-secondary">
                Tên bài <span className="text-error">*</span>
              </span>
              <input
                type="text"
                value={lessonName}
                onChange={(event) => setLessonName(event.target.value)}
                className={fieldInputClass()}
                placeholder="Tên bài giáo án"
                autoComplete="off"
                required
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm text-text-secondary">
                Link gốc <span className="text-error">*</span>
              </span>
              <input
                type="url"
                value={originalLink}
                onChange={(event) => setOriginalLink(event.target.value)}
                className={fieldInputClass()}
                placeholder="https://..."
                autoComplete="off"
                required
              />
            </label>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm text-text-secondary">
                  Tên gốc <span className="text-error">*</span>
                </span>
                <input
                  type="text"
                  value={originalTitle}
                  onChange={(event) => setOriginalTitle(event.target.value)}
                  className={fieldInputClass()}
                  placeholder="Tên bài gốc"
                  autoComplete="off"
                  required
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm text-text-secondary">
                  Nguồn <span className="text-error">*</span>
                </span>
                <input
                  type="text"
                  value={source}
                  onChange={(event) => setSource(event.target.value)}
                  className={fieldInputClass()}
                  placeholder="codeforces, Unicorns, …"
                  autoComplete="off"
                  required
                />
              </label>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm text-text-secondary">
                  Tag <span className="text-error">*</span>
                </span>
                <LessonTagPicker
                  value={selectedTags}
                  onChange={setSelectedTags}
                  placeholder="Tìm kiếm và chọn tag…"
                />
              </label>
              <div className="flex flex-col gap-1.5">
                <span className="text-sm text-text-secondary">Level</span>
                <UpgradedSelect
                  value={level}
                  onValueChange={(value) => setLevel((value ?? "").trim())}
                  options={LEVEL_OPTIONS}
                  ariaLabel="Level"
                  placeholder="Chọn level"
                  buttonClassName={`${selectButtonClass()} flex items-center justify-between text-left`}
                  menuClassName={selectMenuClass()}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:items-start">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm text-text-secondary">
                  Ngày <span className="text-error">*</span>
                </span>
                <DateInput
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                  className={fieldInputClass()}
                  required
                />
              </label>
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-1">
                  <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-text-primary">
                    <input
                      type="checkbox"
                      checked={tagChecker}
                      onChange={(event) => setTagChecker(event.target.checked)}
                      className="size-4 rounded border-border-default text-primary focus:ring-border-focus"
                    />
                    Checker
                  </label>
                  <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-text-primary">
                    <input
                      type="checkbox"
                      checked={tagCode}
                      onChange={(event) => setTagCode(event.target.checked)}
                      className="size-4 rounded border-border-default text-primary focus:ring-border-focus"
                    />
                    Code
                  </label>
                </div>

                <label className="flex flex-col gap-1.5">
                  <span className="text-sm text-text-secondary">Chi phí</span>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={cost}
                    onChange={(event) => setCost(event.target.value)}
                    readOnly={!allowCostEdit}
                    aria-readonly={!allowCostEdit}
                    className={`${fieldInputClass()} ${allowCostEdit ? "" : "cursor-not-allowed bg-bg-secondary/55 text-text-muted"}`}
                    inputMode="numeric"
                  />
                  <span className="text-sm font-semibold text-text-primary">
                    {formatCurrency(displayCost)} đ
                  </span>
                  {!allowCostEdit ? (
                    <span className="text-xs text-text-muted">
                      Chi phí đang bị khóa trong popup này.
                    </span>
                  ) : null}
                </label>
              </div>
            </div>

            {allowPaymentStatusEdit ? (
              <label className="flex flex-col gap-1.5">
                <span className="text-sm text-text-secondary">Trạng thái</span>
                <UpgradedSelect
                  name="paymentStatus"
                  value={paymentStatus}
                  onValueChange={(value) => setPaymentStatus(value as LessonPaymentStatus)}
                  options={PAYMENT_SELECT_OPTIONS}
                  ariaLabel="Trạng thái thanh toán output"
                  buttonClassName={`${selectButtonClass()} flex items-center justify-between text-left`}
                  menuClassName={selectMenuClass()}
                />
              </label>
            ) : null}

            <label className="flex flex-col gap-1.5">
              <span className="text-sm text-text-secondary">Contest</span>
              <textarea
                value={contestUploaded}
                onChange={(event) => setContestUploaded(event.target.value)}
                className={`${fieldInputClass()} min-h-[6rem] resize-y py-3`}
                rows={4}
                placeholder="VD: Bài đã đưa vào contest ABC…"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm text-text-secondary">
                Link output <span className="text-error">*</span>
              </span>
              <input
                type="url"
                value={link}
                onChange={(event) => setLink(event.target.value)}
                className={fieldInputClass()}
                placeholder="https://..."
                autoComplete="off"
                required
              />
            </label>
          </div>
        </section>

        <div
          className={`border-t border-border-default pt-4 ${footerLeadingActions
            ? "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
            : "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"
            }`}
        >
          {footerLeadingActions ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              {footerLeadingActions}
            </div>
          ) : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            {onCancel ? (
              <button
                type="button"
                onClick={onCancel}
                disabled={isSubmitting}
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border-default bg-bg-surface px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-bg-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:opacity-60"
              >
                Hủy
              </button>
            ) : null}
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-4 py-2 text-sm font-medium text-text-inverse transition-colors hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:opacity-60"
            >
              {isSubmitting ? "Đang lưu…" : getSubmitLabel(mode, submitLabel)}
            </button>
          </div>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {showParentTaskBanner ? (
        <section className="rounded-[1.5rem] border border-border-default bg-bg-secondary/45 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-text-muted">
                Parent Task
              </p>
              <p className="mt-2 text-lg font-semibold text-text-primary">
                {hasParentTask
                  ? (lessonTaskTitle ?? "Task chưa đặt tên")
                  : "Chưa gắn công việc"}
              </p>
              <p className="mt-1 text-xs text-text-muted">
                {hasParentTask
                  ? `Task ID: ${lessonTaskId}`
                  : "Sản phẩm này đang được quản lý độc lập ngoài task."}
              </p>
            </div>

            <span
              className={`inline-flex h-fit rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ring-1 ${lessonOutputStatusChipClass(
                status,
              )}`}
            >
              {LESSON_OUTPUT_STATUS_LABELS[status]}
            </span>
          </div>
          <div className="mt-3">
            <span
              className={`inline-flex h-fit rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ring-1 ${lessonPaymentStatusChipClass(
                paymentStatus,
              )}`}
            >
              {LESSON_PAYMENT_STATUS_LABELS[paymentStatus]}
            </span>
          </div>
        </section>
      ) : null}

      <section
        className={
          hideStaffFields
            ? "space-y-4"
            : "grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(20rem,0.95fr)]"
        }
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm text-text-secondary sm:col-span-2">
              <span>Tên bài</span>
              <input
                type="text"
                value={lessonName}
                onChange={(event) => setLessonName(event.target.value)}
                placeholder="Ví dụ: Bài 1 - Tổ hợp cơ bản"
                className="min-h-11 rounded-xl border border-border-default bg-bg-surface px-3 py-2.5 text-text-primary shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                required
              />
            </label>

            <label className="flex flex-col gap-1 text-sm text-text-secondary">
              <span>Contest uploaded</span>
              <input
                type="text"
                value={contestUploaded}
                onChange={(event) => setContestUploaded(event.target.value)}
                placeholder="Ví dụ: Vĩnh Phúc HSG 2024"
                className="min-h-11 rounded-xl border border-border-default bg-bg-surface px-3 py-2.5 text-text-primary shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
              />
            </label>

            <label className="flex flex-col gap-1 text-sm text-text-secondary">
              <span>Ngày</span>
              <DateInput
                value={date}
                onChange={(event) => setDate(event.target.value)}
                className="min-h-11 rounded-xl border border-border-default bg-bg-surface px-3 py-2.5 text-text-primary shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                required
              />
            </label>

            <label className="flex flex-col gap-1 text-sm text-text-secondary">
              <span>Trạng thái</span>
              <UpgradedSelect
                name="status"
                value={status}
                onValueChange={(value) => setStatus(value as LessonOutputStatus)}
                options={STATUS_SELECT_OPTIONS}
                ariaLabel="Trạng thái lesson output"
                placeholder="Chọn trạng thái"
                buttonClassName={`${selectButtonClass()} flex items-center justify-between text-left`}
                menuClassName={selectMenuClass()}
              />
            </label>

            {allowPaymentStatusEdit ? (
              <label className="flex flex-col gap-1 text-sm text-text-secondary">
                <span>Thanh toán</span>
                <UpgradedSelect
                  name="paymentStatus"
                  value={paymentStatus}
                  onValueChange={(value) => setPaymentStatus(value as LessonPaymentStatus)}
                  options={PAYMENT_SELECT_OPTIONS}
                  ariaLabel="Trạng thái thanh toán output"
                  placeholder="Chọn trạng thái thanh toán"
                  buttonClassName={`${selectButtonClass()} flex items-center justify-between text-left`}
                  menuClassName={selectMenuClass()}
                />
              </label>
            ) : null}

            <label className="flex flex-col gap-1 text-sm text-text-secondary">
              <span>Chi phí</span>
              <input
                type="number"
                min={0}
                step={1}
                value={cost}
                onChange={(event) => setCost(event.target.value)}
                readOnly={!allowCostEdit}
                aria-readonly={!allowCostEdit}
                placeholder="0"
                className={`min-h-11 rounded-xl border border-border-default bg-bg-surface px-3 py-2.5 text-text-primary shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${allowCostEdit ? "" : "cursor-not-allowed bg-bg-secondary/55 text-text-muted"}`}
              />
              <span className="text-xs text-text-muted">
                {allowCostEdit
                  ? "Chi phí trợ cấp vẫn được giữ nguyên khi đã thanh toán."
                  : "Chi phí đang ở chế độ chỉ xem và không thể chỉnh từ popup này."}
              </span>
            </label>

            <label className="flex flex-col gap-1 text-sm text-text-secondary">
              <span>Level</span>
              <UpgradedSelect
                name="level"
                value={level}
                onValueChange={(value) => setLevel((value ?? "").trim())}
                options={LEVEL_OPTIONS}
                ariaLabel="Level lesson output"
                placeholder="Chọn level"
                buttonClassName={`${selectButtonClass()} flex items-center justify-between text-left`}
                menuClassName={selectMenuClass()}
              />
            </label>

            <label className="flex flex-col gap-1 text-sm text-text-secondary">
              <span>
                Nguồn
                {hideStaffFields ? <span className="text-error"> *</span> : null}
              </span>
              <input
                type="text"
                value={source}
                onChange={(event) => setSource(event.target.value)}
                placeholder="Ví dụ: Vĩnh Phúc HSG 2024"
                className="min-h-11 rounded-xl border border-border-default bg-bg-surface px-3 py-2.5 text-text-primary shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                required={hideStaffFields}
              />
            </label>

            <label className="flex flex-col gap-1 text-sm text-text-secondary sm:col-span-2">
              <span>
                Original title
                {hideStaffFields ? <span className="text-error"> *</span> : null}
              </span>
              <input
                type="text"
                value={originalTitle}
                onChange={(event) => setOriginalTitle(event.target.value)}
                placeholder="Tên bài gốc hoặc tên trong đề nguồn"
                className="min-h-11 rounded-xl border border-border-default bg-bg-surface px-3 py-2.5 text-text-primary shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                required={hideStaffFields}
              />
            </label>

            <label className="flex flex-col gap-1 text-sm text-text-secondary sm:col-span-2">
              <span>
                Link gốc
                {hideStaffFields ? <span className="text-error"> *</span> : null}
              </span>
              <input
                type="url"
                value={originalLink}
                onChange={(event) => setOriginalLink(event.target.value)}
                placeholder="https://..."
                className="min-h-11 rounded-xl border border-border-default bg-bg-surface px-3 py-2.5 text-text-primary shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                required={hideStaffFields}
              />
            </label>

            <label className="flex flex-col gap-1 text-sm text-text-secondary sm:col-span-2">
              <span>
                Link output <span className="text-error">*</span>
              </span>
              <input
                type="url"
                value={link}
                onChange={(event) => setLink(event.target.value)}
                placeholder="https://..."
                className="min-h-11 rounded-xl border border-border-default bg-bg-surface px-3 py-2.5 text-text-primary shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                required
              />
            </label>

            <label className="flex flex-col gap-1 text-sm text-text-secondary sm:col-span-2">
              <span>
                Tags <span className="text-error">*</span>
              </span>
              <LessonTagPicker
                value={selectedTags}
                onChange={setSelectedTags}
                placeholder="Tìm kiếm và chọn tag…"
              />
            </label>

            {hideStaffFields ? (
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 sm:col-span-2">
                <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-text-primary">
                  <input
                    type="checkbox"
                    checked={tagChecker}
                    onChange={(event) => setTagChecker(event.target.checked)}
                    className="size-4 rounded border-border-default text-primary focus:ring-border-focus"
                  />
                  Checker
                </label>
                <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-text-primary">
                  <input
                    type="checkbox"
                    checked={tagCode}
                    onChange={(event) => setTagCode(event.target.checked)}
                    className="size-4 rounded border-border-default text-primary focus:ring-border-focus"
                  />
                  Code
                </label>
              </div>
            ) : null}
          </div>
        </div>

        {hideStaffFields ? null : (
          <div className="space-y-4">
            <section className="rounded-[1.5rem] border border-border-default bg-bg-secondary/50 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-text-primary">
                    Nhân sự nhận thanh toán
                  </p>
                  <p className="mt-1 text-xs leading-5 text-text-secondary">
                    Người đứng tên chi phí và thanh toán cho output này.
                  </p>
                </div>
              </div>

              <div className="mt-3">
                {selectedStaff ? (
                  <StaffCard
                    staff={selectedStaff}
                    onClear={() => setSelectedStaff(null)}
                  />
                ) : (
                  <div className="rounded-2xl border border-dashed border-border-default bg-bg-surface px-4 py-5 text-sm text-text-muted">
                    Chưa gán nhân sự nhận thanh toán cho output này.
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-[1.5rem] border border-border-default bg-bg-surface p-4 shadow-sm">
              <div className="flex flex-col gap-3 border-b border-border-default pb-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-text-primary">
                    Tìm nhân sự nhận thanh toán
                  </p>
                  <p className="mt-1 text-xs leading-5 text-text-secondary">
                    Chọn người được ghi nhận thanh toán cho output trong cùng flow tạo.
                  </p>
                </div>

              </div>

              <div className="mt-4">
                <label className="flex flex-col gap-1 text-sm text-text-secondary">
                  <span>Tìm theo họ tên</span>
                  <input
                    type="search"
                    value={staffSearch}
                    onChange={(event) => setStaffSearch(event.target.value)}
                    placeholder="Nhập tên nhân sự…"
                    className="min-h-11 rounded-xl border border-border-default bg-bg-surface px-3 py-2.5 text-text-primary shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                  />
                </label>
              </div>

              <div className="mt-4 grid gap-3">
                {staffOptions.length > 0 ? (
                  staffOptions.map((staff) => {
                    const isSelected = selectedStaff?.id === staff.id;

                    return (
                      <article
                        key={staff.id}
                        className="rounded-2xl border border-border-default bg-bg-secondary/50 p-4"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-text-primary">
                              {staff.fullName}
                            </p>
                            <p className="mt-1 text-xs text-text-secondary">
                              {formatLessonStaffRoleLabel(staff.roles)}
                            </p>
                            <p className="mt-2 text-xs text-text-muted">
                              {formatLessonStaffStatusLabel(staff.status)}
                            </p>
                          </div>

                          <button
                            type="button"
                            onClick={() =>
                              setSelectedStaff((current) =>
                                current?.id === staff.id ? null : staff,
                              )
                            }
                            className={`rounded-xl px-3 py-2 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${isSelected
                              ? "border border-primary/25 bg-primary/12 text-primary"
                              : "border border-border-default bg-bg-surface text-text-primary hover:bg-bg-tertiary"
                            }`}
                          >
                            {isSelected ? "Đang nhận" : "Chọn nhận thanh toán"}
                          </button>
                        </div>
                      </article>
                    );
                  })
                ) : (
                  <div className="rounded-2xl border border-dashed border-border-default bg-bg-secondary/40 px-4 py-8 text-sm text-text-muted">
                    Chưa có kết quả nhân sự cho tìm kiếm hiện tại.
                  </div>
                )}
              </div>
            </section>
          </div>
        )}
      </section>

      <div
        className={`border-t border-border-default pt-4 ${footerLeadingActions
          ? "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
          : "flex items-center justify-end gap-2"
          }`}
      >
        {footerLeadingActions ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {footerLeadingActions}
          </div>
        ) : null}
        <div className="flex items-center justify-end gap-2">
          {onCancel ? (
            <button
              type="button"
              onClick={onCancel}
              disabled={isSubmitting}
              className="rounded-xl border border-border-default bg-bg-surface px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-bg-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:opacity-60"
            >
              Hủy
            </button>
          ) : null}
          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-text-inverse transition-colors hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:opacity-60"
          >
            {isSubmitting ? "Đang lưu…" : getSubmitLabel(mode, submitLabel)}
          </button>
        </div>
      </div>
    </form>
  );
}
