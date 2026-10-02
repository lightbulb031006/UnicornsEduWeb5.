import { BadRequestException, Injectable } from '@nestjs/common';
import { AttendanceStatus } from '../../generated/enums';
import { CONTENT_LIMITS } from '../dtos/content-limits';
import {
  resolveEffectivePackageFields,
  resolveSessionChargeTuitionFee,
} from 'src/common/student-class-tuition.util';

@Injectable()
export class SessionValidationService {
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
        }>
      | undefined,
    options: { required: boolean },
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

  validateAttendanceNotes(
    attendance:
      | Array<{
          status?: AttendanceStatus;
          notes?: string | null;
          studentFullName?: string | null;
        }>
      | undefined,
    options: { required: boolean },
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

    for (const item of attendance) {
      const plainNotes = this.stripRichTextToPlainText(item?.notes);
      if (plainNotes.length > CONTENT_LIMITS.attendanceNotes) {
        throw new BadRequestException('Ghi chú điểm danh tối đa 500 ký tự.');
      }
      const status = item?.status;
      if (
        status !== AttendanceStatus.present &&
        status !== AttendanceStatus.excused
      ) {
        continue;
      }

      if (plainNotes) {
        continue;
      }

      const studentName = String(item?.studentFullName ?? '').trim();
      throw new BadRequestException(
        studentName
          ? `Nhận xét học sinh ${studentName} là bắt buộc.`
          : 'Nhận xét học sinh có mặt/nghỉ phép là bắt buộc.',
      );
    }
  }
}
