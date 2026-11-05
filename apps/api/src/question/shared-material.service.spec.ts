jest.mock('src/prisma/prisma.service', () => ({
  PrismaService: class PrismaServiceMock {},
}));

import { BadRequestException } from '@nestjs/common';
import { lmsProfileConfig } from '../lms-profile/lms-profile';
import { SharedMaterialService } from './shared-material.service';

describe('SharedMaterialService — chuyên đề của bộ', () => {
  const prisma = {
    sharedMaterial: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    question: {
      updateMany: jest.fn(),
      count: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      aggregate: jest.fn(),
    },
    questionLink: {
      deleteMany: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
    },
    lessonQuiz: {
      deleteMany: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
    },
    module: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  };
  const actionHistory = {
    recordCreate: jest.fn(),
    recordUpdate: jest.fn(),
    recordDelete: jest.fn(),
  };
  const courseAccess = {
    assertCourseExists: jest.fn(),
    resolveActor: jest.fn(),
    assertCanWriteCourseQuestions: jest.fn(),
  };
  const actor = { userId: 'u1' };
  let service: SharedMaterialService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(
      (cb: (tx: typeof prisma) => unknown) => cb(prisma),
    );
    prisma.module.findUnique.mockResolvedValue({ courseId: 'c1' });
    prisma.question.count.mockResolvedValue(2);
    service = new SharedMaterialService(
      prisma as never,
      actionHistory as never,
      courseAccess as never,
      { config: lmsProfileConfig('jp') } as never,
    );
  });

  it('tạo bộ lưu chuyên đề của bộ', async () => {
    prisma.sharedMaterial.create.mockResolvedValue({ id: 's1', audioId: null });
    await service.create(
      { courseId: 'c1', moduleId: 'm1', title: 'Bài nghe 1', content: '<p>Đoạn văn</p>' },
      actor,
    );
    expect(prisma.sharedMaterial.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ moduleId: 'm1' }) as unknown,
    });
  });

  it('chuyên đề khác khoá bị từ chối', async () => {
    prisma.module.findUnique.mockResolvedValue({ courseId: 'c2' });
    await expect(
      service.create(
        { courseId: 'c1', moduleId: 'm9', title: 'X', content: '<p>Đoạn</p>' },
        actor,
      ),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.sharedMaterial.create).not.toHaveBeenCalled();
  });

  it('đổi chuyên đề của bộ thì mọi câu trong bộ đi theo', async () => {
    prisma.sharedMaterial.findUnique.mockResolvedValue({
      id: 's1',
      courseId: 'c1',
      moduleId: 'm1',
      content: '<p>Đoạn</p>',
      audioId: null,
    });
    prisma.sharedMaterial.update.mockResolvedValue({
      id: 's1',
      moduleId: 'm2',
      audioId: null,
    });
    await service.update('s1', { moduleId: 'm2' }, actor);
    expect(prisma.question.updateMany).toHaveBeenCalledWith({
      where: { sharedMaterialId: 's1' },
      data: { moduleId: 'm2' },
    });
  });

  describe('phần đầu bộ', () => {
    it('thiếu cả văn bản, ảnh lẫn audio → từ chối', async () => {
      await expect(
        service.create(
          { courseId: 'c1', moduleId: 'm1', title: 'X', content: '<p> &nbsp;</p>' },
          actor,
        ),
      ).rejects.toThrow('Phần đầu bộ cần có văn bản, ảnh hoặc audio.');
      expect(prisma.sharedMaterial.create).not.toHaveBeenCalled();
    });

    it('chỉ có ảnh vẫn hợp lệ', async () => {
      prisma.sharedMaterial.create.mockResolvedValue({ id: 's1', audioId: null });
      await service.create(
        {
          courseId: 'c1',
          moduleId: 'm1',
          title: 'X',
          content: '<p><img src="https://x/a.png"></p>',
        },
        actor,
      );
      expect(prisma.sharedMaterial.create).toHaveBeenCalled();
    });

    it('sửa xoá hết văn bản của bộ chỉ có văn bản → từ chối', async () => {
      prisma.sharedMaterial.findUnique.mockResolvedValue({
        id: 's1',
        courseId: 'c1',
        moduleId: 'm1',
        content: '<p>Đoạn</p>',
        audioId: null,
      });
      await expect(
        service.update('s1', { content: '<p></p>' }, actor),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.sharedMaterial.update).not.toHaveBeenCalled();
    });
  });

  describe('sắp thứ tự câu trong bộ', () => {
    beforeEach(() => {
      prisma.sharedMaterial.findUnique.mockResolvedValue({
        id: 's1',
        courseId: 'c1',
        moduleId: 'm1',
        content: '<p>Đoạn</p>',
        audioId: null,
      });
      prisma.question.findMany.mockResolvedValue([{ id: 'q1' }, { id: 'q2' }]);
    });

    it('lưu vị trí theo thứ tự gửi lên', async () => {
      await service.reorderQuestions('s1', ['q2', 'q1'], actor);
      expect(prisma.question.update).toHaveBeenCalledWith({
        where: { id: 'q2' },
        data: { setPosition: 0 },
      });
      expect(prisma.question.update).toHaveBeenCalledWith({
        where: { id: 'q1' },
        data: { setPosition: 1 },
      });
    });

    it('danh sách không khớp đúng các câu của bộ → từ chối', async () => {
      await expect(
        service.reorderQuestions('s1', ['q1', 'q9'], actor),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.reorderQuestions('s1', ['q1'], actor),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.question.update).not.toHaveBeenCalled();
    });
  });

  describe('chuyển câu vào / ra bộ', () => {
    beforeEach(() => {
      prisma.sharedMaterial.findUnique.mockResolvedValue({
        id: 's1',
        courseId: 'c1',
        moduleId: 'm1',
        content: '<p>Đoạn</p>',
        audioId: null,
      });
      prisma.question.aggregate.mockResolvedValue({
        _max: { setPosition: 2 },
      });
      prisma.questionLink.findMany.mockResolvedValue([]);
      prisma.lessonQuiz.findMany.mockResolvedValue([]);
    });

    it('câu lẻ vào bộ: gỡ mọi link lẻ, nhận chuyên đề bộ, đứng cuối bộ, vào các tiết dùng bộ', async () => {
      prisma.question.findUnique.mockResolvedValue({
        id: 'q9',
        courseId: 'c1',
        moduleId: 'm7',
        sharedMaterialId: null,
        deletedAt: null,
      });
      prisma.questionLink.findMany.mockResolvedValue([
        { lessonId: 'L1', order: 4 },
      ]);
      await service.moveQuestionIn('s1', 'q9', actor);
      expect(prisma.questionLink.deleteMany).toHaveBeenCalledWith({
        where: { questionId: 'q9' },
      });
      expect(prisma.lessonQuiz.deleteMany).toHaveBeenCalledWith({
        where: { questionId: 'q9' },
      });
      expect(prisma.question.update).toHaveBeenCalledWith({
        where: { id: 'q9' },
        data: { sharedMaterialId: 's1', setPosition: 3, moduleId: 'm1' },
      });
      expect(prisma.questionLink.create).toHaveBeenCalledWith({
        data: { lessonId: 'L1', questionId: 'q9', order: 5, points: null },
      });
    });

    it('câu đang thuộc bộ khác → từ chối, không đụng link', async () => {
      prisma.question.findUnique.mockResolvedValue({
        id: 'q9',
        courseId: 'c1',
        moduleId: 'm1',
        sharedMaterialId: 's2',
        deletedAt: null,
      });
      await expect(service.moveQuestionIn('s1', 'q9', actor)).rejects.toThrow(
        'Câu đang thuộc bộ khác — đưa ra khỏi bộ đó trước.',
      );
      expect(prisma.questionLink.deleteMany).not.toHaveBeenCalled();
    });

    it('câu ra khỏi bộ: biến mất khỏi mọi tiết / bài ôn, thành câu lẻ', async () => {
      prisma.question.findUnique.mockResolvedValue({
        id: 'q2',
        courseId: 'c1',
        moduleId: 'm1',
        sharedMaterialId: 's1',
        deletedAt: null,
      });
      await service.moveQuestionOut('s1', 'q2', actor);
      expect(prisma.questionLink.deleteMany).toHaveBeenCalledWith({
        where: { questionId: 'q2' },
      });
      expect(prisma.lessonQuiz.deleteMany).toHaveBeenCalledWith({
        where: { questionId: 'q2' },
      });
      expect(prisma.question.update).toHaveBeenCalledWith({
        where: { id: 'q2' },
        data: { sharedMaterialId: null, setPosition: null },
      });
      expect(prisma.questionLink.create).not.toHaveBeenCalled();
    });

    it('câu không thuộc bộ này → 404 khi đưa ra', async () => {
      prisma.question.findUnique.mockResolvedValue({
        id: 'q2',
        courseId: 'c1',
        moduleId: 'm1',
        sharedMaterialId: null,
        deletedAt: null,
      });
      await expect(service.moveQuestionOut('s1', 'q2', actor)).rejects.toThrow(
        'Câu không thuộc bộ này.',
      );
    });
  });

  describe('xoá bộ', () => {
    beforeEach(() => {
      prisma.sharedMaterial.findUnique.mockResolvedValue({
        id: 's1',
        courseId: 'c1',
        moduleId: 'm1',
        content: '<p>Đoạn</p>',
        audioId: null,
        deletedAt: null,
      });
      prisma.sharedMaterial.update.mockResolvedValue({ id: 's1' });
    });

    it('xoá mềm bộ và mọi câu trong bộ, gỡ khỏi mọi tiết / bài ôn', async () => {
      await service.delete('s1', actor);
      const inSet = { question: { sharedMaterialId: 's1' } };
      expect(prisma.questionLink.deleteMany).toHaveBeenCalledWith({
        where: inSet,
      });
      expect(prisma.lessonQuiz.deleteMany).toHaveBeenCalledWith({
        where: inSet,
      });
      expect(prisma.question.updateMany).toHaveBeenCalledWith({
        where: { sharedMaterialId: 's1', deletedAt: null },
        data: { deletedAt: expect.any(Date) as unknown },
      });
      expect(prisma.sharedMaterial.update).toHaveBeenCalledWith({
        where: { id: 's1' },
        data: { deletedAt: expect.any(Date) as unknown },
      });
    });

    it('giữ nguyên dòng bộ để lượt đã bắt đầu / đã nộp còn xem lại được', async () => {
      await service.delete('s1', actor);
      expect(prisma.sharedMaterial.delete).not.toHaveBeenCalled();
      // Câu giữ liên kết bộ: xem lại lượt đọc snapshot + bộ qua id.
      expect(prisma.question.updateMany).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ sharedMaterialId: null }) as unknown,
        }),
      );
    });

    it('bộ đã xoá không còn sửa / xoá được', async () => {
      prisma.sharedMaterial.findUnique.mockResolvedValue({
        id: 's1',
        courseId: 'c1',
        moduleId: 'm1',
        content: '<p>Đoạn</p>',
        audioId: null,
        deletedAt: new Date(),
      });
      await expect(service.delete('s1', actor)).rejects.toThrow(
        'Không tìm thấy tư liệu.',
      );
    });
  });
});
