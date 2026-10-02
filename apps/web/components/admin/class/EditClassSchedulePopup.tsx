"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ClassDetail, ClassScheduleItem } from "@/dtos/class.dto";
import * as classApi from "@/lib/apis/class.api";
import {
  CLASS_SCHEDULE_DAY_OPTIONS,
  normalizeDayOfWeek,
  normalizeTimeOnly,
} from "@/lib/class.helpers";
import { createClientId } from "@/lib/client-id";
import {
  classEditorModalBodyClassName,
  classEditorModalClassName,
  classEditorModalCloseButtonClassName,
  classEditorModalFooterClassName,
  classEditorModalHeaderClassName,
  classEditorModalPrimaryButtonClassName,
  classEditorModalSecondaryButtonClassName,
  classEditorModalTitleClassName,
} from "./classEditorModalStyles";
import { TimeInput } from "@/components/ui/TimeInput";
import { DateInput } from "@/components/ui/DateInput";
import UpgradedSelect from "@/components/ui/UpgradedSelect";
import { runBackgroundSave } from "@/lib/mutation-feedback";

type ScheduleRangeForm = {
  id: string;
  persistedId?: string;
  dayOfWeek: number;
  from: string;
  to: string;
  teacherId: string;
  /** Ngày slot có hiệu lực (YYYY-MM-DD). Để trống = backend dùng hôm nay. */
  effectiveFrom: string;
  /** Giá trị effectiveFrom gốc từ server, dùng để phát hiện admin có sửa hay không. */
  initialEffectiveFrom: string;
};

type ScheduleTeacherOption = {
  id: string;
  fullName?: string | null;
};

const EMPTY_SCHEDULE_RANGE = {
  dayOfWeek: 1,
  from: "",
  to: "",
  teacherId: "",
  effectiveFrom: "",
} as const;

type Props = {
  open: boolean;
  onClose: () => void;
  classDetail: ClassDetail;
  teachers?: ScheduleTeacherOption[];
  allowTeacherSelection?: boolean;
  defaultTeacherId?: string;
  readOnly?: boolean;
  /** Chỉ Admin/Trợ lý được sửa "Ngày hiệu lực" backdate; gia sư tự sửa lịch luôn dùng now(). Mặc định true. */
  allowEffectiveFromEdit?: boolean;
  onSubmitSchedule?: (data: {
    schedule: ClassScheduleItem[];
    removedEntryIds?: string[];
    expectedUpdatedAt?: string;
  }) => Promise<unknown>;
  onScheduleSaved?: () => Promise<unknown> | void;
};

function createScheduleRange(
  range?: Partial<
    Pick<
      ScheduleRangeForm,
      "id" | "dayOfWeek" | "from" | "to" | "teacherId" | "effectiveFrom"
    >
  >,
  fallbackTeacherId?: string,
): ScheduleRangeForm {
  return {
    id: `local-slot-${createClientId()}`,
    persistedId: range?.id,
    dayOfWeek: normalizeDayOfWeek(range?.dayOfWeek, EMPTY_SCHEDULE_RANGE.dayOfWeek),
    from: range?.from ?? EMPTY_SCHEDULE_RANGE.from,
    to: range?.to ?? EMPTY_SCHEDULE_RANGE.to,
    teacherId: range?.teacherId ?? fallbackTeacherId ?? EMPTY_SCHEDULE_RANGE.teacherId,
    effectiveFrom: range?.effectiveFrom ?? EMPTY_SCHEDULE_RANGE.effectiveFrom,
    initialEffectiveFrom: range?.effectiveFrom ?? EMPTY_SCHEDULE_RANGE.effectiveFrom,
  };
}

function normalizeSchedule(
  schedule: unknown,
  fallbackTeacherId?: string,
): ScheduleRangeForm[] {
  if (!Array.isArray(schedule)) return [];
  return schedule.reduce<ScheduleRangeForm[]>((acc, item) => {
    if (!item || typeof item !== "object") return acc;
    const record = item as Record<string, unknown>;
    if (record.deletedAt) return acc;
    const from = normalizeTimeOnly(typeof record.from === "string" ? record.from : "");
    const to = normalizeTimeOnly(typeof record.to === "string" ? record.to : "");
    const dayOfWeek = normalizeDayOfWeek(record.dayOfWeek, EMPTY_SCHEDULE_RANGE.dayOfWeek);
    const teacherId =
      typeof record.teacherId === "string" ? record.teacherId : fallbackTeacherId;
    const effectiveFrom =
      typeof record.effectiveFrom === "string" ? record.effectiveFrom : undefined;
    if (!from && !to) return acc;
    return [
      ...acc,
      createScheduleRange(
        {
          id: typeof record.id === "string" ? record.id : undefined,
          dayOfWeek,
          from,
          to,
          teacherId,
          effectiveFrom,
        },
        fallbackTeacherId,
      ),
    ];
  }, []);
}

function parseTimeToSeconds(value: string): number | null {
  const matched = value.match(/^(\d{2}):(\d{2}):(\d{2})$/);
  if (!matched) return null;
  const [, hoursRaw, minutesRaw, secondsRaw] = matched;
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);
  const seconds = Number(secondsRaw);
  if (hours > 23 || minutes > 59 || seconds > 59) return null;
  return hours * 3600 + minutes * 60 + seconds;
}

function buildSchedulePayload(
  scheduleRanges: ScheduleRangeForm[],
  allowEffectiveFromEdit: boolean,
): ClassScheduleItem[] {
  return scheduleRanges.reduce<ClassScheduleItem[]>((acc, range) => {
    if (!range.from && !range.to) return acc;
    if ((range.from && !range.to) || (!range.from && range.to)) {
      throw new Error("Mỗi dòng lịch học cần đủ cả thời gian bắt đầu và kết thúc.");
    }
    const from = normalizeTimeOnly(range.from);
    const to = normalizeTimeOnly(range.to);
    const fromSeconds = parseTimeToSeconds(from);
    const toSeconds = parseTimeToSeconds(to);
    if (!from || !to || fromSeconds == null || toSeconds == null) {
      throw new Error("Khung giờ học phải dùng định dạng HH:mm:ss.");
    }
    if (fromSeconds >= toSeconds) {
      throw new Error("Thời gian lịch học không hợp lệ (bắt đầu phải nhỏ hơn kết thúc).");
    }
    if (!range.teacherId.trim()) {
      throw new Error("Mỗi khung giờ học phải chọn gia sư chịu trách nhiệm.");
    }
    return [
      ...acc,
      {
        ...(range.persistedId ? { id: range.persistedId } : {}),
        dayOfWeek: range.dayOfWeek,
        from,
        to,
        teacherId: range.teacherId,
        ...(allowEffectiveFromEdit && range.effectiveFrom !== range.initialEffectiveFrom
          ? { effectiveFrom: range.effectiveFrom || undefined }
          : {}),
      },
    ];
  }, []);
}

export default function EditClassSchedulePopup({
  open,
  onClose,
  classDetail,
  teachers,
  allowTeacherSelection,
  defaultTeacherId,
  readOnly,
  allowEffectiveFromEdit,
  onSubmitSchedule,
  onScheduleSaved,
}: Props) {
  if (!open) return null;

  return (
    <EditClassScheduleDialog
      onClose={onClose}
      classDetail={classDetail}
      teachers={teachers}
      allowTeacherSelection={allowTeacherSelection}
      defaultTeacherId={defaultTeacherId}
      readOnly={readOnly}
      allowEffectiveFromEdit={allowEffectiveFromEdit}
      onSubmitSchedule={onSubmitSchedule}
      onScheduleSaved={onScheduleSaved}
    />
  );
}

function EditClassScheduleDialog({
  onClose,
  classDetail,
  teachers = [],
  allowTeacherSelection = true,
  defaultTeacherId,
  readOnly = false,
  allowEffectiveFromEdit = true,
  onSubmitSchedule,
  onScheduleSaved,
}: Omit<Props, "open">) {
  const queryClient = useQueryClient();
  const resolvedDefaultTeacherId =
    defaultTeacherId ?? (teachers.length === 1 ? teachers[0]?.id ?? "" : "");
  // Chế độ gia sư tự sửa lịch (allowTeacherSelection=false + có defaultTeacherId): chỉ
  // load/hiển thị đúng slot của gia sư đó, không đụng tới slot của gia sư khác trong lớp.
  const scopeTeacherId =
    !allowTeacherSelection && defaultTeacherId ? defaultTeacherId : undefined;
  const buildInitialRanges = () => {
    const normalized = normalizeSchedule(
      classDetail.schedule,
      resolvedDefaultTeacherId,
    ).filter((range) => !scopeTeacherId || range.teacherId === scopeTeacherId);
    return normalized.length > 0
      ? normalized
      : [createScheduleRange(undefined, resolvedDefaultTeacherId)];
  };
  const [scheduleRanges, setScheduleRanges] =
    useState<ScheduleRangeForm[]>(buildInitialRanges);
  // Id các slot đang active lúc mở dialog (trong phạm vi được sửa) — dùng để tính
  // slot nào bị người dùng chủ động xoá, gửi tường minh qua `removedEntryIds` thay
  // vì suy luận "vắng mặt trong payload = bị xoá" (nguyên nhân gây lost-update).
  const [initialPersistedIds] = useState<Set<string>>(
    () =>
      new Set(
        buildInitialRanges()
          .map((range) => range.persistedId)
          .filter((id): id is string => Boolean(id)),
      ),
  );
  const teacherOptions = teachers.map((teacher) => ({
    value: teacher.id,
    label: teacher.fullName?.trim() || "—",
    selectedLabel: teacher.fullName?.trim() || "—",
  }));
  const canAddRange = allowTeacherSelection || Boolean(resolvedDefaultTeacherId);

  const getTeacherLabel = (teacherId?: string) =>
    teachers.find((teacher) => teacher.id === teacherId)?.fullName?.trim() ||
    (teacherId ? "Không còn trong danh sách gia sư của lớp" : "Chưa phân công");

  const handleSubmit = () => {
    if (readOnly) {
      onClose();
      return;
    }
    let schedulePayload: ClassScheduleItem[];
    try {
      schedulePayload = buildSchedulePayload(scheduleRanges, allowEffectiveFromEdit);
    } catch (error) {
      toast.error((error as Error).message || "Không thể lưu lịch học.");
      return;
    }
    const survivingPersistedIds = new Set(
      scheduleRanges
        .map((range) => range.persistedId)
        .filter((id): id is string => Boolean(id)),
    );
    const removedEntryIds = Array.from(initialPersistedIds).filter(
      (id) => !survivingPersistedIds.has(id),
    );
    onClose();
    runBackgroundSave({
      loadingMessage: "Đang lưu khung giờ học...",
      successMessage: "Đã lưu khung giờ học.",
      errorMessage: "Không thể cập nhật lịch học.",
      action: () =>
        onSubmitSchedule
          ? onSubmitSchedule({
              schedule: schedulePayload,
              removedEntryIds: removedEntryIds.length ? removedEntryIds : undefined,
              expectedUpdatedAt: classDetail.updatedAt,
            })
          : classApi.updateClassSchedule(classDetail.id, {
              schedule: schedulePayload,
              removedEntryIds: removedEntryIds.length ? removedEntryIds : undefined,
              expectedUpdatedAt: classDetail.updatedAt,
            }),
      onSuccess: async (result) => {
        const resObj = result as Record<string, unknown> | null;
        if (resObj && "warnings" in resObj && Array.isArray(resObj.warnings)) {
          resObj.warnings.forEach((warning) => {
            toast.warning(String(warning), { duration: 10000 });
          });
        }
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["class", "detail", classDetail.id] }),
          queryClient.invalidateQueries({ queryKey: ["class", "list"] }),
          Promise.resolve(onScheduleSaved?.()),
        ]);
      },
      onError: async () => {
        // 409 = lịch vừa bị người khác cập nhật (optimistic lock) → refetch để
        // người dùng thấy state mới nhất thay vì thao tác tiếp trên state cũ.
        await queryClient.invalidateQueries({
          queryKey: ["class", "detail", classDetail.id],
        });
      },
    });
  };

  const handleAddRange = () => {
    if (!canAddRange) {
      toast.error("Không thể thêm khung giờ mới khi chưa xác định được gia sư chịu trách nhiệm.");
      return;
    }

    setScheduleRanges((prev) => [
      ...prev,
      createScheduleRange(undefined, resolvedDefaultTeacherId),
    ]);
  };

  const handleRemoveRange = (id: string) => {
    setScheduleRanges((prev) => {
      if (prev.length === 1) return [createScheduleRange(undefined, resolvedDefaultTeacherId)];
      return prev.filter((item) => item.id !== id);
    });
  };

  const handleChangeRange = (
    id: string,
    field: keyof Pick<ScheduleRangeForm, "from" | "to">,
    value: string,
  ) => {
    const normalizedValue = normalizeTimeOnly(value);
    setScheduleRanges((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: normalizedValue } : item)),
    );
  };

  const handleDayChange = (id: string, dayOfWeek: number) => {
    setScheduleRanges((prev) =>
      prev.map((item) => (item.id === id ? { ...item, dayOfWeek } : item)),
    );
  };

  const handleTeacherChange = (id: string, teacherId: string) => {
    setScheduleRanges((prev) =>
      prev.map((item) => (item.id === id ? { ...item, teacherId } : item)),
    );
  };

  const handleEffectiveFromChange = (id: string, effectiveFrom: string) => {
    setScheduleRanges((prev) =>
      prev.map((item) => (item.id === id ? { ...item, effectiveFrom } : item)),
    );
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-bg-primary/75" aria-hidden onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-class-schedule-title"
        className={`${classEditorModalClassName} overscroll-contain`}
      >
        <div className={classEditorModalHeaderClassName}>
          <h2 id="edit-class-schedule-title" className={classEditorModalTitleClassName}>
            {readOnly ? "Xem khung giờ học" : "Chỉnh sửa khung giờ học"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className={classEditorModalCloseButtonClassName}
            aria-label="Đóng"
          >
            <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className={`${classEditorModalBodyClassName} pr-0 sm:pr-1`}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <p className="text-xs text-text-muted">Định dạng HH:mm:ss.</p>
              {!allowTeacherSelection ? (
                <p className="text-xs text-text-muted">
                  {readOnly
                    ? "Form đang ở chế độ chỉ xem."
                    : "Gia sư chịu trách nhiệm được giữ theo phân công hiện tại ở staff shell."}
                </p>
              ) : null}
            </div>
            {!readOnly ? (
              <button
                type="button"
                onClick={handleAddRange}
                disabled={!canAddRange}
                className="min-h-11 w-full rounded-md border border-border-default bg-bg-surface px-3 py-1.5 text-sm font-medium text-text-primary transition-colors hover:bg-bg-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus sm:min-h-0 sm:w-auto"
              >
                + Thêm khung giờ
              </button>
            ) : null}
          </div>
          <div className="space-y-3">
            {scheduleRanges.map((range, index) => (
              <div
                key={range.id}
                className="rounded-xl border border-border-default bg-bg-surface p-3 shadow-sm sm:p-4"
              >
                <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
                    Khung {String(index + 1).padStart(2, "0")}
                  </p>
                  {!readOnly ? (
                    <button
                      type="button"
                      onClick={() => handleRemoveRange(range.id)}
                      className="min-h-11 w-full rounded-md border border-border-default px-3 py-1.5 text-sm font-medium text-text-muted transition-colors hover:bg-error/15 hover:text-error focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus sm:min-h-0 sm:w-auto"
                    >
                      Xóa
                    </button>
                  ) : null}
                </div>
                <div className="grid gap-3 sm:grid-cols-[auto_1fr_auto_1fr] sm:items-end">
                  <label className="flex flex-col gap-1 text-sm text-text-secondary">
                    <span className="text-[11px] uppercase tracking-wider text-text-muted">Ngày</span>
                    <UpgradedSelect
                      name={`edit-class-schedule-day-${range.id}`}
                      value={String(range.dayOfWeek)}
                      onValueChange={(value) =>
                        handleDayChange(range.id, normalizeDayOfWeek(value))
                      }
                      options={CLASS_SCHEDULE_DAY_OPTIONS.map((option) => ({
                        value: option.value,
                        label: option.label,
                        selectedLabel: option.selectedLabel,
                      }))}
                      disabled={readOnly}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm text-text-secondary">
                    <span className="text-[11px] uppercase tracking-wider text-text-muted">Bắt đầu</span>
                    <TimeInput
                      name={`edit-class-schedule-from-${range.id}`}
                      value={range.from}
                      autoComplete="off"
                      onChange={(e) => handleChangeRange(range.id, "from", e.target.value)}
                      disabled={readOnly}
                      className="rounded-md border border-border-default bg-bg-surface px-3 py-2 font-mono text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                    />
                  </label>
                  <div className="flex items-center justify-center pb-2 text-text-muted" aria-hidden>
                    <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14m-4-4 4 4-4 4" />
                    </svg>
                  </div>
                  <label className="flex flex-col gap-1 text-sm text-text-secondary">
                    <span className="text-[11px] uppercase tracking-wider text-text-muted">Kết thúc</span>
                    <TimeInput
                      name={`edit-class-schedule-to-${range.id}`}
                      value={range.to}
                      autoComplete="off"
                      onChange={(e) => handleChangeRange(range.id, "to", e.target.value)}
                      disabled={readOnly}
                      className="rounded-md border border-border-default bg-bg-surface px-3 py-2 font-mono text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm text-text-secondary sm:col-span-4">
                    <span className="text-[11px] uppercase tracking-wider text-text-muted">
                      Gia sư chịu trách nhiệm
                    </span>
                    {allowTeacherSelection ? (
                      <UpgradedSelect
                        name={`edit-class-schedule-teacher-${range.id}`}
                        value={range.teacherId}
                        onValueChange={(value) => handleTeacherChange(range.id, value)}
                        options={teacherOptions}
                        placeholder="Chọn gia sư phụ trách"
                        emptyStateLabel="Lớp chưa có gia sư để gán."
                        disabled={readOnly}
                      />
                    ) : (
                      <div className="rounded-md border border-border-default bg-bg-surface px-3 py-2 text-sm text-text-primary">
                        {getTeacherLabel(range.teacherId || resolvedDefaultTeacherId)}
                      </div>
                    )}
                  </label>
                  {!readOnly && allowEffectiveFromEdit ? (
                    <label className="flex flex-col gap-1 text-sm text-text-secondary sm:col-span-4">
                      <span className="text-[11px] uppercase tracking-wider text-text-muted">
                        Ngày hiệu lực (tuỳ chọn)
                      </span>
                      <DateInput
                        name={`edit-class-schedule-effective-from-${range.id}`}
                        value={range.effectiveFrom}
                        onChange={(e) =>
                          handleEffectiveFromChange(range.id, e.target.value)
                        }
                        className="rounded-md border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                      />
                      <span className="text-[11px] text-text-muted">
                        Bỏ trống = tính từ hôm nay.
                      </span>
                    </label>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className={classEditorModalFooterClassName}>
          <button
            type="button"
            onClick={onClose}
            className={classEditorModalSecondaryButtonClassName}
          >
            {readOnly ? "Đóng" : "Hủy"}
          </button>
          {!readOnly ? (
            <button
              type="button"
              onClick={handleSubmit}
              className={classEditorModalPrimaryButtonClassName}
            >
              Lưu
            </button>
          ) : null}
        </div>
      </div>
    </>
  );
}
