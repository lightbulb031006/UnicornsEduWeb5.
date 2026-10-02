"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

export type ConfirmDialogVariant = "default" | "destructive";

export type ConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmDialogVariant;
  onConfirm: () => void;
  confirmPending?: boolean;
};

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Xác nhận",
  cancelLabel = "Huỷ",
  variant = "default",
  onConfirm,
  confirmPending = false,
}: ConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description ? (
            <AlertDialogDescription>{description}</AlertDialogDescription>
          ) : null}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel type="button" disabled={confirmPending}>
            {cancelLabel}
          </AlertDialogCancel>
          <AlertDialogAction
            type="button"
            disabled={confirmPending}
            onClick={onConfirm}
            className={cn(
              variant === "destructive" &&
                "bg-error text-text-inverse hover:bg-error/90",
            )}
          >
            {confirmPending ? "Đang xử lý..." : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export type ConfirmRequest = {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmDialogVariant;
};

export const UNSAVED_CLOSE_CONFIRM: ConfirmRequest = {
  title: "Huỷ thay đổi chưa lưu?",
  description:
    "Bạn có thay đổi chưa lưu. Nếu rời đi, các thay đổi này sẽ bị mất.",
  confirmLabel: "Rời đi",
  cancelLabel: "Ở lại",
  variant: "destructive",
};

export const ORDER_DIRTY_CONFIRM: ConfirmRequest = {
  title: "Thứ tự chưa lưu",
  description:
    "Bạn đã kéo sắp xếp nhưng chưa bấm Lưu thứ tự. Rời đi sẽ mất thứ tự mới.",
  confirmLabel: "Bỏ thay đổi",
  cancelLabel: "Ở lại",
  variant: "destructive",
};

export function useConfirmDialog() {
  const resolveRef = useRef<((value: boolean) => void) | null>(null);
  const confirmingRef = useRef(false);
  const [request, setRequest] = useState<ConfirmRequest | null>(null);

  const settle = useCallback((value: boolean) => {
    resolveRef.current?.(value);
    resolveRef.current = null;
    setRequest(null);
  }, []);

  const confirm = useCallback((opts: ConfirmRequest) => {
    resolveRef.current?.(false);
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
      setRequest(opts);
    });
  }, []);

  const dialog = (
    <ConfirmDialog
      open={request !== null}
      onOpenChange={(open) => {
        if (!open) {
          if (confirmingRef.current) {
            confirmingRef.current = false;
            return;
          }
          settle(false);
        }
      }}
      title={request?.title ?? ""}
      description={request?.description}
      confirmLabel={request?.confirmLabel}
      cancelLabel={request?.cancelLabel}
      variant={request?.variant}
      onConfirm={() => {
        confirmingRef.current = true;
        settle(true);
      }}
    />
  );

  return { confirm, dialog };
}

export default ConfirmDialog;

export async function confirmUnsavedClose(
  confirm: (opts: ConfirmRequest) => Promise<boolean>,
  isDirty: boolean,
): Promise<boolean> {
  if (!isDirty) return true;
  return confirm(UNSAVED_CLOSE_CONFIRM);
}

export async function confirmOrderDirtyLeave(
  confirm: (opts: ConfirmRequest) => Promise<boolean>,
  isDirty: boolean,
): Promise<boolean> {
  if (!isDirty) return true;
  return confirm(ORDER_DIRTY_CONFIRM);
}
