import { NotFoundException } from '@nestjs/common';
import { UserRole } from 'generated/enums';
import { UserProfileController } from './user-profile.controller';

describe('UserProfileController', () => {
  const userService = {
    getLinkedStudentId: jest.fn(),
    getLinkedStaffId: jest.fn(),
  };
  const bonusService = {
    getBonusOwnershipById: jest.fn(),
    deleteBonus: jest.fn(),
  };
  const studentService = {
    createStudentSePayTopUpOrder: jest.fn(),
    getStudentSePayStaticQr: jest.fn(),
  };
  const contentService = {
    getLessonQuizzesForStudent: jest.fn(),
    submitQuizAnswers: jest.fn(),
    getQuizAnswers: jest.fn(),
    getAssignedLessonForStudent: jest.fn(),
  };

  let controller: UserProfileController;

  beforeEach(() => {
    jest.resetAllMocks();
    controller = new UserProfileController(
      userService as never,
      {} as never,
      bonusService as never,
      {} as never,
      {} as never,
      {} as never,
      studentService as never,
      {} as never,
      {} as never,
      contentService as never,
    );
  });

  it('delegates current-student SePay top-up order creation to StudentService with actor metadata', async () => {
    userService.getLinkedStudentId.mockResolvedValue('student-1');
    studentService.createStudentSePayTopUpOrder.mockResolvedValue({
      id: 'order-row-1',
      amount: 500000,
      amountRequested: 500000,
      amountReceived: null,
      status: 'pending',
      transferNote: 'NAPVI ABC123',
      parentEmail: 'parent@example.com',
      orderCode: 'ABC123',
      qrCode: 'data:image/png;base64,abc',
      qrCodeUrl: null,
      orderId: null,
      vaNumber: null,
      vaHolderName: null,
      bankName: 'MBBank',
      accountNumber: '1234567890',
      accountHolderName: 'UNICORNS EDU',
      expiredAt: null,
      createdAt: '2026-05-11T09:15:00.000Z',
      updatedAt: '2026-05-11T09:15:00.000Z',
    });

    await expect(
      controller.createMyStudentSePayTopUpOrder(
        {
          id: 'user-1',
          email: 'student@example.com',
          accountHandle: 'student',
          roleType: UserRole.student,
        },
        { amount: 500000 },
      ),
    ).resolves.toMatchObject({
      id: 'order-row-1',
      amount: 500000,
      orderCode: 'ABC123',
    });

    expect(userService.getLinkedStudentId).toHaveBeenCalledWith('user-1');
    expect(studentService.createStudentSePayTopUpOrder).toHaveBeenCalledWith(
      'student-1',
      { amount: 500000 },
      {
        userId: 'user-1',
        userEmail: 'student@example.com',
        roleType: UserRole.student,
      },
    );
  });

  it('delegates current-student static SePay QR lookup to StudentService with actor metadata', async () => {
    userService.getLinkedStudentId.mockResolvedValue('student-1');
    studentService.getStudentSePayStaticQr.mockResolvedValue({
      studentId: 'student-1',
      classIds: ['class-1'],
      transferNote: 'NAPVI student-1 class-1',
      qrCodeUrl: 'https://img.vietqr.io/image/970422-123-compact2.png',
      bankName: 'MBBank',
      accountNumber: '123',
      accountHolderName: 'UNICORNS EDU',
    });

    await expect(
      controller.getMyStudentSePayStaticQr({
        id: 'user-1',
        email: 'student@example.com',
        accountHandle: 'student',
        roleType: UserRole.student,
      }),
    ).resolves.toMatchObject({
      studentId: 'student-1',
      classIds: ['class-1'],
      transferNote: 'NAPVI student-1 class-1',
      qrCodeUrl: 'https://img.vietqr.io/image/970422-123-compact2.png',
    });

    expect(userService.getLinkedStudentId).toHaveBeenCalledWith('user-1');
    expect(studentService.getStudentSePayStaticQr).toHaveBeenCalledWith(
      'student-1',
      {
        userId: 'user-1',
        userEmail: 'student@example.com',
        roleType: UserRole.student,
      },
    );
  });

  it('deletes a bonus that belongs to the current linked staff profile', async () => {
    userService.getLinkedStaffId.mockResolvedValue('staff-1');
    bonusService.getBonusOwnershipById.mockResolvedValue({
      staffId: 'staff-1',
    });
    bonusService.deleteBonus.mockResolvedValue({ id: 'bonus-1' });

    await expect(
      controller.deleteMyStaffBonus(
        {
          id: 'user-1',
          email: 'staff@example.com',
          accountHandle: 'staff',
          roleType: UserRole.staff,
        },
        'bonus-1',
      ),
    ).resolves.toEqual({ id: 'bonus-1' });

    expect(userService.getLinkedStaffId).toHaveBeenCalledWith('user-1');
    expect(bonusService.getBonusOwnershipById).toHaveBeenCalledWith('bonus-1');
    expect(bonusService.deleteBonus).toHaveBeenCalledWith('bonus-1', {
      userId: 'user-1',
      userEmail: 'staff@example.com',
      roleType: UserRole.staff,
    });
  });

  it('does not delete another staff profile bonus from self-service', async () => {
    userService.getLinkedStaffId.mockResolvedValue('staff-1');
    bonusService.getBonusOwnershipById.mockResolvedValue({
      staffId: 'staff-2',
    });

    await expect(
      controller.deleteMyStaffBonus(
        {
          id: 'user-1',
          email: 'staff@example.com',
          accountHandle: 'staff',
          roleType: UserRole.staff,
        },
        'bonus-1',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(bonusService.deleteBonus).not.toHaveBeenCalled();
  });
});
