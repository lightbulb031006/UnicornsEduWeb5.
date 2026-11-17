import { describe, expect, it } from "vitest";
import { resolveLessonOutputPricingLock } from "./lesson-output-pricing-access";

const base = {
  isAdmin: false,
  canManage: false,
  viewerStaffId: "staff-me",
  outputStaffId: "staff-me",
  paymentStatus: "pending" as const,
};

describe("tự khai chi phí giáo án (follow-up grill 13/11)", () => {
  it("người nhận thanh toán tự khai output chưa thanh toán của mình", () => {
    expect(resolveLessonOutputPricingLock(base)).toBeNull();
  });

  it("Trưởng ban sửa output của người khác khi chưa thanh toán", () => {
    expect(
      resolveLessonOutputPricingLock({
        ...base,
        canManage: true,
        outputStaffId: "staff-other",
      }),
    ).toBeNull();
  });

  it("Ban Chuyên môn thường không sửa output của người khác", () => {
    expect(
      resolveLessonOutputPricingLock({ ...base, outputStaffId: "staff-other" }),
    ).toBe("not_owner");
    expect(
      resolveLessonOutputPricingLock({ ...base, viewerStaffId: null }),
    ).toBe("not_owner");
  });

  it("output đã thanh toán khoá với mọi người trừ Admin", () => {
    expect(
      resolveLessonOutputPricingLock({ ...base, paymentStatus: "paid" }),
    ).toBe("paid");
    expect(
      resolveLessonOutputPricingLock({
        ...base,
        canManage: true,
        paymentStatus: "paid",
      }),
    ).toBe("paid");
    expect(
      resolveLessonOutputPricingLock({
        ...base,
        isAdmin: true,
        outputStaffId: "staff-other",
        paymentStatus: "paid",
      }),
    ).toBeNull();
  });
});
