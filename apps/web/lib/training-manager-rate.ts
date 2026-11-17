/** % QLL hợp lệ: 0 < % ≤ 100, tối đa 2 chữ số thập phân (khớp `DECIMAL(5,2)` BE). Sai → null. */
export function parseTrainingManagerRatePercent(raw: string): number | null {
  const normalized = raw.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const value = Number(normalized);
  return value > 0 && value <= 100 ? value : null;
}

/** Giá trị điền sẵn vào ô sửa: `2.5` → «2,5» (cùng dấu thập phân với chỗ hiển thị). */
export function toTrainingManagerRateDraft(value: number): string {
  return value.toLocaleString("vi-VN", {
    maximumFractionDigits: 2,
    useGrouping: false,
  });
}

/** `3` → «3%», `2.5` → «2,5%» (bỏ số 0 thừa, dấu thập phân kiểu Việt). */
export function formatTrainingManagerRatePercent(value: number): string {
  return `${value.toLocaleString("vi-VN", { maximumFractionDigits: 2 })}%`;
}
