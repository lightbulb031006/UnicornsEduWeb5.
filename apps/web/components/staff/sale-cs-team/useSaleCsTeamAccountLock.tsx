"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { SaleCsTeamMember } from "@/dtos/sale-cs-team.dto";
import {
  saleCsTeamKeys,
  updateSaleCsTeamAccountStatus,
} from "@/lib/apis/sale-cs-team.api";
import { getMutationErrorMessage } from "@/lib/mutation-feedback";

/**
 * Khoá / mở khoá tài khoản thành viên đội (#271). Chỉ nhân sự chỉ mang role
 * Sale/CSKH (`permissions.canLockAccount`); backend trả 403 với trường hợp khác.
 */
export function useSaleCsTeamAccountLock() {
  const queryClient = useQueryClient();
  const { confirm, dialog } = useConfirmDialog();

  const mutation = useMutation({
    mutationFn: (params: { staffId: string; locked: boolean }) =>
      updateSaleCsTeamAccountStatus(params.staffId, { locked: params.locked }),
    onSuccess: async (result) => {
      toast.success(
        result.accountLocked ? "Đã khoá tài khoản." : "Đã mở khoá tài khoản.",
      );
      await queryClient.invalidateQueries({ queryKey: saleCsTeamKeys.all });
    },
    onError: (error) => {
      toast.error(
        getMutationErrorMessage(
          error,
          "Không cập nhật được trạng thái tài khoản.",
        ),
      );
    },
  });

  const requestToggle = async (member: SaleCsTeamMember) => {
    if (mutation.isPending || member.accountLocked == null) return;
    const locking = !member.accountLocked;
    const name = member.fullName.trim() || "nhân sự này";
    const ok = await confirm(
      locking
        ? {
            title: "Khoá tài khoản?",
            description: `${name} sẽ không đăng nhập được cho tới khi được mở khoá.`,
            confirmLabel: "Khoá",
            variant: "destructive",
          }
        : {
            title: "Mở khoá tài khoản?",
            description: `${name} sẽ đăng nhập lại được.`,
            confirmLabel: "Mở khoá",
          },
    );
    if (ok) mutation.mutate({ staffId: member.id, locked: locking });
  };

  return { requestToggle, isPending: mutation.isPending, dialog };
}
