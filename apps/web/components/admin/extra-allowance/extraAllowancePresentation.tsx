import type { ReactNode } from "react";
import type {
  ExtraAllowanceRoleType,
  ExtraAllowanceStatus,
} from "@/dtos/extra-allowance.dto";
import { getDefaultMonthKey, parseMonthKey } from "@/lib/month-format";
import { ROLE_LABELS } from "@/lib/staff.constants";

export type ExtraAllowanceMonthQuery = {
  year: string;
  month: string;
  monthKey: string;
};

/** Parse YYYY-MM into API query params (`year` + numeric `month`). */
export function toExtraAllowanceMonthQuery(
  monthKey?: string | null,
): ExtraAllowanceMonthQuery {
  const parsed = parseMonthKey(monthKey) ?? parseMonthKey(getDefaultMonthKey());
  if (!parsed) {
    const fallback = getDefaultMonthKey();
    const [year, month] = fallback.split("-");
    return { year, month, monthKey: fallback };
  }

  return {
    year: String(parsed.year),
    month: String(parsed.month),
    monthKey: parsed.monthKey,
  };
}

const insetSurfaceShadow =
  "shadow-[inset_0_1px_0_color-mix(in_srgb,var(--ue-bg-surface)_35%,transparent)]";

export const EXTRA_ALLOWANCE_STATUS_META = {
  pending: {
    label: "Chờ thanh toán",
    dotClassName: "bg-error",
    badgeClassName: "bg-error/15 text-error ring-1 ring-error/25",
    pillClassName:
      `border border-error/25 bg-error/10 text-error ${insetSurfaceShadow}`,
  },
  paid: {
    label: "Đã thanh toán",
    dotClassName: "bg-success",
    badgeClassName: "bg-success/15 text-success ring-1 ring-success/25",
    pillClassName:
      `border border-success/25 bg-success/10 text-success ${insetSurfaceShadow}`,
  },
} satisfies Record<
  ExtraAllowanceStatus,
  {
    label: string;
    dotClassName: string;
    badgeClassName: string;
    pillClassName: string;
  }
>;

export const EXTRA_ALLOWANCE_ROLE_META = {
  admin: {
    label: ROLE_LABELS.admin,
    badgeClassName: "bg-secondary/12 text-secondary ring-1 ring-secondary/20",
    pillClassName:
      `border border-secondary/20 bg-secondary/10 text-secondary ${insetSurfaceShadow}`,
  },
  teacher: {
    label: ROLE_LABELS.teacher,
    badgeClassName: "bg-primary/12 text-primary ring-1 ring-primary/20",
    pillClassName:
      `border border-primary/20 bg-primary/10 text-primary ${insetSurfaceShadow}`,
  },
  assistant: {
    label: ROLE_LABELS.assistant,
    badgeClassName: "bg-warning/15 text-warning ring-1 ring-warning/25",
    pillClassName:
      `border border-warning/25 bg-warning/10 text-warning ${insetSurfaceShadow}`,
  },
  lesson_plan: {
    label: ROLE_LABELS.lesson_plan,
    badgeClassName: "bg-info/12 text-info ring-1 ring-info/20",
    pillClassName:
      `border border-info/20 bg-info/10 text-info ${insetSurfaceShadow}`,
  },
  lesson_plan_head: {
    label: ROLE_LABELS.lesson_plan_head,
    badgeClassName: "bg-info/18 text-info ring-1 ring-info/25",
    pillClassName:
      `border border-info/25 bg-info/12 text-info ${insetSurfaceShadow}`,
  },
  accountant: {
    label: ROLE_LABELS.accountant,
    badgeClassName: "bg-success/12 text-success ring-1 ring-success/20",
    pillClassName:
      `border border-success/20 bg-success/10 text-success ${insetSurfaceShadow}`,
  },
  accountant_income: {
    label: ROLE_LABELS.accountant_income,
    badgeClassName: "bg-success/12 text-success ring-1 ring-success/20",
    pillClassName:
      `border border-success/20 bg-success/10 text-success ${insetSurfaceShadow}`,
  },
  accountant_expense: {
    label: ROLE_LABELS.accountant_expense,
    badgeClassName: "bg-warning/15 text-warning ring-1 ring-warning/25",
    pillClassName:
      `border border-warning/25 bg-warning/10 text-warning ${insetSurfaceShadow}`,
  },
  communication: {
    label: ROLE_LABELS.communication,
    badgeClassName: "bg-error/12 text-error ring-1 ring-error/20",
    pillClassName:
      `border border-error/20 bg-error/10 text-error ${insetSurfaceShadow}`,
  },
  technical: {
    label: ROLE_LABELS.technical,
    badgeClassName: "bg-info/15 text-info ring-1 ring-info/25",
    pillClassName:
      `border border-info/25 bg-info/10 text-info ${insetSurfaceShadow}`,
  },
  customer_care: {
    label: ROLE_LABELS.customer_care,
    badgeClassName: "bg-primary/10 text-primary ring-1 ring-primary/15",
    pillClassName:
      `border border-primary/15 bg-primary/8 text-primary ${insetSurfaceShadow}`,
  },
  training: {
    label: ROLE_LABELS.training,
    badgeClassName: "bg-secondary/12 text-secondary ring-1 ring-secondary/20",
    pillClassName:
      `border border-secondary/20 bg-secondary/10 text-secondary ${insetSurfaceShadow}`,
  },
  sale: {
    label: ROLE_LABELS.sale,
    badgeClassName: "bg-success/12 text-success ring-1 ring-success/20",
    pillClassName:
      `border border-success/20 bg-success/10 text-success ${insetSurfaceShadow}`,
  },
} satisfies Record<
  ExtraAllowanceRoleType,
  {
    label: string;
    badgeClassName: string;
    pillClassName: string;
  }
>;

export const DEFAULT_BULK_EXTRA_ALLOWANCE_STATUS: ExtraAllowanceStatus = "paid";

function isExtraAllowanceRoleType(
  roleType: string,
): roleType is ExtraAllowanceRoleType {
  return roleType in EXTRA_ALLOWANCE_ROLE_META;
}

export function renderExtraAllowanceStatusOptionLabel(
  status: ExtraAllowanceStatus,
): ReactNode {
  const meta = EXTRA_ALLOWANCE_STATUS_META[status];

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-semibold ${meta.pillClassName}`}
    >
      <span className={`size-2 rounded-full ${meta.dotClassName}`} aria-hidden />
      {meta.label}
    </span>
  );
}

export function renderExtraAllowanceRoleOptionLabel(
  roleType: ExtraAllowanceRoleType,
): ReactNode {
  const meta = EXTRA_ALLOWANCE_ROLE_META[roleType];

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${meta.pillClassName}`}
    >
      {meta.label}
    </span>
  );
}

export const EXTRA_ALLOWANCE_STATUS_OPTIONS = (
  [
    { value: "pending", label: renderExtraAllowanceStatusOptionLabel("pending") },
    { value: "paid", label: renderExtraAllowanceStatusOptionLabel("paid") },
  ] as const
).map((option) => ({
  value: option.value,
  label: option.label,
}));

export const EXTRA_ALLOWANCE_ROLE_OPTIONS = (
  [
    { value: "admin", label: renderExtraAllowanceRoleOptionLabel("admin") },
    { value: "teacher", label: renderExtraAllowanceRoleOptionLabel("teacher") },
    { value: "assistant", label: renderExtraAllowanceRoleOptionLabel("assistant") },
    {
      value: "lesson_plan",
      label: renderExtraAllowanceRoleOptionLabel("lesson_plan"),
    },
    {
      value: "lesson_plan_head",
      label: renderExtraAllowanceRoleOptionLabel("lesson_plan_head"),
    },
    {
      value: "accountant_income",
      label: renderExtraAllowanceRoleOptionLabel("accountant_income"),
    },
    {
      value: "accountant_expense",
      label: renderExtraAllowanceRoleOptionLabel("accountant_expense"),
    },
    {
      value: "communication",
      label: renderExtraAllowanceRoleOptionLabel("communication"),
    },
    {
      value: "technical",
      label: renderExtraAllowanceRoleOptionLabel("technical"),
    },
    {
      value: "training",
      label: renderExtraAllowanceRoleOptionLabel("training"),
    },
    {
      value: "sale",
      label: renderExtraAllowanceRoleOptionLabel("sale"),
    },
    {
      value: "customer_care",
      label: renderExtraAllowanceRoleOptionLabel("customer_care"),
    },
  ] as const
).map((option) => ({
  value: option.value,
  label: option.label,
}));

export function getExtraAllowanceStatusLabel(
  status: ExtraAllowanceStatus | string | null | undefined,
): string {
  if (status === "pending" || status === "paid") {
    return EXTRA_ALLOWANCE_STATUS_META[status].label;
  }

  return status ? String(status) : "—";
}

export function getExtraAllowanceStatusChipClass(
  status: ExtraAllowanceStatus | string | null | undefined,
): string {
  if (status === "pending" || status === "paid") {
    return EXTRA_ALLOWANCE_STATUS_META[status].badgeClassName;
  }

  return "bg-bg-secondary text-text-secondary ring-1 ring-border-default";
}

export function getExtraAllowanceRoleLabel(
  roleType: ExtraAllowanceRoleType | string | null | undefined,
): string {
  if (roleType && isExtraAllowanceRoleType(roleType)) {
    return EXTRA_ALLOWANCE_ROLE_META[roleType].label;
  }

  return roleType ? String(roleType) : "—";
}

export function getExtraAllowanceRoleChipClass(
  roleType: ExtraAllowanceRoleType | string | null | undefined,
): string {
  if (roleType && isExtraAllowanceRoleType(roleType)) {
    return EXTRA_ALLOWANCE_ROLE_META[roleType].badgeClassName;
  }

  return "bg-bg-secondary text-text-secondary ring-1 ring-border-default";
}
