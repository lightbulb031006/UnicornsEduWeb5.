import { BadRequestException } from '@nestjs/common';
import { AttendanceStatus } from '../../generated/enums';
import { SessionValidationService } from './session-validation.service';

describe('SessionValidationService', () => {
  let service: SessionValidationService;

  beforeEach(() => {
    service = new SessionValidationService();
  });

  it('accepts rich text longer than 500 HTML characters with short plain text', () => {
    expect(() =>
      service.validateAttendanceNotes(
        [
          {
            status: AttendanceStatus.present,
            notes: '<p>' + '<strong>ok</strong>'.repeat(30) + '</p>',
          },
        ],
        { required: true },
      ),
    ).not.toThrow();
  });

  it.each([AttendanceStatus.present, AttendanceStatus.absent])(
    'rejects notes above 500 plain-text characters for %s',
    (status) => {
      expect(() =>
        service.validateAttendanceNotes(
          [{ status, notes: '<p>' + 'x'.repeat(501) + '</p>' }],
          { required: true },
        ),
      ).toThrow('Ghi chú điểm danh tối đa 500 ký tự.');
    },
  );

  it('requires attendance when the caller marks it as required', () => {
    expect(() =>
      service.validateAttendanceItems(undefined, { required: true }),
    ).toThrow(new BadRequestException('attendance là bắt buộc.'));
  });

  it('rejects duplicate student ids inside attendance payload', () => {
    expect(() =>
      service.validateAttendanceItems(
        [
          { studentId: 'student-1', status: AttendanceStatus.present },
          { studentId: 'student-1', status: AttendanceStatus.absent },
        ],
        { required: true },
      ),
    ).toThrow(new BadRequestException('attendance chứa studentId trùng lặp.'));
  });

  it('rejects negative tuition fee overrides', () => {
    expect(() =>
      service.validateAttendanceItems(
        [
          {
            studentId: 'student-1',
            status: AttendanceStatus.present,
            tuitionFee: -1,
          },
        ],
        { required: true },
      ),
    ).toThrow(new BadRequestException('attendance.tuitionFee không hợp lệ.'));
  });

  it('uses default tuition when present attendance has no override', () => {
    expect(
      service.resolveChargeableAttendanceTuitionFee(
        AttendanceStatus.present,
        undefined,
        180000,
      ),
    ).toBe(180000);
  });

  it('uses default tuition when excused attendance has no override', () => {
    expect(
      service.resolveChargeableAttendanceTuitionFee(
        AttendanceStatus.excused,
        undefined,
        180000,
      ),
    ).toBe(180000);
  });

  it('derives default tuition from class package when class per-session fee is unset', () => {
    expect(
      service.resolveDefaultStudentTuitionPerSession({
        customTuitionPerSession: null,
        classTuitionPerSession: null,
        classTuitionPackageTotal: 3600000,
        classTuitionPackageSession: 12,
      }),
    ).toBe(300000);
  });

  it('derives default tuition from custom package before class per-session', () => {
    expect(
      service.resolveDefaultStudentTuitionPerSession({
        customTuitionPerSession: null,
        customTuitionPackageTotal: 525000,
        customTuitionPackageSession: 4,
        classTuitionPerSession: 124750,
        classTuitionPackageTotal: 499000,
        classTuitionPackageSession: 4,
      }),
    ).toBe(131250);
  });

  it('treats custom per-session 0 as inherit (falls back to class tuition)', () => {
    expect(
      service.resolveDefaultStudentTuitionPerSession({
        customTuitionPerSession: 0,
        classTuitionPerSession: 180000,
        classTuitionPackageTotal: null,
        classTuitionPackageSession: null,
      }),
    ).toBe(180000);
  });

  it('charges retail default tuition as per-block × session blocks', () => {
    expect(
      service.resolveDefaultStudentTuitionPerSession({
        pricingMode: 'per_block',
        customTuitionPerSession: null,
        customTuitionPerBlock: null,
        classTuitionPerSession: 180000,
        classTuitionPerBlock: 60000,
        classTuitionPackageTotal: null,
        classTuitionPackageSession: null,
        blockCount: 4,
      }),
    ).toBe(240000);
  });

  it('keeps per-session retail charge when mode is theo buổi even if block columns exist', () => {
    expect(
      service.resolveDefaultStudentTuitionPerSession({
        pricingMode: 'per_session',
        customTuitionPerSession: null,
        customTuitionPerBlock: 70000,
        classTuitionPerSession: 180000,
        classTuitionPerBlock: 60000,
        classTuitionPackageTotal: null,
        classTuitionPackageSession: null,
        blockCount: 4,
      }),
    ).toBe(180000);
  });

  it('keeps package default tuition per-session when session has more blocks', () => {
    expect(
      service.resolveDefaultStudentTuitionPerSession({
        customTuitionPerSession: null,
        classTuitionPerSession: null,
        classTuitionPerBlock: 60000,
        classTuitionPackageTotal: 3600000,
        classTuitionPackageSession: 12,
        blockCount: 4,
      }),
    ).toBe(300000);
  });

  it('keeps an existing attendance tuition override instead of the new default', () => {
    expect(
      service.resolveChargeableAttendanceTuitionFee(
        AttendanceStatus.present,
        175000,
        240000,
      ),
    ).toBe(175000);
  });

  it('drops tuition when attendance is absent', () => {
    expect(
      service.resolveChargeableAttendanceTuitionFee(
        AttendanceStatus.absent,
        180000,
        180000,
      ),
    ).toBeNull();
  });

  it('isTuitionChargeableStatus returns true for present and excused', () => {
    expect(service.isTuitionChargeableStatus(AttendanceStatus.present)).toBe(
      true,
    );
    expect(service.isTuitionChargeableStatus(AttendanceStatus.excused)).toBe(
      true,
    );
    expect(service.isTuitionChargeableStatus(AttendanceStatus.absent)).toBe(
      false,
    );
  });

  it('clamps coefficient into supported range', () => {
    expect(service.normalizeCoefficient(undefined)).toBeUndefined();
    expect(service.normalizeCoefficient(-1)).toBe(0);
    expect(service.normalizeCoefficient(0)).toBe(0);
    expect(service.normalizeCoefficient(12)).toBe(1);
  });

  it('rejects invalid session date strings', () => {
    expect(() => service.parseSessionDate('2026-13-40')).toThrow(
      new BadRequestException('date không hợp lệ.'),
    );
  });

  it('parses valid date-only input as UTC midnight', () => {
    const parsed = service.parseSessionDate('2026-05-01');
    expect(parsed.toISOString()).toBe('2026-05-01T00:00:00.000Z');
  });

  it('rejects datetime strings (session date must be YYYY-MM-DD)', () => {
    expect(() => service.parseSessionDate('2026-05-01T09:00:00.000Z')).toThrow(
      new BadRequestException('date không hợp lệ.'),
    );
  });

  it('requires notes for present and excused attendance', () => {
    expect(() =>
      service.validateAttendanceNotes(
        [
          { status: AttendanceStatus.present, notes: '  ' },
          { status: AttendanceStatus.absent, notes: null },
        ],
        { required: false },
      ),
    ).toThrow(
      new BadRequestException(
        'Nhận xét học sinh có mặt/nghỉ phép là bắt buộc.',
      ),
    );
  });

  it('accepts absent attendance without notes', () => {
    expect(() =>
      service.validateAttendanceNotes(
        [{ status: AttendanceStatus.absent, notes: null }],
        { required: true },
      ),
    ).not.toThrow();
  });

  it('includes student name in attendance notes validation error when provided', () => {
    expect(() =>
      service.validateAttendanceNotes(
        [
          {
            status: AttendanceStatus.excused,
            notes: '<p></p>',
            studentFullName: 'Nguyễn Văn A',
          },
        ],
        { required: false },
      ),
    ).toThrow(
      new BadRequestException('Nhận xét học sinh Nguyễn Văn A là bắt buộc.'),
    );
  });

  it('requires startTime and endTime', () => {
    expect(() =>
      service.assertRequiredSessionTimes(undefined, '20:00:00'),
    ).toThrow(new BadRequestException('Giờ bắt đầu là bắt buộc.'));
    expect(() => service.assertRequiredSessionTimes('19:00:00', '   ')).toThrow(
      new BadRequestException('Giờ kết thúc là bắt buộc.'),
    );
  });

  it('allows missing times when the class is not in block pricing mode', () => {
    expect(() =>
      service.assertRequiredSessionTimes(undefined, undefined, {
        required: false,
      }),
    ).not.toThrow();
  });

  it('rejects endTime that is not after startTime', () => {
    expect(() =>
      service.assertSessionEndAfterStart('19:00:00', '19:00:00'),
    ).toThrow(new BadRequestException('Giờ kết thúc phải sau giờ bắt đầu.'));
    expect(() =>
      service.assertSessionEndAfterStart('20:00:00', '19:00:00'),
    ).toThrow(new BadRequestException('Giờ kết thúc phải sau giờ bắt đầu.'));
  });

  it('allows endTime after startTime', () => {
    expect(() =>
      service.assertSessionEndAfterStart('19:00:00', '20:30:00'),
    ).not.toThrow();
  });

  it('rejects time changes when the session is paid or deposit', () => {
    const existingStart = new Date('1970-01-01T19:00:00.000Z');
    const existingEnd = new Date('1970-01-01T20:30:00.000Z');

    expect(() =>
      service.assertSessionTimesUnlockedForPayment({
        paymentStatus: 'paid',
        existingStartTime: existingStart,
        existingEndTime: existingEnd,
        nextStartTime: '18:00:00',
        nextEndTime: '19:30:00',
        payloadIncludesStart: true,
        payloadIncludesEnd: true,
      }),
    ).toThrow(
      new BadRequestException(
        'Không thể sửa giờ buổi đã thanh toán hoặc ghi cọc.',
      ),
    );

    expect(() =>
      service.assertSessionTimesUnlockedForPayment({
        paymentStatus: 'deposit',
        existingStartTime: existingStart,
        existingEndTime: existingEnd,
        nextStartTime: '18:00:00',
        nextEndTime: '19:30:00',
        payloadIncludesStart: true,
        payloadIncludesEnd: true,
      }),
    ).toThrow(
      new BadRequestException(
        'Không thể sửa giờ buổi đã thanh toán hoặc ghi cọc.',
      ),
    );
  });

  it('allows sending the same times on a paid session', () => {
    const existingStart = new Date('1970-01-01T19:00:00.000Z');
    const existingEnd = new Date('1970-01-01T20:30:00.000Z');

    expect(() =>
      service.assertSessionTimesUnlockedForPayment({
        paymentStatus: 'paid',
        existingStartTime: existingStart,
        existingEndTime: existingEnd,
        nextStartTime: '19:00:00',
        nextEndTime: '20:30:00',
        payloadIncludesStart: true,
        payloadIncludesEnd: true,
      }),
    ).not.toThrow();
  });
});
