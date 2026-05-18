import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { RegulationAudience, StaffRole, UserRole } from 'generated/enums';
import type { JwtPayload } from 'src/auth/decorators/current-user.decorator';
import {
  ActionHistoryActor,
  ActionHistoryService,
} from 'src/action-history/action-history.service';
import type {
  CreateRegulationDto,
  RegulationAuthorDto,
  RegulationItemDto,
  UpdateRegulationDto,
} from 'src/dtos/regulation.dto';
import { PrismaService } from 'src/prisma/prisma.service';

const STAFF_ROLE_AUDIENCE_MAP: Record<StaffRole, RegulationAudience> = {
  admin: RegulationAudience.staff_admin,
  teacher: RegulationAudience.staff_teacher,
  assistant: RegulationAudience.staff_assistant,
  lesson_plan: RegulationAudience.staff_lesson_plan,
  lesson_plan_head: RegulationAudience.staff_lesson_plan_head,
  accountant: RegulationAudience.staff_accountant,
  communication: RegulationAudience.staff_communication,
  technical: RegulationAudience.staff_technical,
  customer_care: RegulationAudience.staff_customer_care,
};
const REGULATION_AUTHOR_SELECT = {
  id: true,
  accountHandle: true,
  email: true,
  first_name: true,
  last_name: true,
} as const;
const REGULATION_INCLUDE = {
  createdBy: {
    select: REGULATION_AUTHOR_SELECT,
  },
  updatedBy: {
    select: REGULATION_AUTHOR_SELECT,
  },
} as const;

@Injectable()
export class RegulationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly actionHistoryService: ActionHistoryService,
  ) {}

  async getRegulations(user: JwtPayload): Promise<RegulationItemDto[]> {
    const accessContext = await this.resolveAccessContext(user);

    const regulations = await this.prisma.regulation.findMany({
      where: accessContext.canManageAll
        ? undefined
        : this.buildAudienceWhere(accessContext.visibleAudiences),
      include: REGULATION_INCLUDE,
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    });

    return regulations.map((regulation) => this.mapRegulationItem(regulation));
  }

  async createRegulation(
    user: JwtPayload,
    data: CreateRegulationDto,
    auditActor?: ActionHistoryActor,
  ): Promise<RegulationItemDto> {
    const normalizedData = this.normalizeMutationData(data);
    const title = normalizedData.title;
    const content = normalizedData.content;
    const audiences = normalizedData.audiences;

    if (!title || !content || !audiences?.length) {
      throw new BadRequestException('Invalid regulation payload');
    }

    const createdRegulation = await this.prisma.$transaction(async (tx) => {
      const regulation = await tx.regulation.create({
        data: {
          title,
          description: normalizedData.description ?? null,
          content,
          audiences,
          resourceLink: normalizedData.resourceLink ?? null,
          resourceLinkLabel: normalizedData.resourceLinkLabel ?? null,
          createdByUserId: user.id,
          updatedByUserId: user.id,
        },
      });

      if (auditActor) {
        await this.actionHistoryService.recordCreate(tx, {
          actor: auditActor,
          entityType: 'regulation',
          entityId: regulation.id,
          description: 'Tạo quy định',
          afterValue: regulation,
        });
      }

      return tx.regulation.findUniqueOrThrow({
        where: { id: regulation.id },
        include: REGULATION_INCLUDE,
      });
    });

    return this.mapRegulationItem(createdRegulation);
  }

  async updateRegulation(
    id: string,
    user: JwtPayload,
    data: UpdateRegulationDto,
    auditActor?: ActionHistoryActor,
  ): Promise<RegulationItemDto> {
    const beforeValue = await this.prisma.regulation.findUnique({
      where: { id },
    });

    if (!beforeValue) {
      throw new NotFoundException('Regulation not found');
    }

    const normalizedData = this.normalizeMutationData(data);
    const nextResourceLink =
      normalizedData.resourceLink === undefined
        ? beforeValue.resourceLink
        : normalizedData.resourceLink;
    const nextResourceLinkLabel =
      normalizedData.resourceLinkLabel === undefined
        ? beforeValue.resourceLinkLabel
        : normalizedData.resourceLinkLabel;

    if (nextResourceLinkLabel && !nextResourceLink) {
      throw new BadRequestException(
        'Resource link label requires a resource link',
      );
    }

    const updatedRegulation = await this.prisma.$transaction(async (tx) => {
      const regulation = await tx.regulation.update({
        where: { id },
        data: {
          ...normalizedData,
          updatedByUserId: user.id,
        },
      });

      if (auditActor) {
        await this.actionHistoryService.recordUpdate(tx, {
          actor: auditActor,
          entityType: 'regulation',
          entityId: regulation.id,
          description: 'Cập nhật quy định',
          beforeValue,
          afterValue: regulation,
        });
      }

      return tx.regulation.findUniqueOrThrow({
        where: { id: regulation.id },
        include: REGULATION_INCLUDE,
      });
    });

    return this.mapRegulationItem(updatedRegulation);
  }

  private buildAudienceWhere(audiences: RegulationAudience[]) {
    const allowedAudiences = Array.from(new Set(audiences));

    if (allowedAudiences.length === 0) {
      return {
        audiences: {
          has: RegulationAudience.all,
        },
      };
    }

    return {
      OR: [
        {
          audiences: {
            has: RegulationAudience.all,
          },
        },
        {
          audiences: {
            hasSome: allowedAudiences,
          },
        },
      ],
    };
  }

  private async resolveAccessContext(user: JwtPayload): Promise<{
    canManageAll: boolean;
    visibleAudiences: RegulationAudience[];
  }> {
    if (user.roleType === UserRole.admin) {
      return {
        canManageAll: true,
        visibleAudiences: [RegulationAudience.all],
      };
    }

    if (user.roleType === UserRole.student) {
      return {
        canManageAll: false,
        visibleAudiences: [RegulationAudience.student],
      };
    }

    if (user.roleType !== UserRole.staff) {
      return {
        canManageAll: false,
        visibleAudiences: [],
      };
    }

    const staff = await this.prisma.staffInfo.findFirst({
      where: { userId: user.id },
      select: { roles: true },
    });
    const staffRoles = staff?.roles ?? [];

    return {
      canManageAll: staffRoles.includes(StaffRole.assistant),
      visibleAudiences: staffRoles
        .map((role) => STAFF_ROLE_AUDIENCE_MAP[role])
        .filter((audience): audience is RegulationAudience =>
          Boolean(audience),
        ),
    };
  }

  private normalizeMutationData(
    data: CreateRegulationDto | UpdateRegulationDto,
  ) {
    const nextData: {
      title?: string;
      description?: string | null;
      content?: string;
      audiences?: RegulationAudience[];
      resourceLink?: string | null;
      resourceLinkLabel?: string | null;
    } = {};

    if ('title' in data && data.title !== undefined) {
      const title = data.title.trim();
      if (!title) {
        throw new BadRequestException('Title is required');
      }
      nextData.title = title;
    }

    if ('description' in data) {
      nextData.description = this.normalizeNullableText(data.description);
    }

    if ('content' in data && data.content !== undefined) {
      const content = data.content.trim();
      if (!content) {
        throw new BadRequestException('Content is required');
      }
      nextData.content = content;
    }

    if ('audiences' in data && data.audiences !== undefined) {
      const audiences = Array.from(new Set(data.audiences));
      if (!audiences.length) {
        throw new BadRequestException('At least one audience is required');
      }
      nextData.audiences = audiences;
    }

    const hasResourceLinkField = 'resourceLink' in data;
    const hasResourceLinkLabelField = 'resourceLinkLabel' in data;

    const resourceLink = hasResourceLinkField
      ? this.normalizeNullableText(data.resourceLink)
      : undefined;
    const resourceLinkLabel = hasResourceLinkLabelField
      ? this.normalizeNullableText(data.resourceLinkLabel)
      : undefined;

    if (resourceLinkLabel && resourceLink === null) {
      throw new BadRequestException(
        'Resource link label requires a resource link',
      );
    }

    if (hasResourceLinkField) {
      nextData.resourceLink = resourceLink;
    }

    if (hasResourceLinkLabelField) {
      nextData.resourceLinkLabel = resourceLinkLabel;
    }

    return nextData;
  }

  private normalizeNullableText(
    value?: string | null,
  ): string | null | undefined {
    if (value === undefined) {
      return undefined;
    }

    const normalizedValue = value?.trim() ?? '';
    return normalizedValue ? normalizedValue : null;
  }

  private mapRegulationAuthor(
    author: {
      id: string;
      accountHandle: string;
      email: string;
      first_name: string | null;
      last_name: string | null;
    } | null,
  ): RegulationAuthorDto | null {
    if (!author) {
      return null;
    }

    const displayName = [author.last_name, author.first_name]
      .filter(Boolean)
      .join(' ')
      .trim();

    return {
      userId: author.id,
      accountHandle: author.accountHandle,
      email: author.email,
      displayName: displayName || null,
    };
  }

  private mapRegulationItem(regulation: {
    id: string;
    title: string;
    description: string | null;
    content: string;
    audiences: RegulationAudience[];
    resourceLink: string | null;
    resourceLinkLabel: string | null;
    createdAt: Date;
    updatedAt: Date;
    createdBy: {
      id: string;
      accountHandle: string;
      email: string;
      first_name: string | null;
      last_name: string | null;
    } | null;
    updatedBy: {
      id: string;
      accountHandle: string;
      email: string;
      first_name: string | null;
      last_name: string | null;
    } | null;
  }): RegulationItemDto {
    return {
      id: regulation.id,
      title: regulation.title,
      description: regulation.description,
      content: regulation.content,
      audiences: regulation.audiences,
      resourceLink: regulation.resourceLink,
      resourceLinkLabel: regulation.resourceLinkLabel,
      createdAt: regulation.createdAt.toISOString(),
      updatedAt: regulation.updatedAt.toISOString(),
      createdBy: this.mapRegulationAuthor(regulation.createdBy),
      updatedBy: this.mapRegulationAuthor(regulation.updatedBy),
    };
  }
}
