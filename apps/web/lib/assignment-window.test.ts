import { describe, expect, it } from "vitest";
import { refetchIntervalUntilClose } from "./assignment-window";

describe("refetchIntervalUntilClose", () => {
  const now = Date.parse("2026-10-08T08:00:00.000Z");

  it("không chờ khi đã công bố hoặc không có hạn", () => {
    expect(
      refetchIntervalUntilClose("2026-10-08T09:00:00.000Z", false, now),
    ).toBe(false);
    expect(refetchIntervalUntilClose(null, true, now)).toBe(false);
  });

  it("hạn còn xa → refetch mỗi 60s", () => {
    expect(
      refetchIntervalUntilClose("2026-10-08T09:00:00.000Z", true, now),
    ).toBe(60_000);
  });

  it("sắp tới hạn → refetch ngay sau mốc", () => {
    expect(
      refetchIntervalUntilClose("2026-10-08T08:00:10.000Z", true, now),
    ).toBe(10_500);
  });

  it("đã quá hạn mà server chưa công bố → thử lại sau 1s", () => {
    expect(
      refetchIntervalUntilClose("2026-10-08T07:59:00.000Z", true, now),
    ).toBe(1_000);
  });
});
