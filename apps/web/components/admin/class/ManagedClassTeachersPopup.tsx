"use client";

import { useState } from "react";
import { useDebounce } from "use-debounce";
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ClassDetail, ClassTeacher } from "@/dtos/class.dto";
import type {
  StaffOpsClassTeacherPayItem,
  StaffOpsUpdateClassTeacherPayPayload,
} from "@/dtos/staff-ops.dto";
import * as staffOpsApi from "@/lib/apis/staff-ops.api";
import { listTrainingTutors, trainingTutorKeys } from "@/lib/apis/training-tutor.api";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  ResponsiveActionFooter,
  ResponsiveDialog,
  ResponsiveDialogBody,
} from "@/components/ui/ResponsiveDialog";
import { moneyInputInitialFromNumber, parseMoneyInput } from "@/lib/money-input.helpers";
import {
  classEditorModalCloseButtonClassName,
  classEditorModalPrimaryButtonClassName,
  classEditorModalSecondaryButtonClassName,
  classEditorModalTitleClassName,
} from "./classEditorModalStyles";

type Props = {
  classDetail: ClassDetail;
  /** Staff id của quản lý lớp đang mở popup — dòng gia sư này bị khoá. */
  actorStaffId: string;
  onClose: () => void;
  /** Gọi sau mỗi lần lưu / thêm gia sư để làm mới dữ liệu lớp. */
  onChanged: () => Promise<unknown>;
};

type TeacherDraft = { allowance: string; scale: string; rate: string };
type ClassDraft = { allowance: string; maxAllowance: string; scale: string };

const TUTOR_SEARCH_LIMIT = 8;

const fieldShellClassName =
  "min-h-11 rounded-xl border border-border-default bg-bg-primary px-3 py-2 focus-within:border-border-focus focus-within:ring-2 focus-within:ring-border-focus/30";
const fieldInputClassName =
  "min-w-0 flex-1 bg-transparent text-right text-sm font-semibold tabular-nums text-text-primary outline-none placeholder:text-text-muted";
const fieldLabelClassName =
  "mb-1.5 ml-1 block text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted";
const sectionTitleClassName =
  "text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted";

function errorMessage(err: unknown, fallback: string): string {
  return (
    (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
    (err as Error)?.message ??
    fallback
  );
}

function teacherDraftFrom(teacher: ClassTeacher): TeacherDraft {
  return {
    allowance: moneyInputInitialFromNumber(teacher.customAllowance),
    scale: moneyInputInitialFromNumber(teacher.customScaleAmount),
    rate:
      teacher.operatingDeductionRatePercent == null
        ? ""
        : String(teacher.operatingDeductionRatePercent),
  };
}

function classDraftFrom(classDetail: ClassDetail): ClassDraft {
  return {
    allowance: moneyInputInitialFromNumber(classDetail.allowancePerSessionPerStudent),
    maxAllowance: moneyInputInitialFromNumber(classDetail.maxAllowancePerSession),
    scale: moneyInputInitialFromNumber(classDetail.scaleAmount ?? 0),
  };
}

function isActiveAssignment(teacher: ClassTeacher) {
  return teacher.assignmentStatus !== "inactive";
}

/** Ô nhập tiền có nhãn + đơn vị, dùng chung cho mức lớp và mức từng gia sư. */
function MoneyField({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block min-w-0">
      <span className={fieldLabelClassName}>{label}</span>
      <span className={`${fieldShellClassName} flex items-center gap-1.5`}>
        <MoneyInput
          value={value}
          onValueChange={onChange}
          placeholder={placeholder}
          className={fieldInputClassName}
        />
        <span className="shrink-0 text-xs font-medium text-text-muted">VNĐ</span>
      </span>
    </label>
  );
}

function RateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block min-w-0">
      <span className={fieldLabelClassName}>{label}</span>
      <span className={`${fieldShellClassName} flex items-center gap-1.5`}>
        <input
          type="number"
          inputMode="decimal"
          min={0}
          max={100}
          step="0.01"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="0"
          className={fieldInputClassName}
        />
        <span className="shrink-0 text-xs font-medium text-text-muted">%</span>
      </span>
    </label>
  );
}

/**
 * Popup Ban Đào Tạo (quản lý lớp) chỉnh gia sư của lớp mình quản lý:
 * mức trợ cấp / trần / scale của lớp, lương từng gia sư, thêm gia sư.
 * Không có học phí, không sửa dòng gia sư của chính mình.
 */
export default function ManagedClassTeachersPopup({
  classDetail,
  actorStaffId,
  onClose,
  onChanged,
}: Props) {
  const classId = classDetail.id;
  // Chi tiết lớp không trả gia sư đã nghỉ; backend tự mở lại dòng cũ khi thêm lại.
  const activeTeachers = (classDetail.teachers ?? []).filter(isActiveAssignment);

  const [classDraft, setClassDraft] = useState<ClassDraft>(() => classDraftFrom(classDetail));
  // Chỉ lưu dòng đã chạm; dòng chưa chạm (kể cả gia sư vừa thêm) đọc thẳng từ classDetail.
  const [teacherDrafts, setTeacherDrafts] = useState<Record<string, TeacherDraft>>({});
  const [tutorSearch, setTutorSearch] = useState("");
  const [debouncedTutorSearch] = useDebounce(tutorSearch.trim(), 300);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);

  const initialClassDraft = classDraftFrom(classDetail);
  const changedTeacherIds = activeTeachers
    .filter((teacher) => {
      const draft = teacherDrafts[teacher.id];
      if (!draft) return false;
      const initial = teacherDraftFrom(teacher);
      return (
        draft.allowance !== initial.allowance ||
        draft.scale !== initial.scale ||
        draft.rate !== initial.rate
      );
    })
    .map((teacher) => teacher.id);
  const classDraftChanged =
    classDraft.allowance !== initialClassDraft.allowance ||
    classDraft.maxAllowance !== initialClassDraft.maxAllowance ||
    classDraft.scale !== initialClassDraft.scale;
  const isDirty = classDraftChanged || changedTeacherIds.length > 0;

  const tutorListParams = {
    page: 1,
    limit: TUTOR_SEARCH_LIMIT,
    search: debouncedTutorSearch,
    status: "active" as const,
  };
  const { data: tutorPage, isFetching: isTutorFetching } = useQuery({
    queryKey: trainingTutorKeys.list(tutorListParams),
    queryFn: () => listTrainingTutors(tutorListParams),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
  const activeTeacherIds = new Set(activeTeachers.map((teacher) => teacher.id));
  const tutorCandidates = (tutorPage?.data ?? []).filter(
    (tutor) => tutor.id !== actorStaffId && !activeTeacherIds.has(tutor.id),
  );

  const saveMutation = useMutation({
    mutationFn: (payload: StaffOpsUpdateClassTeacherPayPayload) =>
      staffOpsApi.updateClassTeacherPay(classId, payload),
    onSuccess: async () => {
      toast.success("Đã lưu lương gia sư. Áp dụng cho các buổi tạo sau.");
      await onChanged();
      onClose();
    },
    onError: (err) => toast.error(errorMessage(err, "Không thể lưu lương gia sư.")),
  });

  const addTeacherMutation = useMutation({
    mutationFn: (teacherId: string) =>
      staffOpsApi.addClassTeacher(classId, { teacher_id: teacherId }),
    onSuccess: async () => {
      toast.success("Đã thêm gia sư vào lớp. Lương theo mức mặc định của lớp.");
      setTutorSearch("");
      await onChanged();
    },
    onError: (err) => toast.error(errorMessage(err, "Không thể thêm gia sư.")),
  });

  const requestClose = () => {
    if (saveMutation.isPending) return;
    if (isDirty) {
      setDiscardConfirmOpen(true);
      return;
    }
    onClose();
  };

  const updateTeacherDraft = (teacher: ClassTeacher, patch: Partial<TeacherDraft>) => {
    setTeacherDrafts((prev) => ({
      ...prev,
      [teacher.id]: { ...(prev[teacher.id] ?? teacherDraftFrom(teacher)), ...patch },
    }));
  };

  const buildPayload = (): StaffOpsUpdateClassTeacherPayPayload | null => {
    const payload: StaffOpsUpdateClassTeacherPayPayload = {};

    if (classDraft.allowance !== initialClassDraft.allowance) {
      const allowance = parseMoneyInput(classDraft.allowance);
      if (allowance == null) {
        toast.error("Trợ cấp mặc định / học sinh không được để trống.");
        return null;
      }
      payload.allowance_per_session_per_student = allowance;
    }
    if (classDraft.maxAllowance !== initialClassDraft.maxAllowance) {
      // Để trống = bỏ trần.
      payload.max_allowance_per_session = parseMoneyInput(classDraft.maxAllowance);
    }
    if (classDraft.scale !== initialClassDraft.scale) {
      payload.scale_amount = parseMoneyInput(classDraft.scale) ?? 0;
    }

    const teacherItems: StaffOpsClassTeacherPayItem[] = [];
    for (const teacherId of changedTeacherIds) {
      const draft = teacherDrafts[teacherId];
      const rate = draft.rate.trim() === "" ? 0 : Number(draft.rate);
      if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
        toast.error("Tỷ lệ vận hành phải trong khoảng 0–100%.");
        return null;
      }
      teacherItems.push({
        teacher_id: teacherId,
        // Để trống = theo mức của lớp.
        custom_allowance: parseMoneyInput(draft.allowance),
        custom_scale_amount: parseMoneyInput(draft.scale),
        operating_deduction_rate_percent: Math.round(rate * 100) / 100,
      });
    }
    if (teacherItems.length > 0) payload.teachers = teacherItems;

    return payload;
  };

  const handleSave = () => {
    if (!isDirty) {
      onClose();
      return;
    }
    const payload = buildPayload();
    if (payload) saveMutation.mutate(payload);
  };

  const classAllowancePlaceholder = classDraft.allowance || "Theo lớp";
  const classScalePlaceholder = classDraft.scale || "0";

  return (
    <>
      <ResponsiveDialog
        size="2xl"
        labelledBy="managed-class-teachers-title"
        onBackdropClick={requestClose}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border-subtle p-4 sm:p-5">
          <div className="min-w-0">
            <h2 id="managed-class-teachers-title" className={classEditorModalTitleClassName}>
              Chỉnh sửa Gia sư & lương
            </h2>
            <p className="mt-1 text-xs text-text-muted">
              Thay đổi chỉ áp dụng cho buổi tạo sau khi lưu; buổi đã có giữ nguyên tiền.
            </p>
          </div>
          <button
            type="button"
            onClick={requestClose}
            className={classEditorModalCloseButtonClassName}
            aria-label="Đóng"
          >
            <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <ResponsiveDialogBody className="space-y-5">
          <section className="space-y-2">
            <h3 className={sectionTitleClassName}>Mức mặc định của lớp</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <MoneyField
                label="Trợ cấp / HS / buổi"
                value={classDraft.allowance}
                onChange={(allowance) => setClassDraft((prev) => ({ ...prev, allowance }))}
              />
              <MoneyField
                label="Trần / buổi"
                value={classDraft.maxAllowance}
                placeholder="Không trần"
                onChange={(maxAllowance) => setClassDraft((prev) => ({ ...prev, maxAllowance }))}
              />
              <MoneyField
                label="Scale / buổi"
                value={classDraft.scale}
                placeholder="0"
                onChange={(scale) => setClassDraft((prev) => ({ ...prev, scale }))}
              />
            </div>
          </section>

          <section className="space-y-2">
            <h3 className={sectionTitleClassName}>Lương từng gia sư</h3>
            <p className="text-xs text-text-muted">
              Để trống trợ cấp / scale = theo mức của lớp; scale nhập 0 = gia sư không có scale.
            </p>
            {activeTeachers.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border-default bg-bg-secondary/50 px-3 py-4 text-center text-xs text-text-muted">
                Lớp chưa có gia sư đang dạy.
              </div>
            ) : (
              <div className="space-y-2">
                {activeTeachers.map((teacher) => {
                  const isSelf = teacher.id === actorStaffId;
                  const draft = teacherDrafts[teacher.id] ?? teacherDraftFrom(teacher);
                  const hasNoSchedule = !(classDetail.schedule ?? []).some(
                    (slot) => slot.teacherId === teacher.id,
                  );

                  return (
                    <div
                      key={teacher.id}
                      className="rounded-xl border border-border-default bg-bg-secondary/60 p-3"
                    >
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <p className="min-w-0 break-words text-sm font-semibold text-text-primary">
                          {teacher.fullName}
                          {isSelf ? (
                            <span className="ml-1.5 font-normal text-text-muted">(bạn)</span>
                          ) : null}
                        </p>
                        {hasNoSchedule ? (
                          <span className="rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-[10px] font-medium text-warning">
                            Chưa có khung giờ — gia sư tự thêm
                          </span>
                        ) : null}
                      </div>
                      {isSelf ? (
                        <p className="mt-2 text-xs text-text-muted">
                          Không tự chỉnh lương của chính mình. Nhờ admin hoặc trợ lí nếu cần đổi.
                        </p>
                      ) : (
                        <div className="mt-2 grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 sm:grid-cols-3">
                          <MoneyField
                            label="Trợ cấp / HS"
                            value={draft.allowance}
                            placeholder={classAllowancePlaceholder}
                            onChange={(allowance) => updateTeacherDraft(teacher, { allowance })}
                          />
                          <MoneyField
                            label="Scale / buổi"
                            value={draft.scale}
                            placeholder={classScalePlaceholder}
                            onChange={(scale) => updateTeacherDraft(teacher, { scale })}
                          />
                          <RateField
                            label="Vận hành"
                            value={draft.rate}
                            onChange={(rate) => updateTeacherDraft(teacher, { rate })}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="space-y-2">
            <h3 className={sectionTitleClassName}>Thêm gia sư</h3>
            <p className="text-xs text-text-muted">
              Thêm có hiệu lực ngay. Gia sư mới tự thêm khung giờ dạy của mình; gia sư từng nghỉ
              lớp này sẽ được mở lại với lương mặc định của lớp.
            </p>
            <input
              type="search"
              value={tutorSearch}
              onChange={(event) => setTutorSearch(event.target.value)}
              placeholder="Tìm gia sư theo tên…"
              aria-label="Tìm gia sư để thêm vào lớp"
              className="min-h-11 w-full rounded-xl border border-border-default bg-bg-primary px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-border-focus focus:ring-2 focus:ring-border-focus/30"
            />
            <div className="space-y-1.5" aria-busy={isTutorFetching}>
              {tutorCandidates.length === 0 ? (
                <p className="px-1 py-2 text-xs text-text-muted">
                  {isTutorFetching ? "Đang tìm…" : "Không có gia sư phù hợp."}
                </p>
              ) : (
                tutorCandidates.map((tutor) => {
                  const isPending =
                    addTeacherMutation.isPending && addTeacherMutation.variables === tutor.id;

                  return (
                    <div
                      key={tutor.id}
                      className="flex items-center gap-2 rounded-lg border border-border-default bg-bg-surface px-3 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="break-words text-sm font-medium text-text-primary">
                          {tutor.fullName}
                        </p>
                        {tutor.university ? (
                          <p className="truncate text-[11px] text-text-muted">{tutor.university}</p>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => addTeacherMutation.mutate(tutor.id)}
                        disabled={addTeacherMutation.isPending}
                        className="inline-flex min-h-9 shrink-0 items-center justify-center rounded-md border border-primary/40 bg-primary/10 px-3 text-xs font-semibold text-primary transition hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                      >
                        {isPending ? "Đang thêm..." : "Thêm"}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </ResponsiveDialogBody>

        <ResponsiveActionFooter className="sm:flex sm:justify-end">
          <button
            type="button"
            onClick={requestClose}
            className={classEditorModalSecondaryButtonClassName}
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saveMutation.isPending}
            className={classEditorModalPrimaryButtonClassName}
          >
            {saveMutation.isPending ? "Đang lưu..." : "Lưu"}
          </button>
        </ResponsiveActionFooter>
      </ResponsiveDialog>

      <ConfirmDialog
        open={discardConfirmOpen}
        onOpenChange={setDiscardConfirmOpen}
        title="Bỏ thay đổi chưa lưu?"
        description="Các mức lương vừa nhập sẽ không được lưu."
        confirmLabel="Bỏ thay đổi"
        cancelLabel="Tiếp tục sửa"
        variant="destructive"
        onConfirm={() => {
          setDiscardConfirmOpen(false);
          onClose();
        }}
      />
    </>
  );
}
