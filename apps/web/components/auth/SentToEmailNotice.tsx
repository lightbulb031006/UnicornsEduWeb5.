import { cn } from "@/lib/utils";

/** Dòng «Đã gửi thành công tới ...abcd@domain» (email đã che sẵn). */
export function SentToEmailNotice({
  maskedEmail,
  className,
}: {
  maskedEmail: string;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "rounded-lg border border-border-default bg-bg-secondary px-3 py-2 text-sm text-text-primary",
        className,
      )}
    >
      Đã gửi thành công tới{" "}
      <span className="break-all font-medium">{maskedEmail}</span>
    </p>
  );
}
