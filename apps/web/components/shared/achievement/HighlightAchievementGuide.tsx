import { Star } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

/** Badge trên dòng thành tích nổi bật: nói rõ đây là dòng hiện trên website. */
export function HighlightAchievementBadge() {
  return (
    <Badge variant="warning">
      <Star className="size-3 fill-current" aria-hidden />
      Hiển thị trên website
    </Badge>
  );
}

/**
 * Hướng dẫn chọn thành tích nổi bật, đặt đầu danh sách thành tích nhân sự.
 * Gắn sao trước, tải minh chứng sau (ADR 2026-11-11): chưa chọn → cảnh báo bắt
 * buộc; đã chọn nhưng dòng sao chưa có ảnh → cảnh báo thiếu minh chứng; đủ → ghi
 * chú nhẹ cách đổi. `audience="other"`: người khác (admin, Ban Đào Tạo) đang sửa.
 */
export function HighlightAchievementGuide({
  hasHighlight,
  highlightMissingProof = false,
  audience = "self",
}: {
  hasHighlight: boolean;
  highlightMissingProof?: boolean;
  audience?: "self" | "other";
}) {
  const isSelf = audience === "self";

  if (hasHighlight && highlightMissingProof) {
    return (
      <Alert variant="warning">
        <AlertTitle className="flex items-center gap-1.5 text-sm">
          <Star className="size-4 shrink-0 fill-current" aria-hidden />
          Thành tích nổi bật chưa có ảnh minh chứng
        </AlertTitle>
        <AlertDescription className="text-text-primary">
          {isSelf ? (
            <>
              Tải ảnh minh chứng lên cho dòng gắn sao.{" "}
              <strong>Bắt buộc với gia sư</strong> — chưa có ảnh thì chưa dùng
              được hệ thống.
            </>
          ) : (
            <>
              Gia sư cần tải ảnh minh chứng cho dòng gắn sao mới dùng được hệ
              thống.
            </>
          )}
        </AlertDescription>
      </Alert>
    );
  }

  if (hasHighlight) {
    return (
      <p className="flex items-start gap-1.5 text-xs text-text-muted">
        <Star
          className="mt-0.5 size-3.5 shrink-0 fill-warning text-warning"
          aria-hidden
        />
        <span>
          Thành tích gắn sao là thành tích hiển thị trên website Unicorns. Bấm
          ngôi sao ở dòng khác để đổi.
        </span>
      </p>
    );
  }

  return (
    <Alert variant="warning">
      <AlertTitle className="flex items-center gap-1.5 text-sm">
        <Star className="size-4 shrink-0 fill-current" aria-hidden />
        {isSelf
          ? "Chọn 1 thành tích cao nhất của bạn"
          : "Chưa chọn thành tích nổi bật"}
      </AlertTitle>
      <AlertDescription className="text-text-primary">
        Bấm <strong>ngôi sao</strong> ở thành tích quan trọng nhất, rồi tải ảnh
        minh chứng cho dòng đó. Thành tích này sẽ hiện trên website Unicorns
        cạnh ảnh {isSelf ? "của bạn" : "nhân sự"} và luôn đứng đầu danh sách.{" "}
        <strong>Bắt buộc với gia sư</strong> — chưa đủ thì chưa dùng được hệ
        thống.
      </AlertDescription>
    </Alert>
  );
}
