jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class PrismaServiceMock {},
}));
jest.mock('src/achievements/achievement.service', () => ({
  AchievementService: class AchievementServiceMock {},
}));
jest.mock('src/storage/supabase-storage', () => ({
  createSignedStorageUrl: jest.fn(({ path }: { path?: string | null }) =>
    Promise.resolve(path ? `signed:${path}` : null),
  ),
}));

import { ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  ClassStatus,
  StaffRole,
  StaffStatus,
  UserRole,
} from '../../generated/enums';
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
      findMany: jest.fn(),
      count: jest.fn(),
    },
    session: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
  };
  const mockAchievements = { listStaffAchievements: jest.fn() };
  const trainingViewer = { id: 'user-1', roleType: UserRole.staff };
  let service: TrainingTutorService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new TrainingTutorService(
      mockPrisma as never,
      mockAchievements as never,
    );
  });

  function mockViewer(
    roles: StaffRole[],
    status: StaffStatus = StaffStatus.active,
  ) {
    mockPrisma.staffInfo.findFirst.mockResolvedValueOnce({ roles, status });
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
      ['operational-only staff', [StaffRole.accountant], StaffStatus.active],
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
          email: 'gs@example.com',
          phone: '0900',
          avatarUrl: 'signed:a/b.png',
          university: 'ĐH A',
          highSchool: 'THPT B',
          achievementCount: 2,
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

    it('forbids non-training staff before querying', async () => {
      mockViewer([StaffRole.customer_care]);
      await expect(
        service.listTutors(trainingViewer, {}),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(mockPrisma.staffInfo.findMany).not.toHaveBeenCalled();
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
});
