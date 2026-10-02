import { PaymentStatus } from 'generated/enums';

export type TrainingManagerSessionSnapshot = {
  trainingManagerStaffId: string | null;
  trainingManagerRatePercent: number;
  trainingManagerAllowanceAmount: number | null;
  trainingManagerPaymentStatus: PaymentStatus | null;
};

export function normalizeTrainingManagerRatePercent(
  value: unknown,
): number | null {
  if (value == null) return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  if (numeric < 0 || numeric > 100) return null;
  return Math.round(numeric * 100) / 100;
}

export function computeTrainingManagerSessionSnapshot(params: {
  sessionTuitionTotal: number;
  trainingManagerStaffId?: string | null;
  trainingManagerRatePercent?: unknown;
}): TrainingManagerSessionSnapshot {
  const staffId = params.trainingManagerStaffId?.trim() || null;
  const ratePercent = normalizeTrainingManagerRatePercent(
    params.trainingManagerRatePercent,
  );

  if (!staffId || ratePercent == null || ratePercent <= 0) {
    return {
      trainingManagerStaffId: null,
      trainingManagerRatePercent: 0,
      trainingManagerAllowanceAmount: null,
      trainingManagerPaymentStatus: null,
    };
  }

  const allowance = Math.round(
    (params.sessionTuitionTotal * ratePercent) / 100,
  );
  if (allowance <= 0) {
    return {
      trainingManagerStaffId: staffId,
      trainingManagerRatePercent: ratePercent,
      trainingManagerAllowanceAmount: null,
      trainingManagerPaymentStatus: null,
    };
  }

  return {
    trainingManagerStaffId: staffId,
    trainingManagerRatePercent: ratePercent,
    trainingManagerAllowanceAmount: allowance,
    trainingManagerPaymentStatus: PaymentStatus.pending,
  };
}
