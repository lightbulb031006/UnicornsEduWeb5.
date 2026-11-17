import { describe, expect, it } from "vitest";
import {
  canTrainingHeadEditRoles,
  formatStaffRoleLabels,
  getManageableRoles,
  getReadOnlyRoles,
  hasAnyRoleAfterChange,
} from "./training-head-roles";

const head = { viewerStaffId: "HEAD", viewerRoles: ["training_head"] };

describe("canTrainingHeadEditRoles", () => {
  it("true với nhân sự thường", () => {
    expect(
      canTrainingHeadEditRoles({
        ...head,
        target: { id: "T1", roles: ["teacher", "sale"] },
      }),
    ).toBe(true);
  });

  it("false khi người xem không phải Trưởng ban", () => {
    expect(
      canTrainingHeadEditRoles({
        viewerStaffId: "S1",
        viewerRoles: ["training"],
        target: { id: "T1", roles: ["teacher"] },
      }),
    ).toBe(false);
  });

  it("false khi tự chỉnh chính mình", () => {
    expect(
      canTrainingHeadEditRoles({
        ...head,
        target: { id: "HEAD", roles: ["training_head", "teacher"] },
      }),
    ).toBe(false);
  });

  it.each([
    "admin",
    "sale_customer_care_head",
    "training_head",
    "lesson_plan_head",
  ])(
    "false khi target có role %s",
    (role) => {
      expect(
        canTrainingHeadEditRoles({
          ...head,
          target: { id: "T1", roles: [role, "teacher"] },
        }),
      ).toBe(false);
    },
  );
});

describe("tách role", () => {
  it("chia role quản lý được và role chỉ đọc", () => {
    const roles = ["sale", "training", "teacher"];
    expect(getManageableRoles(roles)).toEqual(["teacher", "training"]);
    expect(getReadOnlyRoles(roles)).toEqual(["sale"]);
  });

  it("hasAnyRoleAfterChange chặn bỏ hết role", () => {
    expect(hasAnyRoleAfterChange(["teacher"], [])).toBe(false);
    expect(hasAnyRoleAfterChange(["teacher", "sale"], [])).toBe(true);
    expect(hasAnyRoleAfterChange(["teacher"], ["training"])).toBe(true);
  });

  it("hasAnyRoleAfterChange cho tắt hết ba role khi còn role khác bị ẩn", () => {
    expect(hasAnyRoleAfterChange(["teacher"], [], true)).toBe(true);
    expect(hasAnyRoleAfterChange(["teacher"], [], false)).toBe(false);
  });
});

describe("formatStaffRoleLabels", () => {
  it("dùng nhãn, fallback mã role", () => {
    expect(
      formatStaffRoleLabels(["teacher", "x"], { teacher: "Giáo viên" }),
    ).toBe("Giáo viên · x");
  });
});
