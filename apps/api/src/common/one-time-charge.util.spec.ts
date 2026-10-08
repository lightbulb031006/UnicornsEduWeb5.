import { AttendanceStatus } from '../../generated/client';
import { findOneTimeChargedStudentIds } from './one-time-charge.util';

function mockDb(rows: Array<{ studentId: string }>) {
  const findMany = jest
    .fn<Promise<typeof rows>, [{ where: Record<string, unknown> }]>()
    .mockResolvedValue(rows);
  return { db: { attendance: { findMany } } as never, findMany };
}

describe('findOneTimeChargedStudentIds', () => {
  it('only counts chargeable rows that actually carry tuition', async () => {
    const { db, findMany } = mockDb([{ studentId: 's1' }]);

    const result = await findOneTimeChargedStudentIds(db, {
      classId: 'c1',
      studentIds: ['s1', 's2'],
      excludeSessionId: 'sess-1',
    });

    expect(result).toEqual(new Set(['s1']));
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          studentId: { in: ['s1', 's2'] },
          status: {
            in: [AttendanceStatus.present, AttendanceStatus.excused],
          },
          tuitionFee: { gt: 0 },
          session: { classId: 'c1', id: { not: 'sess-1' } },
        },
      }),
    );
  });

  it('scans the whole class when no students are given', async () => {
    const { db, findMany } = mockDb([]);

    await findOneTimeChargedStudentIds(db, { classId: 'c1' });

    const { where } = findMany.mock.calls[0][0];
    expect(where.studentId).toBeUndefined();
    expect(where.session).toEqual({ classId: 'c1' });
  });

  it('skips the query for an empty student list', async () => {
    const { db, findMany } = mockDb([]);

    const result = await findOneTimeChargedStudentIds(db, {
      classId: 'c1',
      studentIds: [],
    });

    expect(result.size).toBe(0);
    expect(findMany).not.toHaveBeenCalled();
  });
});
