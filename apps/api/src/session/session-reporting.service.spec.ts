jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class PrismaServiceMock {},
}));

jest.mock('../staff-ops/staff-operations-access.service', () => ({
  // Giữ các predicate thuần (#277: `seesClassAsTrainingManager`, ...).
  ...jest.requireActual('../staff-ops/staff-operations-access.service'),
  StaffOperationsAccessService: class StaffOperationsAccessServiceMock {},
}));

jest.mock('./session-ordinal.util', () => ({
  withSessionOrdinals: jest.fn(async (_prisma: unknown, sessions: unknown) =>
    Promise.resolve(sessions),
  ),
}));

import { StaffRole, UserRole } from '../../generated/enums';
import { SessionReportingService } from './session-reporting.service';

type PrismaSqlQuery = {
  sql?: string;
  text?: string;
  statement?: string;
  strings?: readonly string[];
  values?: readonly unknown[];
};

describe('SessionReportingService', () => {
  const mockPrisma = {
    $queryRaw: jest.fn(),
  };

  let service: SessionReportingService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.$queryRaw.mockResolvedValue([]);
    service = new SessionReportingService(mockPrisma as never, {} as never);
  });

  function getUnpaidSessionsQuery() {
    expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);

    return mockPrisma.$queryRaw.mock.calls[0][0] as PrismaSqlQuery;
  }

  function getSqlText(query: PrismaSqlQuery) {
    return (
      query.sql ??
      query.text ??
      query.statement ??
      query.strings?.join('?') ??
      ''
    ).replace(/\s+/g, ' ');
  }

  describe('getUnpaidSessionsByTeacherId', () => {
    it('aggregates from sessions and checks attendance with EXISTS', async () => {
      await service.getUnpaidSessionsByTeacherId('teacher-1', 30);

      const sql = getSqlText(getUnpaidSessionsQuery());

      expect(sql).toMatch(/FROM sessions JOIN classes/i);
      expect(sql).toMatch(
        /EXISTS\s*\(\s*SELECT\s+1\s+FROM attendance\s+WHERE attendance\.session_id = sessions\.id\s*\)/i,
      );
      expect(sql).not.toMatch(/FROM attendance\s+JOIN sessions/i);
      expect(sql).toMatch(/sessions\.teacher_payment_status = 'unpaid'/i);
    });

    it('falls back to the default date window for invalid days', async () => {
      await service.getUnpaidSessionsByTeacherId('teacher-1', -3);

      const query = getUnpaidSessionsQuery();

      expect(query.values).toEqual(['teacher-1', 13]);
    });
  });

  describe('getSessionsByClassIdForStaff (#275 hợp quyền)', () => {
    const rawSession = (id: string, teacherId: string) => ({
      id,
      classId: 'class-1',
      teacherId,
      date: new Date('2026-11-01T00:00:00.000Z'),
      lessonContent: '<p>Nội dung</p>',
      allowanceAmount: 200000,
      trainingManagerAllowanceAmount: 6000,
      coefficient: 1,
      teacherPaymentStatus: 'unpaid',
      teacher: { id: teacherId, user: { first_name: 'A', last_name: 'B' } },
      attendance: [
        { studentId: 'student-1', status: 'present', tuitionFee: 150000 },
      ],
    });
    const staffOperationsAccess = {
      resolveClassViewerActor: jest.fn(),
      resolveClassAccess: jest.fn(),
    };
    const prisma = { session: { findMany: jest.fn() } };
    let reporting: SessionReportingService;

    beforeEach(() => {
      prisma.session.findMany.mockResolvedValue([
        rawSession('own', 'staff-1'),
        rawSession('other', 'teacher-2'),
      ]);
      staffOperationsAccess.resolveClassViewerActor.mockResolvedValue({
        id: 'staff-1',
        roles: [StaffRole.teacher, StaffRole.training],
      });
      reporting = new SessionReportingService(
        prisma as never,
        staffOperationsAccess as never,
      );
    });

    it('shows other teachers sessions with Quản lý lớp redaction when the teacher also manages the class', async () => {
      staffOperationsAccess.resolveClassAccess.mockResolvedValue({
        mode: 'teacher',
        isAdmin: false,
        isClassTeacher: true,
        isClassManager: true,
        isTrainingHead: false,
      });

      const sessions = (await reporting.getSessionsByClassIdForStaff(
        'user-1',
        UserRole.staff,
        'class-1',
        '11',
        '2026',
      )) as Array<Record<string, unknown>>;

      const own = sessions.find((session) => session.id === 'own')!;
      const other = sessions.find((session) => session.id === 'other')!;
      expect(own.allowanceAmount).toBe(200000);
      // Buổi gia sư khác: đủ dữ liệu vận hành (điểm danh, nội dung) nhưng ẩn tài chính.
      expect(other.allowanceAmount).toBeUndefined();
      expect(other.coefficient).toBeUndefined();
      expect(other.teacherPaymentStatus).toBeUndefined();
      // Quản lý lớp vẫn thấy trợ cấp quản lý lớp của chính mình trên buổi.
      expect(other.trainingManagerAllowanceAmount).toBe(6000);
      expect(other.lessonContent).toBe('<p>Nội dung</p>');
      expect(
        (other.attendance as Array<Record<string, unknown>>)[0],
      ).toMatchObject({ studentId: 'student-1', status: 'present' });
      expect(
        (other.attendance as Array<Record<string, unknown>>)[0].tuitionFee,
      ).toBeUndefined();
    });

    it('keeps other teachers sessions review-only for a pure teacher', async () => {
      staffOperationsAccess.resolveClassAccess.mockResolvedValue({
        mode: 'teacher',
        isAdmin: false,
        isClassTeacher: true,
        isClassManager: false,
        isTrainingHead: false,
      });

      const sessions = (await reporting.getSessionsByClassIdForStaff(
        'user-1',
        UserRole.staff,
        'class-1',
        '11',
        '2026',
      )) as Array<Record<string, unknown>>;

      const other = sessions.find((session) => session.id === 'other')!;
      expect(other.allowanceAmount).toBeUndefined();
      expect(other.teacher).toEqual({
        id: 'teacher-2',
        fullName: expect.any(String),
      });
    });

    // #277: Trưởng ban Đào tạo xem lịch sử buổi mọi lớp — không học phí,
    // không trợ cấp quản lý lớp. 14/11: thấy trợ cấp / hệ số / thanh toán
    // trợ cấp gia sư để chỉnh tay.
    it('training_head on a non-managed class keeps teacher allowance, hides tuition', async () => {
      staffOperationsAccess.resolveClassViewerActor.mockResolvedValue({
        id: 'head-1',
        roles: [StaffRole.training_head],
      });
      staffOperationsAccess.resolveClassAccess.mockResolvedValue({
        mode: 'training_head',
        isAdmin: false,
        isClassTeacher: false,
        isClassManager: false,
        isTrainingHead: true,
      });

      const sessions = (await reporting.getSessionsByClassIdForStaff(
        'user-1',
        UserRole.staff,
        'class-1',
        '11',
        '2026',
      )) as Array<Record<string, unknown>>;

      expect(sessions).toHaveLength(2);
      for (const session of sessions) {
        expect(session).toHaveProperty('allowanceAmount');
        expect(session).toHaveProperty('coefficient');
        expect(session).toHaveProperty('teacherPaymentStatus');
        expect(session.tuitionFee).toBeUndefined();
        expect(session.operatingDeductionAmount).toBeUndefined();
        expect(session.trainingManagerAllowanceAmount).toBeUndefined();
        expect(session.lessonContent).toBe('<p>Nội dung</p>');
        expect(
          (session.attendance as Array<Record<string, unknown>>)[0].tuitionFee,
        ).toBeUndefined();
      }
    });
  });

  describe('chỉ trả id + tên gia sư (biên bản 2026-11-12 mục 3)', () => {
    const SAFE_TEACHER_SELECT = {
      select: {
        id: true,
        user: { select: { first_name: true, last_name: true } },
      },
    };
    type FindManyArgs = { include: Record<string, unknown> };
    const prisma = {
      session: { findMany: jest.fn<Promise<unknown[]>, [FindManyArgs]>() },
    };
    let reporting: SessionReportingService;

    beforeEach(() => {
      prisma.session.findMany.mockResolvedValue([]);
      reporting = new SessionReportingService(prisma as never, {} as never);
    });

    it('getSessionsByClassId không kéo CCCD/ngân hàng của gia sư', async () => {
      await reporting.getSessionsByClassId('class-1', '11', '2026');

      const args = prisma.session.findMany.mock.calls[0][0];
      expect(args.include.teacher).toEqual(SAFE_TEACHER_SELECT);
    });

    it('getSessionsByTeacherId chỉ lấy id + tên lớp, không lấy học phí lớp', async () => {
      await reporting.getSessionsByTeacherId('teacher-1', '11', '2026');

      const args = prisma.session.findMany.mock.calls[0][0];
      expect(args.include.teacher).toEqual(SAFE_TEACHER_SELECT);
      expect(args.include.class).toEqual({
        select: { id: true, name: true },
      });
    });
  });
});
