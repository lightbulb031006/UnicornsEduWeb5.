import { BadRequestException, Injectable } from '@nestjs/common';
import { StudentClassStatus } from 'generated/enums';
import { PrismaService } from '../prisma/prisma.service';
import { SessionValidationService } from './session-validation.service';

@Injectable()
export class SessionRosterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessionValidationService: SessionValidationService,
  ) {}

  async assertAttendanceStudentsBelongToClass(
    classId: string,
    studentIds: string[],
    options?: { blockCount?: number | null },
  ) {
    if (studentIds.length === 0) {
      return new Map<string, number | null>();
    }

    const uniqueStudentIds = Array.from(new Set(studentIds));
    const studentRows = await this.prisma.studentClass.findMany({
      where: {
        classId,
        status: StudentClassStatus.active,
        studentId: {
          in: uniqueStudentIds,
        },
      },
      select: {
        studentId: true,
        customStudentTuitionPerSession: true,
        customTuitionPerBlock: true,
        customTuitionPackageTotal: true,
        customTuitionPackageSession: true,
        class: {
          select: {
            studentTuitionPerSession: true,
            studentTuitionPerBlock: true,
            tuitionPackageTotal: true,
            tuitionPackageSession: true,
            pricingMode: true,
          },
        },
      },
    });

    if (studentRows.length !== uniqueStudentIds.length) {
      throw new BadRequestException(
        'attendance chỉ được phép chứa học sinh thuộc lớp học hiện tại.',
      );
    }

    return new Map(
      studentRows.map((studentRow) => [
        studentRow.studentId,
        this.sessionValidationService.resolveDefaultStudentTuitionPerSession({
          pricingMode: studentRow.class?.pricingMode,
          customTuitionPerSession: studentRow.customStudentTuitionPerSession,
          customTuitionPerBlock: studentRow.customTuitionPerBlock,
          customTuitionPackageTotal: studentRow.customTuitionPackageTotal,
          customTuitionPackageSession: studentRow.customTuitionPackageSession,
          classTuitionPerSession: studentRow.class?.studentTuitionPerSession,
          classTuitionPerBlock: studentRow.class?.studentTuitionPerBlock,
          classTuitionPackageTotal: studentRow.class?.tuitionPackageTotal,
          classTuitionPackageSession: studentRow.class?.tuitionPackageSession,
          blockCount: options?.blockCount,
        }),
      ]),
    );
  }
}
