jest.mock('src/calendar/calendar.service', () => ({
  CalendarService: class CalendarServiceMock {},
}));

import { StaffRole } from 'generated/enums';
import { ALLOW_ASSISTANT_ON_ADMIN_KEY } from './decorators/allow-assistant-on-admin.decorator';
import { ALLOW_STAFF_ROLES_ON_ADMIN_KEY } from './decorators/allow-staff-roles-on-admin.decorator';
import { BonusController } from '../bonus/bonus.controller';
import { ClassController } from '../class/class.controller';
import { CostController } from '../cost/cost.controller';
import { DeductionSettingsController } from '../deduction-settings/deduction-settings.controller';
import { ExtraAllowanceController } from '../extra-allowance/extra-allowance.controller';
import { StaffController } from '../staff/staff.controller';
import { StudentController } from '../student/student.controller';
import { UserController } from '../user/user.controller';

function getAllowedStaffRoles(
  controller: { prototype: object },
  methodName: string,
): StaffRole[] | undefined {
  const descriptor = Object.getOwnPropertyDescriptor(
    controller.prototype,
    methodName,
  );
  const methodTarget: unknown = descriptor?.value;

  if (typeof methodTarget !== 'function') {
    throw new Error(`Controller method not found: ${methodName}`);
  }

  const metadata: unknown = Reflect.getMetadata(
    ALLOW_STAFF_ROLES_ON_ADMIN_KEY,
    methodTarget,
  );

  return Array.isArray(metadata) ? (metadata as StaffRole[]) : undefined;
}

function getAllowAssistantOnAdminRoute(
  controller: { prototype: object },
  methodName?: string,
): boolean | undefined {
  let target: object = controller;

  if (methodName !== undefined) {
    const descriptor = Object.getOwnPropertyDescriptor(
      controller.prototype,
      methodName,
    );
    const methodTarget: unknown = descriptor?.value;

    if (typeof methodTarget !== 'function') {
      throw new Error(`Controller method not found: ${methodName}`);
    }

    target = methodTarget;
  }

  const metadata: unknown = Reflect.getMetadata(
    ALLOW_ASSISTANT_ON_ADMIN_KEY,
    target,
  );

  return typeof metadata === 'boolean' ? metadata : undefined;
}

describe('RBAC route metadata', () => {
  it.each(['createUser', 'createStudentUser', 'updateUser', 'deleteUser'])(
    'allows assistant on UserController.%s',
    (methodName) => {
      expect(getAllowedStaffRoles(UserController, methodName)).toEqual([
        StaffRole.assistant,
      ]);
    },
  );

  it('allows assistant for staff profile role/link updates', () => {
    expect(getAllowedStaffRoles(StaffController, 'updateStaff')).toEqual([
      StaffRole.assistant,
    ]);
  });

  it('allows assistant on staff lifecycle helper routes', () => {
    expect(getAllowedStaffRoles(StaffController, 'createStaff')).toEqual([
      StaffRole.assistant,
    ]);
    expect(getAllowedStaffRoles(StaffController, 'deleteStaff')).toEqual([
      StaffRole.assistant,
    ]);
    expect(getAllowedStaffRoles(StaffController, 'updateStaffStatus')).toEqual([
      StaffRole.assistant,
    ]);
  });

  it('allows assistant on operational student and class status actions', () => {
    expect(
      getAllowedStaffRoles(StudentController, 'updateStudentStatus'),
    ).toEqual([StaffRole.assistant, StaffRole.customer_care]);
    expect(
      getAllowedStaffRoles(ClassController, 'updateClassStudents'),
    ).toEqual([StaffRole.assistant]);
    expect(getAllowedStaffRoles(ClassController, 'endClass')).toEqual([
      StaffRole.assistant,
    ]);
    expect(getAllowedStaffRoles(ClassController, 'stopClassTeacher')).toEqual([
      StaffRole.assistant,
    ]);
  });

  it('allows assistant and assigned customer care to update student profile', () => {
    expect(getAllowedStaffRoles(StudentController, 'updateStudent')).toEqual([
      StaffRole.assistant,
      StaffRole.customer_care,
    ]);
    expect(
      getAllowedStaffRoles(StudentController, 'updateStudentById'),
    ).toEqual([StaffRole.assistant, StaffRole.customer_care]);
    expect(
      getAllowedStaffRoles(StudentController, 'updateStudentExamSchedules'),
    ).toEqual([StaffRole.assistant, StaffRole.customer_care]);
  });

  it('keeps student wallet history out of accountant scopes', () => {
    expect(
      getAllowedStaffRoles(StudentController, 'getStudentWalletHistory'),
    ).toEqual([StaffRole.assistant, StaffRole.customer_care]);
  });

  it('allows assistant on student delete and wallet adjustment routes', () => {
    expect(
      getAllowedStaffRoles(StudentController, 'updateStudentAccountBalance'),
    ).toEqual([StaffRole.assistant]);
    expect(getAllowedStaffRoles(StudentController, 'deleteStudent')).toEqual([
      StaffRole.assistant,
    ]);
  });

  it('allows assistant on tax deduction settings by default', () => {
    expect(
      getAllowAssistantOnAdminRoute(DeductionSettingsController),
    ).toBeUndefined();
  });

  it('allows assistant and expense accountant to create costs', () => {
    expect(getAllowedStaffRoles(CostController, 'createCost')).toEqual([
      StaffRole.assistant,
      StaffRole.accountant_expense,
    ]);
  });

  it('allows assistant and expense accountant to delete costs', () => {
    expect(getAllowedStaffRoles(CostController, 'deleteCost')).toEqual([
      StaffRole.assistant,
      StaffRole.accountant_expense,
    ]);
  });

  it('allows staff admin, assistant, and expense accountant to create bonuses', () => {
    expect(getAllowedStaffRoles(BonusController, 'createBonus')).toEqual([
      StaffRole.admin,
      StaffRole.assistant,
      StaffRole.accountant_expense,
    ]);
  });

  it('allows staff admin, assistant, and expense accountant to delete bonuses', () => {
    expect(getAllowedStaffRoles(BonusController, 'deleteBonus')).toEqual([
      StaffRole.admin,
      StaffRole.assistant,
      StaffRole.accountant_expense,
    ]);
  });

  it('allows assistant and expense accountant to create extra allowances', () => {
    expect(
      getAllowedStaffRoles(ExtraAllowanceController, 'createExtraAllowance'),
    ).toEqual([StaffRole.assistant, StaffRole.accountant_expense]);
  });

  it('allows assistant and expense accountant to delete extra allowances', () => {
    expect(
      getAllowedStaffRoles(ExtraAllowanceController, 'deleteExtraAllowance'),
    ).toEqual([StaffRole.assistant, StaffRole.accountant_expense]);
  });
});
