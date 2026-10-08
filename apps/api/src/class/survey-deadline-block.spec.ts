import { ClassStatus } from 'generated/enums';
import {
  findSurveysBlockingSessionCreation,
  findTeacherSurveyDeadlineBlocks,
  getVietnamToday,
  isSurveyDeadlineBlockActive,
} from './survey-deadline-block';

const utcDate = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe('survey deadline block', () => {
  describe('getVietnamToday', () => {
    it('rolls over at Vietnam midnight, not UTC midnight', () => {
      expect(getVietnamToday(new Date('2026-10-09T16:59:59.999Z'))).toEqual(
        utcDate('2026-10-09'),
      );
      expect(getVietnamToday(new Date('2026-10-09T17:00:00.000Z'))).toEqual(
        utcDate('2026-10-10'),
      );
    });
  });

  describe('isSurveyDeadlineBlockActive', () => {
    const endDate = utcDate('2026-10-11');

    it('starts at the beginning of the day before endDate', () => {
      expect(isSurveyDeadlineBlockActive(endDate, utcDate('2026-10-09'))).toBe(
        false,
      );
      expect(isSurveyDeadlineBlockActive(endDate, utcDate('2026-10-10'))).toBe(
        true,
      );
    });

    it('keeps blocking on and after endDate', () => {
      expect(isSurveyDeadlineBlockActive(endDate, utcDate('2026-10-11'))).toBe(
        true,
      );
      expect(isSurveyDeadlineBlockActive(endDate, utcDate('2026-11-30'))).toBe(
        true,
      );
    });

    it('never blocks a survey without endDate', () => {
      expect(isSurveyDeadlineBlockActive(null, utcDate('2026-10-10'))).toBe(
        false,
      );
    });

    it('blocks from 00:00 Vietnam time of the day before endDate', () => {
      const lastFreeMoment = getVietnamToday(
        new Date('2026-10-09T16:59:59.999Z'),
      );
      const firstBlockedMoment = getVietnamToday(
        new Date('2026-10-09T17:00:00.000Z'),
      );
      expect(isSurveyDeadlineBlockActive(endDate, lastFreeMoment)).toBe(false);
      expect(isSurveyDeadlineBlockActive(endDate, firstBlockedMoment)).toBe(
        true,
      );
    });
  });

  describe('findSurveysBlockingSessionCreation', () => {
    const prisma = {
      class: { findUnique: jest.fn() },
      survey: { findMany: jest.fn() },
    };

    beforeEach(() => jest.clearAllMocks());

    it('never blocks a class that is not running', async () => {
      prisma.class.findUnique.mockResolvedValue({ status: ClassStatus.ended });

      await expect(
        findSurveysBlockingSessionCreation(prisma as never, {
          classId: 'class-1',
          staffId: 'staff-1',
        }),
      ).resolves.toEqual([]);
      expect(prisma.survey.findMany).not.toHaveBeenCalled();
    });

    it('returns open, unreported, non-excluded surveys inside the block window', async () => {
      prisma.class.findUnique.mockResolvedValue({
        status: ClassStatus.running,
        sessions: [{ date: utcDate('2026-09-01') }],
        teachers: [{ createdAt: new Date('2026-09-01T03:00:00.000Z') }],
      });
      prisma.survey.findMany.mockResolvedValue([
        {
          id: 'survey-1',
          name: 'Khảo sát 10',
          endDate: utcDate('2026-10-11'),
          createdAt: new Date('2026-10-01T03:00:00.000Z'),
        },
        {
          id: 'survey-before-class',
          name: 'Tạo trước buổi đầu',
          endDate: utcDate('2026-10-11'),
          createdAt: new Date('2026-08-20T03:00:00.000Z'),
        },
      ]);

      const result = await findSurveysBlockingSessionCreation(
        prisma as never,
        { classId: 'class-1', staffId: 'staff-1' },
        new Date('2026-10-09T17:00:00.000Z'),
      );

      expect(result).toEqual([
        {
          surveyId: 'survey-1',
          name: 'Khảo sát 10',
          endDate: utcDate('2026-10-11'),
        },
      ]);
      expect(prisma.survey.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            name: { not: null },
            startDate: { lte: utcDate('2026-10-09') },
            endDate: { lte: utcDate('2026-10-11') },
            excludedClasses: { none: { classId: 'class-1' } },
            classSurveys: { none: { classId: 'class-1' } },
          },
        }),
      );
    });
  });

  describe('findTeacherSurveyDeadlineBlocks', () => {
    const prisma = {
      class: { findMany: jest.fn() },
      survey: { findMany: jest.fn() },
    };
    const now = new Date('2026-10-09T17:00:00.000Z');

    beforeEach(() => jest.clearAllMocks());

    it('returns nothing without querying surveys when the teacher has no running class', async () => {
      prisma.class.findMany.mockResolvedValue([]);

      await expect(
        findTeacherSurveyDeadlineBlocks(prisma as never, 'staff-1', now),
      ).resolves.toEqual([]);
      expect(prisma.survey.findMany).not.toHaveBeenCalled();
    });

    it('lists only running classes that are not excluded, reported or exempt, in the same window', async () => {
      const startedClass = {
        sessions: [{ date: utcDate('2026-09-01') }],
        teachers: [{ createdAt: new Date('2026-09-01T03:00:00.000Z') }],
      };
      prisma.class.findMany.mockResolvedValue([
        { id: 'class-a', name: 'Lớp A', ...startedClass },
        { id: 'class-b', name: 'Lớp B', ...startedClass },
        { id: 'class-c', name: 'Lớp C', ...startedClass },
        {
          id: 'class-d',
          name: 'Lớp D (gia sư mới vào)',
          sessions: [{ date: utcDate('2026-09-01') }],
          teachers: [{ createdAt: new Date('2026-10-05T03:00:00.000Z') }],
        },
      ]);
      prisma.survey.findMany.mockResolvedValue([
        {
          id: 'survey-1',
          name: 'Khảo sát 10',
          endDate: utcDate('2026-10-11'),
          createdAt: new Date('2026-10-01T03:00:00.000Z'),
          excludedClasses: [{ classId: 'class-b' }],
          classSurveys: [{ classId: 'class-c' }],
        },
        {
          id: 'survey-2',
          name: 'Đã nộp hết',
          endDate: utcDate('2026-10-10'),
          createdAt: new Date('2026-10-01T03:00:00.000Z'),
          excludedClasses: [],
          classSurveys: [
            { classId: 'class-a' },
            { classId: 'class-b' },
            { classId: 'class-c' },
            { classId: 'class-d' },
          ],
        },
      ]);

      const result = await findTeacherSurveyDeadlineBlocks(
        prisma as never,
        'staff-1',
        now,
      );

      expect(result).toEqual([
        {
          surveyId: 'survey-1',
          surveyName: 'Khảo sát 10',
          endDate: utcDate('2026-10-11'),
          classNames: ['Lớp A'],
        },
      ]);
      expect(prisma.class.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            status: ClassStatus.running,
            teachers: { some: { teacherId: 'staff-1' } },
          },
        }),
      );
      expect(prisma.survey.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            name: { not: null },
            startDate: { lte: utcDate('2026-10-09') },
            endDate: { lte: utcDate('2026-10-11') },
          },
        }),
      );
    });
  });
});
