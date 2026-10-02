import { ApiProperty } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsString } from 'class-validator';
import { ClassTimelineItemKind } from '../../generated/enums';

export class ReorderClassTimelineDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayUnique({ message: 'orderedIds must not contain duplicate ids' })
  @IsString({ each: true })
  orderedIds: string[];
}

/** Điểm danh rút gọn, chỉ trả cho staff để dựng nhận xét buổi học trên timeline. */
export interface ClassTimelineAttendanceDto {
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
    recordingUrl: string | null;
    teacherName: string | null;
    myAttendanceStatus: string | null;
    myAttendanceNotes: string | null;
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
