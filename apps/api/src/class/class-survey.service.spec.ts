jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class PrismaServiceMock {},
}));

jest.mock('../staff-ops/staff-operations-access.service', () => ({
  StaffOperationsAccessService: class StaffOperationsAccessServiceMock {},
}));

jest.mock('../action-history/action-history.service', () => ({
  ActionHistoryService: class ActionHistoryServiceMock {},
}));

import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '../../generated/enums';
import { ClassSurveyService } from './class-survey.service';

describe('ClassSurveyService', () => {
  const mockTx = {
    classSurvey: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };

  const mockPrisma = {
    class: {
      findUnique: jest.fn(),
    },
    classSurvey: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
    classTeacher: {
      findUnique: jest.fn(),
    },
    survey: {
      findUnique: jest.fn(),
    },
    studentClass: {
      findMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockStaffOperationsAccess = {
    resolveClassWorkAccess: jest.fn(),
  };

  const mockActionHistoryService = {
    recordCreate: jest.fn(),
    recordUpdate: jest.fn(),
    recordDelete: jest.fn(),
  };

  let service: ClassSurveyService;

  beforeEach(() => {
    jest.clearAllMocks();

    mockPrisma.class.findUnique.mockResolvedValue({ id: 'class-1' });
    mockPrisma.classTeacher.findUnique.mockResolvedValue({
      classId: 'class-1',
      teacherId: 'teacher-1',
    });
    mockPrisma.survey.findUnique.mockResolvedValue({ id: 'survey-1' });
    mockPrisma.classSurvey.findFirst.mockResolvedValue(null);
    mockPrisma.studentClass.findMany.mockResolvedValue([
      { studentId: 'student-1' },
    ]);
    mockPrisma.$transaction.mockImplementation(
      async (callback: (tx: typeof mockTx) => Promise<unknown>) =>
        callback(mockTx),
    );

    service = new ClassSurveyService(
      mockPrisma as never,
      mockStaffOperationsAccess as never,
      mockActionHistoryService as never,
    );
  });

  it('lists class surveys inside the selected calendar month', async () => {
    mockPrisma.classSurvey.findMany.mockResolvedValue([]);

    await service.getClassSurveys('class-1', { month: '05', year: '2026' });

    expect(mockPrisma.classSurvey.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          classId: 'class-1',
          reportDate: {
            gte: new Date(Date.UTC(2026, 4, 1)),
            lt: new Date(Date.UTC(2026, 5, 1)),
          },
        },
      }),
    );
  });

  it('rejects creating a survey for a teacher outside the class', async () => {
    mockPrisma.classTeacher.findUnique.mockResolvedValue(null);

    await expect(
      service.createClassSurvey('class-1', {
        survey_id: 'survey-1',
        report_date: '2026-05-18',
        teacher_id: 'teacher-99',
        students: [{ student_id: 'student-1', comment: 'Ổn định' }],
      }),
    ).rejects.toThrow('Người phụ trách phải là gia sư của lớp.');

    expect(mockTx.classSurvey.create).not.toHaveBeenCalled();
  });

  const surveyDto = (teacherId: string) => ({
    survey_id: 'survey-1',
    report_date: '2026-05-18',
    teacher_id: teacherId,
    students: [{ student_id: 'student-1', comment: 'Ổn định' }],
  });

  it('keeps teacher staff scoped to their own survey responsibility', async () => {
    mockStaffOperationsAccess.resolveClassWorkAccess.mockResolvedValue({
      staffId: 'teacher-1',
      isAdmin: false,
      isClassTeacher: true,
      isClassManager: false,
    });

    await expect(
      service.createClassSurveyForStaff(
        'user-1',
        UserRole.staff,
        'class-1',
        surveyDto('teacher-2'),
      ),
    ).rejects.toThrow(
      'Teacher chỉ được tạo khảo sát với chính mình là người phụ trách.',
    );

    expect(mockTx.classSurvey.create).not.toHaveBeenCalled();
  });

  it('#275: Quản lý lớp tạo khảo sát cho gia sư khác của lớp', async () => {
    mockStaffOperationsAccess.resolveClassWorkAccess.mockResolvedValue({
      staffId: 'manager-1',
      isAdmin: false,
      isClassTeacher: false,
      isClassManager: true,
    });
    const createSpy = jest
      .spyOn(service, 'createClassSurvey')
      .mockResolvedValue({ id: 'class-survey-1' } as never);

    await service.createClassSurveyForStaff(
      'user-1',
      UserRole.staff,
      'class-1',
      surveyDto('teacher-2'),
    );

    expect(createSpy).toHaveBeenCalledWith(
      'class-1',
      surveyDto('teacher-2'),
      undefined,
    );
  });

  it('#275: kiêm gia sư + Quản lý lớp không bị khoá về khảo sát của mình', async () => {
    mockStaffOperationsAccess.resolveClassWorkAccess.mockResolvedValue({
      staffId: 'teacher-1',
      isAdmin: false,
      isClassTeacher: true,
      isClassManager: true,
    });
    const createSpy = jest
      .spyOn(service, 'createClassSurvey')
      .mockResolvedValue({ id: 'class-survey-1' } as never);

    await service.createClassSurveyForStaff(
      'user-1',
      UserRole.staff,
      'class-1',
      surveyDto('teacher-2'),
    );

    expect(createSpy).toHaveBeenCalled();
  });

  it('#275: lớp không được giao → 403, không tạo khảo sát', async () => {
    mockStaffOperationsAccess.resolveClassWorkAccess.mockRejectedValue(
      new ForbiddenException(
        'Chỉ Admin, gia sư của lớp hoặc Quản lý lớp mới được thao tác trên lớp này.',
      ),
    );
    const createSpy = jest.spyOn(service, 'createClassSurvey');

    await expect(
      service.createClassSurveyForStaff(
        'user-1',
        UserRole.staff,
        'class-1',
        surveyDto('teacher-2'),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(createSpy).not.toHaveBeenCalled();
  });
});
