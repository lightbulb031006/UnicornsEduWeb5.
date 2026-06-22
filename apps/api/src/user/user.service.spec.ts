jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class PrismaServiceMock {},
}));
jest.mock('src/staff/staff.service', () => ({
  StaffService: class StaffServiceMock {},
}));

import { BadRequestException } from '@nestjs/common';
import { UserRole } from '../../generated/enums';
import { UserService } from './user.service';

describe('UserService', () => {
  const mockPrisma = {
    user: {
      create: jest.fn(),
      count: jest.fn(),
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
    mockPrisma.staffInfo.update.mockResolvedValue({ id: 'staff-1', userId: null });
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
    expect(authService.invalidateAuthIdentityCache).toHaveBeenCalledWith('user-1');
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
});
