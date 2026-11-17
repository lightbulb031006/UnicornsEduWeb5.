"use client";

import { useEffect, useMemo, useRef, useState, type SyntheticEvent } from "react";
import { useDebounce } from "use-debounce";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ClassDetail, ClassPricingMode, ClassStatus, CreateClassPayload } from "@/dtos/class.dto";
import { TimeInput } from "@/components/ui/TimeInput";
import { DateInput } from "@/components/ui/DateInput";
import { MoneyInput } from "@/components/ui/MoneyInput";
import UpgradedSelect from "@/components/ui/UpgradedSelect";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  ResponsiveActionFooter,
  ResponsiveDialog,
  ResponsiveDialogBody,
} from "@/components/ui/ResponsiveDialog";
import CourseSelect, { useCourseList } from "@/components/shared/class/CourseSelect";
import * as classApi from "@/lib/apis/class.api";
import * as staffApi from "@/lib/apis/staff.api";
import * as studentApi from "@/lib/apis/student.api";
import * as trainingManagerApi from "@/lib/apis/training-manager.api";
import type { ClassWriteAccess } from "@/lib/class-write-access";
import { runBackgroundSave } from "@/lib/mutation-feedback";
import { classKeys } from "@/lib/query-keys";
import {
  CLASS_SCHEDULE_DAY_OPTIONS,
  compactTuitionPerSessionLine,
  computeStudentTuitionPerSessionFromPackage,
  normalizeDayOfWeek,
  normalizeTimeOnly,
  parseMaxAllowancePerSessionInput,
  parseTuitionPackageInputs,
} from "@/lib/class.helpers";
import {
  classRateFieldLabels,
  compactTuitionChargeLine,
  convertDisplayedRateInput,
  explainMissingStandardBlocks,
  formatSessionEquivalentLine,
  perSessionToPerBlock,
  standardBlockCountFromSlots,
  toPerBlockTuitionForApi,
  toPerSessionAmountForApi,
  toPerSessionMaxAllowanceForApi,
  oneTimePackageError,
  pricingModeForCourse,
} from "@/lib/class-pricing-mode";
import {
  moneyInputInitialFromNumber,
  parseMoneyInput,
  parseOptionalMoneyInt,
} from "@/lib/money-input.helpers";
import { createClientId } from "@/lib/client-id";
import ClassPricingModeField from "./ClassPricingModeField";
import {
  classEditorModalPrimaryButtonClassName,
  classEditorModalSecondaryButtonClassName,
} from "./classEditorModalStyles";

const TITLE_ID = "add-class-title";
const DESCRIPTION_ID = "add-class-description";
const NO_TRAINING_MANAGER = "";

type ScheduleRangeForm = {
  id: string;
  dayOfWeek: number;
  from: string;
  to: string;
  /** Ngày slot có hiệu lực (YYYY-MM-DD). Để trống = backend dùng ngày tạo lớp. */
  effectiveFrom: string;
};

const EMPTY_SCHEDULE_RANGE = { dayOfWeek: 1, from: "", to: "", effectiveFrom: "" } as const;

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated?: (classId: string) => void;
  /**
   * #274: phần form theo role người tạo — Admin mọi phần; Trưởng ban Đào tạo
   * thêm gia sư/Quản lý lớp/lương; Trưởng phòng thêm học phí/học sinh. Backend
   * vẫn 403 nếu gửi trường ngoài quyền.
   */
  access: ClassWriteAccess;
};

const STATUS_OPTIONS: { value: ClassStatus; label: string }[] = [
  { value: "running", label: "Đang chạy" },
  { value: "ended", label: "Đã kết thúc" },
];

function createScheduleRange(
  range?: Partial<
    Pick<ScheduleRangeForm, "dayOfWeek" | "from" | "to" | "effectiveFrom">
  >,
): ScheduleRangeForm {
  return {
    id: `local-slot-${createClientId()}`,
    dayOfWeek: normalizeDayOfWeek(range?.dayOfWeek, EMPTY_SCHEDULE_RANGE.dayOfWeek),
    from: range?.from ?? EMPTY_SCHEDULE_RANGE.from,
    to: range?.to ?? EMPTY_SCHEDULE_RANGE.to,
    effectiveFrom: range?.effectiveFrom ?? EMPTY_SCHEDULE_RANGE.effectiveFrom,
  };
}

function parseTimeToSeconds(value: string): number | null {
  const m = value.match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const [, h, min, sec = "0"] = m;
  const hours = Number(h);
  const minutes = Number(min);
  const seconds = Number(sec);
  if (hours > 23 || minutes > 59 || seconds > 59) return null;
  return hours * 3600 + minutes * 60 + seconds;
}

function parseOptionalInt(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.floor(parsed);
}

function normalizeOperatingDeductionRatePercent(value?: number): number {
  if (!Number.isFinite(value)) return 0;
  if ((value ?? 0) < 0) return 0;
  if ((value ?? 0) > 100) return 100;
  return Number((value ?? 0).toFixed(2));
}

function isFullClassDetail(classDetail: ClassDetail): boolean {
  return (
    Array.isArray(classDetail.teachers) &&
    Array.isArray(classDetail.students) &&
    typeof classDetail.sessionTuitionTotal === "number"
  );
}

export default function AddClassPopup({ open, onClose, onCreated, access }: Props) {
  if (!open) return null;

  return <AddClassDialog onClose={onClose} onCreated={onCreated} access={access} />;
}

function AddClassDialog({ onClose, onCreated, access }: Omit<Props, "open">) {
  const queryClient = useQueryClient();
  const showTeachersAndPay = access.canEditTeachersAndPay;
  const showTuitionAndStudents = access.canEditTuitionAndStudents;
  const showAdminOnly = access.canEditAdminOnlyFields;
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);
  const [trainingManagerId, setTrainingManagerId] = useState(NO_TRAINING_MANAGER);

  const [name, setName] = useState("");
  const [courseId, setCourseId] = useState("");
  const [status, setStatus] = useState<ClassStatus>("running");
  const [maxStudentsInput, setMaxStudentsInput] = useState("");
  const [allowancePerSessionInput, setAllowancePerSessionInput] = useState("");
  const [maxAllowancePerSessionInput, setMaxAllowancePerSessionInput] = useState("");
  const [scaleAmountInput, setScaleAmountInput] = useState("");
  const [tuitionPackageTotalInput, setTuitionPackageTotalInput] = useState("");
  const [tuitionPackageSessionInput, setTuitionPackageSessionInput] = useState("");
  const [tuitionPerBlockInput, setTuitionPerBlockInput] = useState("");
  const [pricingMode, setPricingMode] = useState<ClassPricingMode>("per_session");
  const [scheduleRanges, setScheduleRanges] = useState<ScheduleRangeForm[]>(() => [createScheduleRange()]);
  const [selectedTeachers, setSelectedTeachers] = useState<
    Array<{ id: string; name: string; customAllowance?: number; operatingDeductionRatePercent?: number }>
  >([]);
  const [teacherSearchInput, setTeacherSearchInput] = useState("");
  const [teacherSearchFocused, setTeacherSearchFocused] = useState(false);
  const teacherSearchRef = useRef<HTMLDivElement>(null);

  const [selectedStudents, setSelectedStudents] = useState<Array<{ id: string; name: string }>>([]);
  const [studentSearchInput, setStudentSearchInput] = useState("");
  const [studentSearchFocused, setStudentSearchFocused] = useState(false);
  const studentSearchRef = useRef<HTMLDivElement>(null);

  const [debouncedSearch] = useDebounce(teacherSearchInput.trim(), 350);
  const [debouncedStudentSearch] = useDebounce(studentSearchInput.trim(), 350);

  // #274: /staff/options (chỉ tên + role, không thông tin cá nhân) — mở cho
  // Trưởng ban Đào tạo chọn gia sư.
  const { data: staffSearchResult = [] } = useQuery({
    queryKey: ["staff", "options", { limit: 50, search: debouncedSearch }],
    queryFn: () =>
      staffApi.searchStaffOptions({
        limit: 50,
        search: debouncedSearch || undefined,
      }),
    enabled: showTeachersAndPay,
  });

  // Không ai trừ Admin tự gán mình làm gia sư (lương của chính mình, #265).
  const filteredStaff = staffSearchResult.filter(
    (s) =>
      !selectedTeachers.some((t) => t.id === s.id) &&
      (access.isAdmin || s.id !== access.staffId),
  );

  const { data: trainingManagerOptions = [] } = useQuery({
    queryKey: ["staff", "training-manager-options"],
    queryFn: () => trainingManagerApi.getTrainingManagerOptions({ limit: 50 }),
    enabled: showTeachersAndPay,
  });
  const trainingManagerSelectOptions = useMemo(
    () => [
      { value: NO_TRAINING_MANAGER, label: "Chưa giao" },
      ...trainingManagerOptions.map((option) => ({
        value: option.id,
        label: option.fullName?.trim() || option.id,
      })),
    ],
    [trainingManagerOptions],
  );

  const { data: studentSearchResult } = useQuery({
    // Chỉ gợi ý học sinh đang học; học sinh đã nghỉ không xếp vào lớp.
    queryKey: ["student", "list", { page: 1, limit: 50, search: debouncedStudentSearch, status: "active" }],
    queryFn: () =>
      studentApi.getStudents({
        page: 1,
        limit: 50,
        search: debouncedStudentSearch || undefined,
        status: "active",
      }),
    enabled: showTuitionAndStudents,
  });

  const filteredStudents = (studentSearchResult ?? []).filter(
    (s) => !selectedStudents.some((st) => st.id === s.id),
  );

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (teacherSearchRef.current && !teacherSearchRef.current.contains(target)) {
        setTeacherSearchFocused(false);
      }
      if (studentSearchRef.current && !studentSearchRef.current.contains(target)) {
        setStudentSearchFocused(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleAddRange = () => {
    setScheduleRanges((prev) => [...prev, createScheduleRange()]);
  };

  const handleRemoveRange = (id: string) => {
    setScheduleRanges((prev) =>
      prev.length === 1 ? [createScheduleRange()] : prev.filter((item) => item.id !== id),
    );
  };

  const handleChangeRange = (id: string, field: "from" | "to", value: string) => {
    const normalized = normalizeTimeOnly(value);
    setScheduleRanges((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: normalized } : item)),
    );
  };

  const handleDayChange = (id: string, dayOfWeek: number) => {
    setScheduleRanges((prev) =>
      prev.map((item) => (item.id === id ? { ...item, dayOfWeek } : item)),
    );
  };

  const handleEffectiveFromChange = (id: string, effectiveFrom: string) => {
    setScheduleRanges((prev) =>
      prev.map((item) => (item.id === id ? { ...item, effectiveFrom } : item)),
    );
  };

  const handleSubmit = async (e: SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error("Tên lớp là bắt buộc.");
      return;
    }
    if (!courseId) {
      toast.error("Khoá học là bắt buộc.");
      return;
    }

    let normalizedSchedule: NonNullable<CreateClassPayload["schedule"]>;
    try {
      normalizedSchedule = scheduleRanges.reduce<
        NonNullable<CreateClassPayload["schedule"]>
      >((acc, range) => {
        if (!range.from && !range.to) return acc;
        if ((range.from && !range.to) || (!range.from && range.to)) {
          throw new Error("Mỗi dòng lịch học cần đủ cả thời gian bắt đầu và kết thúc.");
        }

        const from = normalizeTimeOnly(range.from);
        const to = normalizeTimeOnly(range.to);
        const fromSeconds = parseTimeToSeconds(from);
        const toSeconds = parseTimeToSeconds(to);

        if (!from || !to || fromSeconds == null || toSeconds == null || fromSeconds >= toSeconds) {
          throw new Error("Khung giờ học không hợp lệ.");
        }

        return [
          ...acc,
          {
            dayOfWeek: range.dayOfWeek,
            from,
            to,
            ...(range.effectiveFrom ? { effectiveFrom: range.effectiveFrom } : {}),
          },
        ];
      }, []);
    } catch (error) {
      toast.error((error as Error).message || "Khung giờ học không hợp lệ.");
      return;
    }

    const tuitionPkg = parseTuitionPackageInputs(tuitionPackageTotalInput, tuitionPackageSessionInput);
    if (!tuitionPkg.ok) {
      toast.error(tuitionPkg.message);
      return;
    }
    // Follow-up 13/11: lớp bán một lần mới tạo, chưa có học sinh được để trống
    // Tổng gói; kèm học sinh thì gói phải > 0đ ngay.
    const oneTimePkgError = oneTimePackageError(
      pricingMode,
      tuitionPkg.mode === "empty" ? undefined : tuitionPkg.total,
      { allowEmpty: selectedStudents.length === 0 },
    );
    if (oneTimePkgError) {
      toast.error(oneTimePkgError);
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

    const submitBlockCount = standardBlockCountFromSlots(normalizedSchedule);
    if (pricingMode === "per_block" && (submitBlockCount == null || submitBlockCount <= 0)) {
      toast.error(explainMissingStandardBlocks(normalizedSchedule));
      return;
    }

    const payload: CreateClassPayload = {
      name: trimmedName,
      ...(courseId ? { course_id: courseId } : {}),
      max_students: parseOptionalInt(maxStudentsInput),
    };
    // #274: chỉ gửi phần thuộc quyền — backend 403 nếu gửi trường ngoài quyền.
    if (showAdminOnly) {
      payload.status = status;
      payload.pricing_mode = pricingMode;
      payload.schedule = normalizedSchedule;
    }
    if (showTeachersAndPay) {
      payload.allowance_per_session_per_student = toPerSessionAmountForApi({
        mode: pricingMode,
        displayedAmount: parseOptionalMoneyInt(allowancePerSessionInput),
        standardBlockCount: submitBlockCount,
      });
      payload.max_allowance_per_session = toPerSessionMaxAllowanceForApi({
        mode: pricingMode,
        displayedAmount: parseMaxAllowancePerSessionInput(
          maxAllowancePerSessionInput.trim(),
          parseOptionalMoneyInt,
        ),
        standardBlockCount: submitBlockCount,
      });
      payload.scale_amount = parseOptionalMoneyInt(scaleAmountInput);
      payload.teachers = selectedTeachers.map((t) => ({
        teacher_id: t.id,
        ...(t.customAllowance != null ? { custom_allowance: t.customAllowance } : {}),
        operating_deduction_rate_percent: normalizeOperatingDeductionRatePercent(
          t.operatingDeductionRatePercent,
        ),
      }));
      if (trainingManagerId) {
        payload.training_manager_staff_id = trainingManagerId;
      }
    }
    if (showTuitionAndStudents) {
      payload.student_tuition_per_session = studentTuitionPerSession;
      if (studentTuitionPerBlock !== undefined) {
        payload.student_tuition_per_block = studentTuitionPerBlock;
      }
      payload.tuition_package_total = tuitionPkg.mode === "empty" ? undefined : tuitionPkg.total;
      payload.tuition_package_session =
        tuitionPkg.mode === "empty" ? undefined : tuitionPkg.sessions;
      payload.student_ids = selectedStudents.map((s) => s.id);
    }

    onClose();
    runBackgroundSave({
      loadingMessage: "Đang tạo lớp học...",
      successMessage: "Đã thêm lớp học.",
      errorMessage: "Không thể tạo lớp học.",
      action: () => classApi.createClass(payload),
      onSuccess: async (createdClass) => {
        if (isFullClassDetail(createdClass)) {
          queryClient.setQueryData(classKeys.detail(createdClass.id), createdClass);
        } else {
          queryClient.removeQueries({
            queryKey: classKeys.detail(createdClass.id),
            exact: true,
          });
        }
        await queryClient.invalidateQueries({ queryKey: classKeys.lists() });
        onCreated?.(createdClass.id);
      },
    });
  };

  const scheduleSlots = scheduleRanges.map((range) => ({ from: range.from, to: range.to }));
  const standardBlockCount = standardBlockCountFromSlots(scheduleSlots);
  const missingBlockReason = explainMissingStandardBlocks(scheduleSlots);
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

  const { data: courseList = [] } = useCourseList();
  // Bán một lần là cài đặt của khoá: chọn khoá nào thì chế độ lớp đi theo khoá đó.
  const handleCourseChange = (nextCourseId: string) => {
    setCourseId(nextCourseId);
    const course = courseList.find((item) => item.id === nextCourseId);
    const nextMode = pricingModeForCourse(pricingMode, Boolean(course?.isOneTime));
    if (nextMode !== pricingMode) handlePricingModeChange(nextMode);
  };

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
        if (!pkg.ok || pkg.mode === "empty") return prev;
        const perSession = computeStudentTuitionPerSessionFromPackage(pkg.total, pkg.sessions);
        const perBlock = perSessionToPerBlock(perSession, standardBlockCount);
        return perBlock == null ? prev : moneyInputInitialFromNumber(perBlock);
      });
    }
    setPricingMode(next);
  };

  const isDirty =
    name.trim() !== "" ||
    courseId !== "" ||
    maxStudentsInput.trim() !== "" ||
    allowancePerSessionInput.trim() !== "" ||
    maxAllowancePerSessionInput.trim() !== "" ||
    scaleAmountInput.trim() !== "" ||
    tuitionPackageTotalInput.trim() !== "" ||
    tuitionPackageSessionInput.trim() !== "" ||
    tuitionPerBlockInput.trim() !== "" ||
    selectedTeachers.length > 0 ||
    selectedStudents.length > 0 ||
    trainingManagerId !== NO_TRAINING_MANAGER ||
    scheduleRanges.some((range) => range.from || range.to || range.effectiveFrom);

  const requestClose = () => {
    if (isDirty) {
      setConfirmDiscardOpen(true);
      return;
    }
    onClose();
  };

  const formDescription = showAdminOnly
    ? "Thông tin lớp, gia sư, học sinh, học phí và lịch học."
    : [
        "Thông tin lớp",
        showTeachersAndPay ? "gia sư, Quản lý lớp và lương gia sư" : null,
        showTuitionAndStudents ? "học phí và học sinh" : null,
      ]
        .filter(Boolean)
        .join(", ") + ". Lịch học và cách thu học phí do Admin thiết lập.";

  return (
    <>
      <ResponsiveDialog
        size="3xl"
        labelledBy={TITLE_ID}
        describedBy={DESCRIPTION_ID}
        onBackdropClick={requestClose}
      >
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col" noValidate>
          <ResponsiveDialogBody className="space-y-4">
          <div>
            <h2 id={TITLE_ID} className="text-lg font-semibold text-text-primary">
              Thêm lớp
            </h2>
            <p id={DESCRIPTION_ID} className="mt-1 text-sm text-text-secondary">
              {formDescription}
            </p>
          </div>
          <section className="rounded-lg border border-border-default bg-bg-secondary/50 p-4">
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
                  name="add-class-type"
                  value={courseId}
                  onValueChange={handleCourseChange}
                  buttonClassName="rounded-md border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                />
              </label>
              {showAdminOnly ? (
                <label className="flex flex-col gap-1 text-sm text-text-secondary">
                  <span>Trạng thái</span>
                  <UpgradedSelect
                    name="add-class-status"
                    value={status}
                    onValueChange={(nextValue) => setStatus(nextValue as ClassStatus)}
                    options={STATUS_OPTIONS}
                    buttonClassName="rounded-md border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                  />
                </label>
              ) : null}
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
              {showTeachersAndPay ? (
              <>
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
                  placeholder="VNĐ"
                />
              </label>
              </>
              ) : null}
              {pricingMode === "per_block" && showTuitionAndStudents ? (
                <label className="flex flex-col gap-1 text-sm text-text-secondary">
                  <span>{rateLabels.tuition}</span>
                  <MoneyInput
                    value={tuitionPerBlockInput}
                    onValueChange={setTuitionPerBlockInput}
                    className="rounded-md border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                    placeholder="VNĐ"
                  />
                </label>
              ) : null}
              {showTeachersAndPay ? (
                <label className="flex flex-col gap-1 text-sm text-text-secondary">
                  <span>Scales</span>
                  <MoneyInput
                    value={scaleAmountInput}
                    onValueChange={setScaleAmountInput}
                    className="rounded-md border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                  />
                </label>
              ) : null}
            </div>
          </section>

          {showTeachersAndPay ? (
          <section className="rounded-lg border border-border-default bg-bg-secondary/50 p-4">
            <h3 className="mb-2 text-xs font-medium text-text-muted">Gia sư</h3>
            <div className="space-y-3">
              <div className="flex flex-col gap-2">
                {selectedTeachers.map((t) => (
                  <div
                    key={t.id}
                    className="flex flex-wrap items-center gap-2 rounded-lg border border-border-default bg-bg-surface p-2 sm:flex-nowrap"
                  >
                    <span className="min-w-0 flex-1 break-words text-sm font-medium text-text-primary">
                      {t.name}
                    </span>
                    <label className="flex shrink-0 items-center gap-1.5 text-sm text-text-secondary">
                      <span className="whitespace-nowrap text-xs text-text-muted">Riêng</span>
                      <MoneyInput
                        value={
                          t.customAllowance == null
                            ? ""
                            : moneyInputInitialFromNumber(t.customAllowance)
                        }
                        onValueChange={(nextValue) => {
                          const v = nextValue.trim();
                          if (v === "") {
                            setSelectedTeachers((prev) =>
                              prev.map((x) =>
                                x.id === t.id ? { ...x, customAllowance: undefined } : x,
                              ),
                            );
                            return;
                          }
                          const num = parseMoneyInput(v);
                          if (num == null || num < 0) {
                            toast.error("Trợ cấp riêng phải là số không âm.");
                            return;
                          }
                          setSelectedTeachers((prev) =>
                            prev.map((x) =>
                              x.id === t.id ? { ...x, customAllowance: num } : x,
                            ),
                          );
                        }}
                        placeholder="VNĐ"
                        className="w-24 rounded border border-border-default bg-bg-primary px-2 py-1.5 text-right text-sm tabular-nums text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-1 focus-visible:ring-border-focus"
                      />
                    </label>
                    <label className="flex shrink-0 items-center gap-1.5 text-sm text-text-secondary">
                      <span className="whitespace-nowrap text-xs text-text-muted">Vận hành</span>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step="0.01"
                        value={t.operatingDeductionRatePercent ?? ""}
                        onChange={(e) => {
                          const v = e.target.value.trim();
                          if (v === "") {
                            setSelectedTeachers((prev) =>
                              prev.map((x) =>
                                x.id === t.id
                                  ? { ...x, operatingDeductionRatePercent: undefined }
                                  : x,
                              ),
                            );
                            return;
                          }
                          const num = Number(v);
                          if (!Number.isFinite(num) || num < 0 || num > 100) {
                            toast.error("Khấu trừ vận hành phải trong khoảng 0-100%.");
                            return;
                          }
                          setSelectedTeachers((prev) =>
                            prev.map((x) =>
                              x.id === t.id
                                ? {
                                    ...x,
                                    operatingDeductionRatePercent: Number(
                                      num.toFixed(2),
                                    ),
                                  }
                                : x,
                            ),
                          );
                        }}
                        placeholder="%"
                        className="w-20 rounded border border-border-default bg-bg-primary px-2 py-1.5 text-right text-sm tabular-nums text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-1 focus-visible:ring-border-focus"
                      />
                      <span className="text-xs text-text-muted">%</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setSelectedTeachers((prev) => prev.filter((x) => x.id !== t.id))}
                      className="rounded p-1 text-text-muted transition-colors hover:bg-bg-tertiary hover:text-error focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                      aria-label={`Bỏ ${t.name}`}
                    >
                      <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
              <div className="relative" ref={teacherSearchRef}>
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={teacherSearchInput}
                    onChange={(e) => setTeacherSearchInput(e.target.value)}
                    onFocus={() => setTeacherSearchFocused(true)}
                    placeholder="Tìm gia sư…"
                    className="w-full rounded-md border border-border-default bg-bg-surface px-3 py-2 pr-9 text-sm text-text-primary placeholder:text-text-muted focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                    aria-label="Tìm kiếm gia sư"
                    aria-autocomplete="list"
                  />
                  <span
                    className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-muted"
                    aria-hidden
                  >
                    <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </span>
                </div>
                {teacherSearchFocused && (
                  <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-48 overflow-y-auto rounded-md border border-border-default bg-bg-surface py-1 shadow-lg">
                    {filteredStaff.length === 0 ? (
                      <p className="px-3 py-2 text-sm text-text-muted">
                        {teacherSearchInput.trim() ? "Không có kết quả" : "Gõ tên…"}
                      </p>
                    ) : (
                      filteredStaff.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => {
                            setSelectedTeachers((prev) => [
                              ...prev,
                              {
                                id: s.id,
                                name: s.fullName?.trim() || s.id,
                                customAllowance: undefined,
                                operatingDeductionRatePercent: undefined,
                              },
                            ]);
                            setTeacherSearchInput("");
                            setTeacherSearchFocused(false);
                          }}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text-primary transition-colors hover:bg-bg-tertiary focus:bg-bg-tertiary focus:outline-none focus-visible:ring-0"
                        >
                          {s.fullName?.trim() || s.id}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-1 text-sm text-text-secondary">
                <span>Quản lý lớp</span>
                <UpgradedSelect
                  name="add-class-training-manager"
                  value={trainingManagerId}
                  onValueChange={setTrainingManagerId}
                  options={trainingManagerSelectOptions}
                  buttonClassName="rounded-md border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                />
                <span className="text-xs text-text-muted">
                  % trợ cấp quản lý lớp do Admin chỉnh sau khi tạo lớp.
                </span>
              </div>
            </div>
          </section>
          ) : null}

          {showTuitionAndStudents ? (
          <>
          <section className="rounded-lg border border-border-default bg-bg-secondary/50 p-4">
            <h3 className="mb-2 text-xs font-medium text-text-muted">Học sinh</h3>
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {selectedStudents.map((s) => (
                  <span
                    key={s.id}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border-default bg-bg-surface px-3 py-1.5 text-sm text-text-primary"
                  >
                    {s.name}
                    <button
                      type="button"
                      onClick={() => setSelectedStudents((prev) => prev.filter((x) => x.id !== s.id))}
                      className="rounded-full p-0.5 text-text-muted transition-colors hover:bg-bg-tertiary hover:text-error focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                      aria-label={`Bỏ ${s.name}`}
                    >
                      <svg className="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </span>
                ))}
              </div>
              <div className="relative" ref={studentSearchRef}>
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={studentSearchInput}
                    onChange={(e) => setStudentSearchInput(e.target.value)}
                    onFocus={() => setStudentSearchFocused(true)}
                    placeholder="Tìm học sinh…"
                    className="w-full rounded-md border border-border-default bg-bg-surface px-3 py-2 pr-9 text-sm text-text-primary placeholder:text-text-muted focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                    aria-label="Tìm kiếm học sinh"
                    aria-autocomplete="list"
                  />
                  <span
                    className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-muted"
                    aria-hidden
                  >
                    <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </span>
                </div>
                {studentSearchFocused && (
                  <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-48 overflow-y-auto rounded-md border border-border-default bg-bg-surface py-1 shadow-lg">
                    {filteredStudents.length === 0 ? (
                      <p className="px-3 py-2 text-sm text-text-muted">
                        {studentSearchInput.trim() ? "Không có kết quả" : "Gõ tên…"}
                      </p>
                    ) : (
                      filteredStudents.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => {
                            setSelectedStudents((prev) => [
                              ...prev,
                              { id: s.id, name: (s.fullName?.trim() ?? "") || s.id },
                            ]);
                            setStudentSearchInput("");
                            setStudentSearchFocused(false);
                          }}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text-primary transition-colors hover:bg-bg-tertiary focus:bg-bg-tertiary focus:outline-none focus-visible:ring-0"
                        >
                          {(s.fullName?.trim() ?? "") || s.id}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-border-default bg-bg-secondary/50 p-4">
            <h3 className="mb-2 text-xs font-medium text-text-muted">Học phí</h3>
            <div className="grid gap-3 md:grid-cols-2">
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
            </div>
          </section>
          </>
          ) : null}

          {showAdminOnly ? (
          <>
          <section className="rounded-lg border border-border-default bg-bg-secondary/50 p-4">
            <div className="mb-2 flex items-center justify-between gap-3">
              <h3 className="text-xs font-medium text-text-muted">Lịch</h3>
              <button
                type="button"
                onClick={handleAddRange}
                className="rounded-md border border-border-default bg-bg-surface px-3 py-1.5 text-sm font-medium text-text-primary transition-colors duration-200 hover:bg-bg-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
              >
                + Thêm
              </button>
            </div>
            <div className="space-y-3">
              {scheduleRanges.map((range, index) => (
                <div
                  key={range.id}
                  className="rounded-xl border border-border-default bg-bg-surface p-4 shadow-sm transition-colors duration-200 hover:bg-bg-secondary/80"
                >
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <p className="text-xs text-text-muted">{index + 1}</p>
                    <button
                      type="button"
                      onClick={() => handleRemoveRange(range.id)}
                      className="rounded-md border border-border-default px-3 py-1.5 text-sm font-medium text-text-muted transition-colors duration-200 hover:bg-error/15 hover:text-error focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                    >
                      Xóa
                    </button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-[auto_1fr_auto_1fr] sm:items-end">
                    <label className="flex flex-col gap-1 text-sm text-text-secondary">
                      <span className="text-text-muted">Ngày</span>
                      <UpgradedSelect
                        name={`add-class-schedule-day-${range.id}`}
                        value={String(range.dayOfWeek)}
                        onValueChange={(value) =>
                          handleDayChange(range.id, normalizeDayOfWeek(value))
                        }
                        options={CLASS_SCHEDULE_DAY_OPTIONS.map((option) => ({
                          value: option.value,
                          label: option.label,
                          selectedLabel: option.selectedLabel,
                        }))}
                        buttonClassName="rounded-md border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-sm text-text-secondary">
                      <span className="text-text-muted">Bắt đầu</span>
                      <TimeInput
                        name={`add-class-schedule-from-${range.id}`}
                        value={range.from}
                        autoComplete="off"
                        onChange={(e) => handleChangeRange(range.id, "from", e.target.value)}
                        className="rounded-md border border-border-default bg-bg-surface px-3 py-2 font-mono text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                      />
                    </label>
                    <div className="flex items-center justify-center pb-2 text-text-muted" aria-hidden>
                      <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14m-4-4 4 4-4 4" />
                      </svg>
                    </div>
                    <label className="flex flex-col gap-1 text-sm text-text-secondary">
                      <span className="text-text-muted">Kết thúc</span>
                      <TimeInput
                        name={`add-class-schedule-to-${range.id}`}
                        value={range.to}
                        autoComplete="off"
                        onChange={(e) => handleChangeRange(range.id, "to", e.target.value)}
                        className="rounded-md border border-border-default bg-bg-surface px-3 py-2 font-mono text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                      />
                    </label>
                  </div>
                  <label className="mt-3 flex flex-col gap-1 text-sm text-text-secondary">
                    <span className="text-[11px] uppercase tracking-wider text-text-muted">
                      Ngày hiệu lực (tuỳ chọn)
                    </span>
                    <DateInput
                      name={`add-class-schedule-effective-from-${range.id}`}
                      value={range.effectiveFrom}
                      onChange={(e) =>
                        handleEffectiveFromChange(range.id, e.target.value)
                      }
                      className="rounded-md border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                    />
                    <span className="text-[11px] text-text-muted">
                      Ngày slot cố định này bắt đầu áp dụng thật sự — có thể backdate trước cả ngày tạo lớp (vd. lớp học đã dạy trước khi tạo hệ thống). Bỏ trống = tính từ hôm nay.
                    </span>
                  </label>
                </div>
              ))}
            </div>
          </section>

          <ClassPricingModeField
            value={pricingMode}
            onChange={handlePricingModeChange}
            standardBlockCount={standardBlockCount}
            missingReason={missingBlockReason}
            previewLines={previewLines}
          />
          </>
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
              Thêm lớp
            </button>
          </ResponsiveActionFooter>
        </form>
      </ResponsiveDialog>
      <ConfirmDialog
        open={confirmDiscardOpen}
        onOpenChange={setConfirmDiscardOpen}
        title="Bỏ lớp đang tạo?"
        description="Thông tin lớp vừa nhập chưa được lưu."
        confirmLabel="Bỏ"
        cancelLabel="Tiếp tục nhập"
        variant="destructive"
        onConfirm={() => {
          setConfirmDiscardOpen(false);
          onClose();
        }}
      />
    </>
  );
}
