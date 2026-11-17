"use client";

import { useId } from "react";

/**
 * Ô chọn ảnh đại diện trong dialog «Thông tin nhân sự» của các trưởng
 * (Trưởng ban Đào tạo, Trưởng phòng Sale & CSKH). Ảnh lưu ngay khi chọn —
 * component chỉ chuyển `File` cho mutation của dialog rồi xoá giá trị input để
 * chọn lại cùng file vẫn kích hoạt `onChange`.
 */
export default function StaffAvatarUploadField({
  disabled,
  isPending,
  onFileSelected,
}: {
  disabled?: boolean;
  isPending: boolean;
  onFileSelected: (file: File) => void;
}) {
  const inputId = useId();

  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={inputId}
        className="text-sm font-medium text-text-primary"
      >
        Ảnh đại diện
      </label>
      <input
        id={inputId}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        disabled={disabled}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) onFileSelected(file);
        }}
        className="min-h-11 w-full text-sm text-text-secondary file:mr-3 file:min-h-10 file:rounded-md file:border file:border-border-default file:bg-bg-secondary file:px-3 file:text-sm file:text-text-primary disabled:opacity-50"
      />
      <p className="text-xs text-text-muted">
        {isPending
          ? "Đang tải ảnh lên…"
          : "JPG, PNG hoặc WebP, tối đa 5 MB. Ảnh được lưu ngay khi chọn."}
      </p>
    </div>
  );
}
