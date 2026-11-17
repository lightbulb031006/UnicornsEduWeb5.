jest.mock('src/prisma/prisma.service', () => ({
  PrismaService: class PrismaServiceMock {},
}));
jest.mock('./dashboard.service', () => ({
  DashboardService: class DashboardServiceMock {},
}));
jest.mock('./monthly-report.service', () => ({
  MonthlyReportService: class MonthlyReportServiceMock {},
}));
jest.mock('./financial-export-pdf.service', () => ({
  FinancialExportPdfService: class FinancialExportPdfServiceMock {},
}));
jest.mock('./financial-export-excel.service', () => ({
  FinancialExportExcelService: class FinancialExportExcelServiceMock {},
}));
jest.mock('./monthly-statistics-export-pdf.service', () => ({
  MonthlyStatisticsExportPdfService: class MonthlyStatisticsExportPdfServiceMock {},
}));
jest.mock('./student-demographics-export-pdf.service', () => ({
  StudentDemographicsExportPdfService: class StudentDemographicsExportPdfServiceMock {},
}));

import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { StaffRole, UserRole } from 'generated/enums';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { DashboardController } from './dashboard.controller';

/**
 * #269: Dashboard, Báo cáo tháng, Thống kê học sinh chỉ Admin.
 * Chạy RolesGuard thật trên metadata thật của từng route trong DashboardController.
 */
describe('DashboardController — chỉ Admin (#269)', () => {
  const routeNames = Object.getOwnPropertyNames(
    DashboardController.prototype,
  ).filter((name) => name !== 'constructor');

  const authAccessService = { resolveForUserId: jest.fn() };
  const authIdentityCacheService = { getStaffRoles: jest.fn() };
  const guard = new RolesGuard(
    new Reflector(),
    authIdentityCacheService as never,
    authAccessService as never,
  );

  function contextFor(
    methodName: string,
    roleType: UserRole,
    staffRoles: StaffRole[],
    adminTier: 'full' | 'sale_customer_care_head' | 'accountant' | null,
  ): ExecutionContext {
    const handler = (
      DashboardController.prototype as unknown as Record<string, unknown>
    )[methodName];
    const request = {
      user: {
        id: 'user-1',
        email: 'user-1@example.com',
        accountHandle: 'user-1',
        roleType,
      },
      resolvedAuthAccess: {
        effectiveRoleTypes: [roleType],
        staffRoles,
        access: { admin: { canAccess: adminTier !== null, tier: adminTier } },
      },
    };
    return {
      getHandler: () => handler,
      getClass: () => DashboardController,
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
  }

  it('phủ các route dashboard, báo cáo tháng, thống kê học sinh', () => {
    expect(routeNames).toEqual(
      expect.arrayContaining([
        'getAdminMonthlyReport',
        'getStudentDemographics',
        'getStudentDemographicsPdf',
        'getAdminMonthlyStatistics',
      ]),
    );
  });

  describe.each(routeNames)('%s', (methodName) => {
    it('cho phép users.role_type admin', async () => {
      await expect(
        guard.canActivate(contextFor(methodName, UserRole.admin, [], 'full')),
      ).resolves.toBe(true);
    });

    it('cho phép staff có role admin', async () => {
      await expect(
        guard.canActivate(
          contextFor(methodName, UserRole.staff, [StaffRole.admin], 'full'),
        ),
      ).resolves.toBe(true);
    });

    it.each([
      [
        'Trợ lí / TP Sale & CSKH',
        [StaffRole.sale_customer_care_head],
        'sale_customer_care_head',
      ],
      ['Kế toán thu', [StaffRole.accountant_income], 'accountant'],
      ['Kế toán chi', [StaffRole.accountant_expense], 'accountant'],
      [
        'Trợ lí kiêm Kế toán thu',
        [StaffRole.sale_customer_care_head, StaffRole.accountant_income],
        'sale_customer_care_head',
      ],
      ['CSKH', [StaffRole.customer_care], null],
      ['Gia sư', [StaffRole.teacher], null],
    ] as const)('từ chối %s', async (_label, roles, tier) => {
      await expect(
        guard.canActivate(
          contextFor(methodName, UserRole.staff, [...roles], tier),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
