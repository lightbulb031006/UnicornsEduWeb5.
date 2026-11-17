import { ForbiddenException } from '@nestjs/common';
import { ClassPricingMode, ClassStatus, StaffRole } from 'generated/enums';
import type {
  CreateClassDto,
  UpdateClassBasicInfoDto,
} from 'src/dtos/class.dto';
import type { StaffPolicyActor } from 'src/common/staff-role-policy';
import {
  assertCreateClassAllowed,
  assertUpdateClassBasicInfoAllowed,
} from './class-write-field-policy';

const SELF_STAFF_ID = 'UNISTAFF-self000001';
const OTHER_STAFF_ID = 'UNISTAFF-other00001';

const actorWith = (roles: StaffRole[], isAdmin = false): StaffPolicyActor => ({
  isAdmin,
  staffId: SELF_STAFF_ID,
  roles,
});

const admin = actorWith([], true);
const trainingHead = actorWith([StaffRole.training_head]);
const saleHead = actorWith([StaffRole.sale_customer_care_head]);
const bothHeads = actorWith([
  StaffRole.training_head,
  StaffRole.sale_customer_care_head,
]);

const base: CreateClassDto = {
  name: 'Lớp Toán 9',
  course_id: 'course-1',
  max_students: 12,
};

/** Một payload "chỉ thêm 1 nhóm trường" cho mỗi nhóm quyền. */
const FIELD_GROUPS: Record<string, Partial<CreateClassDto>> = {
  'gia sư (teacher_ids)': { teacher_ids: [OTHER_STAFF_ID] },
  'gia sư + lương riêng + % vận hành': {
    teachers: [
      {
        teacher_id: OTHER_STAFF_ID,
        custom_allowance: 100_000,
        custom_scale_amount: 2,
        operating_deduction_rate_percent: 10,
      },
    ],
  },
  'lương gia sư mặc định': {
    allowance_per_session_per_student: 50_000,
    max_allowance_per_session: 300_000,
    scale_amount: 2,
  },
  'Quản lý lớp': { training_manager_staff_id: OTHER_STAFF_ID },
  'học phí theo buổi': { student_tuition_per_session: 200_000 },
  'học phí theo block': { student_tuition_per_block: 100_000 },
  'học phí trọn gói': {
    tuition_package_total: 2_000_000,
    tuition_package_session: 10,
  },
  'học sinh': { student_ids: ['UNIST-a1b2c3d4e5'] },
  'lịch học': {
    schedule: [{ dayOfWeek: 1, from: '18:00', to: '19:30' }],
  } as unknown as Partial<CreateClassDto>,
  'cách thu học phí': { pricing_mode: ClassPricingMode.per_session },
  'không cần điểm danh': { no_attendance: true },
  'trạng thái kết thúc': { status: ClassStatus.ended },
};

const TRAINING_HEAD_GROUPS = new Set([
  'gia sư (teacher_ids)',
  'gia sư + lương riêng + % vận hành',
  'lương gia sư mặc định',
  'Quản lý lớp',
]);
const SALE_HEAD_GROUPS = new Set([
  'học phí theo buổi',
  'học phí theo block',
  'học phí trọn gói',
  'học sinh',
]);

type Case = [string, string, StaffPolicyActor, boolean];

function buildCases(): Case[] {
  const cases: Case[] = [];
  for (const group of Object.keys(FIELD_GROUPS)) {
    cases.push(['Admin', group, admin, true]);
    cases.push([
      'Trưởng ban Đào tạo',
      group,
      trainingHead,
      TRAINING_HEAD_GROUPS.has(group),
    ]);
    cases.push(['Trưởng phòng', group, saleHead, SALE_HEAD_GROUPS.has(group)]);
    cases.push([
      'kiêm hai role trưởng',
      group,
      bothHeads,
      TRAINING_HEAD_GROUPS.has(group) || SALE_HEAD_GROUPS.has(group),
    ]);
  }
  return cases;
}

describe('#274 assertCreateClassAllowed', () => {
  it.each([
    ['Admin', admin],
    ['Trưởng ban Đào tạo', trainingHead],
    ['Trưởng phòng', saleHead],
    ['kiêm hai role trưởng', bothHeads],
  ])('%s tạo được lớp chỉ có thông tin lớp', (_label, actor) => {
    expect(() =>
      assertCreateClassAllowed(actor, {
        ...base,
        status: ClassStatus.running,
      }),
    ).not.toThrow();
  });

  it.each(buildCases())('%s gửi %s → %s', (_label, group, actor, allowed) => {
    const run = () =>
      assertCreateClassAllowed(actor, { ...base, ...FIELD_GROUPS[group] });
    if (allowed) {
      expect(run).not.toThrow();
    } else {
      expect(run).toThrow(ForbiddenException);
    }
  });

  it.each([
    ['Quản lý lớp / Đào tạo', [StaffRole.training]],
    ['Kế toán thu', [StaffRole.accountant_income]],
    ['Kế toán chi', [StaffRole.accountant_expense]],
    ['CSKH', [StaffRole.customer_care]],
    ['Gia sư', [StaffRole.teacher]],
  ])('%s không được tạo lớp', (_label, roles) => {
    expect(() => assertCreateClassAllowed(actorWith(roles), base)).toThrow(
      'Chỉ Admin, Trưởng ban Đào tạo hoặc Trưởng phòng Sale & CSKH được tạo lớp.',
    );
  });

  it('403 liệt kê tên tiếng Việt của các trường bị từ chối', () => {
    expect(() =>
      assertCreateClassAllowed(trainingHead, {
        ...base,
        student_tuition_per_session: 200_000,
        tuition_package_total: 1_000_000,
        student_ids: ['UNIST-a1b2c3d4e5'],
      }),
    ).toThrow('Bạn không có quyền tạo lớp với các trường: Học phí, Học sinh.');
  });

  it('mảng rỗng / null / no_attendance=false coi như không gửi', () => {
    expect(() =>
      assertCreateClassAllowed(saleHead, {
        ...base,
        teacher_ids: [],
        teachers: [],
        schedule: [],
        max_allowance_per_session: null,
        no_attendance: false,
      } as CreateClassDto),
    ).not.toThrow();
  });

  describe('#265: không tự gán mình làm gia sư', () => {
    it.each([
      ['teacher_ids', { teacher_ids: [SELF_STAFF_ID] }],
      ['teachers', { teachers: [{ teacher_id: SELF_STAFF_ID }] }],
    ])('Trưởng ban Đào tạo gửi mình trong %s → 403', (_label, payload) => {
      expect(() =>
        assertCreateClassAllowed(trainingHead, { ...base, ...payload }),
      ).toThrow(
        'Không được tự chỉnh lương, trợ cấp hoặc thanh toán của chính mình.',
      );
    });

    it('Trưởng ban Đào tạo tự làm Quản lý lớp được (% quản lý chỉ Admin)', () => {
      expect(() =>
        assertCreateClassAllowed(trainingHead, {
          ...base,
          training_manager_staff_id: SELF_STAFF_ID,
        }),
      ).not.toThrow();
    });

    it('Admin tự gán mình làm gia sư được', () => {
      expect(() =>
        assertCreateClassAllowed(
          { ...admin, staffId: SELF_STAFF_ID },
          { ...base, teacher_ids: [SELF_STAFF_ID] },
        ),
      ).not.toThrow();
    });
  });
});

describe('#274 assertUpdateClassBasicInfoAllowed', () => {
  const headFields: UpdateClassBasicInfoDto = {
    name: 'Lớp mới',
    course_id: 'course-2',
    max_students: 20,
  };

  it.each([
    ['Admin', admin],
    ['Trưởng ban Đào tạo', trainingHead],
    ['Trưởng phòng', saleHead],
    ['kiêm hai role trưởng', bothHeads],
  ])('%s sửa được tên, khoá học, sĩ số', (_label, actor) => {
    expect(() =>
      assertUpdateClassBasicInfoAllowed(actor, headFields),
    ).not.toThrow();
  });

  const adminOnlyFields: [string, UpdateClassBasicInfoDto][] = [
    ['status ended (kết thúc lớp)', { status: ClassStatus.ended }],
    ['status running', { status: ClassStatus.running }],
    ['no_attendance', { no_attendance: true }],
    [
      'allowance_per_session_per_student',
      { allowance_per_session_per_student: 1 },
    ],
    ['max_allowance_per_session', { max_allowance_per_session: 1 }],
    ['scale_amount', { scale_amount: 1 }],
    ['content_access_expires_at', { content_access_expires_at: '2026-12-31' }],
  ];

  describe.each([
    ['Trưởng ban Đào tạo', trainingHead],
    ['Trưởng phòng', saleHead],
    ['kiêm hai role trưởng', bothHeads],
  ])('%s', (_label, actor) => {
    it.each(adminOnlyFields)('gửi %s → 403', (_field, dto) => {
      expect(() =>
        assertUpdateClassBasicInfoAllowed(actor, { ...headFields, ...dto }),
      ).toThrow(ForbiddenException);
    });
  });

  it.each(adminOnlyFields)('Admin gửi %s được', (_field, dto) => {
    expect(() =>
      assertUpdateClassBasicInfoAllowed(admin, { ...headFields, ...dto }),
    ).not.toThrow();
  });

  it.each([
    ['Kế toán thu', [StaffRole.accountant_income]],
    ['Quản lý lớp / Đào tạo', [StaffRole.training]],
  ])('%s không được sửa Thông tin lớp', (_label, roles) => {
    expect(() =>
      assertUpdateClassBasicInfoAllowed(actorWith(roles), headFields),
    ).toThrow(ForbiddenException);
  });
});
