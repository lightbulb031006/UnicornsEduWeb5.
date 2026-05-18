"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { TimeInput } from "@/components/ui/TimeInput";
import UpgradedSelect from "@/components/ui/UpgradedSelect";
import { ClassScheduleEvent } from "@/dtos/class-schedule.dto";
import * as classScheduleApi from "@/lib/apis/class-schedule.api";
import { invalidateCalendarScopedQueries } from "@/lib/query-invalidation";

type MakeupEventEditorPopupProps = {
  open: boolean;
  mode: "create" | "edit";
  event?: ClassScheduleEvent | null;
  defaultDate: string;
  onClose: () => void;
  onSaved?: () => void;
};

type FormState = {
  classId: string;
  teacherId: string;
  date: string;
  startTime: string;
  endTime: string;
  note: string;
};

const buildInitialState = (
  event: ClassScheduleEvent | null | undefined,
  defaultDate: string,
): FormState => ({
  classId: event?.classId ?? "",
  teacherId: event?.teacherIds?.[0] ?? "",
  date: event?.date ?? defaultDate,
  startTime: event?.startTime?.slice(0, 5) ?? "18:00",
  endTime: event?.endTime?.slice(0, 5) ?? "19:30",
  note: event?.note ?? event?.description ?? "",
});

export default function MakeupEventEditorPopup({
  open,
  mode,
  event,
  defaultDate,
  onClose,
  onSaved,
}: MakeupEventEditorPopupProps) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(() => buildInitialState(event, defaultDate));

  const { data: classesResponse, isLoading: isLoadingClasses } = useQuery({
    queryKey: ["calendar", "classes", "form"],
    queryFn: () => classScheduleApi.getClassesForFilter({ limit: 100 }),
    staleTime: 5 * 60 * 1000,
    enabled: open,
  });
  const { data: teachersResponse, isLoading: isLoadingTeachers } = useQuery({
    queryKey: ["calendar", "teachers", "form"],
    queryFn: () => classScheduleApi.getTeachersForFilter(100),
    staleTime: 5 * 60 * 1000,
    enabled: open,
  });

  const classOptions = useMemo(
    () => [
      { value: "", label: "Chọn lớp", selectedLabel: "Chọn lớp" },
      ...(classesResponse?.data ?? []).map((item) => ({
        value: item.id,
        label: item.name,
        selectedLabel: item.name,
      })),
    ],
    [classesResponse],
  );
  const teacherOptions = useMemo(
    () => [
      { value: "", label: "Chọn gia sư", selectedLabel: "Chọn gia sư" },
      ...(teachersResponse?.data ?? []).map((item) => ({
        value: item.id,
        label: item.fullName,
        selectedLabel: item.fullName,
      })),
    ],
    [teachersResponse],
  );

  const invalidateCalendar = async () => {
    await invalidateCalendarScopedQueries(queryClient);
  };

  const createMutation = useMutation({
    mutationFn: () =>
      classScheduleApi.createMakeupCalendarEvent({
        classId: form.classId,
        teacherId: form.teacherId,
        date: form.date,
        startTime: `${form.startTime}:00`,
        endTime: `${form.endTime}:00`,
        ...(form.note.trim() ? { note: form.note.trim() } : {}),
      }),
    onSuccess: async () => {
      await invalidateCalendar();
      toast.success("Đã tạo buổi bù.");
      onSaved?.();
      onClose();
    },
    onError: (error: Error) => {
      toast.error(error.message || "Không tạo được buổi bù.");
    },
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      classScheduleApi.updateMakeupCalendarEvent(event?.sourceEventId ?? event?.occurrenceId ?? "", {
        classId: form.classId,
        teacherId: form.teacherId,
        date: form.date,
        startTime: `${form.startTime}:00`,
        endTime: `${form.endTime}:00`,
        note: form.note.trim() || undefined,
      }),
    onSuccess: async () => {
      await invalidateCalendar();
      toast.success("Đã cập nhật buổi bù.");
      onSaved?.();
      onClose();
    },
    onError: (error: Error) => {
      toast.error(error.message || "Không cập nhật được buổi bù.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () =>
      classScheduleApi.deleteMakeupCalendarEvent(
        event?.sourceEventId ?? event?.occurrenceId ?? "",
      ),
    onSuccess: async () => {
      await invalidateCalendar();
      toast.success("Đã xoá buổi bù.");
      onSaved?.();
      onClose();
    },
    onError: (error: Error) => {
      toast.error(error.message || "Không xoá được buổi bù.");
    },
  });

  if (!open) {
    return null;
  }

  const isSubmitting =
    createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;
  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div
        className="absolute inset-0 bg-black/45 backdrop-blur-[1px]"
        aria-hidden
        onClick={() => {
          if (!isSubmitting) {
            onClose();
          }
        }}
      />

      <div className="relative z-10 flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-[1.75rem] border border-border-default bg-bg-surface shadow-2xl sm:rounded-2xl">
        <div className="mx-auto mt-3 h-1.5 w-14 rounded-full bg-border-default sm:hidden" />

        <div className="overflow-y-auto p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary/85">
                Admin Only
              </p>
              <h3 className="mt-1 text-lg font-semibold text-text-primary">
                {mode === "create" ? "Tạo buổi bù" : "Chỉnh sửa buổi bù"}
              </h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="inline-flex size-9 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-bg-secondary hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-border-focus"
              aria-label="Đóng popup buổi bù"
            >
              <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="makeup-class" className="block text-xs font-medium text-text-secondary">
                Lớp học
              </label>
              <div className="mt-1">
                <UpgradedSelect
                  id="makeup-class"
                  ariaLabel="Chọn lớp cho buổi bù"
                  value={form.classId}
                  onValueChange={(value) => setForm((prev) => ({ ...prev, classId: value }))}
                  options={classOptions}
                  placeholder={isLoadingClasses ? "Đang tải lớp…" : "Chọn lớp"}
                  disabled={isLoadingClasses || isSubmitting}
                />
              </div>
            </div>

            <div>
              <label htmlFor="makeup-date" className="block text-xs font-medium text-text-secondary">
                Ngày học
              </label>
              <input
                id="makeup-date"
                type="date"
                value={form.date}
                onChange={(event) => setForm((prev) => ({ ...prev, date: event.target.value }))}
                disabled={isSubmitting}
                className="mt-1 h-10 w-full rounded-lg border border-border-default bg-bg-surface px-3 text-sm text-text-primary outline-none focus:border-border-focus focus:ring-2 focus:ring-border-focus/30"
              />
            </div>

            <div>
              <label htmlFor="makeup-teacher" className="block text-xs font-medium text-text-secondary">
                Gia sư
              </label>
              <div className="mt-1">
                <UpgradedSelect
                  id="makeup-teacher"
                  ariaLabel="Chọn gia sư cho buổi bù"
                  value={form.teacherId}
                  onValueChange={(value) => setForm((prev) => ({ ...prev, teacherId: value }))}
                  options={teacherOptions}
                  placeholder={isLoadingTeachers ? "Đang tải gia sư…" : "Chọn gia sư"}
                  disabled={isLoadingTeachers || isSubmitting}
                />
              </div>
            </div>

            <div>
              <label htmlFor="makeup-start" className="block text-xs font-medium text-text-secondary">
                Bắt đầu
              </label>
              <TimeInput
                id="makeup-start"
                value={form.startTime}
                onChange={(event) => setForm((prev) => ({ ...prev, startTime: event.target.value }))}
                disabled={isSubmitting}
                className="mt-1 h-10 w-full rounded-lg border border-border-default bg-bg-surface px-3 text-sm text-text-primary outline-none focus:border-border-focus focus:ring-2 focus:ring-border-focus/30"
              />
            </div>

            <div>
              <label htmlFor="makeup-end" className="block text-xs font-medium text-text-secondary">
                Kết thúc
              </label>
              <TimeInput
                id="makeup-end"
                value={form.endTime}
                onChange={(event) => setForm((prev) => ({ ...prev, endTime: event.target.value }))}
                disabled={isSubmitting}
                className="mt-1 h-10 w-full rounded-lg border border-border-default bg-bg-surface px-3 text-sm text-text-primary outline-none focus:border-border-focus focus:ring-2 focus:ring-border-focus/30"
              />
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="makeup-note" className="block text-xs font-medium text-text-secondary">
                Ghi chú
              </label>
              <textarea
                id="makeup-note"
                value={form.note}
                onChange={(event) => setForm((prev) => ({ ...prev, note: event.target.value }))}
                disabled={isSubmitting}
                rows={3}
                placeholder="Học bù ngày...."
                className="mt-1 w-full rounded-lg border border-border-default bg-bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-border-focus focus:ring-2 focus:ring-border-focus/30"
              />
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
            {mode === "edit" ? (
              <button
                type="button"
                onClick={() => deleteMutation.mutate()}
                disabled={isSubmitting}
                className="inline-flex items-center justify-center rounded-lg border border-error/25 bg-error/10 px-3 py-2 text-sm font-semibold text-error transition-colors hover:bg-error/15 focus:outline-none focus:ring-2 focus:ring-error/30"
              >
                Xoá buổi bù
              </button>
            ) : (
              <span className="text-xs text-text-muted">Chỉ admin mới chỉnh được buổi bù.</span>
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="inline-flex items-center justify-center rounded-lg border border-border-default bg-bg-surface px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-bg-secondary hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-border-focus"
              >
                Huỷ
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!form.classId || !form.teacherId || !form.date || !form.startTime || !form.endTime) {
                    toast.error("Vui lòng nhập đủ lớp, gia sư, ngày học và khung giờ.");
                    return;
                  }

                  if (form.endTime <= form.startTime) {
                    toast.error("Giờ kết thúc phải sau giờ bắt đầu.");
                    return;
                  }

                  if (mode === "create") {
                    createMutation.mutate();
                    return;
                  }

                  updateMutation.mutate();
                }}
                disabled={isSubmitting}
                className="inline-flex items-center justify-center rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-text-inverse transition-colors hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-border-focus"
              >
                {isSubmitting
                  ? "Đang lưu…"
                  : mode === "create"
                    ? "Tạo buổi bù"
                    : "Lưu thay đổi"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
