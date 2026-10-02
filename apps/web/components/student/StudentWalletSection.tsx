"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { StudentBalancePopup } from "@/components/admin/student";
import StudentTuitionBalanceCard from "@/components/student/StudentTuitionBalanceCard";
import { Skeleton } from "@/components/ui/skeleton";
import type { StudentSelfDetail } from "@/dtos/student.dto";
import {
  getMyStudentDetail,
  getMyStudentSePayStaticQr,
} from "@/lib/apis/auth.api";

/**
 * Khối ví của học sinh (số dư + nạp tiền qua QR SePay) dùng ở trang học phí
 * `/student/tuition`. Lịch sử giao dịch tách riêng thành `StudentTuitionHistoryCard`
 * render inline cuối trang. Tự lấy `student/self/detail` qua TanStack Query nên
 * dùng chung cache với các trang học sinh khác, không cần truyền prop từ ngoài.
 */
export default function StudentWalletSection() {
  const [balancePopupMode, setBalancePopupMode] = useState<
    "topup" | "withdraw" | null
  >(null);

  const { data: student, isLoading } = useQuery<StudentSelfDetail>({
    queryKey: ["student", "self", "detail"],
    queryFn: getMyStudentDetail,
    retry: false,
    staleTime: 60_000,
  });

  const {
    data: sePayStaticQr,
    isLoading: isSePayStaticQrLoading,
    error: sePayStaticQrError,
  } = useQuery({
    queryKey: ["student", "self", "sepay-static-qr"],
    queryFn: getMyStudentSePayStaticQr,
    enabled: balancePopupMode === "topup" && Boolean(student?.id),
    retry: false,
    staleTime: 5 * 60_000,
  });

  if (isLoading) {
    return <Skeleton className="h-40 w-full rounded-2xl" />;
  }

  if (!student) {
    return null;
  }

  const sePayStaticQrErrorMessage =
    (
      sePayStaticQrError as {
        response?: { data?: { message?: string } };
      } | null
    )?.response?.data?.message ??
    (sePayStaticQrError
      ? "Không tải được QR SePay. Vui lòng thử lại sau."
      : null);

  return (
    <>
      <StudentBalancePopup
        key={`${student.id}-${balancePopupMode ?? "closed"}`}
        open={balancePopupMode !== null}
        mode={balancePopupMode ?? "topup"}
        student={{
          id: student.id,
          fullName: student.fullName,
          accountBalance: student.accountBalance,
        }}
        directBalanceChangeEnabled={false}
        sePayStaticQr={sePayStaticQr ?? null}
        isSePayStaticQrLoading={isSePayStaticQrLoading}
        sePayStaticQrErrorMessage={sePayStaticQrErrorMessage}
        onClose={() => setBalancePopupMode(null)}
      />

      <StudentTuitionBalanceCard
        balance={student.accountBalance ?? 0}
        studentName={student.fullName}
        onTopUp={() => setBalancePopupMode("topup")}
      />
    </>
  );
}
