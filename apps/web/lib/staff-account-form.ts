import type { CreateStaffUserPayload, StudentGender } from "@/dtos/user.dto";
import { LESSON_PLAN_ROLE_LABEL, ROLE_LABELS } from "@/lib/staff.constants";

/**
 * 15/11: role trưởng tạo nhân sự = nhập thẳng tài khoản mới + hồ sơ.
 * Không có Admin và 3 role trưởng (backend cũng chặn).
 */
export const HEAD_ASSIGNABLE_STAFF_ROLE_OPTIONS: ReadonlyArray<{
  value: string;
  label: string;
}> = [
  { value: "teacher", label: "Giáo viên" },
  { value: "lesson_plan", label: LESSON_PLAN_ROLE_LABEL },
  { value: "accountant_income", label: "Kế toán thu" },
  { value: "accountant_expense", label: "Kế toán chi" },
  { value: "communication", label: "Truyền thông" },
  { value: "technical", label: "Kỹ thuật" },
  { value: "customer_care", label: "CSKH" },
  { value: "training", label: ROLE_LABELS.training ?? "Ban Đào tạo" },
  { value: "sale", label: "Sale" },
];

export type StaffAccountFormState = {
  fullName: string;
  cccdNumber: string;
  email: string;
  phone: string;
  accountHandle: string;
  password: string;
  confirmPassword: string;
  ethnicity: string;
  currentAddress: string;
  cccdIssuedDate: string;
  cccdIssuedPlace: string;
  birthDate: string;
  university: string;
  highSchool: string;
  bankAccount: string;
  bankQrLink: string;
  gender: StudentGender | "";
  roles: string[];
  emailVerified: boolean;
};

export type StaffAccountTextField = Exclude<
  keyof StaffAccountFormState,
  "gender" | "roles" | "emailVerified"
>;

/** Field có thể báo lỗi; `roles`/`gender` không có ô input nên focus theo id riêng. */
export type StaffAccountErrorField = StaffAccountTextField | "roles" | "gender";

export const staffAccountFieldId = (field: StaffAccountErrorField) =>
  `staff-account-${field}`;

/** Thứ tự hiển thị trên form — lỗi đầu tiên theo thứ tự này được toast + focus. */
export const STAFF_ACCOUNT_FIELD_ORDER = [
  "fullName",
  "roles",
  "cccdNumber",
  "gender",
  "email",
  "accountHandle",
  "password",
  "confirmPassword",
] as const satisfies readonly StaffAccountErrorField[];

export type StaffAccountFormErrors = Partial<Record<StaffAccountErrorField, string>>;

export const EMPTY_STAFF_ACCOUNT_FORM: StaffAccountFormState = {
  fullName: "",
  cccdNumber: "",
  email: "",
  phone: "",
  accountHandle: "",
  password: "",
  confirmPassword: "",
  ethnicity: "",
  currentAddress: "",
  cccdIssuedDate: "",
  cccdIssuedPlace: "",
  birthDate: "",
  university: "",
  highSchool: "",
  bankAccount: "",
  bankQrLink: "",
  gender: "",
  roles: [],
  emailVerified: false,
};

export function validateStaffAccountForm(
  form: StaffAccountFormState,
): StaffAccountFormErrors {
  const errors: StaffAccountFormErrors = {};
  const email = form.email.trim();

  if (!form.fullName.trim()) errors.fullName = "Vui lòng nhập họ tên nhân sự.";
  if (form.roles.length === 0) errors.roles = "Vui lòng chọn ít nhất một vai trò.";
  if (!/^\d{12}$/.test(form.cccdNumber.trim())) {
    errors.cccdNumber = "Số CCCD phải gồm đúng 12 chữ số.";
  }
  if (!form.gender) errors.gender = "Vui lòng chọn giới tính.";
  if (!email) {
    errors.email = "Vui lòng nhập email.";
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = "Email không hợp lệ.";
  }
  if (!form.accountHandle.trim()) errors.accountHandle = "Vui lòng nhập tên đăng nhập.";
  if (!form.password) {
    errors.password = "Vui lòng nhập mật khẩu.";
  } else if (form.password.length < 6) {
    errors.password = "Mật khẩu cần ít nhất 6 ký tự.";
  }
  if (form.password && form.password !== form.confirmPassword) {
    errors.confirmPassword = "Mật khẩu xác nhận không khớp.";
  }

  return errors;
}

const optionalText = (value: string) => value.trim() || undefined;

/** Chỉ gọi sau khi `validateStaffAccountForm` không có lỗi (gender đã chọn). */
export function buildStaffAccountPayload(
  form: StaffAccountFormState,
): CreateStaffUserPayload {
  return {
    email: form.email.trim(),
    password: form.password,
    accountHandle: form.accountHandle.trim(),
    phone: optionalText(form.phone),
    full_name: form.fullName.trim(),
    roles: [...form.roles],
    cccd_number: form.cccdNumber.trim(),
    gender: form.gender as StudentGender,
    ethnicity: optionalText(form.ethnicity),
    current_address: optionalText(form.currentAddress),
    cccd_issued_date: optionalText(form.cccdIssuedDate),
    cccd_issued_place: optionalText(form.cccdIssuedPlace),
    birth_date: optionalText(form.birthDate),
    university: optionalText(form.university),
    high_school: optionalText(form.highSchool),
    bank_account: optionalText(form.bankAccount),
    bank_qr_link: optionalText(form.bankQrLink),
    emailVerified: form.emailVerified,
  };
}
