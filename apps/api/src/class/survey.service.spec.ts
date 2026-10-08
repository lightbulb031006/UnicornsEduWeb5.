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

  describe('getTeacherWarnings', () => {
    afterEach(() => jest.useRealTimers());

    it('flags pending surveys inside the deadline block window as blocking', async () => {
      jest.useFakeTimers({
        now: new Date('2026-10-09T17:00:00.000Z'),
        doNotFake: ['nextTick', 'setImmediate'],
      });
      prisma.class.findMany.mockResolvedValue([
        {
          id: 'class-1',
          name: 'Lớp 1',
          sessions: [{ date: new Date('2026-09-01T00:00:00.000Z') }],
          teachers: [{ createdAt: new Date('2026-09-01T03:00:00.000Z') }],
        },
      ]);
      prisma.survey.findMany.mockResolvedValue([
        {
          id: 'survey-soon',
          createdAt: new Date('2026-10-01T03:00:00.000Z'),
          name: 'Hạn 11/10',
          startDate: new Date('2026-10-01T00:00:00.000Z'),
          endDate: new Date('2026-10-11T00:00:00.000Z'),
          excludedClasses: [],
        },
        {
          id: 'survey-later',
          createdAt: new Date('2026-10-01T03:00:00.000Z'),
          name: 'Hạn 12/10',
          startDate: new Date('2026-10-01T00:00:00.000Z'),
          endDate: new Date('2026-10-12T00:00:00.000Z'),
          excludedClasses: [],
        },
      ]);
      prisma.classSurvey.findMany.mockResolvedValue([]);

      const [warning] = await service.getTeacherWarnings('teacher-1');

      expect(
        warning.pendingSurveys.map(({ surveyId, blocking }) => ({
          surveyId,
          blocking,
        })),
      ).toEqual([
        { surveyId: 'survey-soon', blocking: true },
        { surveyId: 'survey-later', blocking: false },
      ]);
    });
  });

  describe('getTeacherWarnings exemptions', () => {
    it('skips classes that started, or that the teacher joined, after the survey was created', async () => {
      prisma.class.findMany.mockResolvedValue([
        {
          id: 'class-new',
          name: 'Lớp mới mở',
          sessions: [{ date: new Date('2026-10-03T00:00:00.000Z') }],
          teachers: [{ createdAt: new Date('2026-09-01T03:00:00.000Z') }],
        },
        {
          id: 'class-joined-late',
          name: 'Lớp nhận sau',
          sessions: [{ date: new Date('2026-09-01T00:00:00.000Z') }],
          teachers: [{ createdAt: new Date('2026-10-03T03:00:00.000Z') }],
        },
        {
          id: 'class-old',
          name: 'Lớp cũ',
          sessions: [{ date: new Date('2026-09-01T00:00:00.000Z') }],
          teachers: [{ createdAt: new Date('2026-09-01T03:00:00.000Z') }],
        },
      ]);
      prisma.survey.findMany.mockResolvedValue([
        {
          id: 'survey-1',
          name: 'Khảo sát tháng 10',
          startDate: new Date('2026-10-01T00:00:00.000Z'),
          endDate: new Date('2026-10-20T00:00:00.000Z'),
          createdAt: new Date('2026-10-01T03:00:00.000Z'),
          excludedClasses: [],
        },
      ]);
      prisma.classSurvey.findMany.mockResolvedValue([]);

      const warnings = await service.getTeacherWarnings('teacher-1');

      expect(warnings.map((warning) => warning.classId)).toEqual(['class-old']);
    });
  });

  describe('getMissingClasses', () => {
    it('returns missing running classes not in excluded list', async () => {
      prisma.survey.findUnique.mockResolvedValue({
        createdAt: new Date('2026-09-20T01:00:00.000Z'),
        excludedClasses: [{ classId: 'excluded-1' }],
      });
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
      expect(prisma.class.count).toHaveBeenCalledWith({
        where: {
          status: 'running',
          id: { notIn: ['excluded-1'] },
          surveys: { none: { surveyId: 'survey-1' } },
          sessions: {
            some: { date: { lte: new Date('2026-09-20T00:00:00.000Z') } },
          },
        },
      });
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
