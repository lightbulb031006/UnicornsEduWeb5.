import * as authApi from "@/lib/apis/auth.api";

/** Cache hồ sơ đầy đủ dùng chung cho trang `/user-profile` và popup hồ sơ. */
export const PROFILE_FULL_QUERY_KEY = ["profile", "full"] as const;

/** Cache hồ sơ đầy đủ mà các shell (avatar/tên) và gate đọc; editor ghi đè sau mỗi lần lưu. */
export const AUTH_FULL_PROFILE_QUERY_KEY = ["auth", "full-profile"] as const;

/** Không thử lại khi 401 (hết phiên); lỗi khác thử tối đa 2 lần. */
export function retryUnlessUnauthorized(
  failureCount: number,
  error: unknown,
): boolean {
  const status = (error as { response?: { status?: number } })?.response
    ?.status;
  if (status === 401) return false;
  return failureCount < 2;
}

export const profileFullQueryOptions = {
  queryKey: PROFILE_FULL_QUERY_KEY,
  queryFn: authApi.getFullProfile,
  retry: retryUnlessUnauthorized,
};

type LinkClickLike = {
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  defaultPrevented: boolean;
};

/**
 * Bấm link trong popup có điều hướng ngay trong tab hiện tại không (để đóng popup).
 * Bấm chuột giữa / giữ phím bổ trợ / `target="_blank"` mở tab mới nên giữ popup.
 */
export function isSameTabNavigation(
  event: LinkClickLike,
  anchorTarget: string | null,
): boolean {
  if (event.defaultPrevented || event.button !== 0) return false;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return false;
  }
  return !anchorTarget || anchorTarget === "_self";
}
