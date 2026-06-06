"use client";

import type { SessionAttendanceStatus } from "@/dtos/session.dto";
import { formatCurrency } from "@/lib/class.helpers";

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
  breakdownText?: string | null;
  showBreakdown?: boolean;
  usesSnapshot?: boolean;
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
  breakdownText = null,
  showBreakdown = false,
  usesSnapshot = false,
  loading = false,
  errorMessage = null,
  className = "",
}: SessionTeacherAllowanceEstimateCardProps) {
  return (
    <div
      className={`rounded-lg border border-border-default bg-bg-secondary/40 px-3 py-3 ${className}`.trim()}
    >
      <p className="text-sm font-medium text-text-primary">Trợ cấp giáo viên (ước tính)</p>
      {loading ? (
        <p className="mt-2 text-sm text-text-muted">Đang tải cấu hình lớp…</p>
      ) : errorMessage ? (
        <p className="mt-2 text-sm text-warning">{errorMessage}</p>
      ) : amount == null ? (
        <p className="mt-2 text-sm text-text-muted">Chưa tính được</p>
      ) : (
        <p className="mt-2 text-lg font-semibold tabular-nums text-primary">
          {formatCurrency(amount)}
        </p>
      )}
      <div className="mt-2 space-y-1 text-xs text-text-muted">
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
