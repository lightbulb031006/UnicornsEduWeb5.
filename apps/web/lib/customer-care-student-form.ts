import type { CreateStudentUserPayload, StudentGender } from "@/dtos/user.dto";

/** Form CSKH tạo học sinh kèm tài khoản: mỗi trường một ô, không xếp lớp. */
export type CustomerCareStudentFormState = {
  lastName: string;
  firstName: string;
  email: string;
  phone: string;
  accountHandle: string;
  password: string;
  confirmPassword: string;
  birthYear: string;
  gender: StudentGender;
  school: string;
  province: string;
  parentName: string;
  parentPhone: string;
  goal: string;
  emailVerified: boolean;
};

export type CustomerCareStudentTextField = Exclude<
  keyof CustomerCareStudentFormState,
  "gender" | "emailVerified"
>;

/** id DOM của ô nhập, dùng chung cho label và focus ô lỗi đầu tiên. */
export const customerCareStudentFieldId = (field: CustomerCareStudentTextField) =>
  `cc-student-${field}`;

export const CUSTOMER_CARE_STUDENT_FIELD_ORDER = [
  "lastName",
  "firstName",
  "email",
  "phone",
  "accountHandle",
  "password",
  "confirmPassword",
  "birthYear",
] as const satisfies readonly CustomerCareStudentTextField[];

export type CustomerCareStudentFormErrors = Partial<
  Record<CustomerCareStudentTextField, string>
>;

export const EMPTY_CUSTOMER_CARE_STUDENT_FORM: CustomerCareStudentFormState = {
  lastName: "",
  firstName: "",
  email: "",
  phone: "",
  accountHandle: "",
  password: "",
  confirmPassword: "",
  birthYear: "",
  gender: "male",
  school: "",
  province: "",
  parentName: "",
  parentPhone: "",
  goal: "",
  emailVerified: false,
};

export function validateCustomerCareStudentForm(
  form: CustomerCareStudentFormState,
  currentYear = new Date().getFullYear(),
): CustomerCareStudentFormErrors {
  const errors: CustomerCareStudentFormErrors = {};
  const email = form.email.trim();
  const birthYear = form.birthYear.trim();

  if (!form.lastName.trim()) errors.lastName = "Vui lòng nhập họ.";
  if (!form.firstName.trim()) errors.firstName = "Vui lòng nhập tên.";
  if (!email) {
    errors.email = "Vui lòng nhập email.";
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = "Email không hợp lệ.";
  }
  if (!form.phone.trim()) errors.phone = "Vui lòng nhập số điện thoại.";
  if (!form.accountHandle.trim()) errors.accountHandle = "Vui lòng nhập tên đăng nhập.";
  if (!form.password) {
    errors.password = "Vui lòng nhập mật khẩu.";
  } else if (form.password.length < 6) {
    errors.password = "Mật khẩu cần ít nhất 6 ký tự.";
  }
  if (form.password && form.password !== form.confirmPassword) {
    errors.confirmPassword = "Mật khẩu xác nhận không khớp.";
  }
  if (birthYear) {
    const value = Number(birthYear);
    if (!Number.isInteger(value) || value < 1900 || value > currentYear) {
      errors.birthYear = "Năm sinh không hợp lệ.";
    }
  }

  return errors;
}

const optionalText = (value: string) => value.trim() || undefined;

export function buildCustomerCareStudentPayload(
  form: CustomerCareStudentFormState,
): CreateStudentUserPayload {
  const birthYear = form.birthYear.trim();
  return {
    email: form.email.trim(),
    phone: form.phone.trim(),
    password: form.password,
    accountHandle: form.accountHandle.trim(),
    last_name: form.lastName.trim(),
    first_name: form.firstName.trim(),
    birth_year: birthYear ? Number(birthYear) : undefined,
    gender: form.gender,
    school: optionalText(form.school),
    province: optionalText(form.province),
    parent_name: optionalText(form.parentName),
    parent_phone: optionalText(form.parentPhone),
    goal: optionalText(form.goal),
    status: "active",
    // CSKH không xếp lớp; admin/trợ lí xếp lớp sau.
    class_ids: [],
    emailVerified: form.emailVerified,
  };
}
