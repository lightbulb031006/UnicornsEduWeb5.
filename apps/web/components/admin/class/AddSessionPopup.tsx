"use client";

import { useMemo, useState, useCallback, type SyntheticEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  SessionAttendanceItem,
  SessionAttendanceStatus,
  SessionCreatePayload,
  SessionItem,
} from "@/dtos/session.dto";
import type { ClassPricingMode } from "@/dtos/class.dto";
import {
  CONTENT_LIMITS,
  firstOverLimit,
} from "@/dtos/content-limits";
import { getFullProfile } from "@/lib/apis/auth.api";
import * as sessionApi from "@/lib/apis/session.api";
import { formatCurrency } from "@/lib/class.helpers";
import {
  isNonNegativeMoneyInput,
  normalizeMoneyValue,
  parseMoneyInput,
} from "@/lib/money-input.helpers";
import {
  blockCountFromClockRange,
  computeSessionAllowanceRawBaseVnd,
  computeTeacherSessionAllowanceGrossPreviewVnd,
  grossAllowanceToRawBaseVnd,
  resolveLivePreviewPerStudentAllowanceVnd,
  resolveTeacherScaleAmountVnd,
} from "@/lib/session-allowance.helpers";
import {
  resolveLivePreviewStudentTuitionVnd,
  resolvePreviewStudentBlockRateVnd,
} from "@/lib/session-tuition.helpers";
import { getSessionTimeSubmitError } from "@/lib/session-time.helpers";
import {
  buildSessionCommentZaloText,
  findStudentsMissingRequiredComments,
  formatMissingStudentCommentsToast,
  isChargeableAttendanceStatus,
  isRichTextNonEmpty,
  stripRichTextToPlainText,
  SESSION_HOMEWORK_PLACEHOLDER,
  SESSION_LESSON_CONTENT_PLACEHOLDER,
  SESSION_TUTORIAL_PLACEHOLDER,
} from "@/lib/session-comment-zalo.helpers";
import {
  AttendanceInlineSummary,
  formatVnSessionDuration,
  RequiredMark,
  SessionAttendanceEditor,
  SessionCopyCommentButton,
  SessionFormDialog,
  SessionFormDialogBody,
  SessionFormDialogFooter,
  SessionFormDialogHeader,
  SessionTeacherAllowanceEstimateCard,
  SessionUnsavedChangesDialog,
  TrialLessonToggle,
} from "@/components/admin/session/session-form-ui";
import { DateInput } from "@/components/ui/DateInput";
import RichTextEditor from "@/components/ui/RichTextEditor";
import { TimeInput } from "@/components/ui/TimeInput";
import { currentTimePrefillValue } from "@/components/ui/time-input.helpers";
import UpgradedSelect from "@/components/ui/UpgradedSelect";
import YouTubeEmbed, { extractYouTubeVideoId } from "@/components/ui/YouTubeEmbed";
import { runBackgroundSave } from "@/lib/mutation-feedback";
import { normalizeOptionalRichTextContent } from "@/lib/sanitize";
import {
  buildSessionFormDirtySnapshot,
  isSessionFormDirty,
} from "@/lib/session-form-dirty.helpers";
import { cn } from "@/lib/utils";

export interface SessionStudentItem {
  id: string;
  fullName: string;
  /** Học phí / buổi backend đã resolve (chuỗi per-session). */
  tuitionFee?: number | null;
  /** Override `custom_tuition_per_block` của học sinh trong lớp. */
  tuitionPerBlock?: number | null;
}

type AttendanceFormItem = {
  studentId: string;
  fullName: string;
  status: SessionAttendanceStatus;
  notes: string;
  tuitionFee: string;
  defaultTuitionFee: number | null;
  /** Đơn giá / 30 phút riêng của học sinh, dùng cho preview chế độ block. */
  customTuitionPerBlock: number | null;
};

type SessionTeacherItem = {
  id: string;
  fullName?: string | null;
};

type SessionTeacherMode = "select" | "readOnly";

/** Dữ liệu lớp để ước lượng trợ cấp (công thức đồng bộ docs income-summary). */
export type SessionClassPricingContext = {
  allowancePerSessionPerStudent: number;
  allowancePerBlockPerStudent?: number | null;
  maxAllowancePerSession?: number | null;
  maxAllowancePerBlock?: number | null;
  scaleAmount?: number | null;
  teacherCustomAllowanceByTeacherId?: Record<string, number | null | undefined>;
  /** Scale riêng theo gia sư (null/thiếu = theo `scaleAmount` của lớp; 0 = không có scale). */
  teacherCustomScaleByTeacherId?: Record<string, number | null | undefined>;
  pricingMode?: ClassPricingMode;
  /** Đơn giá học phí / 30 phút của lớp (`student_tuition_per_block`). */
  studentTuitionPerBlock?: number | null;
  /** Số block của buổi chuẩn theo lịch cố định — fallback khi giờ nhập không chia hết 30 phút. */
  standardBlockCount?: number | null;
};

type Props = {
  open: boolean;
  classId: string;
  className?: string;
  defaultTeacherId?: string;
  teachers?: SessionTeacherItem[];
  students: SessionStudentItem[];
  sessionTuitionTotal?: number;
  /** Khi có, hiển thị tổng trợ cấp dự kiến ở header + khối phân tích */
  classPricing?: SessionClassPricingContext;
  teacherMode?: SessionTeacherMode;
  allowFinancialFields?: boolean;
  /**
   * Hiện thẻ "Trợ cấp buổi" chỉ đọc kể cả khi không được sửa trợ cấp
   * (gia sư tự tạo buổi xem trước trợ cấp của mình).
   */
  showAllowancePreview?: boolean;
  allowAllowanceField?: boolean;
  allowAttendanceTuitionEdits?: boolean;
  /** Lớp không cần điểm danh — ẩn phần điểm danh, BE tự sinh present. */
  noAttendance?: boolean;
  createSessionFn?: (payload: SessionCreatePayload) => Promise<SessionItem>;
  onClose: () => void;
  onCreated?: (session: SessionItem) => void;
};

const PAYMENT_STATUS_META = {
  unpaid: {
    label: "Chưa thanh toán",
    dotClassName: "bg-warning",
    pillClassName:
      "border border-warning/25 bg-warning/10 text-warning shadow-[inset_0_1px_0_color-mix(in_srgb,var(--ue-bg-surface)_35%,transparent)]",
  },
  deposit: {
    label: "Cọc",
    dotClassName: "bg-info",
    pillClassName:
      "border border-info/25 bg-info/10 text-info shadow-[inset_0_1px_0_color-mix(in_srgb,var(--ue-bg-surface)_35%,transparent)]",
  },
  paid: {
    label: "Đã thanh toán",
    dotClassName: "bg-success",
    pillClassName:
      "border border-success/25 bg-success/10 text-success shadow-[inset_0_1px_0_color-mix(in_srgb,var(--ue-bg-surface)_35%,transparent)]",
  },
} satisfies Record<
  "unpaid" | "deposit" | "paid",
  {
    label: string;
    dotClassName: string;
    pillClassName: string;
  }
>;

function renderPaymentStatusOptionLabel(status: "unpaid" | "deposit" | "paid") {
  const meta = PAYMENT_STATUS_META[status];

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-semibold ${meta.pillClassName}`}
    >
      <span
        className={`size-2 rounded-full ${meta.dotClassName}`}
        aria-hidden
      />
      {meta.label}
    </span>
  );
}

const PAYMENT_STATUS_OPTIONS = (
  [
    { value: "unpaid", label: renderPaymentStatusOptionLabel("unpaid") },
    { value: "deposit", label: renderPaymentStatusOptionLabel("deposit") },
    { value: "paid", label: renderPaymentStatusOptionLabel("paid") },
  ] as const
).map((option) => ({
  value: option.value,
  label: option.label,
}));

function getTodayDateInputValue(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeTimeInput(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";

  const matched = trimmed.match(/^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/);
  if (!matched) return "";

  const [, h, m, s = "00"] = matched;
  return `${h}:${m}:${s}`;
}

function toAttendancePayload(
  items: AttendanceFormItem[],
  includeTuition: boolean,
): SessionAttendanceItem[] {
  return items.map((item) => ({
    studentId: item.studentId,
    status: item.status,
    notes: normalizeOptionalRichTextContent(item.notes),
    ...(includeTuition && item.tuitionFee.trim() !== ""
      ? { tuitionFee: parseMoneyInput(item.tuitionFee) ?? 0 }
      : {}),
  }));
}

function resolveAttendanceTuitionValue(item: AttendanceFormItem): number {
  if (!isChargeableAttendanceStatus(item.status)) {
    return 0;
  }

  const normalizedInput = normalizeMoneyValue(item.tuitionFee);
  if (item.tuitionFee.trim() !== "" && normalizedInput != null && normalizedInput >= 0) {
    return normalizedInput;
  }

  return normalizeMoneyValue(item.defaultTuitionFee) ?? 0;
}

function resolveSelectedTeacherId(options: {
  defaultTeacherId?: string;
  teacherMode: SessionTeacherMode;
  teachers: SessionTeacherItem[];
}): string {
  if (options.defaultTeacherId) {
    return options.defaultTeacherId;
  }

  if (options.teacherMode === "readOnly" && options.teachers.length === 1) {
    return options.teachers[0]?.id ?? "";
  }

  if (options.teacherMode === "select") {
    return options.teachers[0]?.id ?? "";
  }

  return "";
}

/** Tham chiếu ổn định: default `[]` inline tạo mảng mới mỗi render, phá memo. */
const EMPTY_TEACHERS: SessionTeacherItem[] = [];

export default function AddSessionPopup({
  open,
  classId,
  className = "",
  defaultTeacherId,
  teachers = EMPTY_TEACHERS,
  students,
  sessionTuitionTotal = 0,
  classPricing,
  teacherMode = "select",
  allowFinancialFields = true,
  showAllowancePreview = false,
  allowAllowanceField,
  allowAttendanceTuitionEdits,
  noAttendance = false,
  createSessionFn = sessionApi.createSession,
  onClose,
  onCreated,
}: Props) {
  const queryClient = useQueryClient();
  const { data: fullProfile } = useQuery({
    queryKey: ["auth", "full-profile"],
    queryFn: getFullProfile,
    retry: false,
    staleTime: 60_000,
  });
  const canEditAllowance = allowAllowanceField ?? allowFinancialFields;
  const canEditAttendanceTuition =
    allowAttendanceTuitionEdits ?? allowFinancialFields;

  const [date, setDate] = useState(() => getTodayDateInputValue());
  const [startTime, setStartTime] = useState(() => currentTimePrefillValue());
  const [endTime, setEndTime] = useState("");
  const [lessonContent, setLessonContent] = useState("");
  const [homework, setHomework] = useState("");
  const [tutorial, setTutorial] = useState("");
  const [recordingUrl, setRecordingUrl] = useState("");
  const [lessonContentError, setLessonContentError] = useState("");
  const [homeworkError, setHomeworkError] = useState("");
  const [tutorialError, setTutorialError] = useState("");
  const [recordingUrlError, setRecordingUrlError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTrialLesson, setIsTrialLesson] = useState(false);
  const [teacherPaymentStatus, setTeacherPaymentStatus] = useState<string>("unpaid");
  const [selectedTeacherId, setSelectedTeacherId] = useState(() => resolveSelectedTeacherId({
      defaultTeacherId,
      teacherMode,
      teachers,
    }),);
  const [attendanceItems, setAttendanceItems] = useState<AttendanceFormItem[]>(() =>
    students.map((student) => ({
      studentId: student.id,
      fullName: student.fullName,
      status: "absent",
      notes: "",
      tuitionFee: "",
      defaultTuitionFee: normalizeMoneyValue(student.tuitionFee),
      customTuitionPerBlock: normalizeMoneyValue(student.tuitionPerBlock),
    })),
  );
  const [manualAllowanceGrossOverride, setManualAllowanceGrossOverride] =
    useState<number | null>(null);
  const [unsavedConfirmOpen, setUnsavedConfirmOpen] = useState(false);
  const [createFormBaseline, setCreateFormBaseline] = useState<string | null>(
    null,
  );

  const currentCreateFormSnapshot = useMemo(
    () => ({
      date,
      startTime,
      endTime,
      lessonContent,
      homework,
      tutorial,
      recordingUrl,
      isTrialLesson,
      teacherPaymentStatus,
      teacherId: selectedTeacherId,
      manualAllowanceGrossOverride,
      attendance: attendanceItems.map((item) => ({
        studentId: item.studentId,
        status: item.status,
        notes: item.notes,
        tuitionFee: item.tuitionFee,
      })),
    }),
    [
      attendanceItems,
      date,
      endTime,
      homework,
      isTrialLesson,
      lessonContent,
      manualAllowanceGrossOverride,
      recordingUrl,
      selectedTeacherId,
      startTime,
      teacherPaymentStatus,
      tutorial,
    ],
  );

  const isCreateFormDirty = useMemo(
    () => isSessionFormDirty(createFormBaseline, currentCreateFormSnapshot),
    [createFormBaseline, currentCreateFormSnapshot],
  );

  const forceCloseCreateForm = useCallback(() => {
    setUnsavedConfirmOpen(false);
    setCreateFormBaseline(null);
    onClose();
  }, [onClose]);

  const requestCloseCreateForm = useCallback(() => {
    if (isSubmitting || unsavedConfirmOpen) return;
    if (isCreateFormDirty) {
      setUnsavedConfirmOpen(true);
      return;
    }
    forceCloseCreateForm();
  }, [forceCloseCreateForm, isCreateFormDirty, isSubmitting, unsavedConfirmOpen]);

  // Reset draft metadata only when the controlled dialog changes open state.
  const [baselineOpen, setBaselineOpen] = useState(false);
  if (baselineOpen !== open) {
    setBaselineOpen(open);
    setCreateFormBaseline(open
      ? buildSessionFormDirtySnapshot(currentCreateFormSnapshot)
      : null);
    if (!open) {
      setUnsavedConfirmOpen(false);
      setManualAllowanceGrossOverride(null);
    }
  }

  const attendanceSummary = useMemo(() => {
    return attendanceItems.reduce(
      (acc, item) => ({
        ...acc,
        [item.status]: acc[item.status] + 1,
      }),
      {
        present: 0,
        excused: 0,
        absent: 0,
      },
    );
  }, [attendanceItems]);
  const previewBlockCount = useMemo(
    () => blockCountFromClockRange(startTime, endTime),
    [startTime, endTime],
  );
  /**
   * Số block dùng để ước lượng: giờ nhập không chia hết 30 phút thì backend
   * rơi về số block của buổi chuẩn theo lịch lớp — preview bám theo.
   */
  const classPricingMode = classPricing?.pricingMode;
  const classTuitionPerBlock = classPricing?.studentTuitionPerBlock ?? null;
  const effectiveTuitionBlockCount =
    previewBlockCount ?? classPricing?.standardBlockCount ?? null;

  /** Học phí mặc định từng học sinh, tính lại theo khung giờ đang nhập. */
  const previewAttendanceItems = useMemo(
    () =>
      attendanceItems.map((item) => ({
        ...item,
        defaultTuitionFee: resolveLivePreviewStudentTuitionVnd({
          pricingMode: classPricingMode,
          customTuitionPerBlock: item.customTuitionPerBlock,
          classTuitionPerBlock,
          effectiveTuitionPerSession: item.defaultTuitionFee,
          blockCount: effectiveTuitionBlockCount,
        }),
      })),
    [attendanceItems, classPricingMode, classTuitionPerBlock, effectiveTuitionBlockCount],
  );

  /** Dòng giải thích cách quy học phí ra block 30 phút. */
  const tuitionBlockPreviewNote = useMemo(() => {
    if (classPricingMode !== "per_block") return null;
    if (effectiveTuitionBlockCount == null) {
      return "Nhập giờ kết thúc (bội số 30 phút) để tính học phí theo block";
    }

    const rates = attendanceItems.map((item) =>
      resolvePreviewStudentBlockRateVnd({
        pricingMode: classPricingMode,
        customTuitionPerBlock: item.customTuitionPerBlock,
        classTuitionPerBlock,
      }),
    );
    const uniformRate =
      rates.length > 0 && rates.every((rate) => rate != null && rate === rates[0])
        ? rates[0]
        : null;
    const source = previewBlockCount == null ? " (theo buổi chuẩn)" : "";
    const blocks = `${effectiveTuitionBlockCount} block × 30 phút${source}`;

    return uniformRate == null
      ? blocks
      : `${uniformRate.toLocaleString("vi-VN")}đ/hs/30 phút × ${blocks}`;
  }, [
    attendanceItems,
    classPricingMode,
    classTuitionPerBlock,
    effectiveTuitionBlockCount,
    previewBlockCount,
  ]);

  const resolvedSessionTuitionTotal = useMemo(() => {
    if (previewAttendanceItems.length === 0) {
      return sessionTuitionTotal;
    }

    if (noAttendance) {
      return previewAttendanceItems.reduce(
        (sum, item) => sum + (normalizeMoneyValue(item.defaultTuitionFee) ?? 0),
        0,
      );
    }

    return previewAttendanceItems.reduce(
      (sum, item) => sum + resolveAttendanceTuitionValue(item),
      0,
    );
  }, [previewAttendanceItems, sessionTuitionTotal, noAttendance]);
  const attendanceDefaultTuitionTotal = useMemo(
    () =>
      previewAttendanceItems.reduce(
        (sum, item) =>
          sum +
          (isChargeableAttendanceStatus(item.status)
            ? (normalizeMoneyValue(item.defaultTuitionFee) ?? 0)
            : 0),
        0,
      ),
    [previewAttendanceItems],
  );
  const attendanceOverrideCount = useMemo(
    () =>
      attendanceItems.filter(
        (item) => isChargeableAttendanceStatus(item.status) && item.tuitionFee.trim() !== "",
      ).length,
    [attendanceItems],
  );
  const selectedTeacher = useMemo(
    () => teachers.find((teacher) => teacher.id === selectedTeacherId) ?? null,
    [teachers, selectedTeacherId],
  );

  const resolvedTeacherAllowanceBase = useMemo(() => {
    if (!classPricing) return 0;
    const teacherCustom = selectedTeacherId
      ? classPricing.teacherCustomAllowanceByTeacherId?.[selectedTeacherId]
      : null;
    return resolveLivePreviewPerStudentAllowanceVnd({
      pricingMode: classPricing.pricingMode,
      teacherCustomPerSession: teacherCustom,
      classDefaultPerSession: classPricing.allowancePerSessionPerStudent,
      classDefaultPerBlock: classPricing.allowancePerBlockPerStudent,
      blockCount: previewBlockCount,
    });
  }, [classPricing, selectedTeacherId, previewBlockCount]);

  const resolvedTeacherScaleAmount = useMemo(() => {
    if (!classPricing) return 0;
    return resolveTeacherScaleAmountVnd({
      customScaleAmount: selectedTeacherId
        ? classPricing.teacherCustomScaleByTeacherId?.[selectedTeacherId]
        : null,
      classScaleAmount: classPricing.scaleAmount,
    });
  }, [classPricing, selectedTeacherId]);

  const chargeableAttendanceCount = useMemo(
    () =>
      noAttendance
        ? attendanceItems.length
        : attendanceItems.filter((item) => isChargeableAttendanceStatus(item.status))
            .length,
    [attendanceItems, noAttendance],
  );

  const allowanceRawBasePreview = useMemo(() => {
    if (!classPricing) return null;
    return computeSessionAllowanceRawBaseVnd({
      allowancePerStudent: resolvedTeacherAllowanceBase,
      chargeableStudentCount: chargeableAttendanceCount,
      scaleAmount: resolvedTeacherScaleAmount,
    });
  }, [
    classPricing,
    resolvedTeacherAllowanceBase,
    resolvedTeacherScaleAmount,
    chargeableAttendanceCount,
  ]);

  const coefficientForPreview = isTrialLesson ? 0 : 1;

  const expectedAllowanceGrossPreview = useMemo(() => {
    if (allowanceRawBasePreview == null || !classPricing) return null;
    return computeTeacherSessionAllowanceGrossPreviewVnd({
      rawBase: allowanceRawBasePreview,
      coefficient: coefficientForPreview,
      maxAllowancePerSession: classPricing.maxAllowancePerSession,
      maxAllowancePerBlock: classPricing.maxAllowancePerBlock,
      snapshotBlockCount: previewBlockCount,
      pricingMode: classPricing.pricingMode,
    });
  }, [
    allowanceRawBasePreview,
    classPricing,
    coefficientForPreview,
    previewBlockCount,
  ]);
  const finalAllowancePreview =
    manualAllowanceGrossOverride ?? expectedAllowanceGrossPreview;

  const durationLabel = useMemo(
    () => formatVnSessionDuration(startTime, endTime),
    [startTime, endTime],
  );
  const canViewTuitionHeader =
    fullProfile?.roleType === "admin" ||
    (fullProfile?.roleType === "staff" &&
      ((fullProfile.staffInfo?.roles ?? []).includes("accountant") ||
        (fullProfile.staffInfo?.roles ?? []).includes("accountant_income")));
  const headerTuitionDisplay = useMemo(() => {
    if (!canViewTuitionHeader) return null;
    return `Học phí: ${formatCurrency(resolvedSessionTuitionTotal)}`;
  }, [canViewTuitionHeader, resolvedSessionTuitionTotal]);
  const headerAllowanceDisplay = useMemo(() => {
    if (!allowFinancialFields) return null;
    if (finalAllowancePreview != null && classPricing) {
      return `Trợ cấp gia sư: ${formatCurrency(finalAllowancePreview)}`;
    }
    return null;
  }, [allowFinancialFields, finalAllowancePreview, classPricing]);

  const zaloCommentText = useMemo(
    () =>
      buildSessionCommentZaloText({
        className,
        date,
        startTime,
        endTime,
        lessonContent,
        homework,
        tutorial,
        students: attendanceItems.map((item) => ({
          fullName: item.fullName,
          status: item.status,
          notes: item.notes,
        })),
      }),
    [attendanceItems, className, date, endTime, homework, lessonContent, startTime, tutorial],
  );

  const handleAttendanceStatusChange = (
    studentId: string,
    status: SessionAttendanceStatus,
  ) => {
    setAttendanceItems((prev) =>
      prev.map((item) =>
        item.studentId === studentId
          ? {
            ...item,
            status,
          }
          : item,
      ),
    );
  };

  const handleAttendanceNotesChange = (studentId: string, value: string) => {
    setAttendanceItems((prev) =>
      prev.map((item) =>
        item.studentId === studentId
          ? {
            ...item,
            notes: value,
          }
          : item,
      ),
    );
  };

  const handleAttendanceTuitionChange = (studentId: string, value: string) => {
    setAttendanceItems((prev) =>
      prev.map((item) =>
        item.studentId === studentId
          ? {
            ...item,
            tuitionFee: value,
          }
          : item,
      ),
    );
  };

  const handleSubmit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;
    setLessonContentError("");
    setHomeworkError("");

    if (!selectedTeacherId) {
      toast.error(
        teacherMode === "readOnly"
          ? "Lớp phải có đúng 1 gia sư phụ trách trước khi thêm buổi học."
          : "Vui lòng chọn gia sư phụ trách.",
      );
      return;
    }

    if (students.length === 0) {
      toast.error("Lớp chưa có học sinh để điểm danh.");
      return;
    }

    const timeError = getSessionTimeSubmitError(startTime, endTime, {
      required: classPricing?.pricingMode === "per_block",
    });
    if (timeError) {
      toast.error(timeError);
      return;
    }
    const normalizedStartTime = normalizeTimeInput(startTime);
    const normalizedEndTime = normalizeTimeInput(endTime);

    const trimmedLessonContent = lessonContent.trim();
    const trimmedHomework = homework.trim();
    const trimmedTutorial = tutorial.trim();

    if (!isRichTextNonEmpty(trimmedLessonContent)) {
      setLessonContentError("Vui lòng nhập nội dung bài học.");
      toast.error("Vui lòng nhập nội dung bài học.");
      return;
    }

    if (!isRichTextNonEmpty(trimmedHomework)) {
      setHomeworkError("Vui lòng nhập bài tập về nhà.");
      toast.error("Vui lòng nhập bài tập về nhà.");
      return;
    }

    if (!isRichTextNonEmpty(trimmedTutorial)) {
      setTutorialError("Vui lòng nhập tutorial các buổi học.");
      toast.error("Vui lòng nhập tutorial các buổi học.");
      return;
    }

    const sessionTextTooLong = firstOverLimit([
      {
        label: "Nội dung bài học",
        value: trimmedLessonContent,
        max: CONTENT_LIMITS.sessionRichText,
      },
      {
        label: "Bài tập về nhà",
        value: trimmedHomework,
        max: CONTENT_LIMITS.sessionRichText,
      },
      {
        label: "Tutorial",
        value: trimmedTutorial,
        max: CONTENT_LIMITS.sessionRichText,
      },
      {
        label: "Link recording",
        value: recordingUrl.trim(),
        max: CONTENT_LIMITS.url,
      },
    ]);
    if (sessionTextTooLong) {
      toast.error(sessionTextTooLong);
      return;
    }

    if (recordingUrl.trim() && !extractYouTubeVideoId(recordingUrl.trim())) {
      setRecordingUrlError("Link video YouTube không hợp lệ.");
      toast.error("Link video YouTube không hợp lệ.");
      return;
    }

    if (!noAttendance) {
      const missingStudentComments = findStudentsMissingRequiredComments(
        attendanceItems,
      );
      if (missingStudentComments.length > 0) {
        toast.error(formatMissingStudentCommentsToast(missingStudentComments));
        return;
      }

      const hasAttendanceNotesTooLong = attendanceItems.some(
        (item) => stripRichTextToPlainText(item.notes).length > CONTENT_LIMITS.attendanceNotes,
      );

      if (hasAttendanceNotesTooLong) {
        toast.error(`Ghi chú điểm danh tối đa ${CONTENT_LIMITS.attendanceNotes} ký tự.`);
        return;
      }

      const hasInvalidAttendanceTuition =
        canEditAttendanceTuition &&
        attendanceItems.some((item) => !isNonNegativeMoneyInput(item.tuitionFee));

      if (hasInvalidAttendanceTuition) {
        toast.error("Học phí từng học sinh phải là số không âm.");
        return;
      }
    }

    const coeffNum = isTrialLesson ? 0 : 1;

    if (
      canEditAllowance &&
      manualAllowanceGrossOverride !== null &&
      !isTrialLesson
    ) {
      if (
        !Number.isFinite(manualAllowanceGrossOverride) ||
        manualAllowanceGrossOverride < 0
      ) {
        toast.error("Trợ cấp buổi phải là số không âm.");
        return;
      }
    }

    const payload: SessionCreatePayload = {
      classId,
      teacherId: selectedTeacherId,
      date,
      startTime: normalizedStartTime || undefined,
      endTime: normalizedEndTime || undefined,
      lessonContent: trimmedLessonContent,
      homework: trimmedHomework,
      tutorial: trimmedTutorial,
      recordingUrl: recordingUrl.trim() || null,
      notes: zaloCommentText,
      coefficient: coeffNum,
      ...(allowFinancialFields ? { teacherPaymentStatus } : {}),
      ...(canEditAllowance &&
      manualAllowanceGrossOverride !== null &&
      !isTrialLesson
        ? {
            allowanceAmount: grossAllowanceToRawBaseVnd(
              manualAllowanceGrossOverride,
              coeffNum,
            ),
          }
        : {}),
      ...(noAttendance
        ? {}
        : {
            attendance: toAttendancePayload(
              attendanceItems,
              canEditAttendanceTuition,
            ),
          }),
    };

    setIsSubmitting(true);
    runBackgroundSave({
      loadingMessage: "Đang thêm buổi học...",
      successMessage: "Đã thêm buổi học.",
      errorMessage: "Không thể thêm buổi học. Vui lòng thử lại.",
      action: () => createSessionFn(payload),
      onSuccess: async (createdSession) => {
        await queryClient.invalidateQueries({ queryKey: ["sessions", "class", classId] });
        setCreateFormBaseline(null);
        setUnsavedConfirmOpen(false);
        onClose();
        onCreated?.(createdSession);
      },
      onError: () => {
        setIsSubmitting(false);
      },
    });
  };

  return (
    <>
    <SessionFormDialog open={open} onClose={requestCloseCreateForm} titleId="add-session-title">
      <SessionFormDialogHeader
        title="Thêm buổi học"
        tuitionText={headerTuitionDisplay}
        allowanceText={headerAllowanceDisplay}
        onClose={requestCloseCreateForm}
        titleId="add-session-title"
      />

      <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <SessionFormDialogBody>
                  <div className="space-y-5">
                    <div className="flex flex-col gap-1.5 text-sm font-medium text-text-primary">
                      <span>
                        Ngày học <RequiredMark />
                      </span>
                      <DateInput
                        name="add-session-date"
                        value={date}
                        autoComplete="off"
                        onChange={(event) => setDate(event.target.value)}
                        className="min-h-11 rounded-lg border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                        required
                      />
                    </div>

                    <div>
                      <p className="mb-1.5 text-sm font-medium text-text-primary">
                        Thời gian <RequiredMark />
                      </p>
                      <div className="flex flex-wrap items-end gap-2 sm:gap-3">
                        <label className="flex min-w-[8rem] flex-1 flex-col gap-1 text-xs text-text-secondary">
                          <span>Bắt đầu</span>
                          <TimeInput
                            name="add-session-start-time"
                            value={startTime}
                            autoComplete="off"
                            onChange={(event) => setStartTime(event.target.value)}
                            className="min-h-11 rounded-lg border border-border-default bg-bg-surface px-3 py-2 font-mono text-sm text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                            required
                          />
                        </label>
                        <span
                          className="mb-3 hidden text-text-muted sm:inline"
                          aria-hidden
                        >
                          →
                        </span>
                        <label className="flex min-w-[8rem] flex-1 flex-col gap-1 text-xs text-text-secondary">
                          <span>Kết thúc</span>
                          <TimeInput
                            name="add-session-end-time"
                            value={endTime}
                            autoComplete="off"
                            onChange={(event) => setEndTime(event.target.value)}
                            className="min-h-11 rounded-lg border border-border-default bg-bg-surface px-3 py-2 font-mono text-sm text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                            required
                          />
                        </label>
                      </div>
                      {durationLabel ? (
                        <p className="mt-1.5 text-xs text-text-muted">Thời lượng: {durationLabel}</p>
                      ) : null}
                    </div>

                    {teacherMode === "select" ? (
                      <div className="flex flex-col gap-1.5 text-sm font-medium text-text-primary">
                        <span>
                          Gia sư dạy <RequiredMark />
                        </span>
                        <UpgradedSelect
                          name="add-session-teacher"
                          value={selectedTeacherId}
                          onValueChange={setSelectedTeacherId}
                          options={teachers.map((teacher) => ({
                            value: teacher.id,
                            label: teacher.fullName?.trim() || "Gia sư",
                          }))}
                          placeholder="Chọn gia sư"
                          buttonClassName="min-h-11 rounded-lg border border-border-default bg-bg-surface px-3 py-2 text-left text-sm text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                        />
                        <span className="text-xs font-normal text-text-muted">
                          Chỉ hiển thị gia sư đã được phân công phụ trách lớp này.
                        </span>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-1.5 text-sm font-medium text-text-primary">
                        <span>
                          Gia sư dạy <RequiredMark />
                        </span>
                        <div
                          className={`flex min-h-11 items-center rounded-lg border px-3 py-2 text-sm ${selectedTeacher
                            ? "border-border-default bg-bg-surface text-text-primary"
                            : "border-warning/30 bg-warning/10 text-warning"
                            }`}
                        >
                          {selectedTeacher?.fullName?.trim() || "Chưa có gia sư cố định cho lớp."}
                        </div>
                      </div>
                    )}

                    <TrialLessonToggle
                      checked={isTrialLesson}
                      onChange={(isTrial) => {
                        setIsTrialLesson(isTrial);
                        if (isTrial) setManualAllowanceGrossOverride(null);
                      }}
                    />

                    {(canEditAllowance || showAllowancePreview) && classPricing ? (
                      <SessionTeacherAllowanceEstimateCard
                        amount={finalAllowancePreview}
                        estimatedAmount={expectedAllowanceGrossPreview}
                        breakdownText={
                          allowanceRawBasePreview == null
                            ? null
                            : `${resolvedTeacherAllowanceBase.toLocaleString("vi-VN")}đ/hs × ${chargeableAttendanceCount} hs + ${resolvedTeacherScaleAmount.toLocaleString("vi-VN")}đ = ${allowanceRawBasePreview.toLocaleString("vi-VN")}đ`
                        }
                        showBreakdown={Boolean(classPricing)}
                        usesSnapshot={false}
                        isManualOverride={manualAllowanceGrossOverride !== null}
                        canEdit={canEditAllowance}
                        footnote={
                          canEditAllowance
                            ? null
                            : "Ước tính trước khấu trừ vận hành/thuế. Số chính thức chốt khi lưu buổi theo điểm danh."
                        }
                        editLocked={isTrialLesson}
                        editLockedReason={
                          isTrialLesson
                            ? "Buổi dạy thử không tính trợ cấp."
                            : null
                        }
                        onManualGrossChange={setManualAllowanceGrossOverride}
                        onClearManualOverride={() =>
                          setManualAllowanceGrossOverride(null)
                        }
                      />
                    ) : null}

                    {allowFinancialFields ? (
                      <label className="flex flex-col gap-1.5 text-sm font-medium text-text-primary">
                        <span>
                          Trạng thái thanh toán <RequiredMark />
                        </span>
                        <UpgradedSelect
                          name="add-session-payment-status"
                          value={teacherPaymentStatus}
                          onValueChange={setTeacherPaymentStatus}
                          options={PAYMENT_STATUS_OPTIONS}
                          buttonClassName="min-h-11 rounded-lg border border-border-default bg-bg-surface px-3 py-2 text-sm text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                        />
                      </label>
                    ) : null}
                  </div>

                  {noAttendance ? (
                    <div className="rounded-lg border border-border-default bg-bg-secondary/40 px-4 py-3 text-sm text-text-muted">
                      Lớp không cần điểm danh — hệ thống tự sinh Attendance present cho mọi học sinh đang học.
                    </div>
                  ) : (
                    <section className="space-y-3">
                      <div className="space-y-1">
                        <h3 className="text-sm font-semibold text-text-primary">
                          Nhận xét từng học sinh <RequiredMark />
                        </h3>
                      {canEditAttendanceTuition ? (
                        <div className="flex flex-wrap gap-2 rounded-lg border border-border-default bg-bg-secondary/40 p-3 text-xs">
                          <span className="text-text-muted">Học phí buổi:</span>
                          <span className="font-medium tabular-nums text-text-primary">
                            Mặc định {formatCurrency(attendanceDefaultTuitionTotal)}
                          </span>
                          <span className="text-text-muted">·</span>
                          <span className="font-semibold tabular-nums text-primary">
                            Đang áp dụng {formatCurrency(resolvedSessionTuitionTotal)}
                          </span>
                          {attendanceOverrideCount > 0 ? (
                            <>
                              <span className="text-text-muted">·</span>
                              <span>Điều chỉnh {attendanceOverrideCount} học sinh</span>
                            </>
                          ) : null}
                          {tuitionBlockPreviewNote ? (
                            <>
                              <span className="text-text-muted">·</span>
                              <span
                                className={cn(
                                  "tabular-nums",
                                  effectiveTuitionBlockCount == null
                                    ? "text-warning"
                                    : "text-text-secondary",
                                )}
                              >
                                {tuitionBlockPreviewNote}
                              </span>
                            </>
                          ) : null}
                        </div>
                      ) : null}
                    </div>

                    {students.length === 0 ? (
                      <p className="py-6 text-center text-sm text-text-muted">Lớp chưa có học sinh.</p>
                    ) : (
                      <>
                        <SessionAttendanceEditor
                          items={previewAttendanceItems}
                          namePrefix="add-att"
                          canEditTuition={canEditAttendanceTuition}
                          onStatusChange={handleAttendanceStatusChange}
                          onNotesChange={handleAttendanceNotesChange}
                          onTuitionChange={handleAttendanceTuitionChange}
                        />

                        <AttendanceInlineSummary
                          present={attendanceSummary.present}
                          excused={attendanceSummary.excused}
                          absent={attendanceSummary.absent}
                        />
                      </>
                    )}
                  </section>
                  )}

                  <label className="flex flex-col gap-1.5 text-sm font-medium text-text-primary">
                    <span>
                      Nội dung bài học <RequiredMark />
                    </span>
                    <RichTextEditor
                      value={lessonContent}
                      onChange={(value) => {
                        setLessonContent(value);
                        if (lessonContentError) setLessonContentError("");
                      }}
                      minHeight="min-h-[140px]"
                      placeholder={SESSION_LESSON_CONTENT_PLACEHOLDER}
                      ariaLabel="Nội dung bài học"
                    />
                    {lessonContentError ? (
                      <span className="text-xs font-medium text-error" role="alert">
                        {lessonContentError}
                      </span>
                    ) : null}
                  </label>

                  <label className="flex flex-col gap-1.5 text-sm font-medium text-text-primary">
                    <span>
                      Bài tập về nhà <RequiredMark />
                    </span>
                    <RichTextEditor
                      value={homework}
                      onChange={(value) => {
                        setHomework(value);
                        if (homeworkError) setHomeworkError("");
                      }}
                      minHeight="min-h-[120px]"
                      placeholder={SESSION_HOMEWORK_PLACEHOLDER}
                      ariaLabel="Bài tập về nhà"
                    />
                    {homeworkError ? (
                      <span className="text-xs font-medium text-error" role="alert">
                        {homeworkError}
                      </span>
                    ) : null}
                  </label>

                  <label className="flex flex-col gap-1.5 text-sm font-medium text-text-primary">
                    <span>
                      Tutorial các buổi học <RequiredMark />
                    </span>
                    <RichTextEditor
                      value={tutorial}
                      onChange={(value) => {
                        setTutorial(value);
                        if (tutorialError) setTutorialError("");
                      }}
                      minHeight="min-h-[120px]"
                      placeholder={SESSION_TUTORIAL_PLACEHOLDER}
                      ariaLabel="Tutorial các buổi học"
                    />
                    {tutorialError ? (
                      <span className="text-xs font-medium text-error" role="alert">
                        {tutorialError}
                      </span>
                    ) : null}
                  </label>

                  <div className="flex flex-col gap-1.5 text-sm font-medium text-text-primary">
                    <label htmlFor="add-session-recording-url" className="flex items-center gap-1.5">
                      <span>Link video YouTube (recording)</span>
                      <span className="text-xs font-normal text-text-muted">
                        (Không bắt buộc)
                      </span>
                    </label>
                    <input
                      id="add-session-recording-url"
                      type="url"
                      value={recordingUrl}
                      onChange={(e) => {
                        setRecordingUrl(e.target.value);
                        if (recordingUrlError) setRecordingUrlError("");
                      }}
                      placeholder="https://youtube.com/watch?v=..."
                      className={cn(
                        "min-h-11 rounded-lg border bg-bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus",
                        recordingUrlError
                          ? "border-error focus-visible:ring-error"
                          : "border-border-default focus-visible:ring-border-focus",
                      )}
                    />
                    {recordingUrlError ? (
                      <span className="text-xs font-medium text-error" role="alert">
                        {recordingUrlError}
                      </span>
                    ) : null}
                    {recordingUrl && (
                      <div className="mt-2">
                        <YouTubeEmbed
                          url={recordingUrl}
                          protected
                          className="w-full aspect-video rounded-xl shadow-md"
                        />
                      </div>
                    )}
                  </div>

                  <SessionCopyCommentButton text={zaloCommentText} />
        </SessionFormDialogBody>

        <SessionFormDialogFooter className="grid-cols-2">
                <button
                  type="button"
                  onClick={requestCloseCreateForm}
                  disabled={isSubmitting}
                  className="min-h-11 rounded-xl border border-border-default bg-bg-surface px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="min-h-11 rounded-xl border border-primary bg-primary px-4 py-2 text-sm font-medium text-text-inverse transition-colors hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? "Đang thêm..." : "Thêm buổi học"}
                </button>
        </SessionFormDialogFooter>
      </form>
    </SessionFormDialog>
    <SessionUnsavedChangesDialog
      open={unsavedConfirmOpen}
      onStay={() => setUnsavedConfirmOpen(false)}
      onDiscard={forceCloseCreateForm}
    />
    </>
  );
}
