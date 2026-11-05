import { describe, expect, it } from "vitest";
import type { MonthlyReportNewStudent } from "@/dtos/dashboard.dto";
import {
  MONTHLY_REPORT_NONE_KEY,
  buildMonthlyReportMatrix,
  countEarningNewStudents,
  formatEarlyDropBreakdown,
  formatMillions,
  formatSignedCount,
} from "./monthly-report";

describe("buildMonthlyReportMatrix", () => {
  const view = buildMonthlyReportMatrix(
    [
      { customerSource: "acquaintance", courseId: "c-basic", newCount: 1, earlyDropCount: 0, earlyDropOldCount: 0, earningCount: 1, revenue: 2_000_000 },
      { customerSource: "tiktok", courseId: "c-basic", newCount: 2, earlyDropCount: 1, earlyDropOldCount: 1, earningCount: 2, revenue: 3_500_000 },
      { customerSource: "acquaintance", courseId: null, newCount: 1, earlyDropCount: 0, earlyDropOldCount: 0, earningCount: 0, revenue: 0 },
    ],
    ["c-basic", "c-adv"],
  );

  it("orders rows by source enum, Người quen last, and appends the unplaced column", () => {
    expect(view.rowKeys).toEqual(["tiktok", "acquaintance"]);
    expect(view.columnKeys).toEqual(["c-basic", "c-adv", MONTHLY_REPORT_NONE_KEY]);
  });

  it("sums rows, columns and grand total", () => {
    expect(view.cell("tiktok", "c-basic").earlyDropCount).toBe(1);
    expect(view.cell("tiktok", "c-adv").newCount).toBe(0);
    expect(view.columnTotal("c-basic")).toMatchObject({ newCount: 3, revenue: 5_500_000 });
    expect(view.rowTotal("acquaintance").newCount).toBe(2);
    expect(view.cell("acquaintance", MONTHLY_REPORT_NONE_KEY).newCount).toBe(1);
    expect(view.grandTotal).toEqual({ newCount: 4, earlyDropCount: 1, earlyDropOldCount: 1, earningCount: 3, revenue: 5_500_000 });
    expect(view.maxCellRevenue).toBe(3_500_000);
  });

  it("omits the unplaced column when every new student has a class", () => {
    expect(buildMonthlyReportMatrix([], ["c-basic"]).columnKeys).toEqual(["c-basic"]);
  });
});

describe("monthly report formatters", () => {
  it("formats money in millions above one million", () => {
    expect(formatMillions(12_500_000)).toBe("12,5 tr");
    expect(formatMillions(500_000)).toBe("500.000 đ");
  });

  it("formats signed counts with a real minus sign", () => {
    expect(formatSignedCount(3)).toBe("+3");
    expect(formatSignedCount(-2)).toBe("−2");
    expect(formatSignedCount(0)).toBe("0");
  });

  it("splits early drops into old and trial dropped students", () => {
    expect(formatEarlyDropBreakdown(3, 2)).toBe("2 cũ · 1 thử");
    expect(formatEarlyDropBreakdown(0, 0)).toBeNull();
  });
});

describe("countEarningNewStudents", () => {
  const student = (customerSource: "tiktok" | "facebook", revenueInMonth: number) =>
    ({ customerSource, revenueInMonth }) as MonthlyReportNewStudent;

  it("counts only new students with revenue, optionally per source", () => {
    const students = [student("tiktok", 1_100_000), student("tiktok", 0), student("facebook", 500_000)];
    expect(countEarningNewStudents(students)).toBe(2);
    expect(countEarningNewStudents(students, "tiktok")).toBe(1);
  });
});
