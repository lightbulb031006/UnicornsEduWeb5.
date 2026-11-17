import { describe, expect, it } from "vitest";
import {
  isTrainingHeadAttendanceTransitionAllowed,
  toTrainingHeadSessionUpdatePayload,
} from "./training-head-session-policy";

describe("Trưởng ban Đào tạo sửa buổi (14/11)", () => {
  it.each([
    ["present", "trial", true],
    ["trial", "present", true],
    ["absent", "trial", true],
    ["present", "absent", false],
    ["excused", "present", false],
  ] as const)("%s → %s: %s", (from, to, allowed) => {
    expect(isTrainingHeadAttendanceTransitionAllowed(from, to)).toBe(allowed);
  });

  it("chỉ giữ hệ số / trợ cấp / trạng thái điểm danh", () => {
    expect(
      toTrainingHeadSessionUpdatePayload({
        date: "2026-11-14",
        lessonContent: "x",
        coefficient: 0,
        allowanceAmount: 120000,
        attendance: [
          { studentId: "st1", status: "trial", notes: "giữ ở server" },
        ],
      }),
    ).toEqual({
      coefficient: 0,
      allowanceAmount: 120000,
      attendance: [{ studentId: "st1", status: "trial" }],
    });
  });

  it("bỏ hệ số ngoài 0/1, trợ cấp null và điểm danh rỗng", () => {
    expect(
      toTrainingHeadSessionUpdatePayload({
        coefficient: 1.5,
        allowanceAmount: null,
        attendance: [],
      }),
    ).toEqual({});
  });
});
