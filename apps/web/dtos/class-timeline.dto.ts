import type { HomeworkQuality, SessionProgressStatus } from "./session.dto";

export type ClassTimelineKind = "session" | "class_survey" | "content_item";

/** Phần từng học sinh của Nhận xét buổi học có cấu trúc. */
export interface ClassTimelineAttendanceReviewDto {
  testCorrectCount: number | null;
  testComment: string | null;
  strengths: string | null;
  improvements: string | null;
  homeworkQuality: HomeworkQuality | null;
  homeworkComment: string | null;
}

/** Điểm danh rút gọn, chỉ có ở payload staff. */
export interface ClassTimelineAttendanceDto extends ClassTimelineAttendanceReviewDto {
  studentId: string;
  status: string;
  notes: string | null;
  student: { fullName: string | null } | null;
}

export interface ClassTimelineItemDto {
  id: string;
  kind: ClassTimelineKind;
  sortOrder: number;
  title: string;
  kindLabel: string;
  occurredAt: string | null;
  sessionId: string | null;
  classSurveyId: string | null;
  classContentItemId: string | null;
  lessonId: string | null;
  lessonKind: "theory" | "practice" | null;
  isOpen: boolean | null;
  openAt: string | null;
  durationMinutes: number | null;
  hiddenAt: string | null;
  session: {
    id: string;
    date: string;
    startTime: string | null;
    endTime: string | null;
    lessonContent: string | null;
    homework: string | null;
    tutorial: string | null;
    /** Số thứ tự buổi trong lớp (suy ra, không lưu). */
    ordinal: number | null;
    /** Null = buổi legacy (nhận xét tự do trong notes). */
    progressStatus: SessionProgressStatus | null;
    progressDone: string | null;
    progressRemaining: string | null;
    hasInClassTest: boolean;
    inClassTestContent: string | null;
    inClassTestTotal: number | null;
    homeworkDueAt: string | null;
    nextSessionPlan: string | null;
    hasRetest: boolean;
    retestContent: string | null;
    /** Chỉ có ở payload staff; payload học sinh luôn null — dùng `hasRecording`. */
    recordingUrl: string | null;
    hasRecording: boolean;
    teacherName: string | null;
    myAttendanceStatus: string | null;
    myAttendanceNotes: string | null;
    /** Phần nhận xét riêng của học sinh đang xem. */
    myReview: ClassTimelineAttendanceReviewDto | null;
    /** Các field dưới đây chỉ có ở payload staff (dựng row 3 cột trên timeline). */
    notes?: string | null;
    teacherPaymentStatus?: string | null;
    coefficient?: number | null;
    trainingManagerAllowanceAmount?: number | null;
    className?: string | null;
    makeupOriginalDate?: string | null;
    teacher?: { fullName: string | null } | null;
    attendance?: ClassTimelineAttendanceDto[];
  } | null;
  survey: {
    id: string;
    reportDate: string;
    surveyName: string | null;
    startDate: string | null;
    endDate: string | null;
    notificationContent: string | null;
    notificationInstructions: string | null;
    notificationNotes: string | null;
    notificationTeacherNote: string | null;
    /** Các field dưới đây chỉ có ở payload staff. */
    testNumber?: number | null;
    knowledgeAssessment?: string | null;
    teacher?: { fullName: string | null } | null;
    studentCount?: number;
    /** Chỉ có ở payload student: nhận xét khảo sát dành riêng cho học sinh đang xem. */
    myAssessment?: string | null;
  } | null;
}

export interface ClassTimelinePageDto {
  items: ClassTimelineItemDto[];
  nextCursor: string | null;
}
