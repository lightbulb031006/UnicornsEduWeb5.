import { BadRequestException, Injectable } from '@nestjs/common';
import { ClassStatus } from 'generated/enums';
import {
  ActionHistoryActor,
  ActionHistoryService,
} from 'src/action-history/action-history.service';
import { getUserFullNameFromParts } from 'src/common/user-name.util';
import { PrismaService } from 'src/prisma/prisma.service';
import type {
  AdminMissingSurveyClassDto,
  AdminMissingSurveyClassListDto,
  AdminSurveyRoundSummaryDto,
} from 'src/dtos/survey-round.dto';

const SURVEY_ROUND_SINGLETON_ID = 'current';
const DEFAULT_SURVEY_ROUND = 6;

@Injectable()
export class SurveyRoundService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly actionHistoryService: ActionHistoryService,
  ) {}

  /** Read the global current survey round, seeding the singleton if needed. */
  async getCurrentRound(): Promise<number> {
    const record = await this.prisma.surveyRound.findUnique({
      where: { id: SURVEY_ROUND_SINGLETON_ID },
      select: { currentRound: true },
    });

    if (record) {
      return record.currentRound;
    }

    const created = await this.prisma.surveyRound.upsert({
      where: { id: SURVEY_ROUND_SINGLETON_ID },
      update: {},
      create: {
        id: SURVEY_ROUND_SINGLETON_ID,
        currentRound: DEFAULT_SURVEY_ROUND,
      },
      select: { currentRound: true },
    });

    return created.currentRound;
  }

  async getRoundSummary(): Promise<AdminSurveyRoundSummaryDto> {
    const currentRound = await this.getCurrentRound();

    const [totalRunningClasses, reportedCount] = await Promise.all([
      this.prisma.class.count({ where: { status: ClassStatus.running } }),
      this.prisma.class.count({
        where: {
          status: ClassStatus.running,
          surveys: { some: { testNumber: currentRound } },
        },
      }),
    ]);

    return {
      currentRound,
      totalRunningClasses,
      reportedCount,
      missingCount: Math.max(totalRunningClasses - reportedCount, 0),
    };
  }

  async getMissingClasses(params: {
    page?: number;
    limit?: number;
  }): Promise<AdminMissingSurveyClassListDto> {
    const currentRound = await this.getCurrentRound();
    const page = Math.max(params.page ?? 1, 1);
    const limit = Math.min(Math.max(params.limit ?? 20, 1), 100);

    const where = {
      status: ClassStatus.running,
      surveys: { none: { testNumber: currentRound } },
    } as const;

    const [total, classes] = await Promise.all([
      this.prisma.class.count({ where }),
      this.prisma.class.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          name: true,
          teachers: {
            select: {
              teacher: {
                select: {
                  user: { select: { first_name: true, last_name: true } },
                },
              },
            },
          },
          surveys: {
            select: { testNumber: true, reportDate: true },
          },
        },
      }),
    ]);

    const data: AdminMissingSurveyClassDto[] = classes.map((item) => {
      const teachers = item.teachers
        .map((entry) => getUserFullNameFromParts(entry.teacher?.user))
        .filter((name): name is string => Boolean(name && name.trim()));

      const latestReportedRound = item.surveys.reduce<number | null>(
        (max, survey) =>
          max == null ? survey.testNumber : Math.max(max, survey.testNumber),
        null,
      );

      const lastReportDate = item.surveys.reduce<Date | null>(
        (latest, survey) => {
          if (!survey.reportDate) return latest;
          if (!latest || survey.reportDate > latest) return survey.reportDate;
          return latest;
        },
        null,
      );

      return {
        classId: item.id,
        name: item.name,
        teachers,
        latestReportedRound,
        lastReportDate: lastReportDate
          ? lastReportDate.toISOString().slice(0, 10)
          : null,
      };
    });

    return { data, meta: { total, page, limit } };
  }

  async setCurrentRound(
    nextRound: number,
    actor?: ActionHistoryActor,
  ): Promise<AdminSurveyRoundSummaryDto> {
    if (!Number.isInteger(nextRound) || nextRound < 1) {
      throw new BadRequestException(
        'Lần khảo sát phải là số nguyên lớn hơn 0.',
      );
    }

    await this.persistRound(nextRound, actor);
    return this.getRoundSummary();
  }

  private async persistRound(nextRound: number, actor?: ActionHistoryActor) {
    const previous = await this.getCurrentRound();

    await this.prisma.$transaction(async (tx) => {
      await tx.surveyRound.upsert({
        where: { id: SURVEY_ROUND_SINGLETON_ID },
        update: {
          currentRound: nextRound,
          updatedByUserId: actor?.userId ?? null,
        },
        create: {
          id: SURVEY_ROUND_SINGLETON_ID,
          currentRound: nextRound,
          updatedByUserId: actor?.userId ?? null,
        },
      });

      if (actor && previous !== nextRound) {
        await this.actionHistoryService.recordUpdate(tx, {
          actor,
          entityType: 'survey_round',
          entityId: SURVEY_ROUND_SINGLETON_ID,
          description: 'Cập nhật lần khảo sát hiện tại',
          beforeValue: { currentRound: previous },
          afterValue: { currentRound: nextRound },
        });
      }
    });
  }
}
