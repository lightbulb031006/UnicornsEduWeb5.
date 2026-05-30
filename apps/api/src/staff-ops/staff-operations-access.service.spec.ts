import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class PrismaServiceMock {},
}));

import { StaffRole, UserRole } from '../../generated/enums';
import { StaffOperationsAccessService } from './staff-operations-access.service';

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
        'Màn /staff hiện chỉ mở cho teacher, trợ lí, kế toán, hoặc staff admin.',
      ),
    );
  });

  it('resolves linked staff actors even when primary role is student', async () => {
    mockPrisma.staffInfo.findFirst.mockResolvedValue({
      id: 'staff-student-1',
      roles: [StaffRole.accountant],
    });

    await expect(
      service.resolveActor('student-accountant-user', UserRole.student),
    ).resolves.toEqual({
      id: 'staff-student-1',
      roles: [StaffRole.accountant],
    });
  });

  it('allows elevated non-teacher staff roles for staff operations', async () => {
    mockPrisma.staffInfo.findFirst.mockResolvedValue({
      id: 'assistant-1',
      roles: [StaffRole.assistant],
    });

    await expect(
      service.resolveActor('assistant-user', UserRole.staff),
    ).resolves.toEqual({
      id: 'assistant-1',
      roles: [StaffRole.assistant],
    });
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

  it('allows training staff for calendar only', async () => {
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
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects non-teacher non-training staff from calendar access', async () => {
    mockPrisma.staffInfo.findFirst.mockResolvedValue({
      id: 'assistant-1',
      roles: [StaffRole.assistant],
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
});
