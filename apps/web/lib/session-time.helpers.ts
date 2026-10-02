export function isSessionPaymentLockedStatus(
  status?: string | null,
): boolean {
  const paymentStatus = (status ?? "").toLowerCase();
  return paymentStatus === "paid" || paymentStatus === "deposit";
}

/** Normalize to HH:mm:ss for API comparison/submit. */
export function normalizeSessionTimeForApi(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const match = trimmed.match(/^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/);
  if (!match) return "";
  const [, hours, minutes, seconds = "00"] = match;
  return `${hours}:${minutes}:${seconds}`;
}

export function getSessionTimeSubmitError(
  startTime: string,
  endTime: string,
  options?: { required?: boolean },
): string | null {
  const start = normalizeSessionTimeForApi(startTime);
  const end = normalizeSessionTimeForApi(endTime);
  const required = options?.required !== false;
  if (!start && !end) {
    return required ? "Vui lòng nhập giờ bắt đầu và giờ kết thúc." : null;
  }
  if (!start) {
    return "Vui lòng nhập giờ bắt đầu.";
  }
  if (!end) {
    return "Vui lòng nhập giờ kết thúc.";
  }
  if (end <= start) {
    return "Giờ kết thúc phải lớn hơn giờ bắt đầu.";
  }
  return null;
}
