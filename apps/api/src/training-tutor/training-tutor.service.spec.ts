jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class PrismaServiceMock {},
}));
jest.mock('src/achievements/achievement.service', () => ({
  AchievementService: class AchievementServiceMock {},
}));
jest.mock('src/staff/staff.service', () => ({
  StaffService: class StaffServiceMock {},
}));
jest.mock('src/action-history/action-history.service', () => ({
  ActionHistoryService: class ActionHistoryServiceMock {},
}));
jest.mock('src/auth/auth-identity-cache.service', () => ({
  AuthIdentityCacheService: class AuthIdentityCacheServiceMock {},
}));
jest.mock('src/storage/image-watermark', () => ({
  bakeDiagonalWatermark: jest.fn(() =>
    Promise.resolve({ buffer: Buffer.from('wm'), contentType: 'image/jpeg' }),
  ),
  buildAvatarWatermarkedPath: (userId: string) => `users/${userId}/avatar.jpg`,
}));
jest.mock('src/storage/supabase-storage', () => ({
  createSignedStorageUrl: jest.fn(({ path }: { path?: string | null }) =>
    Promise.resolve(path ? `signed:${path}` : null),
  ),
  uploadStorageObject: jest.fn(() => Promise.resolve()),
  removeStorageObjects: jest.fn(() => Promise.resolve()),
  validateImageFile: jest.fn(),
}));

import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  ClassStatus,
  PaymentStatus,
  StaffRole,
  StaffStatus,
  UserRole,
  UserStatus,
} from '../../generated/enums';
import { uploadStorageObject } from 'src/storage/supabase-storage';
import type { Prisma } from '../../generated/client';
import { TrainingTutorService } from './training-tutor.service';

type StaffFindManyArgs = {
  where: Prisma.StaffInfoWhereInput;
  select: Prisma.StaffInfoSelect;
  skip: number;
  take: number;
};
type SessionFindManyArgs = {
  where: Prisma.SessionWhereInput;
  select: Prisma.SessionSelect;
};

function firstCallArg<T>(mock: jest.Mock): T {
  return (mock.mock.calls as T[][])[0][0];
}

/** Field Ban Đào Tạo không bao giờ được thấy (CONTEXT.md: Ban Đào Tạo). */
const HIDDEN_STAFF_KEYS = [
  'email',
  'phone',
  'cccdNumber',
  'cccdIssuedDate',
  'cccdIssuedPlace',
  'ethnicity',
  'gender',
  'birthDate',
  'currentAddress',
  'address',
  'bankAccount',
  'bankQrLink',
  'googleMeetLink',
  'revenueSharePercent',
  'unpaidAmountTotal',
  'customAllowance',
];
const HIDDEN_SESSION_KEYS = [
  'allowanceAmount',
  'teacherPaymentStatus',
  'trainingManagerAllowanceAmount',
  'trainingManagerPaymentStatus',
  'tuitionFee',
  'googleMeetLink',
  'coefficient',
];

/** Row Prisma giả lập rò rỉ: có cả field nhạy cảm, service phải tự loại bỏ. */
function leakyTutorRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'UNISTAFF-0000000001',
    status: StaffStatus.inactive,
    roles: [StaffRole.teacher],
    university: 'ĐH A',
    highSchool: 'THPT B',
    cccdNumber: '001',
    ethnicity: 'x',
    gender: 'male',
    birthDate: new Date('2000-01-01'),
    currentAddress: 'addr',
    bankAccount: '123',
    bankQrLink: 'qr',
    googleMeetLink: 'meet',
    user: {
      first_name: 'Gia',
      last_name: 'Sư',
      accountHandle: 'gs',
      email: 'gs@example.com',
      phone: '0900',
      avatarPath: 'a/b.png',
      address: 'addr',
      birthDate: new Date('2000-01-01'),
    },
    _count: { achievements: 2, sessions: 7 },
    ...overrides,
  };
}

function collectKeys(value: unknown, keys = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    value.forEach((item) => collectKeys(item, keys));
  } else if (value && typeof value === 'object' && !(value instanceof Date)) {
    for (const [key, nested] of Object.entries(value)) {
      keys.add(key);
      collectKeys(nested, keys);
    }
  }
  return keys;
}

function expectNoHiddenKeys(value: unknown, hidden: string[]) {
  const keys = collectKeys(value);
  for (const key of hidden) {
    expect(keys.has(key)).toBe(false);
  }
}

describe('TrainingTutorService', () => {
  const mockPrisma = {
    staffInfo: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
    user: { update: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn() },
    bonus: { findMany: jest.fn() },
    session: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const mockActionHistory = { recordUpdate: jest.fn() };
  const mockAuthCache = { invalidateUser: jest.fn() };
  const mockStaffService = { updateStaffStatus: jest.fn() };
  const mockAchievements = {
    listStaffAchievements: jest.fn(),
    resolveOtherStaffAchievementEditor: jest.fn(),
  };
  const trainingViewer = { id: 'user-1', roleType: UserRole.staff };
  let service: TrainingTutorService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(
      (fn: (tx: typeof mockPrisma) => Promise<unknown>) => fn(mockPrisma),
    );
    service = new TrainingTutorService(
      mockPrisma as never,
      mockAchievements as never,
      mockActionHistory as never,
      mockAuthCache as never,
      mockStaffService as never,
    );
  });

  function mockViewer(
    roles: StaffRole[],
    status: StaffStatus = StaffStatus.active,
    id = 'UNISTAFF-HEAD',
  ) {
    mockPrisma.staffInfo.findFirst.mockResolvedValueOnce({ id, roles, status });
  }

  describe('assertTrainingViewer', () => {
    it('admin passes without staff lookup', async () => {
      await service.assertTrainingViewer({
        id: 'admin',
        roleType: UserRole.admin,
      });
      expect(mockPrisma.staffInfo.findFirst).not.toHaveBeenCalled();
    });

    it('active training staff passes', async () => {
      mockViewer([StaffRole.training]);
      await expect(
        service.assertTrainingViewer(trainingViewer),
      ).resolves.toBeUndefined();
    });

    it.each([
      [
        'operational-only staff',
        [StaffRole.accountant_income],
        StaffStatus.active,
      ],
      ['teacher only', [StaffRole.teacher], StaffStatus.active],
      ['inactive training staff', [StaffRole.training], StaffStatus.inactive],
    ])('rejects %s', async (_label, roles, status) => {
      mockViewer(roles, status);
      await expect(
        service.assertTrainingViewer(trainingViewer),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects user without staff profile', async () => {
      mockPrisma.staffInfo.findFirst.mockResolvedValueOnce(null);
      await expect(
        service.assertTrainingViewer(trainingViewer),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('listTutors', () => {
    it('returns allowlisted fields only, including inactive tutors', async () => {
      mockViewer([StaffRole.training]);
      mockPrisma.staffInfo.count.mockResolvedValue(1);
      mockPrisma.staffInfo.findMany.mockResolvedValue([leakyTutorRow()]);

      const result = await service.listTutors(trainingViewer, {});

      expect(result.meta).toEqual({ total: 1, page: 1, limit: 20 });
      expect(result.data).toEqual([
        {
          id: 'UNISTAFF-0000000001',
          fullName: 'Sư Gia',
          status: StaffStatus.inactive,
          roles: [StaffRole.teacher],
          avatarUrl: 'signed:a/b.png',
          university: 'ĐH A',
          highSchool: 'THPT B',
          achievementCount: 2,
          currentClasses: [],
        },
      ]);
      expectNoHiddenKeys(result, HIDDEN_STAFF_KEYS);

      const args = firstCallArg<StaffFindManyArgs>(
        mockPrisma.staffInfo.findMany,
      );
      expect(args.where.roles).toEqual({ has: StaffRole.teacher });
      expect(args.where).not.toHaveProperty('status');
      expectNoHiddenKeys(args.select, HIDDEN_STAFF_KEYS);
    });

    it('lists only current classes on each row', async () => {
      mockViewer([StaffRole.training]);
      mockPrisma.staffInfo.count.mockResolvedValue(1);
      mockPrisma.staffInfo.findMany.mockResolvedValue([
        leakyTutorRow({
          classTeachers: [
            {
              status: null,
              class: { id: 'c1', name: 'Lớp 1', status: ClassStatus.running },
            },
            {
              status: 'inactive',
              class: { id: 'c2', name: 'Lớp 2', status: ClassStatus.running },
            },
            {
              status: 'active',
              class: { id: 'c3', name: 'Lớp 3', status: ClassStatus.ended },
            },
          ],
        }),
      ]);

      const result = await service.listTutors(trainingViewer, {});

      expect(result.data[0].currentClasses).toEqual([
        { id: 'c1', name: 'Lớp 1' },
      ]);
      expect(result.data[0]).not.toHaveProperty('pastClasses');
    });

    it('filters by status when requested', async () => {
      mockViewer([StaffRole.training]);
      mockPrisma.staffInfo.count.mockResolvedValue(0);
      mockPrisma.staffInfo.findMany.mockResolvedValue([]);

      await service.listTutors(trainingViewer, {
        status: StaffStatus.active,
        page: 2,
        limit: 10,
      });

      const args = firstCallArg<StaffFindManyArgs>(
        mockPrisma.staffInfo.findMany,
      );
      expect(args.where.status).toBe(StaffStatus.active);
      expect(args).toMatchObject({ skip: 10, take: 10 });
    });

    it('scope=all + role: lọc một nhóm, giữ điều kiện tìm theo tên', async () => {
      mockViewer([StaffRole.training_head]);
      mockPrisma.staffInfo.count.mockResolvedValue(0);
      mockPrisma.staffInfo.findMany.mockResolvedValue([]);

      await service.listTutors(trainingViewer, {
        scope: 'all',
        role: StaffRole.lesson_plan,
        search: 'An',
      });

      const args = firstCallArg<StaffFindManyArgs>(
        mockPrisma.staffInfo.findMany,
      );
      const and = args.where.AND as Array<Record<string, unknown>>;
      expect(and).toContainEqual({
        roles: { has: StaffRole.lesson_plan },
      });
      // Điều kiện tên vẫn còn (không bị đè bởi lọc role).
      expect(JSON.stringify(and)).toContain('An');
    });

    it('role bị bỏ qua ở scope gia sư (mặc định)', async () => {
      mockViewer([StaffRole.training]);
      mockPrisma.staffInfo.count.mockResolvedValue(0);
      mockPrisma.staffInfo.findMany.mockResolvedValue([]);

      await service.listTutors(trainingViewer, { role: StaffRole.training });

      const args = firstCallArg<StaffFindManyArgs>(
        mockPrisma.staffInfo.findMany,
      );
      expect(JSON.stringify(args.where)).not.toContain('"has":"training"');
    });

    it('forbids non-training staff before querying', async () => {
      mockViewer([StaffRole.customer_care]);
      await expect(
        service.listTutors(trainingViewer, {}),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(mockPrisma.staffInfo.findMany).not.toHaveBeenCalled();
    });

    it('scope=all: Trưởng ban xem nhân sự ba nhóm, role ngoài nhóm bị ẩn, vẫn allowlist', async () => {
      mockViewer([StaffRole.training_head]);
      mockPrisma.staffInfo.count.mockResolvedValue(1);
      mockPrisma.staffInfo.findMany.mockResolvedValue([
        leakyTutorRow({
          roles: [StaffRole.lesson_plan, StaffRole.customer_care],
        }),
      ]);

      const result = await service.listTutors(trainingViewer, {
        scope: 'all',
      });

      const args = firstCallArg<StaffFindManyArgs>(
        mockPrisma.staffInfo.findMany,
      );
      expect(args.where.roles).toEqual({
        hasSome: [StaffRole.teacher, StaffRole.lesson_plan, StaffRole.training],
      });
      expect(result.data[0].roles).toEqual([StaffRole.lesson_plan]);
      expect(result.data[0].management).toEqual({
        isSubordinate: true,
        hasOtherRoles: true,
        accountLocked: null,
        permissions: {
          canEditRoles: true,
          canEditProfile: true,
          canChangeStatus: false,
          canLockAccount: false,
          canEditAccountHandle: false,
          canManageMeetLink: true,
          canViewBonuses: true,
        },
      });
      expectNoHiddenKeys(result, HIDDEN_STAFF_KEYS);
      expectNoHiddenKeys(args.select, HIDDEN_STAFF_KEYS);
    });

    it('Admin vẫn thấy đủ role; Ban Đào Tạo thường không có management', async () => {
      mockPrisma.staffInfo.count.mockResolvedValue(1);
      mockPrisma.staffInfo.findMany.mockResolvedValue([
        leakyTutorRow({ roles: [StaffRole.teacher, StaffRole.sale] }),
      ]);
      const asAdmin = await service.listTutors(
        { id: 'admin', roleType: UserRole.admin },
        {},
      );
      expect(asAdmin.data[0].roles).toEqual([
        StaffRole.teacher,
        StaffRole.sale,
      ]);
      expect(asAdmin.data[0]).not.toHaveProperty('management');

      mockViewer([StaffRole.training]);
      const asTraining = await service.listTutors(trainingViewer, {});
      expect(asTraining.data[0].roles).toEqual([StaffRole.teacher]);
      expect(asTraining.data[0]).not.toHaveProperty('management');
    });

    it('scope=all: Ban Đào Tạo thường bị 403', async () => {
      mockViewer([StaffRole.training]);
      await expect(
        service.listTutors(trainingViewer, { scope: 'all' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(mockPrisma.staffInfo.findMany).not.toHaveBeenCalled();
    });

    it('Trưởng ban mặc định vẫn chỉ thấy gia sư', async () => {
      mockViewer([StaffRole.training_head]);
      mockPrisma.staffInfo.count.mockResolvedValue(0);
      mockPrisma.staffInfo.findMany.mockResolvedValue([]);

      await service.listTutors(trainingViewer, {});

      const args = firstCallArg<StaffFindManyArgs>(
        mockPrisma.staffInfo.findMany,
      );
      expect(args.where.roles).toEqual({ has: StaffRole.teacher });
    });
  });

  describe('getTutor', () => {
    it('splits current and past classes without leaking hidden fields', async () => {
      mockViewer([StaffRole.training]);
      mockPrisma.staffInfo.findFirst.mockResolvedValueOnce(
        leakyTutorRow({
          classTeachers: [
            {
              status: null,
              customAllowance: 999,
              class: { id: 'c1', name: 'L1', status: ClassStatus.running },
            },
            {
              status: 'inactive',
              class: { id: 'c2', name: 'L2', status: ClassStatus.running },
            },
            {
              status: 'active',
              class: { id: 'c3', name: 'L3', status: ClassStatus.ended },
            },
          ],
        }),
      );

      const result = await service.getTutor(
        trainingViewer,
        'UNISTAFF-0000000001',
      );

      expect(result.currentClasses).toEqual([{ id: 'c1', name: 'L1' }]);
      expect(result.pastClasses).toEqual([
        { id: 'c2', name: 'L2' },
        { id: 'c3', name: 'L3' },
      ]);
      expect(result.taughtSessionCount).toBe(7);
      expectNoHiddenKeys(result, HIDDEN_STAFF_KEYS);
      expect(collectKeys(result).has('user')).toBe(false);
    });

    it('404 when staff is not a tutor', async () => {
      mockViewer([StaffRole.training]);
      mockPrisma.staffInfo.findFirst.mockResolvedValueOnce(null);
      await expect(
        service.getTutor(trainingViewer, 'UNISTAFF-0000000002'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('Trưởng ban mở hồ sơ Ban Chuyên môn (không phải gia sư), chỉ trong ba nhóm', async () => {
      mockViewer([StaffRole.training_head]);
      mockPrisma.staffInfo.findFirst.mockResolvedValueOnce(
        leakyTutorRow({
          roles: [StaffRole.lesson_plan],
          classTeachers: [],
          user: {
            first_name: 'Gia',
            last_name: 'Sư',
            avatarPath: null,
            roleType: UserRole.staff,
            status: UserStatus.active,
            email: 'x@example.com',
          },
        }),
      );
      mockPrisma.staffInfo.findUnique.mockResolvedValueOnce({
        googleMeetLink: 'https://meet.google.com/abc',
      });

      const result = await service.getTutor(
        trainingViewer,
        'UNISTAFF-0000000001',
      );

      const args = (
        mockPrisma.staffInfo.findFirst.mock.calls as [
          { where: Prisma.StaffInfoWhereInput },
        ][]
      )[1][0];
      expect(args.where).toEqual({
        roles: {
          hasSome: [
            StaffRole.teacher,
            StaffRole.lesson_plan,
            StaffRole.training,
          ],
        },
        id: 'UNISTAFF-0000000001',
      });
      expect(result.roles).toEqual([StaffRole.lesson_plan]);
      expect(result.management).toMatchObject({
        isSubordinate: true,
        accountLocked: false,
        firstName: 'Gia',
        lastName: 'Sư',
        googleMeetLink: 'https://meet.google.com/abc',
      });
      expectNoHiddenKeys(
        { ...result, management: undefined },
        HIDDEN_STAFF_KEYS,
      );
      expect(collectKeys(result).has('email')).toBe(false);
    });

    it('Trưởng ban xem người mang role trưởng: không phải cấp dưới, không có link Meet', async () => {
      mockViewer([StaffRole.training_head]);
      mockPrisma.staffInfo.findFirst.mockResolvedValueOnce(
        leakyTutorRow({
          roles: [StaffRole.teacher, StaffRole.lesson_plan_head],
          classTeachers: [],
        }),
      );

      const result = await service.getTutor(
        trainingViewer,
        'UNISTAFF-0000000001',
      );

      expect(result.roles).toEqual([StaffRole.teacher]);
      expect(result.management).toMatchObject({
        isSubordinate: false,
        accountLocked: null,
        googleMeetLink: null,
        firstName: null,
        permissions: {
          canEditRoles: false,
          canEditProfile: false,
          canChangeStatus: false,
          canLockAccount: false,
          canEditAccountHandle: false,
          canManageMeetLink: false,
          canViewBonuses: false,
        },
      });
      expect(mockPrisma.staffInfo.findUnique).not.toHaveBeenCalled();
    });

    it('Ban Đào Tạo thường vẫn lọc theo role teacher', async () => {
      mockViewer([StaffRole.training]);
      mockPrisma.staffInfo.findFirst.mockResolvedValueOnce(null);
      await expect(
        service.getTutor(trainingViewer, 'UNISTAFF-0000000002'),
      ).rejects.toBeInstanceOf(NotFoundException);
      const args = (
        mockPrisma.staffInfo.findFirst.mock.calls as [
          { where: Prisma.StaffInfoWhereInput },
        ][]
      )[1][0];
      expect(args.where.roles).toEqual({ has: StaffRole.teacher });
    });
  });

  describe('listTutorSessions', () => {
    it('selects no money fields', async () => {
      mockViewer([StaffRole.training]);
      mockPrisma.staffInfo.findFirst.mockResolvedValueOnce({ id: 'x' });
      mockPrisma.session.count.mockResolvedValue(1);
      mockPrisma.session.findMany.mockResolvedValue([
        {
          id: 's1',
          date: new Date('2026-09-01'),
          startTime: null,
          endTime: null,
          class: { id: 'c1', name: 'L1' },
        },
      ]);

      const result = await service.listTutorSessions(
        trainingViewer,
        'UNISTAFF-0000000001',
        {},
      );

      expect(result.meta.total).toBe(1);
      const args = firstCallArg<SessionFindManyArgs>(
        mockPrisma.session.findMany,
      );
      expect(args.where).toEqual({ teacherId: 'UNISTAFF-0000000001' });
      expectNoHiddenKeys(args.select, HIDDEN_SESSION_KEYS);
      expectNoHiddenKeys(result, HIDDEN_SESSION_KEYS);
    });
  });

  describe('listTutorAchievements', () => {
    it('delegates to AchievementService for a tutor', async () => {
      mockViewer([StaffRole.training]);
      mockPrisma.staffInfo.findFirst.mockResolvedValueOnce({ id: 'x' });
      mockAchievements.listStaffAchievements.mockResolvedValue([]);

      await service.listTutorAchievements(
        trainingViewer,
        'UNISTAFF-0000000001',
      );

      expect(mockAchievements.listStaffAchievements).toHaveBeenCalledWith(
        'UNISTAFF-0000000001',
      );
    });
  });

  describe('resolveAchievementEditor', () => {
    const viewer = { ...trainingViewer, email: 'bdt@example.com' };

    it('Ban Đào Tạo thường sửa được gia sư → editor other', async () => {
      mockViewer([StaffRole.training]);
      mockPrisma.staffInfo.findFirst.mockResolvedValueOnce({ id: 'x' });
      mockAchievements.resolveOtherStaffAchievementEditor.mockResolvedValue({
        kind: 'other',
        actor: { userId: 'user-1' },
      });

      await expect(
        service.resolveAchievementEditor(viewer, 'UNISTAFF-0000000001'),
      ).resolves.toEqual({ kind: 'other', actor: { userId: 'user-1' } });
      expect(mockPrisma.staffInfo.findFirst).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: {
            roles: { has: StaffRole.teacher },
            id: 'UNISTAFF-0000000001',
          },
        }),
      );
      expect(
        mockAchievements.resolveOtherStaffAchievementEditor,
      ).toHaveBeenCalledWith(viewer, 'UNISTAFF-0000000001');
    });

    it('Ban Đào Tạo thường không sửa được ngoài gia sư → 404', async () => {
      mockViewer([StaffRole.training]);
      mockPrisma.staffInfo.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.resolveAchievementEditor(viewer, 'UNISTAFF-0000000002'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(
        mockAchievements.resolveOtherStaffAchievementEditor,
      ).not.toHaveBeenCalled();
    });

    it('Trưởng ban sửa được nhân sự ba nhóm', async () => {
      mockViewer([StaffRole.training_head]);
      mockPrisma.staffInfo.findFirst.mockResolvedValueOnce({ id: 'x' });

      await service.resolveAchievementEditor(viewer, 'UNISTAFF-0000000002');

      expect(mockPrisma.staffInfo.findFirst).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: {
            roles: {
              hasSome: [
                StaffRole.teacher,
                StaffRole.lesson_plan,
                StaffRole.training,
              ],
            },
            id: 'UNISTAFF-0000000002',
          },
        }),
      );
    });

    it('không phải Ban Đào Tạo → 403', async () => {
      mockViewer([StaffRole.teacher]);
      await expect(
        service.resolveAchievementEditor(viewer, 'UNISTAFF-0000000001'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('Trưởng ban Đào tạo quản lý cấp dưới (#278)', () => {
    const head = {
      id: 'user-head',
      email: 'head@example.com',
      roleType: UserRole.staff,
    };

    function targetRow(
      roles: StaffRole[],
      overrides: Record<string, unknown> = {},
    ) {
      return {
        id: 'UNISTAFF-T',
        roles,
        userId: 'user-t',
        university: 'ĐH A',
        highSchool: null,
        user: {
          first_name: 'Tên',
          last_name: 'Họ',
          roleType: UserRole.staff,
          status: UserStatus.active,
          avatarPath: null,
          avatarWatermarkedPath: null,
        },
        ...overrides,
      };
    }

    function mockTarget(row: ReturnType<typeof targetRow> | null) {
      mockPrisma.staffInfo.findUnique.mockResolvedValueOnce(row);
    }

    describe('resolveHead', () => {
      it('Ban Đào Tạo thường bị 403', async () => {
        mockViewer([StaffRole.training]);
        await expect(
          service.listBonuses(head, 'UNISTAFF-T', {}),
        ).rejects.toBeInstanceOf(ForbiddenException);
      });

      it('Trưởng ban đã nghỉ bị 403', async () => {
        mockViewer([StaffRole.training_head], StaffStatus.inactive);
        await expect(
          service.listBonuses(head, 'UNISTAFF-T', {}),
        ).rejects.toBeInstanceOf(ForbiddenException);
      });
    });

    describe('listRoleCandidates (follow-up 13/11 mục 2.2)', () => {
      it('Trưởng ban: chỉ nhân sự thường ngoài ba nhóm, active, trừ chính mình; chỉ họ tên + role', async () => {
        mockViewer([StaffRole.training_head]);
        mockPrisma.staffInfo.count.mockResolvedValueOnce(1);
        mockPrisma.staffInfo.findMany.mockResolvedValueOnce([
          leakyTutorRow({
            id: 'UNISTAFF-CSKH',
            roles: [StaffRole.customer_care],
          }),
        ]);

        const result = await service.listRoleCandidates(head, {
          search: 'An',
        });

        expect(result).toEqual({
          data: [
            {
              id: 'UNISTAFF-CSKH',
              fullName: 'Sư Gia',
              roles: [StaffRole.customer_care],
            },
          ],
          meta: { total: 1, page: 1, limit: 20 },
        });
        expectNoHiddenKeys(result, [...HIDDEN_STAFF_KEYS, 'avatarUrl']);

        const args = firstCallArg<StaffFindManyArgs>(
          mockPrisma.staffInfo.findMany,
        );
        const where = JSON.stringify(args.where);
        expect(where).toContain('"status":"active"');
        expect(where).toContain('"id":{"not":"UNISTAFF-HEAD"}');
        for (const role of [
          StaffRole.teacher,
          StaffRole.lesson_plan,
          StaffRole.training,
          StaffRole.admin,
          StaffRole.sale_customer_care_head,
          StaffRole.training_head,
          StaffRole.lesson_plan_head,
        ]) {
          expect(where).toContain(`"${role}"`);
        }
        expect(where).toContain('"roleType":"admin"');
        expect(args.where).toEqual(
          expect.objectContaining({
            AND: expect.arrayContaining([
              expect.objectContaining({
                NOT: expect.arrayContaining([
                  { user: { is: { roleType: UserRole.admin } } },
                ]),
              }),
            ]),
          }),
        );
        expect(Object.keys(args.select).sort()).toEqual(
          ['id', 'roles', 'user'].sort(),
        );
      });

      it.each([
        ['Ban Đào Tạo thường', [StaffRole.training]],
        ['Trưởng phòng Sale & CSKH', [StaffRole.sale_customer_care_head]],
        ['Admin không mang role Trưởng ban', [StaffRole.admin]],
      ])('%s bị 403', async (_label, roles) => {
        mockViewer(roles);
        await expect(
          service.listRoleCandidates(head, {}),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(mockPrisma.staffInfo.findMany).not.toHaveBeenCalled();
      });

      it('Trưởng ban đã nghỉ bị 403', async () => {
        mockViewer([StaffRole.training_head], StaffStatus.inactive);
        await expect(
          service.listRoleCandidates(head, {}),
        ).rejects.toBeInstanceOf(ForbiddenException);
      });
    });

    describe('listBonuses', () => {
      it('cho phép xem thưởng của cấp dưới (có số tiền)', async () => {
        mockViewer([StaffRole.training_head]);
        mockTarget(targetRow([StaffRole.teacher]));
        mockPrisma.bonus.findMany.mockResolvedValueOnce([
          {
            id: 'b1',
            workType: 'Thưởng',
            amount: 100000,
            status: PaymentStatus.pending,
            note: null,
            month: '2026-11',
            date: new Date('2026-11-05T00:00:00.000Z'),
          },
        ]);

        const result = await service.listBonuses(head, 'UNISTAFF-T', {
          month: '2026-11',
        });

        expect(result).toEqual([
          expect.objectContaining({
            id: 'b1',
            amount: 100000,
            date: '2026-11-05',
          }),
        ]);
        expect(mockPrisma.bonus.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { staffId: 'UNISTAFF-T', month: '2026-11' },
          }),
        );
      });

      it.each([
        [
          'người mang role trưởng',
          [StaffRole.teacher, StaffRole.lesson_plan_head],
        ],
        ['Admin', [StaffRole.teacher, StaffRole.admin]],
        ['ngoài ba nhóm', [StaffRole.sale]],
      ])('từ chối xem thưởng của %s', async (_label, roles) => {
        mockViewer([StaffRole.training_head]);
        mockTarget(targetRow(roles));
        await expect(
          service.listBonuses(head, 'UNISTAFF-T', {}),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(mockPrisma.bonus.findMany).not.toHaveBeenCalled();
      });

      it('từ chối xem thưởng của chính mình', async () => {
        mockViewer(
          [StaffRole.training_head, StaffRole.teacher],
          StaffStatus.active,
          'UNISTAFF-T',
        );
        mockTarget(targetRow([StaffRole.teacher, StaffRole.training_head]));
        await expect(
          service.listBonuses(head, 'UNISTAFF-T', {}),
        ).rejects.toBeInstanceOf(ForbiddenException);
      });

      it('404 khi không có nhân sự', async () => {
        mockViewer([StaffRole.training_head]);
        mockTarget(null);
        await expect(
          service.listBonuses(head, 'UNISTAFF-T', {}),
        ).rejects.toBeInstanceOf(NotFoundException);
      });
    });

    describe('updateProfessionalProfile', () => {
      it('cấp dưới: sửa họ tên + trường, ghi lịch sử, không đụng field cá nhân', async () => {
        mockViewer([StaffRole.training_head]);
        mockTarget(targetRow([StaffRole.teacher, StaffRole.sale]));
        const getTutor = jest
          .spyOn(service, 'getTutor')
          .mockResolvedValueOnce({ id: 'UNISTAFF-T' } as never);

        await service.updateProfessionalProfile(head, 'UNISTAFF-T', {
          firstName: ' Mới ',
          lastName: 'Họ',
          university: 'ĐH B',
          highSchool: '',
        });

        expect(mockPrisma.staffInfo.update).toHaveBeenCalledWith({
          where: { id: 'UNISTAFF-T' },
          data: { university: 'ĐH B', highSchool: null },
          select: { id: true },
        });
        expect(mockPrisma.user.update).toHaveBeenCalledWith({
          where: { id: 'user-t' },
          data: { first_name: 'Mới', last_name: 'Họ' },
          select: { id: true },
        });
        expect(mockActionHistory.recordUpdate).toHaveBeenCalled();
        expect(mockAuthCache.invalidateUser).toHaveBeenCalledWith('user-t');
        expect(getTutor).toHaveBeenCalledWith(head, 'UNISTAFF-T');
      });

      it('từ chối sửa hồ sơ người mang role trưởng', async () => {
        mockViewer([StaffRole.training_head]);
        mockTarget(targetRow([StaffRole.teacher, StaffRole.training_head]));
        await expect(
          service.updateProfessionalProfile(head, 'UNISTAFF-T', {
            university: 'x',
          }),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(mockPrisma.staffInfo.update).not.toHaveBeenCalled();
      });

      it('tên rỗng → 400', async () => {
        mockViewer([StaffRole.training_head]);
        mockTarget(targetRow([StaffRole.teacher]));
        await expect(
          service.updateProfessionalProfile(head, 'UNISTAFF-T', {
            firstName: '  ',
          }),
        ).rejects.toBeInstanceOf(BadRequestException);
      });
    });

    describe('uploadAvatar', () => {
      const file = {
        buffer: Buffer.from('img'),
        mimetype: 'image/png',
        size: 3,
      };

      it('cấp dưới: tải ảnh gốc + bản watermark rồi lưu path', async () => {
        mockViewer([StaffRole.training_head]);
        mockTarget(targetRow([StaffRole.training]));
        jest
          .spyOn(service, 'getTutor')
          .mockResolvedValueOnce({ id: 'UNISTAFF-T' } as never);

        await service.uploadAvatar(head, 'UNISTAFF-T', file);

        expect(uploadStorageObject).toHaveBeenCalledTimes(2);
        expect(mockPrisma.user.update).toHaveBeenCalledWith({
          where: { id: 'user-t' },
          data: {
            avatarPath: 'users/user-t/avatar',
            avatarWatermarkedPath: 'users/user-t/avatar.jpg',
          },
          select: { id: true },
        });
      });

      it('từ chối đổi ảnh người ngoài ba nhóm', async () => {
        mockViewer([StaffRole.training_head]);
        mockTarget(targetRow([StaffRole.customer_care]));
        await expect(
          service.uploadAvatar(head, 'UNISTAFF-T', file),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(uploadStorageObject).not.toHaveBeenCalled();
      });
    });

    describe('updateStatus', () => {
      it('cho phép khi người đích chỉ mang role ba nhóm', async () => {
        mockViewer([StaffRole.training_head]);
        mockTarget(targetRow([StaffRole.teacher, StaffRole.lesson_plan]));
        mockStaffService.updateStaffStatus.mockResolvedValueOnce({
          id: 'UNISTAFF-T',
          phone: 'leak',
        });

        await expect(
          service.updateStatus(head, 'UNISTAFF-T', {
            status: StaffStatus.inactive,
          }),
        ).resolves.toEqual({ id: 'UNISTAFF-T', status: StaffStatus.inactive });
        expect(mockStaffService.updateStaffStatus).toHaveBeenCalledWith(
          'UNISTAFF-T',
          { status: StaffStatus.inactive, reason: undefined },
          {
            userId: 'user-head',
            userEmail: 'head@example.com',
            roleType: UserRole.staff,
          },
        );
      });

      it('từ chối khi người đích kiêm role ngoài ba nhóm', async () => {
        mockViewer([StaffRole.training_head]);
        mockTarget(targetRow([StaffRole.teacher, StaffRole.sale]));
        await expect(
          service.updateStatus(head, 'UNISTAFF-T', {
            status: StaffStatus.inactive,
          }),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(mockStaffService.updateStaffStatus).not.toHaveBeenCalled();
      });
    });

    describe('updateAccountStatus', () => {
      it('khoá tài khoản người chỉ mang role ba nhóm', async () => {
        mockViewer([StaffRole.training_head]);
        mockTarget(targetRow([StaffRole.teacher]));

        await expect(
          service.updateAccountStatus(head, 'UNISTAFF-T', { locked: true }),
        ).resolves.toEqual({ id: 'UNISTAFF-T', accountLocked: true });
        expect(mockPrisma.user.update).toHaveBeenCalledWith({
          where: { id: 'user-t' },
          data: { status: UserStatus.inactive },
          select: { id: true },
        });
        expect(mockAuthCache.invalidateUser).toHaveBeenCalledWith('user-t');
      });

      it('mở khoá tài khoản', async () => {
        mockViewer([StaffRole.training_head]);
        mockTarget(
          targetRow([StaffRole.teacher], {
            user: {
              first_name: 'Tên',
              last_name: 'Họ',
              roleType: UserRole.staff,
              status: UserStatus.inactive,
              avatarPath: null,
              avatarWatermarkedPath: null,
            },
          }),
        );
        await expect(
          service.updateAccountStatus(head, 'UNISTAFF-T', { locked: false }),
        ).resolves.toEqual({ id: 'UNISTAFF-T', accountLocked: false });
        expect(mockPrisma.user.update).toHaveBeenCalledWith(
          expect.objectContaining({ data: { status: UserStatus.active } }),
        );
      });

      it.each([
        [
          'kiêm role ngoài ba nhóm',
          [StaffRole.teacher, StaffRole.accountant_income],
        ],
        [
          'mang role trưởng',
          [StaffRole.teacher, StaffRole.sale_customer_care_head],
        ],
        ['ngoài ba nhóm', [StaffRole.sale]],
      ])('từ chối khoá người %s', async (_label, roles) => {
        mockViewer([StaffRole.training_head]);
        mockTarget(targetRow(roles));
        await expect(
          service.updateAccountStatus(head, 'UNISTAFF-T', { locked: true }),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(mockPrisma.user.update).not.toHaveBeenCalled();
      });

      it('từ chối khoá tài khoản admin hệ thống', async () => {
        mockViewer([StaffRole.training_head]);
        mockTarget(
          targetRow([StaffRole.teacher], {
            user: {
              first_name: 'A',
              last_name: 'B',
              roleType: UserRole.admin,
              status: UserStatus.active,
              avatarPath: null,
              avatarWatermarkedPath: null,
            },
          }),
        );
        await expect(
          service.updateAccountStatus(head, 'UNISTAFF-T', { locked: true }),
        ).rejects.toBeInstanceOf(ForbiddenException);
      });

      it('từ chối khoá chính mình', async () => {
        mockViewer([StaffRole.training_head], StaffStatus.active, 'UNISTAFF-T');
        mockTarget(targetRow([StaffRole.training_head]));
        await expect(
          service.updateAccountStatus(head, 'UNISTAFF-T', { locked: true }),
        ).rejects.toBeInstanceOf(ForbiddenException);
      });
    });

    describe('updateAccountHandle (16/11)', () => {
      it('đổi handle người chỉ mang role ba nhóm: ghi users, audit, xoá cache auth', async () => {
        mockViewer([StaffRole.training_head]);
        mockTarget(targetRow([StaffRole.teacher, StaffRole.lesson_plan]));
        mockPrisma.user.findUnique.mockResolvedValueOnce({
          accountHandle: 'gs01',
        });
        mockPrisma.user.findFirst.mockResolvedValueOnce(null);

        await expect(
          service.updateAccountHandle(head, 'UNISTAFF-T', {
            accountHandle: 'gs_moi',
          }),
        ).resolves.toEqual({ id: 'UNISTAFF-T', accountHandle: 'gs_moi' });
        expect(mockPrisma.user.update).toHaveBeenCalledWith({
          where: { id: 'user-t' },
          data: { accountHandle: 'gs_moi' },
          select: { id: true },
        });
        expect(mockActionHistory.recordUpdate).toHaveBeenCalledWith(
          mockPrisma,
          expect.objectContaining({
            entityType: 'staff',
            entityId: 'UNISTAFF-T',
            beforeValue: { accountHandle: 'gs01' },
            afterValue: { accountHandle: 'gs_moi' },
          }),
        );
        expect(mockAuthCache.invalidateUser).toHaveBeenCalledWith('user-t');
      });

      it.each([
        ['kiêm role ngoài ba nhóm', [StaffRole.teacher, StaffRole.sale]],
        ['mang role trưởng', [StaffRole.teacher, StaffRole.training_head]],
      ])('từ chối đổi handle người %s', async (_label, roles) => {
        mockViewer([StaffRole.training_head]);
        mockTarget(targetRow(roles));
        await expect(
          service.updateAccountHandle(head, 'UNISTAFF-T', {
            accountHandle: 'abc_moi',
          }),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
        expect(mockPrisma.user.update).not.toHaveBeenCalled();
      });

      it('nhân sự chưa có tài khoản → 400', async () => {
        mockViewer([StaffRole.training_head]);
        mockTarget(targetRow([StaffRole.teacher], { userId: null }));
        await expect(
          service.updateAccountHandle(head, 'UNISTAFF-T', {
            accountHandle: 'abc_moi',
          }),
        ).rejects.toBeInstanceOf(BadRequestException);
      });
    });
  });
});
