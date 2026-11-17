import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserRole } from '../../generated/enums';
import { SessionService } from './session.service';

/**
 * Follow-up grill 13/11 — glossary «Giải trình vắng»: ai xếp được lịch bù trên
 * lớp thì mới giải trình được. Dùng cùng predicate `resolveClassWorkAccess`
 * (#275) cho cả tạo lẫn sửa giải trình ở route staff-ops.
 */
describe('SessionService – quyền giải trình vắng (staff-ops)', () => {
  const staffOperationsAccess = {
    resolveClassWorkAccess: jest.fn(),
  };
  const explanationService = {
    createExplanationForClass: jest.fn(),
    updateExplanation: jest.fn(),
    getExplanationClassId: jest.fn(),
  };
  const service = new SessionService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    explanationService as never,
    staffOperationsAccess as never,
  );

  const dto = {
    teacherId: 'teacher-1',
    scheduleEntryId: 'entry-1',
    originalDate: '2026-11-10',
    reason: 'Ốm',
  };
  const actor = {
    userId: 'user-1',
    userEmail: 'u@example.com',
    roleType: UserRole.staff,
  };

  const denyOtherClass = () =>
    staffOperationsAccess.resolveClassWorkAccess.mockRejectedValue(
      new ForbiddenException(
        'Chỉ Admin, gia sư của lớp hoặc Quản lý lớp mới được thao tác trên lớp này.',
      ),
    );

  beforeEach(() => {
    jest.clearAllMocks();
    explanationService.createExplanationForClass.mockResolvedValue({
      id: 'exp-1',
    });
    explanationService.updateExplanation.mockResolvedValue({ id: 'exp-1' });
    explanationService.getExplanationClassId.mockResolvedValue('class-1');
  });

  describe('tạo giải trình', () => {
    it('nhân sự Đào tạo không quản lý lớp → 403, không lưu', async () => {
      denyOtherClass();
      await expect(
        service.createMissedTeachingExplanationForStaff(
          'user-1',
          UserRole.staff,
          'class-1',
          dto,
          actor,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(staffOperationsAccess.resolveClassWorkAccess).toHaveBeenCalledWith(
        'user-1',
        UserRole.staff,
        'class-1',
      );
      expect(
        explanationService.createExplanationForClass,
      ).not.toHaveBeenCalled();
    });

    it('Quản lý lớp giải trình cho mọi gia sư của lớp', async () => {
      staffOperationsAccess.resolveClassWorkAccess.mockResolvedValue({
        staffId: 'staff-manager',
        isAdmin: false,
        isClassTeacher: false,
        isClassManager: true,
      });
      await service.createMissedTeachingExplanationForStaff(
        'user-1',
        UserRole.staff,
        'class-1',
        dto,
        actor,
      );
      expect(explanationService.createExplanationForClass).toHaveBeenCalledWith(
        'class-1',
        dto,
        actor,
        undefined,
      );
    });

    it('Admin giải trình cho mọi gia sư của lớp', async () => {
      staffOperationsAccess.resolveClassWorkAccess.mockResolvedValue({
        staffId: null,
        isAdmin: true,
        isClassTeacher: false,
        isClassManager: false,
      });
      await service.createMissedTeachingExplanationForStaff(
        'admin-user',
        UserRole.admin,
        'class-1',
        dto,
        actor,
      );
      expect(explanationService.createExplanationForClass).toHaveBeenCalledWith(
        'class-1',
        dto,
        actor,
        undefined,
      );
    });

    it('gia sư của lớp chỉ giải trình buổi của mình', async () => {
      staffOperationsAccess.resolveClassWorkAccess.mockResolvedValue({
        staffId: 'teacher-1',
        isAdmin: false,
        isClassTeacher: true,
        isClassManager: false,
      });
      await service.createMissedTeachingExplanationForStaff(
        'user-1',
        UserRole.staff,
        'class-1',
        dto,
        actor,
      );
      expect(explanationService.createExplanationForClass).toHaveBeenCalledWith(
        'class-1',
        dto,
        actor,
        {
          restrictTeacherId: 'teacher-1',
        },
      );
    });
  });

  describe('sửa giải trình', () => {
    const updateDto = { reason: 'Ốm, có giấy' };

    it('kiểm quyền trên lớp của giải trình; lớp không thuộc mình → 403', async () => {
      denyOtherClass();
      await expect(
        service.updateMissedTeachingExplanationForStaff(
          'user-1',
          UserRole.staff,
          'exp-1',
          updateDto,
          actor,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(explanationService.getExplanationClassId).toHaveBeenCalledWith(
        'exp-1',
      );
      expect(staffOperationsAccess.resolveClassWorkAccess).toHaveBeenCalledWith(
        'user-1',
        UserRole.staff,
        'class-1',
      );
      expect(explanationService.updateExplanation).not.toHaveBeenCalled();
    });

    it('giải trình không tồn tại → 404', async () => {
      explanationService.getExplanationClassId.mockRejectedValue(
        new NotFoundException('Không tìm thấy giải trình vắng.'),
      );
      await expect(
        service.updateMissedTeachingExplanationForStaff(
          'user-1',
          UserRole.staff,
          'exp-x',
          updateDto,
          actor,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(explanationService.updateExplanation).not.toHaveBeenCalled();
    });

    it('Quản lý lớp sửa được giải trình của gia sư bất kỳ trong lớp', async () => {
      staffOperationsAccess.resolveClassWorkAccess.mockResolvedValue({
        staffId: 'staff-manager',
        isAdmin: false,
        isClassTeacher: false,
        isClassManager: true,
      });
      await service.updateMissedTeachingExplanationForStaff(
        'user-1',
        UserRole.staff,
        'exp-1',
        updateDto,
        actor,
      );
      expect(explanationService.updateExplanation).toHaveBeenCalledWith(
        'exp-1',
        updateDto,
        actor,
        undefined,
      );
    });

    it('gia sư sửa chỉ trong phạm vi buổi của mình', async () => {
      staffOperationsAccess.resolveClassWorkAccess.mockResolvedValue({
        staffId: 'teacher-1',
        isAdmin: false,
        isClassTeacher: true,
        isClassManager: false,
      });
      await service.updateMissedTeachingExplanationForStaff(
        'user-1',
        UserRole.staff,
        'exp-1',
        updateDto,
        actor,
      );
      expect(explanationService.updateExplanation).toHaveBeenCalledWith(
        'exp-1',
        updateDto,
        actor,
        { restrictTeacherId: 'teacher-1' },
      );
    });
  });
});
