import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  AchievementService,
  SELF_STAFF_ACHIEVEMENT_EDITOR,
  STAFF_ACHIEVEMENT_AUDIT_ENTITY,
  type StaffAchievementEditor,
} from './achievement.service';

jest.mock('../storage/supabase-storage', () => ({
  createSignedStorageUrl: jest.fn().mockResolvedValue(null),
  removeStorageObjects: jest.fn().mockResolvedValue(undefined),
  uploadStorageObject: jest.fn(),
  validateImageFile: jest.fn(),
}));

describe('AchievementService', () => {
  const service = Object.create(
    AchievementService.prototype,
  ) as AchievementService;

  it('accepts a full permutation', () => {
    expect(() =>
      service.assertCompleteReorder(['a', 'b', 'c'], ['c', 'a', 'b']),
    ).not.toThrow();
  });

  it('rejects missing or extra ids', () => {
    expect(() => service.assertCompleteReorder(['a', 'b'], ['a'])).toThrow(
      BadRequestException,
    );
    expect(() =>
      service.assertCompleteReorder(['a', 'b'], ['a', 'b', 'c']),
    ).toThrow(BadRequestException);
  });

  it('rejects duplicates and foreign ids', () => {
    expect(() => service.assertCompleteReorder(['a', 'b'], ['a', 'a'])).toThrow(
      BadRequestException,
    );
    expect(() => service.assertCompleteReorder(['a', 'b'], ['a', 'z'])).toThrow(
      BadRequestException,
    );
  });

  describe('thành tích nổi bật', () => {
    const SELF = SELF_STAFF_ACHIEVEMENT_EDITOR;
    const OTHER: StaffAchievementEditor = {
      kind: 'other',
      actor: { userId: 'u-admin', userEmail: 'a@x', roleType: 'admin' },
    };

    const makeService = () => {
      const prisma = {
        staffInfo: {
          findUnique: jest.fn().mockResolvedValue({ id: 'UNISTAFF-x' }),
          findFirst: jest.fn().mockResolvedValue(null),
        },
        staffAchievement: {
          count: jest.fn().mockResolvedValue(0),
          create: jest.fn((args: { data: object }) => ({
            id: 'new',
            imagePath: null,
            imageWatermarkedPath: null,
            isHighlight: false,
            ...args.data,
          })),
          findMany: jest.fn(),
          findFirst: jest.fn(),
          update: jest.fn((args: unknown) => args),
          updateMany: jest.fn((args: unknown) => args),
          delete: jest.fn().mockResolvedValue(undefined),
        },
        $transaction: jest.fn().mockResolvedValue([]),
      };
      const actionHistory = {
        recordCreate: jest.fn(),
        recordUpdate: jest.fn(),
        recordDelete: jest.fn(),
      };
      return {
        prisma,
        actionHistory,
        service: new AchievementService(
          prisma as never,
          actionHistory as never,
        ),
      };
    };

    it('đổi sao: bỏ sao cũ, đưa thành tích mới lên đầu, giữ thứ tự phần còn lại', async () => {
      const { prisma, service } = makeService();
      prisma.staffAchievement.findMany
        .mockResolvedValueOnce([
          { id: 'a', title: 'A', isHighlight: true },
          { id: 'b', title: 'B', isHighlight: false },
          { id: 'c', title: 'C', isHighlight: false },
        ])
        .mockResolvedValueOnce([]);

      await service.setStaffHighlightAchievement('UNISTAFF-x', 'c', SELF);

      const ops = prisma.$transaction.mock.calls[0][0] as Array<{
        where: { id?: unknown; isHighlight?: boolean };
        data: { sortOrder?: number; isHighlight?: boolean };
      }>;
      expect(ops[0]).toEqual({
        where: { staffId: 'UNISTAFF-x', isHighlight: true, id: { not: 'c' } },
        data: { isHighlight: false },
      });
      expect(ops.slice(1)).toEqual([
        { where: { id: 'c' }, data: { sortOrder: 0, isHighlight: true } },
        { where: { id: 'a' }, data: { sortOrder: 1 } },
        { where: { id: 'b' }, data: { sortOrder: 2 } },
      ]);
    });

    it('gắn sao được cho thành tích chưa có ảnh (sao trước, minh chứng sau)', async () => {
      const { prisma, service } = makeService();
      prisma.staffAchievement.findMany
        .mockResolvedValueOnce([{ id: 'b', title: 'B', isHighlight: false }])
        .mockResolvedValueOnce([]);

      await expect(
        service.setStaffHighlightAchievement('UNISTAFF-x', 'b', SELF),
      ).resolves.toEqual([]);
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('thành tích đầu tiên tạo được không cần ảnh và không tự có sao', async () => {
      const { prisma, service } = makeService();
      prisma.staffAchievement.findFirst.mockResolvedValue(null);

      const row = await service.createStaffAchievement(
        'UNISTAFF-x',
        { title: 'Giải' },
        undefined,
        SELF,
      );

      expect(prisma.staffAchievement.create).toHaveBeenCalledWith({
        data: { staffId: 'UNISTAFF-x', title: 'Giải', sortOrder: 0 },
      });
      expect(row).toMatchObject({ id: 'new', isHighlight: false });
    });

    it('nhân sự tự sửa không gỡ được ảnh của thành tích nổi bật', async () => {
      const { prisma, service } = makeService();
      prisma.staffAchievement.findFirst.mockResolvedValue({
        id: 'a',
        isHighlight: true,
        imagePath: 'a.png',
        imageWatermarkedPath: 'a.webp',
      });
      await expect(
        service.deleteStaffAchievementImage('UNISTAFF-x', 'a', SELF),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.staffAchievement.update).not.toHaveBeenCalled();
    });

    it('người khác gỡ được ảnh của thành tích nổi bật và có ghi lịch sử', async () => {
      const { prisma, actionHistory, service } = makeService();
      prisma.staffAchievement.findFirst.mockResolvedValue({
        id: 'a',
        staffId: 'UNISTAFF-x',
        title: 'A',
        isHighlight: true,
        imagePath: 'a.png',
        imageWatermarkedPath: 'a.webp',
      });

      await service.deleteStaffAchievementImage('UNISTAFF-x', 'a', OTHER);

      expect(prisma.staffAchievement.update).toHaveBeenCalledWith({
        where: { id: 'a' },
        data: { imagePath: null, imageWatermarkedPath: null },
      });
      expect(actionHistory.recordUpdate).toHaveBeenCalledWith(
        prisma,
        expect.objectContaining({
          entityType: STAFF_ACHIEVEMENT_AUDIT_ENTITY,
          entityId: 'a',
          actor: OTHER.kind === 'other' ? OTHER.actor : null,
        }),
      );
    });

    it('gỡ ảnh của thành tích không sao', async () => {
      const { prisma, service } = makeService();
      prisma.staffAchievement.findFirst.mockResolvedValue({
        id: 'b',
        isHighlight: false,
        imagePath: 'b.png',
        imageWatermarkedPath: 'b.webp',
      });

      await service.deleteStaffAchievementImage('UNISTAFF-x', 'b', SELF);

      expect(prisma.staffAchievement.update).toHaveBeenCalledWith({
        where: { id: 'b' },
        data: { imagePath: null, imageWatermarkedPath: null },
      });
    });

    it('đổi sao sang thành tích không thuộc hồ sơ thì báo không tìm thấy', async () => {
      const { prisma, service } = makeService();
      prisma.staffAchievement.findMany.mockResolvedValueOnce([{ id: 'a' }]);
      await expect(
        service.setStaffHighlightAchievement('UNISTAFF-x', 'z', SELF),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('sắp xếp luôn ghim thành tích nổi bật ở đầu', async () => {
      const { prisma, service } = makeService();
      prisma.staffAchievement.findMany
        .mockResolvedValueOnce([
          { id: 'a', isHighlight: false },
          { id: 'b', isHighlight: true },
          { id: 'c', isHighlight: false },
        ])
        .mockResolvedValueOnce([]);

      await service.reorderStaffAchievements('UNISTAFF-x', {
        orderedIds: ['c', 'a', 'b'],
      });

      const ops = prisma.$transaction.mock.calls[0][0] as Array<{
        where: { id: string };
        data: { sortOrder: number };
      }>;
      expect(ops.map((op) => op.where.id)).toEqual(['b', 'c', 'a']);
    });

    it('xoá thành tích nổi bật không bao giờ tự gắn sao cho dòng còn lại', async () => {
      const { prisma, service } = makeService();
      prisma.staffAchievement.findFirst.mockResolvedValue({
        id: 'a',
        isHighlight: true,
        imagePath: null,
        imageWatermarkedPath: null,
      });
      prisma.staffAchievement.findMany.mockResolvedValue([
        { id: 'b', imagePath: 'b.png' },
      ]);

      await service.deleteStaffAchievement('UNISTAFF-x', 'a', SELF);

      expect(prisma.staffAchievement.update).not.toHaveBeenCalled();
    });

    describe('lịch sử thao tác', () => {
      it('người khác thêm thành tích thì ghi create', async () => {
        const { prisma, actionHistory, service } = makeService();
        prisma.staffAchievement.findFirst.mockResolvedValue(null);

        await service.createStaffAchievement(
          'UNISTAFF-x',
          { title: 'Giải' },
          undefined,
          OTHER,
        );

        expect(actionHistory.recordCreate).toHaveBeenCalledWith(
          prisma,
          expect.objectContaining({
            entityType: STAFF_ACHIEVEMENT_AUDIT_ENTITY,
            entityId: 'new',
            afterValue: {
              staffId: 'UNISTAFF-x',
              title: 'Giải',
              isHighlight: false,
              hasImage: false,
            },
          }),
        );
      });

      it('nhân sự tự sửa thì không ghi', async () => {
        const { prisma, actionHistory, service } = makeService();
        prisma.staffAchievement.findFirst.mockResolvedValue(null);

        await service.createStaffAchievement(
          'UNISTAFF-x',
          { title: 'Giải' },
          undefined,
          SELF,
        );

        expect(actionHistory.recordCreate).not.toHaveBeenCalled();
      });

      it('đổi sao ghi update; gắn lại sao đang có thì không ghi', async () => {
        const { prisma, actionHistory, service } = makeService();
        prisma.staffAchievement.findMany
          .mockResolvedValueOnce([
            { id: 'a', title: 'A', isHighlight: true },
            { id: 'b', title: 'B', isHighlight: false },
          ])
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([
            { id: 'b', title: 'B', isHighlight: true },
            { id: 'a', title: 'A', isHighlight: false },
          ])
          .mockResolvedValueOnce([]);

        await service.setStaffHighlightAchievement('UNISTAFF-x', 'b', OTHER);
        await service.setStaffHighlightAchievement('UNISTAFF-x', 'b', OTHER);

        expect(actionHistory.recordUpdate).toHaveBeenCalledTimes(1);
        expect(actionHistory.recordUpdate).toHaveBeenCalledWith(
          prisma,
          expect.objectContaining({
            entityId: 'b',
            beforeValue: expect.objectContaining({
              highlightAchievementId: 'a',
            }) as unknown,
            afterValue: expect.objectContaining({
              highlightAchievementId: 'b',
            }) as unknown,
          }),
        );
      });
    });

    describe('resolveOtherStaffAchievementEditor', () => {
      const user = { id: 'u1', email: 'e@x', roleType: 'staff' as never };

      it('403 khi sửa hồ sơ của chính mình', async () => {
        const { prisma, service } = makeService();
        prisma.staffInfo.findFirst.mockResolvedValue({ id: 'UNISTAFF-x' });
        await expect(
          service.resolveOtherStaffAchievementEditor(user, 'UNISTAFF-x'),
        ).rejects.toBeInstanceOf(ForbiddenException);
      });

      it('hồ sơ người khác → editor other kèm actor', async () => {
        const { prisma, service } = makeService();
        prisma.staffInfo.findFirst.mockResolvedValue({ id: 'UNISTAFF-me' });
        await expect(
          service.resolveOtherStaffAchievementEditor(user, 'UNISTAFF-x'),
        ).resolves.toEqual({
          kind: 'other',
          actor: { userId: 'u1', userEmail: 'e@x', roleType: 'staff' },
        });
      });
    });
  });
});
