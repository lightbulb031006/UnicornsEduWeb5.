"use client";

import { useId } from "react";
import { Shuffle } from "lucide-react";
import { Switch } from "@/components/ui/switch";

/** Công tắc «Đảo câu» của lần giao: mỗi lượt làm xáo câu + phương án. */
export function ShuffleQuestionsField({
  checked,
  onCheckedChange,
  hint,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** Ghi chú thêm, vd «chỉ áp cho lượt bắt đầu sau khi lưu». */
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="flex items-start gap-3 rounded-xl border border-border-default bg-bg-surface p-3">
      <Shuffle className="mt-0.5 size-4 shrink-0 text-text-muted" aria-hidden />
      <div className="min-w-0 flex-1">
        <label
          htmlFor={id}
          className="block cursor-pointer text-sm font-medium text-text-primary"
        >
          Đảo câu
        </label>
        <p className="mt-0.5 text-xs text-text-muted">
          Mỗi lượt làm xáo thứ tự câu (đề IT xáo trong từng phần / nhóm tự chọn)
          và thứ tự phương án, nhận định. Câu có phương án nhắc vị trí như «Cả A
          và B», «ở trên» giữ nguyên thứ tự phương án.
          {hint ? ` ${hint}` : ""}
        </p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}
