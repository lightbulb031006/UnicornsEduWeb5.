import {
  buildAdminMonthlyReport,
  type MonthlyReportInput,
  type MonthlyReportStudentInput,
} from './monthly-report.service';

const monthStart = new Date('2026-09-01T00:00:00.000Z');
const monthEnd = new Date('2026-10-01T00:00:00.000Z');

function student(
  overrides: Partial<MonthlyReportStudentInput> & { id: string },
): MonthlyReportStudentInput {
  return {
    fullName: overrides.id.toUpperCase(),
    status: 'active',
    customerSource: 'tiktok',
    dropOutDate: null,
    dropOutReason: null,
    customerCareStaffId: 'cs-1',
    ...overrides,
  };
}

function buildInput(overrides: Partial<MonthlyReportInput> = {}) {
  const input: MonthlyReportInput = {
    month: '09',
    year: '2026',
    monthStart,
    monthEnd,
    generatedAt: new Date('2026-10-12T00:00:00.000Z'),
    students: [
      // Mới, còn học, lớp đầu thuộc khoá BASIC.
      student({ id: 'new-active' }),
      // Mới nhưng đã nghỉ → nghỉ sớm; đồng thời là học sinh nghỉ của tháng.
      student({
        id: 'new-dropped',
        status: 'inactive',
        dropOutDate: new Date('2026-09-20T00:00:00.000Z'),
        dropOutReason: 'Học thử không hợp',
      }),
      // Mới, chưa xếp lớp, nguồn Người quen, không có CSKH.
      student({
        id: 'new-unplaced',
        customerSource: 'acquaintance',
        customerCareStaffId: null,
      }),
      // Cũ, nghỉ trong tháng.
      student({
        id: 'old-dropped',
        status: 'inactive',
        dropOutDate: new Date('2026-09-05T00:00:00.000Z'),
        customerCareStaffId: 'cs-2',
      }),
      // Cũ, nghỉ tháng trước → không tính.
      student({
        id: 'old-dropped-august',
        status: 'inactive',
        dropOutDate: new Date('2026-08-30T00:00:00.000Z'),
      }),
      // Cũ, còn học, có nạp trong tháng.
      student({ id: 'old-active', customerCareStaffId: 'cs-2' }),
    ],
    firstTopUpInMonth: new Map([
      ['new-active', new Date('2026-09-03T02:00:00.000Z')],
      ['new-dropped', new Date('2026-09-10T02:00:00.000Z')],
      ['new-unplaced', new Date('2026-09-15T02:00:00.000Z')],
    ]),
    topUps: [
      {
        studentId: 'new-active',
        inMonthAmount: 3_000_000,
        inMonthCount: 2,
        toMonthEndAmount: 3_000_000,
      },
      {
        studentId: 'new-dropped',
        inMonthAmount: 500_000,
        inMonthCount: 1,
        toMonthEndAmount: 500_000,
      },
      {
        studentId: 'old-active',
        inMonthAmount: 2_000_000,
        inMonthCount: 1,
        toMonthEndAmount: 9_000_000,
      },
    ],
    firstClassByStudent: new Map([
      [
        'new-active',
        {
          studentId: 'new-active',
          className: 'B1',
          courseId: 'c-basic',
          courseName: 'BASIC',
        },
      ],
      [
        'new-dropped',
        {
          studentId: 'new-dropped',
          className: 'B2',
          courseId: 'c-basic',
          courseName: 'BASIC',
        },
      ],
    ]),
    latestClassByStudent: new Map([
      [
        'old-dropped',
        {
          studentId: 'old-dropped',
          className: 'A7',
          courseId: 'c-adv',
          courseName: 'ADVANCED',
        },
      ],
    ]),
    staffNames: new Map([
      ['cs-1', 'Nguyễn Ngọc Linh'],
      ['cs-2', 'Phan Đàm Thu Thảo'],
    ]),
    // Doanh thu ≠ tổng nạp: new-dropped nạp nhưng chưa học buổi nào.
    revenueInMonth: [
      {
        studentId: 'new-active',
        courseId: 'c-basic',
        courseName: 'BASIC',
        revenue: 1_200_000,
      },
    ],
    // Mặc định mọi học sinh đang nghỉ đều là cũ nghỉ.
    oldDroppedStudentIds: new Set([
      'new-dropped',
      'old-dropped',
      'old-dropped-august',
    ]),
    ...overrides,
  };
  return input;
}

describe('buildAdminMonthlyReport', () => {
  it('computes KPI with new = first top-up in month and early drop = new now inactive', () => {
    const report = buildAdminMonthlyReport(buildInput());

    expect(report.kpi).toEqual({
      totalTopUpInMonth: 5_500_000,
      topUpTransactionCount: 4,
      activeStudents: 3,
      newStudents: 3,
      droppedStudents: 2,
      trialDroppedStudents: 0,
      netChange: 1,
      earlyDropOldCount: 1,
      newStillActive: 2,
    });
  });

  it('builds the source × first-class course revenue matrix with an unplaced column', () => {
    const report = buildAdminMonthlyReport(buildInput());

    expect(report.courses).toEqual([
      { courseId: 'c-basic', courseName: 'BASIC' },
    ]);
    expect(report.matrix).toEqual(
      expect.arrayContaining([
        {
          customerSource: 'tiktok',
          courseId: 'c-basic',
          newCount: 2,
          earlyDropCount: 1,
          earlyDropOldCount: 1,
          earningCount: 1,
          revenue: 1_200_000,
        },
        {
          customerSource: 'acquaintance',
          courseId: null,
          newCount: 1,
          earlyDropCount: 0,
          earlyDropOldCount: 0,
          earningCount: 0,
          revenue: 0,
        },
      ]),
    );
  });

  it('puts revenue under the course of the attended class when the student switched course', () => {
    // new-active vào lớp BASIC đầu tiên rồi đổi sang lớp ADVANCED và học ở đó.
    const report = buildAdminMonthlyReport(
      buildInput({
        revenueInMonth: [
          {
            studentId: 'new-active',
            courseId: 'c-adv',
            courseName: 'ADVANCED',
            revenue: 1_100_000,
          },
          {
            studentId: 'old-active',
            courseId: 'c-adv',
            courseName: 'ADVANCED',
            revenue: 9_000_000,
          },
        ],
      }),
    );

    expect(report.courses).toEqual([
      { courseId: 'c-adv', courseName: 'ADVANCED' },
      { courseId: 'c-basic', courseName: 'BASIC' },
    ]);
    expect(report.matrix).toEqual(
      expect.arrayContaining([
        {
          customerSource: 'tiktok',
          courseId: 'c-basic',
          newCount: 2,
          earlyDropCount: 1,
          earlyDropOldCount: 1,
          earningCount: 0,
          revenue: 0,
        },
        {
          customerSource: 'tiktok',
          courseId: 'c-adv',
          newCount: 0,
          earlyDropCount: 0,
          earlyDropOldCount: 0,
          earningCount: 1,
          revenue: 1_100_000,
        },
      ]),
    );
    // Học sinh cũ không vào ma trận.
    expect(report.matrix.reduce((total, cell) => total + cell.revenue, 0)).toBe(
      1_100_000,
    );
  });

  it('lists students dropped in the month by drop-out date', () => {
    const report = buildAdminMonthlyReport(buildInput());

    expect(report.droppedStudents.map((row) => row.studentId)).toEqual([
      'old-dropped',
      'new-dropped',
    ]);
    expect(report.droppedStudents[0]).toMatchObject({
      className: 'A7',
      customerCareStaffName: 'Phan Đàm Thu Thảo',
      dropOutDate: '2026-09-05',
    });
  });

  it('summarises per customer-care staff with in-month top-up and puts unassigned last', () => {
    const report = buildAdminMonthlyReport(buildInput());

    expect(report.customerCare.map((row) => row.staffId)).toEqual([
      'cs-1',
      'cs-2',
      null,
    ]);
    expect(report.customerCare[0]).toMatchObject({
      staffName: 'Nguyễn Ngọc Linh',
      activeStudents: 1,
      newStudents: 2,
      droppedStudents: 1,
      netChange: 1,
      earlyDropCount: 1,
      totalTopUpInMonth: 3_500_000,
      topUpTransactionCount: 3,
    });
    expect(report.customerCare[2]).toMatchObject({
      staffName: 'Chưa có CSKH',
      newStudents: 1,
    });
  });

  it('lists new students by first top-up date with early-drop details', () => {
    const report = buildAdminMonthlyReport(buildInput());

    expect(report.newStudents.map((row) => row.studentId)).toEqual([
      'new-active',
      'new-dropped',
      'new-unplaced',
    ]);
    expect(report.newStudents[0]).toMatchObject({
      totalTopUp: 3_000_000,
      revenueInMonth: 1_200_000,
    });
    expect(report.newStudents[1]).toMatchObject({
      isEarlyDrop: true,
      earlyDropKind: 'old',
      dropOutDate: '2026-09-20',
      courseName: 'BASIC',
    });
    expect(report.newStudents[2]).toMatchObject({
      className: null,
      courseId: null,
      totalTopUp: 0,
      revenueInMonth: 0,
    });
  });

  it('counts trial-dropped students apart: not in net change nor appendix B, but still early drops', () => {
    const report = buildAdminMonthlyReport(
      buildInput({
        oldDroppedStudentIds: new Set(['old-dropped', 'old-dropped-august']),
      }),
    );

    expect(report.kpi).toMatchObject({
      droppedStudents: 1,
      trialDroppedStudents: 1,
      netChange: 2,
      earlyDropOldCount: 0,
      newStillActive: 2,
    });
    expect(report.droppedStudents.map((row) => row.studentId)).toEqual([
      'old-dropped',
    ]);
    expect(report.newStudents[1]).toMatchObject({
      isEarlyDrop: true,
      earlyDropKind: 'trial',
    });
    expect(report.customerCare[0]).toMatchObject({
      droppedStudents: 0,
      netChange: 2,
      earlyDropCount: 1,
      earlyDropOldCount: 0,
    });
  });
});
