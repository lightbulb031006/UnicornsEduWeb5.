import { readFileSync } from 'fs';
import { join } from 'path';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RegulationAudience, StaffRole } from 'generated/enums';
import { NotificationTargetingDto } from 'src/dtos/notification.dto';
import { UpdateStaffDto } from 'src/dtos/staff.dto';
import {
  SALE_CS_HEAD_COMMISSION_LABEL,
  SALE_CS_HEAD_ROLE,
  SALE_CS_HEAD_ROLE_LABEL,
  hasSaleCsHeadAccess,
} from './sale-cs-head-access';

/**
 * #268 — Đổi tên role Trợ lí (`assistant`) thành Trưởng phòng Sale & CSKH
 * (`sale_customer_care_head`). Hành vi quyền không đổi, chỉ đổi tên giá trị/nhãn.
 */
describe('#268 đổi tên Trợ lí → Trưởng phòng Sale & CSKH', () => {
  it('enum StaffRole có sale_customer_care_head, không còn assistant', () => {
    const roles = Object.values(StaffRole) as string[];
    expect(roles).toContain('sale_customer_care_head');
    expect(roles).not.toContain('assistant');
  });

  it('enum RegulationAudience có staff_sale_customer_care_head, không còn staff_assistant', () => {
    const audiences = Object.values(RegulationAudience) as string[];
    expect(audiences).toContain('staff_sale_customer_care_head');
    expect(audiences).not.toContain('staff_assistant');
  });

  it('SALE_CS_HEAD_ROLE trỏ giá trị mới và nhãn mới', () => {
    expect(SALE_CS_HEAD_ROLE).toBe('sale_customer_care_head');
    expect(SALE_CS_HEAD_ROLE_LABEL).toBe('Trưởng phòng Sale & CSKH');
    expect(SALE_CS_HEAD_COMMISSION_LABEL).toBe('Hoa hồng trưởng phòng');
  });

  describe('hasSaleCsHeadAccess', () => {
    it.each([
      ['chỉ mang role Trưởng phòng', ['sale_customer_care_head']],
      ['kiêm role khác', ['teacher', 'sale_customer_care_head']],
    ])('được phép: %s', (_label, roles) => {
      expect(hasSaleCsHeadAccess(roles)).toBe(true);
    });

    it.each([
      ['giá trị cũ assistant', ['assistant']],
      ['CSKH / Sale thường', ['customer_care', 'sale']],
      ['không có role', []],
      ['không có hồ sơ', null],
    ])('bị từ chối: %s', (_label, roles) => {
      expect(hasSaleCsHeadAccess(roles)).toBe(false);
    });
  });

  describe('giao role cho nhân sự (UpdateStaffDto.roles)', () => {
    it('từ chối giá trị cũ assistant', async () => {
      const errors = await validate(
        plainToInstance(UpdateStaffDto, { roles: ['assistant'] }),
      );
      expect(errors.map((error) => error.property)).toContain('roles');
    });

    it('chấp nhận sale_customer_care_head', async () => {
      const errors = await validate(
        plainToInstance(UpdateStaffDto, {
          roles: [StaffRole.sale_customer_care_head],
        }),
      );
      expect(errors.map((error) => error.property)).not.toContain('roles');
    });
  });

  describe('đối tượng nhận thông báo (targetStaffRoles)', () => {
    it('từ chối giá trị cũ assistant', async () => {
      const errors = await validate(
        plainToInstance(NotificationTargetingDto, {
          targetStaffRoles: ['assistant'],
        }),
      );
      expect(errors.map((error) => error.property)).toContain(
        'targetStaffRoles',
      );
    });

    it('cho gửi tới Trưởng phòng Sale & CSKH', async () => {
      const errors = await validate(
        plainToInstance(NotificationTargetingDto, {
          targetStaffRoles: [StaffRole.sale_customer_care_head],
        }),
      );
      expect(errors).toHaveLength(0);
    });
  });

  describe('migration đổi tên enum tại chỗ', () => {
    const sql = readFileSync(
      join(
        __dirname,
        '../../prisma/schema/migrations/20261112100000_rename_assistant_to_sale_customer_care_head/migration.sql',
      ),
      'utf8',
    );
    const statements = sql
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n');

    it('dùng RENAME VALUE cho cả StaffRole và RegulationAudience', () => {
      expect(statements).toContain(
        `ALTER TYPE "StaffRole" RENAME VALUE 'assistant' TO 'sale_customer_care_head'`,
      );
      expect(statements).toContain(
        `ALTER TYPE "RegulationAudience" RENAME VALUE 'staff_assistant' TO 'staff_sale_customer_care_head'`,
      );
    });

    it('không tạo lại type, không đụng dữ liệu hay đổi tên cột', () => {
      expect(statements).not.toMatch(
        /DROP\s+TYPE|CREATE\s+TYPE|DELETE\s+FROM|UPDATE\s+"|RENAME\s+COLUMN|ALTER\s+TABLE/i,
      );
    });
  });
});
