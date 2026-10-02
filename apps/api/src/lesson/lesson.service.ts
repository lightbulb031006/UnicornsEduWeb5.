import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/client';
import {
  LessonOutputDifficultyBand,
  LessonOutputStatus,
  LessonTaskPriority,
  LessonTaskStatus,
  PaymentStatus,
  StaffRole,
  StaffStatus,
  UserRole,
} from 'generated/enums';
import { computeLessonOutputCost } from './lesson-output-pricing';
import {
  ActionHistoryActor,
  ActionHistoryService,
} from '../action-history/action-history.service';
import { getPreferredUserFullName } from 'src/common/user-name.util';
import { assertStaffCanReceiveAssignment } from 'src/common/profile-status.policy';
import {
  BulkUpdateLessonOutputPaymentStatusResultDto,
  CreateLessonOutputDto,
  CreateLessonResourceDto,
  CreateLessonTaskDto,
  LessonOutputResponseDto,
  LessonOutputStaffDto,
  LessonOutputStaffStatsQueryDto,
  LessonOutputStaffStatsResponseDto,
  LessonOutputStaffOptionDto,
  LessonOutputStaffOptionsQueryDto,
  LessonOutputTaskSummaryDto,
  LessonOverviewQueryDto,
  LessonOverviewResponseDto,
  LessonResourceOptionDto,
  LessonResourceOptionsQueryDto,
  LessonResourcePreviewDto,
  LessonResourceResponseDto,
  LessonTaskAssigneeDto,
  LessonTaskCreatorDto,
  LessonTaskDetailResponseDto,
  LessonTaskOptionDto,
  LessonTaskOutputListItemDto,
  LessonTaskOutputProgressDto,
  LessonTaskResponseDto,
  LessonTaskOptionsQueryDto,
  LessonTaskStaffOptionDto,
  LessonTaskStaffOptionsQueryDto,
  LessonWorkOutputItemDto,
  LessonWorkQueryDto,
  LessonWorkResponseDto,
  UpdateLessonResourceDto,
  UpdateLessonOutputDto,
  UpdateLessonTaskDto,
} from '../dtos/lesson.dto';
import { PrismaService } from '../prisma/prisma.service';
import type { JwtPayload } from '../auth/decorators/current-user.decorator';
import { resolveTaxDeductionRate } from '../payroll/deduction-rates';

type LessonTaskRecord = {
  id: string;
  title: string | null;
  description: string | null;
  status: LessonTaskStatus;
  priority: LessonTaskPriority;
  dueDate: Date | null;
  createdBy: string | null;
};

type HydratedLessonTaskRecord = LessonTaskRecord & {
  createdByStaff: LessonTaskCreatorDto | null;
  assignees: LessonTaskAssigneeDto[];
  outputAssignees: LessonTaskAssigneeDto[];
};

type LessonOutputRecord = {
  id: string;
  lessonTaskId: string | null;
  lessonName: string;
  originalTitle: string | null;
  source: string | null;
  originalLink: string | null;
  level: string | null;
  difficultyBand?: LessonOutputDifficultyBand | null;
  includesTest?: boolean;
  includesSolution?: boolean;
  includesLectureVideo?: boolean;
  tags: unknown;
  cost: number;
  paymentStatus: PaymentStatus;
  date: Date;
  contestUploaded: string | null;
  link: string | null;
  staffId: string | null;
  status: LessonOutputStatus;
  createdAt: Date;
  updatedAt: Date;
  staff: {
    id: string;
    user: {
      first_name: string | null;
      last_name: string | null;
    } | null;
    roles: StaffRole[];
    status: StaffStatus;
  } | null;
  lessonTask: {
    id: string;
    title: string | null;
    status: LessonTaskStatus;
    priority: LessonTaskPriority;
  } | null;
};

const LESSON_TASK_ASSIGNABLE_ROLES = [
  StaffRole.lesson_plan,
  StaffRole.lesson_plan_head,
] as const;
const DEFAULT_LESSON_OUTPUT_STATS_DAYS = 30;
const MAX_LESSON_OUTPUT_STATS_DAYS = 365;

type LessonActorContext = {
  userId: string;
  roleType: UserRole;
  staffId: string | null;
  staffRoles: StaffRole[];
  canManage: boolean;
  canParticipate: boolean;
  canAccountWork: boolean;
};

type LessonEndpointAccessMode = 'manage' | 'account' | 'participant';

function toTrimmedString(value: string | null | undefined) {
  if (value == null) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}

function toDateOnlyOrNull(value: string | null | undefined) {
  if (value == null) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsedDate = new Date(trimmed);
  if (Number.isNaN(parsedDate.getTime())) {
    throw new BadRequestException('dueDate không hợp lệ.');
  }

  return parsedDate;
}

function normalizeTags(value: string[] | null | undefined) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .map((item) => String(item).trim())
        .filter((item) => item.length > 0),
    ),
  );
}

function parseJsonStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => item.length > 0);
}

@Injectable()
export class LessonService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly actionHistoryService: ActionHistoryService,
  ) {}

  private buildStaffDisplayName(
    staff: {
      user?: {
        first_name: string | null;
        last_name: string | null;
        accountHandle?: string | null;
        email?: string | null;
      } | null;
      fullName?: string | null;
    } | null,
  ) {
    return (
      getPreferredUserFullName(staff?.user) ?? staff?.fullName?.trim() ?? ''
    );
  }

  private async resolveLessonOutputDeductionSnapshot(
    db: Pick<
      PrismaService,
      'staffInfo' | 'roleTaxDeductionRate' | 'staffTaxDeductionOverride'
    >,
    staffId: string | null,
    effectiveDate: Date,
  ) {
    if (!staffId) {
      return {
        roleType: null,
        taxDeductionRatePercent: 0,
      };
    }

    const staff = await db.staffInfo.findUnique({
      where: { id: staffId },
      select: {
        roles: true,
      },
    });

    const roles = staff?.roles ?? [];
    const roleType = roles.includes(StaffRole.lesson_plan_head)
      ? StaffRole.lesson_plan_head
      : roles.includes(StaffRole.lesson_plan)
        ? StaffRole.lesson_plan
        : null;

    if (!roleType) {
      return {
        roleType: null,
        taxDeductionRatePercent: 0,
      };
    }

    return {
      roleType,
      taxDeductionRatePercent: await resolveTaxDeductionRate(db, {
        staffId,
        roleType,
        effectiveDate,
      }),
    };
  }

  async getOverview(
    query: LessonOverviewQueryDto = {},
    actor?: JwtPayload,
  ): Promise<LessonOverviewResponseDto> {
    const resourceLimit = this.resolveLimit(query.resourceLimit, 6);
    const taskLimit = this.resolveLimit(query.taskLimit, 6);
    const resourceRequestedPage = this.resolvePage(query.resourcePage);
    const taskRequestedPage = this.resolvePage(query.taskPage);
    const access = await this.resolveLessonActorContext(actor);
    const accessMode = this.requireLessonEndpointAccess(
      access,
      ['manage', 'participant'],
      'Tài khoản hiện tại không có quyền dùng workspace giáo án.',
    );
    const participantAccess = accessMode === 'participant' ? access : null;

    if (participantAccess) {
      const taskWhere = this.buildParticipantTaskWhere(
        participantAccess.staffId,
      );
      const [resourceCount, taskCount, openTaskCount, completedTaskCount] =
        await this.prisma.$transaction([
          this.prisma.lessonResource.count(),
          this.prisma.lessonTask.count({ where: taskWhere }),
          this.prisma.lessonTask.count({
            where: {
              AND: [
                taskWhere,
                {
                  status: {
                    in: [
                      LessonTaskStatus.pending,
                      LessonTaskStatus.in_progress,
                    ],
                  },
                },
              ],
            },
          }),
          this.prisma.lessonTask.count({
            where: {
              AND: [taskWhere, { status: LessonTaskStatus.completed }],
            },
          }),
        ]);

      const taskMeta = this.buildListMeta(
        taskCount,
        taskRequestedPage,
        taskLimit,
      );
      const resourceMeta = this.buildListMeta(
        resourceCount,
        resourceRequestedPage,
        resourceLimit,
      );
      const [resources, tasks] = await this.prisma.$transaction([
        this.prisma.lessonResource.findMany({
          skip: (resourceMeta.page - 1) * resourceMeta.limit,
          take: resourceMeta.limit,
          orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
        }),
        this.prisma.lessonTask.findMany({
          where: taskWhere,
          skip: (taskMeta.page - 1) * taskMeta.limit,
          take: taskMeta.limit,
          orderBy: [
            { updatedAt: 'desc' },
            { status: 'asc' },
            { dueDate: 'asc' },
            { priority: 'desc' },
            { title: 'asc' },
          ],
        }),
      ]);
      const hydratedTasks = await this.hydrateTaskRecords(this.prisma, tasks);

      return {
        summary: {
          resourceCount,
          taskCount,
          openTaskCount,
          completedTaskCount,
        },
        resources: resources.map((resource) => this.mapResource(resource)),
        resourcesMeta: resourceMeta,
        tasks: hydratedTasks.map((task) => this.mapTask(task)),
        tasksMeta: taskMeta,
      };
    }

    const [resourceCount, taskCount, openTaskCount, completedTaskCount] =
      await this.prisma.$transaction([
        this.prisma.lessonResource.count(),
        this.prisma.lessonTask.count(),
        this.prisma.lessonTask.count({
          where: {
            status: {
              in: [LessonTaskStatus.pending, LessonTaskStatus.in_progress],
            },
          },
        }),
        this.prisma.lessonTask.count({
          where: { status: LessonTaskStatus.completed },
        }),
      ]);

    const resourceMeta = this.buildListMeta(
      resourceCount,
      resourceRequestedPage,
      resourceLimit,
    );
    const taskMeta = this.buildListMeta(
      taskCount,
      taskRequestedPage,
      taskLimit,
    );

    const [resources, tasks] = await this.prisma.$transaction([
      this.prisma.lessonResource.findMany({
        skip: (resourceMeta.page - 1) * resourceMeta.limit,
        take: resourceMeta.limit,
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      }),
      this.prisma.lessonTask.findMany({
        skip: (taskMeta.page - 1) * taskMeta.limit,
        take: taskMeta.limit,
        orderBy: [
          { updatedAt: 'desc' },
          { status: 'asc' },
          { dueDate: 'asc' },
          { priority: 'desc' },
          { title: 'asc' },
        ],
      }),
    ]);
    const hydratedTasks = await this.hydrateTaskRecords(this.prisma, tasks);

    return {
      summary: {
        resourceCount,
        taskCount,
        openTaskCount,
        completedTaskCount,
      },
      resources: resources.map((resource) => this.mapResource(resource)),
      resourcesMeta: resourceMeta,
      tasks: hydratedTasks.map((task) => this.mapTask(task)),
      tasksMeta: taskMeta,
    };
  }

  async getWork(
    query: LessonWorkQueryDto = {},
    actor?: JwtPayload,
  ): Promise<LessonWorkResponseDto> {
    type LessonOutputStatusGroup = {
      status: LessonOutputStatus;
      _count: number;
    };

    const limit = this.resolveLimit(query.limit, 6);
    const requestedPage = this.resolvePage(query.page);
    const access = await this.resolveLessonActorContext(actor);
    const accessMode = this.requireLessonEndpointAccess(
      access,
      ['manage', 'account', 'participant'],
      'Tài khoản hiện tại không có quyền dùng workspace giáo án.',
    );
    const participantScopedAccess =
      accessMode === 'participant' ? access : null;
    const workWhere = this.buildWorkWhere(query, participantScopedAccess);
    const taskWhere = participantScopedAccess
      ? this.buildParticipantTaskWhere(participantScopedAccess.staffId)
      : undefined;

    const [taskCount, rawOutputGroups] = await this.prisma.$transaction([
      this.prisma.lessonTask.count({
        where: taskWhere,
      }),
      this.prisma.lessonOutput.groupBy({
        by: ['status'] as const,
        where: workWhere,
        orderBy: {
          status: 'asc',
        },
        _count: true,
      }),
    ]);
    const outputGroups =
      rawOutputGroups as unknown as LessonOutputStatusGroup[];

    const pendingOutputCount =
      outputGroups.find((group) => group.status === LessonOutputStatus.pending)
        ?._count ?? 0;
    const completedOutputCount =
      outputGroups.find(
        (group) => group.status === LessonOutputStatus.completed,
      )?._count ?? 0;
    const cancelledOutputCount =
      outputGroups.find(
        (group) => group.status === LessonOutputStatus.cancelled,
      )?._count ?? 0;
    const outputCount =
      pendingOutputCount + completedOutputCount + cancelledOutputCount;

    const outputMeta = this.buildListMeta(outputCount, requestedPage, limit);
    const outputs = await this.prisma.lessonOutput.findMany({
      where: workWhere,
      skip: (outputMeta.page - 1) * outputMeta.limit,
      take: outputMeta.limit,
      orderBy: [{ updatedAt: 'desc' }, { date: 'desc' }, { lessonName: 'asc' }],
      include: this.lessonOutputInclude,
    });

    return {
      summary: {
        taskCount,
        outputCount,
        pendingOutputCount,
        completedOutputCount,
        cancelledOutputCount,
      },
      outputs: outputs.map((output) => this.mapWorkOutputItem(output)),
      outputsMeta: outputMeta,
    };
  }

  async getOutputStatsByStaff(
    staffId: string,
    query: LessonOutputStaffStatsQueryDto = {},
    actor?: JwtPayload,
  ): Promise<LessonOutputStaffStatsResponseDto> {
    type LessonOutputStatusGroup = {
      status: LessonOutputStatus;
      _count: number;
    };

    const days = this.resolveRecentDays(
      query.days,
      DEFAULT_LESSON_OUTPUT_STATS_DAYS,
    );
    const access = await this.resolveLessonActorContext(actor);

    if (access && !access.canManage && !access.canAccountWork) {
      throw new ForbiddenException(
        'Tài khoản hiện tại không có quyền xem thống kê lesson output theo nhân sự.',
      );
    }

    const where = this.buildRecentLessonOutputWhere(staffId, days);

    const [staff, outputCount, rawOutputGroups, outputCostAggregate, outputs] =
      await this.prisma.$transaction([
        this.prisma.staffInfo.findUnique({
          where: { id: staffId },
          select: {
            id: true,
            user: {
              select: {
                first_name: true,
                last_name: true,
              },
            },
            roles: true,
            status: true,
          },
        }),
        this.prisma.lessonOutput.count({
          where,
        }),
        this.prisma.lessonOutput.groupBy({
          by: ['status'] as const,
          where,
          orderBy: {
            status: 'asc',
          },
          _count: true,
        }),
        this.prisma.lessonOutput.aggregate({
          where: {
            ...where,
            paymentStatus: PaymentStatus.pending,
          },
          _sum: {
            cost: true,
          },
        }),
        this.prisma.lessonOutput.findMany({
          where,
          orderBy: [
            { date: 'desc' },
            { updatedAt: 'desc' },
            { lessonName: 'asc' },
          ],
          include: this.lessonOutputInclude,
        }),
      ]);

    if (!staff) {
      throw new NotFoundException('Staff not found');
    }

    const outputGroups =
      rawOutputGroups as unknown as LessonOutputStatusGroup[];

    return {
      summary: {
        days,
        staff: {
          id: staff.id,
          fullName: this.buildStaffDisplayName(staff),
          roles: staff.roles,
          status: staff.status,
        },
        outputCount,
        pendingOutputCount:
          outputGroups.find(
            (group) => group.status === LessonOutputStatus.pending,
          )?._count ?? 0,
        completedOutputCount:
          outputGroups.find(
            (group) => group.status === LessonOutputStatus.completed,
          )?._count ?? 0,
        cancelledOutputCount:
          outputGroups.find(
            (group) => group.status === LessonOutputStatus.cancelled,
          )?._count ?? 0,
        unpaidCostTotal: outputCostAggregate._sum.cost ?? 0,
      },
      outputs: outputs.map((output) => this.mapWorkOutputItem(output)),
    };
  }

  async createResource(
    data: CreateLessonResourceDto,
    auditActor?: ActionHistoryActor,
    actor?: JwtPayload,
  ): Promise<LessonResourceResponseDto> {
    const access = await this.resolveLessonActorContext(actor);
    if (access && !access.canManage && !access.canParticipate) {
      throw new ForbiddenException(
        'Tài khoản hiện tại không có quyền tạo tài nguyên giáo án.',
      );
    }

    let lessonTaskId = await this.resolveOptionalLessonTaskId(
      this.prisma,
      data.lessonTaskId,
    );
    const title = this.requireNonEmptyValue(data.title, 'title');
    const resourceLink = this.requireNonEmptyValue(
      data.resourceLink,
      'resourceLink',
    );
    const description = toTrimmedString(data.description);
    const tags = normalizeTags(data.tags);

    if (access?.canParticipate && !access.canManage && lessonTaskId) {
      lessonTaskId = await this.assertParticipantTaskAccess(
        this.prisma,
        lessonTaskId,
        access,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const createdResource = await tx.lessonResource.create({
        data: {
          title,
          resourceLink,
          description,
          tags,
          lessonTask: lessonTaskId
            ? {
                connect: { id: lessonTaskId },
              }
            : undefined,
          createdBy: auditActor?.userId ?? null,
        },
      });

      if (auditActor) {
        await this.actionHistoryService.recordCreate(tx, {
          actor: auditActor,
          entityType: 'lesson_resource',
          entityId: createdResource.id,
          description: 'Tạo tài nguyên giáo án',
          afterValue: createdResource,
        });
      }

      return this.mapResource(createdResource);
    });
  }

  async updateResource(
    id: string,
    data: UpdateLessonResourceDto,
    auditActor?: ActionHistoryActor,
    actor?: JwtPayload,
  ): Promise<LessonResourceResponseDto> {
    const access = await this.resolveLessonActorContext(actor);
    const existingResource = await this.prisma.lessonResource.findUnique({
      where: { id },
    });

    if (!existingResource) {
      throw new NotFoundException('Lesson resource not found');
    }

    this.assertResourceWriteAccess(
      existingResource,
      access,
      'cập nhật tài nguyên giáo án',
    );

    const updateData: Prisma.LessonResourceUpdateInput = {};

    if (data.title !== undefined) {
      updateData.title = this.requireNonEmptyValue(data.title, 'title');
    }

    if (data.resourceLink !== undefined) {
      updateData.resourceLink = this.requireNonEmptyValue(
        data.resourceLink,
        'resourceLink',
      );
    }

    if (data.description !== undefined) {
      updateData.description = toTrimmedString(data.description);
    }

    if (data.lessonTaskId !== undefined) {
      const lessonTaskId = await this.resolveOptionalLessonTaskId(
        this.prisma,
        data.lessonTaskId,
      );
      updateData.lessonTask = lessonTaskId
        ? {
            connect: {
              id:
                access?.canParticipate && !access.canManage
                  ? await this.assertParticipantTaskAccess(
                      this.prisma,
                      lessonTaskId,
                      access,
                    )
                  : lessonTaskId,
            },
          }
        : {
            disconnect: true,
          };
    }

    if (data.tags !== undefined) {
      updateData.tags = normalizeTags(data.tags);
    }

    return this.prisma.$transaction(async (tx) => {
      const updatedResource = await tx.lessonResource.update({
        where: { id },
        data: updateData,
      });

      if (auditActor) {
        await this.actionHistoryService.recordUpdate(tx, {
          actor: auditActor,
          entityType: 'lesson_resource',
          entityId: id,
          description: 'Cập nhật tài nguyên giáo án',
          beforeValue: existingResource,
          afterValue: updatedResource,
        });
      }

      return this.mapResource(updatedResource);
    });
  }

  async deleteResource(
    id: string,
    auditActor?: ActionHistoryActor,
    actor?: JwtPayload,
  ) {
    const access = await this.resolveLessonActorContext(actor);
    const existingResource = await this.prisma.lessonResource.findUnique({
      where: { id },
    });

    if (!existingResource) {
      throw new NotFoundException('Lesson resource not found');
    }

    this.assertResourceWriteAccess(
      existingResource,
      access,
      'xóa tài nguyên giáo án',
    );

    return this.prisma.$transaction(async (tx) => {
      const deletedResource = await tx.lessonResource.delete({
        where: { id },
      });

      if (auditActor) {
        await this.actionHistoryService.recordDelete(tx, {
          actor: auditActor,
          entityType: 'lesson_resource',
          entityId: id,
          description: 'Xóa tài nguyên giáo án',
          beforeValue: existingResource,
        });
      }

      return deletedResource;
    });
  }

  async getResourceById(id: string): Promise<LessonResourceResponseDto> {
    const resource = await this.prisma.lessonResource.findUnique({
      where: { id },
    });

    if (!resource) {
      throw new NotFoundException('Lesson resource not found');
    }

    return this.mapResource(resource);
  }

  async createTask(
    data: CreateLessonTaskDto,
    auditActor?: ActionHistoryActor,
  ): Promise<LessonTaskResponseDto> {
    const title = this.requireNonEmptyValue(data.title, 'title');
    const description = toTrimmedString(data.description);
    const status = data.status ?? LessonTaskStatus.pending;
    const priority = data.priority ?? LessonTaskPriority.medium;
    const dueDate = toDateOnlyOrNull(data.dueDate);

    return this.prisma.$transaction(async (tx) => {
      const legacyCreatedByStaffId =
        data.createdByStaffId !== undefined
          ? await this.resolveCreatedByStaffId(tx, data.createdByStaffId)
          : null;
      const assigneeStaffIds = this.mergeStaffIds(
        await this.resolveTaskAssigneeStaffIds(tx, data.assigneeStaffIds),
        legacyCreatedByStaffId ? [legacyCreatedByStaffId] : [],
      );

      const createdTask = await tx.lessonTask.create({
        data: {
          title,
          description,
          status,
          priority,
          dueDate,
        },
      });

      await this.syncTaskAssignees(tx, createdTask.id, assigneeStaffIds);

      const afterTask = await this.getTaskSnapshot(tx, createdTask.id);
      const afterValue = afterTask
        ? await this.hydrateTaskRecord(tx, afterTask)
        : null;

      if (auditActor) {
        await this.actionHistoryService.recordCreate(tx, {
          actor: auditActor,
          entityType: 'lesson_task',
          entityId: createdTask.id,
          description: 'Tạo công việc giáo án',
          afterValue,
        });
      }

      return this.mapTaskFromSnapshot(afterValue);
    });
  }

  async updateTask(
    id: string,
    data: UpdateLessonTaskDto,
    auditActor?: ActionHistoryActor,
  ): Promise<LessonTaskResponseDto> {
    const existingTaskRecord = await this.getTaskSnapshot(this.prisma, id);
    const existingTask = existingTaskRecord
      ? await this.hydrateTaskRecord(this.prisma, existingTaskRecord)
      : null;

    if (!existingTask) {
      throw new NotFoundException('Lesson task not found');
    }

    const updateData: Prisma.LessonTaskUpdateInput = {};

    if (data.title !== undefined) {
      updateData.title = this.requireNonEmptyValue(data.title, 'title');
    }

    if (data.description !== undefined) {
      updateData.description = toTrimmedString(data.description);
    }

    if (data.status !== undefined) {
      updateData.status = data.status;
    }

    if (data.priority !== undefined) {
      updateData.priority = data.priority;
    }

    if (data.dueDate !== undefined) {
      updateData.dueDate = toDateOnlyOrNull(data.dueDate);
    }

    return this.prisma.$transaction(async (tx) => {
      const legacyCreatedByStaffId =
        data.createdByStaffId !== undefined
          ? await this.resolveCreatedByStaffId(tx, data.createdByStaffId)
          : null;
      const baseAssigneeStaffIds =
        data.assigneeStaffIds !== undefined
          ? await this.resolveTaskAssigneeStaffIds(tx, data.assigneeStaffIds)
          : existingTask.assignees.map((assignee) => assignee.id);
      const assigneeStaffIds = this.mergeStaffIds(
        baseAssigneeStaffIds,
        legacyCreatedByStaffId ? [legacyCreatedByStaffId] : [],
      );

      updateData.createdByStaff = {
        disconnect: true,
      };

      await tx.lessonTask.update({
        where: { id },
        data: updateData,
      });

      await this.syncTaskAssignees(tx, id, assigneeStaffIds);

      const afterTaskRecord = await this.getTaskSnapshot(tx, id);
      const afterValue = afterTaskRecord
        ? await this.hydrateTaskRecord(tx, afterTaskRecord)
        : null;

      if (!afterValue) {
        throw new NotFoundException('Lesson task not found');
      }

      if (auditActor) {
        await this.actionHistoryService.recordUpdate(tx, {
          actor: auditActor,
          entityType: 'lesson_task',
          entityId: id,
          description: 'Cập nhật công việc giáo án',
          beforeValue: existingTask,
          afterValue,
        });
      }

      return this.mapTaskFromSnapshot(afterValue);
    });
  }

  async deleteTask(id: string, auditActor?: ActionHistoryActor) {
    const existingTaskRecord = await this.getTaskSnapshot(this.prisma, id);
    const existingTask = existingTaskRecord
      ? await this.hydrateTaskRecord(this.prisma, existingTaskRecord)
      : null;

    if (!existingTask) {
      throw new NotFoundException('Lesson task not found');
    }

    return this.prisma.$transaction(async (tx) => {
      const deletedTask = await tx.lessonTask.delete({
        where: { id },
      });

      if (auditActor) {
        await this.actionHistoryService.recordDelete(tx, {
          actor: auditActor,
          entityType: 'lesson_task',
          entityId: id,
          description: 'Xóa công việc giáo án',
          beforeValue: existingTask,
        });
      }

      return deletedTask;
    });
  }

  async createOutput(
    data: CreateLessonOutputDto,
    auditActor?: ActionHistoryActor,
    actor?: JwtPayload,
  ): Promise<LessonOutputResponseDto> {
    const access = await this.resolveLessonActorContext(actor);
    if (access && !access.canManage && !access.canParticipate) {
      throw new ForbiddenException(
        'Tài khoản hiện tại không có quyền tạo output giáo án.',
      );
    }

    let lessonTaskId = await this.resolveOptionalLessonTaskId(
      this.prisma,
      data.lessonTaskId,
    );
    const lessonName = this.requireNonEmptyValue(data.lessonName, 'lessonName');
    const originalTitle = toTrimmedString(data.originalTitle);
    const source = toTrimmedString(data.source);
    const originalLink = toTrimmedString(data.originalLink);
    const level = toTrimmedString(data.level);
    const tags = normalizeTags(data.tags);
    const difficultyBand = data.difficultyBand ?? null;
    const includesTest = data.includesTest === true;
    const includesSolution = data.includesSolution === true;
    const includesLectureVideo = data.includesLectureVideo === true;
    const cost =
      computeLessonOutputCost(difficultyBand, {
        includesTest,
        includesSolution,
        includesLectureVideo,
      }) ?? 0;
    const paymentStatus =
      access?.canParticipate && !access.canManage
        ? PaymentStatus.pending
        : (data.paymentStatus ?? PaymentStatus.pending);
    const date = this.requireDateOnly(data.date, 'date');
    const contestUploaded = toTrimmedString(data.contestUploaded);
    const link = toTrimmedString(data.link);
    const status = data.status ?? LessonOutputStatus.pending;

    if (access?.canParticipate && !access.canManage) {
      if (!lessonTaskId) {
        throw new BadRequestException(
          'Staff giáo án chỉ được thêm output vào task của mình.',
        );
      }

      lessonTaskId = await this.assertParticipantTaskAccess(
        this.prisma,
        lessonTaskId,
        access,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const staffId =
        access?.canParticipate && !access.canManage
          ? this.requireParticipantStaffId(access)
          : await this.resolveLessonOutputStaffId(tx, data.staffId);
      const outputDeductionSnapshot =
        await this.resolveLessonOutputDeductionSnapshot(tx, staffId, date);

      const createdOutput = await tx.lessonOutput.create({
        data: {
          lessonTaskId,
          lessonName,
          originalTitle,
          source,
          originalLink,
          level,
          difficultyBand,
          includesTest,
          includesSolution,
          includesLectureVideo,
          tags,
          cost,
          paymentStatus,
          date,
          contestUploaded,
          link,
          staffId,
          status,
          roleType: outputDeductionSnapshot.roleType,
          taxDeductionRatePercent:
            outputDeductionSnapshot.taxDeductionRatePercent,
        },
        include: this.lessonOutputInclude,
      });

      if (auditActor) {
        await this.actionHistoryService.recordCreate(tx, {
          actor: auditActor,
          entityType: 'lesson_output',
          entityId: createdOutput.id,
          description: 'Tạo lesson output',
          afterValue: this.mapOutput(createdOutput),
        });
      }

      return this.mapOutput(createdOutput);
    });
  }

  async updateOutput(
    id: string,
    data: UpdateLessonOutputDto,
    auditActor?: ActionHistoryActor,
    actor?: JwtPayload,
  ): Promise<LessonOutputResponseDto> {
    const access = await this.resolveLessonActorContext(actor);
    const accessMode = this.requireLessonEndpointAccess(
      access,
      ['manage', 'account', 'participant'],
      'Tài khoản hiện tại không có quyền cập nhật output giáo án.',
    );

    const existingOutput = await this.getOutputSnapshotForActor(
      this.prisma,
      id,
      accessMode === 'participant' ? access : null,
    );
    if (!existingOutput) {
      throw new NotFoundException('Lesson output not found');
    }

    const updateData: Prisma.LessonOutputUpdateInput = {};
    const participantEditing = accessMode === 'participant';
    const accountantPaymentOnlyEditing = accessMode === 'account';

    if (accountantPaymentOnlyEditing) {
      const disallowedFields: Array<keyof UpdateLessonOutputDto> = [
        'lessonTaskId',
        'lessonName',
        'originalTitle',
        'source',
        'originalLink',
        'level',
        'difficultyBand',
        'includesTest',
        'includesSolution',
        'includesLectureVideo',
        'tags',
        'cost',
        'date',
        'contestUploaded',
        'link',
        'staffId',
        'status',
      ];
      const touchedField = disallowedFields.find(
        (field) => data[field] !== undefined,
      );
      if (touchedField) {
        throw new ForbiddenException(
          'Kế toán chi chỉ được cập nhật trạng thái thanh toán output.',
        );
      }
    }

    if (data.lessonTaskId !== undefined) {
      const lessonTaskId = await this.resolveOptionalLessonTaskId(
        this.prisma,
        data.lessonTaskId,
      );
      if (participantEditing) {
        if (lessonTaskId !== existingOutput.lessonTaskId) {
          throw new ForbiddenException(
            'Staff giáo án không được đổi task của output.',
          );
        }
      } else {
        updateData.lessonTask = lessonTaskId
          ? {
              connect: { id: lessonTaskId },
            }
          : {
              disconnect: true,
            };
      }
    }

    if (data.lessonName !== undefined) {
      updateData.lessonName = this.requireNonEmptyValue(
        data.lessonName,
        'lessonName',
      );
    }

    if (data.originalTitle !== undefined) {
      updateData.originalTitle = toTrimmedString(data.originalTitle);
    }

    if (data.source !== undefined) {
      updateData.source = toTrimmedString(data.source);
    }

    if (data.originalLink !== undefined) {
      updateData.originalLink = toTrimmedString(data.originalLink);
    }

    if (data.level !== undefined) {
      updateData.level = toTrimmedString(data.level);
    }

    if (data.difficultyBand !== undefined) {
      updateData.difficultyBand = data.difficultyBand ?? null;
    }

    if (data.includesTest !== undefined) {
      updateData.includesTest = data.includesTest === true;
    }

    if (data.includesSolution !== undefined) {
      updateData.includesSolution = data.includesSolution === true;
    }

    if (data.includesLectureVideo !== undefined) {
      updateData.includesLectureVideo = data.includesLectureVideo === true;
    }

    if (data.tags !== undefined) {
      updateData.tags = normalizeTags(data.tags);
    }

    const nextDifficultyBand =
      data.difficultyBand !== undefined
        ? (data.difficultyBand ?? null)
        : (existingOutput.difficultyBand ?? null);
    const nextIncludesTest =
      data.includesTest !== undefined
        ? data.includesTest === true
        : Boolean(existingOutput.includesTest);
    const nextIncludesSolution =
      data.includesSolution !== undefined
        ? data.includesSolution === true
        : Boolean(existingOutput.includesSolution);
    const nextIncludesLectureVideo =
      data.includesLectureVideo !== undefined
        ? data.includesLectureVideo === true
        : Boolean(existingOutput.includesLectureVideo);
    const computedCost = computeLessonOutputCost(nextDifficultyBand, {
      includesTest: nextIncludesTest,
      includesSolution: nextIncludesSolution,
      includesLectureVideo: nextIncludesLectureVideo,
    });
    if (computedCost != null) {
      updateData.cost = computedCost;
    }

    if (data.paymentStatus !== undefined) {
      if (!this.canEditOutputPaymentStatus(access)) {
        throw new ForbiddenException(
          'Tài khoản hiện tại không có quyền cập nhật trạng thái thanh toán output.',
        );
      }
      updateData.paymentStatus = data.paymentStatus;
    }

    if (data.date !== undefined) {
      updateData.date = this.requireDateOnly(data.date, 'date');
    }

    if (data.contestUploaded !== undefined) {
      updateData.contestUploaded = toTrimmedString(data.contestUploaded);
    }

    if (data.link !== undefined) {
      updateData.link = toTrimmedString(data.link);
    }

    let nextStaffId = existingOutput.staffId;
    if (data.staffId !== undefined) {
      if (participantEditing) {
        throw new ForbiddenException(
          'Staff giáo án không được đổi nhân sự nhận thanh toán output.',
        );
      }
      nextStaffId = await this.resolveLessonOutputStaffId(
        this.prisma,
        data.staffId,
      );

      updateData.staff = nextStaffId
        ? {
            connect: { id: nextStaffId },
          }
        : {
            disconnect: true,
          };
    }

    if (data.status !== undefined) {
      updateData.status = data.status;
    }

    return this.prisma.$transaction(async (tx) => {
      const nextOutputDate =
        updateData.date instanceof Date ? updateData.date : existingOutput.date;
      const outputDeductionSnapshot =
        await this.resolveLessonOutputDeductionSnapshot(
          tx,
          nextStaffId,
          nextOutputDate,
        );
      const updatedOutput = await tx.lessonOutput.update({
        where: { id },
        data: {
          ...updateData,
          roleType: outputDeductionSnapshot.roleType,
          taxDeductionRatePercent:
            outputDeductionSnapshot.taxDeductionRatePercent,
        },
        include: this.lessonOutputInclude,
      });

      if (auditActor) {
        await this.actionHistoryService.recordUpdate(tx, {
          actor: auditActor,
          entityType: 'lesson_output',
          entityId: id,
          description: 'Cập nhật lesson output',
          beforeValue: this.mapOutput(existingOutput),
          afterValue: this.mapOutput(updatedOutput),
        });
      }

      return this.mapOutput(updatedOutput);
    });
  }

  async bulkUpdateOutputPaymentStatus(
    outputIds: string[],
    paymentStatus: PaymentStatus,
    auditActor?: ActionHistoryActor,
    actor?: JwtPayload,
  ): Promise<BulkUpdateLessonOutputPaymentStatusResultDto> {
    const access = await this.resolveLessonActorContext(actor);

    if (!this.canEditOutputPaymentStatus(access)) {
      throw new ForbiddenException(
        'Tài khoản hiện tại không có quyền cập nhật trạng thái thanh toán output.',
      );
    }

    const uniqueOutputIds = Array.from(
      new Set(
        outputIds.filter(
          (outputId): outputId is string =>
            typeof outputId === 'string' && outputId.trim().length > 0,
        ),
      ),
    );

    if (uniqueOutputIds.length === 0) {
      throw new BadRequestException('outputIds must contain at least one id.');
    }

    return this.prisma.$transaction(async (tx) => {
      const existingOutputs = await tx.lessonOutput.findMany({
        where: {
          id: {
            in: uniqueOutputIds,
          },
        },
        select: {
          id: true,
          paymentStatus: true,
        },
      });

      const existingOutputIds = new Set(
        existingOutputs.map((output) => output.id),
      );

      if (existingOutputIds.size !== uniqueOutputIds.length) {
        const missingOutputId = uniqueOutputIds.find(
          (outputId) => !existingOutputIds.has(outputId),
        );

        throw new NotFoundException(
          missingOutputId
            ? `Lesson output not found: ${missingOutputId}`
            : 'Lesson output not found',
        );
      }

      const changedOutputIds = existingOutputs
        .filter((output) => output.paymentStatus !== paymentStatus)
        .map((output) => output.id);

      if (changedOutputIds.length === 0) {
        return {
          requestedCount: uniqueOutputIds.length,
          updatedCount: 0,
        };
      }

      const beforeValueByOutputId = auditActor
        ? new Map(
            Array.from(
              (await this.getOutputSnapshots(tx, changedOutputIds)).entries(),
            ).map(([outputId, output]) => [outputId, this.mapOutput(output)]),
          )
        : new Map<string, LessonOutputResponseDto>();

      await tx.lessonOutput.updateMany({
        where: {
          id: {
            in: changedOutputIds,
          },
        },
        data: {
          paymentStatus,
        },
      });

      if (auditActor) {
        const afterOutputsById = await this.getOutputSnapshots(
          tx,
          changedOutputIds,
        );

        for (const outputId of changedOutputIds) {
          const afterOutput = afterOutputsById.get(outputId);

          await this.actionHistoryService.recordUpdate(tx, {
            actor: auditActor,
            entityType: 'lesson_output',
            entityId: outputId,
            description: 'Cập nhật trạng thái thanh toán lesson output',
            beforeValue: beforeValueByOutputId.get(outputId) ?? null,
            afterValue: afterOutput ? this.mapOutput(afterOutput) : null,
          });
        }
      }

      return {
        requestedCount: uniqueOutputIds.length,
        updatedCount: changedOutputIds.length,
      };
    });
  }

  async deleteOutput(id: string, auditActor?: ActionHistoryActor) {
    const existingOutput = await this.getOutputSnapshot(this.prisma, id);
    if (!existingOutput) {
      throw new NotFoundException('Lesson output not found');
    }

    return this.prisma.$transaction(async (tx) => {
      const deletedOutput = await tx.lessonOutput.delete({
        where: { id },
      });

      if (auditActor) {
        await this.actionHistoryService.recordDelete(tx, {
          actor: auditActor,
          entityType: 'lesson_output',
          entityId: id,
          description: 'Xóa lesson output',
          beforeValue: this.mapOutput(existingOutput),
        });
      }

      return deletedOutput;
    });
  }

  async getTaskById(
    id: string,
    actor?: JwtPayload,
  ): Promise<LessonTaskDetailResponseDto> {
    const access = await this.resolveLessonActorContext(actor);
    if (access && !access.canManage && !access.canParticipate) {
      throw new ForbiddenException(
        'Tài khoản hiện tại không có quyền xem task giáo án.',
      );
    }

    const taskRecord = await this.getTaskSnapshotForActor(
      this.prisma,
      id,
      access,
    );
    const task = taskRecord
      ? await this.hydrateTaskRecord(this.prisma, taskRecord)
      : null;

    if (!task) {
      throw new NotFoundException('Lesson task not found');
    }

    const [outputs, resources] = await this.prisma.$transaction([
      this.prisma.lessonOutput.findMany({
        where: { lessonTaskId: id },
        include: {
          staff: {
            select: {
              id: true,
              user: {
                select: {
                  first_name: true,
                  last_name: true,
                },
              },
              roles: true,
              status: true,
            },
          },
          lessonTask: {
            select: {
              id: true,
              title: true,
              status: true,
              priority: true,
            },
          },
        },
        orderBy: [
          { date: 'desc' },
          { updatedAt: 'desc' },
          { lessonName: 'asc' },
        ],
      }),
      this.prisma.lessonResource.findMany({
        where: { lessonTaskId: id },
        select: {
          id: true,
          title: true,
          resourceLink: true,
        },
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      }),
    ]);

    return this.mapTaskDetail(task, outputs, resources);
  }

  async getOutputById(
    id: string,
    actor?: JwtPayload,
  ): Promise<LessonOutputResponseDto> {
    const access = await this.resolveLessonActorContext(actor);
    const accessMode = this.requireLessonEndpointAccess(
      access,
      ['manage', 'account', 'participant'],
      'Tài khoản hiện tại không có quyền xem output giáo án.',
    );

    const output = await this.getOutputSnapshotForActor(
      this.prisma,
      id,
      accessMode === 'participant' ? access : null,
    );
    if (!output) {
      throw new NotFoundException('Lesson output not found');
    }

    return this.mapOutput(output);
  }

  async searchTaskStaffOptions(
    query: LessonTaskStaffOptionsQueryDto = {},
  ): Promise<LessonTaskStaffOptionDto[]> {
    const limit = Math.min(this.resolveLimit(query.limit, 6), 6);
    const trimmedSearch = query.search?.trim();

    const staff = await this.prisma.staffInfo.findMany({
      where: {
        roles: {
          hasSome: [...LESSON_TASK_ASSIGNABLE_ROLES],
        },
        ...(trimmedSearch
          ? {
              OR: [
                {
                  user: {
                    first_name: {
                      contains: trimmedSearch,
                      mode: 'insensitive',
                    },
                  },
                },
                {
                  user: {
                    last_name: {
                      contains: trimmedSearch,
                      mode: 'insensitive',
                    },
                  },
                },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        user: {
          select: {
            first_name: true,
            last_name: true,
          },
        },
        roles: true,
        status: true,
      },
      orderBy: [
        { status: 'asc' },
        { user: { last_name: 'asc' } },
        { user: { first_name: 'asc' } },
      ],
      take: limit,
    });

    return staff.map((item) => ({
      id: item.id,
      fullName: this.buildStaffDisplayName(item),
      roles: item.roles,
      status: item.status,
    }));
  }

  async searchTaskOptions(
    query: LessonTaskOptionsQueryDto = {},
    actor?: JwtPayload,
  ): Promise<LessonTaskOptionDto[]> {
    const limit = Math.min(this.resolveLimit(query.limit, 6), 12);
    const trimmedSearch = query.search?.trim();
    const access = await this.resolveLessonActorContext(actor);

    if (access && !access.canManage && !access.canParticipate) {
      throw new ForbiddenException(
        'Tài khoản hiện tại không có quyền tìm task giáo án.',
      );
    }

    const whereClauses: Prisma.LessonTaskWhereInput[] = [];

    if (access?.canParticipate && !access.canManage) {
      whereClauses.push(this.buildParticipantTaskWhere(access.staffId));
    }

    if (trimmedSearch) {
      whereClauses.push({
        title: {
          contains: trimmedSearch,
          mode: 'insensitive',
        },
      });
    }

    const tasks = await this.prisma.lessonTask.findMany({
      where:
        whereClauses.length === 0
          ? undefined
          : whereClauses.length === 1
            ? whereClauses[0]
            : { AND: whereClauses },
      select: {
        id: true,
        title: true,
        status: true,
        priority: true,
        dueDate: true,
      },
      orderBy: [{ updatedAt: 'desc' }, { dueDate: 'asc' }],
      take: limit,
    });

    return tasks.map((task) => ({
      id: task.id,
      title: task.title,
      status: task.status,
      priority: task.priority,
      dueDate: task.dueDate ? task.dueDate.toISOString().slice(0, 10) : null,
    }));
  }

  async searchResourceOptions(
    query: LessonResourceOptionsQueryDto = {},
  ): Promise<LessonResourceOptionDto[]> {
    const limit = Math.min(this.resolveLimit(query.limit, 6), 12);
    const trimmedSearch = query.search?.trim();
    const excludeTaskId = toTrimmedString(query.excludeTaskId);
    const whereClauses: Prisma.LessonResourceWhereInput[] = [];

    if (excludeTaskId) {
      whereClauses.push({
        OR: [
          { lessonTaskId: null },
          {
            lessonTaskId: {
              not: excludeTaskId,
            },
          },
        ],
      });
    }

    if (trimmedSearch) {
      whereClauses.push({
        OR: [
          {
            title: {
              contains: trimmedSearch,
              mode: 'insensitive',
            },
          },
          {
            resourceLink: {
              contains: trimmedSearch,
              mode: 'insensitive',
            },
          },
        ],
      });
    }

    const resources = await this.prisma.lessonResource.findMany({
      where: whereClauses.length > 0 ? { AND: whereClauses } : undefined,
      select: {
        id: true,
        title: true,
        resourceLink: true,
        tags: true,
        lessonTaskId: true,
        lessonTask: {
          select: {
            id: true,
            title: true,
          },
        },
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      take: limit,
    });

    return resources.map((resource) => this.mapResourceOption(resource));
  }

  async searchOutputStaffOptions(
    query: LessonOutputStaffOptionsQueryDto = {},
  ): Promise<LessonOutputStaffOptionDto[]> {
    const limit = Math.min(this.resolveLimit(query.limit, 6), 12);
    const trimmedSearch = query.search?.trim();

    const staff = await this.prisma.staffInfo.findMany({
      where: trimmedSearch
        ? {
            OR: [
              {
                user: {
                  first_name: {
                    contains: trimmedSearch,
                    mode: 'insensitive',
                  },
                },
              },
              {
                user: {
                  last_name: {
                    contains: trimmedSearch,
                    mode: 'insensitive',
                  },
                },
              },
            ],
            roles: {
              hasSome: [StaffRole.lesson_plan, StaffRole.lesson_plan_head],
            },
            status: StaffStatus.active,
          }
        : {
            roles: {
              hasSome: [StaffRole.lesson_plan, StaffRole.lesson_plan_head],
            },
            status: StaffStatus.active,
          },
      select: {
        id: true,
        user: {
          select: {
            first_name: true,
            last_name: true,
          },
        },
        roles: true,
        status: true,
      },
      orderBy: [
        { status: 'asc' },
        { user: { last_name: 'asc' } },
        { user: { first_name: 'asc' } },
      ],
      take: limit,
    });

    return staff.map((item) => ({
      id: item.id,
      fullName: this.buildStaffDisplayName(item),
      roles: item.roles,
      status: item.status,
    }));
  }

  private readonly lessonOutputInclude = {
    staff: {
      select: {
        id: true,
        user: {
          select: {
            first_name: true,
            last_name: true,
          },
        },
        roles: true,
        status: true,
      },
    },
    lessonTask: {
      select: {
        id: true,
        title: true,
        status: true,
        priority: true,
      },
    },
  } satisfies Prisma.LessonOutputInclude;

  private requireNonEmptyValue(
    value: string,
    field: 'title' | 'resourceLink' | 'lessonName',
  ) {
    const normalized = toTrimmedString(value);
    if (!normalized) {
      throw new BadRequestException(`${field} là bắt buộc.`);
    }

    return normalized;
  }

  private mapResource(resource: {
    id: string;
    title: string | null;
    description: string | null;
    resourceLink: string;
    lessonTaskId: string | null;
    tags: unknown;
    createdBy?: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): LessonResourceResponseDto {
    return {
      id: resource.id,
      title: resource.title,
      description: resource.description,
      resourceLink: resource.resourceLink,
      lessonTaskId: resource.lessonTaskId,
      tags: parseJsonStringArray(resource.tags),
      createdBy: resource.createdBy ?? null,
      createdAt: resource.createdAt.toISOString(),
      updatedAt: resource.updatedAt.toISOString(),
    };
  }

  private mapResourcePreview(resource: LessonResourcePreviewDto) {
    return {
      id: resource.id,
      title: resource.title,
      resourceLink: resource.resourceLink,
    } satisfies LessonResourcePreviewDto;
  }

  private mapResourceOption(resource: {
    id: string;
    title: string | null;
    resourceLink: string;
    tags: unknown;
    lessonTaskId: string | null;
    lessonTask: {
      id: string;
      title: string | null;
    } | null;
  }): LessonResourceOptionDto {
    return {
      id: resource.id,
      title: resource.title,
      resourceLink: resource.resourceLink,
      tags: parseJsonStringArray(resource.tags),
      lessonTaskId: resource.lessonTaskId,
      lessonTaskTitle: resource.lessonTask?.title ?? null,
    };
  }

  private mapTaskDetail(
    task: HydratedLessonTaskRecord,
    outputs: LessonOutputRecord[],
    resources: LessonResourcePreviewDto[],
  ): LessonTaskDetailResponseDto {
    const mappedTask = this.mapTask(task);
    const outputProgress = this.buildOutputProgress(outputs);

    return {
      ...mappedTask,
      outputs: outputs.map((output) => this.mapTaskOutputListItem(output)),
      outputProgress,
      resourcePreview: resources.map((resource) =>
        this.mapResourcePreview(resource),
      ),
      contestUploadedSummary: this.buildContestUploadedSummary(outputs),
    };
  }

  private mapTaskOutputListItem(
    output: Pick<
      LessonOutputRecord,
      'id' | 'lessonName' | 'contestUploaded' | 'date' | 'staffId' | 'status'
    > & {
      paymentStatus: PaymentStatus;
      staff: LessonOutputRecord['staff'];
    },
  ): LessonTaskOutputListItemDto {
    return {
      id: output.id,
      lessonName: output.lessonName,
      contestUploaded: output.contestUploaded,
      date: output.date.toISOString().slice(0, 10),
      staffId: output.staffId,
      staffDisplayName: this.buildStaffDisplayName(output.staff) || null,
      status: output.status,
      paymentStatus: output.paymentStatus,
    };
  }

  private mapWorkOutputItem(
    output: LessonOutputRecord,
  ): LessonWorkOutputItemDto {
    return {
      ...this.mapTaskOutputListItem(output),
      updatedAt: output.updatedAt.toISOString(),
      task: this.mapOutputTask(output.lessonTask),
      tags: parseJsonStringArray(output.tags),
      level: output.level,
      link: output.link,
      originalLink: output.originalLink,
      cost: output.cost,
    };
  }

  /** Lọc `lesson_outputs.date` (theo ngày) trong khoảng [start, end] của tháng (UTC). */
  private buildLessonOutputMonthWhere(year: number, month: number) {
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 0));
    return {
      date: {
        gte: start,
        lte: end,
      },
    } satisfies Prisma.LessonOutputWhereInput;
  }

  private resolveRecentDays(value: number | undefined, fallback: number) {
    if (!Number.isInteger(value) || (value as number) < 1) {
      return fallback;
    }

    return Math.min(value as number, MAX_LESSON_OUTPUT_STATS_DAYS);
  }

  private buildRecentLessonOutputWhere(
    staffId: string,
    days: number,
  ): Prisma.LessonOutputWhereInput {
    const end = new Date();
    end.setDate(end.getDate() + 1);
    end.setHours(0, 0, 0, 0);

    const start = new Date(end);
    start.setDate(start.getDate() - days);

    return {
      staffId,
      date: {
        gte: start,
        lt: end,
      },
    } satisfies Prisma.LessonOutputWhereInput;
  }

  /**
   * Nếu có `dateFrom` + `dateTo` hợp lệ → lọc khoảng ngày (thay lọc tháng).
   * Ngược lại, nếu có `year` + `month` → lọc theo tháng.
   */
  private buildLessonOutputTimeFilter(
    query: LessonWorkQueryDto,
  ): Prisma.LessonOutputWhereInput | undefined {
    const from = query.dateFrom?.trim();
    const to = query.dateTo?.trim();
    if (from && to) {
      const d1 = new Date(`${from}T00:00:00.000Z`);
      const d2 = new Date(`${to}T00:00:00.000Z`);
      if (
        !Number.isNaN(d1.getTime()) &&
        !Number.isNaN(d2.getTime()) &&
        d1 <= d2
      ) {
        return {
          date: {
            gte: d1,
            lte: d2,
          },
        };
      }
    }

    if (
      typeof query.year === 'number' &&
      typeof query.month === 'number' &&
      query.month >= 1 &&
      query.month <= 12
    ) {
      return this.buildLessonOutputMonthWhere(query.year, query.month);
    }

    return undefined;
  }

  private buildWorkWhere(
    query: LessonWorkQueryDto,
    access?: LessonActorContext | null,
  ): Prisma.LessonOutputWhereInput | undefined {
    const parts: Prisma.LessonOutputWhereInput[] = [];
    if (access?.canParticipate && !access.canManage) {
      parts.push(this.buildParticipantOutputWhere(access.staffId));
    }

    const timeFilter = this.buildLessonOutputTimeFilter(query);
    if (timeFilter) {
      parts.push(timeFilter);
    }

    const search = query.search?.trim();
    if (search) {
      parts.push({
        OR: [
          { lessonName: { contains: search, mode: 'insensitive' } },
          { contestUploaded: { contains: search, mode: 'insensitive' } },
        ],
      });
    }

    const tagTerms = (query.tag ?? '')
      .split(/[,;]/)
      .map((item) => item.trim())
      .filter(Boolean);
    if (tagTerms.length > 0) {
      parts.push({
        OR: tagTerms.flatMap((tag) => [
          { lessonName: { contains: tag, mode: 'insensitive' } },
          { contestUploaded: { contains: tag, mode: 'insensitive' } },
        ]),
      });
    }

    if (query.staffId) {
      parts.push({ staffId: query.staffId });
    }

    if (query.outputStatus && query.outputStatus !== 'all') {
      parts.push({
        status: query.outputStatus as LessonOutputStatus,
      });
    }

    const levelKey = query.level?.trim();
    if (levelKey && /^[0-5]$/.test(levelKey)) {
      parts.push({
        OR: [
          { level: { equals: `Level ${levelKey}`, mode: 'insensitive' } },
          { level: { equals: levelKey, mode: 'insensitive' } },
        ],
      });
    }

    if (parts.length === 0) {
      return undefined;
    }
    if (parts.length === 1) {
      return parts[0];
    }
    return { AND: parts };
  }

  private buildParticipantTaskWhere(
    staffId: string | null,
  ): Prisma.LessonTaskWhereInput {
    const resolvedStaffId = this.requireParticipantStaffIdValue(staffId);

    return {
      staffLessonTasks: {
        some: {
          staffId: resolvedStaffId,
        },
      },
    };
  }

  private buildParticipantOutputWhere(
    staffId: string | null,
  ): Prisma.LessonOutputWhereInput {
    const resolvedStaffId = this.requireParticipantStaffIdValue(staffId);

    return {
      lessonTask: {
        staffLessonTasks: {
          some: {
            staffId: resolvedStaffId,
          },
        },
      },
    };
  }

  private buildParticipantResourceWhere(
    staffId: string | null,
  ): Prisma.LessonResourceWhereInput {
    const resolvedStaffId = this.requireParticipantStaffIdValue(staffId);

    return {
      lessonTask: {
        staffLessonTasks: {
          some: {
            staffId: resolvedStaffId,
          },
        },
      },
    };
  }

  private assertResourceWriteAccess(
    resource: { createdBy?: string | null },
    access: LessonActorContext | null,
    action: string,
  ) {
    if (!access) {
      return;
    }

    if (access.canManage) {
      return;
    }

    if (access.canParticipate && resource.createdBy === access.userId) {
      return;
    }

    throw new ForbiddenException(
      `Tài khoản hiện tại không có quyền ${action}.`,
    );
  }

  private canEditOutputPaymentStatus(access: LessonActorContext | null) {
    if (!access) {
      return true;
    }

    return (
      access.roleType === UserRole.admin ||
      access.staffRoles.includes(StaffRole.admin) ||
      access.staffRoles.includes(StaffRole.assistant) ||
      access.staffRoles.includes(StaffRole.accountant_expense)
    );
  }

  private mapOutput(output: LessonOutputRecord): LessonOutputResponseDto {
    return {
      id: output.id,
      lessonTaskId: output.lessonTaskId,
      lessonName: output.lessonName,
      originalTitle: output.originalTitle,
      source: output.source,
      originalLink: output.originalLink,
      level: output.level,
      difficultyBand: output.difficultyBand ?? null,
      includesTest: Boolean(output.includesTest),
      includesSolution: Boolean(output.includesSolution),
      includesLectureVideo: Boolean(output.includesLectureVideo),
      tags: parseJsonStringArray(output.tags),
      cost: output.cost,
      paymentStatus: output.paymentStatus,
      date: output.date.toISOString().slice(0, 10),
      contestUploaded: output.contestUploaded,
      link: output.link,
      staffId: output.staffId,
      staff: this.mapOutputStaff(output.staff),
      status: output.status,
      task: this.mapOutputTask(output.lessonTask),
      createdAt: output.createdAt.toISOString(),
      updatedAt: output.updatedAt.toISOString(),
    };
  }

  private mapOutputStaff(
    staff: LessonOutputRecord['staff'],
  ): LessonOutputStaffDto | null {
    if (!staff) {
      return null;
    }

    return {
      id: staff.id,
      fullName: this.buildStaffDisplayName(staff),
      roles: staff.roles,
      status: staff.status,
    };
  }

  private mapOutputTask(
    task: LessonOutputRecord['lessonTask'],
  ): LessonOutputTaskSummaryDto | null {
    if (!task) {
      return null;
    }

    return {
      id: task.id,
      title: task.title,
      status: task.status,
      priority: task.priority,
    };
  }

  private buildContestUploadedSummary(
    outputs: Array<{
      contestUploaded: string | null;
    }>,
  ) {
    return Array.from(
      new Set(
        outputs
          .map((output) => toTrimmedString(output.contestUploaded))
          .filter((value): value is string => value !== null),
      ),
    );
  }

  private buildOutputProgress(
    outputs: Array<{
      status: LessonOutputStatus;
    }>,
  ): LessonTaskOutputProgressDto {
    return outputs.reduce(
      (summary, output) => {
        summary.total += 1;
        if (output.status === LessonOutputStatus.completed) {
          summary.completed += 1;
        }

        return summary;
      },
      {
        total: 0,
        completed: 0,
      } satisfies LessonTaskOutputProgressDto,
    );
  }

  private resolvePage(value: number | undefined) {
    if (!Number.isInteger(value) || (value as number) < 1) {
      return 1;
    }

    return value as number;
  }

  private resolveLimit(value: number | undefined, fallback: number) {
    if (!Number.isInteger(value) || (value as number) < 1) {
      return fallback;
    }

    return Math.min(value as number, 100);
  }

  private buildListMeta(total: number, requestedPage: number, limit: number) {
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const page = Math.min(requestedPage, totalPages);

    return {
      total,
      page,
      limit,
      totalPages,
    };
  }

  private requireDateOnly(value: string, field: 'date') {
    const normalized = toDateOnlyOrNull(value);
    if (!normalized) {
      throw new BadRequestException(`${field} không hợp lệ.`);
    }

    return normalized;
  }

  private mapTask(task: {
    id: string;
    title: string | null;
    description: string | null;
    status: LessonTaskStatus;
    priority: LessonTaskPriority;
    dueDate: Date | null;
    createdByStaff: LessonTaskCreatorDto | null;
    assignees: LessonTaskAssigneeDto[];
    outputAssignees: LessonTaskAssigneeDto[];
  }): LessonTaskResponseDto {
    return {
      id: task.id,
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      dueDate: task.dueDate ? task.dueDate.toISOString().slice(0, 10) : null,
      createdByStaff: task.createdByStaff
        ? {
            id: task.createdByStaff.id,
            fullName: task.createdByStaff.fullName,
            roles: task.createdByStaff.roles,
            status: task.createdByStaff.status,
          }
        : null,
      assignees: task.assignees.map((assignee) => ({
        id: assignee.id,
        fullName: assignee.fullName,
        roles: assignee.roles,
        status: assignee.status,
      })),
      outputAssignees: task.outputAssignees.map((assignee) => ({
        id: assignee.id,
        fullName: assignee.fullName,
        roles: assignee.roles,
        status: assignee.status,
      })),
    };
  }

  private mapTaskFromSnapshot(task: HydratedLessonTaskRecord | null) {
    if (!task) {
      throw new NotFoundException('Lesson task not found');
    }

    return this.mapTask(task);
  }

  private async resolveLessonActorContext(
    actor?: JwtPayload,
  ): Promise<LessonActorContext | null> {
    if (!actor?.id) {
      return null;
    }

    if (actor.roleType === UserRole.admin) {
      return {
        userId: actor.id,
        roleType: actor.roleType,
        staffId: null,
        staffRoles: [StaffRole.admin],
        canManage: true,
        canParticipate: true,
        canAccountWork: false,
      };
    }

    const staff = await this.prisma.staffInfo.findUnique({
      where: { userId: actor.id },
      select: {
        id: true,
        roles: true,
      },
    });

    if (!staff) {
      return {
        userId: actor.id,
        roleType: actor.roleType,
        staffId: null,
        staffRoles: [],
        canManage: false,
        canParticipate: false,
        canAccountWork: false,
      };
    }

    const canManage =
      staff.roles.includes(StaffRole.admin) ||
      staff.roles.includes(StaffRole.assistant) ||
      staff.roles.includes(StaffRole.lesson_plan_head);
    const canParticipate =
      canManage || staff.roles.includes(StaffRole.lesson_plan);
    const canAccountWork = staff.roles.includes(StaffRole.accountant_expense);

    return {
      userId: actor.id,
      roleType: actor.roleType,
      staffId: staff.id,
      staffRoles: staff.roles,
      canManage,
      canParticipate,
      canAccountWork,
    };
  }

  private requireLessonEndpointAccess(
    access: LessonActorContext | null,
    orderedModes: LessonEndpointAccessMode[],
    forbiddenMessage: string,
  ): LessonEndpointAccessMode | null {
    if (!access) {
      return null;
    }

    for (const mode of orderedModes) {
      if (mode === 'manage' && access.canManage) {
        return mode;
      }

      if (mode === 'account' && access.canAccountWork) {
        return mode;
      }

      if (mode === 'participant' && access.canParticipate) {
        return mode;
      }
    }

    throw new ForbiddenException(forbiddenMessage);
  }

  private requireParticipantStaffId(
    access: Pick<LessonActorContext, 'staffId' | 'canParticipate'>,
  ) {
    if (!access.canParticipate) {
      throw new ForbiddenException(
        'Tài khoản giáo án hiện tại chưa có hồ sơ nhân sự hợp lệ.',
      );
    }

    return this.requireParticipantStaffIdValue(access.staffId);
  }

  private requireParticipantStaffIdValue(staffId: string | null) {
    if (!staffId) {
      throw new ForbiddenException(
        'Tài khoản giáo án hiện tại chưa có hồ sơ nhân sự hợp lệ.',
      );
    }

    return staffId;
  }

  private async assertParticipantTaskAccess(
    db: Prisma.TransactionClient | PrismaService,
    lessonTaskId: string,
    access: LessonActorContext,
  ) {
    const task = await db.lessonTask.findFirst({
      where: {
        id: lessonTaskId,
        ...this.buildParticipantTaskWhere(access.staffId),
      },
      select: {
        id: true,
      },
    });

    if (!task) {
      throw new ForbiddenException(
        'Bạn chỉ được thao tác trên các task giáo án đang tham gia.',
      );
    }

    return task.id;
  }

  private async resolveCreatedByStaffId(
    db: Prisma.TransactionClient | PrismaService,
    staffId: string | null | undefined,
  ) {
    if (staffId == null) {
      return null;
    }

    const normalizedStaffId = String(staffId).trim();
    if (!normalizedStaffId) {
      return null;
    }

    const staff = await db.staffInfo.findFirst({
      where: {
        id: normalizedStaffId,
        roles: {
          hasSome: [...LESSON_TASK_ASSIGNABLE_ROLES],
        },
        status: StaffStatus.active,
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (!staff) {
      throw new BadRequestException(
        'Chỉ được gán nhân sự thực hiện có role giáo án hoặc trưởng giáo án.',
      );
    }

    return staff.id;
  }

  private async resolveTaskAssigneeStaffIds(
    db: Prisma.TransactionClient | PrismaService,
    staffIds: string[] | null | undefined,
  ) {
    if (!Array.isArray(staffIds) || staffIds.length === 0) {
      return [];
    }

    const normalizedStaffIds = Array.from(
      new Set(
        staffIds
          .map((staffId) => toTrimmedString(staffId))
          .filter((staffId): staffId is string => staffId !== null),
      ),
    );

    if (normalizedStaffIds.length === 0) {
      return [];
    }

    const assignableStaff = await db.staffInfo.findMany({
      where: {
        id: {
          in: normalizedStaffIds,
        },
        roles: {
          hasSome: [...LESSON_TASK_ASSIGNABLE_ROLES],
        },
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (assignableStaff.length !== normalizedStaffIds.length) {
      throw new BadRequestException(
        'Chỉ được gán nhân sự thực hiện có role giáo án hoặc trưởng giáo án.',
      );
    }

    const assignableStaffIdSet = new Set(
      assignableStaff.map((staff) => staff.id),
    );

    for (const staff of assignableStaff) {
      assertStaffCanReceiveAssignment(staff.status);
    }

    return normalizedStaffIds.filter((staffId) =>
      assignableStaffIdSet.has(staffId),
    );
  }

  private async hydrateTaskRecords(
    db: Prisma.TransactionClient | PrismaService,
    tasks: LessonTaskRecord[],
  ) {
    const taskIds = tasks.map((task) => task.id);
    const creatorIds = tasks
      .map((task) => task.createdBy)
      .filter((value): value is string => typeof value === 'string');
    const [assigneeMap, outputAssigneeMap, creatorMap] = await Promise.all([
      this.getTaskAssigneeMap(db, taskIds),
      this.getTaskOutputAssigneeMapFromOutputs(db, taskIds),
      this.getTaskCreatorMap(db, creatorIds),
    ]);

    return tasks.map((task) => ({
      ...task,
      createdByStaff: task.createdBy
        ? (creatorMap.get(task.createdBy) ?? null)
        : null,
      assignees: this.mergeTaskAssignees(
        task.createdBy ? creatorMap.get(task.createdBy) : null,
        assigneeMap.get(task.id),
        outputAssigneeMap.get(task.id),
      ),
      outputAssignees: outputAssigneeMap.get(task.id) ?? [],
    }));
  }

  private async hydrateTaskRecord(
    db: Prisma.TransactionClient | PrismaService,
    task: LessonTaskRecord,
  ): Promise<HydratedLessonTaskRecord> {
    const [assigneeMap, outputAssigneeMap, creatorMap] = await Promise.all([
      this.getTaskAssigneeMap(db, [task.id]),
      this.getTaskOutputAssigneeMapFromOutputs(db, [task.id]),
      this.getTaskCreatorMap(db, task.createdBy ? [task.createdBy] : []),
    ]);

    return {
      ...task,
      createdByStaff: task.createdBy
        ? (creatorMap.get(task.createdBy) ?? null)
        : null,
      assignees: this.mergeTaskAssignees(
        task.createdBy ? creatorMap.get(task.createdBy) : null,
        assigneeMap.get(task.id),
        outputAssigneeMap.get(task.id),
      ),
      outputAssignees: outputAssigneeMap.get(task.id) ?? [],
    };
  }

  private async getTaskAssigneeMap(
    db: Prisma.TransactionClient | PrismaService,
    taskIds: string[],
  ) {
    const uniqueTaskIds = Array.from(
      new Set(
        taskIds.filter(
          (taskId): taskId is string =>
            typeof taskId === 'string' && taskId.trim().length > 0,
        ),
      ),
    );

    if (uniqueTaskIds.length === 0) {
      return new Map<string, LessonTaskAssigneeDto[]>();
    }

    const taskAssignments = await db.staffLessonTask.findMany({
      where: {
        lessonTaskId: {
          in: uniqueTaskIds,
        },
      },
      select: {
        lessonTaskId: true,
        staff: {
          select: {
            id: true,
            user: {
              select: {
                first_name: true,
                last_name: true,
              },
            },
            roles: true,
            status: true,
          },
        },
      },
    });

    const assigneeMap = new Map<string, LessonTaskAssigneeDto[]>(
      uniqueTaskIds.map((taskId) => [taskId, []]),
    );

    for (const assignment of taskAssignments) {
      if (!assignment.lessonTaskId || !assignment.staff) {
        continue;
      }

      assigneeMap.get(assignment.lessonTaskId)?.push({
        id: assignment.staff.id,
        fullName: this.buildStaffDisplayName(assignment.staff),
        roles: assignment.staff.roles,
        status: assignment.staff.status,
      });
    }

    for (const [taskId, assignees] of assigneeMap.entries()) {
      assigneeMap.set(taskId, this.sortTaskAssignees(assignees));
    }

    return assigneeMap;
  }

  private async getTaskOutputAssigneeMapFromOutputs(
    db: Prisma.TransactionClient | PrismaService,
    taskIds: string[],
  ) {
    const uniqueTaskIds = Array.from(
      new Set(
        taskIds.filter(
          (taskId): taskId is string =>
            typeof taskId === 'string' && taskId.trim().length > 0,
        ),
      ),
    );

    if (uniqueTaskIds.length === 0) {
      return new Map<string, LessonTaskAssigneeDto[]>();
    }

    const outputAssignments = await db.lessonOutput.findMany({
      where: {
        lessonTaskId: {
          in: uniqueTaskIds,
        },
        staffId: {
          not: null,
        },
      },
      select: {
        lessonTaskId: true,
        staffId: true,
        staff: {
          select: {
            id: true,
            user: {
              select: {
                first_name: true,
                last_name: true,
              },
            },
            roles: true,
            status: true,
          },
        },
      },
      distinct: ['lessonTaskId', 'staffId'],
    });

    const assigneeMap = new Map<string, LessonTaskAssigneeDto[]>(
      uniqueTaskIds.map((taskId) => [taskId, []]),
    );

    for (const assignment of outputAssignments) {
      if (!assignment.lessonTaskId || !assignment.staff) {
        continue;
      }

      assigneeMap.get(assignment.lessonTaskId)?.push({
        id: assignment.staff.id,
        fullName: this.buildStaffDisplayName(assignment.staff),
        roles: assignment.staff.roles,
        status: assignment.staff.status,
      });
    }

    for (const [taskId, assignees] of assigneeMap.entries()) {
      assigneeMap.set(taskId, this.sortTaskAssignees(assignees));
    }

    return assigneeMap;
  }

  private sortTaskAssignees(assignees: LessonTaskAssigneeDto[]) {
    return assignees.toSorted((left, right) => {
      if (left.status !== right.status) {
        return left.status.localeCompare(right.status);
      }

      return left.fullName.localeCompare(right.fullName, 'vi');
    });
  }

  private mergeTaskAssignees(
    ...groups: Array<
      | LessonTaskAssigneeDto
      | LessonTaskCreatorDto
      | Array<LessonTaskAssigneeDto | LessonTaskCreatorDto>
      | null
      | undefined
    >
  ) {
    const assigneeMap = new Map<string, LessonTaskAssigneeDto>();

    for (const group of groups) {
      const staffs = Array.isArray(group) ? group : group ? [group] : [];

      for (const staff of staffs) {
        if (!staff?.id || assigneeMap.has(staff.id)) {
          continue;
        }

        assigneeMap.set(staff.id, {
          id: staff.id,
          fullName: staff.fullName,
          roles: staff.roles,
          status: staff.status,
        });
      }
    }

    return this.sortTaskAssignees([...assigneeMap.values()]);
  }

  private mergeStaffIds(...groups: Array<Array<string | null | undefined>>) {
    return Array.from(
      new Set(
        groups
          .flat()
          .map((staffId) => toTrimmedString(staffId))
          .filter((staffId): staffId is string => staffId !== null),
      ),
    );
  }

  private async getTaskCreatorMap(
    db: Prisma.TransactionClient | PrismaService,
    creatorIds: string[],
  ) {
    const uniqueCreatorIds = Array.from(new Set(creatorIds));
    if (uniqueCreatorIds.length === 0) {
      return new Map<string, LessonTaskCreatorDto>();
    }

    const creators = await db.staffInfo.findMany({
      where: {
        id: {
          in: uniqueCreatorIds,
        },
      },
      select: {
        id: true,
        user: {
          select: {
            first_name: true,
            last_name: true,
          },
        },
        roles: true,
        status: true,
      },
    });

    return new Map<string, LessonTaskCreatorDto>(
      creators.map((creator) => [
        creator.id,
        {
          id: creator.id,
          fullName: this.buildStaffDisplayName(creator),
          roles: creator.roles,
          status: creator.status,
        },
      ]),
    );
  }

  private getTaskSnapshot(
    db: Prisma.TransactionClient | PrismaService,
    id: string,
  ) {
    return db.lessonTask.findUnique({
      where: { id },
    });
  }

  private getTaskSnapshotForActor(
    db: Prisma.TransactionClient | PrismaService,
    id: string,
    access?: LessonActorContext | null,
  ) {
    if (access?.canParticipate && !access.canManage) {
      return db.lessonTask.findFirst({
        where: {
          id,
          ...this.buildParticipantTaskWhere(access.staffId),
        },
      });
    }

    return this.getTaskSnapshot(db, id);
  }

  private getOutputSnapshot(
    db: Prisma.TransactionClient | PrismaService,
    id: string,
  ) {
    return db.lessonOutput.findUnique({
      where: { id },
      include: this.lessonOutputInclude,
    });
  }

  private getOutputSnapshotForActor(
    db: Prisma.TransactionClient | PrismaService,
    id: string,
    access?: LessonActorContext | null,
  ) {
    if (access?.canParticipate && !access.canManage) {
      return db.lessonOutput.findFirst({
        where: {
          id,
          ...this.buildParticipantOutputWhere(access.staffId),
        },
        include: this.lessonOutputInclude,
      });
    }

    return this.getOutputSnapshot(db, id);
  }

  private async getOutputSnapshots(
    db: Prisma.TransactionClient | PrismaService,
    outputIds: string[],
  ): Promise<Map<string, LessonOutputRecord>> {
    const uniqueOutputIds = Array.from(
      new Set(
        outputIds.filter(
          (outputId): outputId is string =>
            typeof outputId === 'string' && outputId.trim().length > 0,
        ),
      ),
    );

    if (uniqueOutputIds.length === 0) {
      return new Map();
    }

    const outputs = await db.lessonOutput.findMany({
      where: {
        id: {
          in: uniqueOutputIds,
        },
      },
      include: this.lessonOutputInclude,
    });

    return new Map(
      outputs.map((output) => [output.id, output as LessonOutputRecord]),
    );
  }

  private async resolveOptionalLessonTaskId(
    db: Prisma.TransactionClient | PrismaService,
    lessonTaskId: string | null | undefined,
  ): Promise<string | null> {
    const normalizedTaskId = toTrimmedString(lessonTaskId);
    if (!normalizedTaskId) {
      return null;
    }

    const task = await db.lessonTask.findUnique({
      where: { id: normalizedTaskId },
      select: { id: true },
    });

    if (!task) {
      throw new BadRequestException('Lesson task không tồn tại.');
    }

    return task.id;
  }

  private async resolveLessonOutputStaffId(
    db: Prisma.TransactionClient | PrismaService,
    staffId: string | null | undefined,
  ) {
    const normalizedStaffId = toTrimmedString(staffId);
    if (!normalizedStaffId) {
      return null;
    }

    const staff = await db.staffInfo.findUnique({
      where: { id: normalizedStaffId },
      select: { id: true, status: true },
    });

    if (!staff) {
      throw new BadRequestException('Nhân sự của lesson output không tồn tại.');
    }

    assertStaffCanReceiveAssignment(staff.status);

    return staff.id;
  }

  private async syncTaskAssignees(
    db: Prisma.TransactionClient | PrismaService,
    lessonTaskId: string,
    staffIds: string[],
  ) {
    const normalizedTaskId = toTrimmedString(lessonTaskId);
    if (!normalizedTaskId) {
      return;
    }

    const normalizedStaffIds = Array.from(
      new Set(
        staffIds.filter(
          (staffId): staffId is string =>
            typeof staffId === 'string' && staffId.trim().length > 0,
        ),
      ),
    );

    const currentAssignments = await db.staffLessonTask.findMany({
      where: {
        lessonTaskId: normalizedTaskId,
      },
      select: { lessonTaskId: true, staffId: true },
    });

    const currentKeySet = new Set(
      currentAssignments.map(
        (assignment) => `${assignment.lessonTaskId}:${assignment.staffId}`,
      ),
    );
    const nextKeySet = new Set(
      normalizedStaffIds.map((staffId) => `${normalizedTaskId}:${staffId}`),
    );

    const assignmentsToDelete = currentAssignments.filter(
      (assignment) =>
        !nextKeySet.has(`${assignment.lessonTaskId}:${assignment.staffId}`),
    );
    const assignmentsToCreate = normalizedStaffIds.filter(
      (staffId) => !currentKeySet.has(`${normalizedTaskId}:${staffId}`),
    );

    if (assignmentsToDelete.length > 0) {
      await db.staffLessonTask.deleteMany({
        where: {
          OR: assignmentsToDelete.map((assignment) => ({
            lessonTaskId: assignment.lessonTaskId,
            staffId: assignment.staffId,
          })),
        },
      });
    }

    if (assignmentsToCreate.length > 0) {
      await db.staffLessonTask.createMany({
        data: assignmentsToCreate.map((staffId) => ({
          lessonTaskId: normalizedTaskId,
          staffId,
        })),
      });
    }
  }
}
