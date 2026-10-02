"use client";

import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

type Props = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
  isSubmitting?: boolean;
};

export default function LessonDeleteConfirmPopup({
  open,
  title,
  description,
  confirmLabel,
  onClose,
  onConfirm,
  isSubmitting = false,
}: Props) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={title}
      description={description}
      confirmLabel={confirmLabel}
      variant="destructive"
      onConfirm={() => {
        void onConfirm();
      }}
      confirmPending={isSubmitting}
    />
  );
}
