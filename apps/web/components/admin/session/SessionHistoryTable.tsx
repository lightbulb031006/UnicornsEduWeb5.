"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  SessionPaymentStatus,
  SessionItem,
  SessionAttendanceStatus,
  SessionAttendanceItem,
  SessionAttendanceRecord,
  SessionUpdatePayload,
} from "@/dtos/session.dto";

type SessionAttendanceRecordWithStudent = SessionAttendanceRecord & {
  student?: { fullName?: string | null } | null;
};
import { ClassDetail } from "@/dtos/class.dto";
import {
  normalizeOptionalRichTextContent,
  sanitizeRichTextContent,
} from "@/lib/sanitize";
import { formatCurrency } from "@/lib/class.helpers";
import {
  computeSessionAllowanceRawBaseVnd,
  computeTeacherSessionAllowanceGrossPreviewVnd,
} from "@/lib/session-allowance.helpers";
import {
  AttendanceInlineSummary,
  AttendanceStatusQuickPick,
  formatVnSessionDuration,
  RequiredMark,
  SessionFormDialogHeader,
  SessionTeacherAllowanceEstimateCard,
} from "@/components/admin/session/session-form-ui";
import { DateInput } from "@/components/ui/DateInput";
import RichTextEditor from "@/components/ui/RichTextEditor";
import { TimeInput } from "@/components/ui/TimeInput";
import UpgradedSelect from "@/components/ui/UpgradedSelect";
import { getFullProfile } from "@/lib/apis/auth.api";
import * as classApi from "@/lib/apis/class.api";
import * as sessionApi from "@/lib/apis/session.api";
import { runBackgroundSave } from "@/lib/mutation-feedback";

type SessionEntityMode = "teacher" | "class" | "none";
type SessionStatusMode = "payment" | "timeline";
type SessionTableVariant = "default" | "classDetail";

export type SessionTeacherOption = {
  id: string;
  fullName?: string | null;
};

type Props = {
  sessions: SessionItem[];
  entityMode?: SessionEntityMode;
  hideTeacherDisplay?: boolean;
  statusMode?: SessionStatusMode;
  variant?: SessionTableVariant;
  emptyText?: string;
  className?: string;
  editorLayout?: "default" | "wide";
  showActionsColumn?: boolean;
  sessionTuitionTotal?: number;
  onSessionUpdated?: () => void;
  /** Danh sách gia sư (lớp) để chọn khi sửa buổi học. Truyền từ trang lớp. */
  teachers?: SessionTeacherOption[];
  /** Lấy danh sách gia sư theo lớp (dùng khi sửa từ trang gia sư). */
  getTeachersForClass?: (classId: string) => Promise<SessionTeacherOption[]>;
  /** Lấy danh sách học sinh của lớp để chỉnh sửa điểm danh. */
  getClassStudents?: (
    classId: string,
  ) => Promise<{ id: string; fullName: string; tuitionFee?: number | null }[]>;
  /** Lấy cấu hình lớp để preview trợ cấp khi sửa buổi học (staff route dùng `staff-ops`). */
  getClassDetailForEdit?: (classId: string) => Promise<ClassDetail>;
  allowTeacherSelection?: boolean;
  allowFinancialEdits?: boolean;
  allowCoefficientEdit?: boolean;
  allowAllowanceEdit?: boolean;
  allowAttendanceTuitionEdits?: boolean;
  allowPaymentStatusEdit?: boolean;
  allowDeleteSession?: boolean;
  enableBulkPaymentStatusEdit?: boolean;
  readOnlySessionDetails?: boolean;
  updateSessionFn?: (
    id: string,
    data: SessionUpdatePayload,
  ) => Promise<SessionItem>;
  deleteSessionFn?: (id: string) => Promise<void>;
};

type AttendanceFormItem = {
  studentId: string;
  fullName: string;
  status: SessionAttendanceStatus;
  notes: string;
  tuitionFee: string;
  defaultTuitionFee: number | null;
};

const MAX_ATTENDANCE_NOTES_LENGTH = 500;

function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function extractDateKey(raw?: string | null): string | null {
  if (!raw) return null;

  const matched = raw.trim().match(/^(\d{4}-\d{2}-\d{2})/);
  if (matched) return matched[1];

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return formatDateKey(date);
}

function formatDateOnly(raw?: string | null): string {
  const dateKey = extractDateKey(raw);
  if (dateKey) {
    const [, year, month, day] =
      dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/) ?? [];
    if (year && month && day) {
      return `${day}/${month}/${year}`;
    }
  }

  return "—";
}

function formatWeekdayLabel(
  raw?: string | null,
  options?: { trailingColon?: boolean },
): string {
  const dateKey = extractDateKey(raw);
  if (!dateKey) return "—";
  const date = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "—";
  const d = date.getDay(); // 0..6 (Sun..Sat)
  const label = d === 0 ? "Chủ nhật" : `Thứ ${d + 1}`;
  return options?.trailingColon ? `${label} :` : label;
}

function renderClassDetailSessionTime(session: SessionItem): string {
  const start = formatTimeOnly(session.startTime ?? null);
  const end = formatTimeOnly(session.endTime ?? null);

  if (start === "—" && end === "—") {
    return "—";
  }

  if (start !== "—" && end !== "—") {
    return `${start} -> ${end}`;
  }

  return start !== "—" ? start : end;
}

function ClassDetailDateTimeBlock({ session }: { session: SessionItem }) {
  return (
    <div className="flex min-w-[5.5rem] flex-col gap-0.5 text-left">
      <p className="text-xs leading-tight text-text-secondary">
        {formatWeekdayLabel(session.date, { trailingColon: true })}
      </p>
      <p className="text-sm font-bold leading-tight text-text-primary">
        {formatDateOnly(session.date)}
      </p>
      <p className="font-mono text-[11px] leading-tight text-text-muted">
        {renderClassDetailSessionTime(session)}
      </p>
    </div>
  );
}

function formatTimeOnly(raw?: string | null): string {
  if (!raw) return "—";

  const directMatch = raw.trim().match(/^(\d{2}):(\d{2})(?::\d{2})?$/);
  if (directMatch) {
    return `${directMatch[1]}:${directMatch[2]}`;
  }

  const isoMatch = raw.trim().match(/T(\d{2}:\d{2})(?::\d{2})?/);
  if (isoMatch) {
    return isoMatch[1];
  }

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "—";

  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function renderSessionTime(session: SessionItem): string {
  const start = formatTimeOnly(session.startTime ?? null);
  const end = formatTimeOnly(session.endTime ?? null);

  if (start === "—" && end === "—") {
    return "—";
  }

  if (start !== "—" && end !== "—") {
    return `${start} – ${end}`;
  }

  return start !== "—" ? start : end;
}

function renderSessionDeleteSummary(session: SessionItem): string {
  const date = formatDateOnly(session.date);
  const time = renderSessionTime(session);

  return time !== "—" ? `${date} (${time})` : date;
}

function renderSessionStatus(
  session: SessionItem,
  statusMode: SessionStatusMode,
): { label: string; className: string } {
  if (statusMode === "timeline") {
    const sessionDateKey = extractDateKey(session.date);
    if (!sessionDateKey) {
      return {
        label: "Chưa xác định",
        className: "bg-text-muted/15 text-text-muted",
      };
    }

    const todayDateKey = formatDateKey(new Date());
    if (sessionDateKey <= todayDateKey) {
      return {
        label: "Đã hoàn thành",
        className: "bg-success/15 text-success",
      };
    }

    return {
      label: "Đã lên lịch",
      className: "bg-warning/15 text-warning",
    };
  }

  const paymentStatus = (session.teacherPaymentStatus ?? "").toLowerCase();
  if (paymentStatus === "paid") {
    return {
      label: "Đã thanh toán",
      className: "bg-success/15 text-success",
    };
  }

  if (paymentStatus === "deposit") {
    return {
      label: "Cọc",
      className: "bg-warning/15 text-warning",
    };
  }

  if (paymentStatus === "unpaid" || paymentStatus === "") {
    return {
      label: "Chưa thanh toán",
      className: "bg-error/15 text-error",
    };
  }

  return {
    label: paymentStatus,
    className: "bg-text-muted/15 text-text-muted",
  };
}

/** Pill for payment/timeline status: wraps inside narrow `table-fixed` cells instead of clipping on overflow. */
function SessionPaymentStatusPill({
  label,
  toneClassName,
  density = "default",
}: {
  label: string;
  toneClassName: string;
  density?: "default" | "dense";
}) {
  const densityClass =
    density === "dense" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-0.5 text-xs";

  return (
    <span
      className={`inline-block max-w-full min-w-0 wrap-break-word rounded-full font-medium ${densityClass} ${toneClassName}`}
      title={label}
    >
      <span className="block text-pretty text-center leading-snug">
        {label}
      </span>
    </span>
  );
}

function renderEntityCell(
  session: SessionItem,
  entityMode: SessionEntityMode,
): string {
  if (entityMode === "teacher") {
    return session.teacher?.fullName?.trim() || "—";
  }

  if (entityMode === "class") {
    return session.class?.name?.trim() || "—";
  }

  return "—";
}

function renderEntityHeader(entityMode: SessionEntityMode): string {
  if (entityMode === "teacher") {
    return "Gia sư";
  }

  if (entityMode === "class") {
    return "Lớp";
  }

  return "";
}

function resolveSessionTuitionFee(session: SessionItem): number {
  const sessionTuitionRaw =
    typeof session.tuitionFee === "number"
      ? session.tuitionFee
      : Number(session.tuitionFee);
  if (Number.isFinite(sessionTuitionRaw)) {
    return sessionTuitionRaw;
  }

  if (!Array.isArray(session.attendance)) {
    return 0;
  }

  return session.attendance.reduce((sum, item) => {
    if (!isChargeableAttendanceStatus(item.status)) {
      return sum;
    }

    const tuitionRaw =
      typeof item.tuitionFee === "number"
        ? item.tuitionFee
        : Number(item.tuitionFee ?? 0);
    return sum + (Number.isFinite(tuitionRaw) ? tuitionRaw : 0);
  }, 0);
}

function normalizeMoneyValue(
  value: number | string | null | undefined,
): number | null {
  if (value == null) return null;
  const normalized = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(normalized)) return null;
  return Math.floor(normalized);
}

function isNonNegativeMoneyInput(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  const normalized = Number(trimmed);
  return Number.isFinite(normalized) && normalized >= 0;
}

function isChargeableAttendanceStatus(
  status: SessionAttendanceStatus,
): boolean {
  return status === "present" || status === "excused";
}

function resolveAttendanceTuitionValue(item: AttendanceFormItem): number {
  if (!isChargeableAttendanceStatus(item.status)) {
    return 0;
  }

  const normalizedInput = normalizeMoneyValue(item.tuitionFee);
  if (
    item.tuitionFee.trim() !== "" &&
    normalizedInput != null &&
    normalizedInput >= 0
  ) {
    return normalizedInput;
  }

  return normalizeMoneyValue(item.defaultTuitionFee) ?? 0;
}

/** YYYY-MM-DD for date input from session.date (ISO or date string). */
function toDateInputValue(raw?: string | null): string {
  const key = extractDateKey(raw);
  return key ?? "";
}

/** HH:mm or HH:mm:ss for time input from session start/end (ISO or time string). */
function toTimeInputValue(raw?: string | null): string {
  const t = formatTimeOnly(raw);
  if (t === "—") return "";
  return t.length === 5 ? t : `${t}:00`;
}

/** Normalize to HH:mm:ss for API. */
function normalizeTimeForApi(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const match = trimmed.match(/^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/);
  if (!match) return "";
  const [, h, m, s = "00"] = match;
  return `${h}:${m}:${s}`;
}

const PAYMENT_STATUS_META = {
  unpaid: {
    label: "Chưa thanh toán",
    dotClassName: "bg-warning",
    pillClassName:
      "border border-warning/25 bg-warning/10 text-warning shadow-[inset_0_1px_0_color-mix(in_srgb,var(--ue-bg-surface)_35%,transparent)]",
  },
  deposit: {
    label: "Cọc",
    dotClassName: "bg-info",
    pillClassName:
      "border border-info/25 bg-info/10 text-info shadow-[inset_0_1px_0_color-mix(in_srgb,var(--ue-bg-surface)_35%,transparent)]",
  },
  paid: {
    label: "Đã thanh toán",
    dotClassName: "bg-success",
    pillClassName:
      "border border-success/25 bg-success/10 text-success shadow-[inset_0_1px_0_color-mix(in_srgb,var(--ue-bg-surface)_35%,transparent)]",
  },
} satisfies Record<
  "unpaid" | "deposit" | "paid",
  {
    label: string;
    dotClassName: string;
    pillClassName: string;
  }
>;

function renderPaymentStatusOptionLabel(status: "unpaid" | "deposit" | "paid") {
  const meta = PAYMENT_STATUS_META[status];

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-semibold ${meta.pillClassName}`}
    >
      <span
        className={`size-2 rounded-full ${meta.dotClassName}`}
        aria-hidden
      />
      {meta.label}
    </span>
  );
}

const PAYMENT_STATUS_OPTIONS = (
  [
    { value: "unpaid", label: renderPaymentStatusOptionLabel("unpaid") },
    { value: "deposit", label: renderPaymentStatusOptionLabel("deposit") },
    { value: "paid", label: renderPaymentStatusOptionLabel("paid") },
  ] as const
).map((option) => ({
  value: option.value,
  label: option.label,
}));
const DEFAULT_BULK_PAYMENT_STATUS: SessionPaymentStatus = "paid";

function getPaymentStatusLabel(status: SessionPaymentStatus): string {
  if (status === "paid" || status === "deposit" || status === "unpaid") {
    return PAYMENT_STATUS_META[status].label;
  }

  return String(status);
}

type SelectionCheckboxProps = {
  checked: boolean;
  indeterminate?: boolean;
  onChange: () => void;
  disabled?: boolean;
  ariaLabel: string;
  appearance?: "default" | "minimal";
};

function SelectionCheckbox({
  checked,
  indeterminate = false,
  onChange,
  disabled = false,
  ariaLabel,
  appearance = "default",
}: SelectionCheckboxProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!inputRef.current) return;
    inputRef.current.indeterminate = indeterminate;
  }, [indeterminate]);

  if (appearance === "minimal") {
    return (
      <label
        className={`inline-flex min-h-9 min-w-9 cursor-pointer items-center justify-center rounded-xl border transition-colors focus-within:ring-2 focus-within:ring-border-focus focus-within:ring-offset-2 focus-within:ring-offset-bg-surface ${
          checked || indeterminate
            ? "border-primary/45 bg-primary/10"
            : "border-border-default bg-bg-surface hover:border-primary/30 hover:bg-bg-secondary"
        } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
      >
        <input
          ref={inputRef}
          type="checkbox"
          checked={checked}
          onChange={onChange}
          disabled={disabled}
          aria-label={ariaLabel}
          className="sr-only"
        />
        <span
          className={`inline-flex size-5 items-center justify-center rounded-md border text-[11px] font-bold transition-colors ${
            checked
              ? "border-primary bg-primary text-text-inverse"
              : indeterminate
                ? "border-warning/60 bg-warning/15 text-warning"
                : "border-border-default bg-bg-surface text-transparent"
          }`}
          aria-hidden
        >
          {checked ? (
            <svg
              className="size-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.5}
                d="m5 12 4.2 4.2L19 6.8"
              />
            </svg>
          ) : indeterminate ? (
            <svg
              className="size-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.5}
                d="M6 12h12"
              />
            </svg>
          ) : (
            "•"
          )}
        </span>
      </label>
    );
  }

  const isActive = checked || indeterminate;
  const outerClassName = isActive
    ? checked
      ? "border-primary/35 bg-gradient-to-br from-primary/20 via-primary/8 to-info/18 shadow-[0_16px_35px_-22px_color-mix(in_srgb,var(--ue-primary)_55%,transparent)]"
      : "border-warning/35 bg-gradient-to-br from-warning/22 via-warning/10 to-info/18 shadow-[0_16px_35px_-24px_color-mix(in_srgb,var(--ue-warning)_58%,transparent)]"
    : "border-border-default/80 bg-bg-surface shadow-[0_10px_25px_-18px_color-mix(in_srgb,var(--ue-text-primary)_18%,transparent)] hover:border-primary/30 hover:bg-bg-secondary";
  const innerShellClassName = isActive
    ? checked
      ? "border-bg-surface/35 bg-bg-surface/15"
      : "border-warning/25 bg-bg-surface/12"
    : "border-border-default/70 bg-bg-surface/95 group-hover:border-primary/20 group-hover:bg-bg-secondary/90";
  const iconPlateClassName = isActive
    ? checked
      ? "border-bg-surface/20 bg-transparent text-text-inverse shadow-none"
      : "border-warning/35 bg-warning/15 text-warning"
    : "border-border-default bg-bg-surface text-transparent group-hover:border-primary/25 group-hover:bg-primary/5";

  return (
    <label
      className={`group touch-manipulation relative inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center overflow-hidden rounded-[1.05rem] border p-[5px] transition-all duration-200 motion-reduce:transition-none focus-within:ring-2 focus-within:ring-border-focus focus-within:ring-offset-2 focus-within:ring-offset-bg-surface ${outerClassName} ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
    >
      <input
        ref={inputRef}
        type="checkbox"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        aria-label={ariaLabel}
        className="sr-only"
      />
      <span
        className={`absolute inset-[5px] rounded-[0.8rem] border transition-all duration-200 motion-reduce:transition-none ${innerShellClassName}`}
        aria-hidden
      />
      <span
        className="pointer-events-none absolute inset-0 rounded-[inherit] bg-[radial-gradient(circle_at_top,_color-mix(in_srgb,var(--ue-bg-surface)_22%,transparent),_transparent_58%)] opacity-90"
        aria-hidden
      />
      {checked ? (
        <span
          className="pointer-events-none absolute left-1/2 top-1/2 z-0 size-[1.45rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-success/35 bg-success shadow-[0_0_0_4px_color-mix(in_srgb,var(--ue-success)_12%,transparent),0_12px_26px_-14px_color-mix(in_srgb,var(--ue-success)_70%,transparent)] transition-all duration-200 motion-reduce:transition-none"
          aria-hidden
        />
      ) : null}
      <span
        className={`relative z-10 flex size-5 items-center justify-center rounded-[0.68rem] border shadow-sm transition-all duration-200 motion-reduce:transition-none ${iconPlateClassName}`}
        aria-hidden
      >
        {checked ? (
          <svg
            className="size-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2.5}
              d="m5 12 4.2 4.2L19 6.8"
            />
          </svg>
        ) : indeterminate ? (
          <svg
            className="size-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2.5}
              d="M6 12h12"
            />
          </svg>
        ) : (
          <span className="size-1.5 rounded-full bg-primary/30" />
        )}
      </span>
    </label>
  );
}

function countPresentStudents(session: SessionItem): number {
  const list = session.attendance ?? [];
  if (!Array.isArray(list)) return 0;
  return list.filter((item) => {
    const status = item?.status ?? "absent";
    return status === "present" || status === "excused";
  }).length;
}

function renderCoefficientLabel(raw: unknown): string {
  const coeff = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(coeff)) return "1";
  const rounded = Math.round(coeff * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function ClassDetailInfoColumn({
  session,
  entityMode,
  status,
}: {
  session: SessionItem;
  entityMode: SessionEntityMode;
  status: { label: string; className: string };
}) {
  const showTeacherEntity = entityMode === "teacher";
  const showClassEntity = entityMode === "class";
  const entityLabel = showTeacherEntity
    ? session.teacher?.fullName?.trim() || "—"
    : showClassEntity
      ? renderEntityCell(session, entityMode)
      : null;

  return (
    <div className="flex w-full max-w-full flex-col items-center justify-center gap-1.5 text-center">
      {entityLabel ? (
        <div className="flex w-full max-w-full items-center justify-center gap-1 text-primary">
          <svg
            className="size-3.5 shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden
          >
            {showClassEntity ? (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
              />
            ) : (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2m10-10a4 4 0 11-8 0 4 4 0 018 0zm10 10v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"
              />
            )}
          </svg>
          <span
            className="max-w-full truncate text-center text-xs font-semibold"
            title={entityLabel}
          >
            {entityLabel}
          </span>
        </div>
      ) : null}

      <div className="flex w-full justify-center">
        <SessionPaymentStatusPill
          label={status.label}
          toneClassName={status.className}
          density="dense"
        />
      </div>

      <div className="flex w-full items-center justify-center gap-3 text-[11px] text-text-muted">
        <div className="inline-flex items-center justify-center gap-0.5">
          <span className="text-text-muted">Σ</span>
          <span className="tabular-nums text-text-secondary">
            {renderCoefficientLabel(session.coefficient)}
          </span>
        </div>
        <div className="inline-flex items-center justify-center gap-0.5">
          <svg
            className="size-3.5 text-text-muted"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M17 20h5v-2a4 4 0 00-4-4h-1m-6 6H2v-2a4 4 0 014-4h5m4-10a4 4 0 11-8 0 4 4 0 018 0zm6 4a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
          <span className="tabular-nums text-text-secondary">
            {countPresentStudents(session)}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function SessionHistoryTable({
  sessions,
  entityMode = "none",
  hideTeacherDisplay = false,
  statusMode = "payment",
  variant = "default",
  emptyText = "Chưa có buổi học nào.",
  className = "",
  editorLayout = "default",
  showActionsColumn: showActionsColumnProp,
  sessionTuitionTotal,
  onSessionUpdated,
  teachers: teachersProp,
  getTeachersForClass,
  getClassStudents,
  getClassDetailForEdit,
  allowTeacherSelection = true,
  allowFinancialEdits = true,
  allowCoefficientEdit,
  allowAllowanceEdit,
  allowAttendanceTuitionEdits,
  allowPaymentStatusEdit = true,
  allowDeleteSession = true,
  enableBulkPaymentStatusEdit = false,
  readOnlySessionDetails = false,
  updateSessionFn = sessionApi.updateSession,
  deleteSessionFn = sessionApi.deleteSession,
}: Props) {
  const isWideEditor = editorLayout === "wide";
  const showActionsColumn = showActionsColumnProp ?? Boolean(onSessionUpdated);
  const showDeleteAction = showActionsColumn && allowDeleteSession;
  const isTeacherDisplayHidden = hideTeacherDisplay && entityMode === "teacher";
  const isClassDetailRowLayout = variant === "classDetail";
  const classDetailTablePad = {
    th: isClassDetailRowLayout
      ? "px-2.5 py-2 text-xs font-medium text-text-primary"
      : "px-4 py-3 font-medium text-text-primary",
    thBulk: isClassDetailRowLayout
      ? "px-2 py-2 text-center"
      : "px-3 py-3 text-center",
    td: isClassDetailRowLayout ? "px-2.5 py-1.5" : "px-4 py-3",
    tdCheckbox: isClassDetailRowLayout ? "px-2 py-1.5" : "px-3 py-3",
    tdActions: isClassDetailRowLayout ? "px-1.5 py-1.5" : "px-2 py-3",
  } as const;
  const showBulkPaymentStatusBar =
    enableBulkPaymentStatusEdit &&
    statusMode === "payment" &&
    Boolean(onSessionUpdated);
  const [editingSession, setEditingSession] = useState<SessionItem | null>(
    null,
  );
  const [sessionToDelete, setSessionToDelete] = useState<SessionItem | null>(
    null,
  );
  const [editDate, setEditDate] = useState("");
  const [editStartTime, setEditStartTime] = useState("");
  const [editEndTime, setEditEndTime] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editPaymentStatus, setEditPaymentStatus] = useState("unpaid");
  const [editCoefficient, setEditCoefficient] = useState("");
  const [editAllowanceAmount, setEditAllowanceAmount] = useState("");
  const [editTeacherId, setEditTeacherId] = useState("");
  const [teachersList, setTeachersList] = useState<SessionTeacherOption[]>([]);
  const [teachersLoading, setTeachersLoading] = useState(false);
  const [attendanceItems, setAttendanceItems] = useState<AttendanceFormItem[]>(
    [],
  );
  const attendanceDirtyRef = useRef(false);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [selectedSessionIds, setSelectedSessionIds] = useState<Set<string>>(
    new Set(),
  );
  const [bulkEditPopupOpen, setBulkEditPopupOpen] = useState(false);
  const [bulkPaymentStatusDraft, setBulkPaymentStatusDraft] =
    useState<SessionPaymentStatus>(DEFAULT_BULK_PAYMENT_STATUS);
  const canEditCoefficient = allowCoefficientEdit ?? allowFinancialEdits;
  const canEditAllowance = allowAllowanceEdit ?? allowFinancialEdits;
  const canEditAttendanceTuition =
    allowAttendanceTuitionEdits ?? allowFinancialEdits;
  const showTeacherInput =
    allowTeacherSelection && (teachersList.length > 0 || teachersLoading);
  const teacherFieldClass = isWideEditor
    ? allowPaymentStatusEdit
      ? "xl:col-span-2"
      : "xl:col-span-2"
    : "";
  const paymentStatusFieldClass = isWideEditor
    ? "sm:col-span-2 xl:col-span-2"
    : "sm:col-span-2";
  const coefficientFieldClass = isWideEditor ? "xl:col-span-1" : "";
  const allowanceFieldClass = isWideEditor ? "xl:col-span-2" : "";
  const fullWidthFieldClass = isWideEditor
    ? "sm:col-span-2 xl:col-span-4"
    : "sm:col-span-2";
  const selectionColumnCount = showBulkPaymentStatusBar ? 1 : 0;
  const editingClassId = editingSession?.classId?.trim() ?? "";
  const resolveClassDetailForEdit =
    getClassDetailForEdit ?? classApi.getClassById;
  const {
    data: editingClassDetail,
    isLoading: isEditingClassDetailLoading,
    isError: isEditingClassDetailError,
  } = useQuery<ClassDetail>({
    queryKey: getClassDetailForEdit
      ? ([
          "staff-ops",
          "class",
          "detail",
          "session-editor",
          editingClassId,
        ] as const)
      : (["class", "detail", "session-edit", editingClassId] as const),
    queryFn: () => resolveClassDetailForEdit(editingClassId),
    enabled: Boolean(editingSession && editingClassId),
    retry: false,
  });
  const { data: fullProfile } = useQuery({
    queryKey: ["auth", "full-profile"],
    queryFn: getFullProfile,
    retry: false,
    staleTime: 60_000,
  });
  const pageSessionIds = useMemo(
    () => sessions.map((session) => session.id),
    [sessions],
  );
  const visibleSelectedSessionIds = useMemo(
    () =>
      new Set(
        pageSessionIds.filter((sessionId) => selectedSessionIds.has(sessionId)),
      ),
    [pageSessionIds, selectedSessionIds],
  );
  const selectedCount = useMemo(
    () => visibleSelectedSessionIds.size,
    [visibleSelectedSessionIds],
  );
  const allSessionsSelected =
    pageSessionIds.length > 0 && selectedCount === pageSessionIds.length;
  const hasPartialSessionSelection = selectedCount > 0 && !allSessionsSelected;

  const loadTeachersForEdit = (session: SessionItem) => {
    if (teachersProp?.length) {
      setTeachersList(teachersProp);
      setTeachersLoading(false);
      return;
    }

    if (getTeachersForClass && session.classId) {
      setTeachersLoading(true);
      setTeachersList([]);
      void getTeachersForClass(session.classId)
        .then((list) => setTeachersList(list ?? []))
        .catch(() => setTeachersList([]))
        .finally(() => setTeachersLoading(false));
      return;
    }

    setTeachersList([]);
    setTeachersLoading(false);
  };

  const loadAttendanceForEdit = (session: SessionItem) => {
    if (!session.classId || !getClassStudents) {
      setAttendanceItems([]);
      attendanceDirtyRef.current = false;
      setAttendanceLoading(false);
      return;
    }

    const paymentStatus = (session.teacherPaymentStatus ?? "").toLowerCase();
    const isLockedSession =
      paymentStatus === "paid" || paymentStatus === "deposit";

    setAttendanceLoading(true);
    setAttendanceItems([]);
    attendanceDirtyRef.current = false;
    const existingAttendance = session.attendance ?? [];

    if (isLockedSession) {
      const items: AttendanceFormItem[] = existingAttendance.map(
        (attendanceItem) => ({
          studentId: attendanceItem.studentId,
          fullName:
            (
              attendanceItem as SessionAttendanceRecordWithStudent
            ).student?.fullName?.trim() || "—",
          status: (attendanceItem.status ??
            "absent") as SessionAttendanceStatus,
          notes: attendanceItem.notes ?? "",
          tuitionFee:
            normalizeMoneyValue(attendanceItem.tuitionFee) != null
              ? String(normalizeMoneyValue(attendanceItem.tuitionFee))
              : "",
          defaultTuitionFee: normalizeMoneyValue(attendanceItem.tuitionFee),
        }),
      );
      setAttendanceItems(items);
      setAttendanceLoading(false);
      return;
    }

    void getClassStudents(session.classId)
      .then((students) => {
        const byStudentId = new Map(
          existingAttendance.map((attendanceItem) => [
            attendanceItem.studentId,
            {
              status: (attendanceItem.status ??
                "absent") as SessionAttendanceStatus,
              notes: attendanceItem.notes ?? "",
              tuitionFee:
                normalizeMoneyValue(attendanceItem.tuitionFee) ?? null,
            },
          ]),
        );
        const merged: AttendanceFormItem[] = (students ?? []).map((student) => {
          const existing = byStudentId.get(student.id);
          const defaultTuitionFee = normalizeMoneyValue(student.tuitionFee);
          const existingTuitionFee = normalizeMoneyValue(existing?.tuitionFee);
          const shouldShowOverride =
            existingTuitionFee != null &&
            (defaultTuitionFee == null ||
              existingTuitionFee !== defaultTuitionFee);

          return {
            studentId: student.id,
            fullName: student.fullName?.trim() || "—",
            status: existing?.status ?? "absent",
            notes: existing?.notes ?? "",
            tuitionFee:
              shouldShowOverride && existingTuitionFee != null
                ? String(existingTuitionFee)
                : "",
            defaultTuitionFee,
          };
        });

        setAttendanceItems(merged);
      })
      .catch(() => {
        setAttendanceItems([]);
        attendanceDirtyRef.current = false;
      })
      .finally(() => setAttendanceLoading(false));
  };

  const setAttendanceStatus = (
    studentId: string,
    status: SessionAttendanceStatus,
  ) => {
    attendanceDirtyRef.current = true;
    setAttendanceItems((prev) =>
      prev.map((item) =>
        item.studentId === studentId ? { ...item, status } : item,
      ),
    );
  };

  const setAttendanceNotes = (studentId: string, notes: string) => {
    attendanceDirtyRef.current = true;
    setAttendanceItems((prev) =>
      prev.map((item) =>
        item.studentId === studentId ? { ...item, notes } : item,
      ),
    );
  };

  const setAttendanceTuitionFee = (studentId: string, tuitionFee: string) => {
    attendanceDirtyRef.current = true;
    setAttendanceItems((prev) =>
      prev.map((item) =>
        item.studentId === studentId ? { ...item, tuitionFee } : item,
      ),
    );
  };

  const deleteMutation = useMutation({
    mutationFn: (sessionId: string) => deleteSessionFn(sessionId),
    onSuccess: () => {
      toast.success("Đã xóa buổi học.");
      onSessionUpdated?.();
    },
    onError: () => {
      toast.error("Không thể xóa buổi học. Vui lòng thử lại.");
    },
  });

  const bulkPaymentStatusMutation = useMutation({
    mutationFn: (teacherPaymentStatus: SessionPaymentStatus) =>
      sessionApi.bulkUpdateSessionPaymentStatus({
        sessionIds: Array.from(visibleSelectedSessionIds),
        teacherPaymentStatus,
      }),
    onSuccess: (result, teacherPaymentStatus) => {
      const paymentLabel = getPaymentStatusLabel(teacherPaymentStatus);
      if (result.updatedCount > 0) {
        toast.success(
          `Đã chuyển ${result.updatedCount} buổi sang trạng thái ${paymentLabel.toLowerCase()}.`,
        );
      } else {
        toast.success(
          `Các buổi đã ở trạng thái ${paymentLabel.toLowerCase()}.`,
        );
      }
      setBulkEditPopupOpen(false);
      setSelectedSessionIds(new Set());
      onSessionUpdated?.();
    },
    onError: (error: unknown) => {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response
          ?.data?.message ??
        (error as Error)?.message ??
        "Không thể cập nhật trạng thái thanh toán hàng loạt.";
      toast.error(message);
    },
  });

  const toggleSessionSelection = (sessionId: string) => {
    if (!showBulkPaymentStatusBar || bulkPaymentStatusMutation.isPending)
      return;

    setSelectedSessionIds((current) => {
      const next = new Set(current);
      if (next.has(sessionId)) {
        next.delete(sessionId);
      } else {
        next.add(sessionId);
      }
      return next;
    });
  };

  const toggleAllSessions = () => {
    if (!showBulkPaymentStatusBar || bulkPaymentStatusMutation.isPending)
      return;

    setSelectedSessionIds(
      allSessionsSelected ? new Set() : new Set(pageSessionIds),
    );
  };

  const openBulkEditPopup = () => {
    if (selectedCount === 0 || bulkPaymentStatusMutation.isPending) return;
    setBulkPaymentStatusDraft(DEFAULT_BULK_PAYMENT_STATUS);
    setBulkEditPopupOpen(true);
  };

  const closeBulkEditPopup = () => {
    if (bulkPaymentStatusMutation.isPending) return;
    setBulkEditPopupOpen(false);
  };

  const confirmBulkPaymentStatusUpdate = () => {
    if (selectedCount === 0 || bulkPaymentStatusMutation.isPending) return;
    bulkPaymentStatusMutation.mutate(bulkPaymentStatusDraft);
  };

  const handleDeleteClick = (session: SessionItem) => {
    setSessionToDelete(session);
  };

  const closeDeleteConfirm = () => {
    if (deleteMutation.isPending) return;
    setSessionToDelete(null);
  };

  const handleDeleteConfirmed = async () => {
    if (!sessionToDelete || deleteMutation.isPending) return;

    try {
      await deleteMutation.mutateAsync(sessionToDelete.id);
      setSessionToDelete(null);
    } catch {
      // Keep the popup open so the user can retry or cancel after seeing the toast.
    }
  };

  const openEdit = (session: SessionItem) => {
    setEditingSession(session);
    setEditDate(toDateInputValue(session.date));
    setEditStartTime(toTimeInputValue(session.startTime) || "18:00");
    setEditEndTime(toTimeInputValue(session.endTime) || "20:00");
    setEditNotes(session.notes ?? "");
    setEditTeacherId(session.teacherId ?? "");
    attendanceDirtyRef.current = false;
    const status = (session.teacherPaymentStatus ?? "unpaid").toLowerCase();
    setEditPaymentStatus(
      status === "paid" ? "paid" : status === "deposit" ? "deposit" : "unpaid",
    );
    const coeff = session.coefficient;
    setEditCoefficient(
      coeff != null && Number.isFinite(Number(coeff)) ? String(coeff) : "1",
    );
    const allowance = session.allowanceAmount;
    setEditAllowanceAmount(
      allowance != null && Number.isFinite(Number(allowance))
        ? String(allowance)
        : "",
    );
    loadTeachersForEdit(session);
    loadAttendanceForEdit(session);
  };

  const closeEdit = () => {
    setEditingSession(null);
    setTeachersList([]);
    setTeachersLoading(false);
    setAttendanceItems([]);
    setAttendanceLoading(false);
  };

  const handleSaveEdit = () => {
    if (!editingSession) return;
    const startNorm = normalizeTimeForApi(editStartTime);
    const endNorm = normalizeTimeForApi(editEndTime);
    if (startNorm && endNorm) {
      const toSeconds = (hhmmss: string) => {
        const [h, m, s] = hhmmss.split(":").map(Number);
        return (h ?? 0) * 3600 + (m ?? 0) * 60 + (s ?? 0);
      };
      if (toSeconds(endNorm) <= toSeconds(startNorm)) {
        toast.error("Giờ kết thúc phải lớn hơn giờ bắt đầu.");
        return;
      }
    }
    if (!editDate.trim()) {
      toast.error("Vui lòng chọn ngày học.");
      return;
    }
    if (showTeacherInput && !editTeacherId.trim()) {
      toast.error("Vui lòng chọn gia sư phụ trách.");
      return;
    }
    const hasAttendanceNotesTooLong = attendanceItems.some(
      (item) => item.notes.length > MAX_ATTENDANCE_NOTES_LENGTH,
    );
    if (hasAttendanceNotesTooLong) {
      toast.error(
        `Ghi chú điểm danh tối đa ${MAX_ATTENDANCE_NOTES_LENGTH} ký tự.`,
      );
      return;
    }
    const hasInvalidAttendanceTuition =
      canEditAttendanceTuition &&
      attendanceItems.some((item) => !isNonNegativeMoneyInput(item.tuitionFee));
    if (hasInvalidAttendanceTuition) {
      toast.error("Học phí từng học sinh phải là số không âm.");
      return;
    }
    const attendancePayload: SessionAttendanceItem[] =
      attendanceItems.length > 0
        ? attendanceItems.map((item) => ({
            studentId: item.studentId,
            status: item.status,
            notes: normalizeOptionalRichTextContent(item.notes),
            ...(canEditAttendanceTuition && item.tuitionFee.trim() !== ""
              ? { tuitionFee: Math.floor(Number(item.tuitionFee)) }
              : {}),
          }))
        : [];
    const coeffNum =
      canEditCoefficient && editCoefficient.trim()
        ? Number(editCoefficient)
        : undefined;
    const allowanceNum =
      canEditAllowance && editAllowanceAmount.trim()
        ? Math.floor(Number(editAllowanceAmount))
        : canEditAllowance && allowanceRawBaseEdit != null
          ? allowanceRawBaseEdit
          : undefined;
    const validCoeff =
      coeffNum !== undefined &&
      Number.isFinite(coeffNum) &&
      coeffNum >= 0 &&
      coeffNum <= 1;
    const payload = {
      id: editingSession.id,
      date: editDate.trim(),
      ...(allowTeacherSelection &&
        editTeacherId &&
        teachersList.length > 0 && { teacherId: editTeacherId }),
      ...(startNorm && { startTime: startNorm }),
      ...(endNorm && { endTime: endNorm }),
      notes: editNotes.trim() || null,
      ...(allowPaymentStatusEdit
        ? { teacherPaymentStatus: editPaymentStatus }
        : {}),
      ...(canEditCoefficient && validCoeff ? { coefficient: coeffNum } : {}),
      ...(canEditAllowance &&
      allowanceNum !== undefined &&
      Number.isFinite(allowanceNum) &&
      allowanceNum >= 0
        ? { allowanceAmount: allowanceNum }
        : {}),
      ...(attendanceDirtyRef.current && { attendance: attendancePayload }),
    };

    closeEdit();
    runBackgroundSave({
      loadingMessage: "Đang lưu buổi học...",
      successMessage: "Đã cập nhật buổi học.",
      errorMessage:
        "Không thể cập nhật buổi học thông tin điểm danh do buổi học đã thanh toán. Vui lòng liên hệ lại ban quản lí.",
      action: async () => {
        const data: Parameters<typeof sessionApi.updateSession>[1] = {
          date: payload.date,
          notes: payload.notes,
        };
        if (payload.teacherPaymentStatus !== undefined) {
          data.teacherPaymentStatus = payload.teacherPaymentStatus;
        }
        if (payload.teacherId) data.teacherId = payload.teacherId;
        if (payload.startTime) data.startTime = payload.startTime;
        if (payload.endTime) data.endTime = payload.endTime;
        if (payload.coefficient !== undefined) {
          data.coefficient = payload.coefficient;
        }
        if (payload.allowanceAmount !== undefined) {
          data.allowanceAmount = payload.allowanceAmount;
        }
        if (payload.attendance != null) {
          data.attendance = payload.attendance as SessionAttendanceItem[];
        }
        return updateSessionFn(payload.id, data);
      },
      onSuccess: () => {
        onSessionUpdated?.();
      },
    });
  };

  const shouldShowEntity = entityMode !== "none" && !isTeacherDisplayHidden;
  const resolvedEditSessionTuition =
    editingSession == null
      ? (sessionTuitionTotal ?? 0)
      : attendanceItems.length > 0
        ? attendanceItems.reduce(
            (sum, item) => sum + resolveAttendanceTuitionValue(item),
            0,
          )
        : editingSession.tuitionFee != null ||
            Array.isArray(editingSession.attendance)
          ? resolveSessionTuitionFee(editingSession)
          : (sessionTuitionTotal ?? 0);
  const attendanceDefaultTuitionTotal = useMemo(
    () =>
      attendanceItems.reduce(
        (sum, item) =>
          sum +
          (isChargeableAttendanceStatus(item.status)
            ? (normalizeMoneyValue(item.defaultTuitionFee) ?? 0)
            : 0),
        0,
      ),
    [attendanceItems],
  );
  const attendanceSummary = useMemo(
    () =>
      attendanceItems.reduce(
        (acc, item) => ({
          ...acc,
          [item.status]: acc[item.status] + 1,
        }),
        {
          present: 0,
          excused: 0,
          absent: 0,
        },
      ),
    [attendanceItems],
  );
  const attendanceOverrideCount = useMemo(
    () =>
      attendanceItems.filter(
        (item) =>
          isChargeableAttendanceStatus(item.status) &&
          item.tuitionFee.trim() !== "",
      ).length,
    [attendanceItems],
  );
  const editDurationLabel = useMemo(
    () => formatVnSessionDuration(editStartTime, editEndTime),
    [editStartTime, editEndTime],
  );
  const canViewTuitionHeader =
    fullProfile?.roleType === "admin" ||
    (fullProfile?.roleType === "staff" &&
      (fullProfile.staffInfo?.roles ?? []).some((role) =>
        ["accountant", "accountant_income"].includes(role),
      ));
  const coefficientInput = editCoefficient.trim();
  const coefficientInputValue =
    coefficientInput === "" ? null : Number(editCoefficient);
  const isCoefficientInputValid =
    coefficientInputValue != null &&
    Number.isFinite(coefficientInputValue) &&
    coefficientInputValue >= 0 &&
    coefficientInputValue <= 1;
  const selectedTeacherId =
    editTeacherId.trim() || editingSession?.teacherId || "";
  const selectedTeacherName =
    teachersList
      .find((teacher) => teacher.id === selectedTeacherId)
      ?.fullName?.trim() ||
    editingSession?.teacher?.fullName?.trim() ||
    (selectedTeacherId ? "Gia sư đang phụ trách" : "");
  const selectedTeacherCustomAllowance =
    editingClassDetail?.teachers?.find(
      (teacher) => teacher.id === selectedTeacherId,
    )?.customAllowance ?? null;
  const classDefaultAllowance = normalizeMoneyValue(
    editingClassDetail?.allowancePerSessionPerStudent,
  );
  const fallbackTeacherAllowance =
    normalizeMoneyValue(selectedTeacherCustomAllowance) ??
    classDefaultAllowance;
  const allowanceInput = editAllowanceAmount.trim();
  const allowanceInputValue =
    allowanceInput === "" ? null : Number(editAllowanceAmount);
  const isAllowanceInputValid =
    allowanceInputValue != null &&
    Number.isFinite(allowanceInputValue) &&
    allowanceInputValue >= 0;

  const allowancePerStudentNumeric = useMemo(
    () =>
      fallbackTeacherAllowance ??
      editingClassDetail?.allowancePerSessionPerStudent ??
      0,
    [
      fallbackTeacherAllowance,
      editingClassDetail?.allowancePerSessionPerStudent,
    ],
  );

  const chargeableAttendanceCountForAllowance = useMemo(
    () =>
      attendanceItems.filter((item) =>
        isChargeableAttendanceStatus(item.status),
      ).length,
    [attendanceItems],
  );

  const allowanceRawBaseEdit = !editingClassDetail
    ? null
    : computeSessionAllowanceRawBaseVnd({
        allowancePerStudent: allowancePerStudentNumeric,
        chargeableStudentCount: chargeableAttendanceCountForAllowance,
        scaleAmount: editingClassDetail.scaleAmount,
      });

  const coefficientForAllowancePreview = useMemo(() => {
    if (
      canEditCoefficient &&
      isCoefficientInputValid &&
      coefficientInputValue != null
    ) {
      return coefficientInputValue;
    }
    const s = editingSession?.coefficient;
    const c = typeof s === "number" ? s : Number(s);
    if (Number.isFinite(c) && c >= 0 && c <= 1) return c;
    return 1;
  }, [
    canEditCoefficient,
    isCoefficientInputValid,
    coefficientInputValue,
    editingSession?.coefficient,
  ]);

  const rawBaseForAllowancePreview = useMemo(() => {
    if (allowanceInput !== "") {
      if (!isAllowanceInputValid) return null;
      return Math.floor(allowanceInputValue!);
    }
    return allowanceRawBaseEdit;
  }, [
    allowanceInput,
    isAllowanceInputValid,
    allowanceInputValue,
    allowanceRawBaseEdit,
  ]);

  const editTutorAllowanceTotal = useMemo(() => {
    if (rawBaseForAllowancePreview == null || !editingClassDetail) return null;
    return computeTeacherSessionAllowanceGrossPreviewVnd({
      rawBase: rawBaseForAllowancePreview,
      coefficient: coefficientForAllowancePreview,
      maxAllowancePerSession: editingClassDetail.maxAllowancePerSession,
    });
  }, [
    rawBaseForAllowancePreview,
    editingClassDetail,
    coefficientForAllowancePreview,
  ]);

  const shouldWaitForClassFormula =
    Boolean(editingSession && editingClassId) && isEditingClassDetailLoading;
  const hasPreviewValidationIssue =
    (canEditCoefficient &&
      coefficientInput !== "" &&
      !isCoefficientInputValid) ||
    (canEditAllowance && allowanceInput !== "" && !isAllowanceInputValid);
  const allowanceFormulaNote = isEditingClassDetailError
    ? "Công thức trợ cấp: không tải được cấu hình lớp để preview."
    : shouldWaitForClassFormula
      ? "Công thức trợ cấp: đang tải cấu hình lớp..."
      : hasPreviewValidationIssue
        ? "Công thức trợ cấp: nhập hệ số từ 0 đến 1 và trợ cấp không âm để xem preview."
        : rawBaseForAllowancePreview == null || editTutorAllowanceTotal == null
          ? "Công thức trợ cấp: chưa đủ dữ liệu để tính."
          : `Gốc lưu buổi: ${formatCurrency(rawBaseForAllowancePreview)}. Gross (hệ số + trần max): ${formatCurrency(editTutorAllowanceTotal)}.`;
  const editHeaderTuition = useMemo(() => {
    if (!canViewTuitionHeader) return null;
    return `Học phí: ${formatCurrency(resolvedEditSessionTuition)}`;
  }, [canViewTuitionHeader, resolvedEditSessionTuition]);
  const editHeaderAllowance = useMemo(() => {
    if (editTutorAllowanceTotal == null) return null;
    return `Trợ cấp gia sư: ${formatCurrency(editTutorAllowanceTotal)}`;
  }, [editTutorAllowanceTotal]);
  const showEditAllowanceEstimate =
    !canEditAllowance &&
    (shouldWaitForClassFormula ||
      !!editingClassDetail ||
      isEditingClassDetailError);
  const editAllowanceEstimateError =
    editingSession && !editingClassId
      ? "Không xác định được lớp của buổi học để ước tính trợ cấp."
      : isEditingClassDetailError
        ? "Không tải được cấu hình lớp để ước tính trợ cấp."
        : hasPreviewValidationIssue
          ? "Nhập hệ số từ 0 đến 1 để xem ước tính trợ cấp."
          : null;

  return (
    <>
      {showBulkPaymentStatusBar && sessions.length > 0 && selectedCount > 0 ? (
        <div className="mb-4 rounded-xl border border-border-default bg-bg-secondary/55 px-3 py-2">
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex min-h-10 items-center rounded-lg bg-bg-surface px-3 text-sm font-medium text-text-secondary">
              Đã chọn: {selectedCount} buổi
            </div>
            <button
              type="button"
              onClick={toggleAllSessions}
              disabled={
                pageSessionIds.length === 0 ||
                bulkPaymentStatusMutation.isPending
              }
              className="touch-manipulation inline-flex min-h-10 items-center justify-center rounded-lg px-1 text-sm font-medium text-text-muted transition-colors hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-50"
            >
              {allSessionsSelected
                ? "Bỏ chọn tất cả"
                : `Chọn tất cả ${pageSessionIds.length} buổi`}
            </button>
            <button
              type="button"
              onClick={openBulkEditPopup}
              disabled={
                selectedCount === 0 || bulkPaymentStatusMutation.isPending
              }
              className="touch-manipulation ml-auto inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-text-inverse transition-colors hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-50"
              aria-label={`Sửa trạng thái thanh toán cho ${selectedCount} buổi học đã chọn`}
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
                  d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                />
              </svg>
              <span>Chuyển trạng thái thanh toán</span>
            </button>
          </div>
        </div>
      ) : null}

      {/* Mobile layout: card list */}
      <div
        className={`${isClassDetailRowLayout ? "space-y-2" : "space-y-3"} ${className} lg:hidden`}
      >
        {sessions.length > 0 ? (
          sessions.map((session) => {
            const status = renderSessionStatus(session, statusMode);
            const notesContent = session.notes?.trim();
            const sanitizedNotes = notesContent
              ? sanitizeRichTextContent(notesContent)
              : "";
            const entityLabel = shouldShowEntity
              ? renderEntityHeader(entityMode)
              : "";
            const entityValue = shouldShowEntity
              ? renderEntityCell(session, entityMode)
              : "";

            return (
              <article
                key={session.id}
                role={showActionsColumn ? "button" : undefined}
                tabIndex={showActionsColumn ? 0 : undefined}
                onClick={
                  showActionsColumn ? () => openEdit(session) : undefined
                }
                onKeyDown={
                  showActionsColumn
                    ? (event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          openEdit(session);
                        }
                      }
                    : undefined
                }
                className={`group rounded-lg border p-3 shadow-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${
                  showBulkPaymentStatusBar &&
                  visibleSelectedSessionIds.has(session.id)
                    ? "border-primary/35 bg-primary/5"
                    : "border-border-default bg-bg-surface"
                } ${showActionsColumn ? "cursor-pointer" : ""}`}
              >
                {isClassDetailRowLayout ? (
                  <>
                    <div className="flex items-start gap-2">
                      {showBulkPaymentStatusBar ? (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            toggleSessionSelection(session.id);
                          }}
                          className="mt-0.5 inline-flex shrink-0 items-center justify-center"
                          aria-label={`Chọn buổi học ${formatDateOnly(session.date)} ${renderClassDetailSessionTime(session)}`}
                        >
                          <SelectionCheckbox
                            checked={visibleSelectedSessionIds.has(session.id)}
                            onChange={() => toggleSessionSelection(session.id)}
                            disabled={bulkPaymentStatusMutation.isPending}
                            ariaLabel={`Chọn buổi học ${formatDateOnly(session.date)} ${renderClassDetailSessionTime(session)}`}
                            appearance="minimal"
                          />
                        </button>
                      ) : null}
                      <ClassDetailDateTimeBlock session={session} />
                      <div className="flex min-w-0 flex-1 justify-center">
                        <ClassDetailInfoColumn
                          session={session}
                          entityMode={entityMode}
                          status={status}
                        />
                      </div>
                      {showDeleteAction ? (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            handleDeleteClick(session);
                          }}
                          disabled={deleteMutation.isPending}
                          aria-label="Xóa buổi học"
                          className="shrink-0 rounded p-1.5 text-text-muted transition-colors hover:bg-error/10 hover:text-error focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:opacity-50"
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
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                            />
                          </svg>
                        </button>
                      ) : null}
                    </div>
                  </>
                ) : (
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
                        Ngày học
                      </p>
                      <p className="text-sm font-semibold text-text-primary">
                        {formatWeekdayLabel(session.date)} ·{" "}
                        {formatDateOnly(session.date)}
                      </p>
                      <p className="mt-1 text-xs font-medium uppercase tracking-wide text-text-muted">
                        Giờ học
                      </p>
                      <p className="text-sm font-mono text-text-primary">
                        {renderSessionTime(session)}
                      </p>
                      {shouldShowEntity && (
                        <div className="mt-1">
                          <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
                            {entityLabel}
                          </p>
                          <p
                            className="max-w-[200px] truncate text-sm text-text-primary"
                            title={entityValue}
                          >
                            {entityValue}
                          </p>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      {showBulkPaymentStatusBar ? (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            toggleSessionSelection(session.id);
                          }}
                          className="inline-flex items-center justify-center"
                          aria-label={`Chọn buổi học ${formatDateOnly(session.date)} ${renderSessionTime(session)}`}
                        >
                          <SelectionCheckbox
                            checked={visibleSelectedSessionIds.has(session.id)}
                            onChange={() => toggleSessionSelection(session.id)}
                            disabled={bulkPaymentStatusMutation.isPending}
                            ariaLabel={`Chọn buổi học ${formatDateOnly(session.date)} ${renderSessionTime(session)}`}
                            appearance="minimal"
                          />
                        </button>
                      ) : null}
                      <SessionPaymentStatusPill
                        label={status.label}
                        toneClassName={status.className}
                      />
                      {isClassDetailRowLayout ? (
                        <div className="flex flex-col items-end gap-1 text-xs text-text-muted">
                          <div className="inline-flex items-center gap-1">
                            <span className="text-text-muted">Σ</span>
                            <span className="tabular-nums text-text-secondary">
                              {renderCoefficientLabel(session.coefficient)}
                            </span>
                          </div>
                          <div className="inline-flex items-center gap-1">
                            <svg
                              className="size-3.5 text-text-muted"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                              aria-hidden
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M17 20h5v-2a4 4 0 00-4-4h-1m-6 6H2v-2a4 4 0 014-4h5m4-10a4 4 0 11-8 0 4 4 0 018 0zm6 4a3 3 0 11-6 0 3 3 0 016 0z"
                              />
                            </svg>
                            <span className="tabular-nums text-text-secondary">
                              {countPresentStudents(session)}
                            </span>
                          </div>
                        </div>
                      ) : null}
                      {showActionsColumn && (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              openEdit(session);
                            }}
                            aria-label="Chỉnh sửa buổi học"
                            className="rounded p-1.5 text-text-muted transition-colors hover:bg-bg-tertiary hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
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
                                d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                              />
                            </svg>
                          </button>
                          {showDeleteAction ? (
                            <button
                              type="button"
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                handleDeleteClick(session);
                              }}
                              disabled={deleteMutation.isPending}
                              aria-label="Xóa buổi học"
                              className="rounded p-1.5 text-text-muted transition-colors hover:bg-error/10 hover:text-error focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:opacity-50"
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
                                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                />
                              </svg>
                            </button>
                          ) : null}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {isClassDetailRowLayout && (
                  <div className="mt-3 border-t border-border-subtle pt-2">
                    <p className="mb-1 text-xs font-medium uppercase tracking-wide text-text-muted">
                      Nhận xét
                    </p>
                    {sanitizedNotes ? (
                      <div
                        className="prose prose-xs max-w-none text-sm text-text-primary [&_p]:mb-1 [&_p:last-child]:mb-0 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4 [&_strong]:font-bold [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-sm"
                        dangerouslySetInnerHTML={{ __html: sanitizedNotes }}
                      />
                    ) : (
                      <p className="text-sm text-text-muted">
                        Không có ghi chú.
                      </p>
                    )}
                  </div>
                )}
              </article>
            );
          })
        ) : (
          <p className="text-center text-sm text-text-muted">{emptyText}</p>
        )}
      </div>

      {/* Desktop / tablet layout: table */}
      <div className={`hidden overflow-x-auto lg:block ${className}`}>
        {isClassDetailRowLayout ? (
          <table className="w-full min-w-[880px] border-collapse text-left text-sm">
            <caption className="sr-only">Lịch sử buổi học</caption>
            <colgroup>
              {showBulkPaymentStatusBar ? <col className="w-10" /> : null}
              <col className="w-[16%]" />
              <col />
              <col className="w-[26%]" />
              <col className="w-10" />
            </colgroup>
            <thead>
              <tr className="border-b border-border-default bg-bg-secondary">
                {showBulkPaymentStatusBar ? (
                  <th scope="col" className={classDetailTablePad.thBulk}>
                    <SelectionCheckbox
                      checked={allSessionsSelected}
                      indeterminate={hasPartialSessionSelection}
                      onChange={toggleAllSessions}
                      disabled={bulkPaymentStatusMutation.isPending}
                      ariaLabel="Chọn tất cả buổi học trong bảng"
                      appearance="minimal"
                    />
                  </th>
                ) : null}
                <th scope="col" className={classDetailTablePad.th}>
                  Thời gian
                </th>
                <th scope="col" className={classDetailTablePad.th}>
                  Nhận xét
                </th>
                <th
                  scope="col"
                  className={`text-center ${classDetailTablePad.th}`}
                >
                  Thông tin
                </th>
                <th
                  scope="col"
                  className={`text-right ${classDetailTablePad.th}`}
                >
                  <span className="sr-only">Xóa</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {sessions.length > 0 ? (
                sessions.map((session) => {
                  const status = renderSessionStatus(session, "payment");
                  const notesContent = session.notes?.trim();
                  const sanitizedNotes = notesContent
                    ? sanitizeRichTextContent(notesContent)
                    : "";

                  return (
                    <tr
                      key={session.id}
                      role={showActionsColumn ? "button" : undefined}
                      tabIndex={showActionsColumn ? 0 : undefined}
                      onClick={
                        showActionsColumn ? () => openEdit(session) : undefined
                      }
                      onKeyDown={
                        showActionsColumn
                          ? (event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                openEdit(session);
                              }
                            }
                          : undefined
                      }
                      className={`border-b border-border-default bg-bg-surface transition-colors ${showActionsColumn ? "cursor-pointer hover:bg-bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus" : "hover:bg-bg-secondary"}`}
                    >
                      {showBulkPaymentStatusBar ? (
                        <td
                          className={`${classDetailTablePad.tdCheckbox} text-center align-middle`}
                        >
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              toggleSessionSelection(session.id);
                            }}
                            className="inline-flex items-center justify-center"
                            aria-label={`Chọn buổi học ${formatDateOnly(session.date)} ${renderSessionTime(session)}`}
                          >
                            <SelectionCheckbox
                              checked={visibleSelectedSessionIds.has(
                                session.id,
                              )}
                              onChange={() =>
                                toggleSessionSelection(session.id)
                              }
                              disabled={bulkPaymentStatusMutation.isPending}
                              ariaLabel={`Chọn buổi học ${formatDateOnly(session.date)} ${renderSessionTime(session)}`}
                              appearance="minimal"
                            />
                          </button>
                        </td>
                      ) : null}
                      <td
                        className={`${classDetailTablePad.td} align-middle text-text-primary`}
                      >
                        <ClassDetailDateTimeBlock session={session} />
                      </td>
                      <td
                        className={`${classDetailTablePad.td} align-top text-text-primary`}
                      >
                        {sanitizedNotes ? (
                          <div
                            className="prose prose-xs max-w-none text-xs leading-snug text-text-primary [&_p]:mb-1 [&_p:last-child]:mb-0 [&_ul]:list-disc [&_ul]:pl-3 [&_ol]:list-decimal [&_ol]:pl-3 [&_strong]:font-semibold [&_h1]:text-sm [&_h2]:text-xs [&_h3]:text-xs"
                            dangerouslySetInnerHTML={{ __html: sanitizedNotes }}
                          />
                        ) : (
                          <span className="text-xs text-text-muted">-</span>
                        )}
                      </td>
                      <td
                        className={`${classDetailTablePad.td} align-middle text-center`}
                      >
                        <div className="flex justify-center">
                          <ClassDetailInfoColumn
                            session={session}
                            entityMode={entityMode}
                            status={status}
                          />
                        </div>
                      </td>
                      <td
                        className={`${classDetailTablePad.tdActions} align-top text-right`}
                      >
                        {showDeleteAction ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleDeleteClick(session);
                            }}
                            disabled={deleteMutation.isPending}
                            aria-label="Xóa buổi học"
                            className="rounded p-1.5 text-text-muted transition-colors hover:bg-error/10 hover:text-error focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:opacity-50"
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
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                              />
                            </svg>
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td
                    colSpan={showBulkPaymentStatusBar ? 5 : 4}
                    className="px-4 py-4 text-center text-text-muted"
                  >
                    {emptyText}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        ) : (
          <table
            className={
              entityMode === "class"
                ? "w-full min-w-[440px] table-fixed border-collapse text-left text-sm"
                : "w-full min-w-[560px] border-collapse text-left text-sm"
            }
          >
            <caption className="sr-only">Lịch sử buổi học</caption>
            <colgroup>
              {showBulkPaymentStatusBar ? <col className="w-12" /> : null}
              {entityMode === "teacher" ? (
                <>
                  <col className="w-[10%]" />
                  <col className="w-[24%]" />
                  <col className="w-[14%]" />
                  <col className="w-[18%]" />
                  <col className="w-[22%]" />
                  {showActionsColumn && <col className="w-[12%]" />}
                </>
              ) : shouldShowEntity ? (
                <>
                  <col className="w-[16%]" />
                  <col className="w-[12%]" />
                  <col className="w-[32%]" />
                  <col className="min-w-30 w-[26%]" />
                  {showActionsColumn && <col className="w-[12%]" />}
                </>
              ) : (
                <>
                  <col className="w-[25%]" />
                  <col className="w-[25%]" />
                  <col className="w-[38%]" />
                  {showActionsColumn && <col className="w-[12%]" />}
                </>
              )}
            </colgroup>
            <thead>
              <tr className="border-b border-border-default bg-bg-secondary">
                {showBulkPaymentStatusBar ? (
                  <th scope="col" className="px-3 py-3 text-center">
                    <SelectionCheckbox
                      checked={allSessionsSelected}
                      indeterminate={hasPartialSessionSelection}
                      onChange={toggleAllSessions}
                      disabled={bulkPaymentStatusMutation.isPending}
                      ariaLabel="Chọn tất cả buổi học trong bảng"
                      appearance="minimal"
                    />
                  </th>
                ) : null}
                <th
                  scope="col"
                  className="px-4 py-3 font-medium text-text-primary"
                >
                  Ngày học
                </th>
                {entityMode === "teacher" ? (
                  <th
                    scope="col"
                    className="px-4 py-3 font-medium text-text-primary"
                  >
                    Note
                  </th>
                ) : null}
                <th
                  scope="col"
                  className="px-4 py-3 font-medium text-text-primary"
                >
                  Giờ học
                </th>
                {shouldShowEntity ? (
                  <th
                    scope="col"
                    className="min-w-0 px-4 py-3 font-medium text-text-primary"
                  >
                    {renderEntityHeader(entityMode)}
                  </th>
                ) : null}
                <th
                  scope="col"
                  className="min-w-0 max-w-40 whitespace-normal px-4 py-3 text-left font-medium leading-snug text-text-primary sm:max-w-none"
                >
                  {statusMode === "timeline"
                    ? "Tiến độ"
                    : "Trạng thái thanh toán"}
                </th>
                {showActionsColumn ? (
                  <th
                    scope="col"
                    className="w-20 px-2 py-3 text-right font-medium text-text-primary"
                    title="Thao tác"
                  >
                    <span className="sr-only">Thao tác</span>
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {sessions.length > 0 ? (
                sessions.map((session) => {
                  const status = renderSessionStatus(session, statusMode);
                  const notesContent = session.notes?.trim();
                  const sanitizedNotes = notesContent
                    ? sanitizeRichTextContent(notesContent)
                    : "";
                  return (
                    <tr
                      key={session.id}
                      role={showActionsColumn ? "button" : undefined}
                      tabIndex={showActionsColumn ? 0 : undefined}
                      onClick={
                        showActionsColumn ? () => openEdit(session) : undefined
                      }
                      onKeyDown={
                        showActionsColumn
                          ? (event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                openEdit(session);
                              }
                            }
                          : undefined
                      }
                      className={`group border-b border-border-default transition-colors duration-200 ${
                        showBulkPaymentStatusBar &&
                        visibleSelectedSessionIds.has(session.id)
                          ? "bg-primary/5 hover:bg-primary/10"
                          : "bg-bg-surface hover:bg-bg-secondary"
                      } ${showActionsColumn ? "cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus" : ""}`}
                    >
                      {showBulkPaymentStatusBar ? (
                        <td className="px-3 py-3 text-center align-middle">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              toggleSessionSelection(session.id);
                            }}
                            className="inline-flex items-center justify-center"
                            aria-label={`Chọn buổi học ${formatDateOnly(session.date)} ${renderSessionTime(session)}`}
                          >
                            <SelectionCheckbox
                              checked={visibleSelectedSessionIds.has(
                                session.id,
                              )}
                              onChange={() =>
                                toggleSessionSelection(session.id)
                              }
                              disabled={bulkPaymentStatusMutation.isPending}
                              ariaLabel={`Chọn buổi học ${formatDateOnly(session.date)} ${renderSessionTime(session)}`}
                              appearance="minimal"
                            />
                          </button>
                        </td>
                      ) : null}
                      <td className="px-4 py-3 text-text-primary">
                        {formatDateOnly(session.date)}
                      </td>
                      {entityMode === "teacher" ? (
                        <td className="px-4 py-3 text-text-primary">
                          {sanitizedNotes ? (
                            <div
                              className="min-w-0 [&_p]:mb-1 [&_p:last-child]:mb-0 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4 [&_strong]:font-bold [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-sm"
                              dangerouslySetInnerHTML={{
                                __html: sanitizedNotes,
                              }}
                            />
                          ) : (
                            <span className="text-text-muted">-</span>
                          )}
                        </td>
                      ) : null}
                      <td className="px-4 py-3 font-mono text-text-primary">
                        {renderSessionTime(session)}
                      </td>
                      {shouldShowEntity ? (
                        <td className="min-w-0 px-4 py-3 text-text-primary">
                          <span
                            className="block truncate"
                            title={renderEntityCell(session, entityMode)}
                          >
                            {renderEntityCell(session, entityMode)}
                          </span>
                        </td>
                      ) : null}
                      <td className="min-w-0 px-4 py-3 align-top">
                        <SessionPaymentStatusPill
                          label={status.label}
                          toneClassName={status.className}
                        />
                      </td>
                      {showActionsColumn ? (
                        <td className="px-2 py-3 text-right">
                          <div className="inline-flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                openEdit(session);
                              }}
                              aria-label="Chỉnh sửa buổi học"
                              className="rounded p-1.5 text-text-muted opacity-0 transition-opacity duration-200 group-hover:opacity-100 hover:bg-bg-tertiary hover:text-primary focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
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
                                  d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                                />
                              </svg>
                            </button>
                            {showDeleteAction ? (
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  handleDeleteClick(session);
                                }}
                                disabled={deleteMutation.isPending}
                                aria-label="Xóa buổi học"
                                className="rounded p-1.5 text-text-muted opacity-0 transition-opacity duration-200 group-hover:opacity-100 hover:bg-error/10 hover:text-error focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:opacity-50"
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
                                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                  />
                                </svg>
                              </button>
                            ) : null}
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td
                    colSpan={
                      selectionColumnCount +
                      (entityMode === "teacher"
                        ? 5
                        : shouldShowEntity
                          ? 4
                          : 3) +
                      (showActionsColumn ? 1 : 0)
                    }
                    className="px-4 py-3 text-center text-text-muted"
                  >
                    {emptyText}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {bulkEditPopupOpen ? (
        <>
          <div
            className="fixed inset-0 z-[60] bg-bg-primary/75 backdrop-blur-[1px]"
            aria-hidden
            onClick={closeBulkEditPopup}
          />
          <div className="fixed inset-0 z-[70] p-3 sm:p-4">
            <div className="mx-auto flex h-full w-full max-w-md items-center">
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="bulk-payment-status-title"
                className="relative w-full overflow-hidden rounded-[1.5rem] border border-border-default bg-bg-surface p-5 shadow-2xl"
              >
                <div
                  className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-success/0 via-success/50 to-primary/0"
                  aria-hidden
                />
                <div
                  className="absolute -right-8 -top-10 size-24 rounded-full bg-success/10 blur-3xl"
                  aria-hidden
                />

                <div className="relative">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                        Chỉnh sửa hàng loạt
                      </p>
                      <h2
                        id="bulk-payment-status-title"
                        className="mt-1 text-lg font-semibold text-text-primary text-balance"
                      >
                        Cập nhật trạng thái thanh toán
                      </h2>
                      <p className="mt-2 text-sm text-text-secondary">
                        Áp dụng cho{" "}
                        <span className="font-semibold text-primary">
                          {selectedCount}
                        </span>{" "}
                        buổi học đã chọn.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={closeBulkEditPopup}
                      className="rounded-xl p-2 text-text-muted transition-colors hover:bg-bg-tertiary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                      aria-label="Đóng popup sửa trạng thái thanh toán"
                    >
                      <svg
                        className="size-5"
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
                    </button>
                  </div>

                  <div className="mt-5 space-y-4">
                    <label className="block">
                      <span className="mb-2 block text-sm font-medium text-text-secondary">
                        Trạng thái muốn đổi
                      </span>
                      <UpgradedSelect
                        name="bulk-session-payment-status"
                        value={bulkPaymentStatusDraft}
                        onValueChange={(value) =>
                          setBulkPaymentStatusDraft(
                            value as SessionPaymentStatus,
                          )
                        }
                        options={PAYMENT_STATUS_OPTIONS}
                        buttonClassName="min-h-11 rounded-xl border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                      />
                    </label>

                    <div className="grid grid-cols-1 gap-2 min-[380px]:grid-cols-2">
                      <button
                        type="button"
                        onClick={closeBulkEditPopup}
                        disabled={bulkPaymentStatusMutation.isPending}
                        className="min-h-11 rounded-xl border border-border-default bg-bg-surface px-4 py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-bg-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Hủy
                      </button>
                      <button
                        type="button"
                        onClick={confirmBulkPaymentStatusUpdate}
                        disabled={bulkPaymentStatusMutation.isPending}
                        className="min-h-11 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-text-inverse transition-colors hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {bulkPaymentStatusMutation.isPending
                          ? "Đang cập nhật…"
                          : "Xác nhận"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      ) : null}

      {sessionToDelete ? (
        <>
          <div
            className="fixed inset-0 z-[60] bg-bg-primary/75 backdrop-blur-[1px]"
            aria-hidden
            onClick={closeDeleteConfirm}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-session-title"
            className="fixed left-1/2 top-1/2 z-[70] w-[calc(100%-1.5rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border-default bg-bg-surface p-4 shadow-2xl sm:p-5"
          >
            <div className="flex items-start gap-3">
              <div className="mt-1 flex size-9 items-center justify-center rounded-full bg-error/10 text-error">
                <svg
                  className="size-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  aria-hidden
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v4m0 4h.01M5.1 19h13.8a2 2 0 001.79-2.89L13.79 4.79a2 2 0 00-3.58 0L3.31 16.11A2 2 0 005.1 19z"
                  />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <h2
                  id="delete-session-title"
                  className="text-base font-semibold text-text-primary"
                >
                  Xóa buổi học?
                </h2>
                <p className="mt-1 text-sm text-text-secondary">
                  Bạn có chắc muốn xóa buổi học{" "}
                  <span className="font-semibold text-text-primary">
                    {renderSessionDeleteSummary(sessionToDelete)}
                  </span>
                  ? Hành động này không thể hoàn tác.
                </p>
              </div>
            </div>

            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeDeleteConfirm}
                className="min-h-10 flex-1 rounded-md border border-border-default bg-bg-surface px-4 py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-bg-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus sm:flex-none sm:px-5"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirmed}
                disabled={deleteMutation.isPending}
                className="min-h-10 flex-1 rounded-md border border-error bg-error px-4 py-2.5 text-sm font-medium text-text-inverse shadow-sm transition-colors hover:bg-error/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:opacity-60 sm:flex-none sm:px-5"
              >
                {deleteMutation.isPending ? "Đang xóa…" : "Xóa buổi học"}
              </button>
            </div>
          </div>
        </>
      ) : null}

      {editingSession && (
        <>
          <div
            className="fixed inset-0 z-40 bg-bg-primary/75 backdrop-blur-[2px]"
            aria-hidden
            onClick={closeEdit}
          />
          <div className="fixed inset-0 z-50 overflow-y-auto overscroll-contain p-2 sm:p-4">
            <div
              className={`mx-auto flex min-h-full w-full items-start py-2 sm:items-center sm:py-0 ${
                isWideEditor ? "max-w-[72rem]" : "max-w-3xl"
              }`}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="edit-session-title"
                className="my-auto flex max-h-[calc(100dvh-1rem)] min-h-0 w-full flex-col overflow-hidden rounded-2xl border border-border-default bg-bg-surface p-4 shadow-2xl sm:max-h-[calc(100dvh-2rem)] sm:p-6"
              >
                <SessionFormDialogHeader
                  title={readOnlySessionDetails ? "Chi tiết buổi học" : "Chỉnh sửa buổi học"}
                  tuitionText={editHeaderTuition}
                  allowanceText={editHeaderAllowance}
                  onClose={closeEdit}
                  titleId="edit-session-title"
                />

                <div className="min-h-0 flex-1 overflow-y-scroll">
                  <div className="min-h-0 h-full space-y-6 overflow-y-auto pr-1 sm:pr-2">
                    <div className="space-y-5">
                      <label className="flex flex-col gap-1.5 text-sm font-medium text-text-primary">
                        <span>
                          Ngày học <RequiredMark />
                        </span>
                        <DateInput
                          name="edit-session-date"
                          value={editDate}
                          autoComplete="off"
                          onChange={(e) => setEditDate(e.target.value)}
                          className="min-h-11 rounded-lg border border-border-default bg-bg-surface px-3 py-2 text-sm text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                        />
                      </label>

                      <div>
                        <p className="mb-1.5 text-sm font-medium text-text-primary">
                          Thời gian <RequiredMark />
                        </p>
                        <div className="flex flex-wrap items-end gap-2 sm:gap-3">
                          <label className="flex min-w-[8rem] flex-1 flex-col gap-1 text-xs text-text-secondary">
                            <span>Bắt đầu</span>
                            <TimeInput
                              name="edit-session-start-time"
                              value={editStartTime}
                              autoComplete="off"
                              onChange={(e) => setEditStartTime(e.target.value)}
                              className="min-h-11 rounded-lg border border-border-default bg-bg-surface px-3 py-2 font-mono text-sm text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                            />
                          </label>
                          <span
                            className="mb-3 hidden text-text-muted sm:inline"
                            aria-hidden
                          >
                            →
                          </span>
                          <label className="flex min-w-[8rem] flex-1 flex-col gap-1 text-xs text-text-secondary">
                            <span>Kết thúc</span>
                            <TimeInput
                              name="edit-session-end-time"
                              value={editEndTime}
                              autoComplete="off"
                              onChange={(e) => setEditEndTime(e.target.value)}
                              className="min-h-11 rounded-lg border border-border-default bg-bg-surface px-3 py-2 font-mono text-sm text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                            />
                          </label>
                        </div>
                        {editDurationLabel ? (
                          <p className="mt-1.5 text-xs text-text-muted">
                            Thời lượng: {editDurationLabel}
                          </p>
                        ) : null}
                      </div>

                      {showTeacherInput ? (
                        <label
                          className={`flex flex-col gap-1.5 text-sm font-medium text-text-primary ${teacherFieldClass}`}
                        >
                          <span>
                            Gia sư dạy <RequiredMark />
                          </span>
                          <UpgradedSelect
                            name="edit-session-teacher"
                            value={editTeacherId}
                            onValueChange={setEditTeacherId}
                            disabled={teachersLoading}
                            options={teachersList.map((teacher) => ({
                              value: teacher.id,
                              label: teacher.fullName?.trim() || "Gia sư",
                            }))}
                            placeholder={
                              teachersLoading ? "Đang tải…" : "Chọn gia sư"
                            }
                            buttonClassName="min-h-11 rounded-lg border border-border-default bg-bg-surface px-3 py-2 text-left text-sm text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                          />
                        </label>
                      ) : selectedTeacherName ? (
                        <div
                          className={`flex flex-col gap-1.5 text-sm font-medium text-text-primary ${teacherFieldClass}`}
                        >
                          <span>Gia sư dạy</span>
                          <div className="flex min-h-11 items-center rounded-lg border border-border-default bg-bg-surface px-3 py-2 text-sm text-text-primary">
                            <span className="truncate font-medium">
                              {selectedTeacherName}
                            </span>
                          </div>
                        </div>
                      ) : null}

                      {allowPaymentStatusEdit ? (
                        <label
                          className={`flex flex-col gap-1.5 text-sm font-medium text-text-primary ${paymentStatusFieldClass}`}
                        >
                          <span>
                            Trạng thái thanh toán <RequiredMark />
                          </span>
                          <UpgradedSelect
                            name="edit-session-payment-status"
                            value={editPaymentStatus}
                            onValueChange={setEditPaymentStatus}
                            options={PAYMENT_STATUS_OPTIONS}
                            buttonClassName="min-h-11 rounded-lg border border-border-default bg-bg-surface px-3 py-2 text-sm text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                          />
                          <span className="text-xs font-normal text-text-muted">
                            Chọn trạng thái thanh toán cho buổi dạy này
                          </span>
                        </label>
                      ) : null}

                      {canEditCoefficient || canEditAllowance ? (
                        <>
                          {canEditCoefficient ? (
                            <label
                              className={`flex flex-col gap-1.5 text-sm font-medium text-text-primary ${coefficientFieldClass}`}
                            >
                              <span>
                                Hệ số (0–1) <RequiredMark />
                              </span>
                              <input
                                name="edit-session-coefficient"
                                type="number"
                                min={0}
                                max={1}
                                step={0.1}
                                value={editCoefficient}
                                autoComplete="off"
                                onChange={(e) =>
                                  setEditCoefficient(e.target.value)
                                }
                                className="min-h-11 rounded-lg border border-border-default bg-bg-surface px-3 py-2 text-sm text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                                placeholder="1"
                              />
                              <span className="text-xs font-normal text-text-muted">
                                Hệ số áp dụng theo cấu hình buổi học (0 đến 1).
                              </span>
                            </label>
                          ) : null}

                          {canEditAllowance ? (
                            <label
                              className={`flex flex-col gap-1.5 text-sm font-medium text-text-primary ${allowanceFieldClass}`}
                            >
                              <span>Trợ cấp buổi (VNĐ)</span>
                              <input
                                name="edit-session-allowance"
                                type="number"
                                min={0}
                                value={editAllowanceAmount}
                                autoComplete="off"
                                onChange={(e) =>
                                  setEditAllowanceAmount(e.target.value)
                                }
                                className="min-h-11 rounded-lg border border-border-default bg-bg-surface px-3 py-2 text-sm text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                                placeholder="Để trống = giữ nguyên"
                              />
                            </label>
                          ) : null}

                          {canEditAllowance ? (
                            <p
                              className={`rounded-lg border border-border-default/80 bg-bg-secondary/40 px-3 py-2 text-xs ${fullWidthFieldClass} ${
                                isEditingClassDetailError ||
                                hasPreviewValidationIssue
                                  ? "text-warning"
                                  : "text-text-muted"
                              }`}
                            >
                              {allowanceFormulaNote}
                            </p>
                          ) : null}
                        </>
                      ) : null}

                      {showEditAllowanceEstimate ? (
                        <SessionTeacherAllowanceEstimateCard
                          className={fullWidthFieldClass}
                          loading={shouldWaitForClassFormula}
                          errorMessage={editAllowanceEstimateError}
                          amount={editTutorAllowanceTotal}
                        />
                      ) : null}

                      <label
                        className={`flex flex-col gap-1.5 text-sm font-medium text-text-primary ${fullWidthFieldClass}`}
                      >
                        <span>
                          Nhận xét <RequiredMark />
                        </span>
                        <RichTextEditor
                          value={editNotes}
                          onChange={setEditNotes}
                          minHeight="min-h-[160px]"
                          ariaLabel="Nhận xét buổi học"
                        />
                        <span className="text-xs font-normal text-text-muted">
                          Nhận xét về buổi học, tiến độ học sinh…
                        </span>
                      </label>
                    </div>

                    {getClassStudents ? (
                      <section className="space-y-3">
                        <div>
                          <h3 className="text-sm font-semibold text-text-primary">
                            Điểm danh học sinh <RequiredMark />
                          </h3>
                          {canEditAttendanceTuition ? (
                            <div className="mt-3 flex flex-wrap gap-2 rounded-lg border border-border-default bg-bg-secondary/40 p-3 text-xs">
                              <span className="text-text-muted">
                                Học phí buổi:
                              </span>
                              <span className="font-medium tabular-nums text-text-primary">
                                Mặc định{" "}
                                {formatCurrency(attendanceDefaultTuitionTotal)}
                              </span>
                              <span className="text-text-muted">·</span>
                              <span className="font-semibold tabular-nums text-primary">
                                Đang áp dụng{" "}
                                {formatCurrency(resolvedEditSessionTuition)}
                              </span>
                              {attendanceOverrideCount > 0 ? (
                                <>
                                  <span className="text-text-muted">·</span>
                                  <span>
                                    Điều chỉnh {attendanceOverrideCount} học
                                    sinh
                                  </span>
                                </>
                              ) : null}
                            </div>
                          ) : null}
                        </div>

                        {attendanceLoading ? (
                          <p className="py-6 text-center text-sm text-text-muted">
                            Đang tải…
                          </p>
                        ) : attendanceItems.length === 0 ? (
                          <p className="py-6 text-center text-sm text-text-muted">
                            Lớp chưa có học sinh.
                          </p>
                        ) : (
                          <>
                            <div className="space-y-3 lg:hidden">
                              {attendanceItems.map((item) => (
                                <article
                                  key={item.studentId}
                                  className="rounded-xl border border-border-default bg-bg-surface p-4"
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
                                      <p className="min-w-0 truncate text-sm font-semibold text-text-primary">
                                        {item.fullName}
                                      </p>
                                      {canEditAttendanceTuition ? (
                                        <p className="shrink-0 text-xs text-text-muted">
                                          Mặc định:{" "}
                                          <span className="font-medium tabular-nums text-text-primary">
                                            {item.defaultTuitionFee != null
                                              ? formatCurrency(
                                                  item.defaultTuitionFee,
                                                )
                                              : "Chưa cấu hình"}
                                          </span>
                                        </p>
                                      ) : null}
                                    </div>
                                    <AttendanceStatusQuickPick
                                      namePrefix={`edit-att-${item.studentId}`}
                                      value={item.status}
                                      onChange={(next) =>
                                        setAttendanceStatus(
                                          item.studentId,
                                          next,
                                        )
                                      }
                                    />
                                  </div>
                                  {canEditAttendanceTuition ? (
                                    <label className="mt-3 flex flex-col gap-1 text-xs text-text-secondary">
                                      <span>Học phí buổi</span>
                                      <input
                                        name={`edit-session-attendance-tuition-${item.studentId}`}
                                        type="number"
                                        min={0}
                                        value={item.tuitionFee}
                                        autoComplete="off"
                                        onChange={(e) =>
                                          setAttendanceTuitionFee(
                                            item.studentId,
                                            e.target.value,
                                          )
                                        }
                                        className="min-h-10 w-full rounded-lg border border-border-default bg-bg-surface px-3 py-2 text-sm text-text-primary"
                                        placeholder={
                                          item.defaultTuitionFee != null
                                            ? String(item.defaultTuitionFee)
                                            : "Theo học sinh"
                                        }
                                      />
                                    </label>
                                  ) : null}
                                  <div className="mt-3 flex flex-col gap-1 text-xs text-text-secondary">
                                    <span>Ghi chú</span>
                                    <RichTextEditor
                                      value={item.notes}
                                      onChange={(html) =>
                                        setAttendanceNotes(item.studentId, html)
                                      }
                                      minHeight="min-h-[120px]"
                                      ariaLabel={`Ghi chú học sinh ${item.fullName}`}
                                    />
                                  </div>
                                </article>
                              ))}
                            </div>

                            <div className="hidden overflow-x-auto rounded-xl border border-border-default bg-bg-surface md:block">
                              <table
                                className={`w-full border-collapse text-left text-sm ${canEditAttendanceTuition ? "min-w-[720px]" : "min-w-[520px]"}`}
                              >
                                <caption className="sr-only">
                                  Điểm danh học sinh
                                </caption>
                                <thead>
                                  <tr className="border-b border-border-default bg-bg-secondary/80">
                                    <th
                                      scope="col"
                                      className="w-28 px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-text-muted"
                                    >
                                      Trạng thái
                                    </th>
                                    <th
                                      scope="col"
                                      className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-text-muted"
                                    >
                                      Tên học sinh
                                    </th>
                                    <th
                                      scope="col"
                                      className="min-w-[18rem] px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-text-muted"
                                    >
                                      Ghi chú
                                    </th>
                                    {canEditAttendanceTuition ? (
                                      <th
                                        scope="col"
                                        className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-text-muted"
                                      >
                                        Học phí buổi
                                      </th>
                                    ) : null}
                                  </tr>
                                </thead>
                                <tbody>
                                  {attendanceItems.map((item) => (
                                    <tr
                                      key={item.studentId}
                                      className="border-b border-border-default/80 bg-bg-surface last:border-0"
                                    >
                                      <td className="px-3 py-2.5 align-middle">
                                        <AttendanceStatusQuickPick
                                          namePrefix={`edit-att-d-${item.studentId}`}
                                          value={item.status}
                                          onChange={(next) =>
                                            setAttendanceStatus(
                                              item.studentId,
                                              next,
                                            )
                                          }
                                        />
                                      </td>
                                      <td className="px-3 py-2.5 align-middle text-sm font-medium text-text-primary">
                                        {item.fullName}
                                      </td>
                                      <td className="px-3 py-2.5 align-middle">
                                        <RichTextEditor
                                          value={item.notes}
                                          onChange={(html) =>
                                            setAttendanceNotes(
                                              item.studentId,
                                              html,
                                            )
                                          }
                                          minHeight="min-h-[96px]"
                                          ariaLabel={`Ghi chú học sinh ${item.fullName}`}
                                        />
                                      </td>
                                      {canEditAttendanceTuition ? (
                                        <td className="px-3 py-2.5 align-middle">
                                          <div className="space-y-1">
                                            <input
                                              name={`edit-session-attendance-tuition-desktop-${item.studentId}`}
                                              type="number"
                                              min={0}
                                              value={item.tuitionFee}
                                              autoComplete="off"
                                              onChange={(e) =>
                                                setAttendanceTuitionFee(
                                                  item.studentId,
                                                  e.target.value,
                                                )
                                              }
                                              className="w-full rounded-lg border border-border-default bg-bg-surface px-2.5 py-1.5 text-sm tabular-nums text-text-primary"
                                              placeholder={
                                                item.defaultTuitionFee != null
                                                  ? String(
                                                      item.defaultTuitionFee,
                                                    )
                                                  : "Theo học sinh"
                                              }
                                            />
                                            <p className="text-[11px] text-text-muted">
                                              Mặc định:{" "}
                                              {item.defaultTuitionFee != null
                                                ? formatCurrency(
                                                    item.defaultTuitionFee,
                                                  )
                                                : "—"}
                                            </p>
                                          </div>
                                        </td>
                                      ) : null}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>

                            <AttendanceInlineSummary
                              present={attendanceSummary.present}
                              excused={attendanceSummary.excused}
                              absent={attendanceSummary.absent}
                            />
                          </>
                        )}
                      </section>
                    ) : null}
                  </div>
                </div>

                <div className="mt-4 grid shrink-0 grid-cols-1 gap-2 border-t border-border-default pt-4 min-[380px]:grid-cols-2 sm:flex sm:justify-end">
                  <button
                    type="button"
                    onClick={closeEdit}
                    className="min-h-11 rounded-xl border border-border-default bg-bg-surface px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                  >
                    Hủy
                  </button>
                  {readOnlySessionDetails ? null : (
                    <button
                      type="button"
                      onClick={handleSaveEdit}
                      className="min-h-11 rounded-xl border border-primary bg-primary px-4 py-2 text-sm font-medium text-text-inverse transition-colors hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                    >
                      Lưu
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
