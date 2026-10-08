import type { StudentWalletTransaction } from "@/dtos/student.dto";
import { toValidDate, VN_LOCALE, VN_TIME_ZONE } from "@/lib/formatters";

export type WalletTransactionMonthGroup = {
  /** `YYYY-MM` theo giờ Việt Nam; `unknown` khi giao dịch không có ngày hợp lệ. */
  key: string;
  label: string;
  transactions: StudentWalletTransaction[];
};

const monthPartsFormatter = new Intl.DateTimeFormat(VN_LOCALE, {
  timeZone: VN_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
});

/** Ngày hiển thị của giao dịch: ngày nghiệp vụ nếu có, không thì lúc tạo. */
export function walletTransactionDate(tx: StudentWalletTransaction) {
  return tx.date ?? tx.createdAt;
}

/** Chỉ nạp tiền làm tăng số dư; các loại còn lại là trừ. */
export function isWalletCredit(tx: Pick<StudentWalletTransaction, "type">) {
  return tx.type === "topup";
}

function monthKeyOf(value: string | undefined): { key: string; label: string } {
  const date = toValidDate(value);
  if (!date) return { key: "unknown", label: "Không rõ thời gian" };
  const parts = monthPartsFormatter.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  return { key: `${year}-${month}`, label: `Tháng ${month}/${year}` };
}

/**
 * Gom giao dịch theo tháng (giờ Việt Nam), giữ nguyên thứ tự API trả về
 * (mới nhất trước) cả giữa các nhóm lẫn trong từng nhóm.
 */
export function groupWalletTransactionsByMonth(
  transactions: StudentWalletTransaction[],
): WalletTransactionMonthGroup[] {
  const groups = new Map<string, WalletTransactionMonthGroup>();
  for (const tx of transactions) {
    const { key, label } = monthKeyOf(walletTransactionDate(tx));
    const group = groups.get(key);
    if (group) group.transactions.push(tx);
    else groups.set(key, { key, label, transactions: [tx] });
  }
  return [...groups.values()];
}
