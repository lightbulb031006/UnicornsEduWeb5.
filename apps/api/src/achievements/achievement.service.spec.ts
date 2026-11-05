import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AchievementLevel } from 'generated/enums';
import {
  assertStorageBucketsAvailable,
  createSignedStorageUrl,
  removeStorageObjects,
  uploadStorageObject,
} from '../storage/supabase-storage';
import { bakeDiagonalWatermark } from '../storage/image-watermark';
import { AchievementService } from './achievement.service';

jest.mock('../storage/supabase-storage', () => ({
  assertStorageBucketsAvailable: jest.fn(),
  createSignedStorageUrl: jest.fn(),
  removeStorageObjects: jest.fn(),
  uploadStorageObject: jest.fn(),
  validateImageFile: jest.fn(),
}));
jest.mock('../storage/image-watermark', () => ({
  bakeDiagonalWatermark: jest.fn(),
  buildAchievementWatermarkedPath: jest.fn(
    (ownerKind: string, ownerId: string, achievementId: string) =>
      `${ownerKind}/${ownerId}/${achievementId}.jpg`,
  ),
}));

const mockedAssertBuckets = jest.mocked(assertStorageBucketsAvailable);
const mockedCreateSignedUrl = jest.mocked(createSignedStorageUrl);
const mockedRemoveStorage = jest.mocked(removeStorageObjects);
const mockedUploadStorage = jest.mocked(uploadStorageObject);
const mockedWatermark = jest.mocked(bakeDiagonalWatermark);

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

  it('rejects a new staff achievement that has no proof image', async () => {
    await expect(
      service.createStaffAchievement(
        'UNISTAFF-x',
        { title: 'Giải' },
        undefined,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects clearing a staff proof image', () => {
    expect(() =>
      service.deleteStaffAchievementImage('UNISTAFF-x', 'ach-1'),
    ).toThrow(BadRequestException);
  });

  describe('student create with proof image', () => {
    const createdAt = new Date('2026-10-12T00:00:00.000Z');
    const baseRow = {
      id: 'f1a7c142-c95f-4fe9-8860-ab082ca72ae7',
      studentId: 'UNIST-1234567890',
      award: 'Giải Nhất',
      exam: 'HSG Tỉnh',
      year: 2026,
      level: AchievementLevel.HSG_TINH_THANH_PHO,
      courseLabel: null,
      imagePath: null,
      imageWatermarkedPath: null,
      sortOrder: 0,
      createdAt,
      updatedAt: createdAt,
    };
    const file = {
      buffer: Buffer.from('image'),
      mimetype: 'image/png',
      size: 5,
    };

    function buildService() {
      const prisma = {
        studentInfo: {
          findUnique: jest.fn().mockResolvedValue({ id: baseRow.studentId }),
        },
        studentAchievement: {
          findFirst: jest
            .fn()
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce(baseRow),
          create: jest.fn().mockResolvedValue(baseRow),
          update: jest
            .fn()
            .mockImplementation(
              (args: {
                data: { imagePath: string; imageWatermarkedPath: string };
              }) =>
                Promise.resolve({
                  ...baseRow,
                  ...args.data,
                  updatedAt: new Date('2026-10-12T00:01:00.000Z'),
                }),
            ),
          delete: jest.fn().mockResolvedValue(baseRow),
        },
      };
      return {
        prisma,
        service: new AchievementService(prisma as never),
      };
    }

    beforeEach(() => {
      jest.clearAllMocks();
      mockedAssertBuckets.mockResolvedValue(undefined);
      mockedCreateSignedUrl.mockResolvedValue('https://signed.example/proof');
      mockedRemoveStorage.mockResolvedValue(undefined);
      mockedWatermark.mockResolvedValue({
        buffer: Buffer.from('watermarked'),
        contentType: 'image/jpeg',
      });
      mockedUploadStorage.mockResolvedValue(undefined);
    });

    it('stores private and public images in the same create flow', async () => {
      const { prisma, service: imageService } = buildService();

      const result = await imageService.createStudentAchievement(
        baseRow.studentId,
        {
          award: baseRow.award,
          exam: baseRow.exam,
          year: baseRow.year,
          level: baseRow.level,
        },
        file,
      );

      expect(mockedAssertBuckets).toHaveBeenCalledWith([
        { name: 'achievements', public: false },
        { name: 'achievements-public', public: true },
      ]);
      expect(mockedUploadStorage).toHaveBeenCalledTimes(2);
      expect(prisma.studentAchievement.update).toHaveBeenCalledWith({
        where: { id: baseRow.id },
        data: {
          imagePath: `student/${baseRow.studentId}/${baseRow.id}.png`,
          imageWatermarkedPath: `student/${baseRow.studentId}/${baseRow.id}.jpg`,
        },
      });
      expect(prisma.studentAchievement.delete).not.toHaveBeenCalled();
      expect(result.imageUrl).toBe('https://signed.example/proof');
    });

    it('rolls back the new database row when either image upload fails', async () => {
      const { prisma, service: imageService } = buildService();
      mockedUploadStorage
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('Bucket not found'));

      await expect(
        imageService.createStudentAchievement(
          baseRow.studentId,
          {
            award: baseRow.award,
            exam: baseRow.exam,
            year: baseRow.year,
            level: baseRow.level,
          },
          file,
        ),
      ).rejects.toThrow('Bucket not found');

      expect(prisma.studentAchievement.delete).toHaveBeenCalledWith({
        where: { id: baseRow.id },
      });
      expect(mockedRemoveStorage).toHaveBeenCalledWith(
        expect.objectContaining({ bucket: 'achievements' }),
      );
    });
  });

  describe('thành tích nổi bật', () => {
    const makeService = () => {
      const prisma = {
        staffInfo: {
          findUnique: jest.fn().mockResolvedValue({ id: 'UNISTAFF-x' }),
        },
        staffAchievement: {
          findMany: jest.fn(),
          findFirst: jest.fn(),
          update: jest.fn((args: unknown) => args),
          updateMany: jest.fn((args: unknown) => args),
          delete: jest.fn().mockResolvedValue(undefined),
        },
        $transaction: jest.fn().mockResolvedValue([]),
      };
      return {
        prisma,
        service: new AchievementService(prisma as never),
      };
    };

    it('đổi sao: bỏ sao cũ, đưa thành tích mới lên đầu, giữ thứ tự phần còn lại', async () => {
      const { prisma, service } = makeService();
      prisma.staffAchievement.findMany
        .mockResolvedValueOnce([{ id: 'a' }, { id: 'b' }, { id: 'c' }])
        .mockResolvedValueOnce([]);

      await service.setStaffHighlightAchievement('UNISTAFF-x', 'c');

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

    it('đổi sao sang thành tích không thuộc hồ sơ thì báo không tìm thấy', async () => {
      const { prisma, service } = makeService();
      prisma.staffAchievement.findMany.mockResolvedValueOnce([{ id: 'a' }]);
      await expect(
        service.setStaffHighlightAchievement('UNISTAFF-x', 'z'),
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

    it('xoá thành tích nổi bật còn đúng 1 dòng thì dòng đó tự có sao', async () => {
      const { prisma, service } = makeService();
      prisma.staffAchievement.findFirst.mockResolvedValue({
        id: 'a',
        isHighlight: true,
        imagePath: null,
        imageWatermarkedPath: null,
      });
      prisma.staffAchievement.findMany.mockResolvedValue([{ id: 'b' }]);

      await service.deleteStaffAchievement('UNISTAFF-x', 'a');

      expect(prisma.staffAchievement.update).toHaveBeenCalledWith({
        where: { id: 'b' },
        data: { isHighlight: true },
      });
    });

    it('xoá thành tích nổi bật còn từ 2 dòng thì không tự chọn', async () => {
      const { prisma, service } = makeService();
      prisma.staffAchievement.findFirst.mockResolvedValue({
        id: 'a',
        isHighlight: true,
        imagePath: null,
        imageWatermarkedPath: null,
      });
      prisma.staffAchievement.findMany.mockResolvedValue([
        { id: 'b' },
        { id: 'c' },
      ]);

      await service.deleteStaffAchievement('UNISTAFF-x', 'a');

      expect(prisma.staffAchievement.update).not.toHaveBeenCalled();
    });
  });
});
