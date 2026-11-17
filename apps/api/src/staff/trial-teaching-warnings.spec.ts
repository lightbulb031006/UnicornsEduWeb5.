import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { StaffRole, UserRole } from 'generated/enums';
import { StaffService } from './staff.service';
import { loadTrialTeachingWarnings } from './trial-teaching-warnings';

describe('Cảnh báo chưa dạy thử', () => {
  const db = {
    session: { findMany: jest.fn() },
    trialTeachingWarningDismissal: { findMany: jest.fn(), upsert: jest.fn() },
    staffInfo: { findUnique: jest.fn() },
    class: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
  };

  beforeEach(() => {
    jest.resetAllMocks();
    db.session.findMany.mockResolvedValue([]);
    db.trialTeachingWarningDismissal.findMany.mockResolvedValue([]);
  });

  describe('loadTrialTeachingWarnings', () => {
    it('không có lớp chờ trả → không truy vấn, không cảnh báo', async () => {
      await expect(
        loadTrialTeachingWarnings(db as never, 'staff-a', []),
      ).resolves.toEqual([]);
      expect(db.session.findMany).not.toHaveBeenCalled();
    });

    it('mỗi lớp một cảnh báo, trừ lớp đã có buổi dạy thử hoặc đã bỏ qua', async () => {
      db.session.findMany.mockResolvedValue([{ classId: 'class-c' }]);
      db.trialTeachingWarningDismissal.findMany.mockResolvedValue([
        { classId: 'class-d' },
      ]);

      const warnings = await loadTrialTeachingWarnings(db as never, 'staff-a', [
        { classId: 'class-b', className: 'Lớp B' },
        { classId: 'class-b', className: 'Lớp B' },
        { classId: 'class-c', className: 'Lớp C' },
        { classId: 'class-d', className: 'Lớp D' },
        { classId: 'class-a', className: 'Lớp A' },
      ]);

      expect(warnings).toEqual([
        { classId: 'class-a', className: 'Lớp A' },
        { classId: 'class-b', className: 'Lớp B' },
      ]);
      // Dạy thử tính trên toàn bộ lịch sử lớp (không lọc trạng thái thanh toán).
      expect(db.session.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            teacherId: 'staff-a',
            classId: { in: ['class-b', 'class-c', 'class-d', 'class-a'] },
            coefficient: 0,
          },
        }),
      );
    });
  });

  describe('StaffService.dismissTrialTeachingWarning', () => {
    const service = () =>
      new StaffService(
        db as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
      );

    const actorAs = (staffId: string, roles: StaffRole[]) =>
      db.user.findUnique.mockResolvedValue({
        roleType: UserRole.staff,
        staffInfo: { id: staffId, roles },
      });

    it('Kế toán chi bỏ qua cảnh báo của gia sư khác → lưu theo cặp (gia sư, lớp)', async () => {
      actorAs('staff-acc', [StaffRole.accountant_expense]);
      db.staffInfo.findUnique.mockResolvedValue({ id: 'staff-a' });
      db.class.findUnique.mockResolvedValue({ id: 'class-b' });
      const dismissedAt = new Date('2026-11-16T08:00:00Z');
      db.trialTeachingWarningDismissal.upsert.mockResolvedValue({
        staffId: 'staff-a',
        classId: 'class-b',
        dismissedAt,
      });

      await expect(
        service().dismissTrialTeachingWarning('staff-a', 'class-b', {
          userId: 'user-acc',
          roleType: UserRole.staff,
        }),
      ).resolves.toEqual({
        staffId: 'staff-a',
        classId: 'class-b',
        dismissedAt: dismissedAt.toISOString(),
      });
      expect(db.trialTeachingWarningDismissal.upsert).toHaveBeenCalledWith({
        where: { staffId_classId: { staffId: 'staff-a', classId: 'class-b' } },
        create: {
          staffId: 'staff-a',
          classId: 'class-b',
          dismissedByUserId: 'user-acc',
        },
        update: {},
      });
    });

    it('Kế toán chi bỏ qua cảnh báo của chính mình → 403 (#265)', async () => {
      actorAs('staff-acc', [StaffRole.accountant_expense, StaffRole.teacher]);
      await expect(
        service().dismissTrialTeachingWarning('staff-acc', 'class-b', {
          userId: 'user-acc',
          roleType: UserRole.staff,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(db.trialTeachingWarningDismissal.upsert).not.toHaveBeenCalled();
    });

    it('lớp không tồn tại → 404', async () => {
      db.user.findUnique.mockResolvedValue({
        roleType: UserRole.admin,
        staffInfo: null,
      });
      db.staffInfo.findUnique.mockResolvedValue({ id: 'staff-a' });
      db.class.findUnique.mockResolvedValue(null);
      await expect(
        service().dismissTrialTeachingWarning('staff-a', 'class-x', {
          userId: 'user-admin',
          roleType: UserRole.admin,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
