import { describe, expect, it } from "vitest";
import { staffAchievementsButtonLabel } from "./staff-achievements";

describe("staffAchievementsButtonLabel", () => {
  it("ẩn nút khi không có thành tích", () => {
    expect(staffAchievementsButtonLabel(0)).toBeNull();
    expect(staffAchievementsButtonLabel(undefined)).toBeNull();
    expect(staffAchievementsButtonLabel(null)).toBeNull();
  });

  it("ghi kèm số lượng khi có thành tích", () => {
    expect(staffAchievementsButtonLabel(1)).toBe("Xem thành tích (1)");
    expect(staffAchievementsButtonLabel(12)).toBe("Xem thành tích (12)");
  });
});
