import type { Prisma } from '../../generated/client';
import {
  lockOneTimePackagesForActiveStudents,
  lockOneTimeStudentPackages,
  resolveOneTimePackageLock,
} from './one-time-package-lock';

const CLASS_PACKAGE = {
  tuitionPackageTotal: 1_600_000,
  tuitionPackageSession: 80,
};

describe('resolveOneTimePackageLock (16/11)', () => {
  it('chưa bị thu → chốt gói lớp hiện tại', () => {
    expect(
      resolveOneTimePackageLock({
        membership: { customTuitionPackageTotal: null },
        classPackage: CLASS_PACKAGE,
        chargedFee: null,
      }),
    ).toEqual({
      customTuitionPackageTotal: 1_600_000,
      customTuitionPackageSession: 80,
      customStudentTuitionPerSession: 20_000,
    });
  });

  it('đã bị thu → chốt đúng số đã thu, không theo gói lớp mới', () => {
    expect(
      resolveOneTimePackageLock({
        membership: { customTuitionPackageTotal: null },
        classPackage: {
          tuitionPackageTotal: 1_999_000,
          tuitionPackageSession: 80,
        },
        chargedFee: 1_600_000,
      }),
    ).toEqual({
      customTuitionPackageTotal: 1_600_000,
      customTuitionPackageSession: 80,
      customStudentTuitionPerSession: 20_000,
    });
  });

  it('đã có gói riêng (kể cả 0đ miễn phí) → giữ nguyên', () => {
    for (const custom of [1_440_000, 0]) {
      expect(
        resolveOneTimePackageLock({
          membership: { customTuitionPackageTotal: custom },
          classPackage: CLASS_PACKAGE,
          chargedFee: 1_600_000,
        }),
      ).toBeNull();
    }
  });

  it.each([null, 0, -1])(
    'chưa bị thu và gói lớp không hợp lệ (%p) → không chốt',
    (total) => {
      expect(
        resolveOneTimePackageLock({
          membership: { customTuitionPackageTotal: null },
          classPackage: {
            tuitionPackageTotal: total,
            tuitionPackageSession: 80,
          },
          chargedFee: null,
        }),
      ).toBeNull();
    },
  );
});

describe('lockOneTimeStudentPackages (16/11)', () => {
  const makeDb = (
    candidates: Array<{
      id: string;
      classId: string;
      studentId: string;
      customTuitionPackageTotal: number | null;
      class: {
        tuitionPackageTotal: number | null;
        tuitionPackageSession: number | null;
      };
    }>,
    chargedRows: Array<{
      studentId: string;
      tuitionFee: number | null;
      session: { classId: string };
    }> = [],
  ) => ({
    studentClass: {
      findMany: jest.fn().mockResolvedValue(candidates),
      update: jest.fn().mockResolvedValue({}),
    },
    attendance: { findMany: jest.fn().mockResolvedValue(chargedRows) },
  });
  const asDb = (db: ReturnType<typeof makeDb>) =>
    db as unknown as Prisma.TransactionClient;

  it('không có entry → không truy vấn', async () => {
    const db = makeDb([]);
    await expect(lockOneTimeStudentPackages(asDb(db), [])).resolves.toBe(0);
    expect(db.studentClass.findMany).not.toHaveBeenCalled();
  });

  it('chỉ lọc lớp one_time, học sinh đang học, chưa có gói riêng', async () => {
    const db = makeDb([]);
    await lockOneTimeStudentPackages(asDb(db), [
      { classId: 'C1', studentId: 'S1' },
    ]);
    expect(db.studentClass.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          classId: { in: ['C1'] },
          studentId: { in: ['S1'] },
          OR: [{ status: null }, { status: 'active' }],
          customTuitionPackageTotal: null,
          class: { pricingMode: 'one_time' },
        },
      }),
    );
    expect(db.attendance.findMany).not.toHaveBeenCalled();
  });

  it('học sinh mới chốt gói lớp; học sinh vào lại đã bị thu chốt số đã thu (dòng đầu tiên)', async () => {
    const db = makeDb(
      [
        {
          id: 'sc-new',
          classId: 'C1',
          studentId: 'S-new',
          customTuitionPackageTotal: null,
          class: { tuitionPackageTotal: 1_999_000, tuitionPackageSession: 80 },
        },
        {
          id: 'sc-back',
          classId: 'C1',
          studentId: 'S-back',
          customTuitionPackageTotal: null,
          class: { tuitionPackageTotal: 1_999_000, tuitionPackageSession: 80 },
        },
      ],
      [
        {
          studentId: 'S-back',
          tuitionFee: 1_600_000,
          session: { classId: 'C1' },
        },
        {
          studentId: 'S-back',
          tuitionFee: 1_999_000,
          session: { classId: 'C1' },
        },
      ],
    );

    await expect(
      lockOneTimeStudentPackages(asDb(db), [
        { classId: 'C1', studentId: 'S-new' },
        { classId: 'C1', studentId: 'S-back' },
      ]),
    ).resolves.toBe(2);

    expect(db.attendance.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          studentId: { in: ['S-new', 'S-back'] },
          status: { in: ['present', 'excused'] },
          tuitionFee: { gt: 0 },
          session: { classId: { in: ['C1'] } },
        },
        orderBy: [{ session: { date: 'asc' } }, { createdAt: 'asc' }],
      }),
    );
    expect(db.studentClass.update).toHaveBeenCalledWith({
      where: { id: 'sc-new' },
      data: {
        customTuitionPackageTotal: 1_999_000,
        customTuitionPackageSession: 80,
        customStudentTuitionPerSession: 24_988,
      },
    });
    expect(db.studentClass.update).toHaveBeenCalledWith({
      where: { id: 'sc-back' },
      data: {
        customTuitionPackageTotal: 1_600_000,
        customTuitionPackageSession: 80,
        customStudentTuitionPerSession: 20_000,
      },
    });
  });

  it('khoản thu ở lớp khác không tính cho lớp này', async () => {
    const db = makeDb(
      [
        {
          id: 'sc-1',
          classId: 'C1',
          studentId: 'S1',
          customTuitionPackageTotal: null,
          class: CLASS_PACKAGE,
        },
      ],
      [{ studentId: 'S1', tuitionFee: 3_199_000, session: { classId: 'C2' } }],
    );
    await lockOneTimeStudentPackages(asDb(db), [
      { classId: 'C1', studentId: 'S1' },
    ]);
    expect(db.studentClass.update).toHaveBeenCalledWith({
      where: { id: 'sc-1' },
      data: {
        customTuitionPackageTotal: 1_600_000,
        customTuitionPackageSession: 80,
        customStudentTuitionPerSession: 20_000,
      },
    });
  });

  it('bỏ qua cặp lớp–học sinh không được yêu cầu', async () => {
    const db = makeDb([
      {
        id: 'sc-x',
        classId: 'C2',
        studentId: 'S1',
        customTuitionPackageTotal: null,
        class: CLASS_PACKAGE,
      },
    ]);
    await expect(
      lockOneTimeStudentPackages(asDb(db), [
        { classId: 'C1', studentId: 'S1' },
        { classId: 'C2', studentId: 'S2' },
      ]),
    ).resolves.toBe(0);
    expect(db.studentClass.update).not.toHaveBeenCalled();
  });
});

describe('lockOneTimePackagesForActiveStudents (16/11)', () => {
  it('chốt mọi học sinh đang học của các lớp', async () => {
    const findMany = jest
      .fn()
      .mockResolvedValueOnce([{ classId: 'C1', studentId: 'S1' }])
      .mockResolvedValueOnce([
        {
          id: 'sc-1',
          classId: 'C1',
          studentId: 'S1',
          customTuitionPackageTotal: null,
          class: CLASS_PACKAGE,
        },
      ]);
    const db = {
      studentClass: { findMany, update: jest.fn() },
      attendance: { findMany: jest.fn().mockResolvedValue([]) },
    };
    await expect(
      lockOneTimePackagesForActiveStudents(
        db as unknown as Prisma.TransactionClient,
        ['C1'],
      ),
    ).resolves.toBe(1);
    expect(findMany).toHaveBeenNthCalledWith(1, {
      where: {
        classId: { in: ['C1'] },
        OR: [{ status: null }, { status: 'active' }],
      },
      select: { classId: true, studentId: true },
    });
  });

  it('không có lớp → không truy vấn', async () => {
    const findMany = jest.fn();
    await expect(
      lockOneTimePackagesForActiveStudents(
        { studentClass: { findMany } } as unknown as Prisma.TransactionClient,
        [],
      ),
    ).resolves.toBe(0);
    expect(findMany).not.toHaveBeenCalled();
  });
});
