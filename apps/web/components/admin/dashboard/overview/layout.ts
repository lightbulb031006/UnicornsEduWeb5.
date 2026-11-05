/**
 * Lưới dashboard tổng hợp — dùng chung cho page và skeleton để hai bên không lệch bố cục.
 *
 * Breakpoint là container query (`@md` 28rem, `@2xl` 42rem, `@5xl` 64rem, `@6xl` 72rem) theo
 * bề rộng khung `DASHBOARD_CONTAINER`, không theo viewport: sidebar admin chiếm ~220px nên
 * `lg:`/`xl:` của viewport chia cột khi vùng nội dung thực tế còn quá hẹp.
 */
export const DASHBOARD_CONTAINER = "@container mx-auto flex w-full max-w-[1360px] flex-col gap-4 sm:gap-5";

export const DASHBOARD_HEADER_GRID = "grid grid-cols-1 gap-4 @5xl:grid-cols-[1fr_auto_1fr] @5xl:items-center";

export const DASHBOARD_KPI_GRID = "grid grid-cols-1 gap-3 sm:gap-4 @md:grid-cols-2 @5xl:grid-cols-4";

/** Kết quả kỳ (1/3) + Cơ cấu chi phí nhân sự (2/3) từ `@5xl`; hẹp hơn thì xếp chồng full width. */
export const DASHBOARD_PERIOD_GRID = "grid grid-cols-1 gap-4 sm:gap-5 @5xl:grid-cols-3";
export const DASHBOARD_PERIOD_WIDE_SPAN = "@5xl:col-span-2";

/** Số dư · Học sinh & lớp · Nguồn khách mới: 2 cột từ `@2xl`, 3 cột từ `@6xl`. */
export const DASHBOARD_STATUS_GRID = "grid grid-cols-1 gap-4 sm:gap-5 @2xl:grid-cols-2 @6xl:grid-cols-3";
/** Panel thứ 3 khi lưới 2 cột: trải full hàng thay vì đứng lẻ cạnh ô trống. */
export const DASHBOARD_STATUS_TRAILING_SPAN = "@2xl:col-span-2 @6xl:col-span-1";
