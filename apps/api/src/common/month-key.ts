/**
 * Khoá tháng chuẩn `YYYY-MM` (tháng có số 0 đứng đầu) dùng cho các cột text
 * `month` như bonuses, extra_allowances, cost_extend. Dashboard dựng ngày đầu
 * tháng từ các cột này nên mọi điểm ghi phải đúng định dạng.
 */
export const MONTH_KEY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export const MONTH_KEY_FORMAT_MESSAGE = 'month must be in YYYY-MM format';
