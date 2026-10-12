import { BadRequestException } from '@nestjs/common';
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
});
