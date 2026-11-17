import { BadRequestException, Injectable } from '@nestjs/common';
import {
  AttendanceStatus,
  HomeworkQuality,
  SessionProgressStatus,
} from '../../generated/enums';
import {
  resolveEffectivePackageFields,
  resolveSessionChargeTuitionFee,
} from 'src/common/student-class-tuition.util';
import { CONTENT_LIMITS } from '../dtos/content-limits';
import { LmsProfileService } from '../lms-profile/lms-profile.service';

const SESSION_REVIEW_FIELD_KEYS = [
  'progressStatus',
  'progressDone',
  'progressRemaining',
  'hasInClassTest',
  'inClassTestContent',
  'inClassTestTotal',
  'homeworkDueAt',
  'nextSessionPlan',
  'hasRetest',
  'retestContent',
] as const;

export interface SessionReviewInput {
  progressStatus?: SessionProgressStatus;
  progressDone?: string | null;
  progressRemaining?: string | null;
  hasInClassTest?: boolean;
  inClassTestContent?: string | null;
  inClassTestTotal?: number | null;
  homeworkDueAt?: string | null;
  nextSessionPlan?: string | null;
  hasRetest?: boolean;
  retestContent?: string | null;
}

/**
 * `skipRequired`: admin/trợ lí/kế toán sửa buổi qua `PUT /sessions/:id` được lưu khi
 * còn trống field bắt buộc của Nhận xét buổi học. Kiểm tra định dạng/khoảng giá trị vẫn chạy.
 */
export interface ReviewValidationOptions {
  skipRequired?: boolean;
}

export interface SessionReviewData {
  progressStatus: SessionProgressStatus | null;
  progressDone: string | null;
  progressRemaining: string | null;
  hasInClassTest: boolean;
  inClassTestContent: string | null;
  inClassTestTotal: number | null;
  homeworkDueAt: Date | null;
  nextSessionPlan: string | null;
  hasRetest: boolean;
  retestContent: string | null;
}

export interface AttendanceReviewInput {
  testCorrectCount?: number | null;
  testComment?: string | null;
  strengths?: string | null;
  improvements?: string | null;
  homeworkQuality?: HomeworkQuality | null;
  homeworkComment?: string | null;
}

export type AttendanceReviewData = {
  [K in keyof AttendanceReviewInput]-?: Exclude<
    AttendanceReviewInput[K],
    undefined
  >;
};

const ATTENDANCE_REVIEW_FIELD_KEYS = [
  'testCorrectCount',
  'testComment',
  'strengths',
  'improvements',
  'homeworkQuality',
  'homeworkComment',
] as const;

/** Lấy đúng các field review phần chung (bỏ key undefined) để chuyển tiếp payload. */
export function pickSessionReviewInput(
  data: SessionReviewInput,
): SessionReviewInput {
  return Object.fromEntries(
    SESSION_REVIEW_FIELD_KEYS.filter((key) => data[key] !== undefined).map(
      (key) => [key, data[key]],
    ),
  ) as SessionReviewInput;
}

/** Lấy đúng các field review từng học sinh (bỏ key undefined). */
export function pickAttendanceReviewInput(
  data: AttendanceReviewInput,
): AttendanceReviewInput {
  return Object.fromEntries(
    ATTENDANCE_REVIEW_FIELD_KEYS.filter((key) => data[key] !== undefined).map(
      (key) => [key, data[key]],
    ),
  ) as AttendanceReviewInput;
}

/**
 * Trợ cấp gia sư của buổi đã chi (thanh toán / ghi cọc): khoá giờ học, trợ
 * cấp, và việc role trưởng xoá buổi.
 */
export function isSessionPaymentLocked(paymentStatus?: string | null): boolean {
  const normalized = String(paymentStatus ?? '')
    .trim()
    .toLowerCase();
  return (
    normalized === 'paid' ||
    normalized === 'deposit' ||
    normalized === 'deposite' ||
    normalized === 'coc' ||
    normalized === 'cọc'
  );
}

@Injectable()
export class SessionValidationService {
  constructor(
    private readonly lmsProfile: LmsProfileService = new LmsProfileService(),
  ) {}

  parseSessionDate(date: string) {
    const normalized = String(date ?? '').trim();
    const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalized);
    if (!dateMatch) {
      throw new BadRequestException('date không hợp lệ.');
    }

    const year = Number.parseInt(dateMatch[1], 10);
    const monthIndex = Number.parseInt(dateMatch[2], 10) - 1;
    const day = Number.parseInt(dateMatch[3], 10);

    const parsedDate = new Date(Date.UTC(year, monthIndex, day));
    if (
      parsedDate.getUTCFullYear() !== year ||
      parsedDate.getUTCMonth() !== monthIndex ||
      parsedDate.getUTCDate() !== day
    ) {
      throw new BadRequestException('date không hợp lệ.');
    }

    return parsedDate;
  }

  assertRequiredSessionTimes(
    startTime?: string | null,
    endTime?: string | null,
    options?: { required?: boolean },
  ) {
    const start = typeof startTime === 'string' ? startTime.trim() : '';
    const end = typeof endTime === 'string' ? endTime.trim() : '';

    if (options?.required === false && !start && !end) {
      return;
    }

    if (!start) {
      throw new BadRequestException('Giờ bắt đầu là bắt buộc.');
    }
    if (!end) {
      throw new BadRequestException('Giờ kết thúc là bắt buộc.');
    }
  }

  formatSessionTimeHms(value: Date | string | null | undefined): string | null {
    if (value == null || value === '') {
      return null;
    }

    if (typeof value === 'string') {
      const match = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/.exec(
        value.trim(),
      );
      if (!match) {
        return null;
      }
      return `${match[1]}:${match[2]}:${match[3] ?? '00'}`;
    }

    const isoMatch = /T(\d{2}):(\d{2}):(\d{2})/.exec(value.toISOString());
    if (isoMatch) {
      return `${isoMatch[1]}:${isoMatch[2]}:${isoMatch[3]}`;
    }

    return `${String(value.getUTCHours()).padStart(2, '0')}:${String(
      value.getUTCMinutes(),
    ).padStart(2, '0')}:${String(value.getUTCSeconds()).padStart(2, '0')}`;
  }

  sessionTimeToSeconds(value: Date | string | null | undefined): number | null {
    const formatted = this.formatSessionTimeHms(value);
    if (!formatted) {
      return null;
    }

    const [hours, minutes, seconds] = formatted.split(':').map(Number);
    return hours * 3600 + minutes * 60 + seconds;
  }

  assertSessionEndAfterStart(startTime: Date | string, endTime: Date | string) {
    const startSeconds = this.sessionTimeToSeconds(startTime);
    const endSeconds = this.sessionTimeToSeconds(endTime);
    if (startSeconds == null || endSeconds == null) {
      throw new BadRequestException(
        'Giờ bắt đầu hoặc giờ kết thúc không hợp lệ.',
      );
    }
    if (endSeconds <= startSeconds) {
      throw new BadRequestException('Giờ kết thúc phải sau giờ bắt đầu.');
    }
  }

  isSessionTimeEditLocked(paymentStatus?: string | null): boolean {
    return isSessionPaymentLocked(paymentStatus);
  }

  assertSessionTimesUnlockedForPayment(options: {
    paymentStatus?: string | null;
    existingStartTime?: Date | string | null;
    existingEndTime?: Date | string | null;
    nextStartTime: Date | string;
    nextEndTime: Date | string;
    payloadIncludesStart: boolean;
    payloadIncludesEnd: boolean;
  }) {
    if (!this.isSessionTimeEditLocked(options.paymentStatus)) {
      return;
    }
    if (!options.payloadIncludesStart && !options.payloadIncludesEnd) {
      return;
    }

    const existingStart = this.formatSessionTimeHms(options.existingStartTime);
    const existingEnd = this.formatSessionTimeHms(options.existingEndTime);
    const nextStart = this.formatSessionTimeHms(options.nextStartTime);
    const nextEnd = this.formatSessionTimeHms(options.nextEndTime);

    if (existingStart !== nextStart || existingEnd !== nextEnd) {
      throw new BadRequestException(
        'Không thể sửa giờ buổi đã thanh toán hoặc ghi cọc.',
      );
    }
  }

  parseSessionTime(time: string, field: 'startTime' | 'endTime') {
    const timeMatch = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/.exec(time);

    if (!timeMatch) {
      throw new BadRequestException(`${field} không hợp lệ.`);
    }

    const hours = Number.parseInt(timeMatch[1], 10);
    const minutes = Number.parseInt(timeMatch[2], 10);
    const seconds =
      timeMatch[3] !== undefined ? Number.parseInt(timeMatch[3], 10) : 0;

    const normalizedTime = `${String(hours).padStart(2, '0')}:${String(
      minutes,
    ).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

    const parsedTime = new Date(`1970-01-01T${normalizedTime}`);
    if (Number.isNaN(parsedTime.getTime())) {
      throw new BadRequestException(`${field} không hợp lệ.`);
    }

    return parsedTime;
  }

  validateAttendanceItems(
    attendance:
      | Array<{
          studentId: string;
          status?: AttendanceStatus;
          tuitionFee?: number | null;
          notes?: string | null;
        }>
      | undefined,
    options: { required: boolean } & ReviewValidationOptions,
  ) {
    if (attendance === undefined) {
      if (options.required) {
        throw new BadRequestException('attendance là bắt buộc.');
      }
      return;
    }

    if (!Array.isArray(attendance)) {
      throw new BadRequestException('attendance phải là mảng hợp lệ.');
    }

    const studentIds = attendance.map((item) => item?.studentId);
    const hasInvalidStudentId = studentIds.some(
      (studentId) =>
        typeof studentId !== 'string' || studentId.trim().length === 0,
    );

    if (hasInvalidStudentId) {
      throw new BadRequestException('attendance.studentId không hợp lệ.');
    }

    const uniqueStudentIds = new Set(studentIds);
    if (uniqueStudentIds.size !== studentIds.length) {
      throw new BadRequestException('attendance chứa studentId trùng lặp.');
    }

    const hasInvalidTuitionFee = attendance.some((item) => {
      if (item?.tuitionFee === undefined || item?.tuitionFee === null) {
        return false;
      }

      const tuitionFee = Number(item.tuitionFee);
      return !Number.isFinite(tuitionFee) || tuitionFee < 0;
    });

    if (hasInvalidTuitionFee) {
      throw new BadRequestException('attendance.tuitionFee không hợp lệ.');
    }

    if (
      attendance.some(
        (item) =>
          this.stripRichTextToPlainText(item.notes).length >
          CONTENT_LIMITS.attendanceNotes,
      )
    ) {
      throw new BadRequestException('Ghi chú điểm danh tối đa 500 ký tự.');
    }

    // Nghỉ phép phải ghi lý do vào `notes`.
    const hasExcusedWithoutReason =
      !options.skipRequired &&
      attendance.some(
        (item) =>
          item?.status === AttendanceStatus.excused &&
          !this.stripRichTextToPlainText(item.notes),
      );
    if (hasExcusedWithoutReason) {
      throw new BadRequestException(
        'Học sinh nghỉ phép phải có lý do nghỉ (attendance.notes).',
      );
    }
  }

  normalizeAttendanceTuitionFee(
    value: number | string | null | undefined,
  ): number | null {
    if (value === undefined || value === null || value === '') {
      return null;
    }

    const normalizedValue = Number(value);
    if (!Number.isFinite(normalizedValue) || normalizedValue < 0) {
      throw new BadRequestException('attendance.tuitionFee không hợp lệ.');
    }

    return Math.floor(normalizedValue);
  }

  resolveDefaultStudentTuitionPerSession(options: {
    pricingMode?: string | null;
    customTuitionPerSession?: number | null;
    customTuitionPerBlock?: number | null;
    customTuitionPackageTotal?: number | null;
    customTuitionPackageSession?: number | null;
    classTuitionPerSession?: number | null;
    classTuitionPerBlock?: number | null;
    classTuitionPackageTotal?: number | null;
    classTuitionPackageSession?: number | null;
    blockCount?: number | null;
    oneTimeAlreadyCharged?: boolean;
  }): number | null {
    const {
      effectivePackageTotal,
      effectivePackageSession,
      hasCustomPackageOverride,
    } = resolveEffectivePackageFields({
      customTuitionPackageTotal: options.customTuitionPackageTotal,
      customTuitionPackageSession: options.customTuitionPackageSession,
      classTuitionPackageTotal: options.classTuitionPackageTotal,
      classTuitionPackageSession: options.classTuitionPackageSession,
    });

    return resolveSessionChargeTuitionFee({
      pricingMode: options.pricingMode,
      customTuitionPerSession: options.customTuitionPerSession,
      customTuitionPerBlock: options.customTuitionPerBlock,
      classTuitionPerSession: options.classTuitionPerSession,
      classTuitionPerBlock: options.classTuitionPerBlock,
      effectivePackageTotal,
      effectivePackageSession,
      hasCustomPackageOverride,
      blockCount: options.blockCount,
      oneTimeAlreadyCharged: options.oneTimeAlreadyCharged,
    });
  }

  resolveAttendanceTuitionFee(
    overrideValue: number | string | null | undefined,
    defaultValue: number | null | undefined,
  ): number | null {
    const normalizedOverride =
      this.normalizeAttendanceTuitionFee(overrideValue);
    if (normalizedOverride !== null) {
      return normalizedOverride;
    }

    return this.normalizeAttendanceTuitionFee(defaultValue);
  }

  isTuitionChargeableStatus(status: AttendanceStatus): boolean {
    return (
      status === AttendanceStatus.present || status === AttendanceStatus.excused
    );
  }

  resolveChargeableAttendanceTuitionFee(
    status: AttendanceStatus,
    overrideValue: number | string | null | undefined,
    defaultValue: number | null | undefined,
  ): number | null {
    if (!this.isTuitionChargeableStatus(status)) {
      return null;
    }

    return this.resolveAttendanceTuitionFee(overrideValue, defaultValue);
  }

  /** Lớp `one_time` đã thu gói ở buổi khác: buổi tính phí 0đ, vắng không có học phí. */
  resolveOneTimeAlreadyChargedTuitionFee(
    status: AttendanceStatus,
  ): number | null {
    return this.isTuitionChargeableStatus(status) ? 0 : null;
  }

  normalizeCoefficient(value: number | null | undefined) {
    if (value === undefined || value === null || !Number.isFinite(value)) {
      return undefined;
    }

    return Math.max(0, Math.min(1, Number(value)));
  }

  stripRichTextToPlainText(value: string | null | undefined): string {
    if (value == null) {
      return '';
    }

    return String(value)
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/\u00a0/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  assertRichTextNonEmpty(
    value: string | null | undefined,
    fieldLabel: string,
  ): string {
    const plainText = this.stripRichTextToPlainText(value);
    if (!plainText) {
      throw new BadRequestException(`${fieldLabel} là bắt buộc.`);
    }

    return plainText;
  }

  validateSessionCommentFields(
    data: {
      lessonContent?: string | null;
      homework?: string | null;
      tutorial?: string | null;
    },
    options: { required: boolean },
  ) {
    const hasLessonContent = data.lessonContent !== undefined;
    const hasHomework = data.homework !== undefined;
    const hasTutorial = data.tutorial !== undefined;

    if (
      !options.required &&
      !hasLessonContent &&
      !hasHomework &&
      !hasTutorial
    ) {
      return;
    }

    if (options.required || hasLessonContent || hasHomework || hasTutorial) {
      this.assertRichTextNonEmpty(data.lessonContent, 'Nội dung bài học');
      this.assertRichTextNonEmpty(data.homework, 'Bài tập về nhà');
      this.assertRichTextNonEmpty(data.tutorial, 'Tutorial các buổi học');
    }
  }

  /**
   * Validate + chuẩn hoá phần chung của Nhận xét buổi học có cấu trúc.
   * Trả về object ghi thẳng vào `sessions` (field không áp dụng bị xoá về null).
   */
  resolveSessionReviewFields(
    data: SessionReviewInput,
    options: ReviewValidationOptions = {},
  ): SessionReviewData {
    const requireFilled = !options.skipRequired;
    const progressStatus = data.progressStatus ?? null;
    if (!progressStatus && requireFilled) {
      throw new BadRequestException('Tiến độ buổi là bắt buộc.');
    }

    let progressDone = this.normalizeReviewText(data.progressDone);
    let progressRemaining = this.normalizeReviewText(data.progressRemaining);
    if (progressStatus === SessionProgressStatus.completed) {
      progressDone = null;
      progressRemaining = null;
    } else if (requireFilled) {
      if (progressStatus === SessionProgressStatus.partial && !progressDone) {
        throw new BadRequestException('Tiến độ «Đã xong» là bắt buộc.');
      }
      if (!progressRemaining) {
        throw new BadRequestException('Tiến độ «Chưa xong» là bắt buộc.');
      }
    }

    // Instance không có Kiểm tra trong buổi (IT): bỏ qua cờ client gửi.
    const hasInClassTest =
      this.lmsProfile.config.inClassTest && data.hasInClassTest === true;
    const inClassTestContent = hasInClassTest
      ? this.normalizeReviewText(data.inClassTestContent)
      : null;
    const inClassTestTotal = hasInClassTest
      ? (data.inClassTestTotal ?? null)
      : null;
    if (hasInClassTest) {
      if (!inClassTestContent && requireFilled) {
        throw new BadRequestException('Nội dung kiểm tra là bắt buộc.');
      }
      if (
        (inClassTestTotal === null && requireFilled) ||
        (inClassTestTotal !== null &&
          (!Number.isInteger(inClassTestTotal) || inClassTestTotal < 1))
      ) {
        throw new BadRequestException('Tổng số câu kiểm tra phải ≥ 1.');
      }
    }

    let homeworkDueAt: Date | null = null;
    if (data.homeworkDueAt) {
      homeworkDueAt = new Date(data.homeworkDueAt);
      if (Number.isNaN(homeworkDueAt.getTime())) {
        throw new BadRequestException('Hạn BTVN không hợp lệ.');
      }
    }

    const nextSessionPlan = this.normalizeReviewText(data.nextSessionPlan);
    if (!nextSessionPlan && requireFilled) {
      throw new BadRequestException('Nội dung buổi sau là bắt buộc.');
    }

    const hasRetest = data.hasRetest === true;
    const retestContent = hasRetest
      ? this.normalizeReviewText(data.retestContent)
      : null;
    if (hasRetest && !retestContent && requireFilled) {
      throw new BadRequestException('Nội dung kiểm tra lại là bắt buộc.');
    }

    return {
      progressStatus,
      progressDone,
      progressRemaining,
      hasInClassTest,
      inClassTestContent,
      inClassTestTotal,
      homeworkDueAt,
      nextSessionPlan,
      hasRetest,
      retestContent,
    };
  }

  hasAnySessionReviewField(data: SessionReviewInput): boolean {
    return SESSION_REVIEW_FIELD_KEYS.some((key) => data[key] !== undefined);
  }

  /**
   * Validate + chuẩn hoá phần từng học sinh. excused/absent xoá hết field;
   * trial bỏ mục BTVN; mục kiểm tra chỉ giữ khi buổi có kiểm tra.
   */
  resolveAttendanceReview(
    item: AttendanceReviewInput & {
      status: AttendanceStatus;
      studentFullName?: string | null;
    },
    test: { hasInClassTest: boolean; inClassTestTotal: number | null },
    options: ReviewValidationOptions = {},
  ): AttendanceReviewData {
    const empty: AttendanceReviewData = {
      testCorrectCount: null,
      testComment: null,
      strengths: null,
      improvements: null,
      homeworkQuality: null,
      homeworkComment: null,
    };
    if (
      item.status !== AttendanceStatus.present &&
      item.status !== AttendanceStatus.trial
    ) {
      return empty;
    }

    const studentName = String(item.studentFullName ?? '').trim();
    // skipRequired: field trống lưu null thay vì báo lỗi.
    const fail = (field: string): null => {
      if (options.skipRequired) return null;
      throw new BadRequestException(
        studentName
          ? `${field} của học sinh ${studentName} là bắt buộc.`
          : `${field} của học sinh có mặt/học thử là bắt buộc.`,
      );
    };

    const result: AttendanceReviewData = { ...empty };
    if (test.hasInClassTest && this.lmsProfile.config.inClassTest) {
      const total = test.inClassTestTotal ?? 0;
      // skipRequired + chưa nhập tổng câu: không có trần để so.
      const maxCorrect =
        test.inClassTestTotal === null && options.skipRequired
          ? Number.POSITIVE_INFINITY
          : total;
      const correct = item.testCorrectCount;
      if (correct === undefined || correct === null) {
        fail('Số câu đúng');
      } else if (
        !Number.isInteger(correct) ||
        correct < 0 ||
        correct > maxCorrect
      ) {
        throw new BadRequestException(
          `Số câu đúng${studentName ? ` của học sinh ${studentName}` : ''} phải trong khoảng 0–${total}.`,
        );
      }
      result.testCorrectCount = correct ?? null;
      result.testComment =
        this.normalizeReviewText(item.testComment) ?? fail('Nhận xét kiểm tra');
    }

    result.strengths =
      this.normalizeReviewText(item.strengths) ?? fail('Điểm tốt');
    result.improvements =
      this.normalizeReviewText(item.improvements) ?? fail('Cần cải thiện');

    if (item.status === AttendanceStatus.present) {
      result.homeworkQuality = item.homeworkQuality ?? fail('Chất lượng BTVN');
      result.homeworkComment =
        this.normalizeReviewText(item.homeworkComment) ?? fail('Nhận xét BTVN');
    }

    return result;
  }

  private normalizeReviewText(value: string | null | undefined): string | null {
    const normalized = String(value ?? '')
      .replace(/\r\n/g, '\n')
      .trim();
    return normalized ? normalized : null;
  }
}
