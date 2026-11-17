export interface TrainingManagerStaffOption {
  id: string;
  fullName: string;
  status: string;
  roles: string[];
}

export interface ClassTrainingManager {
  id: string;
  fullName: string;
}

export interface UpdateClassTrainingManagerPayload {
  trainingManagerStaffId?: string | null;
  trainingManagerRatePercent?: number | null;
}

export interface TrainingManagerManagedClassItem {
  classId: string;
  className: string;
  /** % QLL hiện tại của lớp — áp cho buổi tạo mới, không đổi buổi cũ. */
  trainingManagerRatePercent: number;
  monthTotal: number;
  pendingTotal: number;
}

export interface TrainingManagerManagedClassListResponse {
  data: TrainingManagerManagedClassItem[];
  summary: {
    classCount: number;
    totalMonth: number;
    totalPending: number;
  };
}

export interface UpdateTrainingManagerSessionRatePayload {
  trainingManagerRatePercent: number;
}

export type TrainingManagerPaymentStatus = "pending" | "paid";

export interface TrainingManagerBulkPaymentStatusPayload {
  sessionIds: string[];
  paymentStatus: TrainingManagerPaymentStatus;
}

export interface TrainingManagerBulkPaymentStatusResult {
  staffId: string;
  requestedCount: number;
  updatedCount: number;
}

export interface TrainingManagerSessionAllowanceItem {
  sessionId: string;
  date: string;
  sessionTuitionTotal: number;
  trainingManagerRatePercent: number;
  allowanceAmount: number;
  paymentStatus: TrainingManagerPaymentStatus;
}
