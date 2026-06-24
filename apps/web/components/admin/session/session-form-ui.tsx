"use client";

import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { SessionAttendanceStatus } from "@/dtos/session.dto";
import { formatCurrency } from "@/lib/class.helpers";
import RichTextEditor from "@/components/ui/RichTextEditor";
import { sessionStudentCommentPlaceholder } from "@/lib/session-comment-zalo.helpers";
import type { SessionCommentDisplayContent } from "@/lib/session-comment-zalo.helpers";
import { sanitizeRichTextContent } from "@/lib/sanitize";

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

type SessionTeacherAllowanceEstimateCardProps = {
  amount?: number | null;
  estimatedAmount?: number | null;
  breakdownText?: string | null;
  showBreakdown?: boolean;
  usesSnapshot?: boolean;
  isManualOverride?: boolean;
  canEdit?: boolean;
  onSaveAllowance?: (grossAmount: number) => void | Promise<void>;
  savingAllowance?: boolean;
  loading?: boolean;
  errorMessage?: string | null;
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
  onSaveAllowance,
  savingAllowance = false,
  loading = false,
  errorMessage = null,
  className = "",
}: SessionTeacherAllowanceEstimateCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draftValue, setDraftValue] = useState("");

  useEffect(() => {
    if (!isEditing) return;
    setDraftValue(amount != null ? String(amount) : "");
  }, [amount, isEditing]);

  const handleStartEdit = () => {
    setDraftValue(amount != null ? String(amount) : "");
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setDraftValue("");
  };

  const handleConfirmEdit = async () => {
    if (!onSaveAllowance) return;
    const parsed = Number(draftValue.trim());
    if (!Number.isFinite(parsed) || parsed < 0) return;
    await onSaveAllowance(Math.floor(parsed));
    setIsEditing(false);
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
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input
                type="number"
                min={0}
                value={draftValue}
                autoComplete="off"
                disabled={savingAllowance}
                onChange={(event) => setDraftValue(event.target.value)}
                className="min-h-11 w-full min-w-[8rem] flex-1 rounded-lg border border-border-default bg-bg-surface px-3 py-2 text-sm font-semibold tabular-nums text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus sm:max-w-[12rem]"
                aria-label="Chỉnh trợ cấp buổi"
              />
              <button
                type="button"
                onClick={() => void handleConfirmEdit()}
                disabled={savingAllowance}
                className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg border border-success/30 bg-success/10 text-success transition-colors hover:bg-success/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:opacity-60"
                aria-label="Lưu trợ cấp buổi"
              >
                <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M5 13l4 4L19 7" />
                </svg>
              </button>
              <button
                type="button"
                onClick={handleCancelEdit}
                disabled={savingAllowance}
                className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg border border-border-default bg-bg-surface text-text-muted transition-colors hover:bg-bg-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:opacity-60"
                aria-label="Hủy chỉnh trợ cấp"
              >
                <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ) : amount == null ? (
            <p className="mt-2 text-sm text-text-muted">Chưa tính được</p>
          ) : (
            <p className="mt-1.5 text-xl font-semibold tabular-nums text-text-primary">
              {formatCurrency(amount)}
            </p>
          )}
        </div>
        {canEdit && onSaveAllowance && !isEditing ? (
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
        <div className="mt-2 space-y-1 text-xs text-text-muted">
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
        </div>
      ) : null}
    </div>
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

const STATUS_ORDER: SessionAttendanceStatus[] = ["present", "excused", "absent"];

type QuickPickProps = {
  value: SessionAttendanceStatus;
  onChange: (next: SessionAttendanceStatus) => void;
  namePrefix: string;
  disabled?: boolean;
};

export function AttendanceStatusQuickPick({ value, onChange, namePrefix, disabled = false }: QuickPickProps) {
  return (
    <div
      className={`inline-flex shrink-0 gap-0.5 rounded-lg border border-border-default p-0.5 ${
        disabled ? "bg-bg-secondary/60 opacity-70 cursor-not-allowed" : "bg-bg-secondary/80"
      }`}
      role="group"
      aria-label="Trạng thái điểm danh"
    >
      {STATUS_ORDER.map((status) => {
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
            title={
              status === "present" ? "Học" : status === "excused" ? "Phép" : "Vắng"
            }
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
};

export function AttendanceInlineSummary({ present, excused, absent }: SummaryProps) {
  return (
    <p className="text-sm text-text-secondary">
      <span className="font-medium text-success">Học: {present}</span>
      <span className="mx-2 text-text-muted/70">·</span>
      <span className="font-medium text-warning">Phép: {excused}</span>
      <span className="mx-2 text-text-muted/70">·</span>
      <span className="font-medium text-error">Vắng: {absent}</span>
    </p>
  );
}

export type SessionAttendanceEditorItem = {
  studentId: string;
  fullName: string;
  status: SessionAttendanceStatus;
  notes: string;
  tuitionFee: string;
  defaultTuitionFee: number | null;
};

type SessionAttendanceEditorProps = {
  items: SessionAttendanceEditorItem[];
  namePrefix: string;
  disabled?: boolean;
  canEditTuition?: boolean;
  onStatusChange: (studentId: string, status: SessionAttendanceStatus) => void;
  onNotesChange: (studentId: string, html: string) => void;
  onTuitionChange?: (studentId: string, value: string) => void;
};

/** Điểm danh: mobile card; từ md+ bảng 3 cột (Học sinh | Nhận xét | Học phí). */
export function SessionAttendanceEditor({
  items,
  namePrefix,
  disabled = false,
  canEditTuition = false,
  onStatusChange,
  onNotesChange,
  onTuitionChange,
}: SessionAttendanceEditorProps) {
  return (
    <>
      <div className="space-y-3 md:hidden">
        {items.map((item) => (
          <SessionStudentAttendanceCommentRow
            key={item.studentId}
            studentId={item.studentId}
            fullName={item.fullName}
            status={item.status}
            notes={item.notes}
            namePrefix={`${namePrefix}-${item.studentId}`}
            disabled={disabled}
            onStatusChange={(next) => onStatusChange(item.studentId, next)}
            onNotesChange={(html) => onNotesChange(item.studentId, html)}
            showTuitionField={canEditTuition}
            tuitionFee={item.tuitionFee}
            tuitionPlaceholder={
              item.defaultTuitionFee != null
                ? String(item.defaultTuitionFee)
                : "Theo học sinh"
            }
            tuitionInputName={`${namePrefix}-tuition-${item.studentId}`}
            defaultTuitionFee={item.defaultTuitionFee}
            onTuitionChange={(value) => onTuitionChange?.(item.studentId, value)}
          />
        ))}
      </div>

      <div className="hidden overflow-x-auto rounded-xl border border-border-default bg-bg-surface md:block">
        <table
          className={`w-full border-collapse text-left text-sm ${canEditTuition ? "min-w-[720px]" : "min-w-[520px]"}`}
        >
          <caption className="sr-only">Nhận xét từng học sinh</caption>
          <thead>
            <tr className="border-b border-border-default bg-bg-secondary/80">
              <th
                scope="col"
                className="w-40 px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-text-muted"
              >
                Học sinh
              </th>
              <th
                scope="col"
                className="min-w-[18rem] px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-text-muted"
              >
                Nhận xét
              </th>
              {canEditTuition ? (
                <th
                  scope="col"
                  className="w-44 px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-text-muted"
                >
                  Học phí buổi
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr
                key={item.studentId}
                className="border-b border-border-default/80 bg-bg-surface last:border-0"
              >
                <td className="px-3 py-2.5 align-top">
                  <div className="space-y-2">
                    <p className="text-center text-sm font-semibold text-text-primary">
                      {item.fullName}
                    </p>
                    <AttendanceStatusQuickPick
                      namePrefix={`${namePrefix}-d-${item.studentId}`}
                      value={item.status}
                      disabled={disabled}
                      onChange={(next) => onStatusChange(item.studentId, next)}
                    />
                  </div>
                </td>
                <td className="px-3 py-2.5 align-top">
                  <RichTextEditor
                    value={item.notes}
                    onChange={(html) => onNotesChange(item.studentId, html)}
                    disabled={disabled}
                    minHeight="min-h-[96px]"
                    placeholder={sessionStudentCommentPlaceholder(item.fullName)}
                    ariaLabel={`Nhận xét học sinh ${item.fullName}`}
                  />
                </td>
                {canEditTuition ? (
                  <td className="px-3 py-2.5 align-top">
                    <div className="space-y-1">
                      <input
                        name={`${namePrefix}-tuition-desktop-${item.studentId}`}
                        type="number"
                        min={0}
                        value={item.tuitionFee}
                        autoComplete="off"
                        disabled={disabled}
                        onChange={(event) =>
                          onTuitionChange?.(item.studentId, event.target.value)
                        }
                        className="w-full rounded-lg border border-border-default bg-bg-surface px-2.5 py-1.5 text-sm tabular-nums text-text-primary"
                        placeholder={
                          item.defaultTuitionFee != null
                            ? String(item.defaultTuitionFee)
                            : "Theo học sinh"
                        }
                      />
                      <p className="text-[11px] text-text-muted">
                        Mặc định:{" "}
                        {item.defaultTuitionFee != null
                          ? formatCurrency(item.defaultTuitionFee)
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
    </>
  );
}

type TrialLessonToggleProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
};

export function TrialLessonToggle({
  checked,
  onChange,
  disabled = false,
  className = "",
}: TrialLessonToggleProps) {
  return (
    <label
      className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition-colors ${
        checked
          ? "border-primary/35 bg-primary/8"
          : "border-border-default bg-bg-secondary/35"
      } ${disabled ? "cursor-not-allowed opacity-70" : "hover:border-primary/25"} ${className}`.trim()}
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
        {checked ? "Không tính trợ cấp buổi (hệ số = 0)" : "Buổi học chính thức"}
      </span>
    </label>
  );
}

type SessionStudentAttendanceCommentRowProps = {
  studentId: string;
  fullName: string;
  status: SessionAttendanceStatus;
  notes: string;
  namePrefix: string;
  disabled?: boolean;
  onStatusChange: (next: SessionAttendanceStatus) => void;
  onNotesChange: (html: string) => void;
  showTuitionField?: boolean;
  tuitionFee?: string;
  tuitionPlaceholder?: string;
  tuitionInputName?: string;
  defaultTuitionFee?: number | null;
  onTuitionChange?: (value: string) => void;
};

/** Card mobile: tên + quick-pick → nhận xét → học phí (tuỳ chọn). */
export function SessionStudentAttendanceCommentRow({
  studentId,
  fullName,
  status,
  notes,
  namePrefix,
  disabled = false,
  onStatusChange,
  onNotesChange,
  showTuitionField = false,
  tuitionFee = "",
  tuitionPlaceholder,
  tuitionInputName,
  defaultTuitionFee = null,
  onTuitionChange,
}: SessionStudentAttendanceCommentRowProps) {
  const panelId = `session-student-comment-${studentId}`;

  return (
    <article className="overflow-hidden rounded-xl border border-border-default bg-bg-surface p-4">
      <div className="space-y-2">
        <p className="min-w-0 text-center text-sm font-semibold text-text-primary">{fullName}</p>
        <AttendanceStatusQuickPick
          namePrefix={namePrefix}
          value={status}
          disabled={disabled}
          onChange={onStatusChange}
        />
      </div>

      <div
        id={panelId}
        className="mt-3 flex flex-col gap-1 text-xs text-text-secondary"
      >
        <span>Nhận xét</span>
        <RichTextEditor
          value={notes}
          onChange={onNotesChange}
          disabled={disabled}
          minHeight="min-h-[120px]"
          placeholder={sessionStudentCommentPlaceholder(fullName)}
          ariaLabel={`Nhận xét học sinh ${fullName}`}
        />
      </div>

      {showTuitionField ? (
        <label className="mt-3 flex flex-col gap-1 text-xs text-text-secondary">
          <span>Học phí buổi</span>
          <input
            name={tuitionInputName}
            type="number"
            min={0}
            value={tuitionFee}
            autoComplete="off"
            disabled={disabled}
            onChange={(event) => onTuitionChange?.(event.target.value)}
            className="min-h-10 w-full rounded-lg border border-border-default bg-bg-surface px-3 py-2 text-sm text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:opacity-60"
            placeholder={tuitionPlaceholder ?? "Theo học sinh"}
          />
          <span className="text-[11px] text-text-muted">
            Mặc định:{" "}
            {defaultTuitionFee != null
              ? formatCurrency(defaultTuitionFee)
              : "Chưa cấu hình"}
          </span>
        </label>
      ) : null}
    </article>
  );
}

/** @deprecated Dùng SessionStudentAttendanceCommentRow */
type SessionAttendanceCompactRowProps = {
  fullName: string;
  status: SessionAttendanceStatus;
  namePrefix: string;
  disabled?: boolean;
  onStatusChange: (next: SessionAttendanceStatus) => void;
};

export function SessionAttendanceCompactRow({
  fullName,
  status,
  namePrefix,
  disabled = false,
  onStatusChange,
}: SessionAttendanceCompactRowProps) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border-default bg-bg-surface px-3 py-2.5">
      <p className="min-w-0 truncate text-sm font-medium text-text-primary">{fullName}</p>
      <AttendanceStatusQuickPick
        namePrefix={namePrefix}
        value={status}
        disabled={disabled}
        onChange={onStatusChange}
      />
    </div>
  );
}

type SessionStudentCommentAccordionProps = {
  studentId: string;
  fullName: string;
  notes: string;
  disabled?: boolean;
  defaultOpen?: boolean;
  onNotesChange: (html: string) => void;
};

export function SessionStudentCommentAccordion({
  studentId,
  fullName,
  notes,
  disabled = false,
  defaultOpen = false,
  onNotesChange,
}: SessionStudentCommentAccordionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = `session-student-comment-${studentId}`;

  return (
    <div className="rounded-xl border border-border-default bg-bg-surface">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-border-focus"
        aria-expanded={open}
        aria-controls={panelId}
      >
        <span className="text-sm font-semibold text-text-primary">{fullName}</span>
        <svg
          className={`size-4 shrink-0 text-text-muted transition-transform ${open ? "rotate-180" : ""}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          aria-hidden
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open ? (
        <div id={panelId} className="border-t border-border-default/80 px-3 pb-3 pt-2">
          <RichTextEditor
            value={notes}
            onChange={onNotesChange}
            disabled={disabled}
            minHeight="min-h-[120px]"
            placeholder={sessionStudentCommentPlaceholder(fullName)}
            ariaLabel={`Nhận xét học sinh ${fullName}`}
          />
        </div>
      ) : null}
    </div>
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
        className={`prose prose-xs max-w-none break-words text-text-primary [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-sm [&_ol]:list-decimal [&_ol]:pl-4 [&_p]:mb-1 [&_p:last-child]:mb-0 [&_strong]:font-bold [&_ul]:list-disc [&_ul]:pl-4 ${className}`.trim()}
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
