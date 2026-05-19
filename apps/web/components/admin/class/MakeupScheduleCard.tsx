"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowPathIcon } from "@heroicons/react/24/outline";
import { toast } from "sonner";
import type {
  ClassScopedMakeupScheduleEventPayload,
  GoogleCalendarResyncResponse,
  MakeupGoogleCalendarResyncSummary,
  MakeupScheduleEventRecord,
} from "@/dtos/class-schedule.dto";
import { invalidateCalendarScopedQueries } from "@/lib/query-invalidation";
import { DateInput } from "@/components/ui/DateInput";
import { TimeInput } from "@/components/ui/TimeInput";
import UpgradedSelect from "@/components/ui/UpgradedSelect";
import ClassCard from "./ClassCard";

type TeacherOption = {
  id: string;
  fullName: string;
};

type MakeupTeacherMode = "select" | "readOnly";

type MakeupScheduleCardProps = {
  classId: string;
  teachers: TeacherOption[];
  defaultTeacherId?: string;
  teacherMode?: MakeupTeacherMode;
  canCreate?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  canResync?: boolean;
  canResyncEvent?: (event: MakeupScheduleEventRecord) => boolean;
  disabledCreateMessage?: string;
  queryKeyPrefix: readonly unknown[];
  listFn: (
    classId: string,
    params: { startDate: string; endDate: string; page?: number; limit?: number },
  ) => Promise<{ data: MakeupScheduleEventRecord[]; total: number }>;
  createFn?: (
    classId: string,
    payload: ClassScopedMakeupScheduleEventPayload,
  ) => Promise<MakeupScheduleEventRecord>;
  updateFn?: (
    classId: string,
    eventId: string,
    payload: Partial<ClassScopedMakeupScheduleEventPayload>,
  ) => Promise<MakeupScheduleEventRecord>;
  deleteFn?: (classId: string, eventId: string) => Promise<void>;
  resyncFn?: (
    classId: string,
    eventId: string,
  ) => Promise<GoogleCalendarResyncResponse<MakeupGoogleCalendarResyncSummary>>;
};

type MakeupEditorState = {
  teacherId: string;
  date: string;
  startTime: string;
  endTime: string;
  note: string;
};

type MakeupEditorDialogProps = {
  open: boolean;
  mode: "create" | "edit";
  event?: MakeupScheduleEventRecord | null;
  defaultDate: string;
  teachers: TeacherOption[];
  defaultTeacherId?: string;
  teacherMode: MakeupTeacherMode;
  isSubmitting: boolean;
  canDelete: boolean;
  onClose: () => void;
  onSave: (payload: ClassScopedMakeupScheduleEventPayload) => void;
  onDelete: () => void;
};

const MAKEUP_EVENTS_PAGE_SIZE = 5;

function getTodayDateValue(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateLabel(dateValue: string): string {
  const date = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return dateValue;
  }

  return date.toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatTimeLabel(timeValue?: string): string {
  if (!timeValue) {
    return "Cả ngày";
  }
  return timeValue.slice(0, 5);
}

function normalizeTimePayload(value: string): string {
  return value.length === 5 ? `${value}:00` : value;
}

function getMakeupResyncToastMessage(summary: MakeupGoogleCalendarResyncSummary): string {
  if (summary.recoveredStaleEvent) {
    return "Đã tạo lại sự kiện Google Calendar cho buổi bù.";
  }

  if (summary.warnings.length > 0) {
    return `Đã đồng bộ Google Calendar, có ${summary.warnings.length} cảnh báo.`;
  }

  return "Đã đồng bộ Google Calendar.";
}

function buildInitialEditorState(options: {
  event?: MakeupScheduleEventRecord | null;
  defaultDate: string;
  teachers: TeacherOption[];
  defaultTeacherId?: string;
  teacherMode: MakeupTeacherMode;
}): MakeupEditorState {
  const defaultTeacherId =
    options.event?.teacherId ??
    options.defaultTeacherId ??
    options.teachers[0]?.id ??
    "";

  return {
    teacherId: defaultTeacherId,
    date: options.event?.date ?? options.defaultDate,
    startTime: options.event?.startTime?.slice(0, 5) ?? "18:00",
    endTime: options.event?.endTime?.slice(0, 5) ?? "19:30",
    note: options.event?.note ?? "",
  };
}

function MakeupEditorDialog({
  open,
  mode,
  event,
  defaultDate,
  teachers,
  defaultTeacherId,
  teacherMode,
  isSubmitting,
  canDelete,
  onClose,
  onSave,
  onDelete,
}: MakeupEditorDialogProps) {
  const [form, setForm] = useState<MakeupEditorState>(() =>
    buildInitialEditorState({
      event,
      defaultDate,
      teachers,
      defaultTeacherId,
      teacherMode,
    }),
  );

  const teacherOptions = useMemo(
    () =>
      teachers.map((teacher) => ({
        value: teacher.id,
        label: teacher.fullName,
        selectedLabel: teacher.fullName,
      })),
    [teachers],
  );

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div
      className="absolute inset-0 bg-bg-primary/75 backdrop-blur-[1px]"
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
                Lịch Dạy Bù
              </p>
              <h3 className="mt-1 text-lg font-semibold text-text-primary">
                {mode === "create" ? "Thêm buổi bù" : "Chỉnh sửa buổi bù"}
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
            <div>
              <label htmlFor="makeup-date" className="block text-xs font-medium text-text-secondary">
                Ngày học
              </label>
              <DateInput
                id="makeup-date"
                value={form.date}
                onChange={(nextEvent) =>
                  setForm((prev) => ({ ...prev, date: nextEvent.target.value }))
                }
                disabled={isSubmitting}
                className="mt-1 h-10 w-full rounded-lg border border-border-default bg-bg-surface px-3 text-sm text-text-primary outline-none focus:border-border-focus focus:ring-2 focus:ring-border-focus/30"
              />
            </div>

            <div>
              <label htmlFor="makeup-teacher" className="block text-xs font-medium text-text-secondary">
                Gia sư phụ trách
              </label>
              <div className="mt-1">
                <UpgradedSelect
                  id="makeup-teacher"
                  ariaLabel="Chọn gia sư cho buổi bù"
                  value={form.teacherId}
                  onValueChange={(value) => setForm((prev) => ({ ...prev, teacherId: value }))}
                  options={teacherOptions}
                  placeholder="Chọn gia sư"
                  disabled={teacherMode === "readOnly" || teachers.length === 0 || isSubmitting}
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
                onChange={(nextEvent) =>
                  setForm((prev) => ({ ...prev, startTime: nextEvent.target.value }))
                }
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
                onChange={(nextEvent) =>
                  setForm((prev) => ({ ...prev, endTime: nextEvent.target.value }))
                }
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
                onChange={(nextEvent) =>
                  setForm((prev) => ({ ...prev, note: nextEvent.target.value }))
                }
                disabled={isSubmitting}
                rows={3}
                placeholder="Học bù ngày...."
                className="mt-1 w-full rounded-lg border border-border-default bg-bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-border-focus focus:ring-2 focus:ring-border-focus/30"
              />
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
            {mode === "edit" && canDelete ? (
              <button
                type="button"
                onClick={onDelete}
                disabled={isSubmitting}
                className="inline-flex items-center justify-center rounded-lg border border-error/25 bg-error/10 px-3 py-2 text-sm font-semibold text-error transition-colors hover:bg-error/15 focus:outline-none focus:ring-2 focus:ring-error/30"
              >
                Xóa buổi bù
              </button>
            ) : (
              <span className="text-xs text-text-muted">
                Lịch bù trên calendar đã chuyển sang quản lý theo từng lớp.
              </span>
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="inline-flex items-center justify-center rounded-lg border border-border-default bg-bg-surface px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-bg-secondary hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-border-focus"
              >
                Huy
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!form.teacherId || !form.date || !form.startTime || !form.endTime) {
                    toast.error("Vui lòng nhập đủ gia sư, ngày học và khung giờ.");
                    return;
                  }

                  if (form.endTime <= form.startTime) {
                    toast.error("Giờ kết thúc phải sau giờ bắt đầu.");
                    return;
                  }

                  onSave({
                    teacherId: form.teacherId,
                    date: form.date,
                    startTime: normalizeTimePayload(form.startTime),
                    endTime: normalizeTimePayload(form.endTime),
                    note: form.note.trim() || undefined,
                  });
                }}
                disabled={isSubmitting}
                className="inline-flex items-center justify-center rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-text-inverse transition-colors hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-border-focus"
              >
                {isSubmitting
                  ? "Đang lưu..."
                  : mode === "create"
                    ? "Thêm buổi bù"
                    : "Lưu thay đổi"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function MakeupScheduleCard({
  classId,
  teachers,
  defaultTeacherId,
  teacherMode = "select",
  canCreate = false,
  canEdit = false,
  canDelete = false,
  canResync = false,
  canResyncEvent,
  disabledCreateMessage,
  queryKeyPrefix,
  listFn,
  createFn,
  updateFn,
  deleteFn,
  resyncFn,
}: MakeupScheduleCardProps) {
  const queryClient = useQueryClient();
  const teacherNameById = useMemo(
    () => new Map(teachers.map((teacher) => [teacher.id, teacher.fullName])),
    [teachers],
  );
  const [page, setPage] = useState(1);
  const todayDate = useMemo(() => getTodayDateValue(), []);
  const rangeStartDate = todayDate;
  const rangeEndDate = "2100-12-31";
  const makeupQueryKey = useMemo(
    () => [
      ...queryKeyPrefix,
      "makeup-events",
      classId,
      rangeStartDate,
      page,
      MAKEUP_EVENTS_PAGE_SIZE,
    ],
    [classId, page, queryKeyPrefix, rangeStartDate],
  );
  const invalidateQueryKey = useMemo(
    () => [...queryKeyPrefix, "makeup-events", classId],
    [classId, queryKeyPrefix],
  );
  const [editorMode, setEditorMode] = useState<"create" | "edit">("create");
  const [editingEvent, setEditingEvent] = useState<MakeupScheduleEventRecord | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: makeupQueryKey,
    queryFn: () =>
      listFn(classId, {
        startDate: rangeStartDate,
        endDate: rangeEndDate,
        page,
        limit: MAKEUP_EVENTS_PAGE_SIZE,
      }),
    enabled: Boolean(classId),
    staleTime: 60_000,
  });
  const items = data?.data ?? [];
  const totalItems = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalItems / MAKEUP_EVENTS_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = totalItems === 0 ? 0 : (currentPage - 1) * MAKEUP_EVENTS_PAGE_SIZE + 1;
  const pageEnd = totalItems === 0 ? 0 : pageStart + items.length - 1;

  const invalidateAfterMutation = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: invalidateQueryKey }),
      invalidateCalendarScopedQueries(queryClient),
    ]);
  };

  const createMutation = useMutation({
    mutationFn: (payload: ClassScopedMakeupScheduleEventPayload) => {
      if (!createFn) {
        throw new Error("Không có quyền tạo buổi bù.");
      }
      return createFn(classId, payload);
    },
    onSuccess: async () => {
      await invalidateAfterMutation();
      toast.success("Đã tạo buổi bù.");
      setIsEditorOpen(false);
      setEditingEvent(null);
    },
    onError: (mutationError: Error) => {
      toast.error(mutationError.message || "Không tạo được buổi bù.");
    },
  });

  const updateMutation = useMutation({
    mutationFn: (payload: Partial<ClassScopedMakeupScheduleEventPayload>) => {
      if (!updateFn || !editingEvent) {
        throw new Error("Không có quyền cập nhật buổi bù.");
      }
      return updateFn(classId, editingEvent.id, payload);
    },
    onSuccess: async () => {
      await invalidateAfterMutation();
      toast.success("Đã cập nhật buổi bù.");
      setIsEditorOpen(false);
      setEditingEvent(null);
    },
    onError: (mutationError: Error) => {
      toast.error(mutationError.message || "Không cập nhật được buổi bù.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => {
      if (!deleteFn || !editingEvent) {
        throw new Error("Không có quyền xóa buổi bù.");
      }
      return deleteFn(classId, editingEvent.id);
    },
    onSuccess: async () => {
      await invalidateAfterMutation();
      toast.success("Đã xóa buổi bù.");
      setIsEditorOpen(false);
      setEditingEvent(null);
    },
    onError: (mutationError: Error) => {
      toast.error(mutationError.message || "Không xóa được buổi bù.");
    },
  });
  const resyncMutation = useMutation({
    mutationFn: (eventId: string) => {
      if (!resyncFn) {
        throw new Error("Không có quyền đồng bộ Google Calendar.");
      }
      return resyncFn(classId, eventId);
    },
    onSuccess: async (result) => {
      await invalidateAfterMutation();
      toast.success(getMakeupResyncToastMessage(result.data));
    },
    onError: (mutationError: Error) => {
      toast.error(
        mutationError.message || "Không đồng bộ được Google Calendar.",
      );
    },
  });
  const isSubmitting =
    createMutation.isPending ||
    updateMutation.isPending ||
    deleteMutation.isPending ||
    resyncMutation.isPending;

  return (
    <ClassCard
      title="Lịch dạy bù"
      className="w-full"
      action={
        canCreate ? (
          <button
            type="button"
            onClick={() => {
              setEditorMode("create");
              setEditingEvent(null);
              setIsEditorOpen(true);
            }}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-md border border-border-default bg-bg-surface px-3 py-1.5 text-xs font-medium text-text-primary transition-colors duration-200 hover:bg-bg-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus sm:min-h-0 sm:w-auto"
          >
            Thêm buổi bù
          </button>
        ) : (
          <div className="inline-flex min-h-11 w-full items-center justify-center rounded-md border border-border-default bg-bg-surface px-3 py-1.5 text-xs font-medium text-text-secondary sm:min-h-0 sm:w-auto">
            Chỉ xem
          </div>
        )
      }
    >
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-border-default bg-bg-secondary/55 px-3 py-2 text-xs text-text-secondary">
        <span>Buổi gần nhất</span>
        <span className="text-text-muted/80" aria-hidden>
          ·
        </span>
        <span>Tổng buổi bù: {totalItems}</span>
        {totalItems > 0 ? (
          <>
            <span className="text-text-muted/80" aria-hidden>
              ·
            </span>
            <span>
              Hiển thị {pageStart}-{pageEnd}
            </span>
          </>
        ) : null}
      </div>

      {!canCreate && disabledCreateMessage ? (
        <div className="mb-3 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
          {disabledCreateMessage}
        </div>
      ) : null}

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, index) => (
            <div key={index} className="h-24 animate-pulse rounded-xl border border-border-default bg-bg-secondary/60" />
          ))}
        </div>
      ) : isError ? (
        <div className="rounded-lg border border-error/30 bg-error/10 px-4 py-3 text-sm text-error">
          {(error as Error)?.message || "Không tải được lịch dạy bù."}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border-default bg-bg-secondary/50 px-4 py-6 text-center text-sm text-text-muted">
          Chưa có buổi bù nào.
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const teacherName = item.teacherName ?? teacherNameById.get(item.teacherId) ?? "Chua ro";

            return (
              <article
                key={item.id}
                className="rounded-xl border border-border-default bg-bg-surface px-4 py-3 shadow-sm"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
                        Buổi bù
                      </span>
                      <span className="text-sm font-semibold text-text-primary">
                        {formatDateLabel(item.date)}
                      </span>
                      <span className="text-sm text-text-secondary">
                        {formatTimeLabel(item.startTime)} - {formatTimeLabel(item.endTime)}
                      </span>
                    </div>

                    <div className="text-sm text-text-secondary">
                      <span className="font-medium text-text-primary">Phụ trách:</span> {teacherName}
                    </div>

                    {item.note ? (
                      <p className="text-sm leading-6 text-text-secondary">{item.note}</p>
                    ) : null}

                    {item.googleMeetLink ? (
                      <a
                        href={item.googleMeetLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary-hover"
                      >
                        <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                          />
                        </svg>
                        Vào Google Meet
                      </a>
                    ) : null}
                  </div>

                  {canEdit || canResync ? (
                    <div className="flex shrink-0 items-center gap-2">
                      {canResync &&
                      resyncFn &&
                      (canResyncEvent ? canResyncEvent(item) : true) ? (
                        <button
                          type="button"
                          onClick={() => resyncMutation.mutate(item.id)}
                          disabled={
                            resyncMutation.isPending &&
                            resyncMutation.variables === item.id
                          }
                          title="Đồng bộ Google Calendar"
                          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border-default bg-bg-secondary px-3 py-2 text-xs font-semibold text-text-primary transition-colors hover:bg-bg-tertiary disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-border-focus"
                        >
                          <ArrowPathIcon
                            className={`size-3.5 ${
                              resyncMutation.isPending &&
                              resyncMutation.variables === item.id
                                ? "animate-spin"
                                : ""
                            }`}
                            aria-hidden
                          />
                          Đồng bộ Google
                        </button>
                      ) : null}
                      {canEdit ? (
                        <button
                          type="button"
                          onClick={() => {
                            setEditorMode("edit");
                            setEditingEvent(item);
                            setIsEditorOpen(true);
                          }}
                          className="inline-flex items-center justify-center rounded-lg border border-border-default bg-bg-secondary px-3 py-2 text-xs font-semibold text-text-primary transition-colors hover:bg-bg-tertiary focus:outline-none focus:ring-2 focus:ring-border-focus"
                        >
                          Chỉnh sửa
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {totalItems > 0 ? (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-text-muted">
            Trang {currentPage}/{totalPages}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((prev) => Math.max(1, Math.min(totalPages, prev - 1)))}
              disabled={page <= 1}
              className="inline-flex min-h-10 items-center justify-center rounded-lg border border-border-default bg-bg-surface px-3 text-xs font-medium text-text-primary transition-colors hover:bg-bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
            >
              Trang trước
            </button>
            <button
              type="button"
              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={page >= totalPages}
              className="inline-flex min-h-10 items-center justify-center rounded-lg border border-border-default bg-bg-surface px-3 text-xs font-medium text-text-primary transition-colors hover:bg-bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
            >
              Trang sau
            </button>
          </div>
        </div>
      ) : null}

      {isEditorOpen ? (
        <MakeupEditorDialog
          key={`${editorMode}-${editingEvent?.id ?? "new"}-${todayDate}-${defaultTeacherId ?? ""}-${teacherMode}`}
          open={isEditorOpen}
          mode={editorMode}
          event={editingEvent}
          defaultDate={todayDate}
          teachers={teachers}
          defaultTeacherId={defaultTeacherId}
          teacherMode={teacherMode}
          isSubmitting={isSubmitting}
          canDelete={canDelete}
          onClose={() => {
            if (isSubmitting) {
              return;
            }
            setIsEditorOpen(false);
            setEditingEvent(null);
          }}
          onSave={(payload) => {
            if (editorMode === "create") {
              createMutation.mutate(payload);
              return;
            }
            updateMutation.mutate(payload);
          }}
          onDelete={() => deleteMutation.mutate()}
        />
      ) : null}
    </ClassCard>
  );
}
