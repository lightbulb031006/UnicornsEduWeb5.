import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from 'generated/client';
import {
  NotificationStatus,
  StaffRole,
  StaffStatus,
  UserRole,
  UserStatus,
} from 'generated/enums';
import {
  ActionHistoryActor,
  ActionHistoryService,
} from 'src/action-history/action-history.service';
import { JwtPayload } from 'src/auth/decorators/current-user.decorator';
import {
  CreateNotificationDto,
  type DeleteNotificationResponseDto,
  type GetAdminNotificationsQueryDto,
  type GetNotificationFeedQueryDto,
  type GetNotificationRecipientOptionsQueryDto,
  type NotificationAdminItemDto,
  type NotificationAuthorDto,
  type NotificationFeedItemDto,
  type NotificationFeedMarkReadResponseDto,
  type NotificationPushEventDto,
  type NotificationRecipientOptionDto,
  type NotificationTargetRoleTypeDto,
  PushNotificationDto,
  UpdateNotificationDto,
} from 'src/dtos/notification.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { NotificationGateway } from './notification.gateway';

const NOTIFICATION_RECORD_INCLUDE = {
  createdBy: {
    select: {
      id: true,
      email: true,
      accountHandle: true,
      first_name: true,
      last_name: true,
    },
  },
} satisfies Prisma.NotificationInclude;

const NOTIFICATION_RECIPIENT_SELECT = {
  id: true,
  email: true,
  accountHandle: true,
  first_name: true,
  last_name: true,
  roleType: true,
  status: true,
  staffInfo: {
    select: {
      status: true,
      roles: true,
    },
  },
} satisfies Prisma.UserSelect;

type NotificationAuditClient = Prisma.TransactionClient | PrismaService;
type NotificationRecord = Prisma.NotificationGetPayload<{
  include: typeof NOTIFICATION_RECORD_INCLUDE;
}>;
type NotificationRecipientRecord = Prisma.UserGetPayload<{
  select: typeof NOTIFICATION_RECIPIENT_SELECT;
}>;

interface NotificationAudienceContext {
  userId: string;
  roleType: NotificationTargetRoleTypeDto;
  staffRoles: StaffRole[];
}

interface NotificationTargetingState {
  targetAll: boolean;
  targetRoleTypes: NotificationTargetRoleTypeDto[];
  targetStaffRoles: StaffRole[];
  targetUserIds: string[];
}

@Injectable()
export class NotificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly actionHistoryService: ActionHistoryService,
    private readonly notificationGateway: NotificationGateway,
  ) {}

  async getAdminNotifications(
    query: GetAdminNotificationsQueryDto,
  ): Promise<NotificationAdminItemDto[]> {
    const limit =
      typeof query.limit === 'number'
        ? Math.min(Math.max(query.limit, 1), 300)
        : 200;
    const where: Prisma.NotificationWhereInput = query.status
      ? { status: query.status }
      : {};

    const notifications = await this.prisma.notification.findMany({
      where,
      take: limit,
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      include: NOTIFICATION_RECORD_INCLUDE,
    });

    return this.mapNotificationAdminItems(notifications);
  }

  async searchNotificationRecipientOptions(
    query: GetNotificationRecipientOptionsQueryDto,
  ): Promise<NotificationRecipientOptionDto[]> {
    const search = query.search?.trim() ?? '';
    if (search.length < 2) {
      return [];
    }

    const limit =
      typeof query.limit === 'number'
        ? Math.min(Math.max(query.limit, 1), 50)
        : 20;

    const recipients = await this.prisma.user.findMany({
      where: {
        AND: [
          this.buildEligibleRecipientWhere(),
          this.buildRecipientSearchWhere(search),
        ],
      },
      take: limit,
      orderBy: [
        { first_name: 'asc' },
        { last_name: 'asc' },
        { accountHandle: 'asc' },
      ],
      select: NOTIFICATION_RECIPIENT_SELECT,
    });

    return recipients.map((recipient) => this.mapRecipientOption(recipient));
  }

  async createNotificationDraft(
    data: CreateNotificationDto,
    actor: ActionHistoryActor & { userId: string },
  ): Promise<NotificationAdminItemDto> {
    const title = this.normalizeRequiredText(data.title, 'title');
    const message = this.normalizeRequiredMessage(data.message);
    const targeting = await this.normalizeTargetingInput(data);

    const createdNotification = await this.prisma.$transaction(async (tx) => {
      const nextNotification = await tx.notification.create({
        data: {
          title,
          message,
          createdByUserId: actor.userId,
          ...targeting,
        },
        include: NOTIFICATION_RECORD_INCLUDE,
      });

      await this.actionHistoryService.recordCreate(tx, {
        actor,
        entityType: 'notification',
        entityId: nextNotification.id,
        description: 'Tạo thông báo nháp',
        afterValue: nextNotification,
      });

      return nextNotification;
    });

    return this.mapNotificationAdminItem(createdNotification);
  }

  async updateNotificationDraft(
    id: string,
    data: UpdateNotificationDto,
    actor: ActionHistoryActor,
  ): Promise<NotificationAdminItemDto> {
    const existingNotification = await this.getNotificationRecord(
      this.prisma,
      id,
    );

    if (!existingNotification) {
      throw new NotFoundException('Notification not found');
    }

    if (existingNotification.status !== NotificationStatus.draft) {
      throw new BadRequestException(
        'Published notifications must use the push endpoint to apply changes.',
      );
    }

    const updateData = await this.buildUpdateData(existingNotification, data);

    if (Object.keys(updateData).length === 0) {
      return this.mapNotificationAdminItem(existingNotification);
    }

    const updatedNotification = await this.prisma.$transaction(async (tx) => {
      const nextNotification = await tx.notification.update({
        where: { id },
        data: updateData,
        include: NOTIFICATION_RECORD_INCLUDE,
      });

      await this.actionHistoryService.recordUpdate(tx, {
        actor,
        entityType: 'notification',
        entityId: id,
        description: 'Cập nhật thông báo nháp',
        beforeValue: existingNotification,
        afterValue: nextNotification,
      });

      return nextNotification;
    });

    return this.mapNotificationAdminItem(updatedNotification);
  }

  async pushNotification(
    id: string,
    data: PushNotificationDto,
    actor: ActionHistoryActor,
  ): Promise<NotificationAdminItemDto> {
    const existingNotification = await this.getNotificationRecord(
      this.prisma,
      id,
    );

    if (!existingNotification) {
      throw new NotFoundException('Notification not found');
    }

    const updateData = await this.buildUpdateData(existingNotification, data);
    const isFirstPublish =
      existingNotification.status === NotificationStatus.draft;
    const lastPushedAt = new Date();

    const updatedNotification = await this.prisma.$transaction(async (tx) => {
      const nextNotification = await tx.notification.update({
        where: { id },
        data: {
          ...updateData,
          status: NotificationStatus.published,
          version: isFirstPublish ? 1 : existingNotification.version + 1,
          pushCount: existingNotification.pushCount + 1,
          lastPushedAt,
        },
        include: NOTIFICATION_RECORD_INCLUDE,
      });

      await this.actionHistoryService.recordUpdate(tx, {
        actor,
        entityType: 'notification',
        entityId: id,
        description: isFirstPublish
          ? 'Phát thông báo'
          : 'Điều chỉnh và phát lại thông báo',
        beforeValue: existingNotification,
        afterValue: nextNotification,
      });

      return nextNotification;
    });

    this.notificationGateway.emitNotificationPushed(
      this.mapNotificationPushEvent(updatedNotification, isFirstPublish),
      this.extractTargetingState(updatedNotification),
    );

    return this.mapNotificationAdminItem(updatedNotification);
  }

  async deleteNotification(
    id: string,
    actor: ActionHistoryActor,
  ): Promise<DeleteNotificationResponseDto> {
    const existingNotification = await this.getNotificationRecord(
      this.prisma,
      id,
    );

    if (!existingNotification) {
      throw new NotFoundException('Notification not found');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.notification.delete({
        where: { id },
      });

      await this.actionHistoryService.recordDelete(tx, {
        actor,
        entityType: 'notification',
        entityId: id,
        description:
          existingNotification.status === NotificationStatus.draft
            ? 'Xóa thông báo nháp'
            : 'Xóa thông báo đã phát',
        beforeValue: existingNotification,
      });
    });

    return { id };
  }

  async getNotificationFeed(
    actor: JwtPayload,
    query: GetNotificationFeedQueryDto,
  ): Promise<NotificationFeedItemDto[]> {
    const audience = await this.resolveAudienceContext(actor);
    const limit =
      typeof query.limit === 'number'
        ? Math.min(Math.max(query.limit, 1), 200)
        : 100;

    const notifications = await this.prisma.notification.findMany({
      where: this.buildFeedWhereInput(audience),
      take: limit,
      orderBy: [{ lastPushedAt: 'desc' }, { updatedAt: 'desc' }],
      include: NOTIFICATION_RECORD_INCLUDE,
    });

    const ids = notifications.map((notification) => notification.id);
    let readIds = new Set<string>();
    if (ids.length > 0) {
      const rows = await this.prisma.$queryRaw<
        Array<{ notification_id: string }>
      >(
        Prisma.sql`
          SELECT notification_id
          FROM notification_reads
          WHERE user_id = ${actor.id}
            AND notification_id IN (${Prisma.join(ids)})
        `,
      );
      readIds = new Set(rows.map((row) => row.notification_id));
    }

    return notifications.map((notification) =>
      this.mapNotificationFeedItem(notification, readIds.has(notification.id)),
    );
  }

  async markFeedNotificationRead(
    actor: JwtPayload,
    notificationId: string,
  ): Promise<NotificationFeedMarkReadResponseDto> {
    const audience = await this.resolveAudienceContext(actor);
    const published = await this.prisma.notification.findFirst({
      where: {
        id: notificationId,
        ...this.buildFeedWhereInput(audience),
      },
      select: { id: true },
    });

    if (!published) {
      throw new NotFoundException('Published notification not found');
    }

    await this.prisma.$executeRaw`
      INSERT INTO notification_reads (id, user_id, notification_id, read_at)
      VALUES (${randomUUID()}, ${actor.id}, ${notificationId}, NOW())
      ON CONFLICT (user_id, notification_id) DO NOTHING
    `;

    return { id: notificationId, readStatus: 'read' };
  }

  private buildEligibleRecipientWhere(): Prisma.UserWhereInput {
    return {
      OR: [
        {
          roleType: UserRole.admin,
          status: UserStatus.active,
        },
        {
          roleType: UserRole.staff,
          status: UserStatus.active,
          staffInfo: {
            is: {
              status: StaffStatus.active,
            },
          },
        },
      ],
    };
  }

  private buildRecipientSearchWhere(search: string): Prisma.UserWhereInput {
    const terms = search
      .split(/\s+/)
      .map((term) => term.trim())
      .filter(Boolean);

    return {
      AND: terms.map((term) => ({
        OR: [
          { first_name: { contains: term, mode: 'insensitive' } },
          { last_name: { contains: term, mode: 'insensitive' } },
          { email: { contains: term, mode: 'insensitive' } },
          { accountHandle: { contains: term, mode: 'insensitive' } },
        ],
      })),
    };
  }

  private async resolveAudienceContext(
    actor: JwtPayload,
  ): Promise<NotificationAudienceContext> {
    if (actor.roleType === UserRole.admin) {
      return {
        userId: actor.id,
        roleType: UserRole.admin,
        staffRoles: [],
      };
    }

    if (actor.roleType === UserRole.staff) {
      const staff = await this.prisma.staffInfo.findUnique({
        where: { userId: actor.id },
        select: {
          id: true,
          status: true,
          roles: true,
        },
      });

      if (!staff || staff.status !== StaffStatus.active) {
        throw new ForbiddenException('Staff profile is not available');
      }

      return {
        userId: actor.id,
        roleType: UserRole.staff,
        staffRoles: staff.roles ?? [],
      };
    }

    throw new ForbiddenException(
      'Notification feed is not available for this role',
    );
  }

  private buildFeedWhereInput(
    audience: NotificationAudienceContext,
  ): Prisma.NotificationWhereInput {
    const orFilters: Prisma.NotificationWhereInput[] = [
      { targetAll: true },
      { targetUserIds: { has: audience.userId } },
      { targetRoleTypes: { has: audience.roleType } },
    ];

    if (
      audience.roleType === UserRole.staff &&
      audience.staffRoles.length > 0
    ) {
      orFilters.push({
        targetStaffRoles: { hasSome: audience.staffRoles },
      });
    }

    return {
      status: NotificationStatus.published,
      lastPushedAt: { not: null },
      OR: orFilters,
    };
  }

  private async buildUpdateData(
    existingNotification: NotificationRecord,
    data: UpdateNotificationDto | PushNotificationDto,
  ): Promise<Prisma.NotificationUpdateInput> {
    const updateData: Prisma.NotificationUpdateInput = {};

    if (data.title !== undefined) {
      updateData.title = this.normalizeRequiredText(data.title, 'title');
    }

    if (data.message !== undefined) {
      updateData.message = this.normalizeRequiredMessage(data.message);
    }

    if (this.hasTargetingInput(data)) {
      const targeting = await this.normalizeTargetingInput(
        data,
        this.extractTargetingState(existingNotification),
      );
      updateData.targetAll = targeting.targetAll;
      updateData.targetRoleTypes = targeting.targetRoleTypes;
      updateData.targetStaffRoles = targeting.targetStaffRoles;
      updateData.targetUserIds = targeting.targetUserIds;
    }

    return updateData;
  }

  private hasTargetingInput(data: UpdateNotificationDto | PushNotificationDto) {
    return (
      data.targetAll !== undefined ||
      data.targetRoleTypes !== undefined ||
      data.targetStaffRoles !== undefined ||
      data.targetUserIds !== undefined
    );
  }

  private async normalizeTargetingInput(
    data: {
      targetAll?: boolean;
      targetRoleTypes?: NotificationTargetRoleTypeDto[];
      targetStaffRoles?: StaffRole[];
      targetUserIds?: string[];
    },
    current?: NotificationTargetingState,
  ): Promise<NotificationTargetingState> {
    const targetAll = data.targetAll ?? current?.targetAll ?? true;
    const targetRoleTypes =
      data.targetRoleTypes !== undefined
        ? Array.from(new Set(data.targetRoleTypes))
        : [...(current?.targetRoleTypes ?? [])];
    const targetStaffRoles =
      data.targetStaffRoles !== undefined
        ? Array.from(new Set(data.targetStaffRoles))
        : [...(current?.targetStaffRoles ?? [])];
    const targetUserIds =
      data.targetUserIds !== undefined
        ? Array.from(new Set(data.targetUserIds))
        : [...(current?.targetUserIds ?? [])];

    if (targetAll) {
      return {
        targetAll: true,
        targetRoleTypes: [],
        targetStaffRoles: [],
        targetUserIds: [],
      };
    }

    if (
      targetRoleTypes.length === 0 &&
      targetStaffRoles.length === 0 &&
      targetUserIds.length === 0
    ) {
      throw new BadRequestException(
        'Notification audience must include at least one target when targetAll is false.',
      );
    }

    if (targetUserIds.length > 0) {
      const eligibleRecipients = await this.loadRecipientOptionsByIds(
        targetUserIds,
        true,
      );
      if (eligibleRecipients.size !== targetUserIds.length) {
        throw new BadRequestException(
          'One or more selected users cannot receive notifications.',
        );
      }
    }

    return {
      targetAll: false,
      targetRoleTypes,
      targetStaffRoles,
      targetUserIds,
    };
  }

  private normalizeRequiredText(value: string, fieldName: string) {
    const normalizedValue = value.trim();

    if (!normalizedValue) {
      throw new BadRequestException(`${fieldName} must not be empty.`);
    }

    return normalizedValue;
  }

  private normalizeRequiredMessage(value: string) {
    const normalizedValue = value.trim();
    const renderedText = normalizedValue
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;|&#160;/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!renderedText) {
      throw new BadRequestException('message must not be empty.');
    }

    return normalizedValue;
  }

  private getNotificationRecord(db: NotificationAuditClient, id: string) {
    return db.notification.findUnique({
      where: { id },
      include: NOTIFICATION_RECORD_INCLUDE,
    });
  }

  private extractTargetingState(
    notification: Pick<
      NotificationRecord,
      'targetAll' | 'targetRoleTypes' | 'targetStaffRoles' | 'targetUserIds'
    >,
  ): NotificationTargetingState {
    return {
      targetAll: notification.targetAll,
      targetRoleTypes: this.normalizeStoredTargetRoleTypes(
        notification.targetRoleTypes,
      ),
      targetStaffRoles: [...notification.targetStaffRoles],
      targetUserIds: [...notification.targetUserIds],
    };
  }

  private async mapNotificationAdminItems(
    notifications: NotificationRecord[],
  ): Promise<NotificationAdminItemDto[]> {
    const recipientMap = await this.loadRecipientOptionsByIds(
      notifications.flatMap((notification) => notification.targetUserIds),
      false,
    );

    return notifications.map((notification) =>
      this.mapNotificationAdminItemFromMap(notification, recipientMap),
    );
  }

  private async mapNotificationAdminItem(
    notification: NotificationRecord,
  ): Promise<NotificationAdminItemDto> {
    const recipientMap = await this.loadRecipientOptionsByIds(
      notification.targetUserIds,
      false,
    );
    return this.mapNotificationAdminItemFromMap(notification, recipientMap);
  }

  private mapNotificationAdminItemFromMap(
    notification: NotificationRecord,
    recipientMap: Map<string, NotificationRecipientOptionDto>,
  ): NotificationAdminItemDto {
    return {
      id: notification.id,
      title: notification.title,
      message: notification.message,
      status: notification.status,
      targetAll: notification.targetAll,
      targetRoleTypes: this.normalizeStoredTargetRoleTypes(
        notification.targetRoleTypes,
      ),
      targetStaffRoles: [...notification.targetStaffRoles],
      targetUserIds: [...notification.targetUserIds],
      targetUsers: notification.targetUserIds
        .map((userId) => recipientMap.get(userId))
        .filter(
          (recipient): recipient is NotificationRecipientOptionDto =>
            recipient !== undefined,
        ),
      version: notification.version,
      pushCount: notification.pushCount,
      lastPushedAt: notification.lastPushedAt?.toISOString() ?? null,
      createdAt: notification.createdAt.toISOString(),
      updatedAt: notification.updatedAt.toISOString(),
      createdBy: this.mapNotificationAuthor(notification.createdBy),
    };
  }

  private mapNotificationFeedItem(
    notification: NotificationRecord,
    isRead: boolean,
  ): NotificationFeedItemDto {
    return {
      id: notification.id,
      title: notification.title,
      message: notification.message,
      status: 'published',
      readStatus: isRead ? 'read' : 'unread',
      version: notification.version,
      pushCount: notification.pushCount,
      lastPushedAt: notification.lastPushedAt!.toISOString(),
      createdAt: notification.createdAt.toISOString(),
      updatedAt: notification.updatedAt.toISOString(),
      createdBy: this.mapNotificationAuthor(notification.createdBy),
    };
  }

  private mapNotificationPushEvent(
    notification: NotificationRecord,
    isFirstPublish: boolean,
  ): NotificationPushEventDto {
    return {
      id: notification.id,
      title: notification.title,
      message: notification.message,
      version: notification.version,
      lastPushedAt: notification.lastPushedAt!.toISOString(),
      deliveryKind: isFirstPublish ? 'published' : 'adjusted',
    };
  }

  private async loadRecipientOptionsByIds(
    userIds: string[],
    onlyEligible: boolean,
  ): Promise<Map<string, NotificationRecipientOptionDto>> {
    const uniqueUserIds = Array.from(new Set(userIds));
    if (uniqueUserIds.length === 0) {
      return new Map();
    }

    const recipients = await this.prisma.user.findMany({
      where: onlyEligible
        ? {
            id: { in: uniqueUserIds },
            AND: [this.buildEligibleRecipientWhere()],
          }
        : {
            id: { in: uniqueUserIds },
            roleType: {
              in: [UserRole.admin, UserRole.staff],
            },
          },
      select: NOTIFICATION_RECIPIENT_SELECT,
    });

    return new Map(
      recipients.map((recipient) => [
        recipient.id,
        this.mapRecipientOption(recipient),
      ]),
    );
  }

  private mapRecipientOption(
    recipient: NotificationRecipientRecord,
  ): NotificationRecipientOptionDto {
    return {
      userId: recipient.id,
      roleType: recipient.roleType as NotificationTargetRoleTypeDto,
      staffRoles: recipient.staffInfo?.roles ?? [],
      accountHandle: recipient.accountHandle,
      email: recipient.email,
      displayName: this.buildDisplayName(recipient),
    };
  }

  private mapNotificationAuthor(
    author: NotificationRecord['createdBy'],
  ): NotificationAuthorDto | null {
    if (!author) {
      return null;
    }

    return {
      userId: author.id,
      accountHandle: author.accountHandle,
      email: author.email,
      displayName: this.buildDisplayName(author),
    };
  }

  private normalizeStoredTargetRoleTypes(
    roleTypes: UserRole[],
  ): NotificationTargetRoleTypeDto[] {
    return roleTypes.filter(
      (roleType): roleType is NotificationTargetRoleTypeDto =>
        roleType === UserRole.admin || roleType === UserRole.staff,
    );
  }

  private buildDisplayName(author: {
    accountHandle: string | null;
    email: string | null;
    first_name?: string | null;
    last_name?: string | null;
  }) {
    const displayName = [author.last_name, author.first_name]
      .filter(Boolean)
      .join(' ')
      .trim();

    return displayName || author.accountHandle || author.email;
  }
}
