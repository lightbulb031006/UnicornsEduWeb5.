"use client";

import { useState, type SyntheticEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { TimeInput } from "@/components/ui/TimeInput";
import UpgradedSelect from "@/components/ui/UpgradedSelect";
import type { ClassScheduleItem, ClassStatus } from "@/dtos/class.dto";
import CourseSelect from "@/components/shared/class/CourseSelect";
import type { StaffOpsCreateClassPayload } from "@/dtos/staff-ops.dto";
import * as staffOpsApi from "@/lib/apis/staff-ops.api";
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
} from "@/components/admin/class/classEditorModalStyles";

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated?: (classId: string) => void;
};

type ScheduleRangeForm = {
  id: string;
  dayOfWeek: number;
  from: string;
  to: string;
};

const STATUS_OPTIONS: Array<{ value: ClassStatus; label: string }> = [
  { value: "running", label: "Đang chạy" },
  { value: "ended", label: "Đã kết thúc" },
];

function createScheduleRange(
  initial?: Partial<Pick<ScheduleRangeForm, "dayOfWeek" | "from" | "to">>,
): ScheduleRangeForm {
  return {
    id: `local-slot-${createClientId()}`,
    dayOfWeek: normalizeDayOfWeek(initial?.dayOfWeek, 1),
    from: initial?.from ?? "",
    to: initial?.to ?? "",
  };
}

function parseTimeToSeconds(value: string): number | null {
  const matched = value.match(/^(\d{2}):(\d{2}):(\d{2})$/);
  if (!matched) return null;
  const hours = Number(matched[1]);
  const minutes = Number(matched[2]);
  const seconds = Number(matched[3]);
  if (hours > 23 || minutes > 59 || seconds > 59) return null;
  return hours * 3600 + minutes * 60 + seconds;
}

function buildSchedulePayload(scheduleRanges: ScheduleRangeForm[]): ClassScheduleItem[] {
  return scheduleRanges.reduce<ClassScheduleItem[]>((acc, range) => {
    if (!range.from && !range.to) return acc;
    if ((range.from && !range.to) || (!range.from && range.to)) {
      throw new Error("Mỗi khung giờ cần đủ giờ bắt đầu và kết thúc.");
    }

    const from = normalizeTimeOnly(range.from);
    const to = normalizeTimeOnly(range.to);
    const fromSeconds = parseTimeToSeconds(from);
    const toSeconds = parseTimeToSeconds(to);
    if (!from || !to || fromSeconds == null || toSeconds == null || fromSeconds >= toSeconds) {
      throw new Error("Khung giờ học không hợp lệ.");
    }

    return [...acc, { dayOfWeek: range.dayOfWeek, from, to }];
  }, []);
}

export default function StaffCreateClassPopup({
  open,
  onClose,
  onCreated,
}: Props) {
  if (!open) return null;

  return <StaffCreateClassDialog onClose={onClose} onCreated={onCreated} />;
}

function StaffCreateClassDialog({
  onClose,
  onCreated,
}: Omit<Props, "open">) {
  const formId = "staff-create-class-form";
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [courseId, setCourseId] = useState("");
  const [status, setStatus] = useState<ClassStatus>("running");
  const [scheduleRanges, setScheduleRanges] = useState<ScheduleRangeForm[]>([
    createScheduleRange(),
  ]);

  const createMutation = useMutation({
    mutationFn: (payload: StaffOpsCreateClassPayload) =>
      staffOpsApi.createClass(payload),
    onSuccess: async (createdClass) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["staff-ops", "class", "list"] }),
        queryClient.invalidateQueries({ queryKey: ["staff-ops", "class", "detail", createdClass.id] }),
      ]);
      toast.success("Đã tạo lớp mới cho quy trình vận hành.");
      onCreated?.(createdClass.id);
      onClose();
    },
    onError: (error: unknown) => {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (error as Error)?.message ??
        "Không thể tạo lớp.";
      toast.error(message);
    },
  });

  const handleAddRange = () => {
    setScheduleRanges((prev) => [...prev, createScheduleRange()]);
  };

  const handleRemoveRange = (id: string) => {
    setScheduleRanges((prev) =>
      prev.length === 1 ? [createScheduleRange()] : prev.filter((item) => item.id !== id),
    );
  };

  const handleChangeRange = (id: string, field: "from" | "to", value: string) => {
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

  const handleSubmit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error("Tên lớp là bắt buộc.");
      return;
    }
    if (!courseId) {
      toast.error("Khoá học là bắt buộc.");
      return;
    }

    let schedule: ClassScheduleItem[] | undefined;
    try {
      const builtSchedule = buildSchedulePayload(scheduleRanges);
      schedule = builtSchedule.length > 0 ? builtSchedule : undefined;
    } catch (error) {
      toast.error((error as Error).message || "Khung giờ học không hợp lệ.");
      return;
    }

    try {
      await createMutation.mutateAsync({
        name: trimmedName,
        ...(courseId ? { course_id: courseId } : {}),
        status,
        schedule,
      });
    } catch {
      // handled in onError
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-bg-primary/75" aria-hidden onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="staff-create-class-title"
        className={`${classEditorModalClassName} overscroll-contain`}
      >
        <div className={classEditorModalHeaderClassName}>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-primary">
              Staff Ops
            </p>
            <h2 id="staff-create-class-title" className={classEditorModalTitleClassName}>
              Tạo lớp với metadata tối thiểu
            </h2>
            <p className="mt-2 text-sm text-text-muted">
              Staff chỉ khởi tạo tên lớp, trạng thái, loại lớp và khung giờ. Học
              sinh, giáo viên và tài chính sẽ được xử lý ở luồng admin.
            </p>
          </div>
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

        <form id={formId} onSubmit={handleSubmit} className={classEditorModalBodyClassName}>
          <section className="rounded-2xl border border-border-default bg-bg-secondary/60 p-4">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm text-text-secondary md:col-span-2">
                <span>Tên lớp</span>
                <input
                  name="staff-create-class-name"
                  value={name}
                  autoComplete="off"
                  onChange={(event) => setName(event.target.value)}
                  className="rounded-xl border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                  placeholder="Ví dụ: Math 10A - tối T3/T5"
                  required
                />
              </label>

              <label className="flex flex-col gap-1 text-sm text-text-secondary">
                <span>Khoá học</span>
                <CourseSelect
                  name="staff-create-class-type"
                  value={courseId}
                  onValueChange={setCourseId}
                  buttonClassName="rounded-xl border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                />
              </label>

              <label className="flex flex-col gap-1 text-sm text-text-secondary">
                <span>Trạng thái</span>
                <UpgradedSelect
                  name="staff-create-class-status"
                  value={status}
                  onValueChange={(nextValue) => setStatus(nextValue as ClassStatus)}
                  options={STATUS_OPTIONS}
                  buttonClassName="rounded-xl border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                />
              </label>
            </div>
          </section>

          <section className="rounded-2xl border border-border-default bg-bg-secondary/60 p-4">
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-text-muted">
                  Khung giờ học
                </h3>
                <p className="mt-1 text-xs text-text-muted">
                  Có thể để trống nếu chưa chốt lịch, hoặc nhập nhiều khung ngay từ lúc tạo.
                </p>
              </div>
              <button
                type="button"
                onClick={handleAddRange}
                className="min-h-11 rounded-xl border border-border-default bg-bg-surface px-3 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-bg-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus sm:min-h-0"
              >
                + Thêm khung giờ
              </button>
            </div>

            <div className="space-y-3">
              {scheduleRanges.map((range, index) => (
                <div
                  key={range.id}
                  className="rounded-[1.35rem] border border-border-default bg-bg-surface p-4"
                >
                  <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-text-muted">
                      Khung {String(index + 1).padStart(2, "0")}
                    </p>
                    <button
                      type="button"
                      onClick={() => handleRemoveRange(range.id)}
                      className="min-h-11 rounded-xl border border-border-default px-3 py-2 text-sm font-medium text-text-muted transition-colors hover:bg-error/10 hover:text-error focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus sm:min-h-0"
                    >
                      Xóa
                    </button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-[auto_1fr_auto_1fr] sm:items-end">
                    <label className="flex flex-col gap-1 text-sm text-text-secondary">
                      <span>Ngày</span>
                      <UpgradedSelect
                        name={`staff-create-class-schedule-day-${range.id}`}
                        value={String(range.dayOfWeek)}
                        onValueChange={(value) =>
                          handleDayChange(range.id, normalizeDayOfWeek(value))
                        }
                        options={CLASS_SCHEDULE_DAY_OPTIONS.map((option) => ({
                          value: option.value,
                          label: option.label,
                          selectedLabel: option.selectedLabel,
                        }))}
                        buttonClassName="rounded-xl border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-sm text-text-secondary">
                      <span>Bắt đầu</span>
                      <TimeInput
                        name={`staff-create-class-schedule-from-${range.id}`}
                        value={range.from}
                        autoComplete="off"
                        onChange={(event) => handleChangeRange(range.id, "from", event.target.value)}
                        className="rounded-xl border border-border-default bg-bg-surface px-3 py-2 font-mono text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                      />
                    </label>
                    <div className="flex items-center justify-center pb-2 text-text-muted" aria-hidden>
                      →
                    </div>
                    <label className="flex flex-col gap-1 text-sm text-text-secondary">
                      <span>Kết thúc</span>
                      <TimeInput
                        name={`staff-create-class-schedule-to-${range.id}`}
                        value={range.to}
                        autoComplete="off"
                        onChange={(event) => handleChangeRange(range.id, "to", event.target.value)}
                        className="rounded-xl border border-border-default bg-bg-surface px-3 py-2 font-mono text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </form>

        <div className={classEditorModalFooterClassName}>
          <button
            type="button"
            onClick={onClose}
            className={classEditorModalSecondaryButtonClassName}
          >
            Hủy
          </button>
          <button
            type="submit"
            form={formId}
            disabled={createMutation.isPending}
            className={classEditorModalPrimaryButtonClassName}
          >
            {createMutation.isPending ? "Đang tạo…" : "Tạo lớp"}
          </button>
        </div>
      </div>
    </>
  );
}
