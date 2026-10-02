import { describe, expect, it, vi } from "vitest";
import {
  CLASS_PRICING_MODE_CHANGE_CONFIRM,
  classRateFieldLabels,
  compactTuitionChargeLine,
  convertDisplayedRateInput,
  displayedClassRate,
  explainMissingStandardBlocks,
  formatSessionEquivalentLine,
  formatStandardBlockSummary,
  perSessionToPerBlock,
  requestClassPricingModeChange,
  standardBlockCountFromSlots,
  toPerBlockTuitionForApi,
  toPerSessionAmountForApi,
  toPerSessionMaxAllowanceForApi,
} from "./class-pricing-mode";
import { compactTuitionPerSessionLine } from "./class.helpers";

describe("class pricing mode UI (#137)", () => {
  it("defaults labels to the existing per-session copy", () => {
    expect(classRateFieldLabels("per_session")).toEqual({
      allowance: "Trợ cấp / HV / buổi",
      maxAllowance: "Trợ cấp tối đa / buổi",
      tuition: "Học phí / HV / buổi",
    });
  });

  it("switches rate labels and units to / 30 phút in block mode", () => {
    expect(classRateFieldLabels("per_block")).toEqual({
      allowance: "Trợ cấp / HV / 30 phút",
      maxAllowance: "Trợ cấp tối đa / 30 phút",
      tuition: "Học phí / HV / 30 phút",
    });
  });

  it("shows standard block count and the equivalent amount for the conversion unit", () => {
    expect(standardBlockCountFromSlots([{ from: "19:00:00", to: "20:30:00" }])).toBe(3);
    expect(formatStandardBlockSummary(3)).toContain("Số block chuẩn: 3");
    expect(formatStandardBlockSummary(3)).toContain("mốc quy đổi 90 phút");
    expect(formatSessionEquivalentLine("Trợ cấp / HV", 30000, 3)).toContain("30.000");
    expect(formatSessionEquivalentLine("Trợ cấp / HV", 30000, 3)).toContain("90.000");
    expect(formatSessionEquivalentLine("Trợ cấp / HV", 30000, 3)).toContain("90 phút");
  });

  it("allows slots of different lengths, converting on the greatest common block count", () => {
    // UNICL-37f607c5df: CN 2h, T7 4h, T4 1h → 4, 8, 2 block → mốc quy đổi 2 block.
    expect(
      standardBlockCountFromSlots([
        { from: "09:00:00", to: "11:00:00" },
        { from: "13:00:00", to: "17:00:00" },
        { from: "14:00:00", to: "15:00:00" },
      ]),
    ).toBe(2);
    // Lịch đồng nhất vẫn giữ nguyên kết quả cũ.
    expect(
      standardBlockCountFromSlots([
        { from: "19:00:00", to: "20:30:00" },
        { from: "09:00:00", to: "10:30:00" },
      ]),
    ).toBe(3);
  });

  it("states the unpaid-session recalculation scope in the confirm copy", () => {
    expect(CLASS_PRICING_MODE_CHANGE_CONFIRM).toContain("buổi chưa thanh toán");
    expect(CLASS_PRICING_MODE_CHANGE_CONFIRM).toContain("đã thanh toán");
    expect(CLASS_PRICING_MODE_CHANGE_CONFIRM).toContain("cọc");
  });

  it("blocks enabling per_block when the class has no standard block count, with a specific reason", () => {
    expect(explainMissingStandardBlocks([])).toContain("chưa có lịch cố định");
    expect(
      explainMissingStandardBlocks([{ from: "19:00:00", to: "20:15:00" }]),
    ).toContain("không phải bội số 30 phút");

    const blocked = requestClassPricingModeChange({
      current: "per_session",
      next: "per_block",
      standardBlockCount: null,
      missingReason: explainMissingStandardBlocks([]),
      requireConfirm: true,
      confirm: () => true,
    });
    expect(blocked).toEqual({
      ok: false,
      reason: explainMissingStandardBlocks([]),
    });
  });

  it("requires confirmation before changing mode on an existing class", () => {
    const confirm = vi.fn(() => false);
    expect(
      requestClassPricingModeChange({
        current: "per_session",
        next: "per_block",
        standardBlockCount: 3,
        missingReason: "",
        requireConfirm: true,
        confirm,
      }),
    ).toEqual({ ok: false, reason: CLASS_PRICING_MODE_CHANGE_CONFIRM });
    expect(confirm).toHaveBeenCalledOnce();

    expect(
      requestClassPricingModeChange({
        current: "per_session",
        next: "per_block",
        standardBlockCount: 3,
        missingReason: "",
        requireConfirm: true,
        confirm: () => true,
      }),
    ).toEqual({ ok: true, next: "per_block" });
  });

  it("regression: per_session API amounts stay identical to the typed per-session values", () => {
    expect(
      toPerSessionAmountForApi({
        mode: "per_session",
        displayedAmount: 180000,
        standardBlockCount: 3,
      }),
    ).toBe(180000);
    expect(
      toPerSessionMaxAllowanceForApi({
        mode: "per_session",
        displayedAmount: 500000,
        standardBlockCount: 3,
      }),
    ).toBe(500000);
    expect(
      displayedClassRate({
        mode: "per_session",
        perSession: 180000,
        perBlock: 60000,
        standardBlockCount: 3,
      }),
    ).toBe(180000);
    expect(convertDisplayedRateInput({
      input: "180.000",
      from: "per_session",
      to: "per_session",
      standardBlockCount: 3,
    })).toBe("180.000");
    const perSessionLine = compactTuitionPerSessionLine("1.080.000", "6");
    expect(perSessionLine).toMatch(/180\.000.+\/buổi$/);
    expect(
      compactTuitionChargeLine({
        mode: "per_session",
        totalInput: "1.080.000",
        sessionsInput: "6",
        standardBlockCount: 3,
        perSessionLine,
      }),
    ).toBe(perSessionLine);
  });

  it("converts block-mode input to per-session for the existing API contract", () => {
    expect(perSessionToPerBlock(90000, 3)).toBe(30000);
    expect(
      toPerSessionAmountForApi({
        mode: "per_block",
        displayedAmount: 30000,
        standardBlockCount: 3,
      }),
    ).toBe(90000);
    expect(
      displayedClassRate({
        mode: "per_block",
        perSession: 90000,
        perBlock: 30000,
        standardBlockCount: 3,
      }),
    ).toBe(30000);
    expect(
      compactTuitionChargeLine({
        mode: "per_block",
        totalInput: "1.080.000",
        sessionsInput: "6",
        standardBlockCount: 3,
        perSessionLine: compactTuitionPerSessionLine("1.080.000", "6"),
      }),
    ).toContain("3 block");
  });

  it("sends typed / 30 phút tuition as student_tuition_per_block and never as per-session", () => {
    expect(
      toPerBlockTuitionForApi({
        mode: "per_block",
        displayedAmount: 50000,
      }),
    ).toBe(50000);
    expect(
      toPerBlockTuitionForApi({
        mode: "per_block",
        displayedAmount: undefined,
      }),
    ).toBeNull();
    expect(
      toPerBlockTuitionForApi({
        mode: "per_session",
        displayedAmount: 50000,
      }),
    ).toBeUndefined();
  });
});
