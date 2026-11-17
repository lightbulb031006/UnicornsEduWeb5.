import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class PrismaServiceMock {},
}));

import { StaffRole, UserRole } from '../../generated/enums';
import {
  StaffOperationsAccessService,
  canEditClassSessionCoefficient,
  canManageClassTeachersAndPay,
  canWorkOnClassSession,
} from './staff-operations-access.service';

describe('StaffOperationsAccessService', () => {
  const mockPrisma = {
    staffInfo: {
      findFirst: jest.fn(),
    },
    customerCareService: {
      findFirst: jest.fn(),
    },
    classTeacher: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    class: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
    },
  };

  let service: StaffOperationsAccessService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new StaffOperationsAccessService(mockPrisma as never);
  });

  it('returns admin actor without looking up a staff profile', async () => {
    const actor = await service.resolveActor(
      '7b1c833e-c04e-4fe3-a3fe-8d108327582c',
      UserRole.admin,
    );

    expect(actor).toEqual({
      id: '7b1c833e-c04e-4fe3-a3fe-8d108327582c',
      roles: [],
    });
    expect(mockPrisma.staffInfo.findFirst).not.toHaveBeenCalled();
  });

  it('rejects non-staff actors from staff operations', async () => {
    mockPrisma.staffInfo.findFirst.mockResolvedValue(null);

    await expect(
      service.resolveActor(
        '6414c8dd-1c84-46da-b8c6-7f9507ec6f63',
        UserRole.student,
      ),
    ).rejects.toThrow(
      new ForbiddenException(
        'Chỉ nhân sự có hồ sơ staff mới được dùng màn vận hành lớp học.',
      ),
    );
  });

  it('rejects staff accounts without a staff profile', async () => {
    mockPrisma.staffInfo.findFirst.mockResolvedValue(null);

    await expect(
      service.resolveActor(
        '49e11f3b-4e6e-41dc-a3ef-d7ac3dc659fd',
        UserRole.staff,
      ),
    ).rejects.toThrow(
      new ForbiddenException(
        'Chỉ nhân sự có hồ sơ staff mới được dùng màn vận hành lớp học.',
      ),
    );
  });

  it('rejects staff accounts without teacher role', async () => {
    mockPrisma.staffInfo.findFirst.mockResolvedValue({
      id: 'staff-1',
      roles: [StaffRole.customer_care],
    });

    await expect(
      service.resolveActor(
        '2c6cd8b4-ec31-4441-a34d-a2db846376a1',
        UserRole.staff,
      ),
    ).rejects.toThrow(
      new ForbiddenException(
        'Màn /staff hiện chỉ mở cho teacher, Đào Tạo, kế toán, hoặc staff admin.',
      ),
    );
  });

  it('resolves linked staff actors even when primary role is student', async () => {
    mockPrisma.staffInfo.findFirst.mockResolvedValue({
      id: 'staff-student-1',
      roles: [StaffRole.accountant_income],
    });

    await expect(
      service.resolveActor('student-accountant-user', UserRole.student),
    ).resolves.toEqual({
      id: 'staff-student-1',
      roles: [StaffRole.accountant_income],
    });
  });

  it('allows elevated non-teacher staff roles for staff operations', async () => {
    mockPrisma.staffInfo.findFirst.mockResolvedValue({
      id: 'accountant-1',
      roles: [StaffRole.accountant_income],
    });

    await expect(
      service.resolveActor('accountant-user', UserRole.staff),
    ).resolves.toEqual({
      id: 'accountant-1',
      roles: [StaffRole.accountant_income],
    });
  });

  // #267: Trợ lí không còn quyền lớp ở staff workspace.
  it('rejects assistant-only staff for class staff operations', async () => {
    mockPrisma.staffInfo.findFirst.mockResolvedValue({
      id: 'assistant-1',
      roles: [StaffRole.sale_customer_care_head],
    });

    await expect(
      service.resolveActor('assistant-user', UserRole.staff),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('returns teacher actor when the staff profile is eligible', async () => {
    mockPrisma.staffInfo.findFirst.mockResolvedValue({
      id: 'staff-1',
      roles: [StaffRole.teacher],
    });

    await expect(
      service.resolveActor(
        'b19014ce-90b5-4b1b-ad79-c1c0627d21a2',
        UserRole.staff,
      ),
    ).resolves.toEqual({
      id: 'staff-1',
      roles: [StaffRole.teacher],
    });
  });

  it('allows training staff for calendar and class list access', async () => {
    mockPrisma.staffInfo.findFirst.mockResolvedValue({
      id: 'training-1',
      roles: [StaffRole.training],
    });

    await expect(
      service.resolveCalendarActor('training-user', UserRole.staff),
    ).resolves.toEqual({
      id: 'training-1',
      roles: [StaffRole.training],
      calendarAccessMode: 'training',
    });

    await expect(
      service.resolveActor('training-user', UserRole.staff),
    ).resolves.toEqual({
      id: 'training-1',
      roles: [StaffRole.training],
    });
  });

  it('rejects non-teacher non-training staff from calendar access', async () => {
    mockPrisma.staffInfo.findFirst.mockResolvedValue({
      id: 'assistant-1',
      roles: [StaffRole.sale_customer_care_head],
    });

    await expect(
      service.resolveCalendarActor('assistant-user', UserRole.staff),
    ).rejects.toThrow(
      new ForbiddenException(
        'Lịch staff hiện chỉ mở cho teacher hoặc Đào Tạo.',
      ),
    );
  });

  it('returns customer care actor for class detail viewer routes', async () => {
    mockPrisma.staffInfo.findFirst.mockResolvedValue({
      id: 'staff-1',
      roles: [StaffRole.customer_care],
    });

    await expect(
      service.resolveClassViewerActor(
        '51b8d7f4-8d43-4d0d-b4ef-9ed0f3c594db',
        UserRole.staff,
      ),
    ).resolves.toEqual({
      id: 'staff-1',
      roles: [StaffRole.customer_care],
    });
  });

  it('throws when teacher is not assigned to the class', async () => {
    mockPrisma.classTeacher.findUnique.mockResolvedValue(null);

    await expect(
      service.assertTeacherAssignedToClass('teacher-1', 'class-1'),
    ).rejects.toThrow(new NotFoundException('Class not found'));
  });

  it('returns the single teacher assigned to a class', async () => {
    mockPrisma.classTeacher.findMany.mockResolvedValue([
      { teacherId: 'teacher-7' },
    ]);

    await expect(service.resolveSingleTeacherForClass('class-1')).resolves.toBe(
      'teacher-7',
    );
  });

  it('rejects classes that do not have exactly one teacher assigned', async () => {
    mockPrisma.classTeacher.findMany.mockResolvedValue([
      { teacherId: 'teacher-1' },
      { teacherId: 'teacher-2' },
    ]);

    await expect(
      service.resolveSingleTeacherForClass('class-1'),
    ).rejects.toThrow(
      new BadRequestException(
        'Lớp phải có đúng 1 gia sư phụ trách trước khi Staff có thể tạo buổi học.',
      ),
    );
  });

  it('resolves class view mode as customer care when the class has a take-care student', async () => {
    mockPrisma.classTeacher.findUnique.mockResolvedValue(null);
    mockPrisma.customerCareService.findFirst.mockResolvedValue({
      id: 'customer-care-1',
    });

    await expect(
      service.resolveClassViewAccessMode(
        {
          id: 'staff-1',
          roles: [StaffRole.customer_care],
        },
        'class-1',
      ),
    ).resolves.toBe('customer_care');
  });

  describe('resolveClassTeacherManagerScope', () => {
    it('gives admin users full scope without a staff lookup', async () => {
      await expect(
        service.resolveClassTeacherManagerScope(
          'admin-user',
          UserRole.admin,
          'class-1',
        ),
      ).resolves.toEqual({
        lockedTeacherId: null,
        isAdmin: true,
        isClassManager: false,
        isTrainingHead: false,
      });
      expect(mockPrisma.staffInfo.findFirst).not.toHaveBeenCalled();
    });

    it('gives staff admin full scope', async () => {
      mockPrisma.staffInfo.findFirst.mockResolvedValue({
        id: 'staff-admin',
        roles: [StaffRole.admin],
      });

      await expect(
        service.resolveClassTeacherManagerScope(
          'user-1',
          UserRole.staff,
          'class-1',
        ),
      ).resolves.toEqual({
        lockedTeacherId: null,
        isAdmin: true,
        isClassManager: false,
        isTrainingHead: false,
      });
      expect(mockPrisma.class.findFirst).not.toHaveBeenCalled();
    });

    // #267: Trợ lí không còn chỉnh gia sư của lớp.
    it('rejects assistant staff', async () => {
      mockPrisma.staffInfo.findFirst.mockResolvedValue({
        id: 'staff-assistant',
        roles: [StaffRole.sale_customer_care_head],
      });

      await expect(
        service.resolveClassTeacherManagerScope(
          'user-1',
          UserRole.staff,
          'class-1',
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('locks the training manager own teacher row on managed classes', async () => {
      mockPrisma.staffInfo.findFirst.mockResolvedValue({
        id: 'staff-training',
        roles: [StaffRole.training, StaffRole.teacher],
      });
      mockPrisma.class.findFirst.mockResolvedValue({ id: 'class-1' });

      await expect(
        service.resolveClassTeacherManagerScope(
          'user-1',
          UserRole.staff,
          'class-1',
        ),
      ).resolves.toEqual({
        lockedTeacherId: 'staff-training',
        isAdmin: false,
        isClassManager: true,
        isTrainingHead: false,
      });
      expect(mockPrisma.class.findFirst).toHaveBeenCalledWith({
        where: { id: 'class-1', trainingManagerStaffId: 'staff-training' },
        select: { id: true },
      });
    });

    it('rejects training staff on classes they do not manage', async () => {
      mockPrisma.staffInfo.findFirst.mockResolvedValue({
        id: 'staff-training',
        roles: [StaffRole.training],
      });
      mockPrisma.class.findFirst.mockResolvedValue(null);

      await expect(
        service.resolveClassTeacherManagerScope(
          'user-1',
          UserRole.staff,
          'class-2',
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    // #277: Trưởng ban Đào tạo chỉnh gia sư + lương gia sư trên mọi lớp, khoá
    // dòng lương của chính mình.
    it('lets training_head manage teachers on classes they do not manage (#277)', async () => {
      mockPrisma.staffInfo.findFirst.mockResolvedValue({
        id: 'staff-head',
        roles: [StaffRole.training_head],
      });
      mockPrisma.class.findFirst.mockResolvedValue(null);

      await expect(
        service.resolveClassTeacherManagerScope(
          'user-1',
          UserRole.staff,
          'class-2',
        ),
      ).resolves.toEqual({
        lockedTeacherId: 'staff-head',
        isAdmin: false,
        isClassManager: false,
        isTrainingHead: true,
      });
    });

    it.each([
      [[StaffRole.accountant_expense]],
      [[StaffRole.accountant_income]],
    ])('rejects %p on classes they do not manage', async (roles) => {
      mockPrisma.staffInfo.findFirst.mockResolvedValue({
        id: 'staff-x',
        roles,
      });
      mockPrisma.class.findFirst.mockResolvedValue(null);

      await expect(
        service.resolveClassTeacherManagerScope(
          'user-1',
          UserRole.staff,
          'class-2',
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('canManageClassTeachersAndPay: Admin, Quản lý lớp hoặc Trưởng ban Đào tạo', () => {
      const none = {
        isAdmin: false,
        isClassManager: false,
        isTrainingHead: false,
      };
      expect(canManageClassTeachersAndPay({ ...none, isAdmin: true })).toBe(
        true,
      );
      expect(
        canManageClassTeachersAndPay({ ...none, isClassManager: true }),
      ).toBe(true);
      expect(
        canManageClassTeachersAndPay({ ...none, isTrainingHead: true }),
      ).toBe(true);
      expect(canManageClassTeachersAndPay(none)).toBe(false);
    });

    it('rejects plain teachers', async () => {
      mockPrisma.staffInfo.findFirst.mockResolvedValue({
        id: 'staff-teacher',
        roles: [StaffRole.teacher],
      });

      await expect(
        service.resolveClassTeacherManagerScope(
          'user-1',
          UserRole.staff,
          'class-1',
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(mockPrisma.class.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('resolveClassWorkAccess (#275)', () => {
    const staff = (id: string, roles: StaffRole[]) =>
      mockPrisma.staffInfo.findFirst.mockResolvedValue({ id, roles });

    it('gives admin users full access without a staff lookup', async () => {
      await expect(
        service.resolveClassWorkAccess('user-admin', UserRole.admin, 'class-1'),
      ).resolves.toEqual({
        staffId: null,
        isAdmin: true,
        isClassTeacher: false,
        isClassManager: false,
      });
      expect(mockPrisma.staffInfo.findFirst).not.toHaveBeenCalled();
    });

    it('flags the training manager of the class (Quản lý lớp)', async () => {
      staff('manager-1', [StaffRole.training]);
      mockPrisma.class.findFirst.mockResolvedValue({ id: 'class-1' });

      await expect(
        service.resolveClassWorkAccess('user-1', UserRole.staff, 'class-1'),
      ).resolves.toEqual({
        staffId: 'manager-1',
        isAdmin: false,
        isClassTeacher: false,
        isClassManager: true,
      });
      expect(mockPrisma.class.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'class-1', trainingManagerStaffId: 'manager-1' },
        }),
      );
    });

    it('flags both roles for a teacher who is also the class manager (hợp quyền)', async () => {
      staff('staff-1', [StaffRole.teacher, StaffRole.training_head]);
      mockPrisma.classTeacher.findUnique.mockResolvedValue({
        teacherId: 'staff-1',
      });
      mockPrisma.class.findFirst.mockResolvedValue({ id: 'class-1' });

      const access = await service.resolveClassWorkAccess(
        'user-1',
        UserRole.staff,
        'class-1',
      );

      expect(access).toMatchObject({
        isClassTeacher: true,
        isClassManager: true,
      });
      expect(canWorkOnClassSession(access, 'teacher-other')).toBe(true);
    });

    it('rejects training staff on a class they do not manage', async () => {
      staff('manager-1', [StaffRole.training]);
      mockPrisma.class.findFirst.mockResolvedValue(null);

      await expect(
        service.resolveClassWorkAccess('user-1', UserRole.staff, 'class-2'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    // #277: Trưởng ban Đào tạo xem mọi lớp nhưng việc của gia sư (lịch, điểm
    // danh, nhận xét, tạo buổi) chỉ trên lớp mình quản lý.
    it('rejects training_head on a class they do not manage (#277)', async () => {
      staff('head-1', [StaffRole.training_head]);
      mockPrisma.class.findFirst.mockResolvedValue(null);

      await expect(
        service.resolveClassWorkAccess('user-1', UserRole.staff, 'class-2'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('allows training_head on a class they manage (#277)', async () => {
      staff('head-1', [StaffRole.training_head]);
      mockPrisma.class.findFirst.mockResolvedValue({ id: 'class-1' });

      await expect(
        service.resolveClassWorkAccess('user-1', UserRole.staff, 'class-1'),
      ).resolves.toMatchObject({ staffId: 'head-1', isClassManager: true });
    });

    it.each([
      StaffRole.accountant_income,
      StaffRole.accountant_expense,
      StaffRole.customer_care,
    ])('rejects %s without class assignment', async (role) => {
      staff('staff-x', [role]);

      await expect(
        service.resolveClassWorkAccess('user-1', UserRole.staff, 'class-1'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(mockPrisma.class.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('session permission helpers (#275)', () => {
    const teacher = {
      staffId: 'teacher-1',
      isAdmin: false,
      isClassTeacher: true,
      isClassManager: false,
    };
    const manager = {
      staffId: 'manager-1',
      isAdmin: false,
      isClassTeacher: false,
      isClassManager: true,
    };
    const admin = {
      staffId: null,
      isAdmin: true,
      isClassTeacher: false,
      isClassManager: false,
    };

    it('lets teacher work only on own sessions, manager and admin on all', () => {
      expect(canWorkOnClassSession(teacher, 'teacher-1')).toBe(true);
      expect(canWorkOnClassSession(teacher, 'teacher-2')).toBe(false);
      expect(canWorkOnClassSession(manager, 'teacher-2')).toBe(true);
      expect(canWorkOnClassSession(admin, 'teacher-2')).toBe(true);
    });

    it('never lets Quản lý lớp change coefficient / trial of another teacher session', () => {
      expect(canEditClassSessionCoefficient(manager, 'teacher-2')).toBe(false);
      expect(
        canEditClassSessionCoefficient(
          { ...manager, staffId: 'teacher-1', isClassTeacher: true },
          'teacher-2',
        ),
      ).toBe(false);
      expect(canEditClassSessionCoefficient(teacher, 'teacher-1')).toBe(true);
      expect(canEditClassSessionCoefficient(admin, 'teacher-2')).toBe(true);
    });
  });

  describe('resolveClassAccess (#275)', () => {
    it('keeps teacher view mode but flags class manager for union access', async () => {
      mockPrisma.classTeacher.findUnique.mockResolvedValue({
        teacherId: 'staff-1',
      });
      mockPrisma.class.findFirst.mockResolvedValue({ id: 'class-1' });

      await expect(
        service.resolveClassAccess(
          { id: 'staff-1', roles: [StaffRole.teacher, StaffRole.training] },
          'class-1',
        ),
      ).resolves.toEqual({
        mode: 'teacher',
        isAdmin: false,
        isClassTeacher: true,
        isClassManager: true,
        isTrainingHead: false,
      });
    });

    it('returns training_manager mode for a pure class manager', async () => {
      mockPrisma.class.findFirst.mockResolvedValue({ id: 'class-1' });

      await expect(
        service.resolveClassAccess(
          { id: 'manager-1', roles: [StaffRole.training] },
          'class-1',
        ),
      ).resolves.toMatchObject({
        mode: 'training_manager',
        isClassManager: true,
      });
    });
  });

  describe('resolveClassAccess (#277 Trưởng ban Đào tạo)', () => {
    it('returns training_head mode on a class they neither teach nor manage', async () => {
      mockPrisma.classTeacher.findUnique.mockResolvedValue(null);
      mockPrisma.class.findFirst.mockResolvedValue(null);
      mockPrisma.class.findUnique.mockResolvedValue({ id: 'class-2' });

      await expect(
        service.resolveClassAccess(
          { id: 'head-1', roles: [StaffRole.training_head] },
          'class-2',
        ),
      ).resolves.toEqual({
        mode: 'training_head',
        isAdmin: false,
        isClassTeacher: false,
        isClassManager: false,
        isTrainingHead: true,
      });
    });

    it('keeps training_manager mode when the head manages the class', async () => {
      mockPrisma.class.findFirst.mockResolvedValue({ id: 'class-1' });

      await expect(
        service.resolveClassAccess(
          { id: 'head-1', roles: [StaffRole.training_head] },
          'class-1',
        ),
      ).resolves.toMatchObject({
        mode: 'training_manager',
        isClassManager: true,
        isTrainingHead: true,
      });
    });

    it('returns 404 when the class does not exist', async () => {
      mockPrisma.classTeacher.findUnique.mockResolvedValue(null);
      mockPrisma.class.findFirst.mockResolvedValue(null);
      mockPrisma.class.findUnique.mockResolvedValue(null);

      await expect(
        service.resolveClassAccess(
          { id: 'head-1', roles: [StaffRole.training_head] },
          'missing',
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('still 404s plain training staff on classes they do not manage', async () => {
      mockPrisma.classTeacher.findUnique.mockResolvedValue(null);
      mockPrisma.class.findFirst.mockResolvedValue(null);
      mockPrisma.class.findUnique.mockResolvedValue({ id: 'class-2' });

      await expect(
        service.resolveClassAccess(
          { id: 'training-1', roles: [StaffRole.training] },
          'class-2',
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
