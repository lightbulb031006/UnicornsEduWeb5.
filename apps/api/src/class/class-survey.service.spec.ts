jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class PrismaServiceMock {},
}));

jest.mock('../staff-ops/staff-operations-access.service', () => ({
  StaffOperationsAccessService: class StaffOperationsAccessServiceMock {},
}));

jest.mock('../action-history/action-history.service', () => ({
  ActionHistoryService: class ActionHistoryServiceMock {},
}));

import { StaffRole, UserRole } from '../../generated/enums';
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
    resolveActor: jest.fn(),
    resolveClassViewerActor: jest.fn(),
    resolveClassViewAccessMode: jest.fn(),
    assertTeacherAssignedToClass: jest.fn(),
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

  it('keeps teacher staff scoped to their own survey responsibility', async () => {
    mockStaffOperationsAccess.resolveActor.mockResolvedValue({
      id: 'teacher-1',
      roles: [StaffRole.teacher],
    });

    await expect(
      service.createClassSurveyForStaff('user-1', UserRole.staff, 'class-1', {
        survey_id: 'survey-1',
        report_date: '2026-05-18',
        teacher_id: 'teacher-2',
        students: [{ student_id: 'student-1', comment: 'Ổn định' }],
      }),
    ).rejects.toThrow(
      'Teacher chỉ được tạo khảo sát với chính mình là người phụ trách.',
    );

    expect(mockTx.classSurvey.create).not.toHaveBeenCalled();
  });
});
