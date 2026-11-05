"use client";

import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import type {
  HomeworkQuality,
  SessionAttendanceStatus,
  SessionProgressStatus,
} from "@/dtos/session.dto";
import { CONTENT_LIMITS } from "@/dtos/content-limits";
import { formatCurrency } from "@/lib/class.helpers";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { DateInput } from "@/components/ui/DateInput";
import { Switch } from "@/components/ui/switch";
import { TimeInput } from "@/components/ui/TimeInput";
import UpgradedSelect from "@/components/ui/UpgradedSelect";
import {
  HOMEWORK_QUALITY_LABELS,
  SESSION_PROGRESS_STATUS_LABELS,
} from "@/lib/session-comment-zalo.helpers";
import type {
  SessionReviewFormValue,
  StudentReviewFormValue,
} from "@/lib/session-review-form";
import {
  moneyInputInitialFromNumber,
  parseMoneyInput,
} from "@/lib/money-input.helpers";
import type { SessionCommentDisplayContent } from "@/lib/session-comment-zalo.helpers";
import { sanitizeRichTextContent } from "@/lib/sanitize";
import { useInClassTestEnabled } from "@/lib/hooks/useInClassTestEnabled";

/** Chuẩn hóa "HH:mm" hoặc "HH:mm:ss" để tính phút. */
function parseTimeToMinutes(time: string): number | null {
  const n = normalizeTimeForDuration(time);
  if (!n) return null;
  const [h, m, sec = "0"] = n.split(":");
  const hh = Number(h);
  const mm = Number(m);
  const ss = Number(sec);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  return hh * 60 + mm + (Number.isFinite(ss) ? ss / 60 : 0);
}

function normalizeTimeForDuration(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const m = trimmed.match(/^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/);
  if (!m) return null;
  const [, h, min, s = "00"] = m;
  return `${h}:${min}:${s}`;
}

/** Hiển thị kiểu "2 giờ" hoặc "1 giờ 30 phút" */
export function formatVnSessionDuration(startTime: string, endTime: string): string | null {
  const a = parseTimeToMinutes(startTime);
  const b = parseTimeToMinutes(endTime);
  if (a == null || b == null || b <= a) return null;
  const diffMin = Math.round(b - a);
  if (diffMin <= 0) return null;
  const h = Math.floor(diffMin / 60);
  const m = diffMin % 60;
  if (h > 0 && m > 0) return `${h} giờ ${m} phút`;
  if (h > 0) return `${h} giờ`;
  return `${m} phút`;
}

export function RequiredMark() {
  return <span className="text-error">*</span>;
}

type TrialLessonToggleProps = {
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  className?: string;
};

/** Dạy thử (coefficient = 0) — admin, trợ lí, gia sư bật; buổi không tính trợ cấp. */
export function TrialLessonToggle({
  checked,
  onChange,
  disabled = false,
  className = "",
}: TrialLessonToggleProps) {
  return (
    <label
      className={cn(
        "flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition-colors",
        checked
          ? "border-primary/35 bg-primary/8"
          : "border-border-default bg-bg-secondary/35",
        disabled ? "cursor-not-allowed opacity-70" : "hover:border-primary/25",
        className,
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="size-5 shrink-0 rounded border-border-default text-primary focus:ring-border-focus"
      />
      <span className="text-sm font-semibold text-text-primary">Dạy thử</span>
      <span className="text-xs text-text-muted">
        {checked
          ? "Không tính trợ cấp buổi (hệ số = 0)"
          : "Buổi học chính thức"}
      </span>
    </label>
  );
}

/** Nhãn chỉ đọc cho buổi Dạy thử (dòng lịch sử, form read-only). */
export function TrialLessonBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary",
        className,
      )}
    >
      Dạy thử
    </span>
  );
}

type SessionTeacherAllowanceEstimateCardProps = {
  amount?: number | null;
  estimatedAmount?: number | null;
  breakdownText?: string | null;
  showBreakdown?: boolean;
  usesSnapshot?: boolean;
  isManualOverride?: boolean;
  canEdit?: boolean;
  editLocked?: boolean;
  editLockedReason?: string | null;
  onManualGrossChange?: (grossAmount: number) => void;
  onClearManualOverride?: () => void;
  loading?: boolean;
  errorMessage?: string | null;
  /** Ghi chú phụ dưới breakdown (vd. "trước khấu trừ" cho gia sư xem trước). */
  footnote?: string | null;
  className?: string;
};

type SessionAttendanceAllowancePreviewStripProps = {
  grossAmount?: number | null;
  breakdownText?: string | null;
  showBreakdown?: boolean;
  usesSnapshot?: boolean;
  chargeableCount?: number;
  loading?: boolean;
  errorMessage?: string | null;
  className?: string;
};

/** Khối read-only trợ cấp gia sư (đồng bộ AddSessionPopup / chỉnh sửa buổi học). */
/** Thanh preview trợ cấp gia sư ngay trong khu vực điểm danh (cập nhật theo sĩ số). */
export function SessionAttendanceAllowancePreviewStrip({
  grossAmount = null,
  breakdownText = null,
  showBreakdown = false,
  usesSnapshot = false,
  chargeableCount = 0,
  loading = false,
  errorMessage = null,
  className = "",
}: SessionAttendanceAllowancePreviewStripProps) {
  return (
    <div
      className={`rounded-lg border border-border-default bg-bg-secondary/40 px-3 py-3 text-xs ${className}`.trim()}
    >
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="font-medium text-text-secondary">Trợ cấp gia sư (ước tính):</span>
        {loading ? (
          <span className="text-text-muted">Đang tải…</span>
        ) : errorMessage ? (
          <span className="text-warning">{errorMessage}</span>
        ) : grossAmount == null ? (
          <span className="text-text-muted">Chưa tính được</span>
        ) : (
          <span className="text-sm font-semibold tabular-nums text-primary">
            {formatCurrency(grossAmount)}
          </span>
        )}
      </div>
      {!loading && !errorMessage ? (
        <div className="mt-2 space-y-1 text-text-muted">
          <p>
            Sĩ số tính trợ cấp:{" "}
            <span className="font-medium text-text-primary">{chargeableCount}</span>{" "}
            (học + phép)
          </p>
          {showBreakdown && breakdownText ? (
            <p>{breakdownText}</p>
          ) : null}
          <p>
            {usesSnapshot
              ? "Tính từ snapshot trợ cấp lúc tạo buổi học."
              : "Tính từ cấu hình lớp/gia sư hiện tại (buổi chưa có snapshot)."}
          </p>
        </div>
      ) : null}
    </div>
  );
}

export function SessionTeacherAllowanceEstimateCard({
  amount = null,
  estimatedAmount = null,
  breakdownText = null,
  showBreakdown = false,
  usesSnapshot = false,
  isManualOverride = false,
  canEdit = false,
  editLocked = false,
  editLockedReason = null,
  onManualGrossChange,
  onClearManualOverride,
  loading = false,
  errorMessage = null,
  footnote = null,
  className = "",
}: SessionTeacherAllowanceEstimateCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draftValue, setDraftValue] = useState("");
  const allowanceEditable =
    canEdit && !editLocked && onManualGrossChange != null;

  useEffect(() => {
    if (!isEditing) return;
    setDraftValue(amount != null ? moneyInputInitialFromNumber(amount) : "");
  }, [amount, isEditing]);

  const handleStartEdit = () => {
    setDraftValue(amount != null ? moneyInputInitialFromNumber(amount) : "");
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setDraftValue("");
  };

  const handleDraftInput = (value: string) => {
    setDraftValue(value);
    const parsed = parseMoneyInput(value);
    if (parsed == null || parsed < 0) return;
    onManualGrossChange?.(Math.floor(parsed));
  };

  return (
    <div
      className={`rounded-xl border border-border-default bg-bg-secondary/45 px-3.5 py-3.5 ${className}`.trim()}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-text-secondary">Trợ cấp buổi</p>
            {isManualOverride ? (
              <span className="rounded-full border border-warning/25 bg-warning/10 px-2 py-0.5 text-[11px] font-semibold text-warning">
                Đã chỉnh tay
              </span>
            ) : null}
          </div>
          {loading ? (
            <p className="mt-2 text-sm text-text-muted">Đang tải cấu hình lớp…</p>
          ) : errorMessage ? (
            <p className="mt-2 text-sm text-warning">{errorMessage}</p>
          ) : isEditing ? (
            <div className="mt-2 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <MoneyInput
                  value={draftValue}
                  autoComplete="off"
                  onValueChange={handleDraftInput}
                  className="min-h-11 w-full min-w-[8rem] flex-1 rounded-lg border border-border-default bg-bg-surface px-3 py-2 text-sm font-semibold tabular-nums text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus sm:max-w-[12rem]"
                  aria-label="Trợ cấp buổi trước phí vận hành và thuế"
                />
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg border border-border-default bg-bg-surface text-text-muted transition-colors hover:bg-bg-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                  aria-label="Hủy chỉnh trợ cấp"
                >
                  <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <p className="text-[11px] text-text-muted">
                Nhập số trước phí vận hành và thuế. Lưu cùng nút Lưu phía dưới form.
              </p>
            </div>
          ) : amount == null ? (
            <p className="mt-2 text-sm text-text-muted">Chưa tính được</p>
          ) : (
            <p className="mt-1.5 text-xl font-semibold tabular-nums text-text-primary">
              {formatCurrency(amount)}
            </p>
          )}
        </div>
        {allowanceEditable && !isEditing ? (
          <button
            type="button"
            onClick={handleStartEdit}
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-border-default bg-bg-surface text-text-secondary transition-colors hover:border-primary/40 hover:bg-primary/8 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
            aria-label="Chỉnh trợ cấp buổi"
            title="Chỉnh trợ cấp buổi"
          >
            <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
            </svg>
          </button>
        ) : null}
      </div>
      {!loading && !errorMessage && !isEditing ? (
        <div className="mt-2 space-y-2 text-xs text-text-muted">
          {editLocked && editLockedReason ? (
            <p className="text-warning">{editLockedReason}</p>
          ) : null}
          {estimatedAmount != null && estimatedAmount !== amount ? (
            <p>Ước tính theo cấu hình: {formatCurrency(estimatedAmount)}</p>
          ) : null}
          {showBreakdown && breakdownText ? (
            <p>{breakdownText}</p>
          ) : (
            <p>
              {usesSnapshot
                ? "Tính từ snapshot trợ cấp lúc tạo buổi học × sĩ số điểm danh hiện tại."
                : "Lấy trực tiếp từ allowance của buổi học (theo cấu hình gia sư/lớp)."}
            </p>
          )}
          {footnote ? <p>{footnote}</p> : null}
          {isManualOverride && onClearManualOverride ? (
            <button
              type="button"
              onClick={onClearManualOverride}
              className="inline-flex min-h-8 items-center rounded-lg border border-border-default bg-bg-surface px-2.5 py-1 text-xs font-medium text-text-secondary transition-colors hover:border-warning/35 hover:bg-warning/8 hover:text-warning focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
            >
              Xóa chỉnh tay
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

type SessionUnsavedChangesDialogProps = {
  open: boolean;
  onStay: () => void;
  onDiscard: () => void;
};

/** Cảnh báo khi đóng form tạo/sửa buổi học còn thay đổi chưa lưu. */
export function SessionUnsavedChangesDialog({
  open,
  onStay,
  onDiscard,
}: SessionUnsavedChangesDialogProps) {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onStay();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onStay]);

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-[60] bg-bg-primary/75 backdrop-blur-[1px]"
        aria-hidden
        onClick={onStay}
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="session-unsaved-title"
        aria-describedby="session-unsaved-description"
        className="fixed left-1/2 top-1/2 z-[70] max-h-[calc(100dvh-1.5rem)] w-[calc(100%-1.5rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-border-default bg-bg-surface p-4 shadow-2xl sm:p-5"
      >
        <div className="flex items-start gap-3">
          <div className="mt-1 flex size-11 items-center justify-center rounded-full bg-warning/10 text-warning sm:size-9">
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
              id="session-unsaved-title"
              className="text-base font-semibold text-text-primary"
            >
              Thay đổi chưa được lưu
            </h2>
            <p
              id="session-unsaved-description"
              className="mt-1 text-sm text-text-secondary"
            >
              Bạn có thay đổi chưa lưu trong form buổi học. Bỏ thay đổi và đóng
              form?
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onStay}
            className="min-h-10 flex-1 rounded-md border border-border-default bg-bg-surface px-4 py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-bg-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus sm:flex-none sm:px-5"
          >
            Ở lại
          </button>
          <button
            type="button"
            onClick={onDiscard}
            className="min-h-10 flex-1 rounded-md border border-warning/35 bg-warning/10 px-4 py-2.5 text-sm font-medium text-warning transition-colors hover:bg-warning/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus sm:flex-none sm:px-5"
          >
            Bỏ thay đổi
          </button>
        </div>
      </div>
    </>
  );
}

type SessionFormDialogHeaderProps = {
  title: string;
  tuitionText?: string | null;
  allowanceText?: string | null;
  onClose: () => void;
  titleId?: string;
};

type SessionFormDialogProps = {
  open: boolean;
  onClose: () => void;
  titleId: string;
  maxWidthClass?: string;
  children: ReactNode;
};

/** Modal cố định giữa viewport; chỉ nội dung form cuộn bên trong. */
export function SessionFormDialog({
  open,
  onClose,
  titleId,
  maxWidthClass = "max-w-3xl",
  children,
}: SessionFormDialogProps) {
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-bg-primary/75 backdrop-blur-[2px]"
        aria-hidden
        onClick={onClose}
      />
      <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className={cn(
            "pointer-events-auto flex max-h-[calc(100dvh-1rem)] min-h-0 w-full flex-col overflow-hidden rounded-2xl border border-border-default bg-bg-surface p-4 shadow-2xl sm:max-h-[calc(100dvh-2rem)] sm:p-6",
            maxWidthClass,
          )}
        >
          {children}
        </div>
      </div>
    </>
  );
}

type SessionFormDialogBodyProps = {
  children: ReactNode;
  className?: string;
};

export function SessionFormDialogBody({
  children,
  className,
}: SessionFormDialogBodyProps) {
  return (
    <div
      className={cn(
        "min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain pr-1 sm:pr-2",
        className,
      )}
    >
      {children}
    </div>
  );
}

type SessionFormDialogFooterProps = {
  children: ReactNode;
  className?: string;
};

export function SessionFormDialogFooter({
  children,
  className,
}: SessionFormDialogFooterProps) {
  return (
    <div
      className={cn(
        "mt-4 grid shrink-0 grid-cols-1 gap-2 border-t border-border-default pt-4 min-[380px]:grid-cols-2 sm:flex sm:justify-end",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SessionFormDialogHeader({
  title,
  tuitionText,
  allowanceText,
  onClose,
  titleId = "session-form-dialog-title",
}: SessionFormDialogHeaderProps) {
  return (
    <div className="mb-5 flex shrink-0 items-start justify-between gap-3 border-b border-border-default/70 pb-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 id={titleId} className="text-lg font-semibold tracking-tight text-text-primary">
            {title}
          </h2>
          {tuitionText ? (
            <span className="text-lg font-semibold tabular-nums text-success">
              {tuitionText}
            </span>
          ) : null}
          {allowanceText ? (
            <span className="text-base font-semibold tabular-nums text-text-primary">
              {allowanceText}
            </span>
          ) : null}
        </div>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="shrink-0 rounded-xl p-2 text-text-muted transition-colors duration-200 hover:bg-bg-tertiary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
        aria-label="Đóng"
      >
        <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

const STATUS_ORDER: SessionAttendanceStatus[] = ["present", "excused", "absent", "trial"];

const STATUS_TITLES: Record<SessionAttendanceStatus, string> = {
  present: "Học",
  excused: "Phép",
  absent: "Vắng",
  trial: "Học thử (không trừ ví; thu bù gấp đôi ở buổi học kế tiếp)",
};

type QuickPickProps = {
  value: SessionAttendanceStatus;
  onChange: (next: SessionAttendanceStatus) => void;
  namePrefix: string;
  disabled?: boolean;
  /** `false` với lớp bán một lần — không có học thử. */
  allowTrial?: boolean;
};

export function AttendanceStatusQuickPick({
  value,
  onChange,
  namePrefix,
  disabled = false,
  allowTrial = true,
}: QuickPickProps) {
  const statuses = allowTrial ? STATUS_ORDER : STATUS_ORDER.filter((status) => status !== "trial");
  return (
    <div
      className={`inline-flex shrink-0 gap-0.5 rounded-lg border border-border-default p-0.5 ${
        disabled ? "bg-bg-secondary/60 opacity-70 cursor-not-allowed" : "bg-bg-secondary/80"
      }`}
      role="group"
      aria-label="Trạng thái điểm danh"
    >
      {statuses.map((status) => {
        const active = value === status;
        return (
          <button
            key={status}
            type="button"
            name={`${namePrefix}-${status}`}
            disabled={disabled}
            onClick={() => !disabled && onChange(status)}
            className={`flex size-9 items-center justify-center rounded-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${
              active
                ? disabled
                  ? "bg-bg-secondary text-text-secondary border border-border-default/60 shadow-sm"
                  : "bg-bg-surface text-text-primary shadow-sm ring-1 ring-border-default/80"
                : disabled
                ? "text-text-muted cursor-not-allowed"
                : "text-text-muted hover:bg-bg-tertiary/80"
            }`}
            title={STATUS_TITLES[status]}
            aria-pressed={active}
          >
            {status === "present" ? (
              <svg className={`size-4 ${disabled ? "text-success/50" : "text-success"}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M5 13l4 4L19 7" />
              </svg>
            ) : status === "excused" ? (
              <span className={`text-xs font-bold ${disabled ? "text-warning/50" : "text-warning"}`} aria-hidden>
                p
              </span>
            ) : status === "trial" ? (
              <span className={`text-xs font-bold ${disabled ? "text-primary/50" : "text-primary"}`} aria-hidden>
                T
              </span>
            ) : (
              <svg className={`size-4 ${disabled ? "text-error/50" : "text-error"}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M6 6l12 12M18 6L6 18" />
              </svg>
            )}
          </button>
        );
      })}
    </div>
  );
}

type SummaryProps = {
  present: number;
  excused: number;
  absent: number;
  trial?: number;
};

export function AttendanceInlineSummary({ present, excused, absent, trial = 0 }: SummaryProps) {
  return (
    <p className="text-sm text-text-secondary">
      <span className="font-medium text-success">Học: {present}</span>
      <span className="mx-2 text-text-muted/70">·</span>
      <span className="font-medium text-warning">Phép: {excused}</span>
      <span className="mx-2 text-text-muted/70">·</span>
      <span className="font-medium text-error">Vắng: {absent}</span>
      {trial > 0 ? (
        <>
          <span className="mx-2 text-text-muted/70">·</span>
          <span className="font-medium text-primary">Học thử: {trial}</span>
        </>
      ) : null}
    </p>
  );
}

/* ───────────── Nhận xét buổi học có cấu trúc ───────────── */

const REVIEW_INPUT_CLASS =
  "min-h-11 w-full rounded-lg border border-border-default bg-bg-surface px-3 py-2 text-sm text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:opacity-60";

const PROGRESS_STATUS_OPTIONS = (
  Object.keys(SESSION_PROGRESS_STATUS_LABELS) as SessionProgressStatus[]
).map((value) => ({ value, label: SESSION_PROGRESS_STATUS_LABELS[value] }));

const HOMEWORK_QUALITY_OPTIONS = (
  Object.keys(HOMEWORK_QUALITY_LABELS) as HomeworkQuality[]
).map((value) => ({ value, label: HOMEWORK_QUALITY_LABELS[value] }));

type ReviewTextareaProps = {
  label: ReactNode;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  rows?: number;
  hint?: string;
  maxLength?: number;
};

/** Textarea plain text, mỗi dòng 1 ý. */
export function ReviewTextarea({
  label,
  value,
  onChange,
  required = false,
  disabled = false,
  placeholder,
  rows = 3,
  hint,
  maxLength = CONTENT_LIMITS.sessionReviewText,
}: ReviewTextareaProps) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-medium text-text-primary">
      <span>
        {label} {required ? <RequiredMark /> : null}
      </span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        rows={rows}
        maxLength={maxLength}
        placeholder={placeholder}
        className={cn(REVIEW_INPUT_CLASS, "resize-y font-normal")}
      />
      {hint ? (
        <span className="text-xs font-normal text-text-muted">{hint}</span>
      ) : null}
    </label>
  );
}

type ReviewToggleProps = {
  id: string;
  label: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
};

function ReviewToggle({
  id,
  label,
  checked,
  disabled = false,
  onCheckedChange,
}: ReviewToggleProps) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3">
      <label htmlFor={id} className="text-sm font-medium text-text-primary">
        {label}
      </label>
      <Switch
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
      />
    </div>
  );
}

type SessionReviewFieldsProps = {
  value: SessionReviewFormValue;
  onChange: (patch: Partial<SessionReviewFormValue>) => void;
  idPrefix: string;
  disabled?: boolean;
};

/** 📊 Tiến độ + 🧪 Kiểm tra trong buổi (đặt sau Nội dung bài học). */
export function SessionReviewProgressFields({
  value,
  onChange,
  idPrefix,
  disabled = false,
}: SessionReviewFieldsProps) {
  const inClassTestEnabled = useInClassTestEnabled();
  const showProgressDetail =
    value.progressStatus === "partial" || value.progressStatus === "not_completed";

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-1.5 text-sm font-medium text-text-primary">
        <span>
          Tiến độ <RequiredMark />
        </span>
        <UpgradedSelect
          name={`${idPrefix}-progress-status`}
          value={value.progressStatus}
          onValueChange={(next) =>
            onChange({ progressStatus: next as SessionProgressStatus })
          }
          options={PROGRESS_STATUS_OPTIONS}
          placeholder="Chọn tiến độ"
          ariaLabel="Tiến độ buổi"
          disabled={disabled}
          buttonClassName={REVIEW_INPUT_CLASS}
        />
      </div>

      {showProgressDetail ? (
        <div className="grid gap-4 md:grid-cols-2">
          <ReviewTextarea
            label="Đã xong"
            value={value.progressDone}
            onChange={(progressDone) => onChange({ progressDone })}
            required={value.progressStatus === "partial"}
            disabled={disabled}
            placeholder="Mỗi dòng một ý"
          />
          <ReviewTextarea
            label="Chưa xong (kèm lý do)"
            value={value.progressRemaining}
            onChange={(progressRemaining) => onChange({ progressRemaining })}
            required
            disabled={disabled}
            placeholder="Mỗi dòng một ý"
          />
        </div>
      ) : null}

      {inClassTestEnabled ? (
      <div className="space-y-3 rounded-lg border border-border-default bg-bg-secondary/30 p-3">
        <ReviewToggle
          id={`${idPrefix}-has-test`}
          label="Có kiểm tra trong buổi"
          checked={value.hasInClassTest}
          disabled={disabled}
          onCheckedChange={(hasInClassTest) => onChange({ hasInClassTest })}
        />
        {value.hasInClassTest ? (
          <>
            <ReviewTextarea
              label="Nội dung kiểm tra"
              value={value.inClassTestContent}
              onChange={(inClassTestContent) => onChange({ inClassTestContent })}
              required
              disabled={disabled}
              rows={2}
            />
            <label className="flex flex-col gap-1.5 text-sm font-medium text-text-primary">
              <span>
                Tổng số câu <RequiredMark />
              </span>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                value={value.inClassTestTotal}
                onChange={(event) =>
                  onChange({ inClassTestTotal: event.target.value })
                }
                disabled={disabled}
                className={cn(REVIEW_INPUT_CLASS, "tabular-nums sm:max-w-40")}
              />
            </label>
          </>
        ) : null}
      </div>
      ) : null}
    </div>
  );
}

/** ⏰ Hạn BTVN (đặt sau Bài tập về nhà). */
export function SessionReviewHomeworkDueFields({
  value,
  onChange,
  idPrefix,
  disabled = false,
}: SessionReviewFieldsProps) {
  return (
    <div>
      <p className="mb-1.5 text-sm font-medium text-text-primary">
        Hạn BTVN{" "}
        <span className="text-xs font-normal text-text-muted">(Không bắt buộc)</span>
      </p>
      <div className="flex flex-wrap items-end gap-2 sm:gap-3">
        <label className="flex min-w-[9rem] flex-1 flex-col gap-1 text-xs text-text-secondary">
          <span>Ngày</span>
          <DateInput
            name={`${idPrefix}-homework-due-date`}
            value={value.homeworkDueDate}
            autoComplete="off"
            disabled={disabled}
            onChange={(event) => onChange({ homeworkDueDate: event.target.value })}
            className={REVIEW_INPUT_CLASS}
          />
        </label>
        <label className="flex min-w-[8rem] flex-1 flex-col gap-1 text-xs text-text-secondary">
          <span>Giờ</span>
          <TimeInput
            name={`${idPrefix}-homework-due-time`}
            value={value.homeworkDueTime}
            autoComplete="off"
            prefillEmpty={false}
            disabled={disabled}
            onChange={(event) => onChange({ homeworkDueTime: event.target.value })}
            className={cn(REVIEW_INPUT_CLASS, "font-mono")}
          />
        </label>
      </div>
    </div>
  );
}

/** 🔜 Buổi sau + 🔁 Kiểm tra lại. */
export function SessionReviewNextSessionFields({
  value,
  onChange,
  idPrefix,
  disabled = false,
}: SessionReviewFieldsProps) {
  return (
    <div className="space-y-4">
      <ReviewTextarea
        label="Buổi sau"
        value={value.nextSessionPlan}
        onChange={(nextSessionPlan) => onChange({ nextSessionPlan })}
        required
        disabled={disabled}
        placeholder="Nội dung dự kiến buổi sau, mỗi dòng một ý"
      />
      <div className="space-y-3 rounded-lg border border-border-default bg-bg-secondary/30 p-3">
        <ReviewToggle
          id={`${idPrefix}-has-retest`}
          label="Buổi sau có kiểm tra lại"
          checked={value.hasRetest}
          disabled={disabled}
          onCheckedChange={(hasRetest) => onChange({ hasRetest })}
        />
        {value.hasRetest ? (
          <ReviewTextarea
            label="Nội dung kiểm tra lại"
            value={value.retestContent}
            onChange={(retestContent) => onChange({ retestContent })}
            required
            disabled={disabled}
            rows={2}
          />
        ) : null}
      </div>
    </div>
  );
}

type SessionStudentReviewFieldsProps = {
  fullName: string;
  status: SessionAttendanceStatus;
  value: StudentReviewFormValue;
  onChange: (patch: Partial<StudentReviewFormValue>) => void;
  namePrefix: string;
  hasInClassTest: boolean;
  inClassTestTotal: number | null;
  disabled?: boolean;
};

/** Phần từng HS: nghỉ phép chỉ nhập lý do nghỉ; vắng không nhập gì; học thử bỏ mục BTVN. */
export function SessionStudentReviewFields({
  fullName,
  status,
  value,
  onChange,
  namePrefix,
  hasInClassTest,
  inClassTestTotal,
  disabled = false,
}: SessionStudentReviewFieldsProps) {
  if (status === "excused") {
    return (
      <ReviewTextarea
        label="Lý do nghỉ"
        value={value.excusedReason}
        onChange={(excusedReason) => onChange({ excusedReason })}
        required
        disabled={disabled}
        placeholder="Ví dụ: ốm, đi du lịch cùng gia đình…"
        rows={2}
        maxLength={CONTENT_LIMITS.attendanceNotes}
      />
    );
  }

  if (status !== "present" && status !== "trial") {
    return <p className="text-xs text-text-muted">Vắng — không cần nhận xét.</p>;
  }

  return (
    <div className="space-y-3">
      {hasInClassTest ? (
        <div className="grid gap-3 rounded-lg border border-border-default bg-bg-secondary/30 p-3 sm:grid-cols-[auto_minmax(0,1fr)]">
          <label className="flex flex-col gap-1.5 text-sm font-medium text-text-primary">
            <span>
              Số câu đúng <RequiredMark />
            </span>
            <span className="flex items-center gap-2">
              <input
                name={`${namePrefix}-test-correct`}
                type="number"
                inputMode="numeric"
                min={0}
                max={inClassTestTotal ?? undefined}
                step={1}
                value={value.testCorrectCount}
                onChange={(event) =>
                  onChange({ testCorrectCount: event.target.value })
                }
                disabled={disabled}
                className={cn(REVIEW_INPUT_CLASS, "w-20 tabular-nums")}
              />
              <span className="whitespace-nowrap text-sm font-normal text-text-secondary tabular-nums">
                / {inClassTestTotal ?? "?"} câu
              </span>
            </span>
          </label>
          <ReviewTextarea
            label="Nhận xét kiểm tra"
            value={value.testComment}
            onChange={(testComment) => onChange({ testComment })}
            required
            disabled={disabled}
            rows={2}
          />
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <ReviewTextarea
          label="Điểm tốt"
          value={value.strengths}
          onChange={(strengths) => onChange({ strengths })}
          required
          disabled={disabled}
          placeholder="Mỗi dòng một ý"
          rows={2}
        />
        <ReviewTextarea
          label="Cần cải thiện"
          value={value.improvements}
          onChange={(improvements) => onChange({ improvements })}
          required
          disabled={disabled}
          placeholder="Mỗi dòng một ý"
          rows={2}
        />
      </div>
      {status === "present" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5 text-sm font-medium text-text-primary">
            <span>
              Chất lượng BTVN buổi trước <RequiredMark />
            </span>
            <UpgradedSelect
              name={`${namePrefix}-homework-quality`}
              value={value.homeworkQuality}
              onValueChange={(next) =>
                onChange({ homeworkQuality: next as HomeworkQuality })
              }
              options={HOMEWORK_QUALITY_OPTIONS}
              placeholder="Chọn mức"
              ariaLabel={`Chất lượng BTVN của ${fullName}`}
              disabled={disabled}
              buttonClassName={REVIEW_INPUT_CLASS}
            />
          </div>
          <ReviewTextarea
            label="Nhận xét BTVN"
            value={value.homeworkComment}
            onChange={(homeworkComment) => onChange({ homeworkComment })}
            required
            disabled={disabled}
            rows={2}
          />
        </div>
      ) : null}
    </div>
  );
}

export type SessionAttendanceEditorItem = {
  studentId: string;
  fullName: string;
  status: SessionAttendanceStatus;
  review: StudentReviewFormValue;
  tuitionFee: string;
  defaultTuitionFee: number | null;
};

type SessionAttendanceEditorProps = {
  items: SessionAttendanceEditorItem[];
  namePrefix: string;
  disabled?: boolean;
  canEditTuition?: boolean;
  /** `false` với lớp bán một lần — ẩn nút Học thử. */
  allowTrial?: boolean;
  hasInClassTest: boolean;
  inClassTestTotal: number | null;
  onStatusChange: (studentId: string, status: SessionAttendanceStatus) => void;
  onReviewChange: (
    studentId: string,
    patch: Partial<StudentReviewFormValue>,
  ) => void;
  onTuitionChange?: (studentId: string, value: string) => void;
};

/** Điểm danh + nhận xét từng HS: một card / học sinh ở mọi breakpoint (không scroll ngang). */
export function SessionAttendanceEditor({
  items,
  namePrefix,
  disabled = false,
  canEditTuition = false,
  allowTrial = true,
  hasInClassTest,
  inClassTestTotal,
  onStatusChange,
  onReviewChange,
  onTuitionChange,
}: SessionAttendanceEditorProps) {
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <SessionStudentAttendanceCommentRow
          key={item.studentId}
          studentId={item.studentId}
          fullName={item.fullName}
          status={item.status}
          review={item.review}
          namePrefix={`${namePrefix}-${item.studentId}`}
          disabled={disabled}
          allowTrial={allowTrial}
          hasInClassTest={hasInClassTest}
          inClassTestTotal={inClassTestTotal}
          onStatusChange={(next) => onStatusChange(item.studentId, next)}
          onReviewChange={(patch) => onReviewChange(item.studentId, patch)}
          showTuitionField={canEditTuition}
          tuitionFee={item.tuitionFee}
          tuitionPlaceholder={
            item.defaultTuitionFee != null
              ? moneyInputInitialFromNumber(item.defaultTuitionFee)
              : "Theo học sinh"
          }
          tuitionInputName={`${namePrefix}-tuition-${item.studentId}`}
          defaultTuitionFee={item.defaultTuitionFee}
          onTuitionChange={(value) => onTuitionChange?.(item.studentId, value)}
        />
      ))}
    </div>
  );
}

type SessionStudentAttendanceCommentRowProps = {
  studentId: string;
  fullName: string;
  status: SessionAttendanceStatus;
  review: StudentReviewFormValue;
  namePrefix: string;
  disabled?: boolean;
  allowTrial?: boolean;
  hasInClassTest: boolean;
  inClassTestTotal: number | null;
  onStatusChange: (next: SessionAttendanceStatus) => void;
  onReviewChange: (patch: Partial<StudentReviewFormValue>) => void;
  showTuitionField?: boolean;
  tuitionFee?: string;
  tuitionPlaceholder?: string;
  tuitionInputName?: string;
  defaultTuitionFee?: number | null;
  onTuitionChange?: (value: string) => void;
};

/**
 * Card một học sinh. Header: tên + quick-pick (+ học phí buổi khi có quyền) trên một hàng
 * từ `sm`; thân: các ô nhận xét. Nghỉ phép chỉ còn ô lý do nghỉ; vắng chỉ còn một dòng ghi chú.
 */
export function SessionStudentAttendanceCommentRow({
  studentId,
  fullName,
  status,
  review,
  namePrefix,
  disabled = false,
  allowTrial = true,
  hasInClassTest,
  inClassTestTotal,
  onStatusChange,
  onReviewChange,
  showTuitionField = false,
  tuitionFee = "",
  tuitionPlaceholder,
  tuitionInputName,
  defaultTuitionFee = null,
  onTuitionChange,
}: SessionStudentAttendanceCommentRowProps) {
  const panelId = `session-student-comment-${studentId}`;
  const reviewed = status === "present" || status === "trial";
  const tuitionHint =
    defaultTuitionFee != null
      ? `Để trống = mặc định ${formatCurrency(defaultTuitionFee)}`
      : "Chưa cấu hình học phí mặc định";

  return (
    <article
      aria-label={`Nhận xét ${fullName}`}
      className={cn(
        "rounded-xl border border-border-default bg-bg-surface p-3 sm:p-4",
        !reviewed && "bg-bg-secondary/30",
      )}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
          <p className="min-w-0 break-words text-sm font-semibold text-text-primary" title={fullName}>
            {fullName}
          </p>
          <AttendanceStatusQuickPick
            namePrefix={namePrefix}
            value={status}
            disabled={disabled}
            allowTrial={allowTrial}
            onChange={onStatusChange}
          />
        </div>

        {showTuitionField ? (
          <label
            className="flex items-center gap-2 sm:shrink-0"
            title={tuitionHint}
          >
            <span className="shrink-0 text-xs font-medium text-text-secondary">
              Học phí
              <span className="sr-only"> buổi của {fullName}</span>
            </span>
            <span className="relative min-w-0 flex-1 sm:w-36 sm:flex-none">
              <MoneyInput
                name={tuitionInputName}
                value={tuitionFee}
                autoComplete="off"
                disabled={disabled}
                onValueChange={(value) => onTuitionChange?.(value)}
                aria-describedby={`${panelId}-tuition-hint`}
                className="h-10 w-full rounded-lg border border-border-default bg-bg-surface pl-3 pr-7 text-right text-sm text-text-primary placeholder:text-text-muted focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:opacity-60"
                placeholder={tuitionPlaceholder ?? "Theo học sinh"}
              />
              <span
                aria-hidden
                className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-text-muted"
              >
                ₫
              </span>
            </span>
            <span id={`${panelId}-tuition-hint`} className="sr-only">
              {tuitionHint}
            </span>
          </label>
        ) : null}
      </div>

      <div
        id={panelId}
        className={cn(reviewed ? "mt-3 border-t border-border-default/70 pt-3" : "mt-1.5")}
      >
        <SessionStudentReviewFields
          fullName={fullName}
          status={status}
          value={review}
          onChange={onReviewChange}
          namePrefix={namePrefix}
          hasInClassTest={hasInClassTest}
          inClassTestTotal={inClassTestTotal}
          disabled={disabled}
        />
      </div>
    </article>
  );
}

type SessionCopyCommentButtonProps = {
  text: string;
  disabled?: boolean;
  className?: string;
};

export function SessionCopyCommentButton({
  text,
  disabled = false,
  className = "",
}: SessionCopyCommentButtonProps) {
  const [copying, setCopying] = useState(false);

  const handleCopy = async () => {
    if (!text.trim() || copying) return;
    setCopying(true);
    try {
      await navigator.clipboard.writeText(text);
      const { toast } = await import("sonner");
      toast.success("Đã copy nhận xét buổi học");
    } catch {
      const { toast } = await import("sonner");
      toast.error("Không copy được nhận xét. Vui lòng thử lại.");
    } finally {
      setCopying(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void handleCopy()}
      disabled={disabled || copying || !text.trim()}
      className={`inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/8 px-4 py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-primary/12 focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto ${className}`.trim()}
    >
      <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-4 10h6a2 2 0 002-2v-6a2 2 0 00-2-2h-6a2 2 0 00-2 2v6a2 2 0 002 2z"
        />
      </svg>
      {copying ? "Đang copy…" : "Copy nhận xét"}
    </button>
  );
}

type SessionCommentPreviewProps = {
  content: SessionCommentDisplayContent;
  emptyText?: string;
  className?: string;
};

export function SessionCommentPreview({
  content,
  emptyText = "Không có ghi chú.",
  className = "",
}: SessionCommentPreviewProps) {
  if (!content.text) {
    return <span className={`text-text-muted ${className}`.trim()}>{emptyText}</span>;
  }

  if (content.mode === "html") {
    const html = sanitizeRichTextContent(content.text);
    if (!html) {
      return <span className={`text-text-muted ${className}`.trim()}>{emptyText}</span>;
    }

    return (
      <div
        className={`prose prose-xs max-w-none break-words text-text-primary [&_a]:text-primary [&_a]:underline [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-sm [&_ol]:list-decimal [&_ol]:pl-4 [&_p]:mb-1 [&_p:last-child]:mb-0 [&_strong]:font-bold [&_ul]:list-disc [&_ul]:pl-4 ${className}`.trim()}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }

  return (
    <p className={`whitespace-pre-wrap break-words text-text-primary ${className}`.trim()}>
      {content.text}
    </p>
  );
}
