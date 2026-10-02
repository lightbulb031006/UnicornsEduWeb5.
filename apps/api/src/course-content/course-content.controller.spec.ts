import { ValidationPipe } from '@nestjs/common';
import { StaffRole, UserRole } from 'generated/enums';
import { DECORATORS } from '@nestjs/swagger/dist/constants';
import { ModuleCreateDto } from 'src/dtos/course-content.dto';
import { ALLOW_STAFF_ROLES_ON_ADMIN_KEY } from 'src/auth/decorators/allow-staff-roles-on-admin.decorator';
import { ROLES_KEY } from 'src/auth/decorators/roles.decorator';
import {
  CourseModuleController,
  LessonQuizController,
  PracticeLessonQuestionController,
} from './course-content.controller';
import { CourseModuleService } from './course-module.service';
import { LessonQuizService } from './lesson-quiz.service';
import { PracticeQuestionLinkService } from './practice-question-link.service';

function getHandler(
  ctor: { name: string; prototype: object },
  methodName: string,
): (...args: never[]) => unknown {
  const descriptor = Object.getOwnPropertyDescriptor(
    ctor.prototype,
    methodName,
  );
  const methodTarget: unknown = descriptor?.value;
  if (typeof methodTarget !== 'function') {
    throw new Error(`${ctor.name}.${methodName} not found`);
  }
  return methodTarget as (...args: never[]) => unknown;
}

const staffUser = {
  id: 'user-1',
  email: 'staff@test.com',
  accountHandle: 'staff1',
  roleType: UserRole.staff,
};

describe('LessonQuizController.getLessonQuizzes', () => {
  it('restricts GET /lessons/:lessonId/quizzes to admin (not student)', () => {
    const roles: unknown = Reflect.getMetadata(
      ROLES_KEY,
      getHandler(LessonQuizController, 'getLessonQuizzes'),
    );
    expect(roles).toEqual([UserRole.admin]);
    expect(roles).not.toContain(UserRole.student);
  });

  it('keeps staff authoring roles on the admin lesson-quiz list route', () => {
    const staffRoles: unknown = Reflect.getMetadata(
      ALLOW_STAFF_ROLES_ON_ADMIN_KEY,
      getHandler(LessonQuizController, 'getLessonQuizzes'),
    );
    expect(staffRoles).toEqual([
      StaffRole.assistant,
      StaffRole.teacher,
      StaffRole.lesson_plan,
      StaffRole.lesson_plan_head,
    ]);
  });

  it('documents HTTP 403 when the caller cannot manage the course', () => {
    const responses = Reflect.getMetadata(
      DECORATORS.API_RESPONSE,
      getHandler(LessonQuizController, 'getLessonQuizzes'),
    ) as Record<string, { description?: string }>;
    expect(responses['403']?.description).toMatch(/đội giáo án/);
  });

  it('returns the admin quiz payload and never the student (no-correctIndex) variant', async () => {
    const quizService = {
      getLessonQuizzes: jest
        .fn()
        .mockResolvedValue([{ id: 'q1', correctIndex: 2 }]),
      getLessonQuizzesForStudent: jest.fn(),
    };
    const controller = new LessonQuizController(
      quizService as unknown as LessonQuizService,
    );

    await expect(
      controller.getLessonQuizzes(staffUser, 'lesson-1'),
    ).resolves.toEqual([{ id: 'q1', correctIndex: 2 }]);

    expect(quizService.getLessonQuizzes).toHaveBeenCalledWith('lesson-1', {
      userId: staffUser.id,
      userEmail: staffUser.email,
      roleType: staffUser.roleType,
    });
    expect(quizService.getLessonQuizzesForStudent).not.toHaveBeenCalled();
  });
});

describe('PracticeLessonQuestionController.getQuestions', () => {
  it('documents HTTP 403 for callers outside the course lesson-plan team', () => {
    const responses = Reflect.getMetadata(
      DECORATORS.API_RESPONSE,
      getHandler(PracticeLessonQuestionController, 'getQuestions'),
    ) as Record<string, { description?: string }>;
    expect(responses['403']?.description).toMatch(/đội giáo án/);
  });

  it('forwards the current user so the service can assertCanManageCourse', async () => {
    const questionService = {
      getQuestionsByLessonId: jest.fn().mockResolvedValue([]),
    };
    const controller = new PracticeLessonQuestionController(
      questionService as unknown as PracticeQuestionLinkService,
    );

    await controller.getQuestions(staffUser, 'lesson-1');

    expect(questionService.getQuestionsByLessonId).toHaveBeenCalledWith(
      'lesson-1',
      {
        userId: staffUser.id,
        userEmail: staffUser.email,
        roleType: staffUser.roleType,
      },
    );
  });
});

describe('CourseModuleController course-manage 403', () => {
  it.each([
    'createModule',
    'updateModule',
    'deleteModule',
    'reorderModules',
  ] as const)('documents HTTP 403 on %s', (methodName) => {
    const responses = Reflect.getMetadata(
      DECORATORS.API_RESPONSE,
      getHandler(CourseModuleController, methodName),
    ) as Record<string, { description?: string }>;
    expect(responses['403']?.description).toMatch(/đội giáo án/);
  });

  it('passes the actor into reorderModules', async () => {
    const moduleService = {
      reorderModules: jest.fn().mockResolvedValue(undefined),
    };
    const controller = new CourseModuleController(
      moduleService as unknown as CourseModuleService,
    );

    await controller.reorderModules(staffUser, 'course-x', ['mod-1']);

    expect(moduleService.reorderModules).toHaveBeenCalledWith(
      'course-x',
      ['mod-1'],
      {
        userId: staffUser.id,
        userEmail: staffUser.email,
        roleType: staffUser.roleType,
      },
    );
  });

  it('accepts a title-only body and takes courseId from the path', async () => {
    const pipe = new ValidationPipe({ transform: true, whitelist: true });
    const dto = (await pipe.transform(
      { title: 'Đại số' },
      { type: 'body', metatype: ModuleCreateDto },
    )) as ModuleCreateDto;

    const moduleService = {
      createModule: jest.fn().mockResolvedValue({ id: 'mod-1' }),
    };
    const controller = new CourseModuleController(
      moduleService as unknown as CourseModuleService,
    );

    await controller.createModule(staffUser, 'course-x', dto);

    expect(moduleService.createModule).toHaveBeenCalledWith(
      { title: 'Đại số', courseId: 'course-x' },
      {
        userId: staffUser.id,
        userEmail: staffUser.email,
        roleType: staffUser.roleType,
      },
    );
  });
});
