jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class PrismaServiceMock {},
}));

import { ForbiddenException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { PaymentStatus, StaffRole } from '../../generated/enums';
import { LessonController } from './lesson.controller';
import { LessonManagementGuard } from './lesson-management.guard';
import {
  assertCanDeleteLessonWork,
  assertCanSetLessonOutputPricing,
  canDeleteLessonResource,
  canDeleteLessonWork,
  canEditLessonOutputPaymentStatus,
  LESSON_PRICING_FORBIDDEN_MESSAGE,
  LESSON_PRICING_PAID_FORBIDDEN_MESSAGE,
  type LessonPolicyActor,
} from './lesson-plan-head-policy';

const admin: LessonPolicyActor = {
  staffId: null,
  staffRoles: [StaffRole.admin],
  canManage: true,
};
const head: LessonPolicyActor = {
  staffId: 'staff-head',
  staffRoles: [StaffRole.lesson_plan_head],
  canManage: true,
};
const planner: LessonPolicyActor = {
  staffId: 'staff-planner',
  staffRoles: [StaffRole.lesson_plan],
  canManage: false,
};
const expenseAccountant: LessonPolicyActor = {
  staffId: 'staff-acc',
  staffRoles: [StaffRole.accountant_expense],
  canManage: false,
};

describe('lesson-plan-head-policy (#279, follow-up grill 13/11)', () => {
  describe('xoá đầu việc / sản phẩm / tài liệu', () => {
    it('Admin và Trưởng ban Chuyên môn được xoá', () => {
      expect(canDeleteLessonWork(admin)).toBe(true);
      expect(canDeleteLessonWork(head)).toBe(true);
      expect(() => assertCanDeleteLessonWork(head)).not.toThrow();
    });

    it('Ban Chuyên môn thường và Kế toán chi bị từ chối', () => {
      expect(canDeleteLessonWork(planner)).toBe(false);
      expect(() => assertCanDeleteLessonWork(planner)).toThrow(
        ForbiddenException,
      );
      expect(() => assertCanDeleteLessonWork(expenseAccountant)).toThrow(
        ForbiddenException,
      );
    });
  });

  describe('trạng thái thanh toán', () => {
    it('chỉ Admin và Kế toán chi sửa', () => {
      expect(canEditLessonOutputPaymentStatus(admin)).toBe(true);
      expect(canEditLessonOutputPaymentStatus(expenseAccountant)).toBe(true);
    });

    it('Trưởng ban Chuyên môn và Ban Chuyên môn thường bị từ chối', () => {
      expect(canEditLessonOutputPaymentStatus(head)).toBe(false);
      expect(canEditLessonOutputPaymentStatus(planner)).toBe(false);
    });
  });

  describe('xoá tài nguyên giáo án', () => {
    const asResourceActor = (
      actor: LessonPolicyActor,
      userId: string,
      canParticipate: boolean,
    ) => ({ ...actor, userId, canParticipate });

    it('Admin và Trưởng ban xoá mọi tài nguyên; người tạo xoá tài nguyên của mình', () => {
      expect(
        canDeleteLessonResource(asResourceActor(admin, 'u-admin', true), 'u-x'),
      ).toBe(true);
      expect(
        canDeleteLessonResource(asResourceActor(head, 'u-head', true), 'u-x'),
      ).toBe(true);
      expect(
        canDeleteLessonResource(
          asResourceActor(planner, 'u-planner', true),
          'u-planner',
        ),
      ).toBe(true);
    });

    it('Ban Chuyên môn thường không xoá tài nguyên của người khác', () => {
      expect(
        canDeleteLessonResource(
          asResourceActor(planner, 'u-planner', true),
          'u-x',
        ),
      ).toBe(false);
      expect(
        canDeleteLessonResource(
          asResourceActor(planner, 'u-planner', true),
          null,
        ),
      ).toBe(false);
      // Mất role giáo án → không xoá kể cả tài nguyên tự tạo.
      expect(
        canDeleteLessonResource(
          asResourceActor(expenseAccountant, 'u-acc', false),
          'u-acc',
        ),
      ).toBe(false);
    });
  });

  describe('tự khai chi phí giáo án (bậc độ khó / level / hạng mục)', () => {
    it('Admin cài được cho mọi output, kể cả đã thanh toán', () => {
      expect(() => assertCanSetLessonOutputPricing(admin, null)).not.toThrow();
      expect(() =>
        assertCanSetLessonOutputPricing(
          admin,
          'staff-other',
          PaymentStatus.paid,
        ),
      ).not.toThrow();
    });

    it('Trưởng ban sửa output của người khác và tự khai output của mình khi chưa thanh toán', () => {
      expect(() =>
        assertCanSetLessonOutputPricing(head, 'staff-other'),
      ).not.toThrow();
      expect(() => assertCanSetLessonOutputPricing(head, null)).not.toThrow();
      expect(() =>
        assertCanSetLessonOutputPricing(head, 'staff-head'),
      ).not.toThrow();
    });

    it('Ban Chuyên môn thường tự khai output của chính mình khi chưa thanh toán', () => {
      expect(() =>
        assertCanSetLessonOutputPricing(
          planner,
          'staff-planner',
          PaymentStatus.pending,
        ),
      ).not.toThrow();
    });

    it('Ban Chuyên môn thường không sửa output của người khác', () => {
      expect(() =>
        assertCanSetLessonOutputPricing(planner, 'staff-other'),
      ).toThrow(LESSON_PRICING_FORBIDDEN_MESSAGE);
      expect(() => assertCanSetLessonOutputPricing(planner, null)).toThrow(
        ForbiddenException,
      );
    });

    it('output đã thanh toán khoá với mọi người trừ Admin', () => {
      for (const [actor, staffId] of [
        [planner, 'staff-planner'],
        [head, 'staff-head'],
        [head, 'staff-other'],
      ] as const) {
        expect(() =>
          assertCanSetLessonOutputPricing(actor, staffId, PaymentStatus.paid),
        ).toThrow(LESSON_PRICING_PAID_FORBIDDEN_MESSAGE);
      }
    });
  });

  describe('route xoá đầu việc / sản phẩm', () => {
    it.each(['deleteTask', 'deleteOutput'] as const)(
      'LessonController.%s chỉ qua LessonManagementGuard (Admin + Trưởng ban Chuyên môn)',
      (methodName) => {
        const guards = Reflect.getMetadata(
          GUARDS_METADATA,
          LessonController.prototype[methodName],
        ) as unknown[];
        expect(guards).toEqual([LessonManagementGuard]);
      },
    );
  });
});
