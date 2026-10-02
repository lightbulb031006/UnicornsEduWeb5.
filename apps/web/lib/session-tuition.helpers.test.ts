import { describe, expect, it } from "vitest";

import {
  resolveLivePreviewStudentTuitionVnd,
  resolvePreviewStudentBlockRateVnd,
} from "./session-tuition.helpers";

describe("resolveLivePreviewStudentTuitionVnd", () => {
  it("giữ nguyên học phí / buổi khi lớp không bật chế độ block", () => {
    expect(
      resolveLivePreviewStudentTuitionVnd({
        pricingMode: "per_session",
        customTuitionPerBlock: 60_000,
        classTuitionPerBlock: 50_000,
        effectiveTuitionPerSession: 300_000,
        blockCount: 4,
      }),
    ).toBe(300_000);
  });

  it("nhân đơn giá lớp với số block khi lớp bật chế độ block", () => {
    expect(
      resolveLivePreviewStudentTuitionVnd({
        pricingMode: "per_block",
        classTuitionPerBlock: 60_000,
        effectiveTuitionPerSession: 300_000,
        blockCount: 4,
      }),
    ).toBe(240_000);
  });

  it("ưu tiên đơn giá riêng của học sinh hơn đơn giá lớp", () => {
    expect(
      resolveLivePreviewStudentTuitionVnd({
        pricingMode: "per_block",
        customTuitionPerBlock: 70_000,
        classTuitionPerBlock: 60_000,
        effectiveTuitionPerSession: 300_000,
        blockCount: 3,
      }),
    ).toBe(210_000);
  });

  it("coi đơn giá riêng bằng 0 là chưa đặt", () => {
    expect(
      resolveLivePreviewStudentTuitionVnd({
        pricingMode: "per_block",
        customTuitionPerBlock: 0,
        classTuitionPerBlock: 60_000,
        effectiveTuitionPerSession: 300_000,
        blockCount: 2,
      }),
    ).toBe(120_000);
  });

  it("rơi về học phí / buổi khi thiếu số block", () => {
    expect(
      resolveLivePreviewStudentTuitionVnd({
        pricingMode: "per_block",
        classTuitionPerBlock: 60_000,
        effectiveTuitionPerSession: 300_000,
        blockCount: null,
      }),
    ).toBe(300_000);
  });

  it("rơi về học phí / buổi khi lớp chưa có đơn giá block", () => {
    expect(
      resolveLivePreviewStudentTuitionVnd({
        pricingMode: "per_block",
        effectiveTuitionPerSession: 300_000,
        blockCount: 4,
      }),
    ).toBe(300_000);
  });
});

describe("resolvePreviewStudentBlockRateVnd", () => {
  it("trả null khi lớp tính theo buổi", () => {
    expect(
      resolvePreviewStudentBlockRateVnd({
        pricingMode: "per_session",
        classTuitionPerBlock: 60_000,
      }),
    ).toBeNull();
  });

  it("trả đơn giá riêng nếu có, ngược lại đơn giá lớp", () => {
    expect(
      resolvePreviewStudentBlockRateVnd({
        pricingMode: "per_block",
        customTuitionPerBlock: 70_000,
        classTuitionPerBlock: 60_000,
      }),
    ).toBe(70_000);
    expect(
      resolvePreviewStudentBlockRateVnd({
        pricingMode: "per_block",
        customTuitionPerBlock: null,
        classTuitionPerBlock: 60_000,
      }),
    ).toBe(60_000);
  });
});
