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
 * Chưa chọn → cảnh báo bắt buộc; đã chọn → ghi chú nhẹ cách đổi.
 */
export function HighlightAchievementGuide({
  hasHighlight,
}: {
  hasHighlight: boolean;
}) {
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
        Chọn 1 thành tích cao nhất của bạn
      </AlertTitle>
      <AlertDescription className="text-text-primary">
        Bấm <strong>ngôi sao</strong> ở thành tích quan trọng nhất. Thành tích
        này sẽ hiện trên website Unicorns cạnh ảnh của bạn và luôn đứng đầu danh
        sách. <strong>Bắt buộc với gia sư</strong> — chưa chọn thì chưa dùng
        được hệ thống.
      </AlertDescription>
    </Alert>
  );
}
