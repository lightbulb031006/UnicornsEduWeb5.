import type {
  AttendanceReviewFields,
  HomeworkQuality,
  SessionAttendanceStatus,
  SessionProgressStatus,
  SessionReviewFields,
} from "@/dtos/session.dto";

/** State form phần chung của Nhận xét buổi học (mọi ô là chuỗi để bind input). */
export type SessionReviewFormValue = {
  progressStatus: SessionProgressStatus | "";
  progressDone: string;
  progressRemaining: string;
  hasInClassTest: boolean;
  inClassTestContent: string;
  inClassTestTotal: string;
  /** YYYY-MM-DD, giờ Việt Nam. */
  homeworkDueDate: string;
  /** HH:mm 24h, giờ Việt Nam. */
  homeworkDueTime: string;
  nextSessionPlan: string;
  hasRetest: boolean;
  retestContent: string;
};

/** State form phần từng học sinh. */
export type StudentReviewFormValue = {
  testCorrectCount: string;
  testComment: string;
  strengths: string;
  improvements: string;
  homeworkQuality: HomeworkQuality | "";
  homeworkComment: string;
  /** Lý do nghỉ phép (lưu vào `attendance.notes`), bắt buộc khi status = excused. */
  excusedReason: string;
};

const VN_UTC_OFFSET = "+07:00";
const VN_TIME_ZONE = "Asia/Ho_Chi_Minh";

export function emptySessionReviewForm(): SessionReviewFormValue {
  return {
    progressStatus: "",
    progressDone: "",
    progressRemaining: "",
    hasInClassTest: false,
    inClassTestContent: "",
    inClassTestTotal: "",
    homeworkDueDate: "",
    homeworkDueTime: "",
    nextSessionPlan: "",
    hasRetest: false,
    retestContent: "",
  };
}

export function emptyStudentReviewForm(): StudentReviewFormValue {
  return {
    testCorrectCount: "",
    testComment: "",
    strengths: "",
    improvements: "",
    homeworkQuality: "",
    homeworkComment: "",
    excusedReason: "",
  };
}

function splitVnDateTime(iso: string | null | undefined): {
  date: string;
  time: string;
} {
  if (!iso) return { date: "", time: "" };
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return { date: "", time: "" };
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: VN_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(value)
      .map((part) => [part.type, part.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

export function sessionReviewFormFromSession(
  session: SessionReviewFields | null | undefined,
): SessionReviewFormValue {
  // Không chặn theo `progressStatus`: admin/trợ lí/kế toán được lưu nhận xét thiếu
  // tiến độ, form phải seed lại các field khác để lần lưu sau không ghi đè thành null.
  if (!session) return emptySessionReviewForm();
  const due = splitVnDateTime(session.homeworkDueAt);
  return {
    progressStatus: session.progressStatus ?? "",
    progressDone: session.progressDone ?? "",
    progressRemaining: session.progressRemaining ?? "",
    hasInClassTest: session.hasInClassTest === true,
    inClassTestContent: session.inClassTestContent ?? "",
    inClassTestTotal:
      session.inClassTestTotal != null ? String(session.inClassTestTotal) : "",
    homeworkDueDate: due.date,
    homeworkDueTime: due.time,
    nextSessionPlan: session.nextSessionPlan ?? "",
    hasRetest: session.hasRetest === true,
    retestContent: session.retestContent ?? "",
  };
}

export function studentReviewFormFromAttendance(
  record:
    | (AttendanceReviewFields & {
        status?: SessionAttendanceStatus | null;
        notes?: string | null;
      })
    | null
    | undefined,
): StudentReviewFormValue {
  return {
    testCorrectCount:
      record?.testCorrectCount != null ? String(record.testCorrectCount) : "",
    testComment: record?.testComment ?? "",
    strengths: record?.strengths ?? "",
    improvements: record?.improvements ?? "",
    homeworkQuality: record?.homeworkQuality ?? "",
    homeworkComment: record?.homeworkComment ?? "",
    // `notes` của HS có mặt là nhận xét legacy, không phải lý do nghỉ.
    excusedReason: record?.status === "excused" ? (record.notes ?? "") : "",
  };
}

function parseOptionalInt(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function textOrNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/** Lỗi nhập liệu riêng của form (không có ở payload), ví dụ hạn BTVN thiếu ngày/giờ. */
export function findSessionReviewFormInputError(
  form: SessionReviewFormValue,
): string | null {
  const hasDate = Boolean(form.homeworkDueDate.trim());
  const hasTime = Boolean(form.homeworkDueTime.trim());
  if (hasDate !== hasTime) {
    return "Hạn BTVN cần nhập đủ cả ngày và giờ (hoặc để trống cả hai).";
  }
  return null;
}

export function toSessionReviewPayload(
  form: SessionReviewFormValue,
): SessionReviewFields {
  const isCompleted = form.progressStatus === "completed";
  const dueDate = form.homeworkDueDate.trim();
  const dueTime = form.homeworkDueTime.trim().slice(0, 5);
  return {
    progressStatus: form.progressStatus || null,
    progressDone: isCompleted ? null : textOrNull(form.progressDone),
    progressRemaining: isCompleted ? null : textOrNull(form.progressRemaining),
    hasInClassTest: form.hasInClassTest,
    inClassTestContent: form.hasInClassTest
      ? textOrNull(form.inClassTestContent)
      : null,
    inClassTestTotal: form.hasInClassTest
      ? parseOptionalInt(form.inClassTestTotal)
      : null,
    homeworkDueAt:
      dueDate && dueTime ? `${dueDate}T${dueTime}:00${VN_UTC_OFFSET}` : null,
    nextSessionPlan: textOrNull(form.nextSessionPlan),
    hasRetest: form.hasRetest,
    retestContent: form.hasRetest ? textOrNull(form.retestContent) : null,
  };
}

/** Payload phần từng HS; excused/absent gửi null hết, trial bỏ mục BTVN. */
export function toAttendanceReviewPayload(
  status: SessionAttendanceStatus,
  form: StudentReviewFormValue,
  hasInClassTest: boolean,
): AttendanceReviewFields {
  const reviewed = status === "present" || status === "trial";
  const withHomework = status === "present";
  return {
    testCorrectCount:
      reviewed && hasInClassTest
        ? parseOptionalInt(form.testCorrectCount)
        : null,
    testComment:
      reviewed && hasInClassTest ? textOrNull(form.testComment) : null,
    strengths: reviewed ? textOrNull(form.strengths) : null,
    improvements: reviewed ? textOrNull(form.improvements) : null,
    homeworkQuality:
      withHomework && form.homeworkQuality ? form.homeworkQuality : null,
    homeworkComment: withHomework ? textOrNull(form.homeworkComment) : null,
  };
}

/** `attendance.notes`: chỉ nghỉ phép mang lý do nghỉ, trạng thái khác gửi null. */
export function toAttendanceNotes(
  status: SessionAttendanceStatus,
  form: StudentReviewFormValue,
): string | null {
  return status === "excused" ? textOrNull(form.excusedReason) : null;
}

/** Chỉ lấy field review phần chung (dùng khi map payload sang API khác, vd staff-ops). */
export function pickSessionReviewFields(
  source: SessionReviewFields,
): SessionReviewFields {
  return {
    progressStatus: source.progressStatus,
    progressDone: source.progressDone,
    progressRemaining: source.progressRemaining,
    hasInClassTest: source.hasInClassTest,
    inClassTestContent: source.inClassTestContent,
    inClassTestTotal: source.inClassTestTotal,
    homeworkDueAt: source.homeworkDueAt,
    nextSessionPlan: source.nextSessionPlan,
    hasRetest: source.hasRetest,
    retestContent: source.retestContent,
  };
}

/** Chỉ lấy field review phần từng học sinh. */
export function pickAttendanceReviewFields(
  source: AttendanceReviewFields,
): AttendanceReviewFields {
  return {
    testCorrectCount: source.testCorrectCount,
    testComment: source.testComment,
    strengths: source.strengths,
    improvements: source.improvements,
    homeworkQuality: source.homeworkQuality,
    homeworkComment: source.homeworkComment,
  };
}
