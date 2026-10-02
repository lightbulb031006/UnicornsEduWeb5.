import type {
  StaffFixedSalaryPayableItem,
  StaffFixedSalaryRoleSummary,
  StaffIncomeAmountSummary,
  StaffIncomeClassSummary,
  StaffIncomeDepositClassSummary,
  StaffIncomeRoleSummary,
  StaffIncomeSummary,
} from "@/dtos/staff.dto";

const EMPTY_AMOUNT_SUMMARY: StaffIncomeAmountSummary = {
  total: 0,
  paid: 0,
  unpaid: 0,
};

function toNumber(value: unknown): number {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : 0;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function pickFirstValue(
  source: Record<string, unknown>,
  keys: string[],
): unknown {
  for (const key of keys) {
    if (key in source) {
      return source[key];
    }
  }
  return undefined;
}

function normalizeAmountSummary(value: unknown): StaffIncomeAmountSummary {
  const normalizedRecord = asRecord(value);
  if (!normalizedRecord) {
    return EMPTY_AMOUNT_SUMMARY;
  }

  return {
    total: toNumber(normalizedRecord.total),
    paid: toNumber(normalizedRecord.paid),
    unpaid: toNumber(normalizedRecord.unpaid),
  };
}

function normalizeOptionalAmountSummary(
  source: Record<string, unknown>,
  keys: string[],
): StaffIncomeAmountSummary | undefined {
  const rawValue = pickFirstValue(source, keys);
  const normalizedRecord = asRecord(rawValue);
  if (!normalizedRecord) {
    return undefined;
  }
  return normalizeAmountSummary(normalizedRecord);
}

function normalizeOptionalNumber(
  source: Record<string, unknown>,
  keys: string[],
): number | undefined {
  const rawValue = pickFirstValue(source, keys);
  if (rawValue == null) {
    return undefined;
  }
  return toNumber(rawValue);
}

export function normalizeStaffIncomeSummary(
  payload: unknown,
): StaffIncomeSummary {
  const source = asRecord(payload) ?? {};
  const monthlyOperatingDeductionTotals = normalizeOptionalAmountSummary(
    source,
    [
      "monthlyOperatingDeductionTotals",
      "monthlyOperatingTotals",
      "monthlyOperatingDeductions",
    ],
  );
  const monthlyTotalDeductionTotals = normalizeOptionalAmountSummary(source, [
    "monthlyTotalDeductionTotals",
    "monthlyDeductionTotals",
    "monthlyDeductionsTotals",
  ]);
  const sessionMonthlyOperatingDeductionTotals = normalizeOptionalAmountSummary(
    source,
    [
      "sessionMonthlyOperatingDeductionTotals",
      "sessionMonthlyOperatingTotals",
      "sessionMonthlyOperatingDeductions",
    ],
  );
  const sessionMonthlyTotalDeductionTotals = normalizeOptionalAmountSummary(
    source,
    [
      "sessionMonthlyTotalDeductionTotals",
      "sessionMonthlyDeductionTotals",
      "sessionMonthlyDeductionsTotals",
    ],
  );
  const yearOperatingDeductionTotal = normalizeOptionalNumber(source, [
    "yearOperatingDeductionTotal",
    "yearOperatingTotal",
  ]);
  const yearTotalDeductionTotal = normalizeOptionalNumber(source, [
    "yearTotalDeductionTotal",
    "yearDeductionTotal",
  ]);
  const monthlyIncomeTotals = normalizeAmountSummary(source.monthlyIncomeTotals);

  return {
    recentUnpaidDays: toNumber(source.recentUnpaidDays),
    snapshotUnpaidTotal: toNumber(source.snapshotUnpaidTotal),
    snapshotUnpaidNetTotal: toNumber(source.snapshotUnpaidNetTotal),
    yearPaidNetTotal: toNumber(source.yearPaidNetTotal),
    incomeStatsTotalNet:
      pickFirstValue(source, ["incomeStatsTotalNet"]) == null
        ? monthlyIncomeTotals.total
        : toNumber(source.incomeStatsTotalNet),
    totalReceivedNet: toNumber(
      pickFirstValue(source, ["totalReceivedNet", "incomeStatsTotalNet"]),
    ),
    monthlyIncomeTotals,
    monthlyGrossTotals: normalizeAmountSummary(source.monthlyGrossTotals),
    monthlyTaxTotals: normalizeAmountSummary(source.monthlyTaxTotals),
    ...(monthlyOperatingDeductionTotals
      ? { monthlyOperatingDeductionTotals }
      : {}),
    ...(monthlyTotalDeductionTotals ? { monthlyTotalDeductionTotals } : {}),
    sessionMonthlyTotals: normalizeAmountSummary(source.sessionMonthlyTotals),
    sessionMonthlyGrossTotals: normalizeAmountSummary(
      source.sessionMonthlyGrossTotals,
    ),
    sessionMonthlyTaxTotals: normalizeAmountSummary(source.sessionMonthlyTaxTotals),
    ...(sessionMonthlyOperatingDeductionTotals
      ? { sessionMonthlyOperatingDeductionTotals }
      : {}),
    ...(sessionMonthlyTotalDeductionTotals
      ? { sessionMonthlyTotalDeductionTotals }
      : {}),
    sessionYearTotal: toNumber(source.sessionYearTotal),
    yearIncomeTotal: toNumber(source.yearIncomeTotal),
    yearGrossIncomeTotal: toNumber(source.yearGrossIncomeTotal),
    yearTaxTotal: toNumber(source.yearTaxTotal),
    ...(yearOperatingDeductionTotal != null
      ? { yearOperatingDeductionTotal }
      : {}),
    ...(yearTotalDeductionTotal != null ? { yearTotalDeductionTotal } : {}),
    depositYearTotal: toNumber(source.depositYearTotal),
    depositYearByClass: Array.isArray(source.depositYearByClass)
      ? (source.depositYearByClass as StaffIncomeDepositClassSummary[])
      : [],
    classMonthlySummaries: Array.isArray(source.classMonthlySummaries)
      ? (source.classMonthlySummaries as StaffIncomeClassSummary[])
      : [],
    bonusMonthlyTotals: normalizeAmountSummary(source.bonusMonthlyTotals),
    otherRoleSummaries: Array.isArray(source.otherRoleSummaries)
      ? (source.otherRoleSummaries as StaffIncomeRoleSummary[])
      : [],
    fixedSalaryRoleSummaries: Array.isArray(source.fixedSalaryRoleSummaries)
      ? (source.fixedSalaryRoleSummaries as StaffFixedSalaryRoleSummary[])
      : [],
    fixedSalaryPayables: Array.isArray(source.fixedSalaryPayables)
      ? (source.fixedSalaryPayables as StaffFixedSalaryPayableItem[])
      : [],
  };
}
