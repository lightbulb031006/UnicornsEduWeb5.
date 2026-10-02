import type {
  CreateUserPayload,
  StaffRole,
  UserRoleType,
} from "@/dtos/user.dto";
import { splitCanonicalUserName } from "@/dtos/user-name.dto";

export const CREATE_USER_FIELD_ORDER = [
  "studentName",
  "accountHandle",
  "email",
  "password",
  "confirmPassword",
] as const;

export type CreateUserField = (typeof CREATE_USER_FIELD_ORDER)[number];

export type CreateUserFormState = Pick<
  CreateUserPayload,
  "accountHandle" | "email" | "password"
> & {
  roleType: UserRoleType;
  staffRoles: StaffRole[];
  studentName: string;
  confirmPassword: string;
  emailVerified?: boolean;
};

export type CreateUserFormErrors = Partial<Record<CreateUserField, string>>;

export const EMPTY_CREATE_USER_FORM: CreateUserFormState = {
  email: "",
  password: "",
  accountHandle: "",
  roleType: "guest",
  staffRoles: [],
  studentName: "",
  confirmPassword: "",
  emailVerified: false,
};

export function validateCreateUserForm(
  form: CreateUserFormState,
): CreateUserFormErrors {
  const errors: CreateUserFormErrors = {};
  const email = form.email.trim();

  if (form.roleType === "student" && !form.studentName.trim()) {
    errors.studentName = "Vui lòng nhập tên học sinh.";
  }
  if (!form.accountHandle.trim()) {
    errors.accountHandle = "Vui lòng nhập account handle.";
  }
  if (!email) {
    errors.email = "Vui lòng nhập email.";
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = "Email không hợp lệ.";
  }
  if (!form.password) {
    errors.password = "Vui lòng nhập mật khẩu.";
  } else if (form.password.length < 6) {
    errors.password = "Mật khẩu cần ít nhất 6 ký tự.";
  }
  if (!form.confirmPassword) {
    errors.confirmPassword = "Vui lòng nhập xác nhận mật khẩu.";
  } else if (form.password !== form.confirmPassword) {
    errors.confirmPassword = "Mật khẩu xác nhận không khớp.";
  }

  return errors;
}

export function buildCreateUserPayload(
  form: CreateUserFormState,
): CreateUserPayload {
  const payload: CreateUserPayload = {
    email: form.email.trim(),
    password: form.password,
    accountHandle: form.accountHandle.trim(),
    roleType: form.roleType,
    ...(form.emailVerified !== undefined
      ? { emailVerified: form.emailVerified }
      : {}),
    ...(form.roleType === "staff" ? { staffRoles: form.staffRoles } : {}),
  };

  if (form.roleType === "student") {
    Object.assign(payload, splitCanonicalUserName(form.studentName));
  }

  return payload;
}
