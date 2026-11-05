import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import * as authApi from "@/lib/apis/auth.api";

/**
 * Tải lại session và ghi vào `AuthContext`. Context giữ `user` bằng `useState`, không
 * nghe query `["auth", "session"]`, nên chỉ `invalidateQueries` thì gate client
 * (`StaffAccessGate`) vẫn đọc `profileComplete` cũ và đẩy ngược về `/user-profile`.
 */
export function useRefreshAuthSession() {
  const { setUser } = useAuth();
  const queryClient = useQueryClient();

  return useCallback(async () => {
    try {
      const nextUser = await authApi.getSession();
      setUser(nextUser);
      queryClient.setQueryData(["auth", "session"], nextUser);
      return nextUser;
    } catch {
      // Phiên cũ vẫn dùng được; lần tải trang sau sẽ lấy session mới.
      return null;
    }
  }, [queryClient, setUser]);
}
