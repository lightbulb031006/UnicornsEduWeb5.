import { useEffect } from "react";
import { toast } from "sonner";

/** Toast Sonner một lần mỗi khi query chuyển sang lỗi. */
export function useQueryErrorToast(isError: boolean, message: string) {
  useEffect(() => {
    if (isError) toast.error(message);
  }, [isError, message]);
}
