/**
 * Chốt `switch` đầy đủ theo union: thêm loại câu mới mà quên nhánh thì tsc báo
 * lỗi tại đây thay vì rơi im lặng vào nhánh mặc định.
 */
export function assertNever(value: never, label = "value"): never {
  throw new Error(`Unhandled ${label}: ${String(value)}`);
}
