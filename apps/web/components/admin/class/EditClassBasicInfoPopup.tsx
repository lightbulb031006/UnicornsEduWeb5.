"use client";

import { useMemo, useState, type SyntheticEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import UpgradedSelect from "@/components/ui/UpgradedSelect";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  ResponsiveActionFooter,
  ResponsiveDialog,
  ResponsiveDialogBody,
} from "@/components/ui/ResponsiveDialog";
import { Switch } from "@/components/ui/switch";
import { MoneyInput } from "@/components/ui/MoneyInput";
import type {
  ClassDetail,
  ClassPricingMode,
  ClassStatus,
  UpdateClassBasicInfoPayload,
  UpdateClassTuitionPayload,
} from "@/dtos/class.dto";
import type { StaffOpsUpdateClassTeacherPayPayload } from "@/dtos/staff-ops.dto";
import CourseSelect from "@/components/shared/class/CourseSelect";
import * as classApi from "@/lib/apis/class.api";
import * as staffOpsApi from "@/lib/apis/staff-ops.api";
import { resolveOwnPayLockedClassDefaults } from "@/lib/class-teacher-own-pay";
import { runBackgroundSave, toastWarnings } from "@/lib/mutation-feedback";
import { invalidateCalendarScopedQueries } from "@/lib/query-invalidation";
import {
  buildEndClassConfirmMessage,
  maxAllowanceInputInitialFromServer,
  parseMaxAllowancePerSessionInput,
} from "@/lib/class.helpers";
import {
  classRateFieldLabels,
  convertDisplayedRateInput,
  displayedClassRate,
  explainMissingStandardBlocks,
  formatSessionEquivalentLine,
  standardBlockCountFromClassSchedule,
  toPerSessionAmountForApi,
  toPerSessionMaxAllowanceForApi,
} from "@/lib/class-pricing-mode";
import {
  moneyInputInitialFromNumber,
  parseOptionalMoneyInt,
} from "@/lib/money-input.helpers";
import { ADMIN_CLASS_WRITE_ACCESS, type ClassWriteAccess } from "@/lib/class-write-access";
import {
  classEditorModalPrimaryButtonClassName,
  classEditorModalSecondaryButtonClassName,
  classEditorModalTitleClassName,
} from "./classEditorModalStyles";
import ClassPricingModeField from "./ClassPricingModeField";
import ClassTuitionFields, { useClassTuitionForm } from "./ClassTuitionFields";

type Props = {
  open: boolean;
  onClose: () => void;
  classDetail: ClassDetail;
  /**
   * #274: Admin sửa mọi trường; Trưởng ban Đào tạo / Trưởng phòng chỉ sửa tên,
   * khoá học (môn/loại lớp) và sĩ số. Mặc định Admin.
   */
  access?: ClassWriteAccess;
  /**
   * Hiện mục **Học phí lớp** trong dialog (`PATCH /class/:id/tuition`): Admin +
   * Trưởng phòng Sale & CSKH. Thay card Học phí lớp trên trang (13/11).
   */
  canEditTuition?: boolean;
  /** Lớp đang có học sinh học — lớp bán một lần còn trống được để trống Tổng gói. */
  hasActiveStudents?: boolean;
  /** Gọi sau khi lưu thành công (trang dùng query key riêng, vd staff-ops). */
  onSaved?: () => void | Promise<void>;
};

const TITLE_ID = "edit-class-basic-title";
const DESCRIPTION_ID = "edit-class-basic-description";

const STATUS_OPTIONS: { value: ClassStatus; label: string }[] = [
  { value: "running", label: "Đang chạy" },
  { value: "ended", label: "Đã kết thúc" },
];

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
  return (
    (classDetail.name ?? "") !== (next.name ?? "") ||
    classDetail.courseId !== next.course_id ||
    (classDetail.maxStudents ?? undefined) !== next.max_students ||
    (classDetail.noAttendance ?? false) !== (next.no_attendance ?? false) ||
    (classDetail.allowancePerSessionPerStudent ?? undefined) !==
      next.allowance_per_session_per_student ||
    (classDetail.maxAllowancePerSession ?? undefined) !== next.max_allowance_per_session ||
    (classDetail.scaleAmount ?? undefined) !== next.scale_amount
  );
}

export default function EditClassBasicInfoPopup({
  open,
  onClose,
  classDetail,
  access = ADMIN_CLASS_WRITE_ACCESS,
  canEditTuition = false,
  hasActiveStudents = true,
  onSaved,
}: Props) {
  if (!open) return null;

  return (
    <EditClassBasicInfoDialog
      onClose={onClose}
      classDetail={classDetail}
      access={access}
      canEditTuition={canEditTuition}
      hasActiveStudents={hasActiveStudents}
      onSaved={onSaved}
    />
  );
}

function EditClassBasicInfoDialog({
  onClose,
  classDetail,
  access = ADMIN_CLASS_WRITE_ACCESS,
  canEditTuition = false,
  hasActiveStudents = true,
  onSaved,
}: Omit<Props, "open">) {
  const queryClient = useQueryClient();
  const tuitionForm = useClassTuitionForm(classDetail);
  /** Trưởng ban/Trưởng phòng: chỉ tên, khoá học, sĩ số. */
  const headsMode = !access.isAdmin;
  /**
   * Trưởng ban Đào tạo (#277): thêm trợ cấp / trần / scale mặc định của lớp.
   * Lưu qua `PATCH /staff-ops/classes/:id/teacher-pay` (basic-info vẫn chỉ 3
   * trường với role trưởng); mức lớp mà dòng của chính mình đang kế thừa bị
   * khoá như backend (#276).
   */
  const headPayMode = headsMode && access.canEditTeachersAndPay;
  const showClassPayFields = !headsMode || headPayMode;
  const lockedClassDefaults = headPayMode
    ? resolveOwnPayLockedClassDefaults(classDetail.teachers, access.staffId)
    : { allowance: false, maxAllowance: false, scale: false };
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
  const [noAttendance, setNoAttendance] = useState(classDetail.noAttendance ?? false);

  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);
  const [endConfirmOpen, setEndConfirmOpen] = useState(false);
  const [endReason, setEndReason] = useState("");

  const willEndClass =
    !headsMode && classDetail.status === "running" && status === "ended";

  const handleStatusChange = (nextValue: string) => {
    setStatus(nextValue as ClassStatus);
  };

  const invalidateClassQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["class", "detail", classDetail.id] }),
      queryClient.invalidateQueries({ queryKey: ["class", "list"] }),
      invalidateCalendarScopedQueries(queryClient),
    ]);
    await onSaved?.();
  };

  /** Kiểm tra form; trả về payload Thông tin lớp (chưa gồm status) hoặc null. */
  const buildBasicInfoWithoutStatus = (): Omit<UpdateClassBasicInfoPayload, "status"> | null => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error("Tên lớp là bắt buộc.");
      return null;
    }
    const maxStudents = parseOptionalInt(maxStudentsInput);
    if (maxStudents !== undefined && maxStudents < 1) {
      toast.error("Sĩ số tối đa phải lớn hơn hoặc bằng 1.");
      return null;
    }
    if (headsMode) {
      // #274: role trưởng chỉ gửi 3 trường — backend 403 nếu gửi thêm.
      return { name: trimmedName, course_id: courseId, max_students: maxStudents };
    }
    // Chỉ chặn khi admin thực sự BẬT chế độ block. Lớp đã ở per_block mà lịch
    // sau đó đổi thành không hợp lệ vẫn phải sửa được sĩ số / tên lớp,
    // đúng như backend: updateClassBasicInfo không gọi assertCanEnableBlockPricing.
    const pricingModeChanged = pricingMode !== (classDetail.pricingMode ?? "per_session");
    if (
      pricingModeChanged &&
      pricingMode === "per_block" &&
      (standardBlockCount == null || standardBlockCount <= 0)
    ) {
      toast.error(missingBlockReason);
      return null;
    }

    return {
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
    };
  };

  /**
   * Học phí lớp: `undefined` = không đổi / không có quyền, `null` = form sai
   * (đã toast), còn lại là payload `PATCH /class/:id/tuition`.
   */
  const buildTuitionPayload = (): UpdateClassTuitionPayload | null | undefined => {
    if (!canEditTuition || !tuitionForm.isDirty(pricingMode)) return undefined;
    return tuitionForm.buildPayload({ pricingMode, hasActiveStudents });
  };

  const saveTuitionIfChanged = async (payload: UpdateClassTuitionPayload | undefined) => {
    if (payload) {
      await classApi.updateClassTuition(classDetail.id, payload);
    }
  };

  const savePricingModeIfChanged = async () => {
    if (headsMode) return;
    const currentMode = classDetail.pricingMode ?? "per_session";
    if (pricingMode !== currentMode) {
      await classApi.updateClassPricingMode(classDetail.id, {
        pricing_mode: pricingMode,
      });
    }
  };

  const headsFieldsChanged = (next: Omit<UpdateClassBasicInfoPayload, "status">) =>
    (classDetail.name ?? "") !== (next.name ?? "") ||
    classDetail.courseId !== next.course_id ||
    (classDetail.maxStudents ?? undefined) !== next.max_students;

  const handleConfirmEndClass = () => {
    const basicInfoWithoutStatus = buildBasicInfoWithoutStatus();
    const tuitionPayload = buildTuitionPayload();
    if (!basicInfoWithoutStatus || tuitionPayload === null) {
      setEndConfirmOpen(false);
      return;
    }
    const reason = endReason.trim() || undefined;
    const shouldUpdateBasicInfo = basicInfoFieldsChanged(classDetail, basicInfoWithoutStatus);

    setEndConfirmOpen(false);
    onClose();
    runBackgroundSave({
      loadingMessage: shouldUpdateBasicInfo
        ? "Đang lưu thông tin và kết thúc lớp..."
        : "Đang kết thúc lớp...",
      successMessage: "Đã kết thúc lớp.",
      errorMessage: "Không thể kết thúc lớp.",
      action: async () => {
        await savePricingModeIfChanged();
        if (shouldUpdateBasicInfo) {
          await classApi.updateClassBasicInfo(classDetail.id, basicInfoWithoutStatus);
        }
        await saveTuitionIfChanged(tuitionPayload);
        return classApi.endClass(classDetail.id, { reason });
      },
      onSuccess: async (result) => {
        toastWarnings(result.calendarSyncWarnings);
        await invalidateClassQueries();
      },
      // Bước trước có thể đã lưu (basic-info/pricing) hoặc DB đã đổi trước khi lỗi.
      onError: invalidateClassQueries,
    });
  };

  const handleSubmit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const basicInfoWithoutStatus = buildBasicInfoWithoutStatus();
    if (!basicInfoWithoutStatus) return;
    const tuitionPayload = buildTuitionPayload();
    if (tuitionPayload === null) return;

    if (willEndClass) {
      setEndReason("");
      setEndConfirmOpen(true);
      return;
    }

    const shouldSave = headsMode
      ? headsFieldsChanged(basicInfoWithoutStatus)
      : basicInfoFieldsChanged(classDetail, basicInfoWithoutStatus) ||
        status !== classDetail.status;
    const payload: UpdateClassBasicInfoPayload = headsMode
      ? basicInfoWithoutStatus
      : { ...basicInfoWithoutStatus, status };
    const classPayPayload = headPayMode ? buildHeadClassPayPayload() : undefined;
    onClose();
    runBackgroundSave({
      loadingMessage: "Đang lưu thông tin lớp...",
      successMessage: classPayPayload
        ? "Đã lưu thông tin lớp. Trợ cấp mới áp dụng cho các buổi tạo sau."
        : "Đã lưu thông tin lớp.",
      errorMessage: "Không thể cập nhật thông tin lớp.",
      action: async () => {
        await savePricingModeIfChanged();
        if (shouldSave) {
          await classApi.updateClassBasicInfo(classDetail.id, payload);
        }
        if (classPayPayload) {
          await staffOpsApi.updateClassTeacherPay(classDetail.id, classPayPayload);
        }
        await saveTuitionIfChanged(tuitionPayload);
      },
      onSuccess: invalidateClassQueries,
      // Basic-info có thể đã lưu trước khi teacher-pay lỗi → refetch cho khớp.
      onError: invalidateClassQueries,
    });
  };

  const rateLabels = classRateFieldLabels(pricingMode);
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
    return lines;
  }, [
    allowancePerSessionInput,
    maxAllowancePerSessionInput,
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
    setPricingMode(next);
  };

  /** Giá trị hiển thị ban đầu của các ô tiền (đã quy đổi theo cách thu). */
  const [initialRateInputs] = useState(() => ({
    allowance: allowancePerSessionInput,
    maxAllowance: maxAllowancePerSessionInput,
    scale: scaleAmountInput,
  }));

  /**
   * Trưởng ban Đào tạo: chỉ gửi ô tiền đã đổi (backend chặn cả field gửi lại
   * nếu chạm lương của chính mình). `undefined` = không có gì để lưu.
   */
  function buildHeadClassPayPayload(): StaffOpsUpdateClassTeacherPayPayload | undefined {
    const next: StaffOpsUpdateClassTeacherPayPayload = {};
    if (!lockedClassDefaults.allowance && allowancePerSessionInput !== initialRateInputs.allowance) {
      next.allowance_per_session_per_student = toPerSessionAmountForApi({
        mode: pricingMode,
        displayedAmount: parseOptionalMoneyInt(allowancePerSessionInput),
        standardBlockCount,
      });
    }
    if (
      !lockedClassDefaults.maxAllowance &&
      maxAllowancePerSessionInput !== initialRateInputs.maxAllowance
    ) {
      next.max_allowance_per_session = toPerSessionMaxAllowanceForApi({
        mode: pricingMode,
        displayedAmount: parseMaxAllowancePerSessionInput(
          maxAllowancePerSessionInput.trim(),
          parseOptionalMoneyInt,
        ),
        standardBlockCount,
      });
    }
    if (!lockedClassDefaults.scale && scaleAmountInput !== initialRateInputs.scale) {
      next.scale_amount = parseOptionalMoneyInt(scaleAmountInput);
    }
    const hasChange = Object.values(next).some((value) => value !== undefined);
    return hasChange ? next : undefined;
  }

  const isDirty =
    name !== (classDetail.name ?? "") ||
    courseId !== classDetail.courseId ||
    maxStudentsInput !== String(classDetail.maxStudents ?? "") ||
    status !== classDetail.status ||
    pricingMode !== (classDetail.pricingMode ?? "per_session") ||
    noAttendance !== (classDetail.noAttendance ?? false) ||
    allowancePerSessionInput !== initialRateInputs.allowance ||
    maxAllowancePerSessionInput !== initialRateInputs.maxAllowance ||
    scaleAmountInput !== initialRateInputs.scale ||
    (canEditTuition && tuitionForm.isDirty(pricingMode));

  const requestClose = () => {
    if (isDirty) {
      setConfirmDiscardOpen(true);
      return;
    }
    onClose();
  };

  const fieldClassName =
    "rounded-md border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus";

  return (
    <>
      <ResponsiveDialog
        size="2xl"
        labelledBy={TITLE_ID}
        describedBy={DESCRIPTION_ID}
        onBackdropClick={requestClose}
      >
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col" noValidate>
          <ResponsiveDialogBody className="space-y-4">
            <div>
              <h2 id={TITLE_ID} className={classEditorModalTitleClassName}>
                Thông tin lớp
              </h2>
              <p id={DESCRIPTION_ID} className="mt-1 text-sm text-text-secondary">
                {headsMode
                  ? canEditTuition
                    ? headPayMode
                      ? "Bạn sửa được tên lớp, khoá học (môn/loại lớp), sĩ số, trợ cấp mặc định của lớp và Học phí lớp. Các mục khác do Admin chỉnh."
                      : "Bạn sửa được tên lớp, khoá học (môn/loại lớp), sĩ số và Học phí lớp. Các mục khác do Admin chỉnh."
                    : headPayMode
                      ? "Bạn sửa được tên lớp, khoá học (môn/loại lớp), sĩ số và trợ cấp mặc định của lớp (áp dụng cho buổi tạo sau). Các mục khác do Admin chỉnh."
                      : "Bạn sửa được tên lớp, khoá học (môn/loại lớp) và sĩ số. Các mục khác do Admin chỉnh."
                  : canEditTuition
                    ? "Tên, khoá học, trạng thái, sĩ số, trợ cấp gia sư, cách thu và Học phí lớp."
                    : "Tên, khoá học, trạng thái, sĩ số, trợ cấp gia sư và cách thu học phí."}
              </p>
            </div>
            <section className="rounded-lg border border-border-default bg-bg-secondary/50 p-3 sm:p-4">
              <div className="grid gap-3 md:grid-cols-2">
                <label className="flex flex-col gap-1 text-sm text-text-secondary md:col-span-2">
                  <span>Tên lớp</span>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className={fieldClassName}
                    required
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm text-text-secondary">
                  <span>Khoá học</span>
                  <CourseSelect
                    name="edit-class-basic-info-type"
                    value={courseId}
                    onValueChange={setCourseId}
                    isOneTime={classDetail.pricingMode === "one_time"}
                    buttonClassName={fieldClassName}
                  />
                </label>
                {headsMode ? null : (
                  <div className="flex flex-col gap-1 text-sm text-text-secondary">
                    <span>Trạng thái</span>
                    <UpgradedSelect
                      name="edit-class-basic-info-status"
                      value={status}
                      onValueChange={handleStatusChange}
                      options={STATUS_OPTIONS}
                      buttonClassName={fieldClassName}
                    />
                    {willEndClass ? (
                      <p className="text-xs text-text-muted">
                        Lưu sẽ gọi kết thúc lớp: gỡ gia sư, đóng roster, xóa lịch cố định và lịch bù tương lai.
                      </p>
                    ) : null}
                  </div>
                )}
                {headsMode ? null : (
                  <div className="flex flex-col gap-1 text-sm md:col-span-2">
                    <div className="flex items-center justify-between gap-3 rounded-lg border border-border-default bg-bg-surface px-3 py-2">
                      <div className="flex flex-col">
                        <span className="font-medium text-text-primary">Không cần điểm danh</span>
                        <span className="text-xs text-text-muted">
                          Lớp quá đông — hệ thống tự sinh Attendance present cho mọi học sinh.
                        </span>
                      </div>
                      <Switch checked={noAttendance} onCheckedChange={setNoAttendance} />
                    </div>
                  </div>
                )}
                <label className="flex flex-col gap-1 text-sm text-text-secondary">
                  <span>Sĩ số tối đa</span>
                  <input
                    type="number"
                    min={1}
                    value={maxStudentsInput}
                    onChange={(e) => setMaxStudentsInput(e.target.value)}
                    className={fieldClassName}
                  />
                </label>
                {showClassPayFields ? (
                  <>
                    <ClassPayDefaultField
                      label={rateLabels.allowance}
                      value={allowancePerSessionInput}
                      onValueChange={setAllowancePerSessionInput}
                      className={fieldClassName}
                      placeholder="VNĐ"
                      lockedNote={
                        lockedClassDefaults.allowance
                          ? "Bạn đang hưởng mức này (không có trợ cấp riêng) — chỉ Admin sửa."
                          : undefined
                      }
                    />
                    <ClassPayDefaultField
                      label={rateLabels.maxAllowance}
                      value={maxAllowancePerSessionInput}
                      onValueChange={setMaxAllowancePerSessionInput}
                      className={fieldClassName}
                      placeholder="Để trống = không giới hạn"
                      lockedNote={
                        lockedClassDefaults.maxAllowance
                          ? "Trần áp cho cả phần của bạn — chỉ Admin sửa."
                          : undefined
                      }
                    />
                    <ClassPayDefaultField
                      label="Scales"
                      value={scaleAmountInput}
                      onValueChange={setScaleAmountInput}
                      className={fieldClassName}
                      lockedNote={
                        lockedClassDefaults.scale
                          ? "Bạn đang hưởng mức này (không có scale riêng) — chỉ Admin sửa."
                          : undefined
                      }
                    />
                  </>
                ) : null}
                {headsMode ? null : (
                  <>
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
                  </>
                )}
              </div>
            </section>
            {canEditTuition ? (
              <section
                aria-labelledby="edit-class-basic-tuition-title"
                className="rounded-lg border border-border-default bg-bg-secondary/50 p-3 sm:p-4"
              >
                <h3
                  id="edit-class-basic-tuition-title"
                  className="text-sm font-semibold text-text-primary"
                >
                  Học phí lớp
                </h3>
                <p className="mb-3 mt-0.5 text-xs text-text-muted">
                  {pricingMode === "one_time"
                    ? "Học phí chung của lớp. Lớp bán một lần chốt gói lúc học sinh vào lớp: học sinh đang học giữ gói đã chốt, gói mới chỉ áp cho học sinh vào sau."
                    : "Học phí chung của lớp. Học sinh có học phí riêng giữ nguyên số riêng."}
                </p>
                <ClassTuitionFields
                  form={tuitionForm}
                  pricingMode={pricingMode}
                  inputClassName={`min-h-11 w-full ${fieldClassName}`}
                />
              </section>
            ) : null}
          </ResponsiveDialogBody>

          <ResponsiveActionFooter>
            <button
              type="button"
              onClick={requestClose}
              className={classEditorModalSecondaryButtonClassName}
            >
              Hủy
            </button>
            <button type="submit" className={classEditorModalPrimaryButtonClassName}>
              Lưu
            </button>
          </ResponsiveActionFooter>
        </form>
      </ResponsiveDialog>

      <ConfirmDialog
        open={confirmDiscardOpen}
        onOpenChange={setConfirmDiscardOpen}
        title="Bỏ thay đổi thông tin lớp?"
        description="Thông tin lớp vừa sửa chưa được lưu."
        confirmLabel="Bỏ"
        cancelLabel="Tiếp tục sửa"
        variant="destructive"
        onConfirm={() => {
          setConfirmDiscardOpen(false);
          onClose();
        }}
      />

      <ConfirmDialog
        open={endConfirmOpen}
        onOpenChange={setEndConfirmOpen}
        title="Kết thúc lớp?"
        description={
          <span className="whitespace-pre-line">
            {buildEndClassConfirmMessage(classDetail.endClassEligibility?.unpaidSessionCount)}
          </span>
        }
        confirmLabel="Kết thúc lớp"
        variant="destructive"
        onConfirm={handleConfirmEndClass}
      >
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="edit-class-end-reason"
            className="text-xs font-medium text-text-secondary"
          >
            Lý do (không bắt buộc)
          </label>
          <textarea
            id="edit-class-end-reason"
            value={endReason}
            onChange={(event) => setEndReason(event.target.value)}
            rows={3}
            className="w-full rounded-lg border border-border-default bg-bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-border-focus focus:ring-2 focus:ring-border-focus/30"
          />
        </div>
      </ConfirmDialog>
    </>
  );
}

/** Một ô tiền mặc định của lớp; `lockedNote` có giá trị = khoá + ghi chú lý do. */
function ClassPayDefaultField({
  label,
  value,
  onValueChange,
  className,
  placeholder,
  lockedNote,
}: {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  className: string;
  placeholder?: string;
  lockedNote?: string;
}) {
  const locked = Boolean(lockedNote);
  return (
    <label className="flex flex-col gap-1 text-sm text-text-secondary">
      <span>{label}</span>
      <MoneyInput
        value={value}
        onValueChange={onValueChange}
        className={`${className} disabled:cursor-not-allowed disabled:opacity-60`}
        placeholder={placeholder}
        disabled={locked}
        title={lockedNote}
      />
      {lockedNote ? <span className="text-xs text-text-muted">{lockedNote}</span> : null}
    </label>
  );
}
