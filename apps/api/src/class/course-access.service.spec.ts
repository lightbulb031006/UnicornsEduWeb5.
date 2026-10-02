import { ForbiddenException } from '@nestjs/common';
import { CourseAccessService } from './course-access.service';

describe('CourseAccessService', () => {
  const prisma = {
    staffInfo: {
      findUnique: jest.fn(),
    },
    courseLessonPlanMember: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    course: {
      findUnique: jest.fn(),
    },
    classTeacher: {
      findFirst: jest.fn(),
    },
  };

  let service: CourseAccessService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new CourseAccessService(prisma as never);
  });

  describe('resolveActor', () => {
    it('resolves roles and staff id from the linked staff profile', async () => {
      prisma.staffInfo.findUnique.mockResolvedValue({
        id: 'UNISTAFF-abc',
        roles: ['lesson_plan'],
      });

      await expect(
        service.resolveActor('user-1', 'staff' as never),
      ).resolves.toEqual({
        userId: 'user-1',
        staffId: 'UNISTAFF-abc',
        roles: ['lesson_plan'],
        isAdminUser: false,
      });
    });

    it('marks admin roleType users as admin even without a staff profile', async () => {
      prisma.staffInfo.findUnique.mockResolvedValue(null);

      await expect(
        service.resolveActor('user-admin', 'admin' as never),
      ).resolves.toEqual({
        userId: 'user-admin',
        staffId: null,
        roles: [],
        isAdminUser: true,
      });
    });
  });

  describe('isManager', () => {
    it.each(['admin', 'assistant', 'lesson_plan_head'])(
      'returns true for %s',
      (role) => {
        const actor = { roles: [role], isAdminUser: false } as never;
        expect(service.isManager(actor)).toBe(true);
      },
    );

    it('returns true for admin users', () => {
      const actor = { roles: [], isAdminUser: true } as never;
      expect(service.isManager(actor)).toBe(true);
    });

    it('returns false for lesson_plan member and teacher', () => {
      const member = { roles: ['lesson_plan'], isAdminUser: false } as never;
      const teacher = { roles: ['teacher'], isAdminUser: false } as never;
      expect(service.isManager(member)).toBe(false);
      expect(service.isManager(teacher)).toBe(false);
    });
  });

  describe('resolveListableCourseIds', () => {
    it.each(['admin', 'assistant', 'lesson_plan_head'])(
      'returns null (all) for manager role %s',
      async (role) => {
        const actor = { roles: [role], isAdminUser: false } as never;
        await expect(
          service.resolveListableCourseIds(actor),
        ).resolves.toBeNull();
        expect(prisma.courseLessonPlanMember.findMany).not.toHaveBeenCalled();
      },
    );

    it.each([
      'training',
      'accountant_income',
      'accountant_expense',
      'teacher',
      'customer_care',
    ])('returns null (all) for non-lesson-plan role %s', async (role) => {
      const actor = {
        staffId: 'UNISTAFF-other',
        roles: [role],
        isAdminUser: false,
      } as never;
      await expect(service.resolveListableCourseIds(actor)).resolves.toBeNull();
      expect(prisma.courseLessonPlanMember.findMany).not.toHaveBeenCalled();
    });

    it('returns null (all) for an admin user without a staff profile', async () => {
      const actor = {
        staffId: null,
        roles: [],
        isAdminUser: true,
      } as never;
      await expect(service.resolveListableCourseIds(actor)).resolves.toBeNull();
    });

    it('returns null (all) for staff without a profile and without lesson_plan', async () => {
      const actor = {
        staffId: null,
        roles: [],
        isAdminUser: false,
      } as never;
      await expect(service.resolveListableCourseIds(actor)).resolves.toBeNull();
    });

    it('returns null when lesson_plan is combined with a manager role', async () => {
      const actor = {
        staffId: 'UNISTAFF-head',
        roles: ['lesson_plan', 'lesson_plan_head'],
        isAdminUser: false,
      } as never;
      await expect(service.resolveListableCourseIds(actor)).resolves.toBeNull();
      expect(prisma.courseLessonPlanMember.findMany).not.toHaveBeenCalled();
    });

    it('still filters when lesson_plan is combined with a non-manager role', async () => {
      prisma.courseLessonPlanMember.findMany.mockResolvedValue([
        { courseId: 'course-a' },
      ]);
      const actor = {
        staffId: 'UNISTAFF-abc',
        roles: ['lesson_plan', 'teacher'],
        isAdminUser: false,
      } as never;
      await expect(service.resolveListableCourseIds(actor)).resolves.toEqual([
        'course-a',
      ]);
    });

    it('returns only assigned course ids for a pure lesson_plan member', async () => {
      prisma.courseLessonPlanMember.findMany.mockResolvedValue([
        { courseId: 'course-a' },
        { courseId: 'course-b' },
      ]);
      const actor = {
        staffId: 'UNISTAFF-abc',
        roles: ['lesson_plan'],
        isAdminUser: false,
      } as never;

      await expect(service.resolveListableCourseIds(actor)).resolves.toEqual([
        'course-a',
        'course-b',
      ]);
      expect(prisma.courseLessonPlanMember.findMany).toHaveBeenCalledWith({
        where: { staffId: 'UNISTAFF-abc' },
        select: { courseId: true },
      });
    });

    it('returns an empty list for pure lesson_plan without a staff id', async () => {
      const actor = {
        staffId: null,
        roles: ['lesson_plan'],
        isAdminUser: false,
      } as never;
      await expect(service.resolveListableCourseIds(actor)).resolves.toEqual(
        [],
      );
      expect(prisma.courseLessonPlanMember.findMany).not.toHaveBeenCalled();
    });
  });

  describe('resolveViewableCourseIds', () => {
    it('returns null (all) for managers', async () => {
      prisma.staffInfo.findUnique.mockResolvedValue(null);
      const actor = { roles: ['assistant'], isAdminUser: false } as never;
      await expect(service.resolveViewableCourseIds(actor)).resolves.toBeNull();
    });

    it('returns only assigned course ids for a lesson_plan member', async () => {
      prisma.courseLessonPlanMember.findMany.mockResolvedValue([
        { courseId: 'course-a' },
        { courseId: 'course-b' },
      ]);
      const actor = {
        staffId: 'UNISTAFF-abc',
        roles: ['lesson_plan'],
        isAdminUser: false,
      } as never;

      await expect(service.resolveViewableCourseIds(actor)).resolves.toEqual([
        'course-a',
        'course-b',
      ]);
      expect(prisma.courseLessonPlanMember.findMany).toHaveBeenCalledWith({
        where: { staffId: 'UNISTAFF-abc' },
        select: { courseId: true },
      });
    });

    it('returns an empty list for a teacher (no course membership role)', async () => {
      const actor = {
        staffId: 'UNISTAFF-teacher',
        roles: ['teacher'],
        isAdminUser: false,
      } as never;
      await expect(service.resolveViewableCourseIds(actor)).resolves.toEqual(
        [],
      );
      expect(prisma.courseLessonPlanMember.findMany).not.toHaveBeenCalled();
    });
  });

  describe('canViewCourse / canManageCourse', () => {
    it('grants managers access to any course', async () => {
      const actor = {
        roles: ['lesson_plan_head'],
        isAdminUser: false,
      } as never;
      await expect(service.canViewCourse(actor, 'course-x')).resolves.toBe(
        true,
      );
      expect(prisma.courseLessonPlanMember.findUnique).not.toHaveBeenCalled();
    });

    it('grants an assigned lesson_plan member access', async () => {
      prisma.courseLessonPlanMember.findUnique.mockResolvedValue({ id: 'm1' });
      const actor = {
        staffId: 'UNISTAFF-abc',
        roles: ['lesson_plan'],
        isAdminUser: false,
      } as never;
      await expect(service.canViewCourse(actor, 'course-x')).resolves.toBe(
        true,
      );
    });

    it('denies a lesson_plan member not assigned to the course', async () => {
      prisma.courseLessonPlanMember.findUnique.mockResolvedValue(null);
      const actor = {
        staffId: 'UNISTAFF-abc',
        roles: ['lesson_plan'],
        isAdminUser: false,
      } as never;
      await expect(service.canViewCourse(actor, 'course-x')).resolves.toBe(
        false,
      );
    });

    it('denies a teacher even when they teach a class of the course', async () => {
      const actor = {
        staffId: 'UNISTAFF-teacher',
        roles: ['teacher'],
        isAdminUser: false,
      } as never;
      await expect(service.canViewCourse(actor, 'course-x')).resolves.toBe(
        false,
      );
    });
  });

  describe('assertCanManageCourse', () => {
    it('throws ForbiddenException when the actor is not allowed', async () => {
      const actor = {
        staffId: 'UNISTAFF-teacher',
        roles: ['teacher'],
        isAdminUser: false,
      } as never;
      await expect(
        service.assertCanManageCourse(actor, 'course-x'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('assertCourseExists', () => {
    it('throws NotFound when the course is missing', async () => {
      prisma.course.findUnique.mockResolvedValue(null);
      await expect(service.assertCourseExists('nope')).rejects.toThrow(
        'Không tìm thấy khoá học.',
      );
    });
  });

  describe('assertCanWriteCourseQuestions', () => {
    it('allows a teacher who currently teaches a class of that course', async () => {
      prisma.courseLessonPlanMember.findUnique.mockResolvedValue(null);
      prisma.classTeacher.findFirst.mockResolvedValue({ id: 'ct-1' });
      const actor = {
        userId: 'u-teacher',
        staffId: 'UNISTAFF-teacher',
        roles: ['teacher'],
        isAdminUser: false,
      } as never;
      await expect(
        service.assertCanWriteCourseQuestions(actor, 'course-x'),
      ).resolves.toBeUndefined();
    });

    it('rejects a teacher who does not teach any class of that course', async () => {
      prisma.courseLessonPlanMember.findUnique.mockResolvedValue(null);
      prisma.classTeacher.findFirst.mockResolvedValue(null);
      const actor = {
        userId: 'u-teacher',
        staffId: 'UNISTAFF-teacher',
        roles: ['teacher'],
        isAdminUser: false,
      } as never;
      await expect(
        service.assertCanWriteCourseQuestions(actor, 'course-x'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
