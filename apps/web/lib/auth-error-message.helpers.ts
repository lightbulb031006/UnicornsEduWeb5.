import { isAxiosError } from "axios";

export const GENERIC_LOGIN_ERROR_MESSAGE = "Đăng nhập thất bại.";

/**
 * Đọc field `message` theo chuẩn NestJS exception response.
 * Nest trả string cho HttpException thường và string[] cho lỗi validation.
 */
export function nestMessageFromResponseData(data: unknown): string | null {
  if (!data || typeof data !== "object") {
    return null;
  }

  const raw = (data as { message?: unknown }).message;

  if (typeof raw === "string" && raw.trim()) {
    return raw.trim();
  }

  if (
    Array.isArray(raw) &&
    raw.every((m): m is string => typeof m === "string")
  ) {
    const joined = raw.filter(Boolean).join(" ").trim();
    if (joined) {
      return joined;
    }
  }

  return null;
}

/**
 * Chuyển lỗi đăng nhập thành thông báo tiếng Việt cho Sonner toast.
 *
 * Nguyên tắc:
 * - 4xx: ưu tiên message từ server vì đó là lỗi do người dùng nhập/thao tác.
 * - 5xx: KHÔNG hiển thị message của server ("Internal server error" vô nghĩa
 *   với người dùng cuối) và phải nói rõ đây là sự cố phía máy chủ, tránh để
 *   người dùng tưởng mình gõ sai mật khẩu.
 * - Không có `response`: request không tới được server (mất mạng, CORS,
 *   timeout, API container chết) — cũng phải phân biệt với sai mật khẩu.
 */
export function getLoginErrorToastMessage(error: unknown): string {
  if (!isAxiosError(error)) {
    return GENERIC_LOGIN_ERROR_MESSAGE;
  }

  const status = error.response?.status;

  if (status === undefined) {
    if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
      return "Máy chủ phản hồi quá lâu. Vui lòng thử lại sau ít phút.";
    }
    return "Không kết nối được tới máy chủ. Kiểm tra kết nối mạng hoặc thử lại sau ít phút.";
  }

  const serverMsg = nestMessageFromResponseData(error.response?.data);

  if (status === 400) {
    return (
      serverMsg ??
      "Dữ liệu không hợp lệ. Mật khẩu cần ít nhất 6 ký tự (theo quy định server)."
    );
  }

  if (status === 401) {
    return serverMsg ?? "Sai tài khoản hoặc mật khẩu.";
  }

  if (status === 403) {
    return serverMsg ?? "Tài khoản không có quyền đăng nhập.";
  }

  if (status === 429) {
    return (
      serverMsg ??
      "Too many requests. Bạn thao tác quá nhanh. Vui lòng đợi một chút rồi thử lại."
    );
  }

  if (status === 502 || status === 503 || status === 504) {
    return `Máy chủ đang tạm thời không phản hồi (${status}). Đây là sự cố phía hệ thống, không phải sai mật khẩu. Vui lòng thử lại sau ít phút.`;
  }

  if (status >= 500) {
    return `Máy chủ gặp lỗi khi xử lý đăng nhập (${status}). Đây là sự cố phía hệ thống, không phải sai mật khẩu. Vui lòng liên hệ quản trị viên.`;
  }

  return GENERIC_LOGIN_ERROR_MESSAGE;
}
