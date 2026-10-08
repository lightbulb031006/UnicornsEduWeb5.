import { describe, expect, it } from "vitest";
import type { StudentWalletTransaction } from "@/dtos/student.dto";
import {
  groupWalletTransactionsByMonth,
  isWalletCredit,
} from "./student-wallet-history";

const tx = (
  id: string,
  createdAt: string,
  extra: Partial<StudentWalletTransaction> = {},
): StudentWalletTransaction => ({
  id,
  type: "extend",
  amount: 100_000,
  createdAt,
  ...extra,
});

describe("groupWalletTransactionsByMonth", () => {
  it("gom theo tháng, giữ thứ tự mới nhất trước", () => {
    const groups = groupWalletTransactionsByMonth([
      tx("a", "2026-10-02T03:00:00.000Z"),
      tx("b", "2026-10-01T03:00:00.000Z"),
      tx("c", "2026-09-20T03:00:00.000Z"),
    ]);
    expect(groups.map((g) => [g.key, g.label])).toEqual([
      ["2026-10", "Tháng 10/2026"],
      ["2026-09", "Tháng 09/2026"],
    ]);
    expect(groups[0].transactions.map((t) => t.id)).toEqual(["a", "b"]);
  });

  it("tính tháng theo giờ Việt Nam", () => {
    // 30/09 18:00 UTC = 01/10 01:00 giờ Việt Nam.
    const [group] = groupWalletTransactionsByMonth([
      tx("a", "2026-09-30T18:00:00.000Z"),
    ]);
    expect(group.key).toBe("2026-10");
  });

  it("ưu tiên `date` nghiệp vụ hơn `createdAt`", () => {
    const [group] = groupWalletTransactionsByMonth([
      tx("a", "2026-10-02T03:00:00.000Z", { date: "2026-08-15T03:00:00.000Z" }),
    ]);
    expect(group.key).toBe("2026-08");
  });

  it("ngày hỏng vào nhóm không rõ thời gian", () => {
    const [group] = groupWalletTransactionsByMonth([tx("a", "not-a-date")]);
    expect(group).toMatchObject({
      key: "unknown",
      label: "Không rõ thời gian",
    });
  });
});

describe("isWalletCredit", () => {
  it("chỉ nạp tiền là cộng", () => {
    expect(isWalletCredit({ type: "topup" })).toBe(true);
    expect(isWalletCredit({ type: "extend" })).toBe(false);
    expect(isWalletCredit({ type: "repayment" })).toBe(false);
    expect(isWalletCredit({ type: "loan" })).toBe(false);
  });
});
