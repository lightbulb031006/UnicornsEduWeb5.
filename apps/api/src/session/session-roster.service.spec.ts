jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class PrismaServiceMock {},
}));

import { BadRequestException } from '@nestjs/common';
import { SessionRosterService } from './session-roster.service';
import { SessionValidationService } from './session-validation.service';

describe('SessionRosterService', () => {
  const mockPrisma = {
    studentClass: {
      findMany: jest.fn(),
    },
  };

  let service: SessionRosterService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SessionRosterService(
      mockPrisma as never,
      new SessionValidationService(),
    );
  });

  it('block mode: class per-block beats class package; custom per-block still wins', async () => {
    mockPrisma.studentClass.findMany.mockResolvedValue([
      {
        studentId: 'student-1',
        customStudentTuitionPerSession: null,
        customTuitionPerBlock: null,
        customTuitionPackageTotal: null,
        customTuitionPackageSession: null,
        class: {
          studentTuitionPerSession: null,
          studentTuitionPerBlock: 60000,
          tuitionPackageTotal: 3600000,
          tuitionPackageSession: 12,
          pricingMode: 'per_block',
        },
      },
      {
        studentId: 'student-2',
        customStudentTuitionPerSession: 420000,
        customTuitionPerBlock: 140000,
        customTuitionPackageTotal: null,
        customTuitionPackageSession: null,
        class: {
          studentTuitionPerSession: 300000,
          studentTuitionPerBlock: 100000,
          tuitionPackageTotal: 3600000,
          tuitionPackageSession: 12,
          pricingMode: 'per_block',
        },
      },
    ]);

    const result = await service.assertAttendanceStudentsBelongToClass(
      'class-1',
      ['student-1', 'student-2'],
      { blockCount: 4 },
    );

    expect(result.get('student-1')).toBe(240000);
    expect(result.get('student-2')).toBe(560000);
  });

  it('per_session mode: giữ nguyên chuỗi resolve cũ, không đọc cột block', async () => {
    mockPrisma.studentClass.findMany.mockResolvedValue([
      {
        studentId: 'student-1',
        customStudentTuitionPerSession: null,
        customTuitionPerBlock: null,
        customTuitionPackageTotal: null,
        customTuitionPackageSession: null,
        class: {
          studentTuitionPerSession: null,
          studentTuitionPerBlock: 60000,
          tuitionPackageTotal: 3600000,
          tuitionPackageSession: 12,
          pricingMode: 'per_session',
        },
      },
      {
        studentId: 'student-2',
        customStudentTuitionPerSession: 420000,
        customTuitionPerBlock: 140000,
        customTuitionPackageTotal: null,
        customTuitionPackageSession: null,
        class: {
          studentTuitionPerSession: 300000,
          studentTuitionPerBlock: 100000,
          tuitionPackageTotal: 3600000,
          tuitionPackageSession: 12,
          pricingMode: 'per_session',
        },
      },
    ]);

    const result = await service.assertAttendanceStudentsBelongToClass(
      'class-1',
      ['student-1', 'student-2'],
      { blockCount: 4 },
    );

    expect(result.get('student-1')).toBe(300000);
    expect(result.get('student-2')).toBe(420000);
  });

  it('rejects student ids that do not belong to the class', async () => {
    mockPrisma.studentClass.findMany.mockResolvedValue([
      {
        studentId: 'student-1',
        customStudentTuitionPerSession: null,
        customTuitionPackageTotal: null,
        customTuitionPackageSession: null,
        class: {
          studentTuitionPerSession: null,
          tuitionPackageTotal: 3600000,
          tuitionPackageSession: 12,
        },
      },
    ]);

    await expect(
      service.assertAttendanceStudentsBelongToClass('class-1', [
        'student-1',
        'student-2',
      ]),
    ).rejects.toThrow(
      new BadRequestException(
        'attendance chỉ được phép chứa học sinh thuộc lớp học hiện tại.',
      ),
    );
  });
});
