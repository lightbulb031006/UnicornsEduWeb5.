jest.mock('src/staff-ops/staff-operations-access.service', () => ({
  StaffOperationsAccessService: class StaffOperationsAccessServiceMock {},
}));
jest.mock('./attempt.service', () => ({
  AttemptService: class AttemptServiceMock {},
}));

import { ForbiddenException } from '@nestjs/common';
import { UserRole } from 'generated/enums';
import { StaffAttemptGradingController } from './staff-attempt.controller';

describe('StaffAttemptGradingController (#275 chấm bài)', () => {
  const attemptService = { gradeEssayAnswer: jest.fn() };
  const staffOperationsAccess = {
    resolveClassViewerActor: jest.fn(),
    resolveClassViewAccessMode: jest.fn(),
  };
  const user = {
    id: 'user-1',
    email: 'user@example.com',
    accountHandle: 'user',
    roleType: UserRole.staff,
  };
  let controller: StaffAttemptGradingController;

  beforeEach(() => {
    jest.clearAllMocks();
    staffOperationsAccess.resolveClassViewerActor.mockResolvedValue({
      id: 'staff-1',
      roles: [],
    });
    controller = new StaffAttemptGradingController(
      attemptService as never,
      staffOperationsAccess as never,
    );
  });

  const grade = () =>
    controller.grade(user as never, 'class-1', 'assignment-1', 'answer-1', {
      score: 1,
    } as never);

  it.each(['admin', 'teacher', 'training_manager'])(
    'cho %s chấm tự luận',
    async (mode) => {
      staffOperationsAccess.resolveClassViewAccessMode.mockResolvedValue(mode);

      await expect(grade()).resolves.toEqual({ ok: true });
      expect(attemptService.gradeEssayAnswer).toHaveBeenCalled();
    },
  );

  it('từ chối CSKH chấm tự luận', async () => {
    staffOperationsAccess.resolveClassViewAccessMode.mockResolvedValue(
      'customer_care',
    );

    await expect(grade()).rejects.toBeInstanceOf(ForbiddenException);
    expect(attemptService.gradeEssayAnswer).not.toHaveBeenCalled();
  });
});
