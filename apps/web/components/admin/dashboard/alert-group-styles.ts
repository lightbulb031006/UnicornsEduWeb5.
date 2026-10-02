import { formatVnInteger } from "@/lib/formatters";
export type AlertGroupTone = "warning" | "destructive" | "info" | "class";

export function getAlertGroupToneClasses(tone: AlertGroupTone) {
  const toneClass =
    tone === "warning"
      ? "border-warning/35"
      : tone === "destructive"
        ? "border-error/35"
        : tone === "info"
          ? "border-info/35"
          : "border-error/25";
  const headerClass =
    tone === "warning"
      ? "bg-warning/10 text-warning"
      : tone === "destructive"
        ? "bg-error/10 text-error"
        : tone === "info"
          ? "bg-info/10 text-info"
          : "bg-error/8 text-error";
  const toneDotClass =
    tone === "warning"
      ? "bg-warning"
      : tone === "destructive"
        ? "bg-error"
        : tone === "info"
          ? "bg-info"
          : "bg-error";
  const itemToneClass =
    tone === "warning"
      ? "border-warning/25 bg-warning/5 hover:bg-warning/10"
      : tone === "destructive"
        ? "border-error/25 bg-error/5 hover:bg-error/10"
        : tone === "info"
          ? "border-info/25 bg-info/5 hover:bg-info/10"
          : "border-error/20 bg-error/5 hover:bg-error/10";

  return {
    toneClass,
    headerClass,
    toneDotClass,
    itemToneClass,
  };
}

export function formatDashboardAlertCurrency(value: number) {
  return `${formatVnInteger(value)} đ`;
}
