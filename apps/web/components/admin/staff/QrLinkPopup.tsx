"use client";

import { useState, type SyntheticEvent } from "react";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onClose: () => void;
  currentLink: string;
  onSave: (link: string) => void | Promise<void>;
};

function QrLinkPopupContent({
  onClose,
  currentLink,
  onSave,
}: Omit<Props, "open">) {
  const [link, setLink] = useState(currentLink);
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (e: SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = link.trim();
    if (trimmed && !/^https?:\/\/.+/i.test(trimmed)) {
      toast.warning(
        "Link QR thanh toán không hợp lệ. Vui lòng nhập link bắt đầu bằng http hoặc https.",
      );
      return;
    }
    setIsSaving(true);
    try {
      await onSave(trimmed);
      toast.success("Đã cập nhật link QR thanh toán.");
      onClose();
    } catch {
      // Parent mutation owns the user-facing error toast.
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-bg-primary/75"
        aria-hidden
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="qr-link-title"
        className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border-default bg-bg-surface p-5 shadow-xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2
            id="qr-link-title"
            className="text-lg font-semibold text-text-primary"
          >
            Điền link QR thanh toán
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-text-muted transition-colors hover:bg-bg-tertiary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
            aria-label="Đóng"
          >
            <svg
              className="size-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <label className="mb-2 block text-sm font-medium text-text-secondary">
            Link QR thanh toán
          </label>
          <input
            type="url"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://... hoặc link ảnh QR"
            className="mb-2 w-full rounded-md border border-border-default bg-bg-surface px-3 py-2 text-text-primary placeholder:text-text-muted focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
          />
          <p className="mb-4 text-xs text-text-muted">
            Thêm link ảnh QR thanh toán hoặc link chuyển khoản (để trống nếu
            muốn xóa).
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="rounded-md border border-border-default bg-bg-surface px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-bg-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-text-inverse transition-colors hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving ? "Đang lưu…" : "Lưu"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}

export default function QrLinkPopup(props: Props) {
  if (!props.open) return null;
  return <QrLinkPopupContent {...props} />;
}
