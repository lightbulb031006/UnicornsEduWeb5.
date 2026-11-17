jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class PrismaServiceMock {},
}));
jest.mock('src/staff/staff.service', () => ({
  StaffService: class StaffServiceMock {},
}));

import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { StaffRole, UserRole } from '../../generated/enums';
import { UserService } from './user.service';
import { ACTIVE_STANDING_TEACHER } from 'src/class/standing-teacher-filter';

describe('UserService', () => {
  const mockPrisma = {
    user: {
      create: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    staffInfo: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    studentClass: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      updateMany: jest.fn(),
      createMany: jest.fn(),
    },
    class: {
      findMany: jest.fn(),
    },
    customerCareService: {
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
    studentInfo: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const actionHistoryService = {
    recordCreate: jest.fn(),
    recordUpdate: jest.fn(),
    recordDelete: jest.fn(),
  };

  const authService = {
    createPendingUserWithVerificationEmail: jest.fn(),
    invalidateAuthIdentityCache: jest.fn(),
  };

  const staffService = {
    createStaff: jest.fn(),
  };

  let service: UserService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(
      (callback: (db: typeof mockPrisma) => unknown) => callback(mockPrisma),
    );
    service = new UserService(
      mockPrisma as never,
      actionHistoryService as never,
      authService as never,
      staffService as never,
    );
  });

  it('delegates user creation to auth provisioning flow', async () => {
    authService.createPendingUserWithVerificationEmail.mockResolvedValue({
      message: 'Tạo user thành công. Email xác thực đã được gửi.',
    });

    await expect(
      service.createUser(
        {
          email: 'new-user@example.com',
          password: 'secret',
          accountHandle: 'new-user',
        },
        {
          userId: 'admin-1',
          userEmail: 'admin@example.com',
          roleType: 'admin',
        },
      ),
    ).resolves.toEqual({
      message: 'Tạo user thành công. Email xác thực đã được gửi.',
    });

    expect(
      authService.createPendingUserWithVerificationEmail,
    ).toHaveBeenCalledWith(
      {
        email: 'new-user@example.com',
        password: 'secret',
        accountHandle: 'new-user',
      },
      {
        auditActor: {
          userId: 'admin-1',
          userEmail: 'admin@example.com',
          roleType: 'admin',
        },
        createDescription: 'Tạo người dùng từ trang quản trị',
        updateDescription: 'Cập nhật user pending từ trang quản trị',
        successMessage: 'Tạo user thành công. Email xác thực đã được gửi.',
      },
    );
  });

  it('applies roleType immediately after provisioning when requested', async () => {
    authService.createPendingUserWithVerificationEmail.mockResolvedValue({
      message: 'Tạo user thành công. Email xác thực đã được gửi.',
    });
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
    const updateUserSpy = jest
      .spyOn(service, 'updateUser')
      .mockResolvedValue({ id: 'user-1' } as never);

    await expect(
      service.createUser(
        {
          email: 'staff@example.com',
          phone: '0901234567',
          password: 'secret',
          first_name: 'Staff',
          last_name: 'Candidate',
          province: 'Da Nang',
          accountHandle: 'staff-candidate',
          roleType: 'staff',
          staffRoles: ['teacher'],
        },
        {
          userId: 'admin-1',
          userEmail: 'admin@example.com',
          roleType: 'admin',
        },
      ),
    ).resolves.toEqual({
      message: 'Tạo user thành công. Email xác thực đã được gửi.',
    });

    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'staff@example.com' },
      select: { id: true },
    });
    expect(updateUserSpy).toHaveBeenCalledWith(
      {
        id: 'user-1',
        roleType: 'staff',
        staffRoles: ['teacher'],
      },
      {
        userId: 'admin-1',
        userEmail: 'admin@example.com',
        roleType: 'admin',
      },
    );
  });

  it('rejects student user creation without a student name', async () => {
    await expect(
      service.createUser(
        {
          email: 'student@example.com',
          password: 'secret',
          accountHandle: 'student-handle',
          roleType: UserRole.student,
        },
        {
          userId: 'admin-1',
          userEmail: 'admin@example.com',
          roleType: 'admin',
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(
      authService.createPendingUserWithVerificationEmail,
    ).not.toHaveBeenCalled();
  });

  describe('createStudentUser customer care owner', () => {
    const customerCareActor = {
      userId: 'care-user-1',
      userEmail: 'care@example.com',
      roleType: UserRole.staff,
    };
    const payload = {
      email: 'new-student@example.com',
      phone: '0900000000',
      password: 'secret',
      accountHandle: 'new-student',
      first_name: 'An',
      last_name: 'Nguyen',
      class_ids: [] as string[],
    };

    beforeEach(() => {
      authService.createPendingUserWithVerificationEmail.mockResolvedValue({
        message: 'Tạo học sinh thành công. Email xác thực đã được gửi.',
      });
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: payload.email,
        studentInfo: null,
      });
      mockPrisma.studentInfo.create.mockResolvedValue({ id: 'student-1' });
      mockPrisma.studentInfo.findUnique.mockResolvedValue({ id: 'student-1' });
      mockPrisma.studentClass.findMany.mockResolvedValue([]);
    });

    it('assigns the creating customer care staff with their default percent', async () => {
      mockPrisma.staffInfo.findUnique.mockResolvedValue({
        id: 'staff-care-1',
        roles: [StaffRole.customer_care],
        customerCareDefaultProfitPercent: 0.15,
      });

      await service.createStudentUser(payload, customerCareActor);

      expect(mockPrisma.customerCareService.upsert).toHaveBeenCalledWith({
        where: { studentId: 'student-1' },
        create: {
          studentId: 'student-1',
          staffId: 'staff-care-1',
          profitPercent: 0.15,
        },
        update: {},
      });
    });

    it('rejects class assignment when customer care creates a student', async () => {
      mockPrisma.staffInfo.findUnique.mockResolvedValue({
        id: 'staff-care-1',
        roles: [StaffRole.customer_care],
        customerCareDefaultProfitPercent: 0.15,
      });

      await expect(
        service.createStudentUser(
          { ...payload, class_ids: ['class-1'] },
          customerCareActor,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(
        authService.createPendingUserWithVerificationEmail,
      ).not.toHaveBeenCalled();
    });

    it('does not auto-assign customer care when an assistant creates a student', async () => {
      mockPrisma.staffInfo.findUnique.mockResolvedValue({
        id: 'staff-assistant-1',
        roles: [StaffRole.sale_customer_care_head, StaffRole.customer_care],
        customerCareDefaultProfitPercent: 0.15,
      });

      await service.createStudentUser(payload, customerCareActor);

      expect(mockPrisma.customerCareService.upsert).not.toHaveBeenCalled();
    });

    describe('#273 xếp lớp khi tạo học sinh', () => {
      const adminActor = {
        userId: 'admin-1',
        userEmail: 'admin@example.com',
        roleType: UserRole.admin,
      };
      const classRow = (overrides: Record<string, unknown> = {}) => ({
        id: 'class-1',
        name: 'Toán 10A',
        pricingMode: 'per_session',
        studentTuitionPerSession: null,
        studentTuitionPerBlock: null,
        tuitionPackageTotal: null,
        tuitionPackageSession: null,
        ...overrides,
      });

      it('lớp trống chưa có học phí → 400, không tạo tài khoản', async () => {
        mockPrisma.class.findMany.mockResolvedValue([classRow()]);
        mockPrisma.studentClass.findMany.mockResolvedValue([]);

        await expect(
          service.createStudentUser(
            { ...payload, class_ids: ['class-1'] },
            adminActor,
          ),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(
          authService.createPendingUserWithVerificationEmail,
        ).not.toHaveBeenCalled();
      });

      it('lớp trống có học phí 0đ → tạo được', async () => {
        mockPrisma.class.findMany.mockResolvedValue([
          classRow({ studentTuitionPerSession: 0 }),
        ]);
        mockPrisma.studentClass.findMany.mockResolvedValue([]);

        await service.createStudentUser(
          { ...payload, class_ids: ['class-1'] },
          adminActor,
        );
        expect(
          authService.createPendingUserWithVerificationEmail,
        ).toHaveBeenCalled();
      });

      it('lớp đã có học sinh đang học → không áp quy tắc', async () => {
        mockPrisma.class.findMany.mockResolvedValue([classRow()]);
        mockPrisma.studentClass.findMany.mockResolvedValue([
          { classId: 'class-1' },
        ]);

        await service.createStudentUser(
          { ...payload, class_ids: ['class-1'] },
          adminActor,
        );
        expect(
          authService.createPendingUserWithVerificationEmail,
        ).toHaveBeenCalled();
      });
    });

    it('does not look up staff when an admin creates a student', async () => {
      await service.createStudentUser(payload, {
        userId: 'admin-1',
        userEmail: 'admin@example.com',
        roleType: UserRole.admin,
      });

      expect(mockPrisma.staffInfo.findUnique).not.toHaveBeenCalled();
      expect(mockPrisma.customerCareService.upsert).not.toHaveBeenCalled();
    });
  });

  it('filters users by search tokens and clamps page to available range', async () => {
    mockPrisma.user.count.mockResolvedValue(1);
    mockPrisma.user.findMany.mockResolvedValue([
      {
        id: 'user-1',
        email: 'nguyenvan@example.com',
        phone: '0901234567',
        passwordHash: 'hashed-password',
        refreshToken: null,
        first_name: 'Nguyen',
        last_name: 'Van A',
        roleType: UserRole.guest,
        province: 'Hanoi',
        accountHandle: 'nguyenvan',
        createdAt: new Date('2026-03-20T10:00:00.000Z'),
        updatedAt: new Date('2026-03-20T10:00:00.000Z'),
        staffInfo: null,
        studentInfo: null,
      },
    ]);

    const response = await service.getUsers({
      page: 4,
      limit: 20,
      search: 'nguyen 0901',
    });

    const expectedWhere = {
      AND: [
        {
          OR: [
            { accountHandle: { contains: 'nguyen', mode: 'insensitive' } },
            { email: { contains: 'nguyen', mode: 'insensitive' } },
            { phone: { contains: 'nguyen', mode: 'insensitive' } },
            { first_name: { contains: 'nguyen', mode: 'insensitive' } },
            { last_name: { contains: 'nguyen', mode: 'insensitive' } },
          ],
        },
        {
          OR: [
            { accountHandle: { contains: '0901', mode: 'insensitive' } },
            { email: { contains: '0901', mode: 'insensitive' } },
            { phone: { contains: '0901', mode: 'insensitive' } },
            { first_name: { contains: '0901', mode: 'insensitive' } },
            { last_name: { contains: '0901', mode: 'insensitive' } },
          ],
        },
      ],
    };

    expect(mockPrisma.user.count).toHaveBeenCalledWith({
      where: expectedWhere,
    });
    expect(mockPrisma.user.findMany).toHaveBeenCalledWith({
      where: expectedWhere,
      skip: 0,
      take: 20,
      orderBy: { createdAt: 'desc' },
      include: {
        staffInfo: { select: { id: true } },
        studentInfo: { select: { id: true } },
      },
    });
    expect(response.meta).toEqual({
      total: 1,
      page: 1,
      limit: 20,
    });
    expect(response.data).toEqual([
      expect.objectContaining({
        id: 'user-1',
        email: 'nguyenvan@example.com',
        accountHandle: 'nguyenvan',
      }),
    ]);
  });

  it('auto-creates a staff profile when roleType is changed to staff', async () => {
    mockPrisma.user.findUnique
      .mockResolvedValueOnce({
        id: 'user-1',
        email: 'new-user@example.com',
        phone: '0123456789',
        passwordHash: 'hashed-password',
        refreshToken: null,
        first_name: 'New',
        last_name: 'User',
        roleType: UserRole.guest,
        province: 'Hanoi',
        accountHandle: 'new-user',
        createdAt: new Date('2026-03-20T10:00:00.000Z'),
        updatedAt: new Date('2026-03-20T10:00:00.000Z'),
        staffInfo: null,
        studentInfo: null,
      })
      .mockResolvedValueOnce({
        id: 'user-1',
        email: 'new-user@example.com',
        phone: '0123456789',
        passwordHash: 'hashed-password',
        refreshToken: null,
        first_name: 'New',
        last_name: 'User',
        roleType: UserRole.staff,
        province: 'Hanoi',
        accountHandle: 'new-user',
        createdAt: new Date('2026-03-20T10:00:00.000Z'),
        updatedAt: new Date('2026-03-21T10:00:00.000Z'),
        staffInfo: {
          id: 'staff-1',
          fullName: 'New User',
          roles: ['teacher'],
        },
        studentInfo: null,
      });
    mockPrisma.user.update.mockResolvedValue({
      id: 'user-1',
      email: 'new-user@example.com',
      phone: '0123456789',
      passwordHash: 'hashed-password',
      refreshToken: null,
      first_name: 'New',
      last_name: 'User',
      roleType: UserRole.staff,
      province: 'Hanoi',
      accountHandle: 'new-user',
      createdAt: new Date('2026-03-20T10:00:00.000Z'),
      updatedAt: new Date('2026-03-21T10:00:00.000Z'),
    });
    mockPrisma.staffInfo.create.mockResolvedValue({
      id: 'staff-1',
    });
    mockPrisma.staffInfo.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValue({
        id: 'staff-1',
        fullName: 'New User',
        roles: ['teacher'],
        userId: 'user-1',
        status: 'active',
      });

    await service.updateUser(
      {
        id: 'user-1',
        roleType: UserRole.staff,
        staffRoles: ['teacher'],
      },
      {
        userId: 'admin-1',
        userEmail: 'admin@example.com',
        roleType: 'admin',
      },
    );

    expect(mockPrisma.staffInfo.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        roles: ['teacher'],
        userId: 'user-1',
      }),
    });
    expect(actionHistoryService.recordCreate).toHaveBeenCalledWith(
      mockPrisma,
      expect.objectContaining({
        entityType: 'staff',
        entityId: 'staff-1',
      }),
    );
    expect(authService.invalidateAuthIdentityCache).toHaveBeenCalledWith(
      'user-1',
    );
  });

  describe('tắt role CSKH từ tab phân quyền user (follow-up 13/11 mục 2.1)', () => {
    function mockStaffUser(roles: string[]) {
      const user = {
        id: 'user-1',
        email: 'care@example.com',
        phone: null,
        passwordHash: 'hashed-password',
        refreshToken: null,
        first_name: 'Chăm',
        last_name: 'Sóc',
        roleType: UserRole.staff,
        province: null,
        accountHandle: 'care',
        createdAt: new Date('2026-03-20T10:00:00.000Z'),
        updatedAt: new Date('2026-03-20T10:00:00.000Z'),
        staffInfo: { id: 'staff-care', fullName: 'Chăm Sóc', roles },
        studentInfo: null,
      };
      mockPrisma.user.findUnique.mockResolvedValue(user);
      mockPrisma.user.update.mockResolvedValue(user);
      mockPrisma.staffInfo.update.mockResolvedValue({ id: 'staff-care' });
      mockPrisma.staffInfo.findUnique.mockResolvedValue({
        id: 'staff-care',
        roles,
        userId: 'user-1',
        status: 'active',
      });
      mockPrisma.customerCareService.deleteMany.mockResolvedValue({
        count: 3,
      });
    }

    it('bỏ customer_care thì gỡ gán học sinh trong cùng transaction', async () => {
      mockStaffUser(['customer_care', 'teacher']);

      await service.updateUser({
        id: 'user-1',
        roleType: UserRole.staff,
        staffRoles: ['teacher'],
      });

      expect(mockPrisma.customerCareService.deleteMany).toHaveBeenCalledWith({
        where: { staffId: 'staff-care' },
      });
    });

    it('giữ customer_care thì không gỡ học sinh', async () => {
      mockStaffUser(['customer_care']);

      await service.updateUser({
        id: 'user-1',
        roleType: UserRole.staff,
        staffRoles: ['customer_care', 'teacher'],
      });

      expect(mockPrisma.customerCareService.deleteMany).not.toHaveBeenCalled();
    });
  });

  it('auto-creates a student profile when roleType is changed to student', async () => {
    mockPrisma.user.findUnique
      .mockResolvedValueOnce({
        id: 'user-1',
        email: 'new-user@example.com',
        phone: '0123456789',
        passwordHash: 'hashed-password',
        refreshToken: null,
        first_name: 'New',
        last_name: 'User',
        roleType: UserRole.guest,
        province: 'Hanoi',
        accountHandle: 'new-user',
        createdAt: new Date('2026-03-20T10:00:00.000Z'),
        updatedAt: new Date('2026-03-20T10:00:00.000Z'),
        staffInfo: null,
        studentInfo: null,
      })
      .mockResolvedValueOnce({
        id: 'user-1',
        email: 'new-user@example.com',
        phone: '0123456789',
        passwordHash: 'hashed-password',
        refreshToken: null,
        first_name: 'New',
        last_name: 'User',
        roleType: UserRole.student,
        province: 'Hanoi',
        accountHandle: 'new-user',
        createdAt: new Date('2026-03-20T10:00:00.000Z'),
        updatedAt: new Date('2026-03-21T10:00:00.000Z'),
        staffInfo: null,
        studentInfo: {
          id: 'student-1',
          fullName: 'User New',
        },
      });
    mockPrisma.user.update.mockResolvedValue({
      id: 'user-1',
      email: 'new-user@example.com',
      phone: '0123456789',
      passwordHash: 'hashed-password',
      refreshToken: null,
      first_name: 'New',
      last_name: 'User',
      roleType: UserRole.student,
      province: 'Hanoi',
      accountHandle: 'new-user',
      createdAt: new Date('2026-03-20T10:00:00.000Z'),
      updatedAt: new Date('2026-03-21T10:00:00.000Z'),
    });
    mockPrisma.studentInfo.create.mockResolvedValue({
      id: 'student-1',
    });
    mockPrisma.studentInfo.findUnique.mockResolvedValue({
      id: 'student-1',
      fullName: 'User New',
      email: 'new-user@example.com',
      province: 'Hanoi',
      userId: 'user-1',
      status: 'active',
    });

    await service.updateUser(
      {
        id: 'user-1',
        roleType: UserRole.student,
      },
      {
        userId: 'admin-1',
        userEmail: 'admin@example.com',
        roleType: 'admin',
      },
    );

    expect(mockPrisma.studentInfo.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: expect.stringMatching(/^UNIST-/),
        fullName: 'User New',
        email: 'new-user@example.com',
        province: 'Hanoi',
        userId: 'user-1',
      }),
    });
    expect(actionHistoryService.recordCreate).toHaveBeenCalledWith(
      mockPrisma,
      expect.objectContaining({
        entityType: 'student',
        entityId: 'student-1',
      }),
    );
    expect(authService.invalidateAuthIdentityCache).toHaveBeenCalledWith(
      'user-1',
    );
  });

  it('marks email as unverified when self profile email changes', async () => {
    mockPrisma.user.findUnique
      .mockResolvedValueOnce({
        id: 'user-1',
        email: 'old@example.com',
        phone: '0901234567',
        passwordHash: 'hashed-password',
        refreshToken: null,
        first_name: 'Old',
        last_name: 'Name',
        roleType: UserRole.guest,
        province: 'Hanoi',
        accountHandle: 'old-user',
        createdAt: new Date('2026-03-20T10:00:00.000Z'),
        updatedAt: new Date('2026-03-20T10:00:00.000Z'),
        staffInfo: null,
        studentInfo: null,
      })
      .mockResolvedValueOnce({
        id: 'user-1',
        email: 'new@example.com',
        phone: '0901234567',
        passwordHash: 'hashed-password',
        refreshToken: null,
        first_name: 'Old',
        last_name: 'Name',
        roleType: UserRole.guest,
        province: 'Hanoi',
        accountHandle: 'old-user',
        createdAt: new Date('2026-03-20T10:00:00.000Z'),
        updatedAt: new Date('2026-03-21T10:00:00.000Z'),
        staffInfo: null,
        studentInfo: null,
      });

    await service.updateMyProfile('user-1', {
      email: 'new@example.com',
    });

    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: expect.objectContaining({
        email: 'new@example.com',
        emailVerified: false,
      }),
    });
    expect(authService.invalidateAuthIdentityCache).toHaveBeenCalledWith(
      'user-1',
    );
  });

  it('normalizes bank_qr_link and rejects invalid protocols in self staff update', async () => {
    jest.spyOn(service, 'getFullProfile').mockResolvedValue({} as never);
    mockPrisma.staffInfo.findFirst.mockResolvedValue({ id: 'staff-1' });

    await service.updateMyStaffProfile('user-1', {
      bank_qr_link: ' https://example.com/qr ',
    });

    expect(mockPrisma.staffInfo.update).toHaveBeenCalledWith({
      where: { id: 'staff-1' },
      data: expect.objectContaining({
        bankQrLink: 'https://example.com/qr',
      }),
    });

    await expect(
      service.updateMyStaffProfile('user-1', {
        bank_qr_link: 'javascript:alert(1)',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('updates canonical staff name on user during self staff update', async () => {
    jest.spyOn(service, 'getFullProfile').mockResolvedValue({} as never);
    mockPrisma.staffInfo.findFirst.mockResolvedValue({ id: 'staff-1' });

    await service.updateMyStaffProfile('user-1', {
      full_name: 'Teacher A',
    });

    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: {
        first_name: 'A',
        last_name: 'Teacher',
      },
    });
    expect(mockPrisma.staffInfo.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          fullName: expect.anything(),
        }),
      }),
    );
  });

  it('does not persist student status through self student profile updates', async () => {
    jest.spyOn(service, 'getFullProfile').mockResolvedValue({} as never);
    mockPrisma.studentInfo.findFirst.mockResolvedValue({ id: 'student-1' });

    await service.updateMyStudentProfile('user-1', {
      full_name: 'Student Name',
      goal: 'Đạt IELTS 7.0',
      status: 'inactive',
    } as never);

    expect(mockPrisma.studentInfo.update).toHaveBeenCalledWith({
      where: { id: 'student-1' },
      data: expect.not.objectContaining({
        status: expect.anything(),
      }),
    });
  });

  it('normalizes parent_email through self student profile updates', async () => {
    jest.spyOn(service, 'getFullProfile').mockResolvedValue({} as never);
    mockPrisma.studentInfo.findFirst.mockResolvedValue({ id: 'student-1' });

    await service.updateMyStudentProfile('user-1', {
      parent_email: '  parent@example.com  ',
    });

    expect(mockPrisma.studentInfo.update).toHaveBeenCalledWith({
      where: { id: 'student-1' },
      data: expect.objectContaining({
        parentEmail: 'parent@example.com',
      }),
    });

    mockPrisma.studentInfo.update.mockClear();

    await service.updateMyStudentProfile('user-1', {
      parent_email: '',
    });

    expect(mockPrisma.studentInfo.update).toHaveBeenCalledWith({
      where: { id: 'student-1' },
      data: expect.objectContaining({
        parentEmail: null,
      }),
    });

    mockPrisma.studentInfo.update.mockClear();

    await service.updateMyStudentProfile('user-1', {
      parent_email: null,
    });

    expect(mockPrisma.studentInfo.update).toHaveBeenCalledWith({
      where: { id: 'student-1' },
      data: expect.objectContaining({
        parentEmail: null,
      }),
    });
  });

  it('updates parent_receipt_email_enabled through self student profile updates', async () => {
    jest.spyOn(service, 'getFullProfile').mockResolvedValue({} as never);
    mockPrisma.studentInfo.findFirst.mockResolvedValue({ id: 'student-1' });

    await service.updateMyStudentProfile('user-1', {
      parent_receipt_email_enabled: false,
    });

    expect(mockPrisma.studentInfo.update).toHaveBeenCalledWith({
      where: { id: 'student-1' },
      data: expect.objectContaining({
        parentReceiptEmailEnabled: false,
      }),
    });
  });

  it('gets linked student id via unique user mapping', async () => {
    mockPrisma.studentInfo.findUnique.mockResolvedValue({
      id: 'student-1',
    });

    await expect(service.getLinkedStudentId('user-1')).resolves.toBe(
      'student-1',
    );
    expect(mockPrisma.studentInfo.findUnique).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      select: { id: true },
    });
  });

  it('updates first_name and last_name through admin updateUser', async () => {
    mockPrisma.user.findUnique
      .mockResolvedValueOnce({
        id: 'user-1',
        email: 'user@example.com',
        phone: null,
        passwordHash: 'hashed-password',
        refreshToken: null,
        first_name: 'Old',
        last_name: 'Name',
        roleType: UserRole.guest,
        province: null,
        accountHandle: 'old-user',
        createdAt: new Date('2026-03-20T10:00:00.000Z'),
        updatedAt: new Date('2026-03-20T10:00:00.000Z'),
        staffInfo: null,
        studentInfo: null,
      })
      .mockResolvedValueOnce({
        id: 'user-1',
        email: 'user@example.com',
        phone: null,
        passwordHash: 'hashed-password',
        refreshToken: null,
        first_name: 'New',
        last_name: 'Person',
        roleType: UserRole.guest,
        province: null,
        accountHandle: 'old-user',
        createdAt: new Date('2026-03-20T10:00:00.000Z'),
        updatedAt: new Date('2026-03-21T10:00:00.000Z'),
        staffInfo: null,
        studentInfo: null,
      });
    mockPrisma.user.update.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      first_name: 'New',
      last_name: 'Person',
      accountHandle: 'old-user',
      roleType: UserRole.guest,
    });

    await service.updateUser({
      id: 'user-1',
      first_name: 'New',
      last_name: 'Person',
    });

    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: expect.objectContaining({
        first_name: 'New',
        last_name: 'Person',
      }),
    });
  });

  it('persists emailVerified when admin toggles verification flag', async () => {
    mockPrisma.user.findUnique
      .mockResolvedValueOnce({
        id: 'user-1',
        email: 'user@example.com',
        phone: null,
        passwordHash: 'hashed-password',
        refreshToken: null,
        first_name: null,
        last_name: null,
        roleType: UserRole.guest,
        province: null,
        accountHandle: 'user-1',
        emailVerified: false,
        phoneVerified: false,
        createdAt: new Date('2026-03-20T10:00:00.000Z'),
        updatedAt: new Date('2026-03-20T10:00:00.000Z'),
        staffInfo: null,
        studentInfo: null,
      })
      .mockResolvedValueOnce({
        id: 'user-1',
        email: 'user@example.com',
        phone: null,
        passwordHash: 'hashed-password',
        refreshToken: null,
        first_name: null,
        last_name: null,
        roleType: UserRole.guest,
        province: null,
        accountHandle: 'user-1',
        emailVerified: true,
        phoneVerified: false,
        createdAt: new Date('2026-03-20T10:00:00.000Z'),
        updatedAt: new Date('2026-03-21T10:00:00.000Z'),
        staffInfo: null,
        studentInfo: null,
      });
    mockPrisma.user.update.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      accountHandle: 'user-1',
      roleType: UserRole.guest,
      emailVerified: true,
    });

    await service.updateUser({
      id: 'user-1',
      emailVerified: true,
    });

    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: expect.objectContaining({
        emailVerified: true,
      }),
    });
  });

  it('resets emailVerified when admin changes email', async () => {
    mockPrisma.user.findUnique
      .mockResolvedValueOnce({
        id: 'user-1',
        email: 'old@example.com',
        phone: null,
        passwordHash: 'hashed-password',
        refreshToken: null,
        first_name: null,
        last_name: null,
        roleType: UserRole.guest,
        province: null,
        accountHandle: 'user-1',
        emailVerified: true,
        createdAt: new Date('2026-03-20T10:00:00.000Z'),
        updatedAt: new Date('2026-03-20T10:00:00.000Z'),
        staffInfo: null,
        studentInfo: null,
      })
      .mockResolvedValueOnce({
        id: 'user-1',
        email: 'new@example.com',
        phone: null,
        passwordHash: 'hashed-password',
        refreshToken: null,
        first_name: null,
        last_name: null,
        roleType: UserRole.guest,
        province: null,
        accountHandle: 'user-1',
        emailVerified: false,
        createdAt: new Date('2026-03-20T10:00:00.000Z'),
        updatedAt: new Date('2026-03-21T10:00:00.000Z'),
        staffInfo: null,
        studentInfo: null,
      });
    mockPrisma.user.update.mockResolvedValue({
      id: 'user-1',
      email: 'new@example.com',
      accountHandle: 'user-1',
      roleType: UserRole.guest,
      emailVerified: false,
    });

    await service.updateUser({
      id: 'user-1',
      email: 'new@example.com',
    });

    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: expect.objectContaining({
        email: 'new@example.com',
        emailVerified: false,
      }),
    });
  });

  it('soft-deletes user linked to staff profile by unlinking staff_info first', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'staff@example.com',
      accountHandle: 'staff-user',
      passwordHash: 'hash',
      refreshToken: null,
      staffInfo: { id: 'staff-1' },
      studentInfo: null,
    });
    mockPrisma.staffInfo.update.mockResolvedValue({
      id: 'staff-1',
      userId: null,
    });
    mockPrisma.user.delete.mockResolvedValue({
      id: 'user-1',
      email: 'staff@example.com',
      accountHandle: 'staff-user',
      passwordHash: 'hash',
      refreshToken: null,
    });

    await expect(
      service.deleteUser('user-1', {
        userId: 'admin-1',
        userEmail: 'admin@example.com',
        roleType: 'admin',
      }),
    ).resolves.toMatchObject({
      id: 'user-1',
      email: 'staff@example.com',
    });

    expect(mockPrisma.staffInfo.update).toHaveBeenCalledWith({
      where: { id: 'staff-1' },
      data: { userId: null },
    });
    expect(mockPrisma.user.delete).toHaveBeenCalledWith({
      where: { id: 'user-1' },
    });
    expect(authService.invalidateAuthIdentityCache).toHaveBeenCalledWith(
      'user-1',
    );
  });

  it('rejects deleteUser for the currently signed-in account', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'self@example.com',
      accountHandle: 'self-user',
      staffInfo: null,
      studentInfo: null,
    });

    await expect(
      service.deleteUser('user-1', {
        userId: 'user-1',
        userEmail: 'self@example.com',
        roleType: 'admin',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(mockPrisma.user.delete).not.toHaveBeenCalled();
  });

  describe('getMyStudentClassCards', () => {
    it('queries active, non-expired enrollments with names only and sorts by class name', async () => {
      const now = new Date('2026-10-02T00:00:00.000Z');
      mockPrisma.studentClass.findMany.mockResolvedValue([
        {
          class: {
            id: 'c2',
            name: 'Lớp B',
            course: { name: 'Khoá Y' },
            teachers: [],
          },
        },
        {
          class: {
            id: 'c1',
            name: 'Lớp A',
            course: { name: 'Khoá X' },
            teachers: [
              { teacher: { user: { first_name: 'An', last_name: 'Lê' } } },
            ],
          },
        },
      ]);

      const cards = await service.getMyStudentClassCards('s1', now);

      expect(cards).toEqual([
        {
          classId: 'c1',
          className: 'Lớp A',
          courseName: 'Khoá X',
          teacherNames: ['Lê An'],
          coverImageUrl: null,
        },
        {
          classId: 'c2',
          className: 'Lớp B',
          courseName: 'Khoá Y',
          teacherNames: [],
          coverImageUrl: null,
        },
      ]);

      const [args] = mockPrisma.studentClass.findMany.mock.calls[0] as [
        {
          where: unknown;
          select: { class: { select: { teachers: unknown } } };
        },
      ];
      expect(args.where).toEqual({
        studentId: 's1',
        status: 'active',
        class: {
          OR: [
            { contentAccessExpiresAt: null },
            { contentAccessExpiresAt: { gt: now } },
          ],
        },
      });
      expect(args.select.class.select.teachers).toEqual({
        where: ACTIVE_STANDING_TEACHER,
        select: {
          teacher: {
            select: { user: { select: { first_name: true, last_name: true } } },
          },
        },
      });
    });
  });

  describe('getMyStudentClassDetail', () => {
    const now = new Date('2026-10-02T00:00:00.000Z');
    const enrollment = (overrides: Record<string, unknown> = {}) => ({
      class: {
        id: 'c1',
        name: 'Lớp A',
        status: 'running',
        contentAccessExpiresAt: null,
        course: { name: 'Khoá X' },
        teachers: [
          { teacher: { user: { first_name: 'Bình', last_name: 'Trần' } } },
          { teacher: { user: { first_name: 'An', last_name: 'Lê' } } },
        ],
        ...overrides,
      },
    });

    it('returns header fields with active standing teacher names only', async () => {
      mockPrisma.studentClass.findFirst.mockResolvedValue(enrollment());

      const detail = await service.getMyStudentClassDetail('s1', 'c1', now);

      expect(detail).toEqual({
        classId: 'c1',
        className: 'Lớp A',
        classStatus: 'running',
        courseName: 'Khoá X',
        teacherNames: ['Lê An', 'Trần Bình'],
      });
      const [args] = mockPrisma.studentClass.findFirst.mock.calls[0] as [
        {
          where: unknown;
          select: { class: { select: Record<string, unknown> } };
        },
      ];
      expect(args.where).toEqual({
        classId: 'c1',
        studentId: 's1',
        status: 'active',
      });
      expect(args.select.class.select.teachers).toEqual({
        where: ACTIVE_STANDING_TEACHER,
        select: {
          teacher: {
            select: { user: { select: { first_name: true, last_name: true } } },
          },
        },
      });
    });

    it('returns empty teacherNames when class has no active standing teacher', async () => {
      mockPrisma.studentClass.findFirst.mockResolvedValue(
        enrollment({ teachers: [] }),
      );

      const detail = await service.getMyStudentClassDetail('s1', 'c1', now);

      expect(detail.teacherNames).toEqual([]);
    });

    it('rejects students not enrolled in the class', async () => {
      mockPrisma.studentClass.findFirst.mockResolvedValue(null);

      await expect(
        service.getMyStudentClassDetail('s1', 'c1', now),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects expired class content access', async () => {
      mockPrisma.studentClass.findFirst.mockResolvedValue(
        enrollment({
          contentAccessExpiresAt: new Date('2026-10-01T00:00:00.000Z'),
        }),
      );

      await expect(
        service.getMyStudentClassDetail('s1', 'c1', now),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('createStaffUser (15/11)', () => {
    const headActor = {
      userId: 'head-1',
      userEmail: 'head@example.com',
      roleType: UserRole.staff,
    };
    const payload = {
      email: 'new.staff@example.com',
      password: 'secret1',
      accountHandle: 'newstaff',
      phone: '0901234567',
      full_name: 'Nguyễn Văn B',
      cccd_number: '012345678999',
      gender: 'male' as const,
      roles: [StaffRole.teacher, StaffRole.customer_care],
    };

    beforeEach(() => {
      mockPrisma.user.findUnique.mockImplementation(
        ({ where }: { where: { id?: string; email?: string } }) =>
          Promise.resolve(
            where.id === 'head-1'
              ? {
                  roleType: UserRole.staff,
                  staffInfo: {
                    id: 'staff-head',
                    roles: [StaffRole.training_head],
                  },
                }
              : where.email === payload.email
                ? { id: 'user-new' }
                : null,
          ),
      );
      mockPrisma.user.findFirst.mockResolvedValue(null);
      mockPrisma.staffInfo.findUnique.mockResolvedValue(null);
      authService.createPendingUserWithVerificationEmail.mockResolvedValue({
        message: 'Tạo nhân sự thành công. Email xác thực đã được gửi.',
      });
      staffService.createStaff.mockResolvedValue({ id: 'UNISTAFF-new' });
    });

    it('tạo tài khoản mới rồi tạo hồ sơ nhân sự gắn vào tài khoản đó', async () => {
      await expect(
        service.createStaffUser(payload, headActor),
      ).resolves.toEqual({
        message: 'Tạo nhân sự thành công. Email xác thực đã được gửi.',
        staffId: 'UNISTAFF-new',
      });

      expect(
        authService.createPendingUserWithVerificationEmail,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'new.staff@example.com',
          password: 'secret1',
          accountHandle: 'newstaff',
          first_name: 'B',
          last_name: 'Nguyễn Văn',
        }),
        expect.objectContaining({ auditActor: headActor }),
      );
      expect(staffService.createStaff).toHaveBeenCalledWith(
        {
          full_name: 'Nguyễn Văn B',
          cccd_number: '012345678999',
          gender: 'male',
          roles: [StaffRole.teacher, StaffRole.customer_care],
          user_id: 'user-new',
        },
        headActor,
      );
    });

    it('role trưởng không gán được role trưởng — chặn trước khi tạo tài khoản', async () => {
      await expect(
        service.createStaffUser(
          { ...payload, roles: [StaffRole.sale_customer_care_head] },
          headActor,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(
        authService.createPendingUserWithVerificationEmail,
      ).not.toHaveBeenCalled();
    });

    it('email đã có tài khoản (kể cả chưa xác thực) thì không tạo / ghi đè', async () => {
      mockPrisma.user.findFirst.mockImplementation(
        ({ where }: { where: { email?: unknown } }) =>
          Promise.resolve(where.email ? { id: 'user-old' } : null),
      );
      await expect(service.createStaffUser(payload, headActor)).rejects.toThrow(
        'Email này đã có tài khoản.',
      );
      expect(
        authService.createPendingUserWithVerificationEmail,
      ).not.toHaveBeenCalled();
    });

    it('CCCD đã tồn tại thì không tạo tài khoản', async () => {
      mockPrisma.staffInfo.findUnique.mockResolvedValue({ id: 'staff-x' });
      await expect(service.createStaffUser(payload, headActor)).rejects.toThrow(
        'Số CCCD đã tồn tại trong hệ thống.',
      );
      expect(
        authService.createPendingUserWithVerificationEmail,
      ).not.toHaveBeenCalled();
    });

    it('tạo hồ sơ lỗi thì xoá tài khoản vừa tạo', async () => {
      const failure = new BadRequestException(
        'Số CCCD đã tồn tại trong hệ thống.',
      );
      staffService.createStaff.mockRejectedValue(failure);
      mockPrisma.user.delete.mockResolvedValue({ id: 'user-new' });

      await expect(service.createStaffUser(payload, headActor)).rejects.toBe(
        failure,
      );
      expect(mockPrisma.user.delete).toHaveBeenCalledWith({
        where: { id: 'user-new' },
      });
    });
  });

  describe('setAccountHandle (16/11)', () => {
    const SALE_HEAD = {
      userId: 'head-user',
      userEmail: 'head@example.com',
      roleType: UserRole.staff,
    };

    /** findUnique trả theo `select`: target, actor (staffInfo), handle hiện tại. */
    const mockUsers = (targetRoleType: UserRole, actorRoles: StaffRole[]) => {
      mockPrisma.user.findUnique.mockImplementation(
        ({ where, select }: { where: { id: string }; select: object }) => {
          if ('staffInfo' in select) {
            return Promise.resolve({
              roleType: UserRole.staff,
              staffInfo: { id: 'head-staff', roles: actorRoles },
            });
          }
          if ('accountHandle' in select) {
            return Promise.resolve({ accountHandle: 'old_handle' });
          }
          return Promise.resolve({ id: where.id, roleType: targetRoleType });
        },
      );
      mockPrisma.user.findFirst.mockResolvedValue(null);
      mockPrisma.user.update.mockResolvedValue({ id: 'student-user' });
    };

    it('Trưởng phòng Sale & CSKH đổi handle học sinh: ghi DB, audit, xoá cache auth', async () => {
      mockUsers(UserRole.student, [StaffRole.sale_customer_care_head]);

      await expect(
        service.setAccountHandle('student-user', ' hs_moi ', SALE_HEAD),
      ).resolves.toEqual({ id: 'student-user', accountHandle: 'hs_moi' });

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'student-user' },
        data: { accountHandle: 'hs_moi' },
        select: { id: true },
      });
      expect(actionHistoryService.recordUpdate).toHaveBeenCalledWith(
        mockPrisma,
        expect.objectContaining({
          entityType: 'user',
          entityId: 'student-user',
          beforeValue: { accountHandle: 'old_handle' },
          afterValue: { accountHandle: 'hs_moi' },
        }),
      );
      expect(authService.invalidateAuthIdentityCache).toHaveBeenCalledWith(
        'student-user',
      );
    });

    it('Trưởng phòng Sale & CSKH không đổi được handle tài khoản nhân sự', async () => {
      mockUsers(UserRole.staff, [StaffRole.sale_customer_care_head]);

      await expect(
        service.setAccountHandle('staff-user', 'nv_moi', SALE_HEAD),
      ).rejects.toThrow(ForbiddenException);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('Admin đổi được handle mọi loại tài khoản', async () => {
      mockUsers(UserRole.staff, [StaffRole.admin]);

      await expect(
        service.setAccountHandle('staff-user', 'nv_moi', SALE_HEAD),
      ).resolves.toEqual({ id: 'staff-user', accountHandle: 'nv_moi' });
    });

    it('handle không đổi → không audit, không xoá cache', async () => {
      mockUsers(UserRole.student, [StaffRole.sale_customer_care_head]);

      await service.setAccountHandle('student-user', 'old_handle', SALE_HEAD);

      expect(mockPrisma.user.update).not.toHaveBeenCalled();
      expect(actionHistoryService.recordUpdate).not.toHaveBeenCalled();
      expect(authService.invalidateAuthIdentityCache).not.toHaveBeenCalled();
    });
  });
});
