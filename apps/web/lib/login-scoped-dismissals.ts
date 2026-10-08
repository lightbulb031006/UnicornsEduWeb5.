/** Key sessionStorage của panel nhắc CSKH điền bù lý do nghỉ ("Để sau" tới hết phiên đăng nhập). */
export const DROP_OUT_REASON_REMINDER_DISMISS_KEY = "drop-out-reason-reminder-dismissed-session";

/** Xoá các lựa chọn "Để sau" gắn với phiên đăng nhập, để lần đăng nhập sau nhắc lại. */
export function clearLoginScopedDismissals(): void {
  try {
    window.sessionStorage.removeItem(DROP_OUT_REASON_REMINDER_DISMISS_KEY);
  } catch {
    // sessionStorage có thể bị chặn (private mode); bỏ qua.
  }
}
