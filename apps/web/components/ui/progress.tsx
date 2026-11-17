"use client";

import * as React from "react";
import * as ProgressPrimitive from "@radix-ui/react-progress";
import { cn } from "@/lib/utils";

type ProgressProps = Omit<
  React.ComponentProps<typeof ProgressPrimitive.Root>,
  "value"
> & {
  /** 0–100; `null` = không xác định (thanh chạy qua lại). */
  value: number | null;
  indicatorClassName?: string;
};

/** shadcn Progress, thêm chế độ không xác định khi `value` là `null`. */
function Progress({
  className,
  indicatorClassName,
  value,
  ...props
}: ProgressProps) {
  const indeterminate = value === null;
  const clamped = indeterminate ? 0 : Math.min(100, Math.max(0, value));

  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      value={indeterminate ? null : clamped}
      className={cn(
        "relative h-2 w-full overflow-hidden rounded-full bg-primary/20",
        className,
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className={cn(
          "h-full rounded-full bg-primary",
          indeterminate
            ? "motion-progress-indeterminate w-1/3"
            : "w-full flex-1 transition-transform duration-500",
          indicatorClassName,
        )}
        style={
          indeterminate
            ? undefined
            : { transform: `translateX(-${100 - clamped}%)` }
        }
      />
    </ProgressPrimitive.Root>
  );
}

export { Progress };
