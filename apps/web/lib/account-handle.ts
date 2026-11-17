/**
 * Luật tên đăng nhập mới (16/11) — khớp `normalizeAccountHandle` ở API
 * (`apps/api/src/user/account-handle.ts`): 3–50 ký tự sau trim, không khoảng
 * trắng, không `@` (đăng nhập tra handle HOẶC email bằng cùng một chuỗi).
 * Kiểm trùng chỉ backend làm được.
 */
export const ACCOUNT_HANDLE_MIN_LENGTH = 3;
export const ACCOUNT_HANDLE_MAX_LENGTH = 50;

const ACCOUNT_HANDLE_PATTERN = /^[^\s@]+$/u;

export type AccountHandleValidation =
  | { ok: true; value: string }
  | { ok: false; message: string };

export function validateAccountHandle(raw: string): AccountHandleValidation {
  const value = raw.trim();
  if (
    value.length < ACCOUNT_HANDLE_MIN_LENGTH ||
    value.length > ACCOUNT_HANDLE_MAX_LENGTH
  ) {
    return {
      ok: false,
      message: `Tên đăng nhập phải dài ${ACCOUNT_HANDLE_MIN_LENGTH}–${ACCOUNT_HANDLE_MAX_LENGTH} ký tự.`,
    };
  }
  if (!ACCOUNT_HANDLE_PATTERN.test(value)) {
    return {
      ok: false,
      message: "Tên đăng nhập không được chứa khoảng trắng hoặc ký tự @.",
    };
  }
  return { ok: true, value };
}
