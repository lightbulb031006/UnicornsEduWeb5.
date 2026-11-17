jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid'),
}));

import { ForbiddenException } from '@nestjs/common';
import { UserRole } from 'generated/enums';
import type { JwtPayload } from '../auth/decorators/current-user.decorator';
import { StaffOpsClassController } from './staff-ops-class.controller';

describe('StaffOpsClassController makeup management', () => {
  const user = (overrides: Partial<JwtPayload>): JwtPayload => ({
    id: 'user-1',
    email: 'user@example.com',
    accountHandle: 'user',
    roleType: UserRole.staff,
    ...overrides,
  });

  const workAccess = (
    overrides: Partial<{
      staffId: string | null;
      isAdmin: boolean;
      isClassTeacher: boolean;
      isClassManager: boolean;
    }>,
  ) => ({
    staffId: 'teacher-1',
    isAdmin: false,
    isClassTeacher: false,
    isClassManager: false,
    ...overrides,
  });

  const classService = {};
  const classSurveyService = {};
  const calendarService = {
    createMakeupScheduleEventForClass: jest.fn(),
    updateMakeupScheduleEventForClass: jest.fn(),
    deleteMakeupScheduleEventForClass: jest.fn(),
    assertTeacherCanManageMakeupScheduleEventForClass: jest.fn(),
    resyncClassScheduleWithGoogleCalendar: jest.fn(),
    resyncClassScheduleWithGoogleCalendarForTeacher: jest.fn(),
    resyncMakeupScheduleEventWithGoogleCalendarForClass: jest.fn(),
  };
  const staffOperationsAccess = {
    resolveClassWorkAccess: jest.fn(),
  };

  let controller: StaffOpsClassController;

  beforeEach(() => {
    jest.clearAllMocks();
    calendarService.createMakeupScheduleEventForClass.mockResolvedValue({
      success: true,
      data: {},
    });
    calendarService.updateMakeupScheduleEventForClass.mockResolvedValue({
      success: true,
      data: {},
    });
    calendarService.deleteMakeupScheduleEventForClass.mockResolvedValue({
      success: true,
    });
    calendarService.assertTeacherCanManageMakeupScheduleEventForClass.mockResolvedValue(
      undefined,
    );
    staffOperationsAccess.resolveClassWorkAccess.mockResolvedValue(
      workAccess({ isClassTeacher: true }),
    );

    controller = new StaffOpsClassController(
      classService as never,
      classSurveyService as never,
      calendarService as never,
      staffOperationsAccess as never,
    );
  });

  it('allows admin to update a makeup event without teacher scoping', async () => {
    staffOperationsAccess.resolveClassWorkAccess.mockResolvedValueOnce(
      workAccess({ staffId: null, isAdmin: true }),
    );

    await controller.updateMakeupEventByClassId(
      user({
        id: 'admin-user',
        email: 'admin@example.com',
        accountHandle: 'admin',
        roleType: UserRole.admin,
      }),
      'class-1',
      'makeup-1',
      { note: 'new note' },
    );

    expect(
      calendarService.assertTeacherCanManageMakeupScheduleEventForClass,
    ).not.toHaveBeenCalled();
    expect(
      calendarService.updateMakeupScheduleEventForClass,
    ).toHaveBeenCalledWith(
      'class-1',
      'makeup-1',
      { note: 'new note' },
      expect.objectContaining({ userId: 'admin-user' }),
    );
  });

  // #267: Trợ lí không còn quản lý buổi bù; #275: không phải gia sư / Quản lý lớp → 403.
  it('rejects staff without class work access (assistant, accountant, unassigned training)', async () => {
    staffOperationsAccess.resolveClassWorkAccess.mockRejectedValueOnce(
      new ForbiddenException('no'),
    );

    await expect(
      controller.updateMakeupEventByClassId(
        user({ id: 'assistant-user' }),
        'class-1',
        'makeup-1',
        { note: 'assistant edit' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(
      calendarService.updateMakeupScheduleEventForClass,
    ).not.toHaveBeenCalled();
  });

  it('#275: Quản lý lớp sửa buổi bù của gia sư khác, không bị gắn teacherId của mình', async () => {
    staffOperationsAccess.resolveClassWorkAccess.mockResolvedValueOnce(
      workAccess({ staffId: 'manager-1', isClassManager: true }),
    );

    await controller.updateMakeupEventByClassId(
      user({ id: 'manager-user' }),
      'class-1',
      'makeup-1',
      { note: 'manager edit', teacherId: 'teacher-2' },
    );

    expect(
      calendarService.assertTeacherCanManageMakeupScheduleEventForClass,
    ).not.toHaveBeenCalled();
    expect(
      calendarService.updateMakeupScheduleEventForClass,
    ).toHaveBeenCalledWith(
      'class-1',
      'makeup-1',
      { note: 'manager edit', teacherId: 'teacher-2' },
      expect.objectContaining({ userId: 'manager-user' }),
    );
  });

  it('#275: kiêm gia sư + Quản lý lớp xoá được buổi bù của gia sư khác (hợp quyền)', async () => {
    staffOperationsAccess.resolveClassWorkAccess.mockResolvedValueOnce(
      workAccess({ isClassTeacher: true, isClassManager: true }),
    );

    await controller.deleteMakeupEventByClassId(
      user({ id: 'teacher-user' }),
      'class-1',
      'makeup-2',
    );

    expect(
      calendarService.assertTeacherCanManageMakeupScheduleEventForClass,
    ).not.toHaveBeenCalled();
    expect(
      calendarService.deleteMakeupScheduleEventForClass,
    ).toHaveBeenCalled();
  });

  it('allows teacher owner to update only under their own teacher id', async () => {
    await controller.updateMakeupEventByClassId(
      user({
        id: 'teacher-user',
        email: 'teacher@example.com',
        accountHandle: 'teacher',
      }),
      'class-1',
      'makeup-1',
      { note: '' },
    );

    expect(
      calendarService.assertTeacherCanManageMakeupScheduleEventForClass,
    ).toHaveBeenCalledWith('class-1', 'makeup-1', 'teacher-1');
    expect(
      calendarService.updateMakeupScheduleEventForClass,
    ).toHaveBeenCalledWith(
      'class-1',
      'makeup-1',
      { note: '', teacherId: 'teacher-1' },
      expect.objectContaining({ userId: 'teacher-user' }),
    );
  });

  it('rejects pure teacher reassigning a makeup event to another teacher', async () => {
    await expect(
      controller.updateMakeupEventByClassId(
        user({ id: 'teacher-user' }),
        'class-1',
        'makeup-1',
        { teacherId: 'teacher-2' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(
      calendarService.updateMakeupScheduleEventForClass,
    ).not.toHaveBeenCalled();
  });

  it('allows teacher owner to delete through the same ownership guard', async () => {
    await controller.deleteMakeupEventByClassId(
      user({
        id: 'teacher-user',
        email: 'teacher@example.com',
        accountHandle: 'teacher',
      }),
      'class-1',
      'makeup-1',
    );

    expect(
      calendarService.assertTeacherCanManageMakeupScheduleEventForClass,
    ).toHaveBeenCalledWith('class-1', 'makeup-1', 'teacher-1');
    expect(
      calendarService.deleteMakeupScheduleEventForClass,
    ).toHaveBeenCalledWith(
      'class-1',
      'makeup-1',
      expect.objectContaining({ userId: 'teacher-user' }),
    );
  });

  it('#275: Quản lý lớp tạo buổi bù cho gia sư khác của lớp', async () => {
    staffOperationsAccess.resolveClassWorkAccess.mockResolvedValueOnce(
      workAccess({ staffId: 'manager-1', isClassManager: true }),
    );
    const dto = { teacherId: 'teacher-2' } as never;

    await controller.createMakeupEventByClassId(
      user({ id: 'manager-user' }),
      'class-1',
      dto,
    );

    expect(
      calendarService.createMakeupScheduleEventForClass,
    ).toHaveBeenCalledWith(
      'class-1',
      dto,
      expect.objectContaining({ userId: 'manager-user' }),
    );
  });

  it('rejects pure teacher creating a makeup event for another teacher', async () => {
    await expect(
      controller.createMakeupEventByClassId(
        user({ id: 'teacher-user' }),
        'class-1',
        { teacherId: 'teacher-2' } as never,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(
      calendarService.createMakeupScheduleEventForClass,
    ).not.toHaveBeenCalled();
  });
  describe('#276 resync Google Calendar (link Meet)', () => {
    it('lets Quản lý lớp resync the whole class schedule', async () => {
      staffOperationsAccess.resolveClassWorkAccess.mockResolvedValueOnce(
        workAccess({ staffId: 'manager-1', isClassManager: true }),
      );

      await controller.resyncClassScheduleGoogleCalendar(
        user({ id: 'manager-user' }),
        'class-1',
      );

      expect(
        calendarService.resyncClassScheduleWithGoogleCalendar,
      ).toHaveBeenCalledWith('class-1');
      expect(
        calendarService.resyncClassScheduleWithGoogleCalendarForTeacher,
      ).not.toHaveBeenCalled();
    });

    it('keeps pure teacher on own schedule slots only', async () => {
      await controller.resyncClassScheduleGoogleCalendar(
        user({ id: 'teacher-user' }),
        'class-1',
      );

      expect(
        calendarService.resyncClassScheduleWithGoogleCalendarForTeacher,
      ).toHaveBeenCalledWith('class-1', 'teacher-1');
      expect(
        calendarService.resyncClassScheduleWithGoogleCalendar,
      ).not.toHaveBeenCalled();
    });

    it('rejects staff unrelated to the class', async () => {
      staffOperationsAccess.resolveClassWorkAccess.mockRejectedValueOnce(
        new ForbiddenException(),
      );

      await expect(
        controller.resyncClassScheduleGoogleCalendar(
          user({ id: 'other-user' }),
          'class-1',
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(
        calendarService.resyncClassScheduleWithGoogleCalendar,
      ).not.toHaveBeenCalled();
    });

    it('lets Quản lý lớp resync makeup events of any teacher', async () => {
      staffOperationsAccess.resolveClassWorkAccess.mockResolvedValueOnce(
        workAccess({ staffId: 'manager-1', isClassManager: true }),
      );

      await controller.resyncClassMakeupGoogleCalendar(
        user({ id: 'manager-user' }),
        'class-1',
        'event-1',
      );

      const options =
        calendarService.resyncMakeupScheduleEventWithGoogleCalendarForClass.mock
          .calls[0][2];
      expect(options.teacherId).toBeUndefined();
    });

    it('scopes pure teacher makeup resync to own events', async () => {
      await controller.resyncClassMakeupGoogleCalendar(
        user({ id: 'teacher-user' }),
        'class-1',
        'event-1',
      );

      const options =
        calendarService.resyncMakeupScheduleEventWithGoogleCalendarForClass.mock
          .calls[0][2];
      expect(options.teacherId).toBe('teacher-1');
    });
  });
});
