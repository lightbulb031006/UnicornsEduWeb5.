jest.mock('src/calendar/calendar.service', () => ({
  CalendarService: class CalendarServiceMock {},
}));

import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { StaffRole, UserRole } from 'generated/enums';
import { ROLES_KEY } from './decorators/roles.decorator';
import { RolesGuard } from './guards/roles.guard';
import { ActionHistoryController } from '../action-history/action-history.controller';
import { BonusController } from '../bonus/bonus.controller';
import { CalendarAdminController } from '../calendar/calendar-admin.controller';
import { ClassController } from '../class/class.controller';
import { CourseController } from '../class/course.controller';
import { CostController } from '../cost/cost.controller';
import { DeductionSettingsController } from '../deduction-settings/deduction-settings.controller';
import { DeviceController } from '../device/device.controller';
import { ExtraAllowanceController } from '../extra-allowance/extra-allowance.controller';
import { FixedSalarySettingsController } from '../fixed-salary-settings/fixed-salary-settings.controller';
import { NotificationController } from '../notification/notification.controller';
import { QuestionController } from '../question/question.controller';
import { RegulationController } from '../regulation/regulation.controller';
import { SessionController } from '../session/session.controller';
import { StaffController } from '../staff/staff.controller';
import { StudentController } from '../student/student.controller';
import { SurveysController } from '../class/surveys.controller';
import { UserController } from '../user/user.controller';

/**
 * #267: Trang quản trị mặc định đóng. Chạy RolesGuard thật trên metadata thật
 * của controller: Trợ lí (StaffRole.sale_customer_care_head) chỉ còn Học sinh (kể cả ví) và
 * Thông báo; mọi route admin khác chỉ Admin.
 */

type ControllerClass = { name: string; prototype: object };
type AdminTier = 'full' | 'sale_customer_care_head' | null;

const guard = new RolesGuard(
  new Reflector(),
  { getStaffRoles: jest.fn() } as never,
  { resolveForUserId: jest.fn() } as never,
);

function contextFor(
  controller: ControllerClass,
  methodName: string,
  roleType: UserRole,
  staffRoles: StaffRole[],
  adminTier: AdminTier,
): ExecutionContext {
  const handler = (controller.prototype as Record<string, unknown>)[methodName];
  if (typeof handler !== 'function') {
    throw new Error(`Route not found: ${controller.name}.${methodName}`);
  }
  const request = {
    user: {
      id: 'user-1',
      email: 'user-1@example.com',
      accountHandle: 'user-1',
      roleType,
    },
    resolvedAuthAccess: {
      effectiveRoleTypes: [roleType],
      staffRoles,
      access: { admin: { canAccess: adminTier !== null, tier: adminTier } },
    },
  };
  return {
    getHandler: () => handler,
    getClass: () => controller,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

const asAssistant = (controller: ControllerClass, methodName: string) =>
  guard.canActivate(
    contextFor(
      controller,
      methodName,
      UserRole.staff,
      [StaffRole.sale_customer_care_head],
      'sale_customer_care_head',
    ),
  );

const asAdmin = (controller: ControllerClass, methodName: string) =>
  guard.canActivate(
    contextFor(controller, methodName, UserRole.admin, [], 'full'),
  );

function routeNames(controller: ControllerClass): string[] {
  return Object.getOwnPropertyNames(controller.prototype).filter((name) => {
    if (name === 'constructor') return false;
    const handler = (controller.prototype as Record<string, unknown>)[name];
    return (
      typeof handler === 'function' &&
      Reflect.getMetadata('method', handler) !== undefined
    );
  });
}

/** Route admin-only theo @Roles (có admin, không có staff). */
function isAdminOnlyRoute(
  controller: ControllerClass,
  methodName: string,
): boolean {
  const handler = (controller.prototype as Record<string, unknown>)[
    methodName
  ] as object;
  const roles = (Reflect.getMetadata(ROLES_KEY, handler) ??
    Reflect.getMetadata(ROLES_KEY, controller)) as UserRole[] | undefined;
  return (
    !!roles && roles.includes(UserRole.admin) && !roles.includes(UserRole.staff)
  );
}

/** Route admin-only của controller, trừ các route được liệt kê. */
function adminOnlyRoutes(
  controller: ControllerClass,
  exclude: string[] = [],
): string[] {
  return routeNames(controller).filter(
    (name) => !exclude.includes(name) && isAdminOnlyRoute(controller, name),
  );
}

/**
 * Toàn bộ route admin-only mà Trợ lí còn vào được sau #267. Thêm route vào
 * đây phải đi kèm quyết định nghiệp vụ (ADR 2026-11-12-admin-deny-by-default).
 */
const ASSISTANT_ADMIN_ROUTE_ALLOWLIST = [
  // Học sinh: thêm/sửa/xoá, avatar, lịch thi, trạng thái, ghi danh lớp, ví.
  'StudentController.createStudent',
  'StudentController.createStudentSePayTopUpOrder',
  'StudentController.createStudentWalletDirectTopUpRequest',
  'StudentController.deleteStudent',
  'StudentController.deleteStudentAvatar',
  'StudentController.getStudentById',
  'StudentController.getStudentExamSchedules',
  'StudentController.getStudentSePayStaticQr',
  'StudentController.getStudentWalletHistory',
  'StudentController.getStudents',
  'StudentController.searchAssignableUsers',
  'StudentController.updateStudent',
  'StudentController.updateStudentAccountBalance',
  'StudentController.updateStudentById',
  'StudentController.updateStudentClasses',
  'StudentController.updateStudentExamSchedules',
  'StudentController.updateStudentStatus',
  'StudentController.uploadStudentAvatar',
  // Thành tích / thư viện ảnh học sinh (một phần form "Sửa học sinh").
  'StudentAchievementController.create',
  'StudentAchievementController.deleteImage',
  'StudentAchievementController.list',
  'StudentAchievementController.remove',
  'StudentAchievementController.reorder',
  'StudentAchievementController.update',
  'StudentAchievementController.uploadImage',
  'StudentGalleryController.create',
  'StudentGalleryController.deleteImage',
  'StudentGalleryController.list',
  'StudentGalleryController.remove',
  'StudentGalleryController.reorder',
  'StudentGalleryController.update',
  'StudentGalleryController.uploadImage',
  // Tạo tài khoản học sinh, đặt mật khẩu (service giới hạn đích là học sinh).
  'UserController.createStudentUser',
  'UserController.setUserPassword',
  'UserController.setUserAccountHandle',
  // Đăng xuất thiết bị học sinh.
  'DeviceController.forceLogout',
  'DeviceController.getStudentDevices',
  // Chọn lớp / CSKH khi ghi danh học sinh (chỉ đọc).
  'ClassController.getClasses',
  'StaffController.searchCustomerCareStaffOptions',
  // #272: xem mọi lớp (response bỏ lương gia sư), sửa Học phí lớp và học phí
  // riêng của học sinh.
  'ClassController.getClassById',
  'ClassController.getStudentsByClassId',
  'ClassController.listMakeupEventsByClassId',
  'ClassController.updateClassStudentTuition',
  'ClassController.updateClassTuition',
  // #273: thêm/bớt học sinh trong lớp (Admin + Trưởng phòng).
  'ClassController.updateClassStudents',
  // #274: tạo lớp (thông tin lớp + học phí + học sinh) và sửa Thông tin lớp
  // (chỉ tên, khoá học, sĩ số — service giới hạn trường).
  'ClassController.createClass',
  'ClassController.updateClassBasicInfo',
  // Gửi thông báo.
  'NotificationController.createNotificationDraft',
  'NotificationController.deleteNotification',
  'NotificationController.getAdminNotifications',
  'NotificationController.getNotificationRecipientOptions',
  'NotificationController.pushNotification',
  'NotificationController.updateNotificationDraft',
  // 15/11: xem lịch sử buổi của lớp (che lương gia sư) và xoá buổi chưa
  // thanh toán / ghi cọc.
  'SessionController.getSessionsByClassId',
  'SessionController.deleteSession',
  // 14/11: Trưởng phòng duyệt hàng chờ nạp thẳng (kể cả yêu cầu của chính mình).
  'StudentController.approveStudentWalletDirectTopUpRequestFromQueue',
  // 15/11: tạo nhân sự mới (tài khoản + hồ sơ); service chặn gán Admin / role
  // trưởng và chặn email / tên đăng nhập đã có tài khoản.
  'UserController.createStaffUser',
  'StudentController.getStudentWalletDirectTopUpRequest',
  'StudentController.listStudentWalletDirectTopUpRequests',
].sort();

function loadAllControllers(): ControllerClass[] {
  const root = path.join(__dirname, '..');
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.controller.ts')) files.push(full);
    }
  };
  walk(root);

  const controllers = new Set<ControllerClass>();
  for (const file of files.sort()) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require(file) as Record<string, unknown>;
    for (const value of Object.values(mod)) {
      if (
        typeof value === 'function' &&
        Reflect.getMetadata('path', value) !== undefined
      ) {
        controllers.add(value as unknown as ControllerClass);
      }
    }
  }
  return [...controllers];
}

/** #272: route lớp mở lại cho Trưởng phòng Sale & CSKH. */
const SALE_CS_HEAD_CLASS_ROUTES = [
  'getClasses',
  'getClassById',
  'getStudentsByClassId',
  'listMakeupEventsByClassId',
  'updateClassTuition',
  'updateClassStudentTuition',
  // #273: thêm/bớt học sinh trong lớp.
  'updateClassStudents',
  // #274: tạo lớp + sửa Thông tin lớp (trường giới hạn ở service).
  'createClass',
  'updateClassBasicInfo',
] as const;

/**
 * #274: route admin-only Trưởng ban Đào tạo vào được — xem lớp (bỏ học phí),
 * tạo lớp, sửa Thông tin lớp, tra nhân sự để chọn gia sư.
 */
const TRAINING_HEAD_ADMIN_ROUTE_ALLOWLIST = [
  'ClassController.createClass',
  'ClassController.getClassById',
  'ClassController.getClasses',
  'ClassController.getStudentsByClassId',
  'ClassController.listMakeupEventsByClassId',
  'ClassController.updateClassBasicInfo',
  'StaffController.searchStaffOptions',
  // 15/11: tạo nhân sự mới (như Trưởng phòng Sale & CSKH).
  'UserController.createStaffUser',
  // 15/11: xoá buổi chưa thanh toán / ghi cọc.
  'SessionController.deleteSession',
  // Có từ trước #274 (không đổi ở ticket này).
  'ClassTimelineController.list',
  'NotificationController.createNotificationDraft',
  'NotificationController.deleteNotification',
  'NotificationController.getAdminNotifications',
  'NotificationController.getNotificationRecipientOptions',
  'NotificationController.pushNotification',
  'NotificationController.updateNotificationDraft',
].sort();

const asStaff = (
  controller: ControllerClass,
  methodName: string,
  staffRoles: StaffRole[],
) =>
  guard.canActivate(
    contextFor(controller, methodName, UserRole.staff, staffRoles, null),
  );

describe('Admin routes deny-by-default (#267)', () => {
  describe('toàn bộ route admin-only', () => {
    const controllers = loadAllControllers();

    it('Trợ lí chỉ vào được đúng danh sách cho phép', async () => {
      const allowed: string[] = [];
      let adminOnlyRouteCount = 0;

      for (const controller of controllers) {
        for (const methodName of routeNames(controller)) {
          if (!isAdminOnlyRoute(controller, methodName)) continue;
          adminOnlyRouteCount += 1;
          const ok = await asAssistant(controller, methodName).catch(
            (error: unknown) => {
              expect(error).toBeInstanceOf(ForbiddenException);
              return false;
            },
          );
          if (ok) allowed.push(`${controller.name}.${methodName}`);
        }
      }

      expect(adminOnlyRouteCount).toBeGreaterThan(200);
      expect(allowed.sort()).toEqual(ASSISTANT_ADMIN_ROUTE_ALLOWLIST);
    });

    it('Admin vẫn vào được mọi route admin-only', async () => {
      for (const controller of controllers) {
        for (const methodName of routeNames(controller)) {
          if (!isAdminOnlyRoute(controller, methodName)) continue;
          await expect(asAdmin(controller, methodName)).resolves.toBe(true);
        }
      }
    });
  });

  describe('nhóm Trợ lí giữ lại', () => {
    it.each([
      [StudentController, 'createStudent'],
      [StudentController, 'updateStudentById'],
      [StudentController, 'deleteStudent'],
      [StudentController, 'uploadStudentAvatar'],
      [StudentController, 'updateStudentExamSchedules'],
      [StudentController, 'updateStudentStatus'],
      [UserController, 'createStudentUser'],
      [UserController, 'setUserPassword'],
      [UserController, 'setUserAccountHandle'],
      [DeviceController, 'forceLogout'],
      [StudentController, 'updateStudentAccountBalance'],
      [StudentController, 'createStudentWalletDirectTopUpRequest'],
      [StudentController, 'listStudentWalletDirectTopUpRequests'],
      [StudentController, 'getStudentWalletDirectTopUpRequest'],
      [StudentController, 'approveStudentWalletDirectTopUpRequestFromQueue'],
      [StudentController, 'createStudentSePayTopUpOrder'],
      [StudentController, 'getStudentSePayStaticQr'],
      [NotificationController, 'createNotificationDraft'],
      [NotificationController, 'pushNotification'],
    ] as [ControllerClass, string][])(
      'cho Trợ lí vào %p.%s',
      async (controller, methodName) => {
        await expect(asAssistant(controller, methodName)).resolves.toBe(true);
      },
    );
  });

  describe('nhóm trả về chỉ Admin', () => {
    const revoked: [string, ControllerClass, string[]][] = [
      ['tài khoản', UserController, ['createUser', 'updateUser', 'deleteUser']],
      [
        'nhân sự',
        StaffController,
        adminOnlyRoutes(StaffController, ['searchCustomerCareStaffOptions']),
      ],
      [
        'lớp',
        ClassController,
        adminOnlyRoutes(ClassController, [...SALE_CS_HEAD_CLASS_ROUTES]),
      ],
      ['chi phí', CostController, adminOnlyRoutes(CostController)],
      ['thưởng', BonusController, adminOnlyRoutes(BonusController)],
      [
        'trợ cấp thêm',
        ExtraAllowanceController,
        adminOnlyRoutes(ExtraAllowanceController),
      ],
      [
        'khấu trừ / thuế',
        DeductionSettingsController,
        adminOnlyRoutes(DeductionSettingsController),
      ],
      [
        'lương cứng',
        FixedSalarySettingsController,
        adminOnlyRoutes(FixedSalarySettingsController),
      ],
      [
        'quy định',
        RegulationController,
        ['createRegulation', 'updateRegulation', 'deleteRegulation'],
      ],
      ['khoá học', CourseController, ['create', 'update', 'remove']],
      [
        'ngân hàng câu hỏi',
        QuestionController,
        routeNames(QuestionController).filter((name) =>
          isAdminOnlyRoute(QuestionController, name),
        ),
      ],
      [
        'lịch tổng',
        CalendarAdminController,
        adminOnlyRoutes(CalendarAdminController),
      ],
      [
        'lịch sử thao tác',
        ActionHistoryController,
        adminOnlyRoutes(ActionHistoryController),
      ],
    ];

    describe.each(revoked)('%s', (_group, controller, methodNames) => {
      it('có route để kiểm tra', () => {
        expect(methodNames.length).toBeGreaterThan(0);
      });

      it.each(methodNames)('từ chối Trợ lí ở %s', async (methodName) => {
        await expect(
          asAssistant(controller, methodName),
        ).rejects.toBeInstanceOf(ForbiddenException);
      });

      it.each(methodNames)('cho Admin vào %s', async (methodName) => {
        await expect(asAdmin(controller, methodName)).resolves.toBe(true);
      });
    });
  });

  describe('#272 Thông tin lớp / Học phí lớp', () => {
    const income = [StaffRole.accountant_income];
    const expense = [StaffRole.accountant_expense];

    it.each(SALE_CS_HEAD_CLASS_ROUTES)(
      'cho Trưởng phòng vào ClassController.%s',
      async (methodName) => {
        await expect(asAssistant(ClassController, methodName)).resolves.toBe(
          true,
        );
      },
    );

    it.each([
      'updateClass',
      'updateClassPricingMode',
      'updateClassTeacherCompensation',
    ])('từ chối Trưởng phòng sửa %s', async (methodName) => {
      await expect(
        asAssistant(ClassController, methodName),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it.each(['updateClass', 'updateClassBasicInfo', 'updateClassTuition'])(
      'Kế toán thu bị 403 ở %s',
      async (methodName) => {
        await expect(
          asStaff(ClassController, methodName, income),
        ).rejects.toBeInstanceOf(ForbiddenException);
      },
    );

    it.each([
      'updateClass',
      'updateClassBasicInfo',
      'updateClassTuition',
      'updateClassStudentTuition',
    ])('Kế toán chi bị 403 ở %s', async (methodName) => {
      await expect(
        asStaff(ClassController, methodName, expense),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('Kế toán thu sửa được học phí riêng của học sinh', async () => {
      await expect(
        asStaff(ClassController, 'updateClassStudentTuition', income),
      ).resolves.toBe(true);
    });

    it.each(['getClassById', 'getStudentsByClassId'])(
      'kế toán thu/chi vẫn xem được %s',
      async (methodName) => {
        await expect(
          asStaff(ClassController, methodName, income),
        ).resolves.toBe(true);
        await expect(
          asStaff(ClassController, methodName, expense),
        ).resolves.toBe(true);
      },
    );

    it.each(['updateClass', 'updateClassBasicInfo', 'updateClassTuition'])(
      'Admin vẫn sửa được %s',
      async (methodName) => {
        await expect(asAdmin(ClassController, methodName)).resolves.toBe(true);
      },
    );
  });

  describe('#273 thêm/bớt học sinh trong lớp: chỉ Admin + Trưởng phòng', () => {
    const rosterRoutes: [ControllerClass, string][] = [
      [ClassController, 'updateClassStudents'],
      [StudentController, 'updateStudentClasses'],
    ];
    const otherRoles: [string, StaffRole[]][] = [
      ['Quản lý lớp / Đào tạo', [StaffRole.training]],
      ['Trưởng ban Đào tạo', [StaffRole.training_head]],
      ['Kế toán thu', [StaffRole.accountant_income]],
      ['Kế toán chi', [StaffRole.accountant_expense]],
      ['CSKH', [StaffRole.customer_care]],
      ['Gia sư', [StaffRole.teacher]],
      [
        'kiêm nhiều role (trừ Trưởng phòng)',
        [
          StaffRole.training_head,
          StaffRole.training,
          StaffRole.customer_care,
          StaffRole.accountant_income,
        ],
      ],
    ];

    it.each(rosterRoutes)(
      'Admin vào được %p.%s',
      async (controller, methodName) => {
        await expect(asAdmin(controller, methodName)).resolves.toBe(true);
      },
    );

    it.each(rosterRoutes)(
      'Trưởng phòng vào được %p.%s',
      async (controller, methodName) => {
        await expect(asAssistant(controller, methodName)).resolves.toBe(true);
      },
    );

    describe.each(otherRoles)('%s', (_label, staffRoles) => {
      it.each(rosterRoutes)(
        'bị 403 ở %p.%s',
        async (controller, methodName) => {
          await expect(
            asStaff(controller, methodName, staffRoles),
          ).rejects.toBeInstanceOf(ForbiddenException);
        },
      );
    });
  });

  describe('#274 tạo lớp / sửa lớp theo role', () => {
    const trainingHead = [StaffRole.training_head];
    const bothHeads = [
      StaffRole.training_head,
      StaffRole.sale_customer_care_head,
    ];

    it('Trưởng ban Đào tạo chỉ vào được đúng danh sách cho phép', async () => {
      const allowed: string[] = [];
      for (const controller of loadAllControllers()) {
        for (const methodName of routeNames(controller)) {
          if (!isAdminOnlyRoute(controller, methodName)) continue;
          const ok = await asStaff(controller, methodName, trainingHead).catch(
            (error: unknown) => {
              expect(error).toBeInstanceOf(ForbiddenException);
              return false;
            },
          );
          if (ok) allowed.push(`${controller.name}.${methodName}`);
        }
      }
      expect(allowed.sort()).toEqual(TRAINING_HEAD_ADMIN_ROUTE_ALLOWLIST);
    });

    it.each(['createClass', 'updateClassBasicInfo'])(
      'Admin, Trưởng ban Đào tạo, Trưởng phòng, kiêm hai role vào được %s',
      async (methodName) => {
        await expect(asAdmin(ClassController, methodName)).resolves.toBe(true);
        await expect(asAssistant(ClassController, methodName)).resolves.toBe(
          true,
        );
        await expect(
          asStaff(ClassController, methodName, trainingHead),
        ).resolves.toBe(true);
        await expect(
          asStaff(ClassController, methodName, bothHeads),
        ).resolves.toBe(true);
      },
    );

    const otherRoles: [string, StaffRole[]][] = [
      ['Quản lý lớp / Đào tạo', [StaffRole.training]],
      ['Kế toán thu', [StaffRole.accountant_income]],
      ['Kế toán chi', [StaffRole.accountant_expense]],
      ['CSKH', [StaffRole.customer_care]],
      ['Gia sư', [StaffRole.teacher]],
    ];
    describe.each(otherRoles)('%s', (_label, staffRoles) => {
      it.each(['createClass', 'updateClassBasicInfo'])(
        'bị 403 ở ClassController.%s',
        async (methodName) => {
          await expect(
            asStaff(ClassController, methodName, staffRoles),
          ).rejects.toBeInstanceOf(ForbiddenException);
        },
      );
    });

    // Kết thúc / xoá lớp (và các đường đổi trạng thái khác): chỉ Admin.
    const adminOnlyClassLifecycle = [
      'endClass',
      'deleteClass',
      'updateClass',
      'updateClassPricingMode',
      'updateClassSchedule',
      'stopClassTeacher',
    ];
    const nonAdminRoles: [string, StaffRole[]][] = [
      ['Trưởng ban Đào tạo', trainingHead],
      ['Trưởng phòng', [StaffRole.sale_customer_care_head]],
      ['kiêm hai role trưởng', bothHeads],
      [
        'Kế toán thu + chi',
        [StaffRole.accountant_income, StaffRole.accountant_expense],
      ],
      ['Quản lý lớp / Đào tạo', [StaffRole.training]],
    ];
    describe.each(nonAdminRoles)('%s', (_label, staffRoles) => {
      it.each(adminOnlyClassLifecycle)(
        'bị 403 ở ClassController.%s',
        async (methodName) => {
          await expect(
            asStaff(ClassController, methodName, staffRoles),
          ).rejects.toBeInstanceOf(ForbiddenException);
        },
      );
    });

    it.each(adminOnlyClassLifecycle)(
      'Admin vào được ClassController.%s',
      async (methodName) => {
        await expect(asAdmin(ClassController, methodName)).resolves.toBe(true);
      },
    );
  });

  // 15/11: 3 role trưởng tạo nhân sự mới (tài khoản + hồ sơ); không còn vào
  // luồng gắn hồ sơ vào user có sẵn (StaffController.createStaff /
  // searchAssignableUsers chỉ Admin).
  describe('tạo nhân sự (15/11)', () => {
    const heads: [string, StaffRole[]][] = [
      ['Trưởng phòng Sale & CSKH', [StaffRole.sale_customer_care_head]],
      ['Trưởng ban Đào tạo', [StaffRole.training_head]],
      ['Trưởng ban Chuyên môn', [StaffRole.lesson_plan_head]],
    ];
    describe.each(heads)('%s', (_label, staffRoles) => {
      it('vào được UserController.createStaffUser', async () => {
        await expect(
          asStaff(UserController, 'createStaffUser', staffRoles),
        ).resolves.toBe(true);
      });
      it.each(['createStaff', 'searchAssignableUsers'])(
        'bị 403 ở StaffController.%s',
        async (methodName) => {
          await expect(
            asStaff(StaffController, methodName, staffRoles),
          ).rejects.toBeInstanceOf(ForbiddenException);
        },
      );
    });

    describe.each([
      ['Quản lý lớp / Đào tạo', [StaffRole.training]],
      ['Ban Chuyên môn', [StaffRole.lesson_plan]],
      ['CSKH', [StaffRole.customer_care]],
      ['Kế toán chi', [StaffRole.accountant_expense]],
      ['Gia sư', [StaffRole.teacher]],
    ] as [string, StaffRole[]][])('%s', (_label, staffRoles) => {
      it('bị 403 ở UserController.createStaffUser', async () => {
        await expect(
          asStaff(UserController, 'createStaffUser', staffRoles),
        ).rejects.toBeInstanceOf(ForbiddenException);
      });
    });
  });

  describe('#275 buổi học trên route admin + khảo sát chung', () => {
    const sessionFinanceRoutes = [
      'updateSession',
      'updateSessionPaymentStatuses',
    ];

    it.each(sessionFinanceRoutes)(
      'Admin và Kế toán chi vào được SessionController.%s',
      async (methodName) => {
        await expect(asAdmin(SessionController, methodName)).resolves.toBe(
          true,
        );
        await expect(
          asStaff(SessionController, methodName, [
            StaffRole.accountant_expense,
          ]),
        ).resolves.toBe(true);
      },
    );

    const sessionDenied: [string, StaffRole[]][] = [
      ['Kế toán thu', [StaffRole.accountant_income]],
      ['Quản lý lớp / Đào tạo', [StaffRole.training]],
      ['Trưởng ban Đào tạo', [StaffRole.training_head]],
      ['Gia sư', [StaffRole.teacher]],
      ['Trưởng phòng', [StaffRole.sale_customer_care_head]],
    ];
    describe.each(sessionDenied)('%s', (_label, staffRoles) => {
      it.each(sessionFinanceRoutes)(
        'bị 403 ở SessionController.%s',
        async (methodName) => {
          await expect(
            asStaff(SessionController, methodName, staffRoles),
          ).rejects.toBeInstanceOf(ForbiddenException);
        },
      );
    });

    describe('15/11 xoá buổi: Admin + 3 role trưởng', () => {
      it('Admin xoá được buổi', async () => {
        await expect(asAdmin(SessionController, 'deleteSession')).resolves.toBe(
          true,
        );
      });

      it.each([
        ['Trưởng phòng Sale & CSKH', StaffRole.sale_customer_care_head],
        ['Trưởng ban Đào tạo', StaffRole.training_head],
        ['Trưởng ban Chuyên môn', StaffRole.lesson_plan_head],
      ])('%s vào được SessionController.deleteSession', async (_l, role) => {
        await expect(
          asStaff(SessionController, 'deleteSession', [role]),
        ).resolves.toBe(true);
      });

      it.each([
        ['Kế toán chi', StaffRole.accountant_expense],
        ['Kế toán thu', StaffRole.accountant_income],
        ['Quản lý lớp / Đào tạo', StaffRole.training],
        ['Ban Chuyên môn', StaffRole.lesson_plan],
        ['CSKH', StaffRole.customer_care],
        ['Gia sư', StaffRole.teacher],
      ])('%s vẫn bị 403 khi xoá buổi', async (_l, role) => {
        await expect(
          asStaff(SessionController, 'deleteSession', [role]),
        ).rejects.toBeInstanceOf(ForbiddenException);
      });
    });

    describe('15/11 lịch sử buổi của lớp (route admin)', () => {
      it.each([
        StaffRole.accountant_income,
        StaffRole.accountant_expense,
        StaffRole.sale_customer_care_head,
      ])('%s xem được SessionController.getSessionsByClassId', async (role) => {
        await expect(
          asStaff(SessionController, 'getSessionsByClassId', [role]),
        ).resolves.toBe(true);
      });

      it.each([
        StaffRole.training,
        StaffRole.training_head,
        StaffRole.lesson_plan_head,
        StaffRole.teacher,
      ])('%s bị 403 ở getSessionsByClassId', async (role) => {
        await expect(
          asStaff(SessionController, 'getSessionsByClassId', [role]),
        ).rejects.toBeInstanceOf(ForbiddenException);
      });
    });

    const surveyRoutes = adminOnlyRoutes(SurveysController);

    it('có route khảo sát chung để kiểm tra', () => {
      expect(surveyRoutes.length).toBeGreaterThan(0);
    });

    describe.each([
      ['Ban Chuyên môn', [StaffRole.lesson_plan]],
      ['Trưởng ban Chuyên môn', [StaffRole.lesson_plan_head]],
    ] as [string, StaffRole[]][])('%s', (_label, staffRoles) => {
      it.each(surveyRoutes)(
        'vào được SurveysController.%s',
        async (methodName) => {
          await expect(
            asStaff(SurveysController, methodName, staffRoles),
          ).resolves.toBe(true);
        },
      );
    });

    describe.each([
      ['Quản lý lớp / Đào tạo', [StaffRole.training]],
      ['Gia sư', [StaffRole.teacher]],
      ['Kế toán', [StaffRole.accountant_income, StaffRole.accountant_expense]],
    ] as [string, StaffRole[]][])('%s', (_label, staffRoles) => {
      it.each(surveyRoutes)(
        'bị 403 ở SurveysController.%s',
        async (methodName) => {
          await expect(
            asStaff(SurveysController, methodName, staffRoles),
          ).rejects.toBeInstanceOf(ForbiddenException);
        },
      );
    });
  });

  describe('nạp thẳng số dương vào ví học sinh', () => {
    const studentService = { updateStudentAccountBalance: jest.fn() };
    const controller = new StudentController(studentService as never);
    const staffUser = {
      id: 'assistant-user',
      email: 'assistant@example.com',
      accountHandle: 'sale_customer_care_head',
      roleType: UserRole.staff,
    };
    const adminUser = { ...staffUser, id: 'admin', roleType: UserRole.admin };
    const authFor = (tier: AdminTier) =>
      ({
        effectiveRoleTypes: [UserRole.staff],
        staffRoles:
          tier === 'sale_customer_care_head'
            ? [StaffRole.sale_customer_care_head]
            : [],
        access: { admin: { canAccess: tier !== null, tier } },
      }) as never;

    beforeEach(() => {
      studentService.updateStudentAccountBalance.mockReset();
      studentService.updateStudentAccountBalance.mockResolvedValue({});
    });

    it('từ chối Trợ lí nạp số dương', async () => {
      await expect(
        controller.updateStudentAccountBalance(
          staffUser as never,
          authFor('sale_customer_care_head'),
          { studentId: 's1', amount: 100_000 } as never,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(studentService.updateStudentAccountBalance).not.toHaveBeenCalled();
    });

    it('cho Trợ lí rút (số âm)', async () => {
      await controller.updateStudentAccountBalance(
        staffUser as never,
        authFor('sale_customer_care_head'),
        { studentId: 's1', amount: -50_000 } as never,
      );
      expect(studentService.updateStudentAccountBalance).toHaveBeenCalled();
    });

    it('cho Admin nạp số dương', async () => {
      await controller.updateStudentAccountBalance(
        adminUser as never,
        authFor('full'),
        { studentId: 's1', amount: 100_000 } as never,
      );
      expect(studentService.updateStudentAccountBalance).toHaveBeenCalled();
    });
  });
});
