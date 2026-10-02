"use client";

import { useMemo, useState, type SyntheticEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import UpgradedSelect from "@/components/ui/UpgradedSelect";
import { Switch } from "@/components/ui/switch";
import { MoneyInput } from "@/components/ui/MoneyInput";
import type { ClassDetail, ClassPricingMode, ClassStatus, UpdateClassBasicInfoPayload } from "@/dtos/class.dto";
import CourseSelect from "@/components/shared/class/CourseSelect";
import * as classApi from "@/lib/apis/class.api";
import { runBackgroundSave } from "@/lib/mutation-feedback";
import { invalidateCalendarScopedQueries } from "@/lib/query-invalidation";
import {
  compactTuitionPerSessionLine,
  computeStudentTuitionPerSessionFromPackage,
  maxAllowanceInputInitialFromServer,
  parseMaxAllowancePerSessionInput,
  parseTuitionPackageInputs,
} from "@/lib/class.helpers";
import {
  classRateFieldLabels,
  compactTuitionChargeLine,
  convertDisplayedRateInput,
  displayedClassRate,
  explainMissingStandardBlocks,
  formatSessionEquivalentLine,
  perSessionToPerBlock,
  standardBlockCountFromClassSchedule,
  toPerBlockTuitionForApi,
  toPerSessionAmountForApi,
  toPerSessionMaxAllowanceForApi,
} from "@/lib/class-pricing-mode";
import {
  moneyInputInitialFromNumber,
  parseOptionalMoneyInt,
} from "@/lib/money-input.helpers";
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
import ClassPricingModeField from "./ClassPricingModeField";

type Props = {
  open: boolean;
  onClose: () => void;
  classDetail: ClassDetail;
};

const STATUS_OPTIONS: { value: ClassStatus; label: string }[] = [
  { value: "running", label: "Đang chạy" },
  { value: "ended", label: "Đã kết thúc" },
];

const END_CLASS_CONFIRM_MESSAGE =
  "Kết thúc lớp? Điều kiện: mọi buổi đã thanh toán trợ cấp gia sư. Hệ thống sẽ gỡ gia sư khỏi lớp, đóng roster học sinh, xóa lịch cố định và lịch bù tương lai.";

const DEFAULT_END_CLASS_BLOCK_REASON =
  "Thanh toán hết trợ cấp gia sư cho mọi buổi để kết thúc lớp.";

function parseOptionalInt(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.floor(parsed);
}

function basicInfoFieldsChanged(
  classDetail: ClassDetail,
  next: Omit<UpdateClassBasicInfoPayload, "status">,
): boolean {
  const currentTuitionTotal = classDetail.tuitionPackageTotal ?? undefined;
  const currentTuitionSessions = classDetail.tuitionPackageSession ?? undefined;
  return (
    (classDetail.name ?? "") !== (next.name ?? "") ||
    classDetail.courseId !== next.course_id ||
    (classDetail.maxStudents ?? undefined) !== next.max_students ||
    (classDetail.noAttendance ?? false) !== (next.no_attendance ?? false) ||
    (classDetail.allowancePerSessionPerStudent ?? undefined) !==
      next.allowance_per_session_per_student ||
    (classDetail.maxAllowancePerSession ?? undefined) !== next.max_allowance_per_session ||
    (classDetail.scaleAmount ?? undefined) !== next.scale_amount ||
    (classDetail.studentTuitionPerSession ?? undefined) !== next.student_tuition_per_session ||
    (next.student_tuition_per_block !== undefined &&
      (classDetail.studentTuitionPerBlock ?? null) !== next.student_tuition_per_block) ||
    currentTuitionTotal !== next.tuition_package_total ||
    currentTuitionSessions !== next.tuition_package_session
  );
}

export default function EditClassBasicInfoPopup({ open, onClose, classDetail }: Props) {
  if (!open) return null;

  return <EditClassBasicInfoDialog onClose={onClose} classDetail={classDetail} />;
}

function EditClassBasicInfoDialog({ onClose, classDetail }: Omit<Props, "open">) {
  const queryClient = useQueryClient();
  const formId = "edit-class-basic-info-form";
  const [name, setName] = useState(classDetail.name ?? "");
  const [courseId, setCourseId] = useState(classDetail.courseId);
  const [status, setStatus] = useState<ClassStatus>(classDetail.status);
  const [maxStudentsInput, setMaxStudentsInput] = useState(String(classDetail.maxStudents ?? ""));
  const [pricingMode, setPricingMode] = useState<ClassPricingMode>(
    classDetail.pricingMode ?? "per_session",
  );
  const scheduleSlots = classDetail.schedule ?? [];
  const standardBlockCount = standardBlockCountFromClassSchedule(scheduleSlots);
  const missingBlockReason = explainMissingStandardBlocks(scheduleSlots);
  const [allowancePerSessionInput, setAllowancePerSessionInput] = useState(() =>
    moneyInputInitialFromNumber(
      displayedClassRate({
        mode: classDetail.pricingMode ?? "per_session",
        perSession: classDetail.allowancePerSessionPerStudent,
        perBlock: classDetail.allowancePerBlockPerStudent,
        standardBlockCount: standardBlockCountFromClassSchedule(classDetail.schedule),
      }),
    ),
  );
  const [maxAllowancePerSessionInput, setMaxAllowancePerSessionInput] = useState(() => {
    const mode = classDetail.pricingMode ?? "per_session";
    const raw = maxAllowanceInputInitialFromServer(classDetail.maxAllowancePerSession);
    if (raw === "") return "";
    return moneyInputInitialFromNumber(
      displayedClassRate({
        mode,
        perSession: classDetail.maxAllowancePerSession,
        perBlock: classDetail.maxAllowancePerBlock,
        standardBlockCount: standardBlockCountFromClassSchedule(classDetail.schedule),
      }),
    );
  });
  const [scaleAmountInput, setScaleAmountInput] = useState(() =>
    moneyInputInitialFromNumber(classDetail.scaleAmount),
  );
  const [tuitionPackageTotalInput, setTuitionPackageTotalInput] = useState(() =>
    moneyInputInitialFromNumber(classDetail.tuitionPackageTotal),
  );
  const [tuitionPackageSessionInput, setTuitionPackageSessionInput] = useState(
    classDetail.tuitionPackageSession == null ? "" : String(classDetail.tuitionPackageSession),
  );
  const [noAttendance, setNoAttendance] = useState(classDetail.noAttendance ?? false);
  const [tuitionPerBlockInput, setTuitionPerBlockInput] = useState(() =>
    moneyInputInitialFromNumber(
      displayedClassRate({
        mode: "per_block",
        perSession: classDetail.studentTuitionPerSession,
        perBlock: classDetail.studentTuitionPerBlock,
        standardBlockCount: standardBlockCountFromClassSchedule(classDetail.schedule),
      }),
    ),
  );

  const canEndClass = classDetail.endClassEligibility?.canEnd ?? false;
  const endClassBlockReason =
    classDetail.endClassEligibility?.blockReason ?? DEFAULT_END_CLASS_BLOCK_REASON;
  const willEndClass = classDetail.status === "running" && status === "ended";

  const handleStatusChange = (nextValue: string) => {
    const nextStatus = nextValue as ClassStatus;
    if (
      nextStatus === "ended" &&
      classDetail.status === "running" &&
      !canEndClass
    ) {
      toast.error(endClassBlockReason);
      return;
    }
    setStatus(nextStatus);
  };

  const invalidateClassQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["class", "detail", classDetail.id] }),
      queryClient.invalidateQueries({ queryKey: ["class", "list"] }),
      invalidateCalendarScopedQueries(queryClient),
    ]);
  };

  const handleSubmit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error("Tên lớp là bắt buộc.");
      return;
    }
    const maxStudents = parseOptionalInt(maxStudentsInput);
    if (maxStudents !== undefined && maxStudents < 1) {
      toast.error("Sĩ số tối đa phải lớn hơn hoặc bằng 1.");
      return;
    }
    const tuitionPkg = parseTuitionPackageInputs(tuitionPackageTotalInput, tuitionPackageSessionInput);
    if (!tuitionPkg.ok) {
      toast.error(tuitionPkg.message);
      return;
    }
    // Chỉ chặn khi admin thực sự BẬT chế độ block. Lớp đã ở per_block mà lịch
    // sau đó đổi thành không hợp lệ vẫn phải sửa được học phí / sĩ số / tên lớp,
    // đúng như backend: updateClassBasicInfo không gọi assertCanEnableBlockPricing.
    const pricingModeChanged = pricingMode !== (classDetail.pricingMode ?? "per_session");
    if (
      pricingModeChanged &&
      pricingMode === "per_block" &&
      (standardBlockCount == null || standardBlockCount <= 0)
    ) {
      toast.error(missingBlockReason);
      return;
    }
    const studentTuitionPerSession =
      tuitionPkg.mode === "empty"
        ? undefined
        : computeStudentTuitionPerSessionFromPackage(tuitionPkg.total, tuitionPkg.sessions);
    const studentTuitionPerBlock = toPerBlockTuitionForApi({
      mode: pricingMode,
      displayedAmount: parseOptionalMoneyInt(tuitionPerBlockInput),
    });

    const basicInfoWithoutStatus: Omit<UpdateClassBasicInfoPayload, "status"> = {
      name: trimmedName,
      course_id: courseId,
      max_students: maxStudents,
      no_attendance: noAttendance,
      allowance_per_session_per_student: toPerSessionAmountForApi({
        mode: pricingMode,
        displayedAmount: parseOptionalMoneyInt(allowancePerSessionInput),
        standardBlockCount,
      }),
      max_allowance_per_session: toPerSessionMaxAllowanceForApi({
        mode: pricingMode,
        displayedAmount: parseMaxAllowancePerSessionInput(
          maxAllowancePerSessionInput.trim(),
          parseOptionalMoneyInt,
        ),
        standardBlockCount,
      }),
      scale_amount: parseOptionalMoneyInt(scaleAmountInput),
      student_tuition_per_session: studentTuitionPerSession,
      ...(studentTuitionPerBlock === undefined
        ? {}
        : { student_tuition_per_block: studentTuitionPerBlock }),
      tuition_package_total: tuitionPkg.mode === "empty" ? undefined : tuitionPkg.total,
      tuition_package_session: tuitionPkg.mode === "empty" ? undefined : tuitionPkg.sessions,
    };

    if (willEndClass) {
      if (!canEndClass) {
        toast.error(endClassBlockReason);
        return;
      }
      const confirmed = window.confirm(END_CLASS_CONFIRM_MESSAGE);
      if (!confirmed) return;
      const reason = window.prompt("Lý do (không bắt buộc)") ?? undefined;
      const shouldUpdateBasicInfo = basicInfoFieldsChanged(classDetail, basicInfoWithoutStatus);

      onClose();
      runBackgroundSave({
        loadingMessage: shouldUpdateBasicInfo
          ? "Đang lưu thông tin và kết thúc lớp..."
          : "Đang kết thúc lớp...",
        successMessage: "Đã kết thúc lớp.",
        errorMessage: "Không thể kết thúc lớp.",
        action: async () => {
          const currentMode = classDetail.pricingMode ?? "per_session";
          if (pricingMode !== currentMode) {
            await classApi.updateClassPricingMode(classDetail.id, {
              pricing_mode: pricingMode,
            });
          }
          if (shouldUpdateBasicInfo) {
            await classApi.updateClassBasicInfo(classDetail.id, basicInfoWithoutStatus);
          }
          await classApi.endClass(classDetail.id, { reason });
        },
        onSuccess: invalidateClassQueries,
      });
      return;
    }

    const payload: UpdateClassBasicInfoPayload = {
      ...basicInfoWithoutStatus,
      status,
    };
    onClose();
    runBackgroundSave({
      loadingMessage: "Đang lưu thông tin lớp...",
      successMessage: "Đã lưu thông tin lớp.",
      errorMessage: "Không thể cập nhật thông tin lớp.",
      action: async () => {
        const currentMode = classDetail.pricingMode ?? "per_session";
        if (pricingMode !== currentMode) {
          await classApi.updateClassPricingMode(classDetail.id, {
            pricing_mode: pricingMode,
          });
        }
        if (basicInfoFieldsChanged(classDetail, basicInfoWithoutStatus) || status !== classDetail.status) {
          await classApi.updateClassBasicInfo(classDetail.id, payload);
        }
      },
      onSuccess: invalidateClassQueries,
    });
  };

  const rateLabels = classRateFieldLabels(pricingMode);
  const tuitionBrief = compactTuitionChargeLine({
    mode: pricingMode,
    totalInput: tuitionPackageTotalInput,
    sessionsInput: tuitionPackageSessionInput,
    standardBlockCount,
    perSessionLine: compactTuitionPerSessionLine(tuitionPackageTotalInput, tuitionPackageSessionInput),
  });
  const previewLines = useMemo(() => {
    if (pricingMode !== "per_block" || standardBlockCount == null) return [];
    const lines: string[] = [];
    const allowance = parseOptionalMoneyInt(allowancePerSessionInput);
    if (allowance != null) {
      lines.push(formatSessionEquivalentLine("Trợ cấp / HV", allowance, standardBlockCount));
    }
    const maxAllowance = parseOptionalMoneyInt(maxAllowancePerSessionInput);
    if (maxAllowance != null) {
      lines.push(formatSessionEquivalentLine("Trợ cấp tối đa", maxAllowance, standardBlockCount));
    }
    const tuitionPerBlock = parseOptionalMoneyInt(tuitionPerBlockInput);
    if (tuitionPerBlock != null) {
      lines.push(formatSessionEquivalentLine("Học phí / HV", tuitionPerBlock, standardBlockCount));
    }
    return lines;
  }, [
    allowancePerSessionInput,
    maxAllowancePerSessionInput,
    tuitionPerBlockInput,
    pricingMode,
    standardBlockCount,
  ]);

  const handlePricingModeChange = (next: ClassPricingMode) => {
    setAllowancePerSessionInput((prev) =>
      convertDisplayedRateInput({
        input: prev,
        from: pricingMode,
        to: next,
        standardBlockCount,
      }),
    );
    setMaxAllowancePerSessionInput((prev) =>
      convertDisplayedRateInput({
        input: prev,
        from: pricingMode,
        to: next,
        standardBlockCount,
      }),
    );
    if (next === "per_block") {
      setTuitionPerBlockInput((prev) => {
        if (prev.trim()) return prev;
        const pkg = parseTuitionPackageInputs(tuitionPackageTotalInput, tuitionPackageSessionInput);
        if (pkg.ok && pkg.mode !== "empty") {
          const perSession = computeStudentTuitionPerSessionFromPackage(pkg.total, pkg.sessions);
          const perBlock = perSessionToPerBlock(perSession, standardBlockCount);
          if (perBlock != null) return moneyInputInitialFromNumber(perBlock);
        }
        return moneyInputInitialFromNumber(
          displayedClassRate({
            mode: "per_block",
            perSession: classDetail.studentTuitionPerSession,
            perBlock: classDetail.studentTuitionPerBlock,
            standardBlockCount,
          }),
        );
      });
    }
    setPricingMode(next);
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-bg-primary/75" aria-hidden onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-class-basic-title"
        className={classEditorModalClassName}
      >
        <div className={classEditorModalHeaderClassName}>
          <h2 id="edit-class-basic-title" className={classEditorModalTitleClassName}>
            Thông tin lớp
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

        <form id={formId} onSubmit={handleSubmit} className={`${classEditorModalBodyClassName} pr-0 sm:pr-1`}>
          <section className="rounded-lg border border-border-default bg-bg-secondary/50 p-3 sm:p-4">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm text-text-secondary sm:col-span-2">
                <span>Tên lớp</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="rounded-md border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                  required
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-text-secondary">
                <span>Khoá học</span>
                <CourseSelect
                  name="edit-class-basic-info-type"
                  value={courseId}
                  onValueChange={setCourseId}
                  buttonClassName="rounded-md border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                />
              </label>
              <div className="flex flex-col gap-1 text-sm text-text-secondary">
                <span>Trạng thái</span>
                <UpgradedSelect
                  name="edit-class-basic-info-status"
                  value={status}
                  onValueChange={handleStatusChange}
                  options={STATUS_OPTIONS}
                  buttonClassName="rounded-md border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                />
                {classDetail.status === "running" && !canEndClass ? (
                  <p className="text-xs text-warning">{endClassBlockReason}</p>
                ) : null}
                {willEndClass ? (
                  <p className="text-xs text-text-muted">
                    Lưu sẽ gọi kết thúc lớp: gỡ gia sư, đóng roster, xóa lịch cố định và lịch bù tương lai.
                  </p>
                ) : null}
              </div>
              <div className="flex flex-col gap-1 text-sm md:col-span-2">
                <div className="flex items-center justify-between rounded-lg border border-border-default bg-bg-surface px-3 py-2">
                  <div className="flex flex-col">
                    <span className="font-medium text-text-primary">Không cần điểm danh</span>
                    <span className="text-xs text-text-muted">
                      Lớp quá đông — hệ thống tự sinh Attendance present cho mọi học sinh.
                    </span>
                  </div>
                  <Switch
                    checked={noAttendance}
                    onCheckedChange={setNoAttendance}
                  />
                </div>
              </div>
              <label className="flex flex-col gap-1 text-sm text-text-secondary">
                <span>Sĩ số tối đa</span>
                <input
                  type="number"
                  min={1}
                  value={maxStudentsInput}
                  onChange={(e) => setMaxStudentsInput(e.target.value)}
                  className="rounded-md border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-text-secondary">
                <span>{rateLabels.allowance}</span>
                <MoneyInput
                  value={allowancePerSessionInput}
                  onValueChange={setAllowancePerSessionInput}
                  className="rounded-md border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                  placeholder="VNĐ"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-text-secondary">
                <span>{rateLabels.maxAllowance}</span>
                <MoneyInput
                  value={maxAllowancePerSessionInput}
                  onValueChange={setMaxAllowancePerSessionInput}
                  className="rounded-md border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                  placeholder="Để trống = không giới hạn"
                />
              </label>
              {pricingMode === "per_block" ? (
                <label className="flex flex-col gap-1 text-sm text-text-secondary">
                  <span>{rateLabels.tuition}</span>
                  <MoneyInput
                    value={tuitionPerBlockInput}
                    onValueChange={setTuitionPerBlockInput}
                    className="rounded-md border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                    placeholder="Để trống = suy từ gói"
                  />
                </label>
              ) : null}
              <label className="flex flex-col gap-1 text-sm text-text-secondary">
                <span>Scales</span>
                <MoneyInput
                  value={scaleAmountInput}
                  onValueChange={setScaleAmountInput}
                  className="rounded-md border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-text-secondary">
                <span>Tổng gói</span>
                <MoneyInput
                  value={tuitionPackageTotalInput}
                  onValueChange={setTuitionPackageTotalInput}
                  className="rounded-md border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                  placeholder="VNĐ"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-text-secondary">
                <span>Số buổi</span>
                <input
                  type="number"
                  min={0}
                  value={tuitionPackageSessionInput}
                  onChange={(e) => setTuitionPackageSessionInput(e.target.value)}
                  className="rounded-md border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                  placeholder="Số buổi"
                />
              </label>
              {tuitionBrief ? (
                <p className="text-xs tabular-nums text-text-muted md:col-span-2">{tuitionBrief}</p>
              ) : null}
              <div className="md:col-span-2">
                <ClassPricingModeField
                  value={pricingMode}
                  onChange={handlePricingModeChange}
                  standardBlockCount={standardBlockCount}
                  missingReason={missingBlockReason}
                  requireConfirm
                  previewLines={previewLines}
                />
              </div>
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
            className={classEditorModalPrimaryButtonClassName}
          >
            Lưu
          </button>
        </div>
      </div>
    </>
  );
}
