import { BadRequestException } from '@nestjs/common';
import { AchievementService } from './achievement.service';

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
      service.createStaffAchievement('UNISTAFF-x', { title: 'Giải' }, undefined),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects clearing a staff proof image', async () => {
    await expect(
      service.deleteStaffAchievementImage('UNISTAFF-x', 'ach-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
