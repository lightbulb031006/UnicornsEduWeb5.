import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { QuestionType, UserRole } from 'generated/enums';
import { Prisma } from '../../generated/client';
import { PrismaService } from '../prisma/prisma.service';
import { ActionHistoryService } from '../action-history/action-history.service';
import { CourseAccessService } from '../class/course-access.service';
import { LmsProfileService } from '../lms-profile/lms-profile.service';
import { regradeQuestionAnswerKey } from '../attempt/regrade';
import { assertQuestionShape, assertQuestionSkills } from './question-rules';
import {
  assertMaterialAttachable,
  nextSetPosition,
} from './shared-material.service';
import { assertAudioAttachable, withAudioRefs } from './audio-asset.service';
import { linkQuestionToSetLessons } from './set-lesson-sync';
import {
  CreateQuestionDto,
  UpdateQuestionDto,
  QuestionFilterDto,
  BulkCreateQuestionDto,
} from '../dtos/question.dto';

type QuestionActor = {
  userId?: string;
  userEmail?: string;
  roleType?: UserRole;
};

@Injectable()
export class QuestionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly actionHistory: ActionHistoryService,
    private readonly courseAccess: CourseAccessService,
    private readonly lmsProfile: LmsProfileService = new LmsProfileService(),
  ) {}

  private async assertWriteAccess(
    actor: QuestionActor,
    courseId: string,
  ): Promise<void> {
    const userId = actor.userId;
    if (!userId) {
      throw new BadRequestException('Missing actor for question write');
    }
    const courseActor = await this.courseAccess.resolveActor(
      userId,
      actor.roleType ?? UserRole.staff,
    );
    await this.courseAccess.assertCanWriteCourseQuestions(
      courseActor,
      courseId,
    );
  }

  async list(filter: QuestionFilterDto, skip = 0, take = 20) {
    const where: Prisma.QuestionWhereInput = {};
    if (filter.courseId) where.courseId = filter.courseId;
    if (filter.moduleId) where.moduleId = filter.moduleId;
    if (filter.difficultyLevelId)
      where.difficultyLevelId = filter.difficultyLevelId;
    if (filter.type) where.type = filter.type;
    if (filter.skill) where.skills = { has: filter.skill };
    if (filter.sharedMaterialId)
      where.sharedMaterialId = filter.sharedMaterialId;
    else if (filter.standalone === 'true') where.sharedMaterialId = null;
    if (filter.search) {
      where.content = { contains: filter.search, mode: 'insensitive' };
    }
    where.deletedAt = null;
    const rows = await this.prisma.question.findMany({
      where,
      skip,
      take,
      // Câu của một bộ xếp theo thứ tự bộ; còn lại mới nhất trước.
      orderBy: filter.sharedMaterialId
        ? [{ setPosition: 'asc' }, { createdAt: 'asc' }]
        : { createdAt: 'desc' },
    });
    return withAudioRefs(this.prisma, rows);
  }

  async get(id: string) {
    const q = await this.prisma.question.findUnique({ where: { id } });
    if (!q || q.deletedAt) throw new NotFoundException('Question not found');
    const [withAudio] = await withAudioRefs(this.prisma, [q]);
    return withAudio;
  }

  async create(dto: CreateQuestionDto, actor: QuestionActor) {
    if (dto.sharedMaterialId != null) {
      throw new BadRequestException(
        'Câu chỉ vào bộ qua form bộ hoặc chuyển vào bộ.',
      );
    }
    return this.insert(dto, null, actor);
  }

  /** Câu mới viết ngay trong form bộ: nhận chuyên đề của bộ, xếp cuối bộ. */
  async createInSet(
    setId: string,
    dto: CreateQuestionDto,
    actor: QuestionActor,
  ) {
    const set = await this.prisma.sharedMaterial.findUnique({
      where: { id: setId },
      select: { moduleId: true, deletedAt: true },
    });
    if (!set || set.deletedAt) {
      throw new NotFoundException('Không tìm thấy bộ câu hỏi.');
    }
    return this.insert({ ...dto, moduleId: set.moduleId }, setId, actor);
  }

  private async insert(
    dto: CreateQuestionDto,
    setId: string | null,
    actor: QuestionActor,
  ) {
    await this.assertWriteAccess(actor, dto.courseId);
    assertQuestionShape(dto, this.lmsProfile.config);
    assertQuestionSkills(dto.skills ?? [], this.lmsProfile.config);

    // Cross-course validation
    await this.assertModuleBelongsToCourse(dto.moduleId, dto.courseId);
    await this.assertDifficultyBelongsToCourse(
      dto.difficultyLevelId,
      dto.courseId,
    );
    await assertMaterialAttachable(
      this.prisma,
      this.lmsProfile.config,
      setId,
      dto.courseId,
      dto.moduleId,
    );
    await assertAudioAttachable(
      this.prisma,
      this.lmsProfile.config,
      dto.audioId,
      dto.courseId,
    );

    const created = await this.prisma.$transaction(async (tx) => {
      const created = await tx.question.create({
        data: {
          ...dto,
          sharedMaterialId: setId,
          setPosition: setId ? await nextSetPosition(tx, setId) : null,
        },
      });
      if (setId) {
        await linkQuestionToSetLessons(tx, created.id, setId);
      }
      await this.actionHistory.recordCreate(tx, {
        entityType: 'question',
        entityId: created.id,
        actor,
        afterValue: created,
      });
      return created;
    });
    const [withAudio] = await withAudioRefs(this.prisma, [created]);
    return withAudio;
  }

  async update(id: string, dto: UpdateQuestionDto, actor: QuestionActor) {
    const existing = await this.prisma.question.findUnique({
      where: { id },
    });
    if (!existing || existing.deletedAt)
      throw new NotFoundException('Question not found');
    await this.assertWriteAccess(actor, existing.courseId);

    assertQuestionShape(
      {
        type: existing.type,
        options: dto.options ?? existing.options,
        correctIndex:
          dto.correctIndex !== undefined
            ? dto.correctIndex
            : existing.correctIndex,
        tfAnswerKey: dto.tfAnswerKey ?? existing.tfAnswerKey,
        essayInputSize:
          dto.essayInputSize !== undefined
            ? dto.essayInputSize
            : existing.essayInputSize,
        tfLabelStyle:
          dto.tfLabelStyle !== undefined
            ? dto.tfLabelStyle
            : existing.tfLabelStyle,
        content: dto.content ?? existing.content,
        blankAnswerKey: dto.blankAnswerKey ?? existing.blankAnswerKey,
      },
      this.lmsProfile.config,
    );
    // Câu JP cũ chưa có kỹ năng: sửa là phải chọn.
    assertQuestionSkills(dto.skills ?? existing.skills, this.lmsProfile.config);
    if (
      dto.sharedMaterialId !== undefined &&
      dto.sharedMaterialId !== existing.sharedMaterialId
    ) {
      throw new BadRequestException('Đổi bộ của câu qua chuyển vào / ra bộ.');
    }
    if (dto.audioId !== existing.audioId) {
      await assertAudioAttachable(
        this.prisma,
        this.lmsProfile.config,
        dto.audioId,
        existing.courseId,
        { questionId: id },
      );
    }

    const answerKeyChange: {
      correctIndex?: number | null;
      tfAnswerKey?: boolean[];
      blankAnswerKey?: string[][];
      orderingKey?: string[];
    } = {};
    if (
      dto.correctIndex !== undefined &&
      dto.correctIndex !== existing.correctIndex
    ) {
      answerKeyChange.correctIndex = dto.correctIndex;
    }
    if (
      dto.tfAnswerKey !== undefined &&
      dto.tfAnswerKey.join() !== existing.tfAnswerKey.join()
    ) {
      answerKeyChange.tfAnswerKey = dto.tfAnswerKey;
    }

    if (
      dto.blankAnswerKey !== undefined &&
      JSON.stringify(dto.blankAnswerKey) !==
        JSON.stringify(existing.blankAnswerKey)
    ) {
      // Đổi đáp án hợp lệ của ô → chấm lại (regrade bỏ qua snapshot khác số ô).
      answerKeyChange.blankAnswerKey = dto.blankAnswerKey;
    }

    if (
      existing.type === QuestionType.ordering &&
      dto.options !== undefined &&
      JSON.stringify(dto.options) !== JSON.stringify(existing.options)
    ) {
      // Thẻ của câu sắp xếp chính là đáp án → chấm lại (regrade bỏ qua snapshot khác bộ thẻ).
      answerKeyChange.orderingKey = dto.options;
    }

    const before = existing;
    const updated = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.question.update({
        where: { id },
        data: { ...dto, sharedMaterialId: undefined },
      });
      // Sửa đáp án → chấm lại mọi Bài làm chứa câu (ADR it-absolute-scoring).
      await regradeQuestionAnswerKey(tx, id, answerKeyChange);
      await this.actionHistory.recordUpdate(tx, {
        entityType: 'question',
        entityId: id,
        actor,
        beforeValue: before,
        afterValue: updated,
      });
      return updated;
    });
    const [withAudio] = await withAudioRefs(this.prisma, [updated]);
    return withAudio;
  }

  async delete(id: string, actor: { userId?: string; userEmail?: string }) {
    const q = await this.prisma.question.findUnique({ where: { id } });
    if (!q || q.deletedAt) throw new NotFoundException('Question not found');

    const usage = await this.prisma.questionLink.findMany({
      where: { questionId: id },
    });
    // Câu của bộ: tiết / bài ôn đi theo bộ nên câu chỉ biến khỏi tiết (lượt cũ giữ snapshot).
    // Câu lẻ đang nằm trong tiết thì phải gỡ khỏi tiết trước.
    if (usage.length && !q.sharedMaterialId) {
      const lessonIds = usage.map((u) => u.lessonId);
      throw new ConflictException({
        message: 'Question is used by practice lessons',
        usedBy: lessonIds,
      });
    }

    return this.prisma.$transaction(async (tx) => {
      if (usage.length) {
        await tx.questionLink.deleteMany({ where: { questionId: id } });
      }
      if (q.sharedMaterialId) {
        await tx.lessonQuiz.deleteMany({ where: { questionId: id } });
      }
      const updated = await tx.question.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
      await this.actionHistory.recordDelete(tx, {
        entityType: 'question',
        entityId: id,
        actor,
        beforeValue: q,
      });
      return updated;
    });
  }

  async bulkCreate(dto: BulkCreateQuestionDto, actor: QuestionActor) {
    await this.assertWriteAccess(actor, dto.courseId);
    // Validate cross-course for shared module + difficulty
    await this.assertModuleBelongsToCourse(dto.moduleId, dto.courseId);

    // Validate each item
    for (const [i, item] of dto.questions.entries()) {
      assertQuestionShape(item, this.lmsProfile.config, `Câu ${i + 1}: `);
      assertQuestionSkills(
        item.skills ?? [],
        this.lmsProfile.config,
        `Câu ${i + 1}: `,
      );
      if (!item.content || !item.content.trim()) {
        throw new BadRequestException(`Question ${i + 1}: content is required`);
      }
      await this.assertDifficultyBelongsToCourse(
        item.difficultyLevelId,
        dto.courseId,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const created: Array<Record<string, unknown>> = [];
      for (const item of dto.questions) {
        const q = await tx.question.create({
          data: {
            courseId: dto.courseId,
            moduleId: dto.moduleId,
            difficultyLevelId: item.difficultyLevelId,
            type: item.type,
            content: item.content,
            options: item.options ?? undefined,
            correctIndex: item.correctIndex ?? undefined,
            tfAnswerKey: item.tfAnswerKey ?? [],
            explanation: item.explanation ?? undefined,
            answerGuide: item.answerGuide ?? undefined,
            skills: item.skills ?? [],
            essayInputSize: item.essayInputSize ?? undefined,
            tfLabelStyle: item.tfLabelStyle ?? undefined,
            blankAnswerKey: item.blankAnswerKey ?? undefined,
          },
        });
        await this.actionHistory.recordCreate(tx, {
          entityType: 'question',
          entityId: q.id,
          actor,
          afterValue: q,
        });
        created.push(q);
      }
      return { count: created.length, questions: created };
    });
  }

  private async assertModuleBelongsToCourse(
    moduleId: string,
    courseId: string,
  ) {
    const courseModule = await this.prisma.module.findUnique({
      where: { id: moduleId },
      select: { courseId: true },
    });
    if (!courseModule || courseModule.courseId !== courseId) {
      throw new BadRequestException(
        'Module does not belong to the specified course',
      );
    }
  }

  private async assertDifficultyBelongsToCourse(
    difficultyLevelId: string,
    courseId: string,
  ) {
    const level = await this.prisma.courseDifficultyLevel.findUnique({
      where: { id: difficultyLevelId },
      select: { courseId: true },
    });
    if (!level || level.courseId !== courseId) {
      throw new BadRequestException(
        'Difficulty level does not belong to the specified course',
      );
    }
  }
}
