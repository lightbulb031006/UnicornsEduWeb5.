"use client";

import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Role } from "@/dtos/Auth.dto";
import { useAuth } from "@/context/AuthContext";
import * as authApi from "@/lib/apis/auth.api";
import { clearLogoutScopedQueries } from "@/lib/query-invalidation";

/**
 * Đăng xuất học sinh (xoá UserDevice phía server) rồi reset AuthContext về guest.
 * Phải reset `user` trước khi điều hướng: trang đăng nhập thấy session còn sống
 * sẽ tự đá ngược về khu học sinh.
 */
export function useStudentLogout(redirectTo = "/auth/login") {
  const { push } = useRouter();
  const queryClient = useQueryClient();
  const { setUser } = useAuth();

  return useMutation({
    mutationFn: () => authApi.studentLogout(),
    onSuccess: async () => {
      await clearLogoutScopedQueries(queryClient);
      setUser({
        id: "",
        accountHandle: "",
        roleType: Role.guest,
        requiresPasswordSetup: false,
        avatarUrl: null,
      });
      toast.success("Đã đăng xuất");
      push(redirectTo);
    },
    onError: () => {
      toast.error("Đăng xuất thất bại");
    },
  });
}
