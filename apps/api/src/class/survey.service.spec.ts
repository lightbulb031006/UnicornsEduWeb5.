import { SurveyService } from './survey.service';

describe('SurveyService', () => {
  const prisma = {
    survey: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    surveyExcludedClass: {
      findMany: jest.fn(),
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
    class: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
    classSurvey: {
      findMany: jest.fn(),
    },
    surveyWarningDismissal: {
      findMany: jest.fn(),
      upsert: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const actionHistoryService = {
    recordCreate: jest.fn(),
    recordUpdate: jest.fn(),
    recordDelete: jest.fn(),
  };
  const notificationService = {
    createNotificationDraft: jest.fn(),
    pushNotification: jest.fn(),
  };

  let service: SurveyService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SurveyService(
      prisma as never,
      actionHistoryService as never,
      notificationService as never,
    );
  });

  describe('getMissingClasses', () => {
    it('returns missing running classes not in excluded list', async () => {
      prisma.surveyExcludedClass.findMany.mockResolvedValue([
        { classId: 'excluded-1' },
      ]);
      prisma.class.count.mockResolvedValue(1);
      prisma.class.findMany.mockResolvedValue([
        {
          id: 'class-1',
          name: 'Lớp 1',
          teachers: [
            { teacher: { user: { first_name: 'Văn A', last_name: 'Nguyễn' } } },
          ],
        },
      ]);

      const result = await service.getMissingClasses('survey-1', {
        page: 1,
        limit: 20,
      });

      expect(result.meta).toEqual({ total: 1, page: 1, limit: 20 });
      expect(result.data).toEqual([
        {
          classId: 'class-1',
          name: 'Lớp 1',
          teachers: ['Nguyễn Văn A'],
        },
      ]);
    });
  });

  describe('getReportedClasses', () => {
    it('returns reported running classes with teacher and report details', async () => {
      prisma.surveyExcludedClass.findMany.mockResolvedValue([]);
      prisma.class.count.mockResolvedValue(1);
      prisma.class.findMany.mockResolvedValue([
        {
          id: 'class-1',
          name: 'Lớp 1',
          teachers: [
            { teacher: { user: { first_name: 'Văn A', last_name: 'Nguyễn' } } },
          ],
          surveys: [
            {
              reportDate: new Date('2026-08-20T00:00:00.000Z'),
              knowledgeAssessment: 'Lớp tiến bộ tốt',
              teacher: {
                user: { first_name: 'Văn A', last_name: 'Nguyễn' },
              },
            },
          ],
        },
      ]);

      const result = await service.getReportedClasses('survey-1', {
        page: 1,
        limit: 20,
      });

      expect(result.meta).toEqual({ total: 1, page: 1, limit: 20 });
      expect(result.data).toEqual([
        {
          classId: 'class-1',
          name: 'Lớp 1',
          teachers: ['Nguyễn Văn A'],
          reportDate: '2026-08-20',
          reportedByTeacherName: 'Nguyễn Văn A',
          knowledgeAssessment: 'Lớp tiến bộ tốt',
        },
      ]);
    });
  });
});
