import { toast } from "sonner";
import {
  isGenericLocalizedError,
  localizeErrorMessage,
} from "@/lib/api-error-message";

type BackgroundSaveOptions<T> = {
  loadingMessage: string;
  successMessage: string;
  errorMessage: string;
  action: () => Promise<T>;
  onSuccess?: (result: T) => Promise<void> | void;
  onError?: (error: unknown) => Promise<void> | void;
};

/**
 * Message lỗi tiếng Việt cho toast. Lỗi kỹ thuật không nhận diện được → dùng `fallback`
 * (câu theo ngữ cảnh thao tác) thay vì hiện tiếng Anh.
 */
export function getMutationErrorMessage(error: unknown, fallback: string): string {
  const response = (
    error as { response?: { status?: number; data?: { message?: unknown } } }
  )?.response;
  const localized = localizeErrorMessage(
    response?.data?.message ?? (error as Error)?.message,
    response?.status,
  );

  if (!localized || localized.isGeneric || isGenericLocalizedError(error)) {
    return fallback;
  }
  return localized.message;
}

export function runBackgroundSave<T>({
  loadingMessage,
  successMessage,
  errorMessage,
  action,
  onSuccess,
  onError,
}: BackgroundSaveOptions<T>) {
  const toastId = toast.loading(loadingMessage);

  void (async () => {
    try {
      const result = await action();
      await onSuccess?.(result);
      toast.success(successMessage, { id: toastId });
    } catch (error) {
      await onError?.(error);
      toast.error(getMutationErrorMessage(error, errorMessage), { id: toastId });
    }
  })();
}

/** Toast cảnh báo khi thao tác đã lưu nhưng còn việc phụ (vd. Google Calendar) lỗi. */
export function toastWarnings(warnings: string[] | undefined) {
  if (!warnings?.length) return;
  toast.warning(warnings.join("\n"), { duration: 10_000 });
}
