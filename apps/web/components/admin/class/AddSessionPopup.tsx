"use client";

import { useMemo, useState, type SyntheticEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  SessionAttendanceItem,
  SessionAttendanceStatus,
  SessionCreatePayload,
  SessionItem,
} from "@/dtos/session.dto";
import { getFullProfile } from "@/lib/apis/auth.api";
import * as sessionApi from "@/lib/apis/session.api";
import { formatCurrency } from "@/lib/class.helpers";
import {
  computeSessionAllowanceRawBaseVnd,
  computeTeacherSessionAllowanceGrossPreviewVnd,
} from "@/lib/session-allowance.helpers";
import {
  buildSessionCommentZaloText,
  isRichTextNonEmpty,
  SESSION_HOMEWORK_PLACEHOLDER,
  SESSION_LESSON_CONTENT_PLACEHOLDER,
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
  TrialLessonToggle,
} from "@/components/admin/session/session-form-ui";
import { DateInput } from "@/components/ui/DateInput";
import RichTextEditor from "@/components/ui/RichTextEditor";
import { TimeInput } from "@/components/ui/TimeInput";
import UpgradedSelect from "@/components/ui/UpgradedSelect";
import { runBackgroundSave } from "@/lib/mutation-feedback";
import { normalizeOptionalRichTextContent } from "@/lib/sanitize";

export interface SessionStudentItem {
  id: string;
  fullName: string;
  tuitionFee?: number | null;
}

type AttendanceFormItem = {
  studentId: string;
  fullName: string;
  status: SessionAttendanceStatus;
  notes: string;
  tuitionFee: string;
  defaultTuitionFee: number | null;
};

type SessionTeacherItem = {
  id: string;
  fullName?: string | null;
};

type SessionTeacherMode = "select" | "readOnly";

/** Dữ liệu lớp để ước lượng trợ cấp (công thức đồng bộ docs income-summary). */
export type SessionClassPricingContext = {
  allowancePerSessionPerStudent: number;
  maxAllowancePerSession?: number | null;
  scaleAmount?: number | null;
  teacherCustomAllowanceByTeacherId?: Record<string, number | null | undefined>;
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
  allowAllowanceField?: boolean;
  allowAttendanceTuitionEdits?: boolean;
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

const MAX_ATTENDANCE_NOTES_LENGTH = 500;
function toAttendancePayload(
  items: AttendanceFormItem[],
  includeTuition: boolean,
): SessionAttendanceItem[] {
  return items.map((item) => ({
    studentId: item.studentId,
    status: item.status,
    notes: normalizeOptionalRichTextContent(item.notes),
    ...(includeTuition && item.tuitionFee.trim() !== ""
      ? { tuitionFee: Math.floor(Number(item.tuitionFee)) }
      : {}),
  }));
}

function normalizeMoneyValue(value: number | string | null | undefined): number | null {
  if (value == null) return null;
  const normalized = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(normalized)) return null;
  return Math.floor(normalized);
}

function isNonNegativeMoneyInput(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  const normalized = Number(trimmed);
  return Number.isFinite(normalized) && normalized >= 0;
}

function isChargeableAttendanceStatus(status: SessionAttendanceStatus): boolean {
  return status === "present" || status === "excused";
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

export default function AddSessionPopup({
  open,
  classId,
  className = "",
  defaultTeacherId,
  teachers = [],
  students,
  sessionTuitionTotal = 0,
  classPricing,
  teacherMode = "select",
  allowFinancialFields = true,
  allowAllowanceField,
  allowAttendanceTuitionEdits,
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
  const [startTime, setStartTime] = useState("18:00");
  const [endTime, setEndTime] = useState("20:00");
  const [lessonContent, setLessonContent] = useState("");
  const [homework, setHomework] = useState("");
  const [lessonContentError, setLessonContentError] = useState("");
  const [homeworkError, setHomeworkError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTrialLesson, setIsTrialLesson] = useState(false);
  const [teacherPaymentStatus, setTeacherPaymentStatus] = useState<string>("unpaid");
  const [selectedTeacherId, setSelectedTeacherId] = useState(
    resolveSelectedTeacherId({
      defaultTeacherId,
      teacherMode,
      teachers,
    }),
  );
  const [attendanceItems, setAttendanceItems] = useState<AttendanceFormItem[]>(() =>
    students.map((student) => ({
      studentId: student.id,
      fullName: student.fullName,
      status: "absent",
      notes: "",
      tuitionFee: "",
      defaultTuitionFee: normalizeMoneyValue(student.tuitionFee),
    })),
  );

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
  const resolvedSessionTuitionTotal = useMemo(() => {
    if (attendanceItems.length === 0) {
      return sessionTuitionTotal;
    }

    return attendanceItems.reduce((sum, item) => sum + resolveAttendanceTuitionValue(item), 0);
  }, [attendanceItems, sessionTuitionTotal]);
  const attendanceDefaultTuitionTotal = useMemo(
    () =>
      attendanceItems.reduce(
        (sum, item) =>
          sum +
          (isChargeableAttendanceStatus(item.status)
            ? (normalizeMoneyValue(item.defaultTuitionFee) ?? 0)
            : 0),
        0,
      ),
    [attendanceItems],
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
    if (!selectedTeacherId) return classPricing.allowancePerSessionPerStudent;
    const custom = classPricing.teacherCustomAllowanceByTeacherId?.[selectedTeacherId];
    if (custom != null && Number.isFinite(custom) && custom > 0) return custom;
    return classPricing.allowancePerSessionPerStudent;
  }, [classPricing, selectedTeacherId]);

  const chargeableAttendanceCount = useMemo(
    () =>
      attendanceItems.filter((item) => isChargeableAttendanceStatus(item.status))
        .length,
    [attendanceItems],
  );

  const allowanceRawBasePreview = useMemo(() => {
    if (!classPricing) return null;
    return computeSessionAllowanceRawBaseVnd({
      allowancePerStudent: resolvedTeacherAllowanceBase,
      chargeableStudentCount: chargeableAttendanceCount,
      scaleAmount: classPricing.scaleAmount,
    });
  }, [classPricing, resolvedTeacherAllowanceBase, chargeableAttendanceCount]);

  const coefficientForPreview = isTrialLesson ? 0 : 1;

  const expectedAllowanceGrossPreview = useMemo(() => {
    if (allowanceRawBasePreview == null || !classPricing) return null;
    return computeTeacherSessionAllowanceGrossPreviewVnd({
      rawBase: allowanceRawBasePreview,
      coefficient: coefficientForPreview,
      maxAllowancePerSession: classPricing.maxAllowancePerSession,
    });
  }, [
    allowanceRawBasePreview,
    classPricing,
    coefficientForPreview,
  ]);
  const finalAllowancePreview = expectedAllowanceGrossPreview;

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
        students: attendanceItems.map((item) => ({
          fullName: item.fullName,
          status: item.status,
          notes: item.notes,
        })),
      }),
    [attendanceItems, className, date, endTime, homework, lessonContent, startTime],
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

    const normalizedStartTime = normalizeTimeInput(startTime);
    const normalizedEndTime = normalizeTimeInput(endTime);

    if (!normalizedStartTime || !normalizedEndTime) {
      toast.error("Thời gian buổi học không hợp lệ.");
      return;
    }

    if (normalizedEndTime <= normalizedStartTime) {
      toast.error("Giờ kết thúc phải lớn hơn giờ bắt đầu.");
      return;
    }

    const trimmedLessonContent = lessonContent.trim();
    const trimmedHomework = homework.trim();

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

    const hasAttendanceNotesTooLong = attendanceItems.some(
      (item) => item.notes.trim().length > MAX_ATTENDANCE_NOTES_LENGTH,
    );

    if (hasAttendanceNotesTooLong) {
      toast.error(`Ghi chú điểm danh tối đa ${MAX_ATTENDANCE_NOTES_LENGTH} ký tự.`);
      return;
    }

    const hasInvalidAttendanceTuition =
      canEditAttendanceTuition &&
      attendanceItems.some((item) => !isNonNegativeMoneyInput(item.tuitionFee));

    if (hasInvalidAttendanceTuition) {
      toast.error("Học phí từng học sinh phải là số không âm.");
      return;
    }

    const coeffNum = isTrialLesson ? 0 : 1;

    const payload: SessionCreatePayload = {
      classId,
      teacherId: selectedTeacherId,
      date,
      startTime: normalizedStartTime,
      endTime: normalizedEndTime,
      lessonContent: trimmedLessonContent,
      homework: trimmedHomework,
      notes: zaloCommentText,
      coefficient: coeffNum,
      ...(allowFinancialFields ? { teacherPaymentStatus } : {}),
      attendance: toAttendancePayload(
        attendanceItems,
        canEditAttendanceTuition,
      ),
    };

    setIsSubmitting(true);
    runBackgroundSave({
      loadingMessage: "Đang thêm buổi học...",
      successMessage: "Đã thêm buổi học.",
      errorMessage: "Không thể thêm buổi học. Vui lòng thử lại.",
      action: () => createSessionFn(payload),
      onSuccess: async (createdSession) => {
        await queryClient.invalidateQueries({ queryKey: ["sessions", "class", classId] });
        onClose();
        onCreated?.(createdSession);
      },
      onError: () => {
        setIsSubmitting(false);
      },
    });
  };

  return (
    <SessionFormDialog open={open} onClose={onClose} titleId="add-session-title">
      <SessionFormDialogHeader
        title="Thêm buổi học"
        tuitionText={headerTuitionDisplay}
        allowanceText={headerAllowanceDisplay}
        onClose={onClose}
        titleId="add-session-title"
      />

      <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <SessionFormDialogBody>
                  <div className="space-y-5">
                    <label className="flex flex-col gap-1.5 text-sm font-medium text-text-primary">
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
                    </label>

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
                      <label className="flex flex-col gap-1.5 text-sm font-medium text-text-primary">
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
                      </label>
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
                      onChange={setIsTrialLesson}
                    />

                    {canEditAllowance && classPricing ? (
                      <SessionTeacherAllowanceEstimateCard
                        amount={finalAllowancePreview}
                        estimatedAmount={expectedAllowanceGrossPreview}
                        breakdownText={
                          allowanceRawBasePreview == null
                            ? null
                            : `${resolvedTeacherAllowanceBase.toLocaleString("vi-VN")}đ/hs × ${chargeableAttendanceCount} hs + ${(classPricing?.scaleAmount ?? 0).toLocaleString("vi-VN")}đ = ${allowanceRawBasePreview.toLocaleString("vi-VN")}đ`
                        }
                        showBreakdown={Boolean(classPricing)}
                        usesSnapshot={false}
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
                        </div>
                      ) : null}
                    </div>

                    {students.length === 0 ? (
                      <p className="py-6 text-center text-sm text-text-muted">Lớp chưa có học sinh.</p>
                    ) : (
                      <>
                        <SessionAttendanceEditor
                          items={attendanceItems}
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

                  <SessionCopyCommentButton text={zaloCommentText} />
        </SessionFormDialogBody>

        <SessionFormDialogFooter className="grid-cols-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="min-h-11 rounded-xl border border-border-default bg-bg-surface px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
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
  );
}
