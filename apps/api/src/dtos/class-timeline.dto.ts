import { ClassTimelineItemKind } from '../../generated/enums';

/** Phần từng học sinh của Nhận xét buổi học có cấu trúc. */
export interface ClassTimelineAttendanceReviewDto {
  testCorrectCount: number | null;
  testComment: string | null;
  strengths: string | null;
  improvements: string | null;
  homeworkQuality: string | null;
  homeworkComment: string | null;
}

/** Điểm danh rút gọn, chỉ trả cho staff để dựng nhận xét buổi học trên timeline. */
export interface ClassTimelineAttendanceDto extends ClassTimelineAttendanceReviewDto {
  studentId: string;
  status: string;
  notes: string | null;
  student: { fullName: string | null } | null;
}

export interface ClassTimelineItemDto {
  id: string;
  kind: ClassTimelineItemKind;
  sortOrder: number;
  title: string;
  kindLabel: string;
  occurredAt: string | null;
  sessionId: string | null;
  classSurveyId: string | null;
  classContentItemId: string | null;
  lessonId: string | null;
  lessonKind: 'theory' | 'practice' | null;
  isOpen: boolean | null;
  openAt: string | null;
  durationMinutes: number | null;
  hiddenAt: string | null;
  session?: {
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
    progressStatus: string | null;
    progressDone: string | null;
    progressRemaining: string | null;
    hasInClassTest: boolean;
    inClassTestContent: string | null;
    inClassTestTotal: number | null;
    homeworkDueAt: string | null;
    nextSessionPlan: string | null;
    hasRetest: boolean;
    retestContent: string | null;
    /** Link YouTube gốc; null ở timeline học sinh (Video bảo vệ). */
    recordingUrl: string | null;
    /** Buổi có recording — học sinh xin link phát qua `…/sessions/:sessionId/playback`. */
    hasRecording: boolean;
    teacherName: string | null;
    myAttendanceStatus: string | null;
    myAttendanceNotes: string | null;
    /** Phần nhận xét riêng của học sinh đang xem (null với staff hoặc HS không có điểm danh). */
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
  survey?: {
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
