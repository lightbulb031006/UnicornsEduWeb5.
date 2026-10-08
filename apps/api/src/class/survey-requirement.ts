import { VIETNAM_TIME_ZONE } from 'src/fixed-salary-settings/current-month.util';

/**
 * Hôm nay theo giờ Việt Nam, dạng ngày UTC 00:00 để so trực tiếp với cột `@db.Date`.
 * "Đầu ngày" của khung chặn khảo sát tính theo giờ Việt Nam, không theo UTC.
 */
export function getVietnamToday(now = new Date()): Date {
  const isoDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: VIETNAM_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

/**
 * Select buổi học đầu tiên của lớp, gắn vào `class.findMany({ select })`.
 * Mảng rỗng = lớp chưa có buổi nào.
 */
export const FIRST_SESSION_SELECT = {
  orderBy: { date: 'asc' },
  take: 1,
  select: { date: true },
} as const;

export type SurveyRequirementSubject = {
  /** `sessions` lấy theo `FIRST_SESSION_SELECT`. */
  sessions: ReadonlyArray<{ date: Date }>;
  /** Thời điểm gia sư vào lớp (`class_teachers.created_at`); bỏ qua khi xét theo lớp. */
  teacherJoinedAt?: Date | null;
};

/**
 * Lớp (hoặc gia sư của lớp) có phải báo cáo bài khảo sát tạo lúc `surveyCreatedAt`.
 * So theo ngày giờ Việt Nam: miễn khi buổi đầu tiên của lớp, hoặc ngày gia sư vào
 * lớp, muộn hơn ngày tạo bài. Lớp chưa có buổi nào cũng miễn.
 */
export function isSurveyRequiredFor(
  surveyCreatedAt: Date,
  subject: SurveyRequirementSubject,
): boolean {
  const createdDate = getVietnamToday(surveyCreatedAt).getTime();
  const firstSessionDate = subject.sessions[0]?.date;
  if (!firstSessionDate || firstSessionDate.getTime() > createdDate) {
    return false;
  }
  if (
    subject.teacherJoinedAt &&
    getVietnamToday(subject.teacherJoinedAt).getTime() > createdDate
  ) {
    return false;
  }
  return true;
}

/**
 * Prisma `where` (Class) cho điều kiện theo lớp của `isSurveyRequiredFor`: lớp có
 * buổi học không muộn hơn ngày tạo bài.
 */
export function classRequiredForSurveyWhere(surveyCreatedAt: Date) {
  return {
    sessions: { some: { date: { lte: getVietnamToday(surveyCreatedAt) } } },
  };
}
