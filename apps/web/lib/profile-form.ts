import { Role, type UserInfoDto } from "@/dtos/Auth.dto";
import type {
  FullProfileDto,
  UpdateMyProfileDto,
  UpdateMyStaffProfileDto,
  UpdateMyStudentProfileDto,
} from "@/dtos/profile.dto";
import {
  getStaffAchievementGap,
  type StaffAchievementGap,
} from "@/lib/staff-achievement-requirement";

const STAFF_ACHIEVEMENT_GAP_MESSAGES: Record<
  NonNullable<StaffAchievementGap>,
  string
> = {
  achievement: "Gia sư cần có ít nhất 1 thành tích.",
  highlight: "Gia sư cần bấm ngôi sao để chọn 1 thành tích nổi bật.",
  highlightProof: "Tải ảnh minh chứng cho thành tích nổi bật.",
};

/**
 * Form hồ sơ của chính người dùng, lưu bằng một nút "Lưu" chung.
 * Chỉ **Trường bắt buộc (hồ sơ nhân sự)** (xem `CONTEXT.md`) được báo thiếu; khớp
 * gate `isStaffProfileComplete` trong `proxy.ts`. Hồ sơ học viên không có trường bắt buộc.
 */

export type ProfileFormGroup = "account" | "staff" | "student";

/**
 * Ô trống khi lưu:
 * - `empty-string`: gửi chuỗi rỗng (xoá giá trị).
 * - `null`: gửi `null` (API nhận null để xoá, ví dụ email phụ huynh).
 * - `keep`: API không nhận giá trị rỗng, không gửi; nếu không phải trường bắt buộc thì chặn lưu.
 */
export type ProfileEmptyPolicy = "empty-string" | "null" | "keep";

export type ProfileFieldDef = {
  key: string;
  group: ProfileFormGroup;
  apiKey: string;
  label: string;
  emptyPolicy: ProfileEmptyPolicy;
  /** Thuộc gate hồ sơ nhân sự: chỉ bắt buộc khi người dùng có `staffInfo`. */
  requiredForStaff?: boolean;
  validate?: (value: string) => string | null;
  toPayload?: (value: string) => unknown;
};

export type ProfileFormValues = Record<string, string>;

/** Khoá giả cho trường bắt buộc không nằm trong form Lưu chung. */
export const AVATAR_FIELD_KEY = "avatar";
export const DATA_CONSENT_FIELD_KEY = "dataConsent";
export const ACHIEVEMENTS_FIELD_KEY = "achievements";

export type ProfileFieldError = { kind: "missing" | "invalid"; message: string };

export type ProfileFormValidation = {
  errors: Record<string, ProfileFieldError>;
  /** Khoá có lỗi theo thứ tự hiển thị trên trang (để cuộn tới ô đầu tiên). */
  orderedKeys: string[];
  missingCount: number;
  hasBlockingError: boolean;
};

export type ProfilePatches = {
  account?: UpdateMyProfileDto;
  staff?: UpdateMyStaffProfileDto;
  student?: UpdateMyStudentProfileDto;
};

const MISSING_MESSAGE = "Không được để trống.";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateEmail(value: string): string | null {
  return EMAIL_PATTERN.test(value) ? null : "Email không hợp lệ.";
}

function validateCccd(value: string): string | null {
  return /^\d{12}$/.test(value) ? null : "Số CCCD phải gồm đúng 12 chữ số.";
}

function validateHttpUrl(value: string): string | null {
  return /^https?:\/\/\S+$/i.test(value)
    ? null
    : "Link phải bắt đầu bằng http:// hoặc https://.";
}

/** Năm sinh phải là số nguyên trong [1900, `currentYear`]; trả thông báo lỗi hoặc `null`. */
export function validateBirthYear(
  raw: string,
  currentYear: number,
): string | null {
  const year = Number(raw);
  if (!Number.isInteger(year) || year < 1900 || year > currentYear) {
    return `Năm sinh phải là số nguyên từ 1900 đến ${currentYear}.`;
  }
  return null;
}

/** `YYYY-MM-DD` cho ô ngày từ ISO đã lưu; rỗng nếu không có hoặc không hợp lệ. */
export function toDateInputValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function toText(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

const ACCOUNT_FIELDS: ProfileFieldDef[] = [
  { key: "account.first_name", group: "account", apiKey: "first_name", label: "Tên", emptyPolicy: "keep", requiredForStaff: true },
  { key: "account.last_name", group: "account", apiKey: "last_name", label: "Họ và tên đệm", emptyPolicy: "empty-string", requiredForStaff: true },
  { key: "account.email", group: "account", apiKey: "email", label: "Email", emptyPolicy: "keep", requiredForStaff: true, validate: validateEmail },
  { key: "account.phone", group: "account", apiKey: "phone", label: "Số điện thoại", emptyPolicy: "empty-string", requiredForStaff: true },
  { key: "account.accountHandle", group: "account", apiKey: "accountHandle", label: "Handle", emptyPolicy: "keep" },
  { key: "account.province", group: "account", apiKey: "province", label: "Tỉnh / Thành phố", emptyPolicy: "empty-string", requiredForStaff: true },
];

const STAFF_FIELDS: ProfileFieldDef[] = [
  { key: "staff.cccd_number", group: "staff", apiKey: "cccd_number", label: "Số CCCD", emptyPolicy: "keep", requiredForStaff: true, validate: validateCccd },
  { key: "staff.ethnicity", group: "staff", apiKey: "ethnicity", label: "Dân tộc", emptyPolicy: "empty-string", requiredForStaff: true },
  { key: "staff.gender", group: "staff", apiKey: "gender", label: "Giới tính", emptyPolicy: "keep", requiredForStaff: true },
  { key: "staff.current_address", group: "staff", apiKey: "current_address", label: "Địa chỉ hiện tại", emptyPolicy: "empty-string", requiredForStaff: true },
  { key: "staff.cccd_issued_date", group: "staff", apiKey: "cccd_issued_date", label: "Ngày cấp CCCD", emptyPolicy: "keep", requiredForStaff: true },
  { key: "staff.cccd_issued_place", group: "staff", apiKey: "cccd_issued_place", label: "Nơi cấp CCCD", emptyPolicy: "empty-string", requiredForStaff: true },
  { key: "staff.birth_date", group: "staff", apiKey: "birth_date", label: "Ngày sinh", emptyPolicy: "keep", requiredForStaff: true },
  { key: "staff.university", group: "staff", apiKey: "university", label: "Trường đại học", emptyPolicy: "empty-string", requiredForStaff: true },
  { key: "staff.high_school", group: "staff", apiKey: "high_school", label: "Trường THPT", emptyPolicy: "empty-string", requiredForStaff: true },
  { key: "staff.bank_account", group: "staff", apiKey: "bank_account", label: "Số tài khoản", emptyPolicy: "empty-string", requiredForStaff: true },
  { key: "staff.bank_qr_link", group: "staff", apiKey: "bank_qr_link", label: "Link QR ngân hàng", emptyPolicy: "empty-string", requiredForStaff: true, validate: validateHttpUrl },
];

const STUDENT_FIELDS: ProfileFieldDef[] = [
  { key: "student.full_name", group: "student", apiKey: "full_name", label: "Họ tên", emptyPolicy: "keep" },
  { key: "student.email", group: "student", apiKey: "email", label: "Email", emptyPolicy: "keep", validate: validateEmail },
  { key: "student.school", group: "student", apiKey: "school", label: "Trường", emptyPolicy: "empty-string" },
  { key: "student.province", group: "student", apiKey: "province", label: "Tỉnh / Thành phố", emptyPolicy: "empty-string" },
  {
    key: "student.birth_year",
    group: "student",
    apiKey: "birth_year",
    label: "Năm sinh",
    emptyPolicy: "keep",
    validate: (value) => validateBirthYear(value, new Date().getFullYear()),
    toPayload: Number,
  },
  { key: "student.gender", group: "student", apiKey: "gender", label: "Giới tính", emptyPolicy: "keep" },
  { key: "student.parent_name", group: "student", apiKey: "parent_name", label: "Phụ huynh", emptyPolicy: "empty-string" },
  { key: "student.parent_phone", group: "student", apiKey: "parent_phone", label: "SĐT phụ huynh", emptyPolicy: "empty-string" },
  { key: "student.parent_email", group: "student", apiKey: "parent_email", label: "Email phụ huynh", emptyPolicy: "null", validate: validateEmail },
  { key: "student.goal", group: "student", apiKey: "goal", label: "Mục tiêu học tập", emptyPolicy: "empty-string" },
];

/** id DOM của ô nhập, dùng cho `<label htmlFor>` và cuộn tới ô lỗi. */
export function getProfileFieldDomId(key: string): string {
  if (key === AVATAR_FIELD_KEY) return "profile-avatar-upload";
  if (key === DATA_CONSENT_FIELD_KEY) return "profile-data-consent";
  if (key === ACHIEVEMENTS_FIELD_KEY) return "profile-staff-achievements";
  return `profile-field-${key.replace(".", "-")}`;
}

/** Các trường áp dụng cho hồ sơ này, theo thứ tự hiển thị. */
export function getProfileFormFields(profile: FullProfileDto): ProfileFieldDef[] {
  return [
    ...ACCOUNT_FIELDS,
    ...(profile.staffInfo ? STAFF_FIELDS : []),
    ...(profile.studentInfo ? STUDENT_FIELDS : []),
  ];
}

export function getProfileFormValues(profile: FullProfileDto): ProfileFormValues {
  const staff = profile.staffInfo;
  const student = profile.studentInfo;
  const values: ProfileFormValues = {
    "account.first_name": toText(profile.first_name),
    "account.last_name": toText(profile.last_name),
    "account.email": toText(profile.email),
    "account.phone": toText(profile.phone),
    "account.accountHandle": toText(profile.accountHandle),
    "account.province": toText(profile.province),
  };
  if (staff) {
    Object.assign(values, {
      "staff.cccd_number": toText(staff.cccdNumber),
      "staff.ethnicity": toText(staff.ethnicity),
      "staff.gender": toText(staff.gender),
      "staff.current_address": toText(staff.currentAddress),
      "staff.cccd_issued_date": toDateInputValue(staff.cccdIssuedDate),
      "staff.cccd_issued_place": toText(staff.cccdIssuedPlace),
      "staff.birth_date": toDateInputValue(staff.birthDate),
      "staff.university": toText(staff.university),
      "staff.high_school": toText(staff.highSchool),
      "staff.bank_account": toText(staff.bankAccount),
      "staff.bank_qr_link": toText(staff.bankQrLink),
    });
  }
  if (student) {
    Object.assign(values, {
      "student.full_name": toText(student.fullName),
      "student.email": toText(student.email),
      "student.school": toText(student.school),
      "student.province": toText(student.province),
      "student.birth_year": toText(student.birthYear),
      "student.gender": toText(student.gender),
      "student.parent_name": toText(student.parentName),
      "student.parent_phone": toText(student.parentPhone),
      "student.parent_email": toText(student.parentEmail),
      "student.goal": toText(student.goal),
    });
  }
  return values;
}

function isChanged(saved: ProfileFormValues, values: ProfileFormValues, key: string) {
  return (values[key] ?? "").trim() !== (saved[key] ?? "");
}

export function isProfileFormDirty(
  saved: ProfileFormValues,
  values: ProfileFormValues,
): boolean {
  return Object.keys(saved).some((key) => isChanged(saved, values, key));
}

/**
 * Khi giá trị đã lưu đổi (lưu xong, refetch): ô người dùng chưa sửa nhận giá trị mới,
 * ô đang sửa giữ nguyên để không mất thay đổi chưa lưu.
 */
export function rebaseProfileFormValues(
  current: ProfileFormValues,
  previousSaved: ProfileFormValues,
  nextSaved: ProfileFormValues,
): ProfileFormValues {
  const next: ProfileFormValues = {};
  for (const key of Object.keys(nextSaved)) {
    const untouched =
      !(key in current) || current[key].trim() === (previousSaved[key] ?? "");
    next[key] = untouched ? nextSaved[key] : current[key];
  }
  return next;
}

function hasStoredAvatar(profile: FullProfileDto): boolean {
  const avatarPath = (profile as FullProfileDto & { avatarPath?: string | null })
    .avatarPath;
  return Boolean(avatarPath || profile.avatarUrl);
}

function hasAcceptedDataConsent(profile: FullProfileDto): boolean {
  return Boolean(
    profile.dataConsentAcceptedAt && profile.requiresStaffDataConsent !== true,
  );
}

/**
 * Lỗi của form: thiếu trường bắt buộc (không chặn lưu) và lỗi định dạng / ô không được
 * xoá (chặn lưu). Avatar và điều khoản dữ liệu lấy từ trạng thái đã lưu.
 */
export function validateProfileForm(
  profile: FullProfileDto,
  values: ProfileFormValues,
): ProfileFormValidation {
  const isStaff = Boolean(profile.staffInfo);
  const errors: Record<string, ProfileFieldError> = {};
  const orderedKeys: string[] = [];
  const add = (key: string, error: ProfileFieldError) => {
    errors[key] = error;
    orderedKeys.push(key);
  };

  const checkFields = (fields: ProfileFieldDef[]) => {
    for (const field of fields) {
      const value = (values[field.key] ?? "").trim();
      if (!value) {
        if (isStaff && field.requiredForStaff) {
          add(field.key, { kind: "missing", message: MISSING_MESSAGE });
        } else if (field.emptyPolicy === "keep") {
          add(field.key, { kind: "invalid", message: MISSING_MESSAGE });
        }
        continue;
      }
      const message = field.validate?.(value);
      if (message) add(field.key, { kind: "invalid", message });
    }
  };

  // Thứ tự khớp trang: avatar, tài khoản, nhân sự, điều khoản dữ liệu, học viên.
  if (isStaff && !hasStoredAvatar(profile)) {
    add(AVATAR_FIELD_KEY, { kind: "missing", message: "Cần có ảnh đại diện." });
  }
  checkFields(ACCOUNT_FIELDS);
  if (isStaff) {
    checkFields(STAFF_FIELDS);
    const achievementGap = getStaffAchievementGap(profile.staffInfo);
    if (achievementGap) {
      add(ACHIEVEMENTS_FIELD_KEY, {
        kind: "missing",
        message: STAFF_ACHIEVEMENT_GAP_MESSAGES[achievementGap],
      });
    }
    if (!hasAcceptedDataConsent(profile)) {
      add(DATA_CONSENT_FIELD_KEY, {
        kind: "missing",
        message: "Cần xác nhận điều khoản dữ liệu cá nhân.",
      });
    }
  }
  if (profile.studentInfo) checkFields(STUDENT_FIELDS);

  const keys = Object.values(errors);
  return {
    errors,
    orderedKeys,
    missingCount: keys.filter((error) => error.kind === "missing").length,
    hasBlockingError: keys.some((error) => error.kind === "invalid"),
  };
}

/** Payload theo nhóm, chỉ gồm trường đã đổi; ô `keep` để trống thì không gửi. */
export function buildProfilePatches(
  profile: FullProfileDto,
  saved: ProfileFormValues,
  values: ProfileFormValues,
): ProfilePatches {
  const patches: Record<ProfileFormGroup, Record<string, unknown>> = {
    account: {},
    staff: {},
    student: {},
  };
  for (const field of getProfileFormFields(profile)) {
    if (!isChanged(saved, values, field.key)) continue;
    const value = (values[field.key] ?? "").trim();
    let payload: unknown;
    if (value) {
      payload = field.toPayload ? field.toPayload(value) : value;
    } else if (field.emptyPolicy === "keep") {
      continue;
    } else {
      payload = field.emptyPolicy === "null" ? null : "";
    }
    patches[field.group][field.apiKey] = payload;
  }
  const result: ProfilePatches = {};
  for (const group of ["account", "staff", "student"] as const) {
    if (Object.keys(patches[group]).length) {
      (result as Record<string, unknown>)[group] = patches[group];
    }
  }
  return result;
}

/** Đích nút "Quay lại": `from` nếu là path nội bộ an toàn, không thì `fallback`. */
export function resolveProfileBackHref(
  from: string | null | undefined,
  fallback: string,
): string {
  // Chỉ path nội bộ: chặn `//host` và `/\host` (trình duyệt hiểu là URL tuyệt đối).
  if (!from || !/^\/(?![/\\])/.test(from)) return fallback;
  if (from.startsWith("/user-profile")) return fallback;
  return from;
}

/**
 * "Quay lại" về staff/admin shell sẽ bị gate hồ sơ nhân sự đẩy ngược về `/user-profile`
 * (vòng lặp) khi session báo hồ sơ chưa đủ. Admin full được bypass gate (như `proxy.ts`).
 */
export function isProfileBackBlockedByGate(
  session: UserInfoDto,
  backHref: string,
): boolean {
  const pathname = backHref.split(/[?#]/, 1)[0];
  if (!/^\/(staff|admin)(\/|$)/.test(pathname)) return false;
  if (!(session.access?.staff?.canAccess ?? session.hasStaffProfile)) return false;
  if (
    session.roleType === Role.admin ||
    session.access?.admin?.tier === "full" ||
    session.effectiveRoleTypes?.includes(Role.admin)
  ) {
    return false;
  }
  const profileComplete =
    session.access?.staff?.profileComplete ?? session.staffProfileComplete;
  return profileComplete === false;
}
