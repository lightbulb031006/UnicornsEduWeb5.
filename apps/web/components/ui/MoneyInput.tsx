"use client";

import { type ComponentProps } from "react";
import { formatMoneyInputFromUserRaw } from "@/lib/money-input.helpers";
import { cn } from "@/lib/utils";

export type MoneyInputProps = Omit<
  ComponentProps<"input">,
  "type" | "value" | "onChange" | "inputMode"
> & {
  value: string;
  onValueChange: (value: string) => void;
  /** When true, a leading minus is allowed (bonus/penalty, signed adjustments). */
  allowNegative?: boolean;
};

export function MoneyInput({
  value,
  onValueChange,
  allowNegative = false,
  className,
  ...props
}: MoneyInputProps) {
  return (
    <input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      value={value}
      onChange={(event) =>
        onValueChange(formatMoneyInputFromUserRaw(event.target.value, allowNegative))
      }
      className={cn("tabular-nums", className)}
      {...props}
    />
  );
}
