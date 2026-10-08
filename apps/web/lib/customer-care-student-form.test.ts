import { describe, expect, it } from "vitest";
import {
  EMPTY_CUSTOMER_CARE_STUDENT_FORM,
  buildCustomerCareStudentPayload,
  validateCustomerCareStudentForm,
  type CustomerCareStudentFormState,
} from "./customer-care-student-form";

const filledForm: CustomerCareStudentFormState = {
  ...EMPTY_CUSTOMER_CARE_STUDENT_FORM,
  lastName: " Nguyễn ",
  firstName: " An ",
  email: " an@example.com ",
  phone: " 0900000000 ",
  accountHandle: " an-nguyen ",
  password: "secret1",
  confirmPassword: "secret1",
  birthYear: "2012",
  school: "  ",
  parentName: " Phụ huynh ",
};

describe("validateCustomerCareStudentForm", () => {
  it("requires name, contact and login fields", () => {
    expect(
      Object.keys(validateCustomerCareStudentForm(EMPTY_CUSTOMER_CARE_STUDENT_FORM, 2026)),
    ).toEqual(["lastName", "firstName", "email", "phone", "accountHandle", "password"]);
  });

  it("rejects mismatched password and out-of-range birth year", () => {
    expect(
      validateCustomerCareStudentForm(
        { ...filledForm, confirmPassword: "other", birthYear: "2030" },
        2026,
      ),
    ).toEqual({
      confirmPassword: "Mật khẩu xác nhận không khớp.",
      birthYear: "Năm sinh không hợp lệ.",
    });
  });

  it("accepts a filled form", () => {
    expect(validateCustomerCareStudentForm(filledForm, 2026)).toEqual({});
  });
});

describe("buildCustomerCareStudentPayload", () => {
  it("trims fields, drops blanks and never assigns classes", () => {
    expect(buildCustomerCareStudentPayload(filledForm)).toEqual({
      email: "an@example.com",
      phone: "0900000000",
      password: "secret1",
      accountHandle: "an-nguyen",
      last_name: "Nguyễn",
      first_name: "An",
      birth_year: 2012,
      gender: "male",
      school: undefined,
      province: undefined,
      parent_name: "Phụ huynh",
      parent_phone: undefined,
      goal: undefined,
      status: "active",
      class_ids: [],
      emailVerified: false,
    });
  });
});
