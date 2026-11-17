import { describe, expect, it } from "vitest";
import {
  buildCustomerCareReleaseConfirm,
  formatCustomerCareReleasedToast,
  isRemovingCustomerCareRole,
} from "./customer-care-role-release";

describe("customer-care-role-release (follow-up 13/11 mục 2.1)", () => {
  it("nhận diện tắt role CSKH", () => {
    expect(isRemovingCustomerCareRole(["customer_care", "sale"], ["sale"])).toBe(
      true,
    );
    expect(
      isRemovingCustomerCareRole(["customer_care"], new Set(["customer_care"])),
    ).toBe(false);
    expect(isRemovingCustomerCareRole(["sale"], [])).toBe(false);
  });

  it("chỉ hỏi xác nhận khi còn học sinh, nói rõ số học sinh", () => {
    expect(
      buildCustomerCareReleaseConfirm({ staffName: "An", studentCount: 0 }),
    ).toBeNull();
    const request = buildCustomerCareReleaseConfirm({
      staffName: "An",
      studentCount: 3,
    });
    expect(request?.variant).toBe("destructive");
    expect(String(request?.description)).toContain("3 học sinh");
    expect(
      buildCustomerCareReleaseConfirm({ staffName: "An", studentCount: null }),
    ).not.toBeNull();
  });

  it("toast số học sinh vừa mất Người chăm sóc", () => {
    expect(formatCustomerCareReleasedToast(0)).toBeNull();
    expect(formatCustomerCareReleasedToast(2)).toBe(
      "2 học sinh đã mất Người chăm sóc.",
    );
  });
});
