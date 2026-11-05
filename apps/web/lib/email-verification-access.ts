import type { UserInfoDto } from "@/dtos/Auth.dto";

export const OPEN_EMAIL_VERIFICATION_MODAL_EVENT =
  "ue:open-email-verification-modal";

/** Khoảng chờ giữa hai lần gửi mail xác minh. */
export const EMAIL_VERIFICATION_RESEND_COOLDOWN_MS = 60_000;

/**
 * Cách mở popup xác minh email:
 * - `send`: người dùng vừa bấm Xác minh / Đăng nhập → gửi mail ngay, không cần bấm lần hai.
 * - `status`: bị chặn khi vào trang cần email đã xác minh → hiện màn «đã gửi»
 *   nếu phiên này đã gửi, còn không thì hiện nút gửi.
 * - `sent`: nơi khác đã gửi xong → chỉ hiện màn «đã gửi».
 */
export type EmailVerificationModalRequest =
  | { kind: "send" }
  | { kind: "status" }
  | { kind: "sent"; email: string };

export function openEmailVerificationModal(
  request: EmailVerificationModalRequest,
) {
  window.dispatchEvent(
    new CustomEvent<EmailVerificationModalRequest>(
      OPEN_EMAIL_VERIFICATION_MODAL_EVENT,
      { detail: request },
    ),
  );
}

export function isAuthenticatedUser(user: UserInfoDto) {
  return Boolean(user.id && user.accountHandle);
}

export function isRestrictedByEmailVerification(user: UserInfoDto) {
  if (!isAuthenticatedUser(user)) {
    return false;
  }

  return user.canAccessRestrictedRoutes === false;
}

export function maskEmailAddress(email: string) {
  const normalizedEmail = email.trim();
  const [localPart = "", domainPart = ""] = normalizedEmail.split("@");
  if (!localPart || !domainPart) {
    return normalizedEmail;
  }

  const tail = localPart.slice(-4);
  return `...${tail}@${domainPart}`;
}

const SENT_RECORD_STORAGE_KEY = "ue:email-verification-sent";

export type EmailVerificationSentRecord = {
  userId: string;
  email: string;
  sentAt: number;
};

/** Lần gửi gần nhất trong phiên trình duyệt (để giữ cooldown khi chuyển trang). */
export function readEmailVerificationSentRecord(
  userId: string,
): EmailVerificationSentRecord | null {
  try {
    const raw = window.sessionStorage.getItem(SENT_RECORD_STORAGE_KEY);
    if (!raw) return null;
    const record = JSON.parse(raw) as Partial<EmailVerificationSentRecord>;
    if (
      record.userId !== userId ||
      typeof record.email !== "string" ||
      typeof record.sentAt !== "number"
    ) {
      return null;
    }
    return record as EmailVerificationSentRecord;
  } catch {
    return null;
  }
}

export function writeEmailVerificationSentRecord(
  record: EmailVerificationSentRecord,
) {
  try {
    window.sessionStorage.setItem(
      SENT_RECORD_STORAGE_KEY,
      JSON.stringify(record),
    );
  } catch {
    // Không lưu được thì cooldown chỉ sống trong bộ nhớ của popup.
  }
}
