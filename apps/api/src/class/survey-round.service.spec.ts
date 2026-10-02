import { BadRequestException } from '@nestjs/common';
import { SurveyRoundService } from './survey-round.service';

describe('SurveyRoundService', () => {
  const prisma = {
    survey: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
    class: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const actionHistoryService = {
    recordUpdate: jest.fn(),
  };

  let service: SurveyRoundService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SurveyRoundService(
      prisma as never,
      actionHistoryService as never,
    );
  });

  describe('getCurrentRound', () => {
    it('returns the persisted round when the singleton exists', async () => {
      prisma.survey.findUnique.mockResolvedValue({ currentRound: 8 });

      await expect(service.getCurrentRound()).resolves.toBe(8);
      expect(prisma.survey.upsert).not.toHaveBeenCalled();
    });

    it('seeds the default round when the singleton is missing', async () => {
      prisma.survey.findUnique.mockResolvedValue(null);
      prisma.survey.upsert.mockResolvedValue({ currentRound: 6 });

      await expect(service.getCurrentRound()).resolves.toBe(6);
      expect(prisma.survey.upsert).toHaveBeenCalledTimes(1);
    });
  });

  describe('getRoundSummary', () => {
    it('computes reported/missing counts for running classes', async () => {
      prisma.survey.findUnique.mockResolvedValue({ currentRound: 6 });
      prisma.class.count
        .mockResolvedValueOnce(10) // totalRunningClasses
        .mockResolvedValueOnce(4); // reportedCount

      await expect(service.getRoundSummary()).resolves.toEqual({
        currentRound: 6,
        totalRunningClasses: 10,
        reportedCount: 4,
        missingCount: 6,
      });
    });

    it('never returns a negative missing count', async () => {
      prisma.survey.findUnique.mockResolvedValue({ currentRound: 6 });
      prisma.class.count.mockResolvedValueOnce(2).mockResolvedValueOnce(5);

      const summary = await service.getRoundSummary();
      expect(summary.missingCount).toBe(0);
    });
  });

  describe('getMissingClasses', () => {
    it('maps teachers, latest reported round and last report date', async () => {
      prisma.survey.findUnique.mockResolvedValue({ currentRound: 6 });
      prisma.class.count.mockResolvedValue(1);
      prisma.class.findMany.mockResolvedValue([
        {
          id: 'UNICLASS-1',
          name: 'Lớp A',
          teachers: [
            { teacher: { user: { first_name: 'An', last_name: 'Nguyen' } } },
            { teacher: { user: null } },
          ],
          surveys: [
            { testNumber: 3, reportDate: new Date('2026-01-10T00:00:00Z') },
            { testNumber: 5, reportDate: new Date('2026-03-12T00:00:00Z') },
          ],
        },
      ]);

      const result = await service.getMissingClasses({ page: 1, limit: 20 });

      expect(result.meta).toEqual({ total: 1, page: 1, limit: 20 });
      expect(result.data[0]).toEqual({
        classId: 'UNICLASS-1',
        name: 'Lớp A',
        teachers: ['Nguyen An'],
        latestReportedRound: 5,
        lastReportDate: '2026-03-12',
      });
    });
  });

  describe('setCurrentRound', () => {
    it('rejects non-positive values', async () => {
      await expect(service.setCurrentRound(0)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('persists the new round and audits the change', async () => {
      prisma.survey.findUnique
        .mockResolvedValueOnce({ currentRound: 6 }) // persistRound -> previous
        .mockResolvedValue({ currentRound: 7 }); // summary reads
      prisma.class.count.mockResolvedValue(0);
      const tx = {
        survey: { upsert: jest.fn() },
      };
      prisma.$transaction.mockImplementation(
        async (cb: (client: typeof tx) => Promise<void>) => cb(tx),
      );

      await service.setCurrentRound(7, {
        userId: 'user-1',
        userEmail: 'a@b.c',
        roleType: 'admin' as never,
      });

      expect(tx.survey.upsert).toHaveBeenCalledTimes(1);
      expect(actionHistoryService.recordUpdate).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({
          entityType: 'survey_round',
          beforeValue: { currentRound: 6 },
          afterValue: { currentRound: 7 },
        }),
      );
    });
  });
});
