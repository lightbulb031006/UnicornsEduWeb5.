jest.mock('src/prisma/prisma.service', () => ({
  PrismaService: class PrismaServiceMock {},
}));
jest.mock('src/fixed-salary-settings/fixed-salary-settings.service', () => ({
  FixedSalarySettingsService: class FixedSalarySettingsServiceMock {},
}));
jest.mock('src/auth/auth-identity-cache.service', () => ({
  AuthIdentityCacheService: class AuthIdentityCacheServiceMock {},
}));
jest.mock('src/storage/supabase-storage', () => ({
  createSignedStorageUrl: jest.fn(({ path }: { path?: string | null }) =>
    Promise.resolve(path ? `signed:${path}` : null),
  ),
}));
jest.mock('src/storage/user-avatar-upload', () => ({
  uploadUserAvatarFiles: jest.fn(),
}));

import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  PaymentStatus,
  StaffRole,
  StaffStatus,
  UserRole,
  UserStatus,
} from 'generated/enums';
import { createSignedStorageUrl } from 'src/storage/supabase-storage';
import { uploadUserAvatarFiles } from 'src/storage/user-avatar-upload';
import { SaleCsTeamService } from './sale-cs-team.service';

const HEAD_VIEWER = {
  id: 'head-user',
  email: 'head@example.com',
  roleType: UserRole.staff,
};

/** Field Trưởng phòng không bao giờ được thấy ở hồ sơ thành viên. */
const HIDDEN_MEMBER_KEYS = [
  'email',
  'phone',
  'cccdNumber',
  'cccdIssuedDate',
  'cccdIssuedPlace',
  'ethnicity',
  'gender',
  'birthDate',
  'currentAddress',
  'bankAccount',
  'bankQrLink',
  'customAllowance',
];

function buildMemberRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'UNISTAFF-T1',
    status: StaffStatus.active,
    roles: [StaffRole.customer_care],
    university: 'ĐH Bách khoa',
    highSchool: null,
    customerCareDefaultProfitPercent: 0.25,
    user: {
      first_name: 'An',
      last_name: 'Nguyễn',
      accountHandle: 'an',
      avatarPath: 'avatars/an.png',
      roleType: UserRole.staff,
      status: UserStatus.active,
      province: 'Đà Nẵng',
    },
    customerCareManagedBy: {
      id: 'UNISTAFF-HEAD',
      user: { first_name: 'Bình', last_name: 'Trần', accountHandle: null },
    },
    _count: { customerCareServices: 3, achievements: 2 },
    ...overrides,
  };
}

function buildTarget(
  roles: StaffRole[],
  overrides: Record<string, unknown> = {},
) {
  return {
    id: 'UNISTAFF-T1',
    roles,
    userId: 'target-user',
    university: null,
    highSchool: null,
    user: {
      first_name: 'An',
      last_name: 'Nguyễn',
      accountHandle: 'an',
      email: 'an@example.com',
      roleType: UserRole.staff,
      status: UserStatus.active,
    },
    _count: { customerCareServices: 0 },
    ...overrides,
  };
}

describe('SaleCsTeamService (#271)', () => {
  const mockPrisma = {
    staffInfo: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
    user: { update: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn() },
    customerCareService: { deleteMany: jest.fn() },
    extraAllowance: { findMany: jest.fn() },
    bonus: { findMany: jest.fn() },
    $transaction: jest.fn(),
  };
  const mockActionHistory = { recordUpdate: jest.fn() };
  const mockAuthCache = { invalidateUser: jest.fn() };
  const mockFixedSalary = { syncStaffRoleOverridesInTx: jest.fn() };
  const mockAchievement = {
    listStaffAchievements: jest.fn(),
    resolveOtherStaffAchievementEditor: jest.fn(),
  };

  let service: SaleCsTeamService;

  /** Lần gọi `staffInfo.findFirst` đầu tiên luôn là tra actor. */
  function mockActor(
    roles: StaffRole[] = [StaffRole.sale_customer_care_head],
    status: StaffStatus = StaffStatus.active,
  ) {
    mockPrisma.staffInfo.findFirst.mockResolvedValueOnce({
      id: 'UNISTAFF-HEAD',
      roles,
      status,
    });
  }

  beforeEach(() => {
    jest.resetAllMocks();
    jest
      .mocked(createSignedStorageUrl)
      .mockImplementation(({ path }) =>
        Promise.resolve(path ? `signed:${path}` : null),
      );
    mockPrisma.$transaction.mockImplementation(
      async (callback: (tx: typeof mockPrisma) => unknown) =>
        callback(mockPrisma),
    );
    service = new SaleCsTeamService(
      mockPrisma as never,
      mockActionHistory as never,
      mockAuthCache as never,
      mockFixedSalary as never,
      mockAchievement as never,
    );
  });

  describe('quyền truy cập', () => {
    it.each([
      ['CSKH thường', [StaffRole.customer_care], StaffStatus.active],
      ['Sale thường', [StaffRole.sale], StaffStatus.active],
      ['Kế toán chi', [StaffRole.accountant_expense], StaffStatus.active],
      [
        'Trưởng phòng đã ngừng hoạt động',
        [StaffRole.sale_customer_care_head],
        StaffStatus.inactive,
      ],
    ])('chặn %s', async (_label, roles, status) => {
      mockActor(roles, status);
      await expect(service.listMembers(HEAD_VIEWER, {})).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(mockPrisma.staffInfo.findMany).not.toHaveBeenCalled();
    });

    it('chặn người không có hồ sơ nhân sự', async () => {
      mockPrisma.staffInfo.findFirst.mockResolvedValueOnce(null);
      await expect(service.listMembers(HEAD_VIEWER, {})).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('xem đội', () => {
    it('trả allowlist field (kèm Tỉnh/TP, số thành tích), % CSKH chỉ đọc và cờ quyền theo dòng', async () => {
      mockActor();
      mockPrisma.staffInfo.count.mockResolvedValue(1);
      mockPrisma.staffInfo.findMany.mockResolvedValue([buildMemberRow()]);

      const result = await service.listMembers(HEAD_VIEWER, {});

      expect(result.meta).toEqual({ total: 1, page: 1, limit: 20 });
      const [member] = result.data;
      expect(member).toMatchObject({
        id: 'UNISTAFF-T1',
        fullName: 'Nguyễn An',
        avatarUrl: 'signed:avatars/an.png',
        accountLocked: false,
        customerCareDefaultProfitPercent: 0.25,
        managedBy: { id: 'UNISTAFF-HEAD', fullName: 'Trần Bình' },
        customerCareStudentCount: 3,
        province: 'Đà Nẵng',
        achievementCount: 2,
        permissions: {
          canEditRoles: true,
          canLockAccount: true,
          canEditAccountHandle: true,
          canEditProfile: true,
          canEditAchievements: true,
        },
      });
      for (const key of HIDDEN_MEMBER_KEYS) {
        expect(member).not.toHaveProperty(key);
      }
      const select = mockPrisma.staffInfo.findMany.mock.calls[0][0].select;
      for (const key of HIDDEN_MEMBER_KEYS) {
        expect(select).not.toHaveProperty(key);
        expect(select.user.select).not.toHaveProperty(key);
      }
    });

    it('cờ quyền tắt với thành viên kiêm role ngoài đội / mang role trưởng', async () => {
      mockActor();
      mockPrisma.staffInfo.count.mockResolvedValue(2);
      mockPrisma.staffInfo.findMany.mockResolvedValue([
        buildMemberRow({
          id: 'UNISTAFF-MIX',
          roles: [StaffRole.customer_care, StaffRole.teacher],
        }),
        buildMemberRow({
          id: 'UNISTAFF-OTHERHEAD',
          roles: [StaffRole.sale, StaffRole.sale_customer_care_head],
        }),
      ]);

      const { data } = await service.listMembers(HEAD_VIEWER, {});

      expect(data[0].permissions).toEqual({
        canEditRoles: true,
        canLockAccount: false,
        canEditAccountHandle: false,
        canEditProfile: true,
        canEditAchievements: true,
      });
      expect(data[1].permissions).toEqual({
        canEditRoles: false,
        canLockAccount: false,
        canEditAccountHandle: false,
        canEditProfile: false,
        canEditAchievements: false,
      });
    });

    it('ứng viên chỉ lấy nhân sự đang hoạt động, bỏ qua lọc trạng thái', async () => {
      mockActor();
      mockPrisma.staffInfo.count.mockResolvedValue(0);
      mockPrisma.staffInfo.findMany.mockResolvedValue([]);

      await service.listMembers(HEAD_VIEWER, {
        scope: 'candidates',
        status: StaffStatus.inactive,
      });

      const where = mockPrisma.staffInfo.findMany.mock.calls[0][0].where;
      expect(where.AND[0].status).toBe(StaffStatus.active);
      expect(where.AND).not.toContainEqual({ status: StaffStatus.inactive });
    });

    it('danh sách thành viên vẫn lọc theo trạng thái người dùng chọn', async () => {
      mockActor();
      mockPrisma.staffInfo.count.mockResolvedValue(0);
      mockPrisma.staffInfo.findMany.mockResolvedValue([]);

      await service.listMembers(HEAD_VIEWER, { status: StaffStatus.inactive });

      const where = mockPrisma.staffInfo.findMany.mock.calls[0][0].where;
      expect(where.AND).toContainEqual({ status: StaffStatus.inactive });
    });

    it('chi tiết thêm handle, Google Meet nhưng không select field cá nhân (#270)', async () => {
      mockActor();
      mockPrisma.staffInfo.findFirst.mockResolvedValueOnce(
        buildMemberRow({
          googleMeetLink: 'https://meet.google.com/abc-defg-hij',
          user: {
            first_name: 'An',
            last_name: 'Nguyễn',
            accountHandle: 'an',
            avatarPath: null,
            roleType: UserRole.staff,
            status: UserStatus.active,
            province: 'Hà Nội',
          },
        }),
      );

      const result = await service.getMember(HEAD_VIEWER, 'UNISTAFF-T1');

      expect(result).toMatchObject({
        accountHandle: 'an',
        province: 'Hà Nội',
        googleMeetLink: 'https://meet.google.com/abc-defg-hij',
      });
      const { select } = (
        mockPrisma.staffInfo.findFirst.mock.calls as unknown as Array<
          [{ select: { user: { select: object } } }]
        >
      )[1][0];
      for (const key of [
        'cccdNumber',
        'birthDate',
        'ethnicity',
        'gender',
        'currentAddress',
        'bankAccount',
        'bankQrLink',
      ]) {
        expect(select).not.toHaveProperty(key);
      }
      expect(select.user.select).not.toHaveProperty('email');
      expect(select.user.select).not.toHaveProperty('phone');
    });

    it('thành tích: chỉ thành viên đội, đọc qua AchievementService', async () => {
      mockActor();
      mockPrisma.staffInfo.findFirst.mockResolvedValueOnce({
        id: 'UNISTAFF-T1',
      });
      mockAchievement.listStaffAchievements.mockResolvedValue([{ id: 'a-1' }]);

      await expect(
        service.listAchievements(HEAD_VIEWER, 'UNISTAFF-T1'),
      ).resolves.toEqual([{ id: 'a-1' }]);
      expect(mockAchievement.listStaffAchievements).toHaveBeenCalledWith(
        'UNISTAFF-T1',
      );
    });

    it('thành tích: 404 với nhân sự ngoài đội, không đọc thành tích', async () => {
      mockActor();
      mockPrisma.staffInfo.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.listAchievements(HEAD_VIEWER, 'UNISTAFF-X'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(mockAchievement.listStaffAchievements).not.toHaveBeenCalled();
    });

    it('404 khi xem nhân sự ngoài đội', async () => {
      mockActor();
      mockPrisma.staffInfo.findFirst.mockResolvedValueOnce(null);
      await expect(
        service.getMember(HEAD_VIEWER, 'UNISTAFF-X'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('trợ cấp sale không select số tiền / trạng thái thanh toán', async () => {
      mockActor();
      mockPrisma.staffInfo.findFirst.mockResolvedValueOnce({
        id: 'UNISTAFF-T1',
      });
      mockPrisma.extraAllowance.findMany.mockResolvedValue([
        {
          id: 'ea-1',
          month: '2026-11',
          note: 'Chốt HS mới',
          createdAt: new Date('2026-11-05T03:00:00Z'),
          student: { id: 'UNISTU-1', fullName: 'Lê Cường' },
        },
      ]);

      const result = await service.listSaleAllowances(
        HEAD_VIEWER,
        'UNISTAFF-T1',
        { month: '2026-11' },
      );

      const args = mockPrisma.extraAllowance.findMany.mock.calls[0][0];
      expect(args.where).toEqual({
        staffId: 'UNISTAFF-T1',
        roleType: StaffRole.sale,
        month: '2026-11',
      });
      expect(args.select).not.toHaveProperty('amount');
      expect(args.select).not.toHaveProperty('status');
      expect(args.select).not.toHaveProperty('taxDeductionRatePercent');
      expect(result).toEqual([
        {
          id: 'ea-1',
          month: '2026-11',
          note: 'Chốt HS mới',
          createdAt: '2026-11-05T03:00:00.000Z',
          student: { id: 'UNISTU-1', fullName: 'Lê Cường' },
        },
      ]);
      expect(result[0]).not.toHaveProperty('amount');
    });

    it('tháng sai định dạng → 400', async () => {
      mockActor();
      mockPrisma.staffInfo.findFirst.mockResolvedValueOnce({
        id: 'UNISTAFF-T1',
      });
      await expect(
        service.listSaleAllowances(HEAD_VIEWER, 'UNISTAFF-T1', {
          month: '11/2026',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('thưởng có số tiền', async () => {
      mockActor();
      mockPrisma.staffInfo.findFirst.mockResolvedValueOnce({
        id: 'UNISTAFF-T1',
      });
      mockPrisma.bonus.findMany.mockResolvedValue([
        {
          id: 'b-1',
          workType: 'Thưởng đội',
          amount: 500000,
          status: PaymentStatus.pending,
          note: null,
          month: '2026-11',
          date: new Date('2026-11-10T00:00:00Z'),
          createdAt: new Date('2026-11-10T03:15:00Z'),
        },
      ]);

      const result = await service.listBonuses(HEAD_VIEWER, 'UNISTAFF-T1', {});

      expect(result).toEqual([
        {
          id: 'b-1',
          workType: 'Thưởng đội',
          amount: 500000,
          status: PaymentStatus.pending,
          note: null,
          month: '2026-11',
          date: '2026-11-10',
          createdAt: '2026-11-10T03:15:00.000Z',
        },
      ]);
    });
  });

  describe('bật/tắt role', () => {
    it('cho bật CSKH cho Sale, ghi audit, xoá cache auth', async () => {
      mockActor();
      mockPrisma.staffInfo.findUnique.mockResolvedValue(
        buildTarget([StaffRole.sale]),
      );

      const result = await service.updateRoles(HEAD_VIEWER, 'UNISTAFF-T1', {
        roles: [StaffRole.sale, StaffRole.customer_care],
      });

      expect(result).toEqual({
        id: 'UNISTAFF-T1',
        roles: [StaffRole.sale, StaffRole.customer_care],
        releasedCustomerCareStudentCount: 0,
      });
      expect(mockPrisma.customerCareService.deleteMany).not.toHaveBeenCalled();
      expect(mockPrisma.staffInfo.update).toHaveBeenCalledWith({
        where: { id: 'UNISTAFF-T1' },
        data: { roles: [StaffRole.sale, StaffRole.customer_care] },
        select: { id: true },
      });
      expect(mockActionHistory.recordUpdate).toHaveBeenCalledTimes(1);
      expect(mockFixedSalary.syncStaffRoleOverridesInTx).not.toHaveBeenCalled();
      expect(mockAuthCache.invalidateUser).toHaveBeenCalledWith('target-user');
    });

    it('tắt Sale thì đồng bộ mức đè lương cứng', async () => {
      mockActor();
      mockPrisma.staffInfo.findUnique.mockResolvedValue(
        buildTarget([StaffRole.sale, StaffRole.customer_care]),
      );

      await service.updateRoles(HEAD_VIEWER, 'UNISTAFF-T1', {
        roles: [StaffRole.customer_care],
      });

      expect(mockFixedSalary.syncStaffRoleOverridesInTx).toHaveBeenCalledWith(
        mockPrisma,
        expect.objectContaining({
          staffId: 'UNISTAFF-T1',
          nextRoles: [StaffRole.customer_care],
          items: [],
        }),
      );
    });

    it('tắt CSKH còn học sinh: gỡ gán mọi học sinh trong cùng transaction (follow-up 2.1)', async () => {
      mockActor();
      mockPrisma.staffInfo.findUnique.mockResolvedValue(
        buildTarget([StaffRole.sale, StaffRole.customer_care], {
          _count: { customerCareServices: 2 },
        }),
      );
      mockPrisma.customerCareService.deleteMany.mockResolvedValue({ count: 2 });

      const result = await service.updateRoles(HEAD_VIEWER, 'UNISTAFF-T1', {
        roles: [StaffRole.sale],
      });

      expect(result).toEqual({
        id: 'UNISTAFF-T1',
        roles: [StaffRole.sale],
        releasedCustomerCareStudentCount: 2,
      });
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(mockPrisma.customerCareService.deleteMany).toHaveBeenCalledWith({
        where: { staffId: 'UNISTAFF-T1' },
      });
      expect(mockActionHistory.recordUpdate).toHaveBeenCalledWith(
        mockPrisma,
        expect.objectContaining({
          beforeValue: expect.objectContaining({ customerCareStudentCount: 2 }),
          afterValue: expect.objectContaining({ customerCareStudentCount: 0 }),
        }),
      );
    });

    it('tắt CSKH bị chặn quyền thì không gỡ học sinh nào', async () => {
      mockActor();
      const target = buildTarget(
        [StaffRole.training_head, StaffRole.customer_care],
        { _count: { customerCareServices: 2 } },
      );
      mockPrisma.staffInfo.findUnique.mockResolvedValue(target);

      await expect(
        service.updateRoles(HEAD_VIEWER, 'UNISTAFF-T1', { roles: [] }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(mockPrisma.customerCareService.deleteMany).not.toHaveBeenCalled();
    });

    it('bỏ hết role vẫn 400', async () => {
      mockActor();
      mockPrisma.staffInfo.findUnique.mockResolvedValue(
        buildTarget([StaffRole.customer_care]),
      );

      await expect(
        service.updateRoles(HEAD_VIEWER, 'UNISTAFF-T1', { roles: [] }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mockPrisma.customerCareService.deleteMany).not.toHaveBeenCalled();
    });

    it.each([
      ['Admin', [StaffRole.admin, StaffRole.sale], UserRole.staff],
      ['tài khoản admin hệ thống', [StaffRole.sale], UserRole.admin],
      [
        'Trưởng phòng khác',
        [StaffRole.sale_customer_care_head],
        UserRole.staff,
      ],
      [
        'Trưởng ban Đào tạo',
        [StaffRole.training_head, StaffRole.customer_care],
        UserRole.staff,
      ],
    ])('chặn chỉnh role của %s', async (_label, roles, roleType) => {
      mockActor();
      const target = buildTarget(roles);
      mockPrisma.staffInfo.findUnique.mockResolvedValue({
        ...target,
        user: { ...target.user, roleType },
      });

      await expect(
        service.updateRoles(HEAD_VIEWER, 'UNISTAFF-T1', {
          roles: [StaffRole.customer_care],
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(mockPrisma.staffInfo.update).not.toHaveBeenCalled();
    });

    it('chặn tự chỉnh role của chính mình', async () => {
      mockActor();
      mockPrisma.staffInfo.findUnique.mockResolvedValue(
        buildTarget([StaffRole.sale_customer_care_head], {
          id: 'UNISTAFF-HEAD',
        }),
      );

      await expect(
        service.updateRoles(HEAD_VIEWER, 'UNISTAFF-HEAD', {
          roles: [StaffRole.sale],
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('chặn bật role ngoài Sale/CSKH', async () => {
      mockActor();
      mockPrisma.staffInfo.findUnique.mockResolvedValue(
        buildTarget([StaffRole.sale]),
      );

      await expect(
        service.updateRoles(HEAD_VIEWER, 'UNISTAFF-T1', {
          roles: [StaffRole.sale, StaffRole.accountant_expense],
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('khoá tài khoản', () => {
    it('cho khoá nhân sự chỉ mang Sale/CSKH', async () => {
      mockActor();
      mockPrisma.staffInfo.findUnique.mockResolvedValue(
        buildTarget([StaffRole.sale, StaffRole.customer_care]),
      );

      const result = await service.updateAccountStatus(
        HEAD_VIEWER,
        'UNISTAFF-T1',
        { locked: true },
      );

      expect(result).toEqual({ id: 'UNISTAFF-T1', accountLocked: true });
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'target-user' },
        data: { status: UserStatus.inactive },
        select: { id: true },
      });
      expect(mockActionHistory.recordUpdate).toHaveBeenCalledTimes(1);
      expect(mockAuthCache.invalidateUser).toHaveBeenCalledWith('target-user');
    });

    it('cho mở khoá', async () => {
      mockActor();
      const target = buildTarget([StaffRole.customer_care]);
      mockPrisma.staffInfo.findUnique.mockResolvedValue({
        ...target,
        user: { ...target.user, status: UserStatus.inactive },
      });

      await service.updateAccountStatus(HEAD_VIEWER, 'UNISTAFF-T1', {
        locked: false,
      });

      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: UserStatus.active } }),
      );
    });

    it.each([
      ['CSKH kiêm gia sư', [StaffRole.customer_care, StaffRole.teacher]],
      ['Sale kiêm Kế toán thu', [StaffRole.sale, StaffRole.accountant_income]],
      ['Trưởng phòng khác', [StaffRole.sale_customer_care_head]],
      ['Admin', [StaffRole.admin]],
    ])('chặn khoá %s (403)', async (_label, roles) => {
      mockActor();
      mockPrisma.staffInfo.findUnique.mockResolvedValue(buildTarget(roles));

      await expect(
        service.updateAccountStatus(HEAD_VIEWER, 'UNISTAFF-T1', {
          locked: true,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('đổi tên đăng nhập (16/11)', () => {
    it('đổi handle nhân sự chỉ mang Sale/CSKH: ghi users, audit staff, xoá cache auth', async () => {
      mockActor();
      mockPrisma.staffInfo.findUnique.mockResolvedValue(
        buildTarget([StaffRole.sale]),
      );
      mockPrisma.user.findUnique.mockResolvedValue({ accountHandle: 'sale01' });
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await expect(
        service.updateAccountHandle(HEAD_VIEWER, 'UNISTAFF-T1', {
          accountHandle: 'sale_moi',
        }),
      ).resolves.toEqual({ id: 'UNISTAFF-T1', accountHandle: 'sale_moi' });
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'target-user' },
        data: { accountHandle: 'sale_moi' },
        select: { id: true },
      });
      expect(mockActionHistory.recordUpdate).toHaveBeenCalledWith(
        mockPrisma,
        expect.objectContaining({
          entityType: 'staff',
          entityId: 'UNISTAFF-T1',
          beforeValue: { accountHandle: 'sale01' },
          afterValue: { accountHandle: 'sale_moi' },
        }),
      );
      expect(mockAuthCache.invalidateUser).toHaveBeenCalledWith('target-user');
    });

    it.each([
      ['CSKH kiêm gia sư', [StaffRole.customer_care, StaffRole.teacher]],
      ['Trưởng phòng khác', [StaffRole.sale_customer_care_head]],
      ['Admin', [StaffRole.admin]],
    ])('chặn đổi handle %s (403), không chạm users', async (_label, roles) => {
      mockActor();
      mockPrisma.staffInfo.findUnique.mockResolvedValue(buildTarget(roles));

      await expect(
        service.updateAccountHandle(HEAD_VIEWER, 'UNISTAFF-T1', {
          accountHandle: 'abc_moi',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('hồ sơ chuyên môn', () => {
    it('chỉ ghi họ tên + trường, không đụng field cá nhân', async () => {
      mockActor();
      mockPrisma.staffInfo.findUnique.mockResolvedValue(
        buildTarget([StaffRole.customer_care, StaffRole.teacher]),
      );
      // getMember sau khi lưu: tra actor + thành viên.
      mockActor();
      mockPrisma.staffInfo.findFirst.mockResolvedValueOnce(buildMemberRow());

      await service.updateProfessionalProfile(HEAD_VIEWER, 'UNISTAFF-T1', {
        firstName: ' Ân ',
        university: 'ĐH Sư phạm',
        // Field ngoài DTO (đã bị ValidationPipe loại) — service cũng bỏ qua.
        ...({ phone: '0900', bankAccount: '123' } as object),
      });

      expect(mockPrisma.staffInfo.update).toHaveBeenCalledWith({
        where: { id: 'UNISTAFF-T1' },
        data: { university: 'ĐH Sư phạm' },
        select: { id: true },
      });
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'target-user' },
        data: { first_name: 'Ân' },
        select: { id: true },
      });
    });

    it.each([
      ['ngoài đội', [StaffRole.teacher]],
      ['Trưởng ban Chuyên môn', [StaffRole.lesson_plan_head, StaffRole.sale]],
    ])('chặn sửa hồ sơ %s', async (_label, roles) => {
      mockActor();
      mockPrisma.staffInfo.findUnique.mockResolvedValue(buildTarget(roles));

      await expect(
        service.updateProfessionalProfile(HEAD_VIEWER, 'UNISTAFF-T1', {
          university: 'X',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(mockPrisma.staffInfo.update).not.toHaveBeenCalled();
    });

    it('chặn để trống tên', async () => {
      mockActor();
      mockPrisma.staffInfo.findUnique.mockResolvedValue(
        buildTarget([StaffRole.sale]),
      );
      await expect(
        service.updateProfessionalProfile(HEAD_VIEWER, 'UNISTAFF-T1', {
          firstName: '   ',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('sửa thành tích nhân sự dưới cấp', () => {
    it('trả editor «người khác» cho thành viên đội (kể cả kiêm role ngoài đội)', async () => {
      const editor = { kind: 'other', actor: { userId: 'head-user' } };
      mockActor();
      mockPrisma.staffInfo.findUnique.mockResolvedValue(
        buildTarget([StaffRole.customer_care, StaffRole.teacher]),
      );
      mockAchievement.resolveOtherStaffAchievementEditor.mockResolvedValue(
        editor,
      );

      await expect(
        service.resolveAchievementEditor(HEAD_VIEWER, 'UNISTAFF-T1'),
      ).resolves.toBe(editor);
      expect(
        mockAchievement.resolveOtherStaffAchievementEditor,
      ).toHaveBeenCalledWith(HEAD_VIEWER, 'UNISTAFF-T1');
    });

    it.each([
      ['ngoài đội', [StaffRole.teacher], {}],
      ['trưởng khác', [StaffRole.lesson_plan_head, StaffRole.sale], {}],
      [
        'Trưởng phòng Sale & CSKH khác',
        [StaffRole.sale_customer_care_head],
        {},
      ],
      [
        'tài khoản Admin',
        [StaffRole.sale],
        {
          user: {
            ...buildTarget([StaffRole.sale]).user,
            roleType: UserRole.admin,
          },
        },
      ],
      ['chính mình', [StaffRole.sale], { id: 'UNISTAFF-HEAD' }],
    ])('chặn sửa thành tích của %s', async (_label, roles, overrides) => {
      mockActor();
      mockPrisma.staffInfo.findUnique.mockResolvedValue(
        buildTarget(roles, overrides),
      );

      await expect(
        service.resolveAchievementEditor(HEAD_VIEWER, 'UNISTAFF-T1'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(
        mockAchievement.resolveOtherStaffAchievementEditor,
      ).not.toHaveBeenCalled();
    });

    it('không phải Trưởng phòng → 403, không tra target', async () => {
      mockActor([StaffRole.customer_care]);

      await expect(
        service.resolveAchievementEditor(HEAD_VIEWER, 'UNISTAFF-T1'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(mockPrisma.staffInfo.findUnique).not.toHaveBeenCalled();
    });

    it('nhân sự không tồn tại → 404', async () => {
      mockActor();
      mockPrisma.staffInfo.findUnique.mockResolvedValue(null);

      await expect(
        service.resolveAchievementEditor(HEAD_VIEWER, 'UNISTAFF-T1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('đổi ảnh đại diện nhân sự dưới cấp', () => {
    const file = { buffer: Buffer.from('img'), mimetype: 'image/png', size: 3 };

    it('tải ảnh, lưu path, ghi audit, xoá cache auth rồi trả hồ sơ', async () => {
      mockActor();
      mockPrisma.staffInfo.findUnique.mockResolvedValue(
        buildTarget([StaffRole.customer_care], {
          user: {
            ...buildTarget([StaffRole.customer_care]).user,
            avatarPath: 'users/target-user/old',
            avatarWatermarkedPath: null,
          },
        }),
      );
      jest.mocked(uploadUserAvatarFiles).mockResolvedValue({
        avatarPath: 'users/target-user/avatar',
        avatarWatermarkedPath: 'users/target-user/avatar.jpg',
      });
      // getMember sau khi lưu: tra actor + thành viên.
      mockActor();
      mockPrisma.staffInfo.findFirst.mockResolvedValueOnce(buildMemberRow());

      const result = await service.uploadAvatar(
        HEAD_VIEWER,
        'UNISTAFF-T1',
        file,
      );

      expect(uploadUserAvatarFiles).toHaveBeenCalledWith('target-user', file);
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'target-user' },
        data: {
          avatarPath: 'users/target-user/avatar',
          avatarWatermarkedPath: 'users/target-user/avatar.jpg',
        },
        select: { id: true },
      });
      expect(mockActionHistory.recordUpdate).toHaveBeenCalledWith(
        mockPrisma,
        expect.objectContaining({
          entityId: 'UNISTAFF-T1',
          beforeValue: {
            avatarPath: 'users/target-user/old',
            avatarWatermarkedPath: null,
          },
        }),
      );
      expect(mockAuthCache.invalidateUser).toHaveBeenCalledWith('target-user');
      expect(result.id).toBe('UNISTAFF-T1');
    });

    it.each([
      ['ngoài đội', [StaffRole.teacher], {}],
      ['trưởng khác', [StaffRole.lesson_plan_head, StaffRole.sale], {}],
      ['chính mình', [StaffRole.sale], { id: 'UNISTAFF-HEAD' }],
    ])(
      'chặn đổi ảnh %s, không tải gì lên',
      async (_label, roles, overrides) => {
        mockActor();
        mockPrisma.staffInfo.findUnique.mockResolvedValue(
          buildTarget(roles, overrides),
        );

        await expect(
          service.uploadAvatar(HEAD_VIEWER, 'UNISTAFF-T1', file),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(uploadUserAvatarFiles).not.toHaveBeenCalled();
      },
    );

    it('nhân sự chưa có tài khoản / thiếu ảnh → 400', async () => {
      mockActor();
      mockPrisma.staffInfo.findUnique.mockResolvedValue(
        buildTarget([StaffRole.sale], { userId: null, user: null }),
      );
      await expect(
        service.uploadAvatar(HEAD_VIEWER, 'UNISTAFF-T1', file),
      ).rejects.toBeInstanceOf(BadRequestException);

      mockActor();
      mockPrisma.staffInfo.findUnique.mockResolvedValue(
        buildTarget([StaffRole.sale]),
      );
      await expect(
        service.uploadAvatar(HEAD_VIEWER, 'UNISTAFF-T1', undefined),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(uploadUserAvatarFiles).not.toHaveBeenCalled();
    });
  });
});
