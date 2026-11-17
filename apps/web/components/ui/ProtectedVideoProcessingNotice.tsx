import { Loader2 } from "lucide-react";
import type { ProtectedVideoProcessingStage } from "@/dtos/protected-video.dto";
import { Progress } from "@/components/ui/progress";

type ProtectedVideoProcessingNoticeProps = {
  stage: ProtectedVideoProcessingStage;
  /** % tổng của UNIOJ; `null` = chưa có số (xếp hàng / đang tải về). */
  progress: number | null;
  queuePosition: number | null;
  queueTotal: number | null;
};

function describeStage({
  stage,
  progress,
  queuePosition,
  queueTotal,
}: ProtectedVideoProcessingNoticeProps): string {
  switch (stage) {
    case "queued":
      return queuePosition !== null && queueTotal !== null
        ? `Đang xếp hàng (thứ ${queuePosition}/${queueTotal})`
        : "Đang xếp hàng";
    case "downloading":
      return "Đang tải video về";
    case "transcoding":
      return progress !== null
        ? `Đang chuyển mã · ${progress}%`
        : "Đang chuyển mã";
    case "uploading":
      return progress !== null ? `Sắp xong · ${progress}%` : "Sắp xong";
  }
}

/** Khung «Video đang xử lý» cho học sinh: nhãn giai đoạn + thanh tiến trình. */
export default function ProtectedVideoProcessingNotice(
  props: ProtectedVideoProcessingNoticeProps,
) {
  // Xếp hàng / tải về: UNIOJ chưa báo % → thanh chạy không xác định.
  const value =
    props.stage === "queued" || props.stage === "downloading"
      ? null
      : props.progress;
  const label = describeStage(props);

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-4 text-center select-none">
      <div className="flex size-10 items-center justify-center rounded-full bg-white/10 text-white/80">
        <Loader2 className="size-5 animate-spin" aria-hidden />
      </div>
      <p className="text-sm font-semibold text-white">Video đang xử lý</p>
      <div className="flex w-full max-w-xs flex-col gap-1.5">
        <Progress
          value={value}
          aria-label="Tiến trình xử lý video"
          aria-valuetext={label}
          className="bg-white/15"
          indicatorClassName="bg-white"
        />
        <p className="text-xs font-medium text-white/85" aria-live="polite">
          {label}
        </p>
      </div>
      <p className="max-w-sm text-xs text-white/60">
        Trang sẽ tự cập nhật khi video sẵn sàng.
      </p>
    </div>
  );
}
