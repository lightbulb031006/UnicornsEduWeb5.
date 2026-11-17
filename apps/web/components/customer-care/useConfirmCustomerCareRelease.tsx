"use client";

import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import { getCustomerCareAssignedStudentCount } from "@/lib/apis/customer-care.api";
import { buildCustomerCareReleaseConfirm } from "@/lib/customer-care-role-release";

/**
 * Admin tắt role CSKH (sửa nhân sự / tab phân quyền user): đếm mọi học sinh
 * đang gán cho người đó (kể cả đã nghỉ) rồi hỏi xác nhận (follow-up 13/11 mục 2.1). Không đếm
 * được thì vẫn hỏi, câu chữ không kèm số. Trả `true` khi được phép lưu.
 */
export function useConfirmCustomerCareRelease() {
  const queryClient = useQueryClient();
  const { confirm, dialog } = useConfirmDialog();

  const confirmRelease = useCallback(
    async (params: { staffId: string; staffName: string }) => {
      let studentCount: number | null = null;
      try {
        studentCount = await queryClient.fetchQuery({
          queryKey: [
            "customer-care",
            "students",
            params.staffId,
            "assigned-count",
          ],
          queryFn: () => getCustomerCareAssignedStudentCount(params.staffId),
          staleTime: 0,
        });
      } catch {
        studentCount = null;
      }
      const request = buildCustomerCareReleaseConfirm({
        staffName: params.staffName,
        studentCount,
      });
      return request ? confirm(request) : true;
    },
    [confirm, queryClient],
  );

  return { confirmRelease, dialog };
}
