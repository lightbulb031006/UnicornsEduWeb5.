import { BadRequestException } from '@nestjs/common';
import {
  AttendanceStatus,
  HomeworkQuality,
  SessionProgressStatus,
} from '../../generated/enums';
import { lmsProfileConfig } from '../lms-profile/lms-profile';
import { LmsProfileService } from '../lms-profile/lms-profile.service';
import { SessionValidationService } from './session-validation.service';

describe('SessionValidationService', () => {
  let service: SessionValidationService;

  beforeEach(() => {
    service = new SessionValidationService();
  });

  it('accepts rich text longer than 500 HTML characters with short plain text', () => {
    expect(() =>
      service.validateAttendanceItems(
        [
          {
            studentId: 'student-1',
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
        service.validateAttendanceItems(
          [
            {
              studentId: 'student-1',
              status,
              notes: '<p>' + 'x'.repeat(501) + '</p>',
            },
          ],
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

  it('rejects excused attendance without a reason', () => {
    expect(() =>
      service.validateAttendanceItems(
        [
          {
            studentId: 'student-1',
            status: AttendanceStatus.excused,
            notes: '   ',
          },
        ],
        { required: true },
      ),
    ).toThrow(
      new BadRequestException(
        'Học sinh nghỉ phép phải có lý do nghỉ (attendance.notes).',
      ),
    );
  });

  it('accepts excused attendance with a reason', () => {
    expect(() =>
      service.validateAttendanceItems(
        [
          {
            studentId: 'student-1',
            status: AttendanceStatus.excused,
            notes: 'Ốm',
          },
        ],
        { required: true },
      ),
    ).not.toThrow();
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

  it('treats custom per-session 0 as free (does not fall back to class tuition)', () => {
    expect(
      service.resolveDefaultStudentTuitionPerSession({
        customTuitionPerSession: 0,
        classTuitionPerSession: 180000,
        classTuitionPackageTotal: null,
        classTuitionPackageSession: null,
      }),
    ).toBe(0);
  });

  it('treats null custom per-session as inherit (falls back to class tuition)', () => {
    expect(
      service.resolveDefaultStudentTuitionPerSession({
        customTuitionPerSession: null,
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

  describe('resolveSessionReviewFields', () => {
    const base = {
      progressStatus: SessionProgressStatus.completed,
      nextSessionPlan: '  Ôn tập vòng lặp ',
    };

    it('requires progress status', () => {
      expect(() =>
        service.resolveSessionReviewFields({ nextSessionPlan: 'x' }),
      ).toThrow(new BadRequestException('Tiến độ buổi là bắt buộc.'));
    });

    it('clears done/remaining and unticked test/retest fields', () => {
      const result = service.resolveSessionReviewFields({
        ...base,
        progressDone: 'a',
        progressRemaining: 'b',
        hasInClassTest: false,
        inClassTestContent: 'stale',
        inClassTestTotal: 10,
        hasRetest: false,
        retestContent: 'stale',
      });
      expect(result).toMatchObject({
        progressDone: null,
        progressRemaining: null,
        inClassTestContent: null,
        inClassTestTotal: null,
        retestContent: null,
        nextSessionPlan: 'Ôn tập vòng lặp',
        homeworkDueAt: null,
      });
    });

    it('requires both done and remaining for partial progress', () => {
      expect(() =>
        service.resolveSessionReviewFields({
          ...base,
          progressStatus: SessionProgressStatus.partial,
          progressRemaining: 'Bài 3 – hết giờ',
        }),
      ).toThrow(new BadRequestException('Tiến độ «Đã xong» là bắt buộc.'));
    });

    it('allows not_completed without done but requires remaining', () => {
      expect(() =>
        service.resolveSessionReviewFields({
          ...base,
          progressStatus: SessionProgressStatus.not_completed,
        }),
      ).toThrow(new BadRequestException('Tiến độ «Chưa xong» là bắt buộc.'));
    });

    it('requires test content and total ≥ 1 when ticked', () => {
      expect(() =>
        service.resolveSessionReviewFields({
          ...base,
          hasInClassTest: true,
          inClassTestContent: 'Từ vựng N5',
          inClassTestTotal: 0,
        }),
      ).toThrow(new BadRequestException('Tổng số câu kiểm tra phải ≥ 1.'));
    });

    it('requires next session plan and retest content when ticked', () => {
      expect(() =>
        service.resolveSessionReviewFields({
          progressStatus: SessionProgressStatus.completed,
        }),
      ).toThrow(new BadRequestException('Nội dung buổi sau là bắt buộc.'));
      expect(() =>
        service.resolveSessionReviewFields({ ...base, hasRetest: true }),
      ).toThrow(new BadRequestException('Nội dung kiểm tra lại là bắt buộc.'));
    });
  });

  describe('resolveAttendanceReview', () => {
    const noTest = { hasInClassTest: false, inClassTestTotal: null };
    const filled = {
      strengths: 'Tập trung',
      improvements: 'Chữ viết',
      homeworkQuality: HomeworkQuality.passed,
      homeworkComment: 'Làm đủ',
    };

    it('ignores and clears review for excused/absent', () => {
      expect(
        service.resolveAttendanceReview(
          { status: AttendanceStatus.absent, strengths: 'x' },
          noTest,
        ),
      ).toEqual({
        testCorrectCount: null,
        testComment: null,
        strengths: null,
        improvements: null,
        homeworkQuality: null,
        homeworkComment: null,
      });
    });

    it('requires homework quality for present, with student name', () => {
      expect(() =>
        service.resolveAttendanceReview(
          {
            status: AttendanceStatus.present,
            studentFullName: 'Nguyễn Văn A',
            ...filled,
            homeworkQuality: null,
          },
          noTest,
        ),
      ).toThrow(
        new BadRequestException(
          'Chất lượng BTVN của học sinh Nguyễn Văn A là bắt buộc.',
        ),
      );
    });

    it('drops homework fields for trial students', () => {
      const result = service.resolveAttendanceReview(
        { status: AttendanceStatus.trial, ...filled },
        noTest,
      );
      expect(result.homeworkQuality).toBeNull();
      expect(result.homeworkComment).toBeNull();
      expect(result.strengths).toBe('Tập trung');
    });

    it('bounds correct count by test total', () => {
      expect(() =>
        service.resolveAttendanceReview(
          {
            status: AttendanceStatus.present,
            ...filled,
            testCorrectCount: 11,
            testComment: 'ok',
          },
          { hasInClassTest: true, inClassTestTotal: 10 },
        ),
      ).toThrow(new BadRequestException('Số câu đúng phải trong khoảng 0–10.'));
    });
  });

  describe('skipRequired (admin/trợ lí/kế toán sửa buổi)', () => {
    const skip = { skipRequired: true };

    it('saves an empty session review as nulls', () => {
      expect(
        service.resolveSessionReviewFields({ hasRetest: true }, skip),
      ).toMatchObject({
        progressStatus: null,
        progressDone: null,
        progressRemaining: null,
        nextSessionPlan: null,
        hasRetest: true,
        retestContent: null,
      });
    });

    it('still rejects an invalid test total or homework due date', () => {
      expect(() =>
        service.resolveSessionReviewFields(
          { hasInClassTest: true, inClassTestTotal: 0 },
          skip,
        ),
      ).toThrow(new BadRequestException('Tổng số câu kiểm tra phải ≥ 1.'));
      expect(() =>
        service.resolveSessionReviewFields(
          { homeworkDueAt: 'not-a-date' },
          skip,
        ),
      ).toThrow(new BadRequestException('Hạn BTVN không hợp lệ.'));
    });

    it('saves an empty student review as nulls', () => {
      expect(
        service.resolveAttendanceReview(
          { status: AttendanceStatus.present },
          { hasInClassTest: true, inClassTestTotal: 10 },
          skip,
        ),
      ).toEqual({
        testCorrectCount: null,
        testComment: null,
        strengths: null,
        improvements: null,
        homeworkQuality: null,
        homeworkComment: null,
      });
    });

    it('still rejects a correct count above the test total', () => {
      expect(() =>
        service.resolveAttendanceReview(
          { status: AttendanceStatus.present, testCorrectCount: 11 },
          { hasInClassTest: true, inClassTestTotal: 10 },
          skip,
        ),
      ).toThrow(BadRequestException);
    });

    it('allows an excused student without a reason', () => {
      expect(() =>
        service.validateAttendanceItems(
          [{ studentId: 's1', status: AttendanceStatus.excused }],
          { required: false, ...skip },
        ),
      ).not.toThrow();
      expect(() =>
        service.validateAttendanceItems(
          [{ studentId: 's1', status: AttendanceStatus.excused }],
          { required: false },
        ),
      ).toThrow(BadRequestException);
    });
  });

  describe('instance IT (không có Kiểm tra trong buổi)', () => {
    const itService = () =>
      new SessionValidationService({
        config: lmsProfileConfig('it'),
      } as LmsProfileService);

    it('drops in-class test fields even when ticked', () => {
      const result = itService().resolveSessionReviewFields({
        progressStatus: SessionProgressStatus.completed,
        nextSessionPlan: 'Ôn tập',
        hasInClassTest: true,
        inClassTestContent: 'Đề 1',
        inClassTestTotal: 10,
      });
      expect(result).toMatchObject({
        hasInClassTest: false,
        inClassTestContent: null,
        inClassTestTotal: null,
      });
    });

    it('skips per-student test score on stored test sessions', () => {
      const result = itService().resolveAttendanceReview(
        {
          status: AttendanceStatus.present,
          strengths: 'Tốt',
          improvements: 'Chữ',
          homeworkQuality: HomeworkQuality.passed,
          homeworkComment: 'Đủ',
        },
        { hasInClassTest: true, inClassTestTotal: 10 },
      );
      expect(result).toMatchObject({
        testCorrectCount: null,
        testComment: null,
      });
    });
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
