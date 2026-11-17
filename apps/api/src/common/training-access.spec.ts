import { StaffRole } from 'generated/enums';
import {
  TRAINING_ACCESS_ROLES,
  hasTrainingAccess,
  resolveTrainingManagerIncomeRole,
} from './training-access';

describe('hasTrainingAccess', () => {
  it('true khi có role training', () => {
    expect(hasTrainingAccess([StaffRole.teacher, StaffRole.training])).toBe(
      true,
    );
  });

  it('true khi chỉ có training_head (role độc lập, không cần training)', () => {
    expect(hasTrainingAccess([StaffRole.training_head])).toBe(true);
  });

  it('false khi không có role nào thuộc Ban Đào Tạo', () => {
    expect(hasTrainingAccess([StaffRole.teacher])).toBe(false);
    expect(hasTrainingAccess([])).toBe(false);
    expect(hasTrainingAccess(null)).toBe(false);
    expect(hasTrainingAccess(undefined)).toBe(false);
  });

  it('mọi role trong TRAINING_ACCESS_ROLES đều mở quyền', () => {
    for (const role of TRAINING_ACCESS_ROLES) {
      expect(hasTrainingAccess([role])).toBe(true);
    }
  });
});

describe('resolveTrainingManagerIncomeRole', () => {
  it('ưu tiên training khi có cả hai role', () => {
    expect(
      resolveTrainingManagerIncomeRole([
        StaffRole.training_head,
        StaffRole.training,
      ]),
    ).toBe(StaffRole.training);
  });

  it('training_head thuần → dòng training_head', () => {
    expect(resolveTrainingManagerIncomeRole([StaffRole.training_head])).toBe(
      StaffRole.training_head,
    );
  });

  it('null khi không thuộc Ban Đào Tạo', () => {
    expect(resolveTrainingManagerIncomeRole([StaffRole.teacher])).toBeNull();
    expect(resolveTrainingManagerIncomeRole(undefined)).toBeNull();
  });
});
