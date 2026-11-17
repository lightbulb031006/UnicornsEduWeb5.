import { describe, expect, it } from "vitest";
import {
  EMPTY_STAFF_ACCOUNT_FORM,
  HEAD_ASSIGNABLE_STAFF_ROLE_OPTIONS,
  buildStaffAccountPayload,
  validateStaffAccountForm,
  type StaffAccountFormState,
} from "./staff-account-form";

const VALID_FORM: StaffAccountFormState = {
  ...EMPTY_STAFF_ACCOUNT_FORM,
  fullName: "  Nguyễn Văn B  ",
  cccdNumber: "012345678901",
  email: " b@test.local ",
  accountHandle: " nvb ",
  password: "secret1",
  confirmPassword: "secret1",
  gender: "male",
  roles: ["teacher"],
};

describe("Form tạo nhân sự của role trưởng (15/11)", () => {
  it("không cho chọn Admin / role trưởng", () => {
    const values = HEAD_ASSIGNABLE_STAFF_ROLE_OPTIONS.map((option) => option.value);
    expect(values).toHaveLength(9);
    for (const forbidden of [
      "admin",
      "sale_customer_care_head",
      "training_head",
      "lesson_plan_head",
    ]) {
      expect(values).not.toContain(forbidden);
    }
  });

  it("form hợp lệ không có lỗi", () => {
    expect(validateStaffAccountForm(VALID_FORM)).toEqual({});
  });

  it("form rỗng báo đủ lỗi bắt buộc", () => {
    expect(Object.keys(validateStaffAccountForm(EMPTY_STAFF_ACCOUNT_FORM)).sort()).toEqual(
      ["accountHandle", "cccdNumber", "email", "fullName", "gender", "password", "roles"].sort(),
    );
  });

  it.each([
    [{ cccdNumber: "12345" }, "cccdNumber"],
    [{ email: "khong-phai-email" }, "email"],
    [{ password: "123", confirmPassword: "123" }, "password"],
    [{ confirmPassword: "khac" }, "confirmPassword"],
  ] as const)("%o → lỗi %s", (patch, field) => {
    expect(validateStaffAccountForm({ ...VALID_FORM, ...patch })).toHaveProperty(field);
  });

  it("payload trim chữ, bỏ ô trống", () => {
    expect(buildStaffAccountPayload({ ...VALID_FORM, phone: "  ", university: " ĐHBK " })).toEqual({
      email: "b@test.local",
      password: "secret1",
      accountHandle: "nvb",
      phone: undefined,
      full_name: "Nguyễn Văn B",
      roles: ["teacher"],
      cccd_number: "012345678901",
      gender: "male",
      ethnicity: undefined,
      current_address: undefined,
      cccd_issued_date: undefined,
      cccd_issued_place: undefined,
      birth_date: undefined,
      university: "ĐHBK",
      high_school: undefined,
      bank_account: undefined,
      bank_qr_link: undefined,
      emailVerified: false,
    });
  });
});
