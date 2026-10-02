export const SYSTEM_SETTINGS_TABS = ["deductions", "fixed-salary"] as const;

export type SystemSettingsTab = (typeof SYSTEM_SETTINGS_TABS)[number];

export const SYSTEM_SETTINGS_DEFAULT_TAB: SystemSettingsTab = "deductions";

export const SYSTEM_SETTINGS_TAB_LABELS: Record<SystemSettingsTab, string> = {
  deductions: "Khấu trừ",
  "fixed-salary": "Lương cứng",
};

export function parseSystemSettingsTab(
  value: string | null | undefined,
): SystemSettingsTab {
  if (value === "deductions" || value === "fixed-salary") {
    return value;
  }

  return SYSTEM_SETTINGS_DEFAULT_TAB;
}
