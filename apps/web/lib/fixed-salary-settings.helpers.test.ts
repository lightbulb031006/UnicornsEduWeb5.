import { describe, expect, it } from "vitest";
import type { StaffFixedSalaryRoleRow } from "@/dtos/fixed-salary-settings.dto";
import {
  FIXED_SALARY_STAFF_ROLES,
  isFixedSalaryStaffRole,
} from "@/dtos/fixed-salary-settings.dto";
import {
  collectDisabledRoleOverrideWarnings,
  formatDisabledRoleOverrideWarningLine,
  LOCKED_FIXED_SALARY_MONTH_NOTE,
  buildRolePolicySaveFeedback,
} from "./fixed-salary-settings.helpers";

const ROLE_LABELS = { assistant: "Trợ lí", communication: "Truyền thông" };

function axis(params: {
  hasOverride: boolean;
  overrideValue?: number | null;
}): StaffFixedSalaryRoleRow["amount"] {
  return {
    applied: params.overrideValue ?? null,
    source: params.hasOverride ? "override" : "unconfigured",
    hasOverride: params.hasOverride,
    overrideValue: params.hasOverride ? (params.overrideValue ?? 0) : null,
    roleDefaultValue: null,
  };
}

describe("FIXED_SALARY_STAFF_ROLES", () => {
  it("does not include teacher", () => {
    expect(isFixedSalaryStaffRole("teacher")).toBe(false);
    expect(FIXED_SALARY_STAFF_ROLES).not.toContain("teacher");
    expect(isFixedSalaryStaffRole("assistant")).toBe(true);
  });
});

describe("collectDisabledRoleOverrideWarnings", () => {
  it("asks only when a currently held role with a persisted override is turned off", () => {
    const roleRows: StaffFixedSalaryRoleRow[] = [
      {
        roleType: "assistant",
        amount: axis({ hasOverride: true, overrideValue: 12_000_000 }),
        operatingRate: axis({ hasOverride: true, overrideValue: 15 }),
      },
      {
        roleType: "communication",
        amount: axis({ hasOverride: false }),
        operatingRate: axis({ hasOverride: false }),
      },
    ];

    const warnings = collectDisabledRoleOverrideWarnings({
      originalRoles: ["assistant", "communication"],
      nextRoles: ["communication"],
      roleRows,
      roleLabels: ROLE_LABELS,
    });

    expect(warnings).toEqual([
      {
        roleType: "assistant",
        roleLabel: "Trợ lí",
        hasAmountOverride: true,
        hasRateOverride: true,
        amountOverride: 12_000_000,
        operatingRateOverride: 15,
      },
    ]);
    expect(formatDisabledRoleOverrideWarningLine(warnings[0])).toBe(
      "Tắt vai trò Trợ lí sẽ xóa mức đè lương cứng 12.000.000đ và % vận hành 15%.",
    );
    expect(LOCKED_FIXED_SALARY_MONTH_NOTE).toContain("đã chốt");
  });

  it("does not ask when the disabled role has no override on either axis", () => {
    const warnings = collectDisabledRoleOverrideWarnings({
      originalRoles: ["assistant"],
      nextRoles: [],
      roleRows: [
        {
          roleType: "assistant",
          amount: axis({ hasOverride: false }),
          operatingRate: axis({ hasOverride: false }),
        },
      ],
      roleLabels: ROLE_LABELS,
    });

    expect(warnings).toEqual([]);
  });

  it("still asks when only one axis has an override, including intentional 0", () => {
    const warnings = collectDisabledRoleOverrideWarnings({
      originalRoles: ["assistant"],
      nextRoles: [],
      roleRows: [
        {
          roleType: "assistant",
          amount: axis({ hasOverride: true, overrideValue: 0 }),
          operatingRate: axis({ hasOverride: false }),
        },
      ],
      roleLabels: ROLE_LABELS,
    });

    expect(warnings).toHaveLength(1);
    expect(formatDisabledRoleOverrideWarningLine(warnings[0])).toBe(
      "Tắt vai trò Trợ lí sẽ xóa mức đè lương cứng 0đ và % vận hành không có mức đè.",
    );
  });
});

describe("buildRolePolicySaveFeedback", () => {
  it("reports full success only when both axes saved", () => {
    expect(
      buildRolePolicySaveFeedback({ status: "saved" }, { status: "saved" }),
    ).toEqual({
      type: "success",
      message: "Đã lưu mức lương và % vận hành.",
    });
  });

  it("keeps the saved axis visible when the other axis fails", () => {
    expect(
      buildRolePolicySaveFeedback(
        { status: "saved" },
        { status: "failed", message: "mạng lỗi" },
      ),
    ).toEqual({
      type: "error",
      message: "Đã lưu mức lương. Chưa lưu được % vận hành: mạng lỗi",
    });
    expect(
      buildRolePolicySaveFeedback(
        { status: "failed", message: "số không hợp lệ" },
        { status: "saved" },
      ),
    ).toEqual({
      type: "error",
      message: "Đã lưu % vận hành. Chưa lưu được mức lương: số không hợp lệ",
    });
  });

  it("does not claim a save when both axes fail", () => {
    expect(
      buildRolePolicySaveFeedback(
        { status: "failed", message: "lương lỗi" },
        { status: "failed", message: "% lỗi" },
      ),
    ).toEqual({
      type: "error",
      message: "Chưa lưu được mức lương (lương lỗi) và % vận hành (% lỗi).",
    });
  });
});
