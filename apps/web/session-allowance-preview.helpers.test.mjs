import assert from "node:assert/strict";
import test from "node:test";
import {
  formatSessionAllowanceBreakdownVnd,
  resolveSessionAllowancePreviewInputs,
} from "./lib/session-allowance.helpers.ts";

test("resolveSessionAllowancePreviewInputs uses session snapshot when available", () => {
  const result = resolveSessionAllowancePreviewInputs({
    session: {
      snapshotPerStudentAllowance: 50_000,
      snapshotScaleAmount: 100_000,
    },
    classDetail: {
      allowancePerSessionPerStudent: 80_000,
      scaleAmount: 200_000,
      teachers: [{ id: "teacher-1", customAllowance: 90_000 }],
    },
    teacherId: "teacher-1",
    chargeableStudentCount: 3,
  });

  assert.equal(result?.source, "snapshot");
  assert.equal(result?.perStudent, 50_000);
  assert.equal(result?.scaleAmount, 100_000);
  assert.equal(result?.rawBase, 250_000);
});

test("resolveSessionAllowancePreviewInputs falls back to live class config", () => {
  const result = resolveSessionAllowancePreviewInputs({
    session: {
      snapshotPerStudentAllowance: null,
      snapshotScaleAmount: null,
    },
    classDetail: {
      allowancePerSessionPerStudent: 40_000,
      scaleAmount: 60_000,
      teachers: [{ id: "teacher-2", customAllowance: 55_000 }],
    },
    teacherId: "teacher-2",
    chargeableStudentCount: 2,
  });

  assert.equal(result?.source, "live");
  assert.equal(result?.perStudent, 55_000);
  assert.equal(result?.scaleAmount, 60_000);
  assert.equal(result?.rawBase, 170_000);
});

test("formatSessionAllowanceBreakdownVnd renders readable formula", () => {
  const text = formatSessionAllowanceBreakdownVnd({
    perStudent: 50_000,
    chargeableStudentCount: 4,
    scaleAmount: 100_000,
    rawBase: 300_000,
  });

  assert.match(text, /50\.000đ\/hs × 4 hs \+ 100\.000đ = 300\.000đ/);
});
