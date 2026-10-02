"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import type { ClassScopedMakeupScheduleEventPayload, MakeupScheduleEventRecord } from "@/dtos/class-schedule.dto";
import type {
  CreateMissedTeachingExplanationPayload,
  MissedTeachingAlert,
  MissedTeachingExplanationRecord,
  UpdateMissedTeachingExplanationPayload,
} from "@/dtos/session.dto";
import { DateInput } from "@/components/ui/DateInput";
import { TimeInput } from "@/components/ui/TimeInput";
import ClassCard from "./ClassCard";
import { formatVnDate } from "@/lib/formatters";

const MISSED_ALERT_SCROLL_THRESHOLD = 4;
/** ~4 collapsed accordion rows (header + gap). */
const MISSED_ALERT_LIST_MAX_HEIGHT = "max-h-[16.5rem]";

type AlertDraft = {
  date: string;
  startTime: string;
  endTime: string;
  reason: string;
};

type MissedTeachingAlertsCardProps = {
  alerts: MissedTeachingAlert[];
  canCreateMakeup?: boolean;
  createMakeupFn?: (
    classId: string,
    payload: ClassScopedMakeupScheduleEventPayload,
  ) => Promise<MakeupScheduleEventRecord>;
  saveExplanationFn?: (
    classId: string,
    payload: CreateMissedTeachingExplanationPayload,
  ) => Promise<MissedTeachingExplanationRecord>;
  updateExplanationFn?: (
    explanationId: string,
    payload: UpdateMissedTeachingExplanationPayload,
  ) => Promise<MissedTeachingExplanationRecord>;
  onChanged?: () => Promise<void> | void;
  getClassHref?: (classId: string) => string;
};

function getTodayDateValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function formatDateLabel(value: string) {
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return formatVnDate(parsed);
}

function formatTime(value?: string | null) {
  if (!value) return "--:--";
  return value.slice(0, 5);
}

function createDefaultDraft(alert: MissedTeachingAlert): AlertDraft {
  return {
    date: getTodayDateValue(),
    startTime: formatTime(alert.scheduledStartTime),
    endTime: alert.scheduledEndTime
      ? formatTime(alert.scheduledEndTime)
      : formatTime(alert.scheduledStartTime),
    reason: alert.explanation?.reason ?? "",
  };
}

function AlertStatusBadge({ alert }: { alert: MissedTeachingAlert }) {
  if (alert.status === "explained_pending_makeup") {
    return (
      <span className="rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-[11px] font-semibold text-warning">
        Đã giải trình · chưa bù
      </span>
    );
  }

  return (
    <span className="rounded-full border border-error/25 bg-error/10 px-2 py-0.5 text-[11px] font-semibold text-error">
      Chưa giải trình
    </span>
  );
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      className={`mt-0.5 size-4 shrink-0 text-text-muted transition-transform ${expanded ? "rotate-180" : ""}`}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

export default function MissedTeachingAlertsCard({
  alerts,
  canCreateMakeup = false,
  createMakeupFn,
  saveExplanationFn,
  updateExplanationFn,
  onChanged,
  getClassHref,
}: MissedTeachingAlertsCardProps) {
  const [drafts, setDrafts] = useState<Record<string, AlertDraft>>({});
  const [submittingAction, setSubmittingAction] = useState<string | null>(null);
  const [expandedAlertId, setExpandedAlertId] = useState<string | null>(null);
  const visibleAlerts = useMemo(() => alerts.filter(Boolean), [alerts]);

  if (visibleAlerts.length === 0) {
    return null;
  }

  const shouldScrollList = visibleAlerts.length > MISSED_ALERT_SCROLL_THRESHOLD;

  const toggleExpanded = (alertId: string) => {
    setExpandedAlertId((current) => (current === alertId ? null : alertId));
  };

  const updateDraft = (
    alert: MissedTeachingAlert,
    patch: Partial<AlertDraft>,
  ) => {
    setDrafts((current) => ({
      ...current,
      [alert.id]: {
        ...(current[alert.id] ?? createDefaultDraft(alert)),
        ...patch,
      },
    }));
  };

  const handleSaveExplanation = async (alert: MissedTeachingAlert) => {
    const draft = drafts[alert.id] ?? createDefaultDraft(alert);
    const reason = draft.reason.trim();
    if (!reason) {
      toast.error("Vui lòng nhập lý do giải trình.");
      return;
    }

    const actionKey = `explain:${alert.id}`;
    setSubmittingAction(actionKey);
    try {
      if (alert.status === "explained_pending_makeup" && alert.explanation?.id) {
        if (!updateExplanationFn) {
          toast.error("Không có quyền sửa giải trình.");
          return;
        }
        await updateExplanationFn(alert.explanation.id, { reason });
        toast.success("Đã cập nhật giải trình.");
      } else {
        if (!saveExplanationFn) {
          toast.error("Không có quyền lưu giải trình.");
          return;
        }
        await saveExplanationFn(alert.classId, {
          scheduleEntryId: alert.scheduleEntryId,
          originalDate: alert.originalDate,
          teacherId: alert.teacherId,
          reason,
        });
        toast.success("Đã lưu giải trình.");
      }

      await onChanged?.();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Không thể lưu giải trình.";
      toast.error(message);
    } finally {
      setSubmittingAction(null);
    }
  };

  const handleCreateMakeup = async (alert: MissedTeachingAlert) => {
    if (!createMakeupFn) {
      toast.error("Không có quyền tạo buổi bù.");
      return;
    }

    if (alert.status !== "explained_pending_makeup" || !alert.explanation?.id) {
      toast.error("Vui lòng lưu giải trình vắng trước khi xếp lịch bù.");
      return;
    }

    const draft = drafts[alert.id] ?? createDefaultDraft(alert);
    const actionKey = `makeup:${alert.id}`;
    setSubmittingAction(actionKey);
    try {
      await createMakeupFn(alert.classId, {
        teacherId: alert.teacherId,
        date: draft.date,
        startTime: draft.startTime,
        endTime: draft.endTime,
        note: "",
        baselineScheduleEntryId: alert.scheduleEntryId,
        originalDate: alert.originalDate,
      });
      toast.success("Đã xếp lịch bù.");
      setDrafts((current) => {
        const next = { ...current };
        delete next[alert.id];
        return next;
      });
      setExpandedAlertId((current) => (current === alert.id ? null : current));
      await onChanged?.();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Không thể xếp lịch bù.";
      toast.error(message);
    } finally {
      setSubmittingAction(null);
    }
  };

  return (
    <ClassCard
      title={`Cảnh báo chưa dạy (${visibleAlerts.length})`}
      className="w-full border-warning/35 bg-warning/5"
    >
      <div
        className={`space-y-2 ${shouldScrollList ? `${MISSED_ALERT_LIST_MAX_HEIGHT} overflow-y-auto overscroll-contain pr-1` : ""}`}
      >
        {visibleAlerts.map((alert) => {
          const draft = drafts[alert.id] ?? createDefaultDraft(alert);
          const isExpanded = expandedAlertId === alert.id;
          const isExplained = alert.status === "explained_pending_makeup";
          const canEditExplanation =
            !isExplained || (alert.explanation?.canEdit ?? false);
          const classLabel = getClassHref ? (
            <Link
              href={getClassHref(alert.classId)}
              className="font-semibold text-primary hover:text-primary-hover"
              onClick={(event) => event.stopPropagation()}
            >
              {alert.className}
            </Link>
          ) : (
            <span className="font-semibold text-text-primary">{alert.className}</span>
          );

          return (
            <article
              key={alert.id}
              className="overflow-hidden rounded-lg border border-warning/25 bg-bg-surface"
            >
              <button
                type="button"
                onClick={() => toggleExpanded(alert.id)}
                aria-expanded={isExpanded}
                className="flex w-full items-start gap-2 px-3 py-2.5 text-left transition-colors hover:bg-warning/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-inset"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2 text-sm text-text-primary">
                    {classLabel}
                    <span className="text-text-muted">·</span>
                    <span>{alert.teacherName ?? "Chưa rõ gia sư"}</span>
                    <AlertStatusBadge alert={alert} />
                  </div>
                  <div className="text-xs text-text-secondary">
                    Buổi gốc {formatDateLabel(alert.originalDate)} ·{" "}
                    {formatTime(alert.scheduledStartTime)}
                    {alert.scheduledEndTime ? `-${formatTime(alert.scheduledEndTime)}` : ""}
                  </div>
                </div>
                <ChevronIcon expanded={isExpanded} />
              </button>

              {isExpanded ? (
                <div className="border-t border-warning/20 px-3 py-3">
                  {canCreateMakeup ? (
                    <div className="grid gap-3 lg:grid-cols-2">
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-text-secondary">Lý do giải trình</p>
                        <textarea
                          value={draft.reason}
                          onChange={(event) =>
                            updateDraft(alert, { reason: event.target.value })
                          }
                          aria-label="Nhập lý do giải trình"
                          placeholder="Nhập lý do giải trình"
                          readOnly={!canEditExplanation}
                          className="min-h-20 w-full rounded-md border border-border-default bg-bg-primary px-3 py-2 text-sm text-text-primary outline-none transition focus:border-border-focus focus:ring-2 focus:ring-border-focus/25 read-only:cursor-default read-only:opacity-80"
                          required
                        />
                        {canEditExplanation ? (
                          <button
                            type="button"
                            onClick={() => handleSaveExplanation(alert)}
                            disabled={submittingAction === `explain:${alert.id}`}
                            className="inline-flex min-h-10 w-full items-center justify-center rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm font-semibold text-primary transition hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {submittingAction === `explain:${alert.id}`
                              ? "Đang lưu..."
                              : isExplained
                                ? "Lưu thay đổi giải trình"
                                : "Lưu giải trình"}
                          </button>
                        ) : null}
                      </div>

                      <div className="space-y-2">
                        <p className="text-xs font-medium text-text-secondary">Xếp lịch bù</p>
                        <div className="grid gap-2 sm:grid-cols-[1fr_0.8fr_0.8fr]">
                          <DateInput
                            value={draft.date}
                            onChange={(event) => updateDraft(alert, { date: event.target.value })}
                            className="min-h-10 rounded-md border border-border-default bg-bg-primary px-3 py-2 text-sm text-text-primary outline-none transition focus:border-border-focus focus:ring-2 focus:ring-border-focus/25"
                            aria-label="Ngày học bù"
                          />
                          <TimeInput
                            value={draft.startTime}
                            onChange={(event) =>
                              updateDraft(alert, { startTime: event.target.value })
                            }
                            className="min-h-10 rounded-md border border-border-default bg-bg-primary px-3 py-2 text-sm text-text-primary outline-none transition focus:border-border-focus focus:ring-2 focus:ring-border-focus/25"
                            aria-label="Giờ bắt đầu học bù"
                          />
                          <TimeInput
                            value={draft.endTime}
                            onChange={(event) =>
                              updateDraft(alert, { endTime: event.target.value })
                            }
                            className="min-h-10 rounded-md border border-border-default bg-bg-primary px-3 py-2 text-sm text-text-primary outline-none transition focus:border-border-focus focus:ring-2 focus:ring-border-focus/25"
                            aria-label="Giờ kết thúc học bù"
                          />
                          <button
                            type="button"
                            onClick={() => handleCreateMakeup(alert)}
                            disabled={submittingAction === `makeup:${alert.id}`}
                            className="inline-flex min-h-10 items-center justify-center rounded-md bg-primary px-3 py-2 text-sm font-semibold text-white transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60 sm:col-span-3"
                          >
                            {submittingAction === `makeup:${alert.id}`
                              ? "Đang xếp..."
                              : "Xếp lịch bù"}
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : isExplained && alert.explanation ? (
                    <div className="rounded-md border border-border-default bg-bg-primary px-3 py-2 text-sm text-text-primary">
                      <p className="text-xs font-medium text-text-secondary">Lý do giải trình</p>
                      <p className="mt-1 whitespace-pre-wrap">{alert.explanation.reason}</p>
                    </div>
                  ) : (
                    <p className="text-sm text-text-secondary">
                      Buổi này chưa có giải trình vắng.
                    </p>
                  )}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </ClassCard>
  );
}
